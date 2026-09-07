const { getAcceptedDateFormats } = require("./orgTagUtils");
const { computeDateStampReplacements } = require("./dateStampAdjust");

/**
 * Smart date adjustment - detects what type of date is on the current line
 * and adjusts it accordingly:
 * - Day heading (⊘ <YYYY-MM-DD DDD>) → adjusts the day date
 * - Task with SCHEDULED: <YYYY-MM-DD> → adjusts the scheduled date
 *
 * Uses transformDayHeadingDate and transformScheduledDate for the actual transformations.
 */
function smartDateAdjust(forward = true) {
    const vscode = require("vscode");
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
    const { replacements, warnedParse } = computeSmartDateReplacements(
        (lineNumber) => document.lineAt(lineNumber).text,
        targetLines,
        cursorPositions,
        forward,
        dateFormat,
        acceptedDateFormats
    );

    if (replacements.size === 0) {
        if (warnedParse) {
            vscode.window.showWarningMessage(`Could not parse one or more dates using format ${dateFormat}.`);
        }
        else {
            vscode.window.showWarningMessage("No date stamp found on selected line(s).");
        }
        return;
    }

    const edit = new vscode.WorkspaceEdit();
    for (const [lineNumber, newText] of replacements.entries()) {
        const line = document.lineAt(lineNumber);
        edit.replace(document.uri, line.range, newText);
    }

    return vscode.workspace.applyEdit(edit);
}

function computeSmartDateReplacements(getLineText, targetLines, cursorPositions, forward, dateFormat, acceptedDateFormats) {
    if (typeof targetLines === "number") {
        return computeDateStampReplacements(
            getLineText,
            cursorPositions,
            new Map(),
            forward,
            dateFormat,
            acceptedDateFormats
        );
    }
    return computeDateStampReplacements(getLineText, targetLines, cursorPositions, forward, dateFormat, acceptedDateFormats);
}

function smartDateForward() {
    return smartDateAdjust(true);
}

function smartDateBackward() {
    return smartDateAdjust(false);
}

module.exports = {
    smartDateForward,
    smartDateBackward,
    computeSmartDateReplacements
};
