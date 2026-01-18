"use strict";

const vscode = require("vscode");
const { computeCheckboxToggleEdits, computeCheckboxBulkToggleEdits } = require("./checkboxToggle");

function toggleCheckboxItemAtCursor() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document || editor.document.languageId !== "vso") {
    return;
  }

  const doc = editor.document;
  const lines = doc.getText().split(/\r?\n/);

  const selections = (editor.selections && editor.selections.length) ? editor.selections : [editor.selection];
  const hasRange = selections.some(s => s && !s.isEmpty);

  let edits = [];

  if (!hasRange) {
    const lineIndex = editor.selection.active.line;
    edits = computeCheckboxToggleEdits(lines, lineIndex);
  } else {
    // Multi-line selection behavior: bulk-toggle.
    // If all selected checkbox items are checked, uncheck them all; otherwise check them all.
    const lineIndices = [];
    for (const sel of selections) {
      if (!sel || sel.isEmpty) continue;
      const startLine = Math.min(sel.start.line, sel.end.line);
      let endLine = Math.max(sel.start.line, sel.end.line);
      if (sel.end.character === 0 && endLine > startLine) endLine -= 1;
      for (let i = startLine; i <= endLine; i++) {
        lineIndices.push(i);
      }
    }
    edits = computeCheckboxBulkToggleEdits(lines, lineIndices);
  }

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
