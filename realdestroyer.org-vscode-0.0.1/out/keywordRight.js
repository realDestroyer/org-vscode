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
    const keywords = ['TODO', 'IN_PROGRESS', 'DONE', 'ABANDONED'];
    const characterArray = ['⊖ ', '⊙ ', '⊘ '];
    const unicodeChar = characterDecode(characterArray, currentLine.text);
    const workspaceEdit = new vscode.WorkspaceEdit();

    if (!unicodeChar) return;

    const leadingSpaces = currentLine.text.slice(0, currentLine.firstNonWhitespaceCharacterIndex);
    let textWithoutUnicode = currentLine.text.replace(/[⊙⊘⊖\?]/g, '').trim();

    let currentKeywordIndex = keywords.findIndex(k => new RegExp(`\\b${k}\\b`).test(textWithoutUnicode));
    let cleanedText = textWithoutUnicode;
    keywords.forEach(k => {
      cleanedText = cleanedText.replace(new RegExp(`\\b${k}\\b`, 'g'), '').trim();
    });

    let nextKeywordIndex = currentKeywordIndex !== -1
      ? (currentKeywordIndex + 1) % keywords.length
      : 0;

    let nextKeyword = keywords[nextKeywordIndex];

    workspaceEdit.delete(document.uri, currentLine.range);

    let newLine = `${leadingSpaces}${unicodeChar}${nextKeyword} ${cleanedText}`;
    if (nextKeyword === 'DONE') {
      const date = moment().format('Do MMMM YYYY, h:mm:ss a');
      const completedLine = leadingSpaces + '  ' + 'COMPLETED:[' + date + ']';
      newLine += `\n${completedLine}`;
    } else if (textWithoutUnicode.includes('DONE') && nextLine.text.includes('COMPLETED')) {
      workspaceEdit.delete(document.uri, nextLine.range);
    }

    workspaceEdit.insert(document.uri, currentLine.range.start, newLine);

    vscode.workspace.applyEdit(workspaceEdit).then(() => {
      vscode.commands.executeCommand("workbench.action.files.save");

      // ✅ Update source file if working inside CurrentTasks.org
      if (document.fileName.includes("CurrentTasks.org")) {
        let originalFile = null;

        // 🔍 Find the nearest ##### Source: <filename> ##### above the current line
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
              if (originalLines[i].includes(cleanedText)) {
                const origLine = originalLines[i];
                const origIndent = origLine.slice(0, origLine.search(/\S/));
                const origUnicode = characterDecode(characterArray, origLine);
                let lineClean = origLine.replace(/[⊙⊘⊖\?]/g, '').trim();
                keywords.forEach(k => {
                  lineClean = lineClean.replace(new RegExp(`\\b${k}\\b`, 'g'), '').trim();
                });

                originalLines[i] = `${origIndent}${origUnicode}${nextKeyword} ${lineClean}`;

                if (nextKeyword === 'DONE' && !originalLines[i + 1]?.includes("COMPLETED")) {
                  const completedStamp = "  COMPLETED:[" + moment().format('Do MMMM YYYY, h:mm:ss a') + "]";
                  originalLines.splice(i + 1, 0, origIndent + completedStamp);
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

    function characterDecode(charArray, lineText) {
      return charArray.find(symbol => lineText.includes(symbol));
    }
  });
};
