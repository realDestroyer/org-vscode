const vscode = require('vscode');

/**
 * Finds all lines that contain a valid date heading like: ⊘ [05-16-2025 Thu]
 */
function findDateLines(text) {
    const dateRegex = /(?:⊘|\*+)\s*\[\d{2,4}-\d{2}-\d{2,4}\s+\w{3}\]/g;
    let match;
    const lines = [];

    while ((match = dateRegex.exec(text)) !== null) {
        lines.push({ match: match[0], index: match.index });
    }

    return lines;
}

/**
 * Filters out date lines that already have a separator following them
 */
function filterLinesWithoutSeparator(lines, text) {
    const separator = '-------------------------------------------------------------------------------------------------------------------------------';
    return lines.filter(line => !text.includes(`${line.match} ${separator}`));
}

/**
 * Adds a separator line to each date heading that doesn't already have one
 */
function addSeparatorToLines(lines, text) {
    const separator = '-------------------------------------------------------------------------------------------------------------------------------';
    let newText = text;

    lines.forEach(line => {
        newText = newText.replace(line.match, `${line.match} ${separator}`);
    });

    return newText;
}

/**
 * Main function that runs when the user invokes the Add Separator command
 */
function addSeparator() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor detected.");
        return;
    }

    console.log('addSeparator function called');
    const document = editor.document;
    const text = document.getText();

    // Step 1: Find all valid ⊘ [MM-DD-YYYY Day] lines
    const dateLines = findDateLines(text);
    console.log('Date lines found:', dateLines);

    // Step 2: Filter out the ones that already have a separator
    const linesWithoutSeparator = filterLinesWithoutSeparator(dateLines, text);
    console.log('Lines without separator:', linesWithoutSeparator);

    // Step 3: Add separators to those lines
    const newText = addSeparatorToLines(linesWithoutSeparator, text);
    console.log('New text:', newText);

    // Step 4: Replace the document content with updated text
    editor.edit(editBuilder => {
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(text.length)
        );
        editBuilder.replace(fullRange, newText);
    }).then(success => {
        if (success) {
            vscode.window.showInformationMessage('Separator added successfully!');
        } else {
            vscode.window.showErrorMessage('Failed to add separator.');
        }
    });
}

module.exports = addSeparator;
