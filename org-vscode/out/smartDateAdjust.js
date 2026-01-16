const vscode = require("vscode");
const moment = require("moment");
const { isPlanningLine, getAcceptedDateFormats, DAY_HEADING_REGEX, SCHEDULED_REGEX } = require("./orgTagUtils");

/**
 * Smart date adjustment - detects what type of date is on the current line
 * and adjusts it accordingly:
 * - Day heading (⊘ <MM-DD-YYYY DDD>) → adjusts the day date
 * - Task with SCHEDULED: <MM-DD-YYYY> → adjusts the scheduled date
 *
 * DAY_HEADING_REGEX groups: (1) indent, (2) marker, (3) open-bracket, (4) date, (5) dayname,
 *   (6) time-start, (7) time-end, (8) repeater, (9) warning, (10) close-bracket, (11) rest
 * SCHEDULED_REGEX groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start, (5) time-end,
 *   (6) repeater, (7) warning, (8) close-bracket
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

    const dayHeadingRegex = DAY_HEADING_REGEX;
    const scheduledRegex = SCHEDULED_REGEX;

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
            const openBracket = dayMatch[3];
            const closeBracket = dayMatch[10];
            const currentDate = dayMatch[4];
            const hadDayAbbrev = dayMatch[5] !== undefined;
            const timeStart = dayMatch[6] || null;
            const timeEnd = dayMatch[7] || null;
            const repeater = dayMatch[8] || null;
            const warning = dayMatch[9] || null;
            const suffix = dayMatch[11] || "";
            const parsed = moment(currentDate, acceptedDateFormats, true);
            if (!parsed.isValid()) {
                warnedParse = true;
                continue;
            }
            const newDate = parsed.add(forward ? 1 : -1, "days");
            const formattedDate = newDate.format(dateFormat);
            const dayPart = hadDayAbbrev ? ` ${newDate.format("ddd")}` : "";
            const timePart = timeStart ? (timeEnd ? ` ${timeStart}-${timeEnd}` : ` ${timeStart}`) : "";
            const repeaterPart = repeater ? ` ${repeater}` : "";
            const warningPart = warning ? ` ${warning}` : "";
            const newFormattedDate = `${indent}${marker} ${openBracket}${formattedDate}${dayPart}${timePart}${repeaterPart}${warningPart}${closeBracket}${suffix}`;
            const updatedText = text.replace(dayHeadingRegex, newFormattedDate);
            if (updatedText !== text) {
                edit.replace(document.uri, line.range, updatedText);
                touched = true;
            }
            continue;
        }

        const scheduledMatch = text.match(scheduledRegex);
        if (scheduledMatch) {
            const openBracket = scheduledMatch[1];
            const closeBracket = scheduledMatch[8];
            const currentDate = scheduledMatch[2];
            const hadDayAbbrev = scheduledMatch[3] !== undefined;
            const timeStart = scheduledMatch[4] || null;
            const timeEnd = scheduledMatch[5] || null;
            const repeater = scheduledMatch[6] || null;
            const warning = scheduledMatch[7] || null;
            const parsed = moment(currentDate, acceptedDateFormats, true);
            if (!parsed.isValid()) {
                warnedParse = true;
                continue;
            }
            const newDate = parsed.add(forward ? 1 : -1, "day");
            const formattedDate = newDate.format(dateFormat);
            const dayPart = hadDayAbbrev ? ` ${newDate.format("ddd")}` : "";
            const timePart = timeStart ? (timeEnd ? ` ${timeStart}-${timeEnd}` : ` ${timeStart}`) : "";
            const repeaterPart = repeater ? ` ${repeater}` : "";
            const warningPart = warning ? ` ${warning}` : "";
            const updatedText = text.replace(scheduledRegex, `SCHEDULED: ${openBracket}${formattedDate}${dayPart}${timePart}${repeaterPart}${warningPart}${closeBracket}`);
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
            const openBracket = pm[1];
            const closeBracket = pm[8];
            const currentDate = pm[2];
            const hadDayAbbrev = pm[3] !== undefined;
            const timeStart = pm[4] || null;
            const timeEnd = pm[5] || null;
            const repeater = pm[6] || null;
            const warning = pm[7] || null;
            const parsed = moment(currentDate, acceptedDateFormats, true);
            if (!parsed.isValid()) {
                warnedParse = true;
                continue;
            }
            const newDate = parsed.add(forward ? 1 : -1, "day");
            const formattedDate = newDate.format(dateFormat);
            const dayPart = hadDayAbbrev ? ` ${newDate.format("ddd")}` : "";
            const timePart = timeStart ? (timeEnd ? ` ${timeStart}-${timeEnd}` : ` ${timeStart}`) : "";
            const repeaterPart = repeater ? ` ${repeater}` : "";
            const warningPart = warning ? ` ${warning}` : "";
            const updatedPlanning = planningLine.text.replace(scheduledRegex, `SCHEDULED: ${openBracket}${formattedDate}${dayPart}${timePart}${repeaterPart}${warningPart}${closeBracket}`);
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
