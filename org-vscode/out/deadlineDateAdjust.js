const vscode = require("vscode");
const moment = require("moment");

/**
 * Adjusts DEADLINE dates on the current line
 * DEADLINE: [MM-DD-YYYY] or DEADLINE: [MM-DD-YYYY HH:MM]
 */
function deadlineDateAdjust(forward = true) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor detected.");
        return;
    }

    const document = editor.document;
    const cursorPosition = editor.selection.active;
    const line = document.lineAt(cursorPosition.line);
    let text = line.text;

    const config = vscode.workspace.getConfiguration("Org-vscode");
    const dateFormat = config.get("dateFormat", "MM-DD-YYYY");

    // Match DEADLINE: [MM-DD-YYYY] with optional time
    const deadlineRegex = /DEADLINE:\s*\[(\d{2}-\d{2}-\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?\]/;
    const match = text.match(deadlineRegex);

    if (!match) {
        vscode.window.showWarningMessage("No DEADLINE date found on this line.");
        return;
    }

    const currentDate = match[1];
    const timeComponent = match[2] || null;
    const parsed = moment(currentDate, dateFormat, true);
    if (!parsed.isValid()) {
        vscode.window.showWarningMessage(`Could not parse deadline date using format ${dateFormat}.`);
        return;
    }
    const newDate = parsed.add(forward ? 1 : -1, "day").format(dateFormat);

    // Rebuild the DEADLINE with optional time
    const newDeadline = timeComponent 
        ? `DEADLINE: [${newDate} ${timeComponent}]`
        : `DEADLINE: [${newDate}]`;

    const updatedText = text.replace(deadlineRegex, newDeadline);

    editor.edit(editBuilder => {
        const lineRange = new vscode.Range(cursorPosition.line, 0, cursorPosition.line, text.length);
        editBuilder.replace(lineRange, updatedText);
    });

    console.log(`📅 Deadline changed: ${currentDate} → ${newDate}`);
}

function deadlineDateForward() {
    deadlineDateAdjust(true);
}

function deadlineDateBackward() {
    deadlineDateAdjust(false);
}

module.exports = {
    deadlineDateForward,
    deadlineDateBackward
};
