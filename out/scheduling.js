"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduleTask = scheduleTask;
const vscode = require("vscode");
const showMessage_1 = require("./showMessage");
function scheduleTask() {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") {
        return;
    }
    const { document } = activeTextEditor;
    const position = activeTextEditor.selection.active.line;
    const currentLine = document.lineAt(position);
    let workspaceEdit = new vscode.WorkspaceEdit();
    const config = vscode.workspace.getConfiguration("vsorg");
    const dateFormat = config.get("dateFormat") || "MM-DD-YYYY";
    const fullDateMessage = new showMessage_1.WindowMessage("warning", "Full date must be entered", false, false);
    const notADateMessage = new showMessage_1.WindowMessage("warning", "That's not a valid date.", false, false);
    if (currentLine.text.includes("SCHEDULED:")) {
        const removeScheduled = currentLine.text.replace(/\b(SCHEDULED)\b(.*)/, "").trimEnd();
        workspaceEdit.delete(document.uri, currentLine.range);
        workspaceEdit.insert(document.uri, currentLine.range.start, removeScheduled);
        vscode.workspace.applyEdit(workspaceEdit);
        return;
    }
    async function getInput(prompt, placeholder) {
        return vscode.window.showInputBox({ prompt, placeHolder: placeholder });
    }
    (async function () {
        const year = await getInput("Enter the year (YYYY):", "2025");
        if (!year || year.length !== 4) {
            return fullDateMessage.showMessage();
        }
        const month = await getInput("Enter the month (MM):", "08");
        if (!month || month.length > 2) {
            return fullDateMessage.showMessage();
        }
        const day = await getInput("Enter the day (DD):", "15");
        if (!day || day.length > 2 || daysInMonth(parseInt(month), parseInt(year)) < parseInt(day)) {
            return notADateMessage.showMessage();
        }
        const formattedDate = dateFormat === "MM-DD-YYYY"
            ? `${month}-${day}-${year}`
            : `${day}-${month}-${year}`;
        workspaceEdit.delete(document.uri, currentLine.range);
        workspaceEdit.insert(document.uri, currentLine.range.start, `${currentLine.text}    SCHEDULED: [${formattedDate}]`);
        await vscode.workspace.applyEdit(workspaceEdit);
        vscode.commands.executeCommand("workbench.action.files.save");
    })();
}
function daysInMonth(month, year) {
    return new Date(year, month, 0).getDate();
}
//# sourceMappingURL=scheduling.js.map