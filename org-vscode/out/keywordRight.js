const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const taskKeywordManager = require("./taskKeywordManager");
const continuedTaskHandler = require("./continuedTaskHandler");

module.exports = async function () {
  await vscode.commands.executeCommand("workbench.action.files.save");

  const { activeTextEditor } = vscode.window;
  if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") return;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
  const dateFormat = config.get("dateFormat", "MM-DD-YYYY");

  const { document } = activeTextEditor;
  const selections = (activeTextEditor.selections && activeTextEditor.selections.length)
    ? activeTextEditor.selections
    : [activeTextEditor.selection];

  const targetLines = new Set();
  let hasRangeSelection = false;

  for (const selection of selections) {
    if (selection.isEmpty) {
      targetLines.add(selection.active.line);
      continue;
    }

    hasRangeSelection = true;
    const startLine = Math.min(selection.start.line, selection.end.line);
    let endLine = Math.max(selection.start.line, selection.end.line);
    if (selection.end.character === 0 && endLine > startLine) {
      endLine -= 1;
    }

    for (let line = startLine; line <= endLine; line++) {
      targetLines.add(line);
    }
  }

  const sortedLines = Array.from(targetLines).sort((a, b) => b - a);
  const changesForCurrentTasks = [];

  for (const lineNumber of sortedLines) {
    const currentLine = document.lineAt(lineNumber);
    const nextLine = lineNumber + 1 < document.lineCount ? document.lineAt(lineNumber + 1) : null;

    const keywordMatch = currentLine.text.match(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/);
    if (hasRangeSelection && !keywordMatch) {
      const text = currentLine.text;
      if (!text.trim()) {
        continue;
      }
      // Never convert day headings like `* [MM-DD-YYYY Wed] ...` into tasks.
      if (continuedTaskHandler.DAY_HEADING_REGEX && continuedTaskHandler.DAY_HEADING_REGEX.test(text)) {
        continue;
      }
      // Only allow adding a keyword to actual org headings.
      if (!/^\s*\*+\s+/.test(text)) {
        continue;
      }
    }

    const leadingSpaces = currentLine.text.slice(0, currentLine.firstNonWhitespaceCharacterIndex);
    const starPrefixMatch = currentLine.text.match(/^\s*(\*+)/);
    const starPrefix = starPrefixMatch ? starPrefixMatch[1] : "*";
    const cleanedText = taskKeywordManager.cleanTaskText(currentLine.text);
    const currentKeyword = keywordMatch ? keywordMatch[1] : null;
    const { keyword: nextKeyword } = taskKeywordManager.rotateKeyword(currentKeyword, "right");

    let newLine = taskKeywordManager.buildTaskLine(leadingSpaces, nextKeyword, cleanedText, { headingMarkerStyle, starPrefix });
    const workspaceEdit = new vscode.WorkspaceEdit();

    // Add or remove COMPLETED line
    if (nextKeyword === "DONE") {
      newLine += `\n${taskKeywordManager.buildCompletedStamp(leadingSpaces, dateFormat)}`;
    } else if (currentKeyword === "DONE" && nextLine && nextLine.text.includes("COMPLETED")) {
      workspaceEdit.delete(document.uri, nextLine.range);
    }

    // Handle CONTINUED transitions
    if (nextKeyword === "CONTINUED" && currentKeyword !== "CONTINUED") {
      const forwardEdit = continuedTaskHandler.handleContinuedTransition(document, lineNumber);
      if (forwardEdit && forwardEdit.type === "insert") {
        workspaceEdit.insert(document.uri, forwardEdit.position, forwardEdit.text);
      }
    } else if (currentKeyword === "CONTINUED" && nextKeyword !== "CONTINUED") {
      const removeEdit = continuedTaskHandler.handleContinuedRemoval(document, lineNumber);
      if (removeEdit && removeEdit.type === "delete") {
        workspaceEdit.delete(document.uri, removeEdit.range);
      }
    }

    workspaceEdit.replace(document.uri, currentLine.range, newLine);

    // If inside CurrentTasks.org, capture source mapping BEFORE edits apply
    if (document.fileName.includes("CurrentTasks.org")) {
      let originalFile = null;
      for (let i = lineNumber; i >= 0; i--) {
        const line = document.lineAt(i).text;
        const match = line.match(/^##### Source:\s*(.+\.org)\s*#####$/);
        if (match) {
          originalFile = match[1];
          break;
        }
      }

      if (originalFile) {
        changesForCurrentTasks.push({
          originalFile,
          cleanedText,
          nextKeyword,
          headingMarkerStyle
        });
      }
    }

    await vscode.workspace.applyEdit(workspaceEdit);
  }

  await vscode.commands.executeCommand("workbench.action.files.save");

  // If inside CurrentTasks.org, update original file(s)
  if (document.fileName.includes("CurrentTasks.org") && changesForCurrentTasks.length) {
    const folderPath = config.get("folderPath");

    for (const change of changesForCurrentTasks) {
      const fullPath = path.join(folderPath, change.originalFile);
      if (!fs.existsSync(fullPath)) continue;

      const originalLines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
      for (let i = 0; i < originalLines.length; i++) {
        const line = originalLines[i];
        const lineClean = taskKeywordManager.cleanTaskText(line);
        if (lineClean !== change.cleanedText) continue;

        const origIndent = line.slice(0, line.search(/\S/));
        const origStarPrefixMatch = line.match(/^\s*(\*+)/);
        const origStarPrefix = origStarPrefixMatch ? origStarPrefixMatch[1] : "*";

        originalLines[i] = taskKeywordManager.buildTaskLine(origIndent, change.nextKeyword, lineClean, {
          headingMarkerStyle: change.headingMarkerStyle,
          starPrefix: origStarPrefix
        });

        if (change.nextKeyword === "DONE" && !originalLines[i + 1]?.includes("COMPLETED")) {
          originalLines.splice(i + 1, 0, taskKeywordManager.buildCompletedStamp(origIndent, dateFormat));
        } else if (originalLines[i + 1]?.includes("COMPLETED")) {
          originalLines.splice(i + 1, 1);
        }

        fs.writeFileSync(fullPath, originalLines.join("\n"), "utf8");
        break;
      }
    }
  }
};
