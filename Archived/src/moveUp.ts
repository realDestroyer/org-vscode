import * as vscode from "vscode";
import { characterDecode } from "./characterDecode";

export function moveBlockUp(): void {
    vscode.commands.executeCommand("workbench.action.files.save").then(() => {
        const { activeTextEditor } = vscode.window;
        if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") return;

        const { document } = activeTextEditor;
        let characterArray = ["⊖ ", "⊙ ", "⊘ "];
        let char = characterDecode(characterArray) || ""; // ✅ Ensure char is always a string
        let position = activeTextEditor.selection.active.line;
        let currentLineText = document.lineAt(position).text;
        let edit = new vscode.WorkspaceEdit();

        if (char && currentLineText.includes(char) && position > 0) {
            let prevLine = document.lineAt(position - 1);

            if (prevLine.text.trim() !== "") {
                let textToMoveUp = document.getText(new vscode.Range(
                    new vscode.Position(position, 0),
                    new vscode.Position(position - 1, 0)
                ));
                let textToMoveDown = prevLine.text;

                edit.replace(document.uri, prevLine.range, textToMoveUp);
                edit.replace(document.uri, new vscode.Range(
                    new vscode.Position(position, 0),
                    new vscode.Position(position - 1, 0)
                ), textToMoveDown);

                vscode.workspace.applyEdit(edit);
            }
        }
    });
}
