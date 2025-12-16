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

    const config = vscode.workspace.getConfiguration("Org-vscode");
    const dateFormat = config.get("dateFormat", "MM-DD-YYYY");
    const acceptedDateFormats = [dateFormat, "MM-DD-YYYY", "DD-MM-YYYY"];

    // Match SCHEDULED date format: [YYYY-MM-DD]
    const dateRegex = /SCHEDULED:\s*\[(\d{2}-\d{2}-\d{4})\]/;
    const match = text.match(dateRegex);

    if (!match) {
        vscode.window.showWarningMessage("No scheduled date found on this line.");
        return;
    }

    const currentDate = match[1]; // Extract date
    const parsed = moment(currentDate, acceptedDateFormats, true);
    if (!parsed.isValid()) {
        vscode.window.showWarningMessage(`Could not parse scheduled date using format ${dateFormat}.`);
        return;
    }
    const newDate = parsed.add(forward ? 1 : -1, "day").format(dateFormat);

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
