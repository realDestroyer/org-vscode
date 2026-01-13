const vscode = require("vscode");
const { computeMoveBlockResult } = require("./moveBlockUtils");

module.exports = async function () {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const cursorLine = editor.selection.active.line;
  const cursorChar = editor.selection.active.character;
  const lines = document.getText().split(/\r?\n/);

  const result = computeMoveBlockResult(lines, cursorLine, "up");
  if (!result) return;

  const fullText = result.updatedLines.join("\n");

  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    new vscode.Position(0, 0),
    new vscode.Position(lines.length, 0)
  );
  edit.replace(document.uri, fullRange, fullText);

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) return;

  const newLine = Math.max(0, Math.min(result.newCursorLine, result.updatedLines.length - 1));
  const newLineText = result.updatedLines[newLine] || "";
  const newChar = Math.max(0, Math.min(cursorChar, newLineText.length));
  const newPos = new vscode.Position(newLine, newChar);
  editor.selection = new vscode.Selection(newPos, newPos);
  editor.revealRange(new vscode.Range(newPos, newPos), vscode.TextEditorRevealType.InCenter);
};
