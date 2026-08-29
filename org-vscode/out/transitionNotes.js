"use strict";

const { computeLogbookInsertion, formatStateChangeEntry } = require("./orgLogbook");

function normalizeTransitionNote(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function formatTransitionNoteEntry({ fromKeyword, toKeyword, timestamp, note } = {}) {
  const stateEntry = formatStateChangeEntry({ fromKeyword, toKeyword, timestamp });
  if (!stateEntry) return null;
  const normalizedNote = normalizeTransitionNote(note);
  return normalizedNote ? `${stateEntry} \\\\ ${normalizedNote}` : stateEntry;
}

async function requestTransitionNote(options = {}) {
  const {
    fromKeyword,
    toKeyword,
    workflowRegistry,
    suppressNotePrompt = false,
    showInputBox
  } = options;

  const shouldPrompt = !suppressNotePrompt
    && fromKeyword !== toKeyword
    && workflowRegistry
    && workflowRegistry.promptsForNote(toKeyword);
  if (!shouldPrompt) return { prompted: false, cancelled: false, note: "" };

  const input = await showInputBox({
    prompt: `Note for transition to ${toKeyword}`,
    placeHolder: "Optional transition note",
    ignoreFocusOut: true
  });
  if (input === undefined) return { prompted: true, cancelled: true, note: "" };
  return { prompted: true, cancelled: false, note: normalizeTransitionNote(input) };
}

function computeTransitionLogbookInsertion(lines, headingLineIndex, options = {}) {
  const shouldLogCompletion = options.logIntoDrawer && options.completionTransition;
  if (!options.prompted && !shouldLogCompletion) return { changed: false };

  const entry = formatTransitionNoteEntry(options);
  return computeLogbookInsertion(lines, headingLineIndex, {
    drawerName: options.drawerName,
    bodyIndent: options.bodyIndent,
    entry
  });
}

function applyTransitionLogbookInsertion(lines, headingLineIndex, options = {}) {
  const insertion = computeTransitionLogbookInsertion(lines, headingLineIndex, options);
  if (!insertion.changed) return false;

  const insertedLines = insertion.text
    .replace(/^\n/, "")
    .replace(/\n$/, "")
    .split("\n");
  const lineIndex = insertion.lineIndex === lines.length && lines[lines.length - 1] === ""
    ? insertion.lineIndex - 1
    : insertion.lineIndex;
  lines.splice(lineIndex, 0, ...insertedLines);
  return true;
}

module.exports = {
  normalizeTransitionNote,
  formatTransitionNoteEntry,
  requestTransitionNote,
  computeTransitionLogbookInsertion,
  applyTransitionLogbookInsertion
};