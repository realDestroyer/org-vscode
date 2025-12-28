"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const moment = require("moment");
const showMessage_1 = require("./showMessage");

module.exports = function () {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") {
        return;
    }
    const { document } = activeTextEditor;

    const config = vscode.workspace.getConfiguration("Org-vscode");
    const dateFormat = config.get("dateFormat", "YYYY-MM-DD");

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
            targetLines.add(line);
        }
    }
    const sortedLines = Array.from(targetLines).sort((a, b) => b - a);
    let workspaceEdit = new vscode.WorkspaceEdit();

    // Messages
    const fullDateMessage = new showMessage_1.WindowMessage("warning", "Full date must be entered", false, false);
    const notADateMessage = new showMessage_1.WindowMessage("warning", "That's not a valid date.", false, false);

    const dayHeadingRegex = /^\s*(⊘|\*+)\s*\[\d{2,4}-\d{2}-\d{2,4}\s+[A-Za-z]{3}\]/;
    const taskPrefixRegex = /^\s*(?:[⊙⊘⊜⊖⊗]\s*)?(?:\*+\s+)?(?:TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/;

    const linesToRemove = [];
    const linesToAdd = [];
    for (const lineNumber of sortedLines) {
        const lineText = document.lineAt(lineNumber).text;
        if (!lineText.trim()) {
            continue;
        }
        if (dayHeadingRegex.test(lineText)) {
            continue;
        }
        if (lineText.includes("DEADLINE:")) {
            linesToRemove.push(lineNumber);
            continue;
        }
        if (hasRangeSelection && !taskPrefixRegex.test(lineText)) {
            continue;
        }
        linesToAdd.push(lineNumber);
    }

    // Maintain existing single-cursor toggle behavior (remove DEADLINE without prompting).
    if (!hasRangeSelection && linesToRemove.length === 1 && linesToAdd.length === 0) {
        const lineNumber = linesToRemove[0];
        const currentLine = document.lineAt(lineNumber);
        const removeDeadline = currentLine.text
            .replace(/\s*DEADLINE:\s*\[[^\]]*\]/, "")
            .trimRight();
        workspaceEdit.replace(document.uri, currentLine.range, removeDeadline);
        return vscode.workspace.applyEdit(workspaceEdit);
    }

    async function getInput(prompt, placeHolder) {
        return await vscode.window.showInputBox({ prompt, placeHolder });
    }

    (async function () {
        // 1) Remove any existing DEADLINE tags in selection.
        for (const lineNumber of linesToRemove) {
            const currentLine = document.lineAt(lineNumber);
            const removeDeadline = currentLine.text
                .replace(/\s*DEADLINE:\s*\[[^\]]*\]/, "")
                .trimRight();
            workspaceEdit.replace(document.uri, currentLine.range, removeDeadline);
        }

        // 2) Add DEADLINE tag to eligible lines (prompt once).
        if (linesToAdd.length > 0) {
            const month = await getInput("Enter the deadline month (MM):", "Example: 12 for December");
            if (!month || month.length > 2 || !isValidMonth(month)) {
                return fullDateMessage.showMessage();
            }

            const day = await getInput("Enter the deadline day (DD):", "Example: 25");
            const year = await getInput("Enter the deadline year (YYYY):", "Example: 2025");

            if (!day || day.length > 2 || !year || year.length !== 4 || !isValidDay(day, month, year)) {
                return notADateMessage.showMessage();
            }

            const formattedDate = moment(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`, "YYYY-MM-DD", true).format(dateFormat);
            for (const lineNumber of linesToAdd) {
                const currentLine = document.lineAt(lineNumber);
                let newLineText = currentLine.text;
                if (currentLine.text.includes("SCHEDULED:")) {
                    newLineText = currentLine.text.replace(/(SCHEDULED:\s*\[[^\]]*\])/, `$1    DEADLINE: [${formattedDate}]`);
                }
                else {
                    newLineText = `${currentLine.text}    DEADLINE: [${formattedDate}]`;
                }
                workspaceEdit.replace(document.uri, currentLine.range, newLineText);
            }
        }

        if (linesToRemove.length === 0 && linesToAdd.length === 0) {
            vscode.window.showWarningMessage("No task lines found to add/remove a deadline.");
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
