"use strict";

const { computeHierarchicalCheckboxStatsInRange } = require("./checkboxStats");

const HEADING_LINE_REGEX = /^\s*(\*+|[⊙⊘⊜⊖⊗])\s+\S/;
const LIST_ITEM_REGEX = /^\s*([-+*]|\d+[.)])\s+/;
const CHECKBOX_ITEM_REGEX = /^(\s*)([-+*]|\d+[.)])(\s+)\[( |x|X|-)\](\s+)(.*)$/;

function getIndentLength(line) {
  const m = String(line || "").match(/^\s*/);
  return m ? m[0].length : 0;
}

function isHeadingLine(line) {
  return HEADING_LINE_REGEX.test(String(line || ""));
}

function isListItemLine(line) {
  return LIST_ITEM_REGEX.test(String(line || ""));
}

function parseCheckboxItem(line) {
  const m = String(line || "").match(CHECKBOX_ITEM_REGEX);
  if (!m) return null;
  const indent = m[1] || "";
  const bullet = m[2] || "-";
  const state = m[4] || " ";
  const rest = m[6] || "";
  return {
    indentLen: indent.length,
    bullet,
    state,
    rest
  };
}

function setCheckboxState(line, stateChar) {
  const s = String(line || "");
  if (!CHECKBOX_ITEM_REGEX.test(s)) return s;
  const replacement = String(stateChar || " ");
  return s.replace(/^(\s*(?:[-+*]|\d+[.)])\s+\[)( |x|X|-)(\]\s+)/, `$1${replacement}$3`);
}

function getListItemSubtreeEndExclusive(lines, startIndex, startIndent) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const start = Math.max(0, Number(startIndex) || 0);
  const baseIndent = Math.max(0, Number(startIndent) || 0);

  for (let i = start + 1; i < safeLines.length; i++) {
    const line = safeLines[i];
    if (isHeadingLine(line)) {
      return i;
    }
    if (isListItemLine(line) && getIndentLength(line) <= baseIndent) {
      return i;
    }
  }
  return safeLines.length;
}

/**
 * Computes line edits to toggle a checkbox at a given 0-based line index.
 *
 * Behavior (Emacs-ish):
 * - Toggling a parent checkbox toggles all descendant checkbox items in its subtree.
 * - After toggling, ancestor checkbox markers are updated to: [X] all done, [ ] none, [-] partial.
 *
 * Returns array of edits: { lineIndex: number, newText: string }.
 */
function computeCheckboxToggleEdits(lines, lineIndex0) {
  const safeLines = Array.isArray(lines) ? lines.slice() : [];
  const idx = Number(lineIndex0);
  if (!Number.isInteger(idx) || idx < 0 || idx >= safeLines.length) {
    return [];
  }

  const parsed = parseCheckboxItem(safeLines[idx]);
  if (!parsed) {
    return [];
  }

  const currentState = String(parsed.state || " ");
  const currentlyChecked = currentState.toLowerCase() === "x";
  const desiredChecked = currentlyChecked ? false : true;
  const desiredStateChar = desiredChecked ? "X" : " ";

  const subtreeEnd = getListItemSubtreeEndExclusive(safeLines, idx, parsed.indentLen);
  let hasDescendantCheckboxes = false;
  for (let i = idx + 1; i < subtreeEnd; i++) {
    const child = parseCheckboxItem(safeLines[i]);
    if (child && child.indentLen > parsed.indentLen) {
      hasDescendantCheckboxes = true;
      break;
    }
  }

  /** @type {Map<number, string>} */
  const edits = new Map();

  // Toggle self (and descendants, if any).
  if (hasDescendantCheckboxes) {
    for (let i = idx; i < subtreeEnd; i++) {
      const item = parseCheckboxItem(safeLines[i]);
      if (!item) continue;
      // Only affect items inside this subtree (indent >= parent indent and within boundaries).
      if (i !== idx && item.indentLen <= parsed.indentLen) continue;
      const updated = setCheckboxState(safeLines[i], desiredStateChar);
      if (updated !== safeLines[i]) {
        safeLines[i] = updated;
        edits.set(i, updated);
      }
    }
  } else {
    const updated = setCheckboxState(safeLines[idx], desiredStateChar);
    if (updated !== safeLines[idx]) {
      safeLines[idx] = updated;
      edits.set(idx, updated);
    }
  }

  // Update ancestors until heading boundary.
  let childIndex = idx;
  let childIndent = parsed.indentLen;

  while (true) {
    let parentIndex = null;
    for (let i = childIndex - 1; i >= 0; i--) {
      const line = safeLines[i];
      if (isHeadingLine(line)) {
        parentIndex = null;
        break;
      }
      if (!isListItemLine(line)) {
        continue;
      }
      const indent = getIndentLength(line);
      if (indent < childIndent) {
        parentIndex = i;
        break;
      }
    }

    if (parentIndex == null) {
      break;
    }

    const parentParsed = parseCheckboxItem(safeLines[parentIndex]);
    if (!parentParsed) {
      // Parent list item has no checkbox, but still acts as an indentation boundary.
      childIndex = parentIndex;
      childIndent = getIndentLength(safeLines[parentIndex]);
      continue;
    }

    const parentEnd = getListItemSubtreeEndExclusive(safeLines, parentIndex, parentParsed.indentLen);
    const stats = computeHierarchicalCheckboxStatsInRange(
      safeLines,
      parentIndex + 1,
      parentEnd,
      parentParsed.indentLen
    );

    if (stats.total > 0) {
      let nextState = " ";
      if (stats.checked === 0) nextState = " ";
      else if (stats.checked === stats.total) nextState = "X";
      else nextState = "-";
      const parentUpdated = setCheckboxState(safeLines[parentIndex], nextState);
      if (parentUpdated !== safeLines[parentIndex]) {
        safeLines[parentIndex] = parentUpdated;
        edits.set(parentIndex, parentUpdated);
      }
    }

    childIndex = parentIndex;
    childIndent = parentParsed.indentLen;
  }

  return Array.from(edits.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([lineIndex, newText]) => ({ lineIndex, newText }));
}

module.exports = {
  computeCheckboxToggleEdits
};
