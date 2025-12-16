const vscode = require("vscode");
const moment = require("moment");

function decrementDate() {
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

    // Match Date Format: ⊘ [MM-DD-YYYY DDD] OR * [MM-DD-YYYY DDD]
    const dateRegex = /^(\s*)(⊘|\*+)\s*\[(\d{2}-\d{2}-\d{4}) (\w{3})\]/;
    const match = text.match(dateRegex);

    if (!match) {
        vscode.window.showWarningMessage("No date stamp found on this line.");
        return;
    }

    const indent = match[1] || "";
    const marker = match[2];
    const currentDate = match[3]; // Extract date part
    const parsed = moment(currentDate, acceptedDateFormats, true);
    if (!parsed.isValid()) {
        vscode.window.showWarningMessage(`Could not parse date using format ${dateFormat}.`);
        return;
    }
    const newDate = parsed.subtract(1, "day"); // Decrement by one day

    // Generate new formatted date
    const newFormattedDate = `${indent}${marker} [${newDate.format(dateFormat)} ${newDate.format("ddd")}]`;

    // Replace old date with new date
    const updatedText = text.replace(dateRegex, newFormattedDate);

    // Edit document
    editor.edit(editBuilder => {
        const lineRange = new vscode.Range(cursorPosition.line, 0, cursorPosition.line, text.length);
        editBuilder.replace(lineRange, updatedText);
    });

    console.log(`📅 Date changed: ${match[0]} → ${newFormattedDate}`);
}

// ** Command to decrement the date backward **
function decrementDateBackward() {
    decrementDate();
}

module.exports = {
    decrementDateBackward
};