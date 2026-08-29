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

module.exports = {
  normalizeTransitionNote,
  formatTransitionNoteEntry,
  requestTransitionNote,
  computeTransitionLogbookInsertion
};