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
        const filePath = document.uri;
        const selections = (activeTextEditor.selections && activeTextEditor.selections.length)
            ? activeTextEditor.selections
            : [activeTextEditor.selection];
        const targetLines = new Set();
        let hasRangeSelection = false;
        for (const selection of selections) {
            if (selection.isEmpty) {
                targetLines.add(selection.active.line);
                continue;
            }
            hasRangeSelection = true;
            const startLine = Math.min(selection.start.line, selection.end.line);
            let endLine = Math.max(selection.start.line, selection.end.line);
            if (selection.end.character === 0 && endLine > startLine) {
                endLine -= 1;
            }
            for (let line = startLine; line <= endLine; line++) {
                targetLines.add(line);
            }
        }
        const sortedLines = Array.from(targetLines).sort((a, b) => b - a);

        const tagRegex = /\[\+TAG:(.*?)\]/;
        const edit = new vscode.WorkspaceEdit();

        const taskPrefixRegex = /^(\s*(?:[⊙⊘⊜⊖⊗]\s*)?(?:\*+\s+)?(?:TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b)/;
        const dayHeadingRegex = /^\s*(⊘|\*+)\s*\[\d{2}-\d{2}-\d{4}\s+[A-Za-z]{3}\]/;
        let touchedAnyLine = false;

        for (const lineNumber of sortedLines) {
            const currentLine = document.lineAt(lineNumber);
            const lineText = currentLine.text;

            if (!lineText.trim()) {
                continue;
            }
            if (dayHeadingRegex.test(lineText)) {
                continue;
            }

            const existingTagMatch = lineText.match(tagRegex);
            let newLine;

            if (existingTagMatch) {
                let currentTags = existingTagMatch[1].split(",").map(tag => tag.trim().toUpperCase());
                if (!currentTags.includes(inputTagUpper)) {
                    currentTags.push(inputTagUpper);
                }
                const updatedTagBlock = `[+TAG:${currentTags.join(",")}]`;
                newLine = lineText.replace(tagRegex, updatedTagBlock);
            }
            else {
                if (!taskPrefixRegex.test(lineText)) {
                    if (hasRangeSelection) {
                        continue;
                    }
                    // Single-line invocation: fall through (no-op) to preserve old behavior.
                    continue;
                }
                newLine = lineText.replace(taskPrefixRegex, `$1 : [+TAG:${inputTagUpper}] -`);
            }

            if (newLine !== lineText) {
                edit.replace(filePath, currentLine.range, newLine);
                touchedAnyLine = true;
            }
        }

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

        if (!touchedAnyLine) {
            vscode.window.showWarningMessage("No task lines found to tag.");
            return;
        }

        // Apply all changes and auto-save
        vscode.workspace.applyEdit(edit).then(() => {
            vscode.commands.executeCommand("workbench.action.files.save");
        });
    });
};
