const vscode = require("vscode");
const moment = require("moment");

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
    const dateFormat = config.get("dateFormat", "MM-DD-YYYY");

    const document = editor.document;
    const cursorPosition = editor.selection.active;
    const line = document.lineAt(cursorPosition.line);
    let text = line.text;

    // Pattern 1: Day heading - ⊘ [MM-DD-YYYY DDD] OR * [MM-DD-YYYY DDD]
    const dayHeadingRegex = /^(\s*)(⊘|\*+)\s*\[(\d{2}-\d{2}-\d{4}) (\w{3})\]/;
    const dayMatch = text.match(dayHeadingRegex);

    if (dayMatch) {
        const indent = dayMatch[1] || "";
        const marker = dayMatch[2];
        const currentDate = dayMatch[3];
        const parsed = moment(currentDate, dateFormat, true);
        if (!parsed.isValid()) {
            vscode.window.showWarningMessage(`Could not parse date using format ${dateFormat}.`);
            return;
        }
        const newDate = parsed.add(forward ? 1 : -1, "days");
        const newFormattedDate = `${indent}${marker} [${newDate.format(dateFormat)} ${newDate.format("ddd")}]`;
        const updatedText = text.replace(dayHeadingRegex, newFormattedDate);

        editor.edit(editBuilder => {
            const lineRange = new vscode.Range(cursorPosition.line, 0, cursorPosition.line, text.length);
            editBuilder.replace(lineRange, updatedText);
        });

        console.log(`📅 Day heading changed: ${dayMatch[0]} → ${newFormattedDate}`);
        return;
    }

    // Pattern 2: SCHEDULED date - SCHEDULED: [MM-DD-YYYY]
    const scheduledRegex = /SCHEDULED:\s*\[(\d{2}-\d{2}-\d{4})\]/;
    const scheduledMatch = text.match(scheduledRegex);

    if (scheduledMatch) {
        const currentDate = scheduledMatch[1];
        const parsed = moment(currentDate, dateFormat, true);
        if (!parsed.isValid()) {
            vscode.window.showWarningMessage(`Could not parse scheduled date using format ${dateFormat}.`);
            return;
        }
        const newDate = parsed.add(forward ? 1 : -1, "day").format(dateFormat);
        const updatedText = text.replace(scheduledRegex, `SCHEDULED: [${newDate}]`);

        editor.edit(editBuilder => {
            const lineRange = new vscode.Range(cursorPosition.line, 0, cursorPosition.line, text.length);
            editBuilder.replace(lineRange, updatedText);
        });

        console.log(`📅 Scheduled date changed: ${scheduledMatch[1]} → ${newDate}`);
        return;
    }

    // No matching date found
    vscode.window.showWarningMessage("No day heading or SCHEDULED date found on this line.");
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
