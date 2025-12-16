"use strict";

const vscode = require("vscode");

const TASK_LINE_REGEX = /^(\s*)(\*+)\s+(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/;
const DAY_HEADING_REGEX = /^(\s*)(\*+)\s*\[(\d{2}-\d{2}-\d{4})(?:\s+([A-Za-z]{3}))?.*$/;
const UNICODE_PREFIX_REGEX = /^(\s*)[⊙⊘⊜⊖⊗]\s/;

function statusToSymbol(status) {
  switch (status) {
    case "TODO":
      return "⊙";
    case "IN_PROGRESS":
      return "⊘";
    case "CONTINUED":
      return "⊜";
    case "DONE":
      return "⊖";
    case "ABANDONED":
      return "⊗";
    default:
      return "";
  }
}

function shouldDecorate(editor) {
  if (!editor) return false;
  if (editor.document.languageId !== "vso") return false;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const enabled = config.get("decorateUnicodeHeadings", false);
  if (!enabled) return false;

  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
  return headingMarkerStyle === "asterisks";
}

function computeDecorationsForEditor(editor) {
  const decorations = [];
  const document = editor.document;

  for (const visibleRange of editor.visibleRanges) {
    const startLine = Math.max(0, visibleRange.start.line);
    const endLine = Math.min(document.lineCount - 1, visibleRange.end.line);

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const lineText = document.lineAt(lineNumber).text;

      if (UNICODE_PREFIX_REGEX.test(lineText)) {
        continue;
      }

      const taskMatch = lineText.match(TASK_LINE_REGEX);
      if (taskMatch) {
        const indent = taskMatch[1] || "";
        const status = taskMatch[3];
        const symbol = statusToSymbol(status);
        if (!symbol) continue;

        const insertAt = new vscode.Position(lineNumber, indent.length);
        const range = new vscode.Range(insertAt, insertAt);
        decorations.push({
          range,
          renderOptions: {
            before: {
              contentText: symbol + " ",
              // Keep theme-friendly foreground unless overridden by user theme.
              color: new vscode.ThemeColor("editor.foreground")
            }
          }
        });

        continue;
      }

      const dayMatch = lineText.match(DAY_HEADING_REGEX);
      if (dayMatch) {
        const indent = dayMatch[1] || "";
        const insertAt = new vscode.Position(lineNumber, indent.length);
        const range = new vscode.Range(insertAt, insertAt);
        decorations.push({
          range,
          renderOptions: {
            before: {
              contentText: "⊘ ",
              color: new vscode.ThemeColor("editor.foreground")
            }
          }
        });
      }
    }
  }

  return decorations;
}

function registerUnicodeHeadingDecorations(ctx) {
  const decorationType = vscode.window.createTextEditorDecorationType({});
  ctx.subscriptions.push(decorationType);

  let pendingTimer = null;

  function apply(editor) {
    if (!editor) return;

    if (!shouldDecorate(editor)) {
      editor.setDecorations(decorationType, []);
      return;
    }

    const decorations = computeDecorationsForEditor(editor);
    editor.setDecorations(decorationType, decorations);
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
      if (
        event.affectsConfiguration("Org-vscode.decorateUnicodeHeadings") ||
        event.affectsConfiguration("Org-vscode.headingMarkerStyle")
      ) {
        scheduleApply(vscode.window.activeTextEditor);
      }
    })
  );
}

module.exports = {
  registerUnicodeHeadingDecorations
};
