"use strict";

const vscode = require("vscode");

function insertCheckboxItem() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document || editor.document.languageId !== "vso") {
    return;
  }

  const doc = editor.document;
  const selection = editor.selection;
  const lineNumber = selection.active.line;
  const line = doc.lineAt(lineNumber);
  const lineText = line.text;

  const listItemMatch = lineText.match(/^(\s*[-+*]\s+)(.*)$/);
  const checkboxMatch = lineText.match(/^(\s*[-+*]\s+)\[( |x|X)\]\s+(.*)$/);

  editor.edit((editBuilder) => {
    if (checkboxMatch) {
      // Already a checkbox item; leave as-is.
      return;
    }

    if (listItemMatch) {
      const prefix = listItemMatch[1];
      const rest = listItemMatch[2];
      editBuilder.replace(line.range, `${prefix}[ ] ${rest}`);
      return;
    }

    const indent = lineText.match(/^\s*/)?.[0] || "";
    const insertPos = new vscode.Position(lineNumber, indent.length);
    editBuilder.insert(insertPos, "- [ ] ");
  });
}

module.exports = {
  insertCheckboxItem
};
