const vscode = require("vscode");
const moment = require("moment");
const { getAcceptedDateFormats, DAY_HEADING_REGEX } = require("./orgTagUtils");

function incrementDate(forward = true) {
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

    // Match day heading: ⊘ <date DDD HH:MM> OR * [date DDD HH:MM] (all optional after date)
    // DAY_HEADING_REGEX groups: (1) indent, (2) marker, (3) open-bracket, (4) date, (5) dayname,
    //   (6) time-start, (7) time-end, (8) repeater, (9) warning, (10) close-bracket, (11) rest
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
        const openBracket = match[3];
        const closeBracket = match[10];
        const currentDate = match[4];
        const hadDayAbbrev = match[5] !== undefined;
        const timeStart = match[6] || null;
        const timeEnd = match[7] || null;
        const repeater = match[8] || null;
        const warning = match[9] || null;
        const rest = match[11] || "";
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
        const updatedText = `${indent}${marker} ${openBracket}${formattedDate}${dayPart}${timePart}${repeaterPart}${warningPart}${closeBracket}${rest}`;
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

// ** Command to increment the date forward **
function incrementDateForward() {
    incrementDate(true);
}

module.exports = {
    incrementDateForward
};