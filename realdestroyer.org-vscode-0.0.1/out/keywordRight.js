const vscode = require("vscode");
const moment = require("moment");
const fs = require("fs");
const path = require("path");

module.exports = function () {
  vscode.commands.executeCommand("workbench.action.files.save").then(() => {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== 'vso') return;

    const { document } = activeTextEditor;
    const position = activeTextEditor.selection.active.line;
    const currentLine = document.lineAt(position);
    const nextLine = document.lineAt(position + 1);

    const keywords = ['TODO', 'IN_PROGRESS', 'CONTINUED', 'DONE', 'ABANDONED'];
    const characterArray = ['⊙ ', '⊘ ', '⊜ ', '⊖ ', '⊗ '];
    
    const workspaceEdit = new vscode.WorkspaceEdit();

    const leadingSpaces = currentLine.text.slice(0, currentLine.firstNonWhitespaceCharacterIndex);
    // Remove current symbol and keyword
    let cleanedText = currentLine.text
      .replace(/[⊙⊘⊖⊜⊗]/g, '')
      .replace(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/g, '')
      .trim();

    // Detect current keyword and index
    const keywordMatch = currentLine.text.match(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/);
    const currentKeywordIndex = keywordMatch ? keywords.indexOf(keywordMatch[1]) : -1;


    //  Rotate RIGHT
    const nextKeywordIndex = (currentKeywordIndex + 1) % keywords.length;
    const nextKeyword = keywords[nextKeywordIndex];
    const nextSymbol = characterArray[nextKeywordIndex];

    //  Build updated line
    let newLine = `${leadingSpaces}${nextSymbol}${nextKeyword} ${cleanedText}`;

    //  Add or remove COMPLETED line
    if (nextKeyword === 'DONE') {
      const completedDate = moment().format('Do MMMM YYYY, h:mm:ss a');
      const completedLine = `${leadingSpaces}  COMPLETED:[${completedDate}]`;
      newLine += `\n${completedLine}`;
    } else if (currentLine.text.includes('DONE') && nextLine.text.includes('COMPLETED')) {
      workspaceEdit.delete(document.uri, nextLine.range);
    }

    // Replace current line

    //workspaceEdit.delete(document.uri, currentLine.range);
    //workspaceEdit.insert(document.uri, currentLine.range.start, newLine);
    workspaceEdit.replace(document.uri, currentLine.range, newLine);

    vscode.workspace.applyEdit(workspaceEdit).then(() => {
      vscode.commands.executeCommand("workbench.action.files.save");

      //  If inside CurrentTasks.org, update original file
      if (document.fileName.includes("CurrentTasks.org")) {
        let originalFile = null;
        for (let i = position; i >= 0; i--) {
          const line = document.lineAt(i).text;
          const match = line.match(/^##### Source:\s*(.+\.org)\s*#####$/);
          if (match) {
            originalFile = match[1];
            break;
          }
        }

        if (originalFile) {
          const folderPath = vscode.workspace.getConfiguration("Org-vscode").get("folderPath");
          const fullPath = path.join(folderPath, originalFile);

          if (fs.existsSync(fullPath)) {
            let originalLines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
            for (let i = 0; i < originalLines.length; i++) {
              let line = originalLines[i];

              let lineClean = line
                .replace(/[⊙⊘⊖⊜⊗]/g, '')
                .replace(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/g, '')
                .trim();

              if (lineClean === cleanedText) {
                const origIndent = line.slice(0, line.search(/\S/));
                originalLines[i] = `${origIndent}${nextSymbol}${nextKeyword} ${lineClean}`;

                if (nextKeyword === 'DONE' && !originalLines[i + 1]?.includes("COMPLETED")) {
                  const completedStamp = `${origIndent}  COMPLETED:[${moment().format('Do MMMM YYYY, h:mm:ss a')}]`;
                  originalLines.splice(i + 1, 0, completedStamp);
                } else if (originalLines[i + 1]?.includes("COMPLETED")) {
                  originalLines.splice(i + 1, 1);
                }

                fs.writeFileSync(fullPath, originalLines.join("\n"), "utf8");
                break;
              }
            }
          }
        }
      }
    });
  });
};
