import * as vscode from "vscode";

export function characterDecode(array: string[] = ["⊖ ", "⊙ ", "⊘ "]): string | undefined {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") return undefined;

    const { document } = activeTextEditor;
    let position = activeTextEditor.selection.active.line;
    let currentLineText = document.lineAt(position).text;

    return array.find(char => currentLineText.includes(char));
}
