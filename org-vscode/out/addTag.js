const vscode = require("vscode");
const { getAllTagsFromLine, setEndOfLineTags, DAY_HEADING_REGEX } = require("./orgTagUtils");

/**
 * Adds a tag to the selected task/heading lines.
 * Emacs Org-mode style: tags appear at end of the headline, e.g. `:WORK:URGENT:`.
 * Back-compat: if a legacy inline tag block ([+TAG:...]) exists, it is migrated into end-of-line tags.
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

        const edit = new vscode.WorkspaceEdit();

        const taskPrefixRegex = /^(\s*(?:[⊙⊘⊜⊖⊗]\s*)?(?:\*+\s+)?(?:TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b)/;
        let touchedAnyLine = false;

        for (const lineNumber of sortedLines) {
            const currentLine = document.lineAt(lineNumber);
            const lineText = currentLine.text;

            if (!lineText.trim()) {
                continue;
            }
            if (DAY_HEADING_REGEX.test(lineText)) {
                continue;
            }

            if (!taskPrefixRegex.test(lineText)) {
                if (hasRangeSelection) {
                    continue;
                }
                // Single-line invocation: no-op for non-task lines (preserves old behavior).
                continue;
            }

            const existingTags = getAllTagsFromLine(lineText);
            const combined = existingTags.includes(inputTagUpper)
                ? existingTags
                : existingTags.concat([inputTagUpper]);

            const newLine = setEndOfLineTags(lineText, combined);

            if (newLine !== lineText) {
                edit.replace(filePath, currentLine.range, newLine);
                touchedAnyLine = true;
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
