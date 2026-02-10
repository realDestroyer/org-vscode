const moment = require("moment");
const { isPlanningLine, getAcceptedDateFormats, SCHEDULED_REGEX } = require("./orgTagUtils");

/**
 * Pure function: Transform a line containing SCHEDULED by adjusting its date.
 * Returns { text, parseError } where text is the new line (or null if no SCHEDULED match),
 * and parseError is true if date parsing failed.
 *
 * SCHEDULED_REGEX groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start, (5) time-end,
 *                         (6) repeater, (7) warning, (8) close-bracket
 */
function transformScheduledDate(text, forward, dateFormat, acceptedDateFormats) {
    const match = text.match(SCHEDULED_REGEX);
    if (!match) {
        return { text: null, parseError: false };
    }
    const openBracket = match[1];
    const closeBracket = match[8];
    const currentDate = match[2];
    const hadDayAbbrev = match[3] !== undefined;
    const timeStart = match[4] || null;
    const timeEnd = match[5] || null;
    const repeater = match[6] || null;
    const warning = match[7] || null;
    const parsed = moment(currentDate, acceptedDateFormats, true);
    if (!parsed.isValid()) {
        return { text: null, parseError: true };
    }
    const newDate = parsed.add(forward ? 1 : -1, "day");
    const formattedDate = newDate.format(dateFormat);
    const dayPart = hadDayAbbrev ? ` ${newDate.format("ddd")}` : "";
    const timePart = timeStart ? (timeEnd ? ` ${timeStart}-${timeEnd}` : ` ${timeStart}`) : "";
    const repeaterPart = repeater ? ` ${repeater}` : "";
    const warningPart = warning ? ` ${warning}` : "";
    const updatedText = text.replace(SCHEDULED_REGEX, `SCHEDULED: ${openBracket}${formattedDate}${dayPart}${timePart}${repeaterPart}${warningPart}${closeBracket}`);
    return { text: updatedText, parseError: false };
}

function computeRescheduleReplacements(getLineText, lineCount, targetLines, forward, dateFormat, acceptedDateFormats) {
    const sortedLines = Array.from(targetLines).sort((a, b) => b - a);
    const replacements = new Map();
    const replacedLines = new Set();
    let warnedParse = false;

    for (const lineNumber of sortedLines) {
        if (replacedLines.has(lineNumber)) {
            continue;
        }

        const text = getLineText(lineNumber);
        const nextLineText = (lineNumber + 1 < lineCount) ? getLineText(lineNumber + 1) : "";

        let result = transformScheduledDate(text, forward, dateFormat, acceptedDateFormats);
        let targetLineNumber = lineNumber;

        if (result.text === null && !result.parseError) {
            if (isPlanningLine(nextLineText)) {
                result = transformScheduledDate(nextLineText, forward, dateFormat, acceptedDateFormats);
                targetLineNumber = lineNumber + 1;
            }
        }

        if (result.parseError) {
            warnedParse = true;
            continue;
        }

        if (result.text !== null) {
            if (replacedLines.has(targetLineNumber)) {
                continue;
            }
            replacedLines.add(targetLineNumber);
            const oldText = getLineText(targetLineNumber);
            if (result.text !== oldText) {
                replacements.set(targetLineNumber, result.text);
            }
        }
    }

    return { replacements, warnedParse };
}

function rescheduleTask(forward = true) {
    const vscode = require("vscode");
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

    const { replacements, warnedParse } = computeRescheduleReplacements(
        (lineNumber) => document.lineAt(lineNumber).text,
        document.lineCount,
        targetLines,
        forward,
        dateFormat,
        acceptedDateFormats
    );

    if (replacements.size === 0) {
        if (warnedParse) {
            vscode.window.showWarningMessage(`Could not parse one or more scheduled dates using format ${dateFormat}.`);
        }
        else {
            vscode.window.showWarningMessage("No scheduled date found on selected line(s).");
        }
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    for (const [lineNumber, newText] of replacements.entries()) {
        const line = document.lineAt(lineNumber);
        edit.replace(document.uri, line.range, newText);
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
    moveDateBackward,
    transformScheduledDate,
    computeRescheduleReplacements
};
