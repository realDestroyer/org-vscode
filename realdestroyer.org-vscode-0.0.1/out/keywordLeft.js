// keywordLeft.js - Updated to properly indent COMPLETED line
const vscode = require("vscode");
const moment = require("moment");

module.exports = function () {
  vscode.commands.executeCommand("workbench.action.files.save").then(() => {
    const { activeTextEditor } = vscode.window;
    if (activeTextEditor && activeTextEditor.document.languageId === 'vso') {
      const { document } = activeTextEditor;
      const position = activeTextEditor.selection.active.line;
      const currentLine = document.lineAt(position);
      const nextLine = document.lineAt(position + 1);
      const keywords = ['TODO', 'IN_PROGRESS', 'DONE', 'ABANDONED', 'COMPLETED'];
      const characterArray = ['⊖ ', '⊙ ', '⊘ '];
      const unicodeChar = characterDecode(characterArray, currentLine.text);

      let leadingSpaces = currentLine.text.slice(0, currentLine.firstNonWhitespaceCharacterIndex);
      let textWithoutUnicode = currentLine.text.replace(/[⊙⊘⊖\?]/g, '').trim();
      let currentKeywordIndex = keywords.findIndex(k => currentLine.text.includes(k));

      const workspaceEdit = new vscode.WorkspaceEdit();
      if (unicodeChar && currentKeywordIndex !== -1) {
        let nextKeywordIndex = (currentKeywordIndex - 1 + keywords.length) % keywords.length;
        let nextKeyword = keywords[nextKeywordIndex];
        let textWithoutKeyword = textWithoutUnicode.replace(new RegExp(`\\b(${keywords[currentKeywordIndex]})\\b`), '').trim();
        workspaceEdit.delete(document.uri, currentLine.range);

        if (nextKeyword === 'DONE') {
          const date = moment().format('Do MMMM YYYY, h:mm:ss a');
          const completedLine = leadingSpaces + '  ' + 'COMPLETED:[' + date + ']';
          const newLine = `${leadingSpaces}${unicodeChar}DONE ${textWithoutKeyword}\n${completedLine}`;
          workspaceEdit.insert(document.uri, currentLine.range.start, newLine);
        } else {
          const newLine = `${leadingSpaces}${unicodeChar}${nextKeyword} ${textWithoutKeyword}`;
          workspaceEdit.insert(document.uri, currentLine.range.start, newLine);

          if (currentKeywordIndex === keywords.indexOf('DONE') && nextLine.text.includes('COMPLETED')) {
            workspaceEdit.delete(document.uri, nextLine.range);
          }
        }

        vscode.workspace.applyEdit(workspaceEdit).then(() => {
          vscode.commands.executeCommand("workbench.action.files.save");
        });
      }

      function characterDecode(charArray, lineText) {
        return charArray.find(symbol => lineText.includes(symbol));
      }
    }
  });
};
