"use strict";

const vscode = require("vscode");
const moment = require("moment");

const taskKeywordManager = require("./taskKeywordManager");
const continuedTaskHandler = require("./continuedTaskHandler");
const { isPlanningLine, parsePlanningFromText, normalizeTagsAfterPlanning, stripInlinePlanning } = require("./orgTagUtils");
const { computeHeadingTransitions } = require("./checkboxAutoDoneTransitions");

const TASK_LINE_REGEX = /^(\s*)(\*+|[⊙⊘⊜⊖⊗])\s+(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/;

const CHECKBOX_REGEX = /^\s*[-+*]\s+\[( |x|X)\]\s+/;

function buildPlanningBody(planning) {
  const parts = [];
  if (planning?.scheduled) parts.push(`SCHEDULED: [${planning.scheduled}]`);
  if (planning?.deadline) parts.push(`DEADLINE: [${planning.deadline}]`);
  if (planning?.closed) parts.push(`CLOSED: [${planning.closed}]`);
  return parts.join("  ");
}

function isHeadingLine(line) {
  return /^\s*(\*+|[⊙⊘⊜⊖⊗])\s+\S/.test(line);
}

function getHeadingLevel(match) {
  const starsOrSymbol = match[2] || "";
  if (starsOrSymbol.startsWith("*")) {
    return starsOrSymbol.length;
  }
  // For unicode-marker files, use indentation depth as a proxy.
  const indent = match[1] || "";
  return 1000 + indent.length;
}

function isCheckboxLine(line) {
  return CHECKBOX_REGEX.test(line);
}

function isCheckboxChecked(line) {
  const m = line.match(CHECKBOX_REGEX);
  if (!m) return false;
  return String(m[1]).toLowerCase() === "x";
}

async function applyDoneToHeading(document, lineNumber) {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");

  const currentLine = document.lineAt(lineNumber);
  const nextLine = lineNumber + 1 < document.lineCount ? document.lineAt(lineNumber + 1) : null;
  const nextNextLine = lineNumber + 2 < document.lineCount ? document.lineAt(lineNumber + 2) : null;

  const keywordMatch = currentLine.text.match(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/);
  const currentKeyword = keywordMatch ? keywordMatch[1] : null;
  if (!currentKeyword) return;
  if (currentKeyword === "DONE" || currentKeyword === "ABANDONED") return;

  // Never convert day headings like `* [MM-DD-YYYY Wed] ...`.
  if (continuedTaskHandler.DAY_HEADING_REGEX && continuedTaskHandler.DAY_HEADING_REGEX.test(currentLine.text)) {
    return;
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
    closed: planningFromNext.closed || planningFromHeadline.closed || planningFromNextNext.closed || null
  };

  mergedPlanning.closed = moment().format(`${dateFormat} ddd HH:mm`);

  const headlineNoPlanning = stripInlinePlanning(normalizeTagsAfterPlanning(currentLine.text));
  const cleanedText = taskKeywordManager.cleanTaskText(headlineNoPlanning);

  const nextKeyword = "DONE";

  const workspaceEdit = new vscode.WorkspaceEdit();

  // Leaving CONTINUED should remove the continuation lines.
  if (currentKeyword === "CONTINUED") {
    const removeEdit = continuedTaskHandler.handleContinuedRemoval(document, lineNumber);
    if (removeEdit && removeEdit.type === "delete") {
      workspaceEdit.delete(document.uri, removeEdit.range);
    }
  }

  const newLine = taskKeywordManager.buildTaskLine(leadingSpaces, nextKeyword, cleanedText, { headingMarkerStyle, starPrefix });
  workspaceEdit.replace(document.uri, currentLine.range, newLine);

  const planningIndent = `${leadingSpaces}  `;
  const planningBody = buildPlanningBody(mergedPlanning);

  if (planningBody) {
    if (nextLine && isPlanningLine(nextLine.text)) {
      workspaceEdit.replace(document.uri, nextLine.range, `${planningIndent}${planningBody}`);
      if (nextNextLine && isPlanningLine(nextNextLine.text)) {
        workspaceEdit.delete(document.uri, nextNextLine.rangeIncludingLineBreak);
      }
    } else {
      if (nextNextLine && isPlanningLine(nextNextLine.text)) {
        workspaceEdit.delete(document.uri, nextNextLine.rangeIncludingLineBreak);
      }
      workspaceEdit.insert(document.uri, currentLine.range.end, `\n${planningIndent}${planningBody}`);
    }
  }

  await vscode.workspace.applyEdit(workspaceEdit);
}

async function applyInProgressToHeading(document, lineNumber) {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");

  const currentLine = document.lineAt(lineNumber);
  const nextLine = lineNumber + 1 < document.lineCount ? document.lineAt(lineNumber + 1) : null;
  const nextNextLine = lineNumber + 2 < document.lineCount ? document.lineAt(lineNumber + 2) : null;

  const keywordMatch = currentLine.text.match(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/);
  const currentKeyword = keywordMatch ? keywordMatch[1] : null;
  if (!currentKeyword) return;
  if (currentKeyword !== "DONE") return;

  // Never convert day headings like `* [MM-DD-YYYY Wed] ...`.
  if (continuedTaskHandler.DAY_HEADING_REGEX && continuedTaskHandler.DAY_HEADING_REGEX.test(currentLine.text)) {
    return;
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
    closed: planningFromNext.closed || planningFromHeadline.closed || planningFromNextNext.closed || null
  };

  // Leaving DONE should remove CLOSED.
  mergedPlanning.closed = null;

  const headlineNoPlanning = stripInlinePlanning(normalizeTagsAfterPlanning(currentLine.text));
  const cleanedText = taskKeywordManager.cleanTaskText(headlineNoPlanning);

  const nextKeyword = "IN_PROGRESS";

  const workspaceEdit = new vscode.WorkspaceEdit();

  const newLine = taskKeywordManager.buildTaskLine(leadingSpaces, nextKeyword, cleanedText, { headingMarkerStyle, starPrefix });
  workspaceEdit.replace(document.uri, currentLine.range, newLine);

  const planningIndent = `${leadingSpaces}  `;
  const planningBody = buildPlanningBody(mergedPlanning);

  if (planningBody) {
    if (nextLine && isPlanningLine(nextLine.text)) {
      workspaceEdit.replace(document.uri, nextLine.range, `${planningIndent}${planningBody}`);
      if (nextNextLine && isPlanningLine(nextNextLine.text)) {
        workspaceEdit.delete(document.uri, nextNextLine.rangeIncludingLineBreak);
      }
    } else {
      if (nextNextLine && isPlanningLine(nextNextLine.text)) {
        workspaceEdit.delete(document.uri, nextNextLine.rangeIncludingLineBreak);
      }
      workspaceEdit.insert(document.uri, currentLine.range.end, `\n${planningIndent}${planningBody}`);
    }
  } else {
    // Remove planning lines if they exist but will be empty after removing CLOSED.
    if (nextLine && isPlanningLine(nextLine.text)) {
      workspaceEdit.delete(document.uri, nextLine.rangeIncludingLineBreak);
    } else if (nextNextLine && isPlanningLine(nextNextLine.text) && (nextNextLine.text.includes("CLOSED") || nextNextLine.text.includes("COMPLETED"))) {
      workspaceEdit.delete(document.uri, nextNextLine.rangeIncludingLineBreak);
    }
  }

  await vscode.workspace.applyEdit(workspaceEdit);
}


async function autoDoneForDocument(document) {
  if (!document || document.languageId !== "vso") return;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  if (!config.get("autoDoneWhenAllCheckboxesChecked", false)) return;

  const text = document.getText();
  const lines = text.split(/\r?\n/);

  const { toMarkDone, toMarkInProgress } = computeHeadingTransitions(lines);

  if (!toMarkDone.length && !toMarkInProgress.length) return;

  // Apply from bottom-up to keep line references stable across inserts.
  const ops = [];
  for (const n of toMarkDone) ops.push({ lineNumber: n, op: "done" });
  for (const n of toMarkInProgress) ops.push({ lineNumber: n, op: "inprogress" });
  ops.sort((a, b) => b.lineNumber - a.lineNumber);

  for (const o of ops) {
    try {
      if (o.op === "done") await applyDoneToHeading(document, o.lineNumber);
      else await applyInProgressToHeading(document, o.lineNumber);
    } catch (_) {
      // Best-effort: never throw from a background auto-updater.
    }
  }
}

function registerCheckboxAutoDone(ctx) {
  // Unit tests mock vscode; skip wiring when APIs aren't present.
  if (!vscode.workspace || typeof vscode.workspace.onDidChangeTextDocument !== "function") {
    return;
  }

  const applying = new Set();
  const timers = new Map();

  function schedule(document) {
    if (!document || document.languageId !== "vso") return;

    const key = document.uri.toString();
    if (applying.has(key)) return;

    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }

    timers.set(
      key,
      setTimeout(async () => {
        timers.delete(key);
        applying.add(key);
        try {
          await autoDoneForDocument(document);
        } finally {
          applying.delete(key);
        }
      }, 250)
    );
  }

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      // Only respond when the change likely involves checkboxes.
      const touchesCheckbox = (event.contentChanges || []).some((c) => {
        const text = String(c && c.text || "");
        return text.includes("[") || text.includes("]") || text.includes("-");
      });

      if (!touchesCheckbox) return;
      schedule(event.document);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("Org-vscode.autoDoneWhenAllCheckboxesChecked")) {
        schedule(vscode.window.activeTextEditor && vscode.window.activeTextEditor.document);
      }
    })
  );
}

module.exports = {
  registerCheckboxAutoDone
};
