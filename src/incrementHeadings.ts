import * as vscode from "vscode";

export function incrementHeading(): void {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") return;

    const { document } = activeTextEditor;
    let characterArray = ["⊖ ", "⊙ ", "⊘ "];
    let position = activeTextEditor.selection.active.line;
    let getCurrentLine = document.lineAt(position);
    let currentLineText = getCurrentLine.text;
    let char = characterDecode(characterArray);
    let getLeadingSpace = currentLineText.substr(0, currentLineText.indexOf(char));
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

function characterDecode(characterArray: string[]): string | undefined {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") return;

    const { document } = activeTextEditor;
    let position = activeTextEditor.selection.active.line;
    let currentLineText = document.lineAt(position).text;

    return characterArray.find(char => currentLineText.includes(char));
}
