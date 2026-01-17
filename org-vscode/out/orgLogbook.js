"use strict";

const { isPlanningLine } = require("./orgTagUtils");

const PROPERTY_DRAWER_BEGIN_RE = /^\s*:PROPERTIES:\s*$/i;
const DRAWER_END_RE = /^\s*:END:\s*$/i;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isBlank(line) {
  return !String(line || "").trim();
}

function findDrawerEnd(lines, beginLineIndex) {
  for (let i = beginLineIndex + 1; i < lines.length; i++) {
    if (DRAWER_END_RE.test(String(lines[i] || ""))) return i;
  }
  return -1;
}

function getIndentFromLine(line) {
  const m = String(line || "").match(/^(\s*)/);
  return m ? m[1] : "";
}

function computeLogbookInsertion(lines, headingLineIndex, options = {}) {
  const arr = Array.isArray(lines) ? lines : [];
  const drawerName = String(options.drawerName || "LOGBOOK").trim() || "LOGBOOK";
  const bodyIndent = (typeof options.bodyIndent === "string") ? options.bodyIndent : "  ";
  const entry = String(options.entry || "").trim();

  if (!entry) return { changed: false };
  if (headingLineIndex == null || headingLineIndex < 0 || headingLineIndex >= arr.length) return { changed: false };

  const headingIndent = getIndentFromLine(arr[headingLineIndex]);
  const defaultDrawerIndent = `${headingIndent}${bodyIndent}`;

  const drawerBeginRe = new RegExp(`^\\s*:${escapeRegExp(drawerName)}:\\s*$`, "i");

  let i = headingLineIndex + 1;

  // Prefer LOGBOOK after the planning line (SCHEDULED/DEADLINE/CLOSED...) if present.
  if (i < arr.length && isPlanningLine(arr[i])) i++;

  // Allow blank lines before drawers.
  while (i < arr.length && isBlank(arr[i])) i++;

  // Skip an immediate property drawer (if present).
  if (i < arr.length && PROPERTY_DRAWER_BEGIN_RE.test(String(arr[i] || ""))) {
    const end = findDrawerEnd(arr, i);
    if (end !== -1) {
      i = end + 1;
      while (i < arr.length && isBlank(arr[i])) i++;
    }
  }

  // If a LOGBOOK drawer is already present at the top of the entry, insert newest-first.
  if (i < arr.length && drawerBeginRe.test(String(arr[i] || ""))) {
    const existingIndent = getIndentFromLine(arr[i]);
    const text = `${existingIndent}- ${entry}\n`;
    return { changed: true, lineIndex: i + 1, text };
  }

  // Otherwise, create a new LOGBOOK drawer at the computed insertion point.
  const text = `${defaultDrawerIndent}:${drawerName}:\n${defaultDrawerIndent}- ${entry}\n${defaultDrawerIndent}:END:\n`;
  return { changed: true, lineIndex: i, text };
}

function formatStateChangeEntry({ fromKeyword, toKeyword, timestamp } = {}) {
  const from = String(fromKeyword || "").trim() || "";
  const to = String(toKeyword || "").trim() || "";
  const ts = String(timestamp || "").trim();

  if (!to || !ts) return null;

  // Mirrors Org-mode state change logging style.
  // Example: - State "DONE" from "TODO" [2026-01-16 Fri 13:00]
  if (from) return `State \"${to}\" from \"${from}\" [${ts}]`;
  return `State \"${to}\" [${ts}]`;
}

module.exports = {
  computeLogbookInsertion,
  formatStateChangeEntry
};
