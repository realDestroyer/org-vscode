"use strict";

const taskKeywordManager = require("./taskKeywordManager");

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHeadingRegexes(registry) {
  const cycle = registry.getCycleKeywords();
  const keywordAlt = cycle.length ? cycle.map(escapeRegExp).join("|") : "TODO";

  const markers = (registry.states || [])
    .map((s) => s.marker)
    .filter((m) => typeof m === "string" && m.length > 0);
  const markerAlt = Array.from(new Set(markers)).map(escapeRegExp).join("|");
  const headAlt = markerAlt ? `(?:\\*+|(?:${markerAlt}))` : "\\*+";

  return {
    headingLineRegex: new RegExp(`^(\\s*)(${headAlt})\\s+\\S`),
    taskLineRegex: new RegExp(`^(\\s*)(${headAlt})\\s+(${keywordAlt})\\b`)
  };
}
const CHECKBOX_REGEX = /^\s*[-+*]\s+\[( |x|X)\]\s+/;

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

  const registry = taskKeywordManager.getWorkflowRegistry();
  const { headingLineRegex, taskLineRegex } = buildHeadingRegexes(registry);

  /** @type {{ lineNumber: number, level: number, status: string }[]} */
  const candidates = [];

  for (let i = 0; i < safeLines.length; i++) {
    const line = safeLines[i];
    const match = String(line || "").match(taskLineRegex);
    if (!match) continue;

    const status = String(match[3] || "").toUpperCase();
    // Preserve legacy behavior: ignore done-like states that don't stamp CLOSED (e.g. ABANDONED).
    if (registry.isDoneLike(status) && !registry.stampsClosed(status)) continue;

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
    let hasChildTasks = false;
    let hasIncompleteChildTask = false;

    for (let j = heading.lineNumber + 1; j < safeLines.length; j++) {
      const nextLine = safeLines[j];

      if (headingLineRegex.test(String(nextLine || ""))) {
        const nextMatch = String(nextLine || "").match(taskLineRegex) || String(nextLine || "").match(headingLineRegex);
        if (nextMatch) {
          const nextLevel = getHeadingLevel(nextMatch);
          if (nextLevel <= heading.level) {
            break;
          }

          // If this is a child task heading, incorporate its completion state.
          const asTask = String(nextLine || "").match(taskLineRegex);
          if (asTask) {
            hasChildTasks = true;
            const childStatus = String(asTask[3] || "").toUpperCase();
            if (!registry.isDoneLike(childStatus)) {
              hasIncompleteChildTask = true;
            }
          }
        }
      }

      if (isCheckboxLine(nextLine)) {
        total += 1;
        if (isCheckboxChecked(nextLine)) checked += 1;
      }
    }

    if (total === 0) continue;

    if (registry.isDoneLike(heading.status) && registry.stampsClosed(heading.status)) {
      if (checked < total || (hasChildTasks && hasIncompleteChildTask)) {
        toMarkInProgress.push(heading.lineNumber);
      }
    } else {
      if (checked === total && (!hasChildTasks || !hasIncompleteChildTask)) {
        toMarkDone.push(heading.lineNumber);
      }
    }
  }

  return { toMarkDone, toMarkInProgress };
}

module.exports = {
  computeHeadingTransitions
};
