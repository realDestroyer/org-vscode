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
    const config = vscode.workspace.getConfiguration("vsorg");
    const dateFormat = config.get("dateFormat");
    // Messages
    const fullDateMessage = new showMessage_1.WindowMessage("warning", "Full date must be entered", false, false);
    const notADateMessage = new showMessage_1.WindowMessage("warning", "That's not a valid date.", false, false);
    if (currentLine.text.includes("SCHEDULED:")) {
        const removeScheduled = currentLine.text
            .replace(/\b(SCHEDULED)\b(.*)/, "")
            .trimRight();
        workspaceEdit.delete(document.uri, currentLine.range);
        workspaceEdit.insert(document.uri, currentLine.range.start, removeScheduled);
        return vscode.workspace.applyEdit(workspaceEdit);
    }
    async function getInput(prompt, placeHolder) {
        return await vscode.window.showInputBox({ prompt, placeHolder });
    }
    (async function () {
        const month = await getInput("Enter the month (MM) you want to schedule:", "Example: 08 for August");
        if (!month || month.length > 2 || !isValidMonth(month)) {
            return fullDateMessage.showMessage();
        }
        
        const day = await getInput("Enter the day (DD) you want to schedule:", "Example: 08 for the eighth");
        const year = await getInput("Enter the year (YYYY) you want to schedule:", "Example: 2025");
        
        if (!day || day.length > 2 || !year || year.length !== 4 || !isValidDay(day, month, year)) {
            return notADateMessage.showMessage();
        }
        
        const formattedDate = `${month}-${day}-${year}`;
        workspaceEdit.delete(document.uri, currentLine.range);
        workspaceEdit.insert(document.uri, currentLine.range.start, `${currentLine.text}    SCHEDULED: [${formattedDate}]`);
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
//# sourceMappingURL=scheduling.js.map