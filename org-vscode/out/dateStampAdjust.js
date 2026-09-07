const moment = require("moment");
const { PLAIN_TIMESTAMP_REGEX } = require("./orgTagUtils");

function transformTimestamp(text, start, end, forward, dateFormat, acceptedDateFormats) {
    const full = text.slice(start, end);
    const timestampRegex = new RegExp(PLAIN_TIMESTAMP_REGEX.source);
    const match = full.match(timestampRegex);
    if (!match || match.index !== 0) {
        return { text: null, parseError: false };
    }

    const [, openBracket, currentDate, dayName, timeStart, timeEnd, repeater, warning, closeBracket] = match;
    const parsed = moment(currentDate, acceptedDateFormats, true);
    if (!parsed.isValid()) {
        return { text: null, parseError: true };
    }

    const newDate = parsed.add(forward ? 1 : -1, "day");
    const dayPart = dayName === undefined ? "" : ` ${newDate.format("ddd")}`;
    const timePart = timeStart ? (timeEnd ? ` ${timeStart}-${timeEnd}` : ` ${timeStart}`) : "";
    const repeaterPart = repeater ? ` ${repeater}` : "";
    const warningPart = warning ? ` ${warning}` : "";
    const replacement = `${openBracket}${newDate.format(dateFormat)}${dayPart}${timePart}${repeaterPart}${warningPart}${closeBracket}`;

    return {
        text: text.slice(0, start) + replacement + text.slice(end),
        parseError: false,
        start,
        end,
        replacement
    };
}

function findTimestampCandidates(text) {
    const candidates = [];
    const regex = new RegExp(PLAIN_TIMESTAMP_REGEX.source, "g");
    let match;
    while ((match = regex.exec(text)) !== null) {
        candidates.push({ start: match.index, end: match.index + match[0].length });
    }
    return candidates;
}

function chooseTimestamp(text, cursorCharacter) {
    const candidates = findTimestampCandidates(text);
    if (!candidates.length) {
        return null;
    }

    const cursor = Math.max(0, Number(cursorCharacter) || 0);
    return candidates.find(candidate => cursor >= candidate.start && cursor <= candidate.end)
        || candidates.slice().sort((a, b) => {
            const distanceA = cursor < a.start ? a.start - cursor : cursor - a.end;
            const distanceB = cursor < b.start ? b.start - cursor : cursor - b.end;
            return distanceA - distanceB;
        })[0];
}

function computeDateStampReplacements(getLineText, targetLines, cursorPositions, forward, dateFormat, acceptedDateFormats) {
    const replacements = new Map();
    const replacedLines = new Set();
    let warnedParse = false;

    Array.from(targetLines).sort((a, b) => b - a).forEach(lineNumber => {
        if (replacedLines.has(lineNumber)) {
            return;
        }
        const text = getLineText(lineNumber);
        let targetLineNumber = lineNumber;
        let targetText = text;
        let candidate = chooseTimestamp(text, cursorPositions?.get(lineNumber));

        if (!candidate) {
            const nextText = getLineText(lineNumber + 1);
            if (/^\s*(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\s*[<\[]/i.test(nextText)) {
                targetLineNumber = lineNumber + 1;
                targetText = nextText;
                candidate = chooseTimestamp(nextText, 0);
            }
        }
        if (!candidate) {
            return;
        }

        if (replacedLines.has(targetLineNumber)) {
            return;
        }
        const result = transformTimestamp(targetText, candidate.start, candidate.end, forward, dateFormat, acceptedDateFormats);
        if (result.parseError) {
            warnedParse = true;
            return;
        }
        replacedLines.add(targetLineNumber);
        if (result.text !== null && result.text !== targetText) {
            replacements.set(targetLineNumber, result.text);
        }
    });

    return { replacements, warnedParse };
}

function adjustDateStamps(forward) {
    const vscode = require("vscode");
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor detected.");
        return;
    }

    const document = editor.document;
    const selections = editor.selections?.length ? editor.selections : [editor.selection];
    const targetLines = new Set();
    const cursorPositions = new Map();

    for (const selection of selections) {
        if (selection.isEmpty) {
            targetLines.add(selection.active.line);
            cursorPositions.set(selection.active.line, selection.active.character);
            continue;
        }

        const startLine = Math.min(selection.start.line, selection.end.line);
        let endLine = Math.max(selection.start.line, selection.end.line);
        if (selection.end.character === 0 && endLine > startLine) {
            endLine -= 1;
        }
        for (let line = startLine; line <= endLine; line++) {
            targetLines.add(line);
            cursorPositions.set(line, line === selection.active.line ? selection.active.character : 0);
        }
    }

    const config = vscode.workspace.getConfiguration("Org-vscode");
    const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
    const acceptedDateFormats = require("./orgTagUtils").getAcceptedDateFormats(dateFormat);
    const { replacements, warnedParse } = computeDateStampReplacements(
        lineNumber => document.lineAt(lineNumber).text,
        targetLines,
        cursorPositions,
        forward,
        dateFormat,
        acceptedDateFormats
    );

    if (!replacements.size) {
        vscode.window.showWarningMessage(warnedParse
            ? `Could not parse one or more date stamps using format ${dateFormat}.`
            : "No date stamp found on selected line(s).");
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    for (const [lineNumber, text] of replacements) {
        edit.replace(document.uri, document.lineAt(lineNumber).range, text);
    }
    return vscode.workspace.applyEdit(edit);
}

module.exports = {
    findTimestampCandidates,
    chooseTimestamp,
    transformTimestamp,
    computeDateStampReplacements,
    adjustDateStamps
};
