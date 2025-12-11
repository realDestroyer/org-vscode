"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const showMessage_1 = require("./showMessage");

module.exports = function () {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") {
        return;
    }
    const { document } = activeTextEditor;
    const position = activeTextEditor.selection.active.line;
    const currentLine = document.lineAt(position);
    let workspaceEdit = new vscode.WorkspaceEdit();

    // Messages
    const fullDateMessage = new showMessage_1.WindowMessage("warning", "Full date must be entered", false, false);
    const notADateMessage = new showMessage_1.WindowMessage("warning", "That's not a valid date.", false, false);

    // If line already has DEADLINE, remove it (toggle behavior)
    if (currentLine.text.includes("DEADLINE:")) {
        const removeDeadline = currentLine.text
            .replace(/\s*DEADLINE:\s*\[[^\]]*\]/, "")
            .trimRight();
        workspaceEdit.delete(document.uri, currentLine.range);
        workspaceEdit.insert(document.uri, currentLine.range.start, removeDeadline);
        return vscode.workspace.applyEdit(workspaceEdit);
    }

    async function getInput(prompt, placeHolder) {
        return await vscode.window.showInputBox({ prompt, placeHolder });
    }

    (async function () {
        const month = await getInput("Enter the deadline month (MM):", "Example: 12 for December");
        if (!month || month.length > 2 || !isValidMonth(month)) {
            return fullDateMessage.showMessage();
        }
        
        const day = await getInput("Enter the deadline day (DD):", "Example: 25");
        const year = await getInput("Enter the deadline year (YYYY):", "Example: 2025");
        
        if (!day || day.length > 2 || !year || year.length !== 4 || !isValidDay(day, month, year)) {
            return notADateMessage.showMessage();
        }
        
        const formattedDate = `${month.padStart(2, '0')}-${day.padStart(2, '0')}-${year}`;
        
        // Insert DEADLINE after SCHEDULED if present, or at end of line
        let newLineText = currentLine.text;
        if (currentLine.text.includes("SCHEDULED:")) {
            // Insert after SCHEDULED block
            newLineText = currentLine.text.replace(
                /(SCHEDULED:\s*\[[^\]]*\])/,
                `$1    DEADLINE: [${formattedDate}]`
            );
        } else {
            // Append to end of line
            newLineText = `${currentLine.text}    DEADLINE: [${formattedDate}]`;
        }
        
        workspaceEdit.delete(document.uri, currentLine.range);
        workspaceEdit.insert(document.uri, currentLine.range.start, newLineText);
        await vscode.workspace.applyEdit(workspaceEdit);
        vscode.commands.executeCommand("workbench.action.files.save");
    })();
    
    function isValidMonth(input) {
        let num = parseInt(input, 10);
        return num >= 1 && num <= 12;
    }

    function isValidDay(input, month, year) {
        let num = parseInt(input, 10);
        let maxDays = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
        return num >= 1 && num <= maxDays;
    }
};
