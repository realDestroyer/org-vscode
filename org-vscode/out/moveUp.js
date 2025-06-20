const vscode = require("vscode");

module.exports = function () {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const position = editor.selection.active.line;
  const lines = document.getText().split(/\r?\n/);

  const characterArray = ['⊙ ', '⊘ ', '⊜ ', '⊖ ', '⊗ '];

  function getIndent(line) {
    return line.match(/^\s*/)?.[0].length || 0;
  }

  const currentIndent = getIndent(lines[position]);
  if (!characterArray.some(sym => lines[position].includes(sym))) return;

  // Grab the block to move
  const block = [];
  let i = position;
  block.push(lines[i]);

  for (i = position + 1; i < lines.length; i++) {
    const indent = getIndent(lines[i]);
    if (lines[i].trim() === "") {
      block.push(lines[i]);
    } else if (indent > currentIndent) {
      block.push(lines[i]);
    } else {
      break;
    }
  }

  // Find previous block
  let insertAt = position - 1;
  while (insertAt >= 0) {
    if (
      characterArray.some(sym => lines[insertAt].includes(sym)) &&
      getIndent(lines[insertAt]) <= currentIndent
    ) {
      break;
    }
    insertAt--;
  }

  if (insertAt < 0) return;

  // Find extent of previous block
  let prevStart = insertAt;
  for (let j = insertAt + 1; j < lines.length; j++) {
    if (getIndent(lines[j]) > getIndent(lines[insertAt])) {
      continue;
    } else {
      break;
    }
  }

  const before = lines.slice(0, insertAt);
  const movingUp = lines.slice(insertAt, position);
  const currentBlock = block;
  const after = lines.slice(i);

  const updatedLines = [...before, ...currentBlock, ...movingUp, ...after];
  const fullText = updatedLines.join("\n");

  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    new vscode.Position(0, 0),
    new vscode.Position(lines.length, 0)
  );
  edit.replace(document.uri, fullRange, fullText);
  vscode.workspace.applyEdit(edit);
};
