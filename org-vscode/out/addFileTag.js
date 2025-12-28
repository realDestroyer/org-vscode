const vscode = require("vscode");

function normalizeTags(input) {
  return input
    .split(/[\s,:]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.toUpperCase());
}

function parseFileTagsValue(value) {
  return value
    .split(/[:]/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => t.toUpperCase());
}

function buildFileTagsLine(tags) {
  const unique = Array.from(new Set(tags.map(t => t.toUpperCase())));
  return `#+FILETAGS: :${unique.join(":")}:`;
}

module.exports = async function addFileTag() {
  const { activeTextEditor } = vscode.window;
  if (!activeTextEditor) {
    return;
  }

  const input = await vscode.window.showInputBox({
    prompt: "Enter file tag (e.g., PROJECT)",
    placeHolder: "File tag"
  });

  if (!input) {
    return;
  }

  const newTags = normalizeTags(input);
  if (newTags.length === 0) {
    return;
  }

  const { document } = activeTextEditor;
  const edit = new vscode.WorkspaceEdit();

  const lines = document.getText().split(/\r?\n/);
  const fileTagsIndex = lines.findIndex(l => /^#\+FILETAGS:/i.test(l));

  if (fileTagsIndex !== -1) {
    const existingLine = lines[fileTagsIndex];
    const match = existingLine.match(/^#\+FILETAGS:\s*(.*)$/i);
    const existingValue = match ? match[1] : "";
    const existingTags = parseFileTagsValue(existingValue);

    const combined = existingTags.slice();
    for (const tag of newTags) {
      if (!combined.includes(tag)) {
        combined.push(tag);
      }
    }

    const updated = buildFileTagsLine(combined);
    const range = new vscode.Range(
      new vscode.Position(fileTagsIndex, 0),
      new vscode.Position(fileTagsIndex, existingLine.length)
    );
    edit.replace(document.uri, range, updated);
  } else {
    const titleIndex = lines.findIndex(l => /^#\+TITLE:/i.test(l));
    const insertLine = titleIndex !== -1 ? titleIndex + 1 : 0;
    const insertPos = new vscode.Position(insertLine, 0);
    edit.insert(document.uri, insertPos, buildFileTagsLine(newTags) + "\n");
  }

  await vscode.workspace.applyEdit(edit);
  await vscode.commands.executeCommand("workbench.action.files.save");
};
