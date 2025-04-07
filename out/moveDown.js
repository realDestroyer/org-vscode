"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveBlockDown = moveBlockDown;
const vscode = require("vscode");
const characterDecode_1 = require("./characterDecode");
function moveBlockDown() {
    vscode.commands.executeCommand("workbench.action.files.save").then(() => {
        const { activeTextEditor } = vscode.window;
        if (!activeTextEditor || activeTextEditor.document.languageId !== "vso")
            return;
        const { document } = activeTextEditor;
        let characterArray = ["⊖ ", "⊙ ", "⊘ "];
        let char = (0, characterDecode_1.characterDecode)(characterArray) || "";
        let position = activeTextEditor.selection.active.line;
        let currentLineText = document.lineAt(position).text;
        let edit = new vscode.WorkspaceEdit();
        if (char && currentLineText.includes(char) && position < document.lineCount - 1) {
            let nextLine = document.lineAt(position + 1);
            if (nextLine.text.trim() !== "") {
                let textToMoveDown = document.getText(new vscode.Range(new vscode.Position(position, 0), new vscode.Position(position + 1, 0)));
                let textToMoveUp = nextLine.text;
                edit.replace(document.uri, nextLine.range, textToMoveDown);
                edit.replace(document.uri, new vscode.Range(new vscode.Position(position, 0), new vscode.Position(position + 1, 0)), textToMoveUp);
                vscode.workspace.applyEdit(edit);
            }
        }
    });
}
//# sourceMappingURL=moveDown.js.map