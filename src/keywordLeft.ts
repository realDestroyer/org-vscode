import * as vscode from "vscode";
import * as moment from "moment";

export function toggleKeywordLeft(): void {
    vscode.commands.executeCommand("workbench.action.files.save").then(() => {
        const { activeTextEditor } = vscode.window;
        if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") {
            return;
        }

        const { document } = activeTextEditor;
        const characterArray = ['⊖ ', '⊙ ', '⊘ '];
        const position = activeTextEditor.selection.active.line;
        const currentLine = document.lineAt(position);
        const nextLine = position + 1 < document.lineCount ? document.lineAt(position + 1) : null;
        const unicodeChar = characterDecode(characterArray, currentLine.text);
        
        if (!unicodeChar) return;

        const lineLeadingSpaces = currentLine.text.substring(0, currentLine.text.indexOf(unicodeChar));
        const textAfterUnicode = currentLine.text.replace(/[⊙⊘⊖\?]/g, '').trim();
        let workspaceEdit = new vscode.WorkspaceEdit();
        
        const keywords = ['TODO', 'IN_PROGRESS', 'DONE', 'ABANDONED', 'COMPLETED'];
        const currentKeywordIndex = keywords.findIndex(keyword => currentLine.text.includes(keyword));
        
        if (currentKeywordIndex !== -1) {
            const previousKeywordIndex = (currentKeywordIndex - 1 + keywords.length) % keywords.length;
            const previousKeyword = keywords[previousKeywordIndex];
            const textWithoutCurrentKeyword = textAfterUnicode.replace(new RegExp(`\\b(${keywords[currentKeywordIndex]})\\b`), '').trim();
            workspaceEdit.delete(document.uri, currentLine.range);
            
            if (previousKeyword === 'DONE') {
                const date = moment().format('Do MMMM YYYY, h:mm:ss a');
                workspaceEdit.insert(document.uri, currentLine.range.start, `${lineLeadingSpaces}${unicodeChar}DONE ${textWithoutCurrentKeyword}\n   COMPLETED: [${date}]`);
            } else {
                workspaceEdit.insert(document.uri, currentLine.range.start, `${lineLeadingSpaces}${unicodeChar}${previousKeyword} ${textWithoutCurrentKeyword}`);
                if (currentKeywordIndex === keywords.indexOf('DONE') && nextLine?.text.includes('COMPLETED')) {
                    workspaceEdit.delete(document.uri, nextLine.range);
                }
            }
            vscode.workspace.applyEdit(workspaceEdit).then(() => {
                vscode.commands.executeCommand("workbench.action.files.save");
            });
        } else {
            workspaceEdit.delete(document.uri, currentLine.range);
            workspaceEdit.insert(document.uri, currentLine.range.start, `${lineLeadingSpaces}${unicodeChar}TODO ${textAfterUnicode}`);
            vscode.workspace.applyEdit(workspaceEdit).then(() => {
                vscode.commands.executeCommand("workbench.action.files.save");
            });
        }
    });
}

function characterDecode(characterArray: string[], text: string): string | undefined {
    return characterArray.find(char => text.includes(char));
}
