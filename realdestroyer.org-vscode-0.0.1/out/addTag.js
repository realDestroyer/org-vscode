const fs = require("fs");
const vscode = require("vscode");

module.exports = function addTag() {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor) return;

    vscode.window.showInputBox({
        prompt: "Enter tag name (e.g., TEST)",
        placeHolder: "Tag name"
    }).then(inputTag => {
        if (!inputTag) return;

        const { document } = activeTextEditor;
        const position = activeTextEditor.selection.active.line;
        const currentLine = document.lineAt(position);
        const lineText = currentLine.text;
        const filePath = document.uri;

        const tagRegex = /\[\+TAG:(.*?)\]/;
        const existingTagMatch = lineText.match(tagRegex);
        let newLine;

        if (existingTagMatch) {
            // Extract current tags
            let currentTags = existingTagMatch[1].split(",").map(tag => tag.trim().toUpperCase());

            if (!currentTags.includes(inputTag.toUpperCase())) {
                currentTags.push(inputTag.toUpperCase());
            }

            const updatedTagBlock = `[+TAG:${currentTags.join(",")}]`;
            newLine = lineText.replace(tagRegex, updatedTagBlock);
        } else {
            // Insert tag inline after TODO keyword
            newLine = lineText.replace(/(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)/, `$1 : [+TAG:${inputTag.toUpperCase()}] -`);
        }

        const edit = new vscode.WorkspaceEdit();
        edit.replace(filePath, currentLine.range, newLine);
        vscode.workspace.applyEdit(edit).then(() => {
            vscode.commands.executeCommand("workbench.action.files.save");
        });
    });
};
