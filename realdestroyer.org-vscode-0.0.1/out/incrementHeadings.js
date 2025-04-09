"use strict";
//get number of spaces in front of the unicode char
// get the unicode char
// incrementing increase spaces by 1 and rotate character array to the left
// decrementing is the reverse of increment
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
module.exports = function () {
    const { activeTextEditor } = vscode.window;
    if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
        const { document } = activeTextEditor;
        let direction = "right";
        let characterArray = ["⊖ ", "⊙ ", "⊘ "];
        let position = activeTextEditor.selection.active.line;
        let getCurrentLine = document.lineAt(position);
        let currentLineText = getCurrentLine.text;
        let char = characterDecode(characterArray);
        let getLeadingSpace = currentLineText.substr(0, currentLineText.indexOf(char));
        let newSpaces;
        let convertSpaces = [];
        let newChar;
        let formattedText = currentLineText.replace(/[⊙⊘⊖\?]/g, "").trim();
        increment();
        function increment() {
            if (currentLineText.includes(char)) {
                let edit = new vscode.WorkspaceEdit();
                edit.delete(document.uri, getCurrentLine.range);
                //setting the new char
                if (currentLineText.includes("⊖")) {
                    newChar = "⊙ ";
                }
                if (currentLineText.includes("⊙")) {
                    newChar = "⊘ ";
                }
                if (currentLineText.includes("⊘")) {
                    newChar = "⊖ ";
                }
                if (direction === "right") {
                    //add another space before char
                    for (let i = 0; i <= getLeadingSpace.length; i++) {
                        convertSpaces.push(" ");
                        newSpaces = convertSpaces.join("");
                    }
                    edit.insert(document.uri, getCurrentLine.range.start, newSpaces + newChar + formattedText);
                    vscode.workspace.applyEdit(edit);
                }
            }
        }
        function characterDecode(characterArray) {
            const { activeTextEditor } = vscode.window;
            if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
                const { document } = activeTextEditor;
                let position = activeTextEditor.selection.active.line;
                const getCurrentLine = document.lineAt(position);
                let currentLineText = getCurrentLine.text;
                for (let i = 0; i < characterArray.length; i++) {
                    if (currentLineText.includes(characterArray[i])) {
                        return characterArray[i];
                    }
                }
            }
        }
    }
};
//# sourceMappingURL=incrementHeadings.js.map