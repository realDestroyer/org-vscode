"use strict";

/*
  External API
  ------------
  This module produces the object returned from extension.activate(),
  which other VS Code extensions reach via:

    const orgApi = vscode.extensions
      .getExtension("realDestroyer.org-vscode")
      ?.exports;

  Public surface (v1):

    orgApi.version                      // semver string of org-vscode
    orgApi.registerLinkType(handler)    // returns Disposable; gated on trust
    orgApi.captureTodo(payload)         // returns { uri, line }; gated on trust
    orgApi.getCapturedSchemes()         // ["msgid", ...] — diagnostics only

  Trust gating:
    Each call attempts to identify the calling extension by walking the
    process's loaded extensions and matching the call site's file path
    to extensionPath. The first call from a given extension prompts the
    user with [Always allow] [Allow this time] [Deny] [Always deny].
    Decisions persist in workspace state (org-vscode.externalApi.trust).

    Calls from "unknown" callers are always rejected. We never silently
    treat them as the org-vscode extension.

  Settings gating:
    captureTodo() always rejects if Org-vscode.enableExternalCapture is
    false (default). This is the kill switch SEL operators can use to
    block the entire capability without uninstalling the extension.
*/

const path = require("path");
const fs = require("fs");

const { linkTypeRegistry } = require("./linkTypeRegistry");
const {
  sanitizePayload,
  formatEntry,
  spliceEntry,
  CaptureValidationError
} = require("./captureTodo");
const { createTrustStore } = require("./trustStore");

const SETTING_ENABLE_CAPTURE = "Org-vscode.enableExternalCapture";
const SETTING_INBOX_FILE = "Org-vscode.captureInboxFile";
const SETTING_TARGET_HEADING = "Org-vscode.captureTargetHeading";
const SETTING_DISABLE_SRC_PATHS = "Org-vscode.disableSrcExecutionInPaths";

class TrustDeniedError extends Error {
  constructor(extensionId, capability) {
    super(`org-vscode: extension "${extensionId}" is not permitted to ${capability}`);
    this.name = "TrustDeniedError";
    this.code = "ORG_VSCODE_TRUST_DENIED";
    this.extensionId = extensionId;
    this.capability = capability;
  }
}

class CaptureDisabledError extends Error {
  constructor() {
    super(
      `org-vscode: external capture is disabled (set "${SETTING_ENABLE_CAPTURE}": true to enable)`
    );
    this.name = "CaptureDisabledError";
    this.code = "ORG_VSCODE_CAPTURE_DISABLED";
  }
}

/*
  Identify the caller by walking up the V8 stack and matching each frame
  against vscode.extensions[*].extensionPath. We stop at the first frame
  outside org-vscode itself.

  We intentionally use Error.captureStackTrace rather than relying on an
  argument the caller passes in — a malicious caller could lie about
  their identity.
*/
function identifyCaller(vscode) {
  const orgExt = vscode.extensions.getExtension("realDestroyer.org-vscode");
  const orgPath = orgExt && orgExt.extensionPath ? path.resolve(orgExt.extensionPath) : null;
  const extensions = (vscode.extensions.all || [])
    .filter((e) => e && e.extensionPath)
    .map((e) => ({
      id: e.id,
      displayName: extDisplayName(e),
      extensionPath: path.resolve(e.extensionPath)
    }));
  const err = {};
  Error.captureStackTrace(err, identifyCaller);
  return matchCallerInStack(String(err.stack || ""), extensions, orgPath);
}

/*
  Pure helper extracted for unit testing.

  Given a V8 stack trace string and the set of known extensions, return the
  identity of the first frame that lives inside an extension other than
  org-vscode itself. Returns null when no match is found.

  Encapsulates the platform quirks we have to handle:
    - Windows is case-insensitive on drive letters; v8 stack frames may
      use a different casing than vscode.extensions[*].extensionPath.
    - V8 frame formats: parenthesised, bare (anonymous / top-level), and
      "async" prefixes. Paths may contain spaces.
    - Most-specific-prefix wins so that an extension nested inside
      org-vscode's tree (e.g. examples/external-consumer/) is not
      mis-attributed to org-vscode.
*/
function matchCallerInStack(stack, extensions, orgPath, opts) {
  const isWin = (opts && typeof opts.isWin === "boolean") ? opts.isWin : process.platform === "win32";
  const sep = (opts && opts.sep) || path.sep;
  // Normalize for comparison: lowercase on Windows, and unify separators.
  const norm = (p) => {
    let s = String(p || "");
    if (sep === "\\") s = s.replace(/\//g, "\\");
    else s = s.replace(/\\/g, "/");
    return isWin ? s.toLowerCase() : s;
  };

  const orgRoot = orgPath ? norm(orgPath) : null;
  const candidates = (extensions || [])
    .filter((e) => e && e.extensionPath)
    .map((e) => ({
      id: e.id,
      displayName: e.displayName || e.id,
      root: norm(e.extensionPath)
    }))
    .sort((a, b) => b.root.length - a.root.length);

  const frames = String(stack || "").split(/\r?\n/);
  const frameRe = /^\s*at\s+(?:.*?\s+\()?(.+?):\d+:\d+\)?\s*$/;
  const nodeModulesVscode = norm(`${sep}node_modules${sep}vscode${sep}`);

  for (const line of frames) {
    const m = frameRe.exec(line);
    if (!m) continue;
    const rawPath = m[1];
    if (!rawPath || !rawPath.toLowerCase().endsWith(".js")) continue;
    const abs = norm(rawPath);
    if (abs.startsWith("node:") || abs.includes(nodeModulesVscode)) continue;
    let owner = null;
    for (const c of candidates) {
      if (abs === c.root || abs.startsWith(c.root + sep)) { owner = c; break; }
    }
    if (!owner) continue;
    if (orgRoot && owner.root === orgRoot) continue; // internal frame
    return { id: owner.id, displayName: owner.displayName };
  }
  return null;
}

function extDisplayName(ext) {
  try {
    const pj = ext.packageJSON || {};
    return pj.displayName || pj.name || ext.id;
  } catch {
    return ext.id;
  }
}

async function ensureTrust(vscode, trustStore, capability) {
  const caller = identifyCaller(vscode);
  if (!caller) {
    // When caller identification fails, log diagnostics behind the
    // existing developer setting so production users don't see noise but
    // anyone filing a bug can flip the flag to capture useful detail.
    try {
      if (vscode.workspace.getConfiguration().get("Org-vscode.debugExternalApi", false)) {
        const dbg = {};
        Error.captureStackTrace(dbg, ensureTrust);
        const roots = (vscode.extensions.all || [])
          .map((e) => `${e.id} -> ${e.extensionPath}`);
        // eslint-disable-next-line no-console
        console.error(
          "[org-vscode] identifyCaller failed. Stack:\n" + dbg.stack +
          "\nKnown extensions:\n" + roots.join("\n")
        );
      }
    } catch (_) { /* ignore */ }
    throw new TrustDeniedError("unknown", capability);
  }

  const decision = trustStore.getDecision(caller.id, capability);
  if (decision === "allow") return caller;
  if (decision === "deny") {
    throw new TrustDeniedError(caller.id, capability);
  }

  // Ask the user.
  const friendly = capability === "registerLinkType"
    ? "register a custom org link scheme"
    : "create TODO entries in your org inbox";
  const choice = await vscode.window.showWarningMessage(
    `Allow "${caller.displayName}" (${caller.id}) to ${friendly} via the org-vscode API?`,
    { modal: true },
    "Always allow",
    "Allow this time",
    "Deny",
    "Always deny"
  );

  switch (choice) {
    case "Always allow":
      await trustStore.setDecision(caller.id, capability, "allow");
      return caller;
    case "Allow this time":
      return caller;
    case "Always deny":
      await trustStore.setDecision(caller.id, capability, "deny");
      throw new TrustDeniedError(caller.id, capability);
    case "Deny":
    default:
      throw new TrustDeniedError(caller.id, capability);
  }
}

function getConfig(vscode) {
  return vscode.workspace.getConfiguration();
}

function isCaptureEnabled(vscode) {
  return Boolean(getConfig(vscode).get(SETTING_ENABLE_CAPTURE, false));
}

function getInboxPath(vscode) {
  const cfg = getConfig(vscode);
  const configured = cfg.get(SETTING_INBOX_FILE, "");
  if (typeof configured === "string" && configured.trim()) {
    return resolveWorkspaceRelative(vscode, configured.trim());
  }

  // Fallback: <first workspace folder>/inbox.org
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) return null;
  return path.join(folders[0].uri.fsPath, "inbox.org");
}

function resolveWorkspaceRelative(vscode, p) {
  if (path.isAbsolute(p)) return p;
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) return null;
  return path.join(folders[0].uri.fsPath, p);
}

function isInboxPathInsideWorkspace(vscode, inboxPath) {
  if (!inboxPath) return false;
  const folders = vscode.workspace.workspaceFolders || [];
  const resolved = path.resolve(inboxPath);
  for (const f of folders) {
    const root = path.resolve(f.uri.fsPath);
    if (resolved === root || resolved.startsWith(root + path.sep)) return true;
  }
  return false;
}

async function writeInbox(vscode, inboxPath, newContent) {
  const dir = path.dirname(inboxPath);
  await fs.promises.mkdir(dir, { recursive: true });
  // Write as utf8 with no BOM. Use atomic-ish replace via tmp + rename to
  // reduce the window where a concurrent reader sees a half-written file.
  const tmp = `${inboxPath}.org-vscode-tmp-${process.pid}-${Date.now()}`;
  await fs.promises.writeFile(tmp, newContent, "utf8");
  await fs.promises.rename(tmp, inboxPath);
}

async function performCapture(vscode, callerId, rawPayload) {
  const inboxPath = getInboxPath(vscode);
  if (!inboxPath) {
    throw new Error("org-vscode: cannot resolve inbox file (no workspace folder)");
  }
  if (!isInboxPathInsideWorkspace(vscode, inboxPath)) {
    throw new Error(
      `org-vscode: inbox file "${inboxPath}" must be inside the current workspace`
    );
  }
  if (path.extname(inboxPath).toLowerCase() !== ".org"
      && path.extname(inboxPath).toLowerCase() !== ".vsorg") {
    throw new Error(
      `org-vscode: inbox file "${inboxPath}" must have a .org or .vsorg extension`
    );
  }

  const targetHeading = String(
    getConfig(vscode).get(SETTING_TARGET_HEADING, "* Inbox") || "* Inbox"
  );

  const sanitized = sanitizePayload(rawPayload, undefined, {
    knownSchemes: linkTypeRegistry.getTypes()
  });
  const block = formatEntry(sanitized, {
    headingLevel: deriveChildLevel(targetHeading),
    capturedBy: callerId
  });

  let existing = "";
  try {
    existing = await fs.promises.readFile(inboxPath, "utf8");
  } catch (e) {
    if (e && e.code !== "ENOENT") throw e;
  }

  const next = spliceEntry(existing, block, targetHeading);
  await writeInbox(vscode, inboxPath, next);

  // Compute insertion line for the return value (best-effort).
  const insertionLine = next.split(/\r?\n/).findIndex((line) => line === block.split(/\r?\n/)[0]);

  return {
    uri: vscode.Uri.file(inboxPath).toString(),
    line: insertionLine >= 0 ? insertionLine : 0
  };
}

function deriveChildLevel(targetHeading) {
  const m = String(targetHeading || "").match(/^\s*(\*+)\s/);
  if (!m) return 2;
  return m[1].length + 1;
}

/*
  Build the API object exposed by activate(). The vscode argument is
  injected so tests can pass a fake.
*/
function createExtensionApi(vscode, options) {
  const opts = options || {};
  const version = opts.version || "0.0.0";
  const trustStore = opts.trustStore || (() => {
    if (!opts.workspaceState) {
      throw new Error("createExtensionApi requires either trustStore or workspaceState");
    }
    return createTrustStore(opts.workspaceState);
  })();

  async function registerLinkType(handler) {
    const caller = await ensureTrust(vscode, trustStore, "registerLinkType");
    const disposable = linkTypeRegistry.register(handler, caller.id);
    // Return a vscode.Disposable-shaped object.
    return { dispose: () => disposable.dispose() };
  }

  async function captureTodo(rawPayload) {
    if (!isCaptureEnabled(vscode)) {
      throw new CaptureDisabledError();
    }
    const caller = await ensureTrust(vscode, trustStore, "captureTodo");
    try {
      return await performCapture(vscode, caller.id, rawPayload);
    } catch (e) {
      if (e instanceof CaptureValidationError) throw e;
      throw e;
    }
  }

  function getCapturedSchemes() {
    return linkTypeRegistry.getTypes();
  }

  return {
    version,
    registerLinkType,
    captureTodo,
    getCapturedSchemes
  };
}

module.exports = {
  createExtensionApi,
  TrustDeniedError,
  CaptureDisabledError,
  // Exposed for tests and the internal command path.
  performCapture,
  identifyCaller,
  matchCallerInStack,
  SETTING_ENABLE_CAPTURE,
  SETTING_INBOX_FILE,
  SETTING_TARGET_HEADING,
  SETTING_DISABLE_SRC_PATHS
};
