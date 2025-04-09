"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
module.exports = function (array = ["⊖ ", "⊙ ", "⊘ "]) {
    const { activeTextEditor } = vscode.window;
    if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
        const { document } = activeTextEditor;
        let position = activeTextEditor.selection.active.line;
        const getCurrentLine = document.lineAt(position);
        let currentLineText = getCurrentLine.text;
        for (let i = 0; i < array.length; i++) {
            if (currentLineText.includes(array[i])) {
                return array[i];
            }
        }
    }
};
//# sourceMappingURL=characterDecode.js.map