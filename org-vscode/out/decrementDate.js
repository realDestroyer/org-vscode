const vscode = require("vscode");
const moment = require("moment");

function decrementDate() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor detected.");
        return;
    }

    const document = editor.document;
    const selections = (editor.selections && editor.selections.length)
        ? editor.selections
        : [editor.selection];
    const targetLines = new Set();
    for (const selection of selections) {
        if (selection.isEmpty) {
            targetLines.add(selection.active.line);
            continue;
        }
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

    const config = vscode.workspace.getConfiguration("Org-vscode");
    const dateFormat = config.get("dateFormat", "MM-DD-YYYY");
    const acceptedDateFormats = [dateFormat, "MM-DD-YYYY", "YYYY-MM-DD"];

    // Match Date Format: ⊘ [date DDD] OR * [date DDD]
    const dateRegex = /^(\s*)(⊘|\*+)\s*\[(\d{2,4}-\d{2}-\d{2,4}) (\w{3})\]/;

    const edit = new vscode.WorkspaceEdit();
    let touched = false;
    let warnedParse = false;

    for (const lineNumber of sortedLines) {
        const line = document.lineAt(lineNumber);
        const text = line.text;
        const match = text.match(dateRegex);
        if (!match) {
            continue;
        }
        const indent = match[1] || "";
        const marker = match[2];
        const currentDate = match[3];
        const parsed = moment(currentDate, acceptedDateFormats, true);
        if (!parsed.isValid()) {
            warnedParse = true;
            continue;
        }
        const newDate = parsed.subtract(1, "day");
        const newFormattedDate = `${indent}${marker} [${newDate.format(dateFormat)} ${newDate.format("ddd")}]`;
        const updatedText = text.replace(dateRegex, newFormattedDate);
        if (updatedText !== text) {
            edit.replace(document.uri, line.range, updatedText);
            touched = true;
        }
    }

    if (!touched) {
        if (warnedParse) {
            vscode.window.showWarningMessage(`Could not parse one or more date stamps using format ${dateFormat}.`);
        }
        else {
            vscode.window.showWarningMessage("No date stamp found on selected line(s).");
        }
        return;
    }

    vscode.workspace.applyEdit(edit);
}

// ** Command to decrement the date backward **
function decrementDateBackward() {
    decrementDate();
}

module.exports = {
    decrementDateBackward
};