const vscode = require("vscode");
const moment = require("moment");

function insertDateStamp() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor detected.");
        return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const cursorPosition = selection.active;

    // **Generate the formatted date**
    const formattedDate = `[${moment().format("MM-DD-YYYY ddd")}]`;

    editor.edit(editBuilder => {
        editBuilder.insert(cursorPosition, formattedDate + "\n");
    }).then(() => {
        // Move cursor to the next line after inserting the date
        const newPosition = new vscode.Position(cursorPosition.line + 1, 0);
        editor.selection = new vscode.Selection(newPosition, newPosition);
    });

    console.log(`📅 Inserted date stamp: ${formattedDate}`);
}

module.exports = {
    insertDateStamp
};
