"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");

// Main function to increment the heading symbol (⨀ style task marker)
module.exports = function () {
    const { activeTextEditor } = vscode.window;
    if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
        const { document } = activeTextEditor;
        // Define task symbol cycle order
        let characterArray = ['⊖ ', '⊙ ', '⊘ ', '⊜ ', '⊗ '];

        // Get current cursor line
        let position = activeTextEditor.selection.active.line;
        let getCurrentLine = document.lineAt(position);
        let currentLineText = getCurrentLine.text;

        // Decode current task symbol from line
        let char = characterDecode(characterArray);

        // Capture leading spaces (indentation) to preserve formatting
        let getLeadingSpace = currentLineText.substr(0, currentLineText.indexOf(char));
        let newSpaces = "";
        let convertSpaces = [];

        // Remove current symbol to isolate task text
        let formattedText = currentLineText.replace(/[⊙⊘⊖⊜⊗\?]/g, "").trim();

        // Prepare workspace edit
        let edit = new vscode.WorkspaceEdit();
        edit.delete(document.uri, getCurrentLine.range);

        // Rotate to next symbol
        let currentIndex = characterArray.indexOf(char);
        let newChar = characterArray[(currentIndex + 1) % characterArray.length];

        // Reapply same indentation
        for (let i = 0; i <= getLeadingSpace.length; i++) {
            convertSpaces.push(" ");
            newSpaces = convertSpaces.join("");
        }

        // Insert updated line with new symbol
        edit.insert(document.uri, getCurrentLine.range.start, newSpaces + newChar + formattedText);
        vscode.workspace.applyEdit(edit);
    }

    // Helper to decode which symbol is currently on the line
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
};