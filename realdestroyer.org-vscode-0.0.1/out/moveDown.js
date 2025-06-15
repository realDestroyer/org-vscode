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

  // Grab block to move
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

  // Find insertion point
  let insertAt = i;
  while (insertAt < lines.length) {
    const indent = getIndent(lines[insertAt]);
    if (
      characterArray.some(sym => lines[insertAt].includes(sym)) &&
      indent <= currentIndent
    ) {
      // Skip the next task's own block
      insertAt++;
      while (insertAt < lines.length && getIndent(lines[insertAt]) > indent) {
        insertAt++;
      }
      break;
    }
    insertAt++;
  }

  const updatedLines = [
    ...lines.slice(0, position),
    ...lines.slice(i, insertAt),
    ...block,
    ...lines.slice(insertAt),
  ];

  const fullText = updatedLines.join("\n");

  const edit = new vscode.WorkspaceEdit();
  const fullRange = new vscode.Range(
    new vscode.Position(0, 0),
    new vscode.Position(lines.length, 0)
  );
  edit.replace(document.uri, fullRange, fullText);

  vscode.workspace.applyEdit(edit);
};
