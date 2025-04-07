"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.incrementHeading = incrementHeading;
const vscode = require("vscode");
const characterDecode_1 = require("./characterDecode");
function incrementHeading() {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== "vso")
        return;
    const { document } = activeTextEditor;
    let position = activeTextEditor.selection.active.line;
    let getCurrentLine = document.lineAt(position);
    let currentLineText = getCurrentLine.text;
    let char = (0, characterDecode_1.characterDecode)(["⊖ ", "⊙ ", "⊘ "]) || ""; // ✅ Ensure `char` is always a string
    let getLeadingSpace = currentLineText.substring(0, currentLineText.indexOf(char));
    let newSpaces = "";
    let convertSpaces = [];
    let newChar = "";
    if (char && currentLineText.includes(char)) {
        let edit = new vscode.WorkspaceEdit();
        edit.delete(document.uri, getCurrentLine.range);
        // Set the new character
        if (currentLineText.includes("⊖"))
            newChar = "⊙ ";
        if (currentLineText.includes("⊙"))
            newChar = "⊘ ";
        if (currentLineText.includes("⊘"))
            newChar = "⊖ ";
        // Add another space before char
        for (let i = 0; i <= getLeadingSpace.length; i++) {
            convertSpaces.push(" ");
        }
        newSpaces = convertSpaces.join("");
        edit.insert(document.uri, getCurrentLine.range.start, newSpaces + newChar + currentLineText.replace(/[⊙⊘⊖\?]/g, "").trim());
        vscode.workspace.applyEdit(edit);
    }
}
//# sourceMappingURL=incrementHeadings.js.map