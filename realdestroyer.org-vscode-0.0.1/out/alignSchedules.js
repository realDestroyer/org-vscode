const vscode = require("vscode");

/**
 * This command aligns all SCHEDULED: timestamps to a fixed column width.
 * It improves readability by right-aligning the timestamps in `.org` files.
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

    // 🔍 Step 1: Find lines containing "SCHEDULED:" and measure the longest task description
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
    }

    // ✅ Nothing to align if no scheduled tasks found
    if (linesWithScheduled.length === 0) {
        vscode.window.showWarningMessage("No 'SCHEDULED:' entries found in the file.");
        return;
    }

    // 📏 Step 2: Determine the column to align all SCHEDULED: timestamps to
    const scheduledColumn = maxTaskLength + 4;

    // ✏️ Step 3: Apply alignment to all matching lines
    editor.edit(editBuilder => {
        linesWithScheduled.forEach(({ lineNumber, indentation }) => {
            const lineText = document.lineAt(lineNumber).text;

            // Full match that includes timestamp (e.g. SCHEDULED: [05-16-2025])
            let match = lineText.match(/^(\s*)(.*?)(\s+SCHEDULED:\s*\[\d{2}-\d{2}-\d{4}\])/);

            if (match) {
                const taskText = match[2].trim();            // Clean up task portion
                const scheduledText = match[3].trim();       // SCHEDULED:[MM-DD-YYYY]

                // Pad the task text so all timestamps align to the same column
                const adjustedLine = indentation + taskText.padEnd(scheduledColumn, " ") + scheduledText;

                // Replace the entire original line
                const fullRange = new vscode.Range(lineNumber, 0, lineNumber, lineText.length);
                editBuilder.replace(fullRange, adjustedLine);
            }
        });
    });

    console.log(`✅ Aligned ${linesWithScheduled.length} scheduled tasks at column ${scheduledColumn} while preserving indentation.`);
    vscode.window.showInformationMessage(`Aligned ${linesWithScheduled.length} scheduled tasks!`);
}

// Export the command to be used in extension.js
module.exports = {
    alignSchedules
};
