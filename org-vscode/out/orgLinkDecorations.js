"use strict";

const vscode = require("vscode");
const { parseBracketLink } = require("./orgLinkProvider");

function isOrgLikeEditor(editor) {
  if (!editor || !editor.document) return false;
  const { document } = editor;
  if (document.uri?.scheme !== "file") return false;

  const lang = document.languageId;
  return lang === "vso" || lang === "org" || lang === "vsorg" || lang === "org-vscode";
}

function shouldDecorate(editor) {
  if (!isOrgLikeEditor(editor)) return false;
  const config = vscode.workspace.getConfiguration("Org-vscode");
  return Boolean(config.get("decorateLinkDescriptions", false));
}

function getRevealPositions(editor) {
  const sels = editor?.selections || [];
  return sels.map((s) => s.active);
}

function anyCursorInside(range, revealPositions) {
  if (!range || !revealPositions || !revealPositions.length) return false;
  for (const pos of revealPositions) {
    if (range.contains(pos)) return true;
  }
  return false;
}

function computeDecorationsForEditor(editor) {
  const markerDecorations = [];
  const hideRanges = [];

  const document = editor.document;
  const revealPositions = getRevealPositions(editor);

  const visible = (editor.visibleRanges && editor.visibleRanges.length)
    ? editor.visibleRanges
    : [new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Math.max(0, document.lineCount - 1), 0))];

  // Note: matches both [[link]] and [[link][desc]]
  // (this mirrors the provider regex so parseBracketLink can reuse it).
  const bracketRe = /\[\[[^\]\n]+\](?:\[[^\]\n]*\])?\]/g;

  for (const visibleRange of visible) {
    const startLine = Math.max(0, visibleRange.start.line);
    const endLine = Math.min(document.lineCount - 1, visibleRange.end.line);

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const lineText = document.lineAt(lineNumber).text;
      if (!lineText || lineText.indexOf("[[") === -1) continue;

      bracketRe.lastIndex = 0;
      for (let match; (match = bracketRe.exec(lineText)); ) {
        const raw = match[0];
        const parsed = parseBracketLink(raw);
        if (!parsed) continue;

        const description = (parsed.description || "").trim();
        if (!description) continue;

        const start = new vscode.Position(lineNumber, match.index);
        const end = new vscode.Position(lineNumber, Math.min(match.index + raw.length, lineText.length));
        const hideRange = new vscode.Range(start, end);

        // If the cursor is inside this link, leave it fully visible for editing.
        if (anyCursorInside(hideRange, revealPositions)) {
          continue;
        }

        // Insert the description at the start of the link.
        markerDecorations.push({
          range: new vscode.Range(start, start),
          renderOptions: {
            before: {
              contentText: description,
              color: new vscode.ThemeColor("textLink.foreground"),
              textDecoration: "underline"
            }
          }
        });

        // Hide the full [[...]] payload so only the description remains.
        hideRanges.push(hideRange);
      }
    }
  }

  return { markerDecorations, hideRanges };
}

function registerOrgLinkDecorations(ctx) {
  // Always register the toggle command (even in unit tests where decoration APIs are mocked).
  if (vscode.commands && typeof vscode.commands.registerCommand === "function") {
    ctx.subscriptions.push(
      vscode.commands.registerCommand("org-vscode.toggleLinkDescriptionRendering", async () => {
        const config = vscode.workspace.getConfiguration("Org-vscode");
        const current = Boolean(config.get("decorateLinkDescriptions", false));
        const next = !current;

        await config.update("decorateLinkDescriptions", next, vscode.ConfigurationTarget.Global);

        // If decoration wiring is present, the configuration change listener will repaint.
        // Otherwise, no-op.
      })
    );
  }

  // Unit tests mock vscode; skip decoration wiring when APIs aren't present.
  if (!vscode.window || typeof vscode.window.createTextEditorDecorationType !== "function") {
    return;
  }

  const markerDecorationType = vscode.window.createTextEditorDecorationType({});
  const hideDecorationType = vscode.window.createTextEditorDecorationType({
    color: "transparent",
    textDecoration: "none; font-size: 0;"
  });

  ctx.subscriptions.push(markerDecorationType, hideDecorationType);

  let pendingTimer = null;

  function clear(editor) {
    if (!editor) return;
    editor.setDecorations(markerDecorationType, []);
    editor.setDecorations(hideDecorationType, []);
  }

  function apply(editor) {
    if (!editor) return;

    if (!shouldDecorate(editor)) {
      clear(editor);
      return;
    }

    const { markerDecorations, hideRanges } = computeDecorationsForEditor(editor);
    editor.setDecorations(markerDecorationType, markerDecorations);
    editor.setDecorations(hideDecorationType, hideRanges);
  }

  function scheduleApply(editor) {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }

    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      apply(editor || vscode.window.activeTextEditor);
    }, 50);
  }

  // Initial paint.
  scheduleApply(vscode.window.activeTextEditor);

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => scheduleApply(editor)),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        scheduleApply(event.textEditor);
      }
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        scheduleApply(event.textEditor);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const active = vscode.window.activeTextEditor;
      if (active && event.document.uri.toString() === active.document.uri.toString()) {
        scheduleApply(active);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("Org-vscode.decorateLinkDescriptions")) {
        scheduleApply(vscode.window.activeTextEditor);
      }
    }),
    // Note: command registered above so unit tests see it; here we just repaint on toggle.
  );

  // Repaint on toggle by listening to config changes (covers command + manual changes).
  // (The command above updates the config; this listener triggers scheduleApply.)
}

module.exports = {
  registerOrgLinkDecorations
};
