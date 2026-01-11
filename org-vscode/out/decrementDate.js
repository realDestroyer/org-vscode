const vscode = require("vscode");
const moment = require("moment");
const { getAcceptedDateFormats, DAY_HEADING_REGEX } = require("./orgTagUtils");

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
    const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
    const acceptedDateFormats = getAcceptedDateFormats(dateFormat);

    // Match day heading: ⊘ [date DDD HH:MM] OR * [date DDD HH:MM] (ddd and time are optional)
    // DAY_HEADING_REGEX groups: (1) indent, (2) marker, (3) date, (4) weekday, (5) time, (6) rest
    const dateRegex = DAY_HEADING_REGEX;

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
        const hadDayAbbrev = match[4] !== undefined;
        const timeComponent = match[5] || null;
        const rest = match[6] || "";
        const parsed = moment(currentDate, acceptedDateFormats, true);
        if (!parsed.isValid()) {
            warnedParse = true;
            continue;
        }
        const newDate = parsed.subtract(1, "day");
        const formattedDate = newDate.format(dateFormat);
        const dayPart = hadDayAbbrev ? ` ${newDate.format("ddd")}` : "";
        const timePart = timeComponent ? ` ${timeComponent}` : "";
        const updatedText = `${indent}${marker} [${formattedDate}${dayPart}${timePart}]${rest}`;
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