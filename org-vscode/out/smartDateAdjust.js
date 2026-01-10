const vscode = require("vscode");
const moment = require("moment");
const { isPlanningLine, getAcceptedDateFormats } = require("./orgTagUtils");

/**
 * Smart date adjustment - detects what type of date is on the current line
 * and adjusts it accordingly:
 * - Day heading (⊘ [MM-DD-YYYY DDD]) → adjusts the day date
 * - Task with SCHEDULED: [MM-DD-YYYY] → adjusts the scheduled date
 */
function smartDateAdjust(forward = true) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor detected.");
        return;
    }

    const config = vscode.workspace.getConfiguration("Org-vscode");
    const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
    const acceptedDateFormats = getAcceptedDateFormats(dateFormat);

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

    const dayHeadingRegex = /^(\s*)(⊘|\*+)\s*\[(\d{2,4}-\d{2}-\d{2,4})(?: (\w{3}))?(?: (\d{1,2}:\d{2}))?\]/;
    const scheduledRegex = /SCHEDULED:\s*\[(\d{2,4}-\d{2}-\d{2,4})(?: (\w{3}))?(?: (\d{1,2}:\d{2}))?\]/;

    const edit = new vscode.WorkspaceEdit();
    let touched = false;
    let warnedParse = false;

    for (const lineNumber of sortedLines) {
        const line = document.lineAt(lineNumber);
        const text = line.text;
        const nextLineText = (lineNumber + 1 < document.lineCount)
            ? document.lineAt(lineNumber + 1).text
            : "";

        const dayMatch = text.match(dayHeadingRegex);
        if (dayMatch) {
            const indent = dayMatch[1] || "";
            const marker = dayMatch[2];
            const currentDate = dayMatch[3];
            const hadDayAbbrev = dayMatch[4] !== undefined;
            const timeComponent = dayMatch[5] || null;
            const parsed = moment(currentDate, acceptedDateFormats, true);
            if (!parsed.isValid()) {
                warnedParse = true;
                continue;
            }
            const newDate = parsed.add(forward ? 1 : -1, "days");
            const formattedDate = newDate.format(dateFormat);
            const dayPart = hadDayAbbrev ? ` ${newDate.format("ddd")}` : "";
            const timePart = timeComponent ? ` ${timeComponent}` : "";
            const newFormattedDate = `${indent}${marker} [${formattedDate}${dayPart}${timePart}]`;
            const updatedText = text.replace(dayHeadingRegex, newFormattedDate);
            if (updatedText !== text) {
                edit.replace(document.uri, line.range, updatedText);
                touched = true;
            }
            continue;
        }

        const scheduledMatch = text.match(scheduledRegex);
        if (scheduledMatch) {
            const currentDate = scheduledMatch[1];
            const hadDayAbbrev = scheduledMatch[2] !== undefined;
            const timeComponent = scheduledMatch[3] || null;
            const parsed = moment(currentDate, acceptedDateFormats, true);
            if (!parsed.isValid()) {
                warnedParse = true;
                continue;
            }
            const newDate = parsed.add(forward ? 1 : -1, "day");
            const formattedDate = newDate.format(dateFormat);
            const dayPart = hadDayAbbrev ? ` ${newDate.format("ddd")}` : "";
            const timePart = timeComponent ? ` ${timeComponent}` : "";
            const updatedText = text.replace(scheduledRegex, `SCHEDULED: [${formattedDate}${dayPart}${timePart}]`);
            if (updatedText !== text) {
                edit.replace(document.uri, line.range, updatedText);
                touched = true;
            }
            continue;
        }

        // Emacs-style: scheduled stamp on the immediate planning line.
        if (!scheduledMatch && isPlanningLine(nextLineText) && nextLineText.match(scheduledRegex)) {
            const planningLine = document.lineAt(lineNumber + 1);
            const pm = planningLine.text.match(scheduledRegex);
            if (!pm) {
                continue;
            }
            const currentDate = pm[1];
            const hadDayAbbrev = pm[2] !== undefined;
            const timeComponent = pm[3] || null;
            const parsed = moment(currentDate, acceptedDateFormats, true);
            if (!parsed.isValid()) {
                warnedParse = true;
                continue;
            }
            const newDate = parsed.add(forward ? 1 : -1, "day");
            const formattedDate = newDate.format(dateFormat);
            const dayPart = hadDayAbbrev ? ` ${newDate.format("ddd")}` : "";
            const timePart = timeComponent ? ` ${timeComponent}` : "";
            const updatedPlanning = planningLine.text.replace(scheduledRegex, `SCHEDULED: [${formattedDate}${dayPart}${timePart}]`);
            if (updatedPlanning !== planningLine.text) {
                edit.replace(document.uri, planningLine.range, updatedPlanning);
                touched = true;
            }
        }
    }

    if (!touched) {
        if (warnedParse) {
            vscode.window.showWarningMessage(`Could not parse one or more dates using format ${dateFormat}.`);
        }
        else {
            vscode.window.showWarningMessage("No day heading or SCHEDULED date found on selected line(s).");
        }
        return;
    }

    vscode.workspace.applyEdit(edit);
}

function smartDateForward() {
    smartDateAdjust(true);
}

function smartDateBackward() {
    smartDateAdjust(false);
}

module.exports = {
    smartDateForward,
    smartDateBackward
};
