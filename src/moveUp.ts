import * as vscode from "vscode";

export function moveBlockUp(): void {
    vscode.commands.executeCommand("workbench.action.files.save").then(() => {
        const { activeTextEditor } = vscode.window;
        if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
            const { document } = activeTextEditor;
            let characterArray = ["⊖ ", "⊙ ", "⊘ "];
            let char = characterDecode(characterArray);
            let position = activeTextEditor.selection.active.line;
            let currentLineText = document.lineAt(position).text;
            let lineCount = document.lineCount;
            let start = new vscode.Position(position, 0);
            let leadingSpaces = getLeadingSpaces(currentLineText);
            let edit = new vscode.WorkspaceEdit();

            if (currentLineText.includes(char)) {
                let prevLine = position > 0 ? document.lineAt(position - 1) : null;
                if (prevLine && prevLine.text.trim() !== "") {
                    let textToMoveUp = document.getText(new vscode.Range(start, prevLine.range.end));
                    let textToMoveDown = prevLine.text;
                    
                    edit.replace(document.uri, prevLine.range, textToMoveUp);
                    edit.replace(document.uri, new vscode.Range(start, document.lineAt(position).range.end), textToMoveDown);
                    
                    vscode.workspace.applyEdit(edit);
                }
            }
        }
    });
}

function characterDecode(characterArray: string[]): string | undefined {
    const { activeTextEditor } = vscode.window;
    if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
        const { document } = activeTextEditor;
        let position = activeTextEditor.selection.active.line;
        let currentLineText = document.lineAt(position).text;
        return characterArray.find(char => currentLineText.includes(char));
    }
}

function getLeadingSpaces(currentLineText: string): number {
    return currentLineText.search(/\S/);
}
