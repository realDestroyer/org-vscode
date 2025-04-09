const vscode = require('vscode');

function findDateLines(text) {
    const dateRegex = /⊘ \[\d{2}-\d{2}-\d{4} \w{3}\]/g;
    let match;
    const lines = [];

    while ((match = dateRegex.exec(text)) !== null) {
        lines.push({ match: match[0], index: match.index });
    }

    return lines;
}

function filterLinesWithoutSeparator(lines, text) {
    const separator = '-------------------------------------------------------------------------------------------------------------------------------';
    return lines.filter(line => !text.includes(`${line.match} ${separator}`));
}

function addSeparatorToLines(lines, text) {
    const separator = '-------------------------------------------------------------------------------------------------------------------------------';
    let newText = text;

    lines.forEach(line => {
        newText = newText.replace(line.match, `${line.match} ${separator}`);
    });

    return newText;
}

function addSeparator() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor detected.");
        return;
    }

    console.log('addSeparator function called');
    const document = editor.document;
    const text = document.getText();

    const dateLines = findDateLines(text);
    console.log('Date lines found:', dateLines);

    const linesWithoutSeparator = filterLinesWithoutSeparator(dateLines, text);
    console.log('Lines without separator:', linesWithoutSeparator);

    const newText = addSeparatorToLines(linesWithoutSeparator, text);
    console.log('New text:', newText);

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