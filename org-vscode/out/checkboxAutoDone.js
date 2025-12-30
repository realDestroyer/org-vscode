"use strict";

const vscode = require("vscode");
const moment = require("moment");

const taskKeywordManager = require("./taskKeywordManager");
const continuedTaskHandler = require("./continuedTaskHandler");
const { isPlanningLine, parsePlanningFromText, normalizeTagsAfterPlanning } = require("./orgTagUtils");

const HEADING_LINE_REGEX = /^(\s*)(\*+|[⊙⊘⊜⊖⊗])\s+\S/;
const TASK_LINE_REGEX = /^(\s*)(\*+|[⊙⊘⊜⊖⊗])\s+(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/;

const CHECKBOX_REGEX = /^\s*[-+*]\s+\[( |x|X)\]\s+/;

function stripInlinePlanning(text) {
  return String(text || "")
    .replace(/\s*(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\s*\[[^\]]*\]/g, "")
    .replace(/\s*(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\[[^\]]*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trimRight();
}

function buildPlanningBody(planning) {
  const parts = [];
  if (planning?.scheduled) parts.push(`SCHEDULED: [${planning.scheduled}]`);
  if (planning?.deadline) parts.push(`DEADLINE: [${planning.deadline}]`);
  if (planning?.closed) parts.push(`CLOSED: [${planning.closed}]`);
  return parts.join("  ");
}

function isHeadingLine(line) {
  return HEADING_LINE_REGEX.test(line);
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

async function autoDoneForDocument(document) {
  if (!document || document.languageId !== "vso") return;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  if (!config.get("autoDoneWhenAllCheckboxesChecked", false)) return;

  const text = document.getText();
  const lines = text.split(/\r?\n/);

  // Collect candidate headings.
  const candidates = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(TASK_LINE_REGEX);
    if (!match) continue;

    const status = match[3];
    if (status === "DONE" || status === "ABANDONED") continue;

    candidates.push({
      lineNumber: i,
      indent: (match[1] || ""),
      level: getHeadingLevel(match)
    });
  }

  if (!candidates.length) return;

  const toMarkDone = [];

  for (const heading of candidates) {
    let total = 0;
    let checked = 0;

    for (let j = heading.lineNumber + 1; j < lines.length; j++) {
      const nextLine = lines[j];

      if (isHeadingLine(nextLine)) {
        const nextMatch = nextLine.match(TASK_LINE_REGEX) || nextLine.match(HEADING_LINE_REGEX);
        if (nextMatch) {
          const nextLevel = getHeadingLevel(nextMatch);
          if (nextLevel <= heading.level) {
            break;
          }
        }
      }

      if (isCheckboxLine(nextLine)) {
        total += 1;
        if (isCheckboxChecked(nextLine)) checked += 1;
      }
    }

    if (total > 0 && checked === total) {
      toMarkDone.push(heading.lineNumber);
    }
  }

  if (!toMarkDone.length) return;

  // Apply from bottom-up to keep line references stable across inserts.
  toMarkDone.sort((a, b) => b - a);

  for (const lineNumber of toMarkDone) {
    try {
      await applyDoneToHeading(document, lineNumber);
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
