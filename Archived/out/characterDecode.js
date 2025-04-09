"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.characterDecode = characterDecode;
const vscode = require("vscode");
function characterDecode(array = ["⊖ ", "⊙ ", "⊘ "]) {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== "vso")
        return undefined;
    const { document } = activeTextEditor;
    let position = activeTextEditor.selection.active.line;
    let currentLineText = document.lineAt(position).text;
    return array.find(char => currentLineText.includes(char));
}
//# sourceMappingURL=characterDecode.js.map