const { isPlanningLine, getAcceptedDateFormats } = require("./orgTagUtils");
const { transformDayHeadingDate } = require("./incrementDate");
const { transformScheduledDate } = require("./rescheduleTask");

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

    const edit = new vscode.WorkspaceEdit();
    const editedLineNumbers = new Set();
    let touched = false;
    let warnedParse = false;

    for (const lineNumber of sortedLines) {
        const line = document.lineAt(lineNumber);
        const text = line.text;
        const nextLineText = (lineNumber + 1 < document.lineCount)
            ? document.lineAt(lineNumber + 1).text
            : "";

        // Try day heading first
        const dayResult = transformDayHeadingDate(text, forward, dateFormat, acceptedDateFormats);
        if (dayResult.parseError) {
            warnedParse = true;
            continue;
        }
        if (dayResult.text !== null) {
            if (dayResult.text !== text) {
                if (!editedLineNumbers.has(lineNumber)) {
                edit.replace(document.uri, line.range, dayResult.text);
                touched = true;
                    editedLineNumbers.add(lineNumber);
                }
            }
            continue;
        }

        // Try SCHEDULED on current line
        const schedResult = transformScheduledDate(text, forward, dateFormat, acceptedDateFormats);
        if (schedResult.parseError) {
            warnedParse = true;
            continue;
        }
        if (schedResult.text !== null) {
            if (schedResult.text !== text) {
                if (!editedLineNumbers.has(lineNumber)) {
                edit.replace(document.uri, line.range, schedResult.text);
                touched = true;
                    editedLineNumbers.add(lineNumber);
                }
            }
            continue;
        }

        // Emacs-style: scheduled stamp on the immediate planning line
        if (isPlanningLine(nextLineText)) {
            const planningResult = transformScheduledDate(nextLineText, forward, dateFormat, acceptedDateFormats);
            if (planningResult.parseError) {
                warnedParse = true;
                continue;
            }
            if (planningResult.text !== null && planningResult.text !== nextLineText) {
                const planningLine = document.lineAt(lineNumber + 1);
                const planningLineNumber = lineNumber + 1;
                if (editedLineNumbers.has(planningLineNumber)) {
                    continue;
                }
                edit.replace(document.uri, planningLine.range, planningResult.text);
                touched = true;
                editedLineNumbers.add(planningLineNumber);
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
