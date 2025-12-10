const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const taskKeywordManager = require("./taskKeywordManager");
const continuedTaskHandler = require("./continuedTaskHandler");

module.exports = function () {
  vscode.commands.executeCommand("workbench.action.files.save").then(() => {
    const { activeTextEditor } = vscode.window;
    if (!activeTextEditor || activeTextEditor.document.languageId !== 'vso') return;

    const { document } = activeTextEditor;
    const position = activeTextEditor.selection.active.line;
    const currentLine = document.lineAt(position);
    const nextLine = position + 1 < document.lineCount ? document.lineAt(position + 1) : null;

    const workspaceEdit = new vscode.WorkspaceEdit();
    const leadingSpaces = currentLine.text.slice(0, currentLine.firstNonWhitespaceCharacterIndex);
    const cleanedText = taskKeywordManager.cleanTaskText(currentLine.text);
    const keywordMatch = currentLine.text.match(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/);
    let currentKeyword = keywordMatch ? keywordMatch[1] : null;
    const { keyword: nextKeyword, symbol: nextSymbol } = taskKeywordManager.rotateKeyword(currentKeyword, "left");
    let newLine = taskKeywordManager.buildTaskLine(leadingSpaces, nextKeyword, cleanedText);
    
    // Add or remove COMPLETED line
    if (nextKeyword === 'DONE') {
      newLine += `\n${taskKeywordManager.buildCompletedStamp(leadingSpaces)}`;
    } else if (currentKeyword === 'DONE' && nextLine && nextLine.text.includes('COMPLETED')) {
      workspaceEdit.delete(document.uri, nextLine.range);
    }
    
    // Handle CONTINUED transitions
    if (nextKeyword === 'CONTINUED' && currentKeyword !== 'CONTINUED') {
      // Transitioning TO CONTINUED - forward task to next day
      const forwardEdit = continuedTaskHandler.handleContinuedTransition(document, position);
      if (forwardEdit) {
        if (forwardEdit.type === "insert") {
          workspaceEdit.insert(document.uri, forwardEdit.position, forwardEdit.text);
        }
      }
    } else if (currentKeyword === 'CONTINUED' && nextKeyword !== 'CONTINUED') {
      // Transitioning FROM CONTINUED - remove forwarded task
      const removeEdit = continuedTaskHandler.handleContinuedRemoval(document, position);
      if (removeEdit) {
        if (removeEdit.type === "delete") {
          workspaceEdit.delete(document.uri, removeEdit.range);
        }
      }
    }
    
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

              let lineClean = taskKeywordManager.cleanTaskText(line);
              if (lineClean === cleanedText) {
                const origIndent = line.slice(0, line.search(/\S/));
                originalLines[i] = taskKeywordManager.buildTaskLine(origIndent, nextKeyword, lineClean);
                if (nextKeyword === 'DONE' && !originalLines[i + 1]?.includes("COMPLETED")) {
                  originalLines.splice(i + 1, 0, taskKeywordManager.buildCompletedStamp(origIndent));
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
