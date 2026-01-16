const vscode = require("vscode");
const fs = require("fs");
const moment = require("moment");
const { isPlanningLine, getAcceptedDateFormats, SCHEDULED_REGEX } = require("./orgTagUtils");

function rescheduleTask(forward = true) {
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

    const dateRegex = SCHEDULED_REGEX;

    const edit = new vscode.WorkspaceEdit();
    let touched = false;
    let warnedParse = false;

    for (const lineNumber of sortedLines) {
        const line = document.lineAt(lineNumber);
        const text = line.text;
        const nextLineText = (lineNumber + 1 < document.lineCount)
            ? document.lineAt(lineNumber + 1).text
            : "";

        // Back-compat: inline scheduled.
        const match = text.match(dateRegex);
        const target = match
            ? { lineNumber, lineText: text }
            : (isPlanningLine(nextLineText) && nextLineText.match(dateRegex))
                ? { lineNumber: lineNumber + 1, lineText: nextLineText }
                : null;

        if (!target) {
            continue;
        }

        const targetMatch = target.lineText.match(dateRegex);
        if (!targetMatch) {
            continue;
        }

        const currentDate = targetMatch[1];
        const hadDayAbbrev = targetMatch[2] !== undefined;
        const hadTime = targetMatch[3] !== undefined;
        const suffix = targetMatch[4] ? ` ${targetMatch[4]}` : "";
        const parsed = moment(currentDate, acceptedDateFormats, true);
        if (!parsed.isValid()) {
            warnedParse = true;
            continue;
        }
        const newDate = parsed.add(forward ? 1 : -1, "day");
        const formattedDate = newDate.format(dateFormat);
        const dayPart = hadDayAbbrev ? ` ${newDate.format("ddd")}` : "";
        const timePart = hadTime ? ` ${targetMatch[3]}` : "";
        const updatedText = target.lineText.replace(dateRegex, `SCHEDULED: [${formattedDate}${dayPart}${timePart}${suffix}]`);
        if (updatedText !== target.lineText) {
            const targetLine = document.lineAt(target.lineNumber);
            edit.replace(document.uri, targetLine.range, updatedText);
            touched = true;
        }
    }

    if (!touched) {
        if (warnedParse) {
            vscode.window.showWarningMessage(`Could not parse one or more scheduled dates using format ${dateFormat}.`);
        }
        else {
            vscode.window.showWarningMessage("No scheduled date found on selected line(s).");
        }
        return;
    }

    vscode.workspace.applyEdit(edit);
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
