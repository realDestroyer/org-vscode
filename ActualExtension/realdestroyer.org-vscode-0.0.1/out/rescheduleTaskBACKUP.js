const vscode = require("vscode");
const fs = require("fs");
const moment = require("moment");

function rescheduleTask(forward = true) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor detected.");
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const cursorPosition = selection.active;

    const line = document.lineAt(cursorPosition.line);
    let text = line.text;

    // Match SCHEDULED date format: [YYYY-MM-DD]
    const dateRegex = /SCHEDULED:\s*\[(\d{2}-\d{2}-\d{4})\]/;
    const match = text.match(dateRegex);

    if (!match) {
        vscode.window.showWarningMessage("No scheduled date found on this line.");
        return;
    }

    const currentDate = match[1]; // Extract date
    const newDate = moment(currentDate, "MM-DD-YYYY").add(forward ? 1 : -1, "day").format("MM-DD-YYYY");

    // Replace the old date with the new date
    const updatedText = text.replace(dateRegex, `SCHEDULED: [${newDate}]`);

    // Edit the document with the new date
    editor.edit(editBuilder => {
        const lineRange = new vscode.Range(cursorPosition.line, 0, cursorPosition.line, text.length);
        editBuilder.replace(lineRange, updatedText);
    });

    console.log(`📅 Rescheduled task: ${currentDate} → ${newDate}`);
}

// ** Command to move the scheduled date forward **
function moveDateForward() {
    rescheduleTask(true);
}

// ** Command to move the scheduled date backward **
function moveDateBackward() {
    rescheduleTask(false);
}

module.exports = {
    moveDateForward,
    moveDateBackward
};
