const moment = require("moment");
const { getAcceptedDateFormats, DEADLINE_REGEX } = require("./orgTagUtils");

/**
 * Pure function: Transform a line containing DEADLINE by adjusting its date.
 * Returns { text, parseError } where text is the new line (or null if no DEADLINE match),
 * and parseError is true if date parsing failed.
 *
 * DEADLINE_REGEX groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start, (5) time-end,
 *                        (6) repeater, (7) warning, (8) close-bracket
 */
function transformDeadlineDate(text, forward, dateFormat, acceptedDateFormats) {
    const match = text.match(DEADLINE_REGEX);
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
    const newDeadline = `DEADLINE: ${openBracket}${formattedDate}${dayPart}${timePart}${repeaterPart}${warningPart}${closeBracket}`;
    const updatedText = text.replace(DEADLINE_REGEX, newDeadline);
    return { text: updatedText, parseError: false };
}

/**
 * VS Code command: Adjusts DEADLINE dates on the current line
 */
function deadlineDateAdjust(forward = true) {
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

    const edit = new vscode.WorkspaceEdit();
    let touched = false;
    let warnedParse = false;

    for (const lineNumber of sortedLines) {
        const line = document.lineAt(lineNumber);
        const result = transformDeadlineDate(line.text, forward, dateFormat, acceptedDateFormats);
        if (result.parseError) {
            warnedParse = true;
            continue;
        }
        if (result.text !== null && result.text !== line.text) {
            edit.replace(document.uri, line.range, result.text);
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
    deadlineDateBackward,
    transformDeadlineDate
};
