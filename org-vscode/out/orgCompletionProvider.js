"use strict";

const vscode = require("vscode");
const { parseHeadingLine } = require("./orgSymbolProvider");

const WORKSPACE_ID_CACHE_TTL_MS = 15000;
const WORKSPACE_MAX_FILES_TO_SCAN = 2000;

let workspaceIdCache = {
  at: 0,
  ids: [],
  inFlight: null
};

function getSelector() {
  return [
    { language: "vso", scheme: "file" },
    { language: "org", scheme: "file" },
    { language: "vsorg", scheme: "file" },
    { language: "org-vscode", scheme: "file" }
  ];
}

function findLinkContext(document, position) {
  const lineText = document.lineAt(position.line).text;
  const prefix = lineText.slice(0, position.character);

  const linkStart = prefix.lastIndexOf("[[");
  if (linkStart === -1) return null;

  const fromStart = prefix.slice(linkStart);
  if (fromStart.includes("]]")) return null;

  const typed = prefix.slice(linkStart + 2);
  // If we've started a description part, don't offer target completions.
  if (typed.includes("][")) return null;

  const replaceRange = new vscode.Range(
    new vscode.Position(position.line, linkStart + 2),
    position
  );

  return { typed, replaceRange };
}

function collectIds(document) {
  const ids = new Set();
  for (let i = 0; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    const m = text.match(/^\s*:ID:\s*(\S+)\s*$/);
    if (m) ids.add(m[1]);
  }
  return Array.from(ids);
}

async function collectWorkspaceIds() {
  const now = Date.now();
  if (now - workspaceIdCache.at < WORKSPACE_ID_CACHE_TTL_MS && Array.isArray(workspaceIdCache.ids)) {
    return workspaceIdCache.ids;
  }

  if (workspaceIdCache.inFlight) {
    return workspaceIdCache.inFlight;
  }

  workspaceIdCache.inFlight = (async () => {
    const patterns = "**/*.{org,vsorg,vso}";
    const exclude = "**/{node_modules,.vscode-test}/**";
    const files = await vscode.workspace.findFiles(patterns, exclude);

    const ids = new Set();
    const slice = files.slice(0, WORKSPACE_MAX_FILES_TO_SCAN);
    for (const uri of slice) {
      try {
        const data = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(data).toString("utf8");
        if (!content.includes(":ID:")) continue;

        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(/^\s*:ID:\s*(\S+)\s*$/);
          if (m) ids.add(m[1]);
        }
      } catch {
        // ignore unreadable files
      }
    }

    const out = Array.from(ids);
    workspaceIdCache = { at: Date.now(), ids: out, inFlight: null };
    return out;
  })();

  try {
    return await workspaceIdCache.inFlight;
  } finally {
    // inFlight cleared in success path; ensure it's cleared on errors too.
    workspaceIdCache.inFlight = null;
  }
}

function collectCustomIds(document) {
  const ids = new Set();
  for (let i = 0; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    const m = text.match(/^\s*:CUSTOM_ID:\s*(\S+)\s*$/);
    if (m) ids.add(m[1]);
  }
  return Array.from(ids);
}

function collectAnchors(document) {
  const anchors = new Set();

  // Targets like <<my-target>>
  for (let i = 0; i < document.lineCount; i++) {
    const text = document.lineAt(i).text;
    const re = /<<([^>\n]+)>>/g;
    for (let match; (match = re.exec(text)); ) {
      const name = String(match[1] || "").trim();
      if (name) anchors.add(name);
    }
  }

  // Also consider CUSTOM_IDs as anchor targets.
  for (const id of collectCustomIds(document)) anchors.add(id);

  return Array.from(anchors);
}

function collectHeadings(document) {
  const titles = new Set();
  for (let i = 0; i < document.lineCount; i++) {
    const parsed = parseHeadingLine(document.lineAt(i).text);
    if (!parsed) continue;
    const title = String(parsed.title || "").trim();
    if (title) titles.add(title);
  }
  return Array.from(titles);
}

class OrgCompletionItemProvider {
  async provideCompletionItems(document, position) {
    try {
      const ctx = findLinkContext(document, position);
      if (!ctx) return [];

      const typed = String(ctx.typed || "");
      const trimmed = typed.trimStart();

      const items = [];

      const addReplaceItem = (label, insertText, kind, detail) => {
        const item = new vscode.CompletionItem(label, kind);
        item.detail = detail;
        item.textEdit = vscode.TextEdit.replace(ctx.replaceRange, insertText);
        return item;
      };

      // Always offer the common link prefixes when starting a link.
      if (trimmed.length === 0 || /^\w{0,4}$/.test(trimmed)) {
        items.push(
          addReplaceItem("id:", "id:", vscode.CompletionItemKind.Keyword, "Org link type"),
          addReplaceItem("*Heading", "*", vscode.CompletionItemKind.Keyword, "Org internal heading link"),
          addReplaceItem("#anchor", "#", vscode.CompletionItemKind.Keyword, "Org internal target/custom-id link")
        );
      }

      if (/^id:/i.test(trimmed) || trimmed === "id" || trimmed === "id:") {
        const ids = new Set();
        for (const id of collectIds(document)) ids.add(id);
        try {
          for (const id of await collectWorkspaceIds()) ids.add(id);
        } catch {
          // ignore workspace failures; still provide in-file IDs
        }

        for (const id of Array.from(ids)) {
          items.push(addReplaceItem(`id:${id}`, `id:${id}`, vscode.CompletionItemKind.Reference, "Org :ID: property"));
        }
      }

      if (/^\*/.test(trimmed) || trimmed === "*") {
        for (const title of collectHeadings(document)) {
          items.push(
            addReplaceItem(`*${title}`, `*${title}`, vscode.CompletionItemKind.Reference, "Org heading")
          );
        }
      }

      if (/^#/.test(trimmed) || trimmed === "#") {
        for (const anchor of collectAnchors(document)) {
          items.push(
            addReplaceItem(`#${anchor}`, `#${anchor}`, vscode.CompletionItemKind.Reference, "Org target/CUSTOM_ID")
          );
        }
      }

      return items;
    } catch (e) {
      console.warn("OrgCompletionItemProvider failed:", e);
      return [];
    }
  }
}

function registerOrgCompletionProvider(ctx) {
  // Trigger on '[' so typing the second '[' will offer completions.
  const triggers = ["[", ":", "*", "#"];
  ctx.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(getSelector(), new OrgCompletionItemProvider(), ...triggers)
  );
}

module.exports = {
  OrgCompletionItemProvider,
  registerOrgCompletionProvider,
  findLinkContext,
  collectIds,
  collectAnchors,
  collectHeadings
};
