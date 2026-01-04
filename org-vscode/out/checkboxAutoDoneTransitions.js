"use strict";

const HEADING_LINE_REGEX = /^(\s*)(\*+|[⊙⊘⊜⊖⊗])\s+\S/;
const TASK_LINE_REGEX = /^(\s*)(\*+|[⊙⊘⊜⊖⊗])\s+(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/;
const CHECKBOX_REGEX = /^\s*[-+*]\s+\[( |x|X)\]\s+/;

function isHeadingLine(line) {
  return HEADING_LINE_REGEX.test(String(line || ""));
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
  return CHECKBOX_REGEX.test(String(line || ""));
}

function isCheckboxChecked(line) {
  const m = String(line || "").match(CHECKBOX_REGEX);
  if (!m) return false;
  return String(m[1]).toLowerCase() === "x";
}

function computeHeadingTransitions(lines) {
  const safeLines = Array.isArray(lines) ? lines : [];

  /** @type {{ lineNumber: number, level: number, status: string }[]} */
  const candidates = [];

  for (let i = 0; i < safeLines.length; i++) {
    const line = safeLines[i];
    const match = String(line || "").match(TASK_LINE_REGEX);
    if (!match) continue;

    const status = match[3];
    if (status === "ABANDONED") continue;

    candidates.push({
      lineNumber: i,
      level: getHeadingLevel(match),
      status
    });
  }

  /** @type {number[]} */
  const toMarkDone = [];
  /** @type {number[]} */
  const toMarkInProgress = [];

  for (const heading of candidates) {
    let total = 0;
    let checked = 0;

    for (let j = heading.lineNumber + 1; j < safeLines.length; j++) {
      const nextLine = safeLines[j];

      if (isHeadingLine(nextLine)) {
        const nextMatch = String(nextLine || "").match(TASK_LINE_REGEX) || String(nextLine || "").match(HEADING_LINE_REGEX);
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

    if (total === 0) continue;

    if (heading.status === "DONE") {
      if (checked < total) {
        toMarkInProgress.push(heading.lineNumber);
      }
    } else {
      if (checked === total) {
        toMarkDone.push(heading.lineNumber);
      }
    }
  }

  return { toMarkDone, toMarkInProgress };
}

module.exports = {
  computeHeadingTransitions
};
