"use strict";

const path = require("path");
const crypto = require("crypto");
const vscode = require("vscode");
const { buildRecordsFromLines, parseSnapshotJson, serializeSnapshot } = require("./workspaceIndexCore");
const { runQuery } = require("./orgQuery");
const { isArchivedOrgFile } = require("./orgFileFilters");

const LEGACY_INDEX_FILE_NAME = "workspace-index-v1.json";
const FILE_GLOB = "**/*.{org,org_archive,vsorg,vso}";
const MAX_FILES = 2000;
const MAX_DISCOVERED_FILES = 10000;
const DEFAULT_EXCLUDES = ["**/node_modules/**", "**/.git/**", "**/.vscode-test/**"];

function getConfig() {
  return vscode.workspace.getConfiguration("Org-vscode");
}

function configuredLimit() {
  const value = Math.floor(Number(getConfig().get("workspaceIndex.resultLimit", 100)));
  return Math.max(1, Math.min(Number.isFinite(value) ? value : 100, 500));
}

function buildExcludeGlob() {
  const configured = getConfig().get("workspaceIndex.exclude", []);
  const patterns = DEFAULT_EXCLUDES.concat(Array.isArray(configured) ? configured : [])
    .map((value) => String(value || "").trim().replace(/\\/g, "/"))
    .filter(Boolean);
  return patterns.length === 1 ? patterns[0] : `{${Array.from(new Set(patterns)).join(",")}}`;
}

function isIgnoredPath(relativePath) {
  const parts = String(relativePath || "").replace(/\\/g, "/").split("/");
  const name = parts[parts.length - 1] || "";
  return name.toLowerCase() === "currenttasks.org" || parts.some((part) => part.startsWith("."));
}

function workspaceRootId(folder) {
  return crypto.createHash("sha256").update(folder.uri.toString()).digest("hex").slice(0, 12);
}

function createWorkspaceIndexService(ctx) {
  let records = [];
  let disposed = false;
  let rebuildTimer = null;
  let rebuildPromise = null;
  let rebuildRequested = false;
  let generation = 0;
  const listeners = new Set();
  const disposables = [];

  const service = {
    get enabled() {
      return getConfig().get("workspaceIndex.enabled", false) === true;
    },
    get records() {
      return records.slice();
    },
    query(source) {
      if (!service.enabled) return { results: [], errors: ["Workspace indexing is disabled"] };
      return runQuery(records, source, { maxResults: configuredLimit() });
    },
    onDidChange(listener) {
      listeners.add(listener);
      return { dispose: () => listeners.delete(listener) };
    },
    rebuild,
    scheduleRebuild,
    resolveRecordUri,
    dispose
  };

  function emit() {
    for (const listener of listeners) {
      try { listener(); } catch { /* listener isolation */ }
    }
  }

  function snapshotUri() {
    if (!ctx || !ctx.globalStorageUri) return null;
    const identity = (vscode.workspace.workspaceFolders || [])
      .map((folder) => folder.uri.toString())
      .sort()
      .join("\n");
    if (!identity) return null;
    const hash = crypto.createHash("sha256").update(identity).digest("hex").slice(0, 16);
    return vscode.Uri.joinPath(ctx.globalStorageUri, `workspace-index-v1-${hash}.json`);
  }

  async function deleteSnapshots() {
    if (!ctx || !ctx.globalStorageUri || !vscode.workspace.fs.delete) return;
    let uris = [snapshotUri(), vscode.Uri.joinPath(ctx.globalStorageUri, LEGACY_INDEX_FILE_NAME)].filter(Boolean);
    if (vscode.workspace.fs.readDirectory) {
      try {
        const entries = await vscode.workspace.fs.readDirectory(ctx.globalStorageUri);
        uris = entries
          .filter(([name]) => /^workspace-index-v1(?:-[a-f0-9]{16})?\.json$/.test(name))
          .map(([name]) => vscode.Uri.joinPath(ctx.globalStorageUri, name));
      } catch { /* the storage directory may not exist */ }
    }
    for (const uri of uris) {
      try { await vscode.workspace.fs.delete(uri); } catch { /* missing caches are expected */ }
    }
  }

  async function loadSnapshot() {
    const uri = snapshotUri();
    if (!uri || !getConfig().get("workspaceIndex.persistence", true)) return;
    const loadGeneration = generation;
    try {
      const data = await vscode.workspace.fs.readFile(uri);
      const snapshot = parseSnapshotJson(Buffer.from(data).toString("utf8"));
        if (snapshot && !disposed && service.enabled &&
          getConfig().get("workspaceIndex.persistence", true) && loadGeneration === generation) {
        records = snapshot.records;
        emit();
      }
    } catch {
      // Missing, unreadable, malformed, and old snapshots are ignored.
    }
  }

  async function persistSnapshot(updated, expectedGeneration) {
    const uri = snapshotUri();
    if (!uri || !getConfig().get("workspaceIndex.persistence", true)) return;
    try {
      await vscode.workspace.fs.createDirectory(ctx.globalStorageUri);
      const json = serializeSnapshot(records, { updated });
      await vscode.workspace.fs.writeFile(uri, Buffer.from(json, "utf8"));
      if (disposed || !service.enabled ||
          !getConfig().get("workspaceIndex.persistence", true) || expectedGeneration !== generation) {
        await deleteSnapshots();
      }
    } catch (error) {
      console.warn("Org-vscode workspace index persistence failed:", error && error.message);
    }
  }

  async function performRebuild() {
    if (disposed || !service.enabled || !vscode.workspace.findFiles) return records;
    const rebuildGeneration = generation;
    const includeArchives = getConfig().get("workspaceIndex.includeArchives", false) === true;
    const uris = await vscode.workspace.findFiles(FILE_GLOB, buildExcludeGlob(), MAX_DISCOVERED_FILES);
    const updated = new Date().toISOString();
    const next = [];
    let eligibleFiles = 0;

    for (const uri of uris) {
      const fileRelativePath = vscode.workspace.asRelativePath(uri, false).replace(/\\/g, "/");
      if (isIgnoredPath(fileRelativePath)) continue;
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      const workspaceFolders = vscode.workspace.workspaceFolders || [];
      const relativePath = workspaceFolders.length > 1 && folder
        ? `${folder.name}/${fileRelativePath}`
        : fileRelativePath;
      const archived = isArchivedOrgFile(path.basename(uri.fsPath || relativePath), uri.fsPath || relativePath);
      if (archived && !includeArchives) continue;
      if (eligibleFiles >= MAX_FILES) break;
      eligibleFiles += 1;
      try {
        const data = await vscode.workspace.fs.readFile(uri);
        const lines = Buffer.from(data).toString("utf8").split(/\r?\n/);
        const rootToken = folder ? workspaceRootId(folder) : "unknown";
        next.push(...buildRecordsFromLines(lines, {
          path: relativePath,
          uri: `workspace:${rootToken}/${fileRelativePath}`
        }, { archived, updated }));
      } catch {
        // A file may disappear or become unreadable during a rebuild.
      }
    }

    if (!disposed && service.enabled && rebuildGeneration === generation) {
      records = next;
      emit();
      await persistSnapshot(updated, rebuildGeneration);
    }
    return records;
  }

  function rebuild() {
    if (rebuildPromise) {
      rebuildRequested = true;
      return rebuildPromise;
    }
    rebuildPromise = performRebuild().finally(() => {
      rebuildPromise = null;
      if (rebuildRequested && !disposed && service.enabled) {
        rebuildRequested = false;
        rebuild().catch((error) => console.warn("Org-vscode workspace index rebuild failed:", error && error.message));
      }
    });
    return rebuildPromise;
  }

  function scheduleRebuild() {
    if (disposed || !service.enabled) return;
    if (rebuildTimer) clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(() => {
      rebuildTimer = null;
      rebuild().catch((error) => console.warn("Org-vscode workspace index rebuild failed:", error && error.message));
    }, 300);
  }

  function resolveRecordUri(record) {
    if (!record || !Number.isInteger(record.line) || record.line < 0) return null;
    const rawUri = String(record.uri || "").replace(/\\/g, "/");
    const match = rawUri.match(/^workspace:([a-f0-9]{12})\/(.+)$/);
    if (!match || path.posix.isAbsolute(match[2]) || match[2].split("/").includes("..")) return null;
    const folders = vscode.workspace.workspaceFolders || [];
    for (const folder of folders.filter((candidate) => workspaceRootId(candidate) === match[1])) {
      const candidate = vscode.Uri.joinPath(folder.uri, ...match[2].split("/").filter(Boolean));
      const owner = vscode.workspace.getWorkspaceFolder(candidate);
      if (owner && owner.uri.toString() === folder.uri.toString()) return candidate;
    }
    return null;
  }

  function dispose() {
    disposed = true;
    generation += 1;
    if (rebuildTimer) clearTimeout(rebuildTimer);
    listeners.clear();
    for (const disposable of disposables) disposable.dispose();
  }

  if (vscode.workspace.createFileSystemWatcher) {
    const watcher = vscode.workspace.createFileSystemWatcher(FILE_GLOB);
    disposables.push(watcher, watcher.onDidCreate(scheduleRebuild), watcher.onDidChange(scheduleRebuild), watcher.onDidDelete(scheduleRebuild));
  }
  if (vscode.workspace.onDidSaveTextDocument) {
    disposables.push(vscode.workspace.onDidSaveTextDocument((document) => {
      if (/\.(?:org|org_archive|vsorg|vso)$/i.test(document.uri.path || "")) scheduleRebuild();
    }));
  }
  if (vscode.workspace.onDidChangeConfiguration) {
    disposables.push(vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("Org-vscode.workspaceIndex")) return;
      generation += 1;
      if (service.enabled) {
        if (!getConfig().get("workspaceIndex.persistence", true)) deleteSnapshots();
        scheduleRebuild();
      }
      else {
        rebuildRequested = false;
        records = [];
        emit();
        deleteSnapshots();
      }
    }));
  }
  if (vscode.workspace.onDidChangeWorkspaceFolders) {
    disposables.push(vscode.workspace.onDidChangeWorkspaceFolders(() => {
      generation += 1;
      scheduleRebuild();
    }));
  }

  if (ctx && Array.isArray(ctx.subscriptions)) ctx.subscriptions.push(service);
  if (!service.enabled || !getConfig().get("workspaceIndex.persistence", true)) {
    deleteSnapshots();
  }
  if (service.enabled) {
    loadSnapshot().finally(() => rebuild().catch((error) =>
      console.warn("Org-vscode workspace index activation rebuild failed:", error && error.message)));
  }
  return service;
}

module.exports = {
  createWorkspaceIndexService,
  FILE_GLOB,
  MAX_FILES,
  MAX_DISCOVERED_FILES,
  DEFAULT_EXCLUDES,
  isIgnoredPath,
  workspaceRootId,
  LEGACY_INDEX_FILE_NAME
};