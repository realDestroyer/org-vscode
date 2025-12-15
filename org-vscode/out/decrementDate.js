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
    const newDate = moment(currentDate, "MM-DD-YYYY").subtract(1, "day"); // Decrement by one day

    // Generate new formatted date
    const newFormattedDate = `${indent}${marker} [${newDate.format("MM-DD-YYYY ddd")}]`;

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