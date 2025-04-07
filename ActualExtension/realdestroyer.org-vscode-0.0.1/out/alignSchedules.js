const vscode = require("vscode");

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

    // **Step 1: Find the longest task length before "SCHEDULED:"**
    for (let i = 0; i < totalLines; i++) {
        let lineText = document.lineAt(i).text;
        let match = lineText.match(/^(\s*)(.*?)(\s+SCHEDULED:)/); // Capture indentation

        if (match) {
            let taskLength = match[2].length; // Measure only the task part, not indentation
            maxTaskLength = Math.max(maxTaskLength, taskLength);
            linesWithScheduled.push({ lineNumber: i, indentation: match[1] }); // Store line number & indentation
        }
    }

    if (linesWithScheduled.length === 0) {
        vscode.window.showWarningMessage("No 'SCHEDULED:' entries found in the file.");
        return;
    }

    const scheduledColumn = maxTaskLength + 4; // Set uniform alignment point

    // **Step 2: Align all "SCHEDULED:" entries while preserving indentation**
    editor.edit(editBuilder => {
        linesWithScheduled.forEach(({ lineNumber, indentation }) => {
            let lineText = document.lineAt(lineNumber).text;
            let match = lineText.match(/^(\s*)(.*?)(\s+SCHEDULED:\s*\[\d{2}-\d{2}-\d{4}\])/);

            if (match) {
                let taskText = match[2].trim();
                let scheduledText = match[3].trim();

                // Pad with spaces to align "SCHEDULED:" while keeping indentation
                let adjustedLine = indentation + taskText.padEnd(scheduledColumn, " ") + scheduledText;
                const fullRange = new vscode.Range(lineNumber, 0, lineNumber, lineText.length);
                editBuilder.replace(fullRange, adjustedLine);
            }
        });
    });

    console.log(`✅ Aligned ${linesWithScheduled.length} scheduled tasks at column ${scheduledColumn} while preserving indentation.`);
    vscode.window.showInformationMessage(`Aligned ${linesWithScheduled.length} scheduled tasks!`);
}

module.exports = {
    alignSchedules
};
