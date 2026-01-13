"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const showMessage_1 = require("./showMessage");
const moment = require("moment");
const { isPlanningLine, normalizeTagsAfterPlanning, DAY_HEADING_REGEX, getTaskPrefixRegex, SCHEDULED_STRIP_RE, DEADLINE_REGEX } = require("./orgTagUtils");
module.exports = function () {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") {
        return;
    }
    const { document } = activeTextEditor;

    const dayHeadingRegex = DAY_HEADING_REGEX;
    const taskPrefixRegex = getTaskPrefixRegex();

    const selections = (activeTextEditor.selections && activeTextEditor.selections.length)
        ? activeTextEditor.selections
        : [activeTextEditor.selection];
    const targetLines = new Set();
    let hasRangeSelection = false;
    for (const selection of selections) {
        if (selection.isEmpty) {
            targetLines.add(selection.active.line);
            continue;
        }
        hasRangeSelection = true;
        const startLine = Math.min(selection.start.line, selection.end.line);
        let endLine = Math.max(selection.start.line, selection.end.line);
        if (selection.end.character === 0 && endLine > startLine) {
            endLine -= 1;
        }
        for (let line = startLine; line <= endLine; line++) {
            const lineText = document.lineAt(line).text;
            if (taskPrefixRegex.test(lineText) && !dayHeadingRegex.test(lineText)) {
                targetLines.add(line);
            }
        }
    }
    const sortedLines = Array.from(targetLines).sort((a, b) => b - a);
    let workspaceEdit = new vscode.WorkspaceEdit();
    const config = vscode.workspace.getConfiguration("Org-vscode");
    const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
    // Messages
    const fullDateMessage = new showMessage_1.WindowMessage("warning", "Full date must be entered", false, false);
    const notADateMessage = new showMessage_1.WindowMessage("warning", "That's not a valid date.", false, false);
    const linesToRemove = [];
    const linesToAdd = [];

    for (const lineNumber of sortedLines) {
        const lineText = document.lineAt(lineNumber).text;
        const nextLineText = (lineNumber + 1 < document.lineCount)
            ? document.lineAt(lineNumber + 1).text
            : "";
        if (!lineText.trim()) {
            continue;
        }
        if (dayHeadingRegex.test(lineText)) {
            continue;
        }
        const hasScheduled = lineText.includes("SCHEDULED:") || (isPlanningLine(nextLineText) && nextLineText.includes("SCHEDULED:"));
        if (hasScheduled) {
            linesToRemove.push(lineNumber);
            continue;
        }
        if (hasRangeSelection && !taskPrefixRegex.test(lineText)) {
            continue;
        }
        linesToAdd.push(lineNumber);
    }

    // Maintain existing single-cursor toggle behavior (remove SCHEDULED without prompting).
    if (!hasRangeSelection && linesToRemove.length === 1 && linesToAdd.length === 0) {
        const lineNumber = linesToRemove[0];
        const currentLine = document.lineAt(lineNumber);
        const removeScheduled = normalizeTagsAfterPlanning(currentLine.text)
            .replace(SCHEDULED_STRIP_RE, "")
            .trimRight();
        workspaceEdit.replace(document.uri, currentLine.range, removeScheduled);

        // Also remove planning-line SCHEDULED if it exists on the next line.
        if (lineNumber + 1 < document.lineCount) {
            const nextLine = document.lineAt(lineNumber + 1);
            if (isPlanningLine(nextLine.text) && nextLine.text.includes("SCHEDULED:")) {
                const indent = nextLine.text.match(/^\s*/)?.[0] || "";
                const body = nextLine.text.trim()
                    .replace(SCHEDULED_STRIP_RE, "")
                    .replace(/\s{2,}/g, " ")
                    .trim();
                if (!body) {
                    workspaceEdit.delete(document.uri, nextLine.rangeIncludingLineBreak);
                }
                else {
                    workspaceEdit.replace(document.uri, nextLine.range, `${indent}${body}`);
                }
            }
        }
        return vscode.workspace.applyEdit(workspaceEdit);
    }
    async function getInput(prompt, placeHolder) {
        return await vscode.window.showInputBox({ prompt, placeHolder });
    }
    (async function () {
        // 1) Remove any existing SCHEDULED tags in selection.
        for (const lineNumber of linesToRemove) {
            const currentLine = document.lineAt(lineNumber);
            const cleanedHeadline = normalizeTagsAfterPlanning(currentLine.text)
                .replace(SCHEDULED_STRIP_RE, "")
                .trimRight();
            workspaceEdit.replace(document.uri, currentLine.range, cleanedHeadline);

            if (lineNumber + 1 < document.lineCount) {
                const nextLine = document.lineAt(lineNumber + 1);
                if (isPlanningLine(nextLine.text) && nextLine.text.includes("SCHEDULED:")) {
                    const indent = nextLine.text.match(/^\s*/)?.[0] || "";
                    const body = nextLine.text.trim()
                        .replace(SCHEDULED_STRIP_RE, "")
                        .replace(/\s{2,}/g, " ")
                        .trim();
                    if (!body) {
                        workspaceEdit.delete(document.uri, nextLine.rangeIncludingLineBreak);
                    }
                    else {
                        workspaceEdit.replace(document.uri, nextLine.range, `${indent}${body}`);
                    }
                }
            }
        }

        // 2) Add SCHEDULED tag to eligible lines (prompt once).
        if (linesToAdd.length > 0) {
            const month = await getInput("Enter the month (MM) you want to schedule:", "Example: 08 for August");
            if (!month || month.length > 2 || !isValidMonth(month)) {
                return fullDateMessage.showMessage();
            }

            const day = await getInput("Enter the day (DD) you want to schedule:", "Example: 08 for the eighth");
            const year = await getInput("Enter the year (YYYY) you want to schedule:", "Example: 2025");

            if (!day || day.length > 2 || !year || year.length !== 4 || !isValidDay(day, month, year)) {
                return notADateMessage.showMessage();
            }

            const formattedDate = moment(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`, "YYYY-MM-DD", true).format(dateFormat);
            const scheduledTag = `SCHEDULED: [${formattedDate}]`;

            for (const lineNumber of linesToAdd) {
                const currentLine = document.lineAt(lineNumber);
                const headlineText = normalizeTagsAfterPlanning(currentLine.text)
                    .replace(SCHEDULED_STRIP_RE, "")
                    .trimRight();
                workspaceEdit.replace(document.uri, currentLine.range, headlineText);

                const headlineIndent = headlineText.match(/^\s*/)?.[0] || "";
                const planningIndent = `${headlineIndent}  `;

                const hasNext = (lineNumber + 1 < document.lineCount);
                const nextLine = hasNext ? document.lineAt(lineNumber + 1) : null;

                if (nextLine && isPlanningLine(nextLine.text)) {
                    // Upsert SCHEDULED into existing planning line, keeping it before DEADLINE when present.
                    const indent = nextLine.text.match(/^\s*/)?.[0] || planningIndent;
                    let body = nextLine.text.trim()
                        .replace(SCHEDULED_STRIP_RE, "")
                        .replace(/\s{2,}/g, " ")
                        .trim();

                    if (DEADLINE_REGEX.test(body)) {
                        body = body.replace(DEADLINE_REGEX, `${scheduledTag}  $&`);
                    }
                    else {
                        body = body ? `${body}  ${scheduledTag}` : scheduledTag;
                    }

                    workspaceEdit.replace(document.uri, nextLine.range, `${indent}${body}`);
                }
                else {
                    // Insert a new planning line immediately below the headline.
                    workspaceEdit.insert(document.uri, currentLine.range.end, `\n${planningIndent}${scheduledTag}`);
                }
            }
        }

        if (linesToRemove.length === 0 && linesToAdd.length === 0) {
            vscode.window.showWarningMessage("No task lines found to schedule.");
            return;
        }

        await vscode.workspace.applyEdit(workspaceEdit);
        vscode.commands.executeCommand("workbench.action.files.save");
    })();
    
    function isValidMonth(input) {
        let num = parseInt(input, 10);
        return num >= 1 && num <= 12;
    }

    function isValidDay(input, month, year) {
        let num = parseInt(input, 10);
        let maxDays = new Date(parseInt(year, 10), parseInt(month, 10), 0).getDate();
        return num >= 1 && num <= maxDays;
    }
};
//# sourceMappingURL=scheduling.js.map