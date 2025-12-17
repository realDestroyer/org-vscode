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
    const acceptedDateFormats = [dateFormat, "MM-DD-YYYY", "DD-MM-YYYY"];

    // Match DEADLINE: [MM-DD-YYYY] with optional time
    const deadlineRegex = /DEADLINE:\s*\[(\d{2}-\d{2}-\d{4})(?:\s+(\d{2}:\d{2}(?::\d{2})?))?\]/;

    const edit = new vscode.WorkspaceEdit();
    let touched = false;
    let warnedParse = false;

    for (const lineNumber of sortedLines) {
        const line = document.lineAt(lineNumber);
        const text = line.text;
        const match = text.match(deadlineRegex);
        if (!match) {
            continue;
        }
        const currentDate = match[1];
        const timeComponent = match[2] || null;
        const parsed = moment(currentDate, acceptedDateFormats, true);
        if (!parsed.isValid()) {
            warnedParse = true;
            continue;
        }
        const newDate = parsed.add(forward ? 1 : -1, "day").format(dateFormat);
        const newDeadline = timeComponent
            ? `DEADLINE: [${newDate} ${timeComponent}]`
            : `DEADLINE: [${newDate}]`;
        const updatedText = text.replace(deadlineRegex, newDeadline);
        if (updatedText !== text) {
            edit.replace(document.uri, line.range, updatedText);
            touched = true;
        }
    }

    if (!touched) {
        if (warnedParse) {
            vscode.window.showWarningMessage(`Could not parse one or more deadline dates using format ${dateFormat}.`);
        }
        else {
            vscode.window.showWarningMessage("No DEADLINE date found on selected line(s).");
        }
        return;
    }

    vscode.workspace.applyEdit(edit);
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
