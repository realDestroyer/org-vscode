const vscode = require("vscode");
const moment = require("moment");
const { getAcceptedDateFormats, DEADLINE_REGEX } = require("./orgTagUtils");

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
    const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
    const acceptedDateFormats = getAcceptedDateFormats(dateFormat);

    const deadlineRegex = DEADLINE_REGEX;

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
        const hadDayAbbrev = match[2] !== undefined;
        const timeComponent = match[3] || null;
        const parsed = moment(currentDate, acceptedDateFormats, true);
        if (!parsed.isValid()) {
            warnedParse = true;
            continue;
        }
        const newDate = parsed.add(forward ? 1 : -1, "day");
        const formattedDate = newDate.format(dateFormat);
        const dayPart = hadDayAbbrev ? ` ${newDate.format("ddd")}` : "";
        const timePart = timeComponent ? ` ${timeComponent}` : "";
        const newDeadline = `DEADLINE: [${formattedDate}${dayPart}${timePart}]`;
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
