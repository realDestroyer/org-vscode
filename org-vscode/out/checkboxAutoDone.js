"use strict";

const vscode = require("vscode");
const moment = require("moment");

const taskKeywordManager = require("./taskKeywordManager");
const continuedTaskHandler = require("./continuedTaskHandler");
const { isPlanningLine, parsePlanningFromText, normalizeTagsAfterPlanning, stripInlinePlanning } = require("./orgTagUtils");
const { applyRepeatersOnCompletion } = require("./repeatedTasks");
const { computeLogbookInsertion, formatStateChangeEntry } = require("./orgLogbook");
const { computeHeadingTransitions } = require("./checkboxAutoDoneTransitions");
const { normalizeBodyIndentation } = require("./indentUtils");

const CHECKBOX_REGEX = /^\s*[-+*]\s+\[( |x|X)\]\s+/;

function buildPlanningBody(planning) {
  const parts = [];
  // In Emacs: SCHEDULED/DEADLINE use active <...> (appear in agenda), CLOSED uses inactive [...]
  if (planning?.scheduled) parts.push(`SCHEDULED: <${planning.scheduled}>`);
  if (planning?.deadline) parts.push(`DEADLINE: <${planning.deadline}>`);
  if (planning?.closed) parts.push(`CLOSED: [${planning.closed}]`);
  return parts.join("  ");
}


function pickDoneKeyword(registry) {
  const states = registry?.states || [];
  const stampsClosed = states.find((s) => s && s.stampsClosed);
  if (stampsClosed?.keyword) return stampsClosed.keyword;
  const doneLike = states.find((s) => s && s.isDoneLike);
  if (doneLike?.keyword) return doneLike.keyword;
  return "DONE";
}

function pickReopenKeyword(registry) {
  const cycle = registry?.getCycleKeywords ? registry.getCycleKeywords() : [];
  const states = registry?.states || [];
  const candidate = states.find((s) => s && !s.isDoneLike && !s.triggersForward && s.keyword !== cycle[0]);
  if (candidate?.keyword) return candidate.keyword;
  const first = cycle[0];
  return first || "IN_PROGRESS";
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
  const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);
  const logIntoDrawer = config.get("logIntoDrawer", false);
  const logDrawerName = config.get("logDrawerName", "LOGBOOK");
  const registry = taskKeywordManager.getWorkflowRegistry();

  const currentLine = document.lineAt(lineNumber);
  const nextLine = lineNumber + 1 < document.lineCount ? document.lineAt(lineNumber + 1) : null;
  const nextNextLine = lineNumber + 2 < document.lineCount ? document.lineAt(lineNumber + 2) : null;

  const currentKeyword = taskKeywordManager.findTaskKeyword(currentLine.text);
  if (!currentKeyword) return;
  if (registry.isDoneLike(currentKeyword)) return;

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

  const doneKeyword = pickDoneKeyword(registry);
  const completionStampsClosed = registry.stampsClosed(doneKeyword);

  const completionTimestamp = moment().format(`${dateFormat} ddd HH:mm`);

  let nextKeyword = doneKeyword;
  if (completionStampsClosed) {
    mergedPlanning.closed = completionTimestamp;
  }

  // If the task has repeaters, reschedule and reopen.
  {
    const lines = document.getText().split(/\r?\n/);

    // Org-mode style logging into a drawer (LOGBOOK) for completion transitions.
    if (logIntoDrawer && completionStampsClosed) {
      const entry = formatStateChangeEntry({
        fromKeyword: currentKeyword,
        toKeyword: doneKeyword,
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
      workflowRegistry: registry,
      dateFormat,
      now: moment()
    });

    if (repeated && repeated.didRepeat) {
      mergedPlanning.scheduled = repeated.planning.scheduled;
      mergedPlanning.deadline = repeated.planning.deadline;

      if (repeated.repeatToStateKeyword) {
        nextKeyword = repeated.repeatToStateKeyword;
      }
    }
  }

  const headlineNoPlanning = stripInlinePlanning(normalizeTagsAfterPlanning(currentLine.text));
  const cleanedText = taskKeywordManager.cleanTaskText(headlineNoPlanning);

  const workspaceEdit = new vscode.WorkspaceEdit();

  // Leaving forward-trigger state should remove the continuation lines.
  if (registry.triggersForward(currentKeyword)) {
    const removeEdit = continuedTaskHandler.handleContinuedRemoval(document, lineNumber);
    if (removeEdit && removeEdit.type === "delete") {
      workspaceEdit.delete(document.uri, removeEdit.range);
    }
  }

  const newLine = taskKeywordManager.buildTaskLine(leadingSpaces, nextKeyword, cleanedText, { headingMarkerStyle, starPrefix });
  workspaceEdit.replace(document.uri, currentLine.range, newLine);

  const planningIndent = `${leadingSpaces}${bodyIndent}`;
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
  const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);
  const registry = taskKeywordManager.getWorkflowRegistry();

  const currentLine = document.lineAt(lineNumber);
  const nextLine = lineNumber + 1 < document.lineCount ? document.lineAt(lineNumber + 1) : null;
  const nextNextLine = lineNumber + 2 < document.lineCount ? document.lineAt(lineNumber + 2) : null;

  const currentKeyword = taskKeywordManager.findTaskKeyword(currentLine.text);
  if (!currentKeyword) return;
  if (!(registry.isDoneLike(currentKeyword) && registry.stampsClosed(currentKeyword))) return;

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

  const nextKeyword = pickReopenKeyword(registry);

  const workspaceEdit = new vscode.WorkspaceEdit();

  const newLine = taskKeywordManager.buildTaskLine(leadingSpaces, nextKeyword, cleanedText, { headingMarkerStyle, starPrefix });
  workspaceEdit.replace(document.uri, currentLine.range, newLine);

  const planningIndent = `${leadingSpaces}${bodyIndent}`;
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
