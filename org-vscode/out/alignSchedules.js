const vscode = require("vscode");
const { isPlanningLine, parsePlanningFromText } = require("./orgTagUtils");

/**
 * This command aligns all SCHEDULED: timestamps to a fixed column width.
 * It improves readability by right-aligning the timestamps in `.org` files.
 * Also preserves DEADLINE: timestamps that may follow SCHEDULED.
 */
function alignSchedules() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor detected.");
        return;
    }

    const document = editor.document;
    const totalLines = document.lineCount;
    let maxTaskLength = 0;
    let linesWithScheduled = [];
    let planningEdits = [];

    // 🔍 Step 1: Find legacy inline "SCHEDULED:" on heading lines (for column alignment)
    // and normalize Emacs-style planning lines below headings.
    for (let i = 0; i < totalLines; i++) {
        let lineText = document.lineAt(i).text;

        // Capture optional indentation, task text, and the "SCHEDULED:" keyword
        let match = lineText.match(/^(\s*)(.*?)(\s+SCHEDULED:)/);

        if (match) {
            let taskLength = match[2].length;
            maxTaskLength = Math.max(maxTaskLength, taskLength);

            // Store only the lines we want to modify later
            linesWithScheduled.push({ lineNumber: i, indentation: match[1] });
        }

        // Emacs-style: if this is a task headline, normalize the immediate planning line.
        const taskPrefixRegex = /^\s*(?:[⊙⊘⊜⊖⊗]\s*)?(?:\*+\s+)?(?:TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/;
        if (taskPrefixRegex.test(lineText) && i + 1 < totalLines) {
            const nextLine = document.lineAt(i + 1).text;
            if (isPlanningLine(nextLine) && (nextLine.includes("SCHEDULED:") || nextLine.includes("DEADLINE:") || nextLine.includes("CLOSED:") || nextLine.includes("COMPLETED"))) {
                const headlineIndent = lineText.match(/^\s*/)?.[0] || "";
                const planningIndent = `${headlineIndent}  `;
                const planning = parsePlanningFromText(nextLine);
                const parts = [];
                if (planning.scheduled) parts.push(`SCHEDULED: [${planning.scheduled}]`);
                if (planning.deadline) parts.push(`DEADLINE: [${planning.deadline}]`);
                if (planning.closed) parts.push(`CLOSED: [${planning.closed}]`);
                const normalized = parts.join("  ");
                if (normalized) {
                    const desired = `${planningIndent}${normalized}`;
                    if (desired !== nextLine) {
                        planningEdits.push({ lineNumber: i + 1, newText: desired });
                    }
                }
            }
        }
    }

    // ✅ Nothing to align/normalize if no entries found
    if (linesWithScheduled.length === 0 && planningEdits.length === 0) {
        vscode.window.showWarningMessage("No 'SCHEDULED:' entries found in the file.");
        return;
    }

    // 📏 Step 2: Determine the column to align all *inline* SCHEDULED: timestamps to
    const scheduledColumn = maxTaskLength + 4;

    // ✏️ Step 3: Apply edits
    editor.edit(editBuilder => {
        planningEdits.forEach(({ lineNumber, newText }) => {
            const lineText = document.lineAt(lineNumber).text;
            const fullRange = new vscode.Range(lineNumber, 0, lineNumber, lineText.length);
            editBuilder.replace(fullRange, newText);
        });

        linesWithScheduled.forEach(({ lineNumber, indentation }) => {
            const lineText = document.lineAt(lineNumber).text;

            // Full match that includes SCHEDULED timestamp and optional DEADLINE
            // Pattern: task text + SCHEDULED: [date] + optional DEADLINE: [date]
            let match = lineText.match(/^(\s*)(.*?)(\s+SCHEDULED:\s*\[\d{2,4}-\d{2}-\d{2,4}\])(\s+DEADLINE:\s*\[\d{2,4}-\d{2}-\d{2,4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?\])?/);

            if (match) {
                const taskText = match[2].trim();            // Clean up task portion
                const scheduledText = match[3].trim();       // SCHEDULED:[MM-DD-YYYY]
                const deadlineText = match[4] ? match[4].trim() : "";  // DEADLINE:[MM-DD-YYYY] if present

                // Pad the task text so all timestamps align to the same column
                let adjustedLine = indentation + taskText.padEnd(scheduledColumn, " ") + scheduledText;
                
                // Append DEADLINE if it was present
                if (deadlineText) {
                    adjustedLine += "    " + deadlineText;
                }

                // Replace the entire original line
                const fullRange = new vscode.Range(lineNumber, 0, lineNumber, lineText.length);
                editBuilder.replace(fullRange, adjustedLine);
            }
        });
    });

    const normalizedCount = planningEdits.length;
    const alignedCount = linesWithScheduled.length;
    console.log(`✅ Updated schedules: ${alignedCount} aligned, ${normalizedCount} planning lines normalized.`);
    vscode.window.showInformationMessage(`Updated schedules: ${alignedCount} aligned, ${normalizedCount} normalized.`);
}

// Export the command to be used in extension.js
module.exports = {
    alignSchedules
};
