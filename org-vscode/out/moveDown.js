const vscode = require("vscode");
const { computeMoveBlockResult, computeMoveBlockRangeResult } = require("./moveBlockUtils");

module.exports = async function () {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const cursorLine = editor.selection.active.line;
  const cursorChar = editor.selection.active.character;
  const lines = document.getText().split(/\r?\n/);

  const sel = editor.selection;
  const hasRange = sel && !sel.isEmpty;
  const selectionStartLine = hasRange ? Math.min(sel.start.line, sel.end.line) : cursorLine;
  let selectionEndLine = hasRange ? Math.max(sel.start.line, sel.end.line) : cursorLine;
  if (hasRange && sel.end.character === 0 && selectionEndLine > selectionStartLine) selectionEndLine -= 1;

  const result = hasRange
    ? computeMoveBlockRangeResult(lines, selectionStartLine, selectionEndLine, "down")
    : computeMoveBlockResult(lines, cursorLine, "down");
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

  if (hasRange && typeof result.newSelectionStartLine === "number" && typeof result.newSelectionEndLineExclusive === "number") {
    const startLine = Math.max(0, Math.min(result.updatedLines.length - 1, result.newSelectionStartLine));
    const endLine = Math.max(0, Math.min(result.updatedLines.length, result.newSelectionEndLineExclusive));
    const endLineInclusive = Math.max(0, endLine - 1);
    const endChar = (result.updatedLines[endLineInclusive] || "").length;
    editor.selection = new vscode.Selection(
      new vscode.Position(startLine, 0),
      new vscode.Position(endLineInclusive, endChar)
    );
  } else {
    editor.selection = new vscode.Selection(newPos, newPos);
  }
  editor.revealRange(new vscode.Range(newPos, newPos), vscode.TextEditorRevealType.InCenter);
};
