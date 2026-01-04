"use strict";

const vscode = require("vscode");
const { computeHierarchicalCheckboxStatsInRange, findCheckboxCookie, formatCheckboxStats } = require("./checkboxStats");

const HEADING_LINE_REGEX = /^(\s*)(\*+|[⊙⊘⊜⊖⊗])\s+\S/;
const LIST_ITEM_REGEX = /^\s*[-+*]\s+/;

function getHeadingLevel(match) {
  const starsOrSymbol = match[2] || "";
  if (starsOrSymbol.startsWith("*")) {
    return starsOrSymbol.length;
  }
  const indent = match[1] || "";
  return 1000 + indent.length;
}

function getIndentLength(line) {
  const m = String(line || "").match(/^\s*/);
  return m ? m[0].length : 0;
}

function shouldDecorate(editor) {
  if (!editor || !editor.document || editor.document.languageId !== "vso") return false;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  return config.get("decorateCheckboxStatistics", true) === true;
}

function registerCheckboxStatsDecorations(ctx) {
  // Unit tests mock vscode; skip decoration wiring when APIs aren't present.
  if (!vscode.window || typeof vscode.window.createTextEditorDecorationType !== "function") {
    return;
  }

  const replaceDecorationType = vscode.window.createTextEditorDecorationType({
    before: {
      color: new vscode.ThemeColor("descriptionForeground")
    }
  });
  const hideDecorationType = vscode.window.createTextEditorDecorationType({
    color: "transparent",
    textDecoration: "none; font-size: 0;"
  });
  ctx.subscriptions.push(replaceDecorationType);
  ctx.subscriptions.push(hideDecorationType);

  let pendingTimer = null;

  function apply(editor) {
    if (!editor) return;

    if (!shouldDecorate(editor)) {
      editor.setDecorations(replaceDecorationType, []);
      editor.setDecorations(hideDecorationType, []);
      return;
    }

    const doc = editor.document;
    const lines = doc.getText().split(/\r?\n/);
    const replacements = [];
    const hides = [];

    for (let i = 0; i < lines.length; i++) {
      const lineText = String(lines[i] || "");
      const cookie = findCheckboxCookie(lineText);
      if (!cookie) continue;

      const headingMatch = lineText.match(HEADING_LINE_REGEX);
      const isHeading = Boolean(headingMatch);
      const isListItem = LIST_ITEM_REGEX.test(lineText);
      if (!isHeading && !isListItem) continue;

      let startLine = i + 1;
      let endLine = lines.length;
      let baseIndent = -1;

      if (isHeading) {
        const level = getHeadingLevel(headingMatch);
        for (let j = i + 1; j < lines.length; j++) {
          const m = String(lines[j] || "").match(HEADING_LINE_REGEX);
          if (!m) continue;
          const nextLevel = getHeadingLevel(m);
          if (nextLevel <= level) {
            endLine = j;
            break;
          }
        }
      } else {
        // List item cookie: scope is the item's indented body until next sibling/parent list item or next heading.
        baseIndent = getIndentLength(lineText);
        for (let j = i + 1; j < lines.length; j++) {
          const t = String(lines[j] || "");
          if (t.match(HEADING_LINE_REGEX)) {
            endLine = j;
            break;
          }
          if (LIST_ITEM_REGEX.test(t)) {
            const indent = getIndentLength(t);
            if (indent <= baseIndent) {
              endLine = j;
              break;
            }
          }
        }
      }

      const stats = computeHierarchicalCheckboxStatsInRange(lines, startLine, endLine, baseIndent);
      const formatted = formatCheckboxStats(stats, cookie.mode);

      const start = new vscode.Position(i, cookie.start);
      const stop = new vscode.Position(i, cookie.end);
      const cookieRange = new vscode.Range(start, stop);

      hides.push(cookieRange);
      replacements.push({
        range: new vscode.Range(start, start),
        renderOptions: {
          before: {
            contentText: formatted
          }
        }
      });
    }

    editor.setDecorations(hideDecorationType, hides);
    editor.setDecorations(replaceDecorationType, replacements);
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
        const touchesCheckboxOrHeading = (event.contentChanges || []).some((c) => {
          const text = String((c && c.text) || "");
          return text.includes("[") || text.includes("]") || text.includes("-") || text.includes("*") || text.includes("⊙") || text.includes("⊘") || text.includes("⊖") || text.includes("⊜") || text.includes("⊗");
        });

        if (touchesCheckboxOrHeading) {
          scheduleApply(active);
        }
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("Org-vscode.decorateCheckboxStatistics")
      ) {
        scheduleApply(vscode.window.activeTextEditor);
      }
    })
  );
}

module.exports = {
  registerCheckboxStatsDecorations
};
