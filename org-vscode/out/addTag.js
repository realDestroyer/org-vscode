const fs = require("fs");
const vscode = require("vscode");

/**
 * This function allows the user to insert or update an inline tag block on the current task line.
 * Format added: : [+TAG:TAG1,TAG2] -
 * It also ensures the tag appears in the #+TAGS: header at the top of the file.
 */
module.exports = function addTag() {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor) return;

    // Prompt the user to enter a tag name
    vscode.window.showInputBox({
        prompt: "Enter tag name (e.g., TEST)",
        placeHolder: "Tag name"
    }).then(inputTag => {
        if (!inputTag) return;

        // Normalize the input to uppercase for consistency
        const inputTagUpper = inputTag.toUpperCase();
        const { document } = activeTextEditor;
        const position = activeTextEditor.selection.active.line;
        const currentLine = document.lineAt(position);
        const lineText = currentLine.text;
        const filePath = document.uri;

        const tagRegex = /\[\+TAG:(.*?)\]/;
        const existingTagMatch = lineText.match(tagRegex);
        let newLine;

        // If line already has a tag block, append the new tag (if it's not a duplicate)
        if (existingTagMatch) {
            let currentTags = existingTagMatch[1].split(",").map(tag => tag.trim().toUpperCase());
            if (!currentTags.includes(inputTagUpper)) {
                currentTags.push(inputTagUpper);
            }
            const updatedTagBlock = `[+TAG:${currentTags.join(",")}]`;
            newLine = lineText.replace(tagRegex, updatedTagBlock);
        } else {
            // Insert a new tag block after the task keyword if it doesn't exist yet
            newLine = lineText.replace(
                            /^(\s*(?:[⊙⊘⊜⊖⊗]\s*)?(?:\*+\s+)?(?:TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b)/,
                            `$1 : [+TAG:${inputTagUpper}] -`
            );
        }

        // Prepare workspace edit to update this line
        const edit = new vscode.WorkspaceEdit();
        edit.replace(filePath, currentLine.range, newLine);

        // Look for the #+TAGS: line near the top of the file
        const fullText = document.getText();
        const lines = fullText.split(/\r?\n/);
        const tagHeaderIndex = lines.findIndex(line => line.startsWith("#+TAGS:"));

        if (tagHeaderIndex !== -1) {
            const headerLine = lines[tagHeaderIndex];
            const tagList = headerLine.replace("#+TAGS:", "").split(",").map(t => t.trim().toUpperCase());

            // Add the new tag to the header list if it's missing
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

        // Apply all changes and auto-save
        vscode.workspace.applyEdit(edit).then(() => {
            vscode.commands.executeCommand("workbench.action.files.save");
        });
    });
};
