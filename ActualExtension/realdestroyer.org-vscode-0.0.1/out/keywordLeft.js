"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const moment = require("moment");
module.exports = function () {
    vscode.commands.executeCommand("workbench.action.files.save").then(() => {
        const { activeTextEditor } = vscode.window;
        if (activeTextEditor && activeTextEditor.document.languageId === 'vso') {
            const { document } = activeTextEditor;
            let characterArray = ['⊖ ', '⊙ ', '⊘ '];
            let position = activeTextEditor.selection.active.line;
            let current_line = document.lineAt(position);
            let nextLine = document.lineAt(position + 1);
            let unicode_char = characterDecode(characterArray);
            let line_leading_spaces = "";
            if (typeof unicode_char === 'string') {
                line_leading_spaces = current_line.text.substr(0, current_line.text.indexOf(unicode_char));
            }
            let text_after_unicode_char = current_line.text.replace(/[⊙⊘⊖\?]/g, '').trim();
            let date;
            let workspaceEdit = new vscode.WorkspaceEdit();
            const keywords = ['TODO', 'IN_PROGRESS', 'DONE', 'ABANDONED', 'COMPLETED'];
            let currentKeywordIndex = keywords.findIndex(keyword => current_line.text.includes(keyword));
            // Check if the char exists on the line
            if (typeof unicode_char === 'string' && current_line.text.includes(unicode_char)) {
                if (currentKeywordIndex !== -1) {
                    let nextKeywordIndex = (currentKeywordIndex - 1 + keywords.length) % keywords.length;
                    let nextKeyword = keywords[nextKeywordIndex];
                    let textWithoutCurrentKeyword = text_after_unicode_char.replace(new RegExp(`\\b(${keywords[currentKeywordIndex]})\\b`), '').trim();
                    workspaceEdit.delete(document.uri, current_line.range);
                    if (nextKeyword === 'DONE') {
                        date = moment().format('Do MMMM YYYY, h:mm:ss a');
                        workspaceEdit.insert(document.uri, current_line.range.start, line_leading_spaces + unicode_char + 'DONE ' + textWithoutCurrentKeyword + '\n   COMPLETED:' + '[' + date + ']');
                    }
                    else {
                        workspaceEdit.insert(document.uri, current_line.range.start, line_leading_spaces + unicode_char + nextKeyword + ' ' + textWithoutCurrentKeyword);
                        if (currentKeywordIndex === keywords.indexOf('DONE') && nextLine.text.includes('COMPLETED')) {
                            workspaceEdit.delete(document.uri, nextLine.range);
                        }
                    }
                    return vscode.workspace.applyEdit(workspaceEdit).then(() => {
                        vscode.commands.executeCommand("workbench.action.files.save");
                    });
                }
                else {
                    // If no keyword is found, default to TODO
                    workspaceEdit.delete(document.uri, current_line.range);
                    workspaceEdit.insert(document.uri, current_line.range.start, line_leading_spaces + unicode_char + 'TODO ' + text_after_unicode_char);
                    return vscode.workspace.applyEdit(workspaceEdit).then(() => {
                        vscode.commands.executeCommand("workbench.action.files.save");
                    });
                }
            }
            function characterDecode(characterArray) {
                const { activeTextEditor } = vscode.window;
                if (activeTextEditor && activeTextEditor.document.languageId === 'vso') {
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
    });
};
//# sourceMappingURL=keywordLeft.js.map