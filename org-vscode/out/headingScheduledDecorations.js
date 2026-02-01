"use strict";

const vscode = require("vscode");
const taskKeywordManager = require("./taskKeywordManager");
const {
  isPlanningLine,
  parsePlanningFromText,
  getAcceptedDateFormats,
  momentFromTimestampContent
} = require("./orgTagUtils");

const HEADING_LINE_REGEX = /^(\s*)(\*+)\s+\S/;

function shouldDecorate(editor) {
  if (!editor) return false;
  if (!editor.document) return false;
  if (editor.document.languageId !== "vso") return false;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  return Boolean(config.get("decorateHeadingScheduledDates", false));
}

function getPlanningForHeadingInDocument(document, headingLine) {
  const head = headingLine >= 0 && headingLine < document.lineCount
    ? String(document.lineAt(headingLine).text || "")
    : "";
  const next = headingLine + 1 >= 0 && headingLine + 1 < document.lineCount
    ? String(document.lineAt(headingLine + 1).text || "")
    : "";

  const combined = isPlanningLine(next) ? `${head}\n${next}` : head;
  return parsePlanningFromText(combined);
}

function computeDecorationsForEditor(editor) {
  const decorations = [];
  if (!editor) return decorations;

  const document = editor.document;
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const acceptedDateFormats = getAcceptedDateFormats(dateFormat);

  const visible = (editor.visibleRanges && editor.visibleRanges.length)
    ? editor.visibleRanges
    : [new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Math.max(0, document.lineCount - 1), 0))];

  for (const visibleRange of visible) {
    const startLine = Math.max(0, visibleRange.start.line);
    const endLine = Math.min(document.lineCount - 1, visibleRange.end.line);

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const lineText = document.lineAt(lineNumber).text;

      const headingMatch = lineText.match(HEADING_LINE_REGEX);
      if (!headingMatch) continue;

      const keyword = taskKeywordManager.findTaskKeyword(lineText);
      if (!keyword) continue;

      const planning = getPlanningForHeadingInDocument(document, lineNumber);
      if (!planning || !planning.scheduled) continue;

      const scheduledMoment = momentFromTimestampContent(planning.scheduled, acceptedDateFormats, true);
      if (!scheduledMoment || !scheduledMoment.isValid()) continue;

      const scheduledFormatted = scheduledMoment.format(dateFormat);
      const insertAt = new vscode.Position(lineNumber, lineText.length);
      const range = new vscode.Range(insertAt, insertAt);
      decorations.push({
        range,
        renderOptions: {
          after: {
            contentText: `  (S: ${scheduledFormatted})`
          }
        }
      });
    }
  }

  return decorations;
}

function registerHeadingScheduledDecorations(ctx) {
  if (!vscode.window || typeof vscode.window.createTextEditorDecorationType !== "function") {
    return;
  }

  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0 0 0 0.5em",
      color: new vscode.ThemeColor("descriptionForeground")
    }
  });
  ctx.subscriptions.push(decorationType);

  let pendingTimer = null;

  function clearEditor(editor) {
    if (!editor) return;
    editor.setDecorations(decorationType, []);
  }

  function apply(editor) {
    if (!editor) return;
    if (!shouldDecorate(editor)) {
      clearEditor(editor);
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
    }, 75);
  }

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
        event.affectsConfiguration("Org-vscode.decorateHeadingScheduledDates") ||
        event.affectsConfiguration("Org-vscode.dateFormat")
      ) {
        scheduleApply(vscode.window.activeTextEditor);
      }
    })
  );
}

module.exports = {
  registerHeadingScheduledDecorations
};
