import * as vscode from "vscode";
import { characterDecode } from "./characterDecode";

export function incrementHeading(): void {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") return;

    const { document } = activeTextEditor;
    let position = activeTextEditor.selection.active.line;
    let getCurrentLine = document.lineAt(position);
    let currentLineText = getCurrentLine.text;
    let char = characterDecode(["⊖ ", "⊙ ", "⊘ "]) || ""; // ✅ Ensure `char` is always a string
    let getLeadingSpace = currentLineText.substring(0, currentLineText.indexOf(char));

    let newSpaces = "";
    let convertSpaces: string[] = [];
    let newChar = "";

    if (char && currentLineText.includes(char)) {
        let edit = new vscode.WorkspaceEdit();
        edit.delete(document.uri, getCurrentLine.range);

        // Set the new character
        if (currentLineText.includes("⊖")) newChar = "⊙ ";
        if (currentLineText.includes("⊙")) newChar = "⊘ ";
        if (currentLineText.includes("⊘")) newChar = "⊖ ";

        // Add another space before char
        for (let i = 0; i <= getLeadingSpace.length; i++) {
            convertSpaces.push(" ");
        }
        newSpaces = convertSpaces.join("");

        edit.insert(document.uri, getCurrentLine.range.start, newSpaces + newChar + currentLineText.replace(/[⊙⊘⊖\?]/g, "").trim());
        vscode.workspace.applyEdit(edit);
    }
}
