"use strict";

const vscode = require("vscode");
const taskKeywordManager = require("./taskKeywordManager");
const { normalizePriorityValues, cyclePriorityOnHeadingLine } = require("./priorityCycle");

const ORG_LANGUAGE_IDS = ["vso", "org", "vsorg", "org-vscode"];

function getSelectedLineNumbers(editor) {
  const selections = editor.selections && editor.selections.length
    ? editor.selections
    : [editor.selection];
  const lineNumbers = new Set();

  for (const selection of selections) {
    if (selection.isEmpty) {
      lineNumbers.add(selection.active.line);
      continue;
    }

    const startLine = Math.min(selection.start.line, selection.end.line);
    let endLine = Math.max(selection.start.line, selection.end.line);
    if (selection.end.character === 0 && endLine > startLine) endLine -= 1;
    for (let line = startLine; line <= endLine; line++) lineNumbers.add(line);
  }

  return Array.from(lineNumbers).sort((left, right) => right - left);
}

async function cyclePriority(direction = "forward") {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !ORG_LANGUAGE_IDS.includes(editor.document.languageId)) return;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const priorityValues = normalizePriorityValues(config.get("priorityValues", ["A", "B", "C"]));
  const workflowRegistry = taskKeywordManager.getWorkflowRegistry();
  const markers = workflowRegistry.states.map((state) => state.marker);
  const keywords = workflowRegistry.getCycleKeywords();
  const edit = new vscode.WorkspaceEdit();
  let changed = false;

  for (const lineNumber of getSelectedLineNumbers(editor)) {
    const line = editor.document.lineAt(lineNumber);
    const result = cyclePriorityOnHeadingLine(line.text, { direction, priorityValues, markers, keywords });
    if (!result.changed) continue;
    edit.replace(editor.document.uri, line.range, result.text);
    changed = true;
  }

  if (changed) await vscode.workspace.applyEdit(edit);
}

module.exports = {
  cyclePriority,
  cyclePriorityForward: () => cyclePriority("forward"),
  cyclePriorityBackward: () => cyclePriority("backward")
};