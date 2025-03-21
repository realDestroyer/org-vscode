import * as vscode from "vscode";

export function moveBlockDown(): void {
    vscode.commands.executeCommand("workbench.action.files.save").then(() => {
        const { activeTextEditor } = vscode.window;
        if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
            const { document } = activeTextEditor;
            let characterArray = ["⊖ ", "⊙ ", "⊘ "];
            let char = characterDecode(characterArray);
            let position = activeTextEditor.selection.active.line;
            let currentLineText = document.lineAt(position).text;
            let leadingSpaces = getLeadingSpaces(currentLineText);
            let edit = new vscode.WorkspaceEdit();

            if (char && currentLineText.includes(char) && position < document.lineCount - 1) {
                let nextLine = document.lineAt(position + 1);

                if (nextLine.text.trim() !== "") {
                    let textToMoveDown = document.getText(new vscode.Range(
                        new vscode.Position(position, 0),
                        new vscode.Position(position + 1, 0)
                    ));
                    let textToMoveUp = nextLine.text;

                    edit.replace(document.uri, nextLine.range, textToMoveDown);
                    edit.replace(document.uri, new vscode.Range(
                        new vscode.Position(position, 0),
                        new vscode.Position(position + 1, 0)
                    ), textToMoveUp);

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
