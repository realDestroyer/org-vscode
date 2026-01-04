"use strict";

const vscode = require("vscode");
const { computeCheckboxToggleEdits } = require("./checkboxToggle");

function toggleCheckboxItemAtCursor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document || editor.document.languageId !== "vso") {
    return;
  }

  const doc = editor.document;
  const lineIndex = editor.selection.active.line;
  const lines = doc.getText().split(/\r?\n/);
  const edits = computeCheckboxToggleEdits(lines, lineIndex);

  if (!edits.length) {
    return;
  }

  editor.edit((editBuilder) => {
    for (const e of edits) {
      if (e.lineIndex < 0 || e.lineIndex >= doc.lineCount) continue;
      editBuilder.replace(doc.lineAt(e.lineIndex).range, e.newText);
    }
  });
}

module.exports = {
  toggleCheckboxItemAtCursor
};
