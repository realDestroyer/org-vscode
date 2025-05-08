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

        const inputTagUpper = inputTag.toUpperCase();
        const { document } = activeTextEditor;
        const position = activeTextEditor.selection.active.line;
        const currentLine = document.lineAt(position);
        const lineText = currentLine.text;
        const filePath = document.uri;

        const tagRegex = /\[\+TAG:(.*?)\]/;
        const existingTagMatch = lineText.match(tagRegex);
        let newLine;

        if (existingTagMatch) {
            let currentTags = existingTagMatch[1].split(",").map(tag => tag.trim().toUpperCase());
            if (!currentTags.includes(inputTagUpper)) {
                currentTags.push(inputTagUpper);
            }
            const updatedTagBlock = `[+TAG:${currentTags.join(",")}]`;
            newLine = lineText.replace(tagRegex, updatedTagBlock);
        } else {
            newLine = lineText.replace(/(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)/, `$1 : [+TAG:${inputTagUpper}] -`);
        }

        const edit = new vscode.WorkspaceEdit();
        edit.replace(filePath, currentLine.range, newLine);

        // Read the full document text
        const fullText = document.getText();
        const lines = fullText.split(/\r?\n/);

        // Look for the #+TAGS: header near the top (within first 10 lines to be safe)
        const tagHeaderIndex = lines.findIndex(line => line.startsWith("#+TAGS:"));
        if (tagHeaderIndex !== -1) {
            const headerLine = lines[tagHeaderIndex];
            const tagList = headerLine.replace("#+TAGS:", "").split(",").map(t => t.trim().toUpperCase());

            if (!tagList.includes(inputTagUpper)) {
                tagList.push(inputTagUpper);
                const updatedHeader = `#+TAGS: ${tagList.join(", ")}`;
                const headerRange = new vscode.Range(
                    new vscode.Position(tagHeaderIndex, 0),
                    new vscode.Position(tagHeaderIndex, headerLine.length)
                );
                edit.replace(filePath, headerRange, updatedHeader);
            }
        }

        vscode.workspace.applyEdit(edit).then(() => {
            vscode.commands.executeCommand("workbench.action.files.save");
        });
    });
};
