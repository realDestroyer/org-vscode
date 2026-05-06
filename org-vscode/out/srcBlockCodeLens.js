"use strict";

const vscode = require("vscode");
const path = require("path");

function isBeginSrcLine(line) {
  return /^\s*#\+BEGIN_SRC\b/i.test(String(line || ""));
}

/*
  Returns true if `documentUri` matches any path listed in
  Org-vscode.disableSrcExecutionInPaths. Patterns may be absolute or
  workspace-relative. This is a simple equality / endsWith match — we
  intentionally avoid glob semantics here to keep the policy easy to
  audit.
*/
function isSrcExecutionDisabledFor(documentUri) {
  try {
    const cfg = vscode.workspace.getConfiguration();
    const list = cfg.get("Org-vscode.disableSrcExecutionInPaths", []);
    if (!Array.isArray(list) || list.length === 0) return false;

    const docPath = path.resolve(documentUri.fsPath);
    const folders = vscode.workspace.workspaceFolders || [];

    for (const raw of list) {
      if (typeof raw !== "string" || !raw.trim()) continue;
      const entry = raw.trim();
      if (path.isAbsolute(entry)) {
        if (path.resolve(entry) === docPath) return true;
        continue;
      }
      // Relative: match against any workspace folder.
      for (const f of folders) {
        const candidate = path.resolve(f.uri.fsPath, entry);
        if (candidate === docPath) return true;
      }
      // Also accept basename matches (e.g. "inbox.org" → any file named inbox.org).
      if (!entry.includes(path.sep) && !entry.includes("/")) {
        if (path.basename(docPath) === entry) return true;
      }
    }
  } catch {
    // Fail-closed: on any unexpected error, do NOT suppress; users still
    // see the lens. The performance hit is negligible.
  }
  return false;
}

function registerSrcBlockCodeLens(ctx) {
  const selector = [
    { language: "org", scheme: "file" },
    { language: "vsorg", scheme: "file" },
    { language: "org-vscode", scheme: "file" },
    { language: "vso", scheme: "file" }
  ];

  const provider = {
    provideCodeLenses: function (document) {
      const lenses = [];
      if (isSrcExecutionDisabledFor(document.uri)) return lenses;
      const lineCount = document.lineCount || 0;

      for (let i = 0; i < lineCount; i++) {
        const lineText = document.lineAt(i).text;
        if (!isBeginSrcLine(lineText)) continue;

        const range = new vscode.Range(i, 0, i, 0);
        const args = [{ uri: document.uri, line: i + 1 }];

        lenses.push(
          new vscode.CodeLens(range, {
            title: "$(play) Execute src block",
            command: "org-vscode.executeSrcBlock",
            arguments: args
          })
        );
      }

      return lenses;
    },

    resolveCodeLens: function (codeLens) {
      return codeLens;
    }
  };

  const disposable = vscode.languages.registerCodeLensProvider(selector, provider);
  ctx.subscriptions.push(disposable);
}

module.exports = {
  registerSrcBlockCodeLens,
  isSrcExecutionDisabledFor
};
