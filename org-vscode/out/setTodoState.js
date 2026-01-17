const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const taskKeywordManager = require("./taskKeywordManager");
const continuedTaskHandler = require("./continuedTaskHandler");
const moment = require("moment");
const { isPlanningLine, parsePlanningFromText, normalizeTagsAfterPlanning, stripInlinePlanning } = require("./orgTagUtils");
const { applyRepeatersOnCompletion } = require("./repeatedTasks");
const { computeLogbookInsertion, formatStateChangeEntry } = require("./orgLogbook");
const { normalizeBodyIndentation } = require("./indentUtils");

function buildPlanningBody(planning) {
  const parts = [];
  if (planning?.scheduled) parts.push(`SCHEDULED: [${planning.scheduled}]`);
  if (planning?.deadline) parts.push(`DEADLINE: [${planning.deadline}]`);
  if (planning?.closed) parts.push(`CLOSED: [${planning.closed}]`);
  return parts.join("  ");
}

module.exports = async function () {
  await vscode.commands.executeCommand("workbench.action.files.save");

  const { activeTextEditor } = vscode.window;
  if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") return;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);
  const logIntoDrawer = config.get("logIntoDrawer", false);
  const logDrawerName = config.get("logDrawerName", "LOGBOOK");
  const workflowRegistry = taskKeywordManager.getWorkflowRegistry();

  const cycleKeywords = workflowRegistry.getCycleKeywords();
  if (!cycleKeywords || cycleKeywords.length === 0) {
    await vscode.window.showErrorMessage("Org-vscode: No workflow states configured.");
    return;
  }

  const pickItems = cycleKeywords.map((keyword) => {
    const marker = taskKeywordManager.getSymbolForKeyword(keyword);
    return {
      label: keyword,
      description: marker ? marker.trim() : "",
      detail: workflowRegistry.isDoneLike(keyword) ? "done-like" : ""
    };
  });

  const selected = await vscode.window.showQuickPick(pickItems, {
    placeHolder: "Set TODO state",
    matchOnDescription: true,
    matchOnDetail: true
  });
  if (!selected) return;

  const targetKeyword = selected.label;

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
    const nextNextLine = lineNumber + 2 < document.lineCount ? document.lineAt(lineNumber + 2) : null;

    const currentKeyword = taskKeywordManager.findTaskKeyword(currentLine.text);
    if (hasRangeSelection && !currentKeyword) {
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

    const planningFromHeadline = parsePlanningFromText(currentLine.text);
    const planningFromNext = (nextLine && isPlanningLine(nextLine.text)) ? parsePlanningFromText(nextLine.text) : {};
    const planningFromNextNext = (nextNextLine && isPlanningLine(nextNextLine.text)) ? parsePlanningFromText(nextNextLine.text) : {};

    const mergedPlanning = {
      scheduled: planningFromNext.scheduled || planningFromHeadline.scheduled || null,
      deadline: planningFromNext.deadline || planningFromHeadline.deadline || null,
      // Prefer CLOSED; accept legacy COMPLETED from any parsed source.
      closed: planningFromNext.closed || planningFromHeadline.closed || planningFromNextNext.closed || null
    };

    const headlineNoPlanning = stripInlinePlanning(normalizeTagsAfterPlanning(currentLine.text));
    const cleanedText = taskKeywordManager.cleanTaskText(headlineNoPlanning);

    const workspaceEdit = new vscode.WorkspaceEdit();

    const completionTransition = workflowRegistry.isDoneLike(targetKeyword) && !workflowRegistry.isDoneLike(currentKeyword);
    const completionStampsClosed = workflowRegistry.stampsClosed(targetKeyword);

    const completionTimestamp = moment().format(`${dateFormat} ddd HH:mm`);

    // Upsert/remove CLOSED in the planning line (preferred: single planning line under the headline).
    if (completionStampsClosed) {
      mergedPlanning.closed = completionTimestamp;
    } else if (workflowRegistry.stampsClosed(currentKeyword)) {
      mergedPlanning.closed = null;
    }

    let effectiveKeyword = targetKeyword;
    if (completionTransition) {
      const lines = document.getText().split(/\r?\n/);

      // Org-mode style logging into a drawer (LOGBOOK) for completion transitions.
      if (logIntoDrawer && completionStampsClosed) {
        const entry = formatStateChangeEntry({
          fromKeyword: currentKeyword,
          toKeyword: targetKeyword,
          timestamp: completionTimestamp
        });

        if (entry) {
          const ins = computeLogbookInsertion(lines, lineNumber, {
            drawerName: logDrawerName,
            bodyIndent,
            entry
          });

          if (ins && ins.changed && typeof ins.lineIndex === "number" && typeof ins.text === "string") {
            workspaceEdit.insert(document.uri, new vscode.Position(ins.lineIndex, 0), ins.text);
          }
        }
      }

      const repeated = applyRepeatersOnCompletion({
        lines,
        headingLineIndex: lineNumber,
        planning: mergedPlanning,
        workflowRegistry,
        dateFormat,
        now: moment()
      });

      if (repeated && repeated.didRepeat) {
        mergedPlanning.scheduled = repeated.planning.scheduled;
        mergedPlanning.deadline = repeated.planning.deadline;

        if (repeated.repeatToStateKeyword) {
          effectiveKeyword = repeated.repeatToStateKeyword;
        }
      }
    }

    // Handle forward-trigger transitions (default: CONTINUED)
    if (workflowRegistry.triggersForward(effectiveKeyword) && !workflowRegistry.triggersForward(currentKeyword)) {
      const forwardEdit = continuedTaskHandler.handleContinuedTransition(document, lineNumber);
      if (forwardEdit && forwardEdit.type === "insert") {
        workspaceEdit.insert(document.uri, forwardEdit.position, forwardEdit.text);
      }
    } else if (workflowRegistry.triggersForward(currentKeyword) && !workflowRegistry.triggersForward(effectiveKeyword)) {
      const removeEdit = continuedTaskHandler.handleContinuedRemoval(document, lineNumber);
      if (removeEdit && removeEdit.type === "delete") {
        workspaceEdit.delete(document.uri, removeEdit.range);
      }
    }

    const newLine = taskKeywordManager.buildTaskLine(leadingSpaces, effectiveKeyword, cleanedText, { headingMarkerStyle, starPrefix });
    workspaceEdit.replace(document.uri, currentLine.range, newLine);

    const planningIndent = `${leadingSpaces}${bodyIndent}`;
    const planningBody = buildPlanningBody(mergedPlanning);

    // Normalize planning line placement immediately after the headline.
    if (planningBody) {
      if (nextLine && isPlanningLine(nextLine.text)) {
        workspaceEdit.replace(document.uri, nextLine.range, `${planningIndent}${planningBody}`);
        if (nextNextLine && isPlanningLine(nextNextLine.text)) {
          workspaceEdit.delete(document.uri, nextNextLine.rangeIncludingLineBreak);
        }
      } else {
        // Only collapse a next-next planning line if it's separated by a blank line.
        // Otherwise, it may belong to the next sibling headline (multi-line selections).
        if (nextLine && !nextLine.text.trim() && nextNextLine && isPlanningLine(nextNextLine.text)) {
          workspaceEdit.delete(document.uri, nextNextLine.rangeIncludingLineBreak);
        }
        workspaceEdit.insert(document.uri, currentLine.range.end, `\n${planningIndent}${planningBody}`);
      }
    } else {
      if (nextLine && isPlanningLine(nextLine.text)) {
        workspaceEdit.delete(document.uri, nextLine.rangeIncludingLineBreak);
      } else if (nextLine && !nextLine.text.trim() && nextNextLine && isPlanningLine(nextNextLine.text) && (nextNextLine.text.includes("CLOSED") || nextNextLine.text.includes("COMPLETED"))) {
        workspaceEdit.delete(document.uri, nextNextLine.rangeIncludingLineBreak);
      }
    }

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
          nextKeyword: effectiveKeyword,
          stampsClosed: completionStampsClosed,
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

        const hasClosed = Boolean(originalLines[i + 1]?.includes("CLOSED") || originalLines[i + 1]?.includes("COMPLETED"));
        if (change.stampsClosed) {
          if (!hasClosed) {
            originalLines.splice(i + 1, 0, taskKeywordManager.buildCompletedStamp(origIndent, dateFormat, bodyIndent));
          }
        } else if (hasClosed) {
          originalLines.splice(i + 1, 1);
        }

        fs.writeFileSync(fullPath, originalLines.join("\n"), "utf8");
        break;
      }
    }
  }
};
