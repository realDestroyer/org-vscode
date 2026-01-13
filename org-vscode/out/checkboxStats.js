"use strict";

const taskKeywordManager = require("./taskKeywordManager");

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getHeadingMarkerAlternation(registry) {
  const markers = (registry?.states || [])
    .map((s) => s && s.marker)
    .filter((m) => typeof m === "string" && m.length > 0);
  const deduped = Array.from(new Set(markers));
  if (!deduped.length) return "";
  return deduped.map(escapeRegExp).join("|");
}

function getHeadingLineRegex(registry) {
  const markerAlt = getHeadingMarkerAlternation(registry);
  const markerPart = markerAlt ? `(?:${markerAlt})` : "";
  const headMarker = markerPart ? `(?:\\*+|${markerPart})` : "\\*+";
  return new RegExp(`^(\\s*)(${headMarker})\\s+\\S`);
}

function isHeadingLine(text, registry) {
  return getHeadingLineRegex(registry).test(String(text || ""));
}

function isTaskHeadingLine(text, registry) {
  const t = String(text || "");
  if (!isHeadingLine(t, registry)) return false;
  return Boolean(taskKeywordManager.findTaskKeyword(t));
}

const CHECKBOX_REGEX = /^\s*[-+*]\s+\[( |x|X|-)\]\s+/;
const CHECKBOX_COOKIE_REGEX = /\[(\d+\/\d+|\d+%|\/|%)\]/;

function getIndentLength(line) {
  const m = String(line || "").match(/^\s*/);
  return m ? m[0].length : 0;
}

function isCheckboxLine(line) {
  return CHECKBOX_REGEX.test(String(line || ""));
}

function isCheckboxChecked(line) {
  const m = String(line || "").match(CHECKBOX_REGEX);
  if (!m) return false;
  return String(m[1]).toLowerCase() === "x";
}

function computeHierarchicalCheckboxStatsInRange(lines, startInclusive, endExclusive, baseIndent) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const start = Math.max(0, Number(startInclusive) || 0);
  const end = Math.min(safeLines.length, (endExclusive == null ? safeLines.length : Number(endExclusive)));
  const base = Number.isFinite(baseIndent) ? baseIndent : -1;

  /** @type {Array<{ index: number, indent: number }>} */
  const checkboxLines = [];

  for (let i = start; i < end; i++) {
    const line = safeLines[i];
    if (!isCheckboxLine(line)) continue;
    const indent = getIndentLength(line);
    if (indent <= base) continue;
    checkboxLines.push({ index: i, indent });
  }

  if (!checkboxLines.length) {
    return { checked: 0, total: 0 };
  }

  let minIndent = Infinity;
  for (const c of checkboxLines) {
    if (c.indent < minIndent) minIndent = c.indent;
  }

  const topLevel = checkboxLines.filter((c) => c.indent === minIndent);
  let checkedCount = 0;

  for (let i = 0; i < topLevel.length; i++) {
    const item = topLevel[i];
    const nextTopIndex = (i + 1 < topLevel.length) ? topLevel[i + 1].index : end;

    const selfChecked = isCheckboxChecked(safeLines[item.index]);
    if (selfChecked) {
      checkedCount += 1;
      continue;
    }

    // If this checkbox has descendants, consider it complete only when all descendants are checked.
    let hasDesc = false;
    let allDescChecked = true;
    for (const c of checkboxLines) {
      if (c.index <= item.index) continue;
      if (c.index >= nextTopIndex) break;
      if (c.indent <= minIndent) continue;
      hasDesc = true;
      if (!isCheckboxChecked(safeLines[c.index])) {
        allDescChecked = false;
        break;
      }
    }

    if (hasDesc && allDescChecked) {
      checkedCount += 1;
    }
  }

  return { checked: checkedCount, total: topLevel.length };
}

function computeTodoStatsInRange(lines, startInclusive, endExclusive) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const start = Math.max(0, Number(startInclusive) || 0);
  const end = Math.min(safeLines.length, (endExclusive == null ? safeLines.length : Number(endExclusive)));

  let total = 0;
  let checked = 0;

  const registry = taskKeywordManager.getWorkflowRegistry();

  for (let i = start; i < end; i++) {
    const line = String(safeLines[i] || "");
    if (!isTaskHeadingLine(line, registry)) continue;
    const status = taskKeywordManager.findTaskKeyword(line);
    if (!status) continue;
    total += 1;
    if (registry.isDoneLike(status) || registry.stampsClosed(status)) {
      checked += 1;
    }
  }

  return { checked, total };
}

function computeSubtreeCompletionStatsInRange(lines, startInclusive, endExclusive) {
  const checkbox = computeHierarchicalCheckboxStatsInRange(lines, startInclusive, endExclusive, -1);
  const todo = computeTodoStatsInRange(lines, startInclusive, endExclusive);
  return {
    checked: (Number(checkbox.checked) || 0) + (Number(todo.checked) || 0),
    total: (Number(checkbox.total) || 0) + (Number(todo.total) || 0)
  };
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

function hasCheckboxCookie(lineText) {
  return CHECKBOX_COOKIE_REGEX.test(String(lineText || ""));
}

function findCheckboxCookie(lineText) {
  const s = String(lineText || "");
  const m = s.match(CHECKBOX_COOKIE_REGEX);
  if (!m || typeof m.index !== "number") return null;
  const raw = String(m[0]);
  const inner = String(m[1] || "");
  const mode = inner.includes("%") ? "percent" : "fraction";
  return {
    start: m.index,
    end: m.index + raw.length,
    raw,
    mode
  };
}

function computeCheckboxStatsByHeadingLine(lines) {
  const stack = [];
  const result = new Map();

  const safeLines = Array.isArray(lines) ? lines : [];
  const registry = taskKeywordManager.getWorkflowRegistry();
  const HEADING_LINE_REGEX = getHeadingLineRegex(registry);

  for (let i = 0; i < safeLines.length; i++) {
    const line = String(safeLines[i] || "");

    const headingMatch = line.match(HEADING_LINE_REGEX);
    if (!headingMatch) continue;

    const level = getHeadingLevel(headingMatch);
    while (stack.length && stack[stack.length - 1].level >= level) {
      const finished = stack.pop();
      const stats = computeHierarchicalCheckboxStatsInRange(safeLines, finished.lineNumber + 1, i, -1);
      result.set(finished.lineNumber, stats);
    }

    stack.push({ lineNumber: i, level });
  }

  while (stack.length) {
    const finished = stack.pop();
    const stats = computeHierarchicalCheckboxStatsInRange(safeLines, finished.lineNumber + 1, safeLines.length, -1);
    result.set(finished.lineNumber, stats);
  }

  return result;
}

function formatCheckboxStats(stats, format) {
  const checked = Number(stats && stats.checked) || 0;
  const total = Number(stats && stats.total) || 0;
  const mode = String(format || "fraction").toLowerCase();
  if (mode === "percent") {
    const pct = total > 0 ? Math.floor((checked / total) * 100) : 0;
    return `[${pct}%]`;
  }

  return `[${checked}/${total}]`;
}

module.exports = {
  computeCheckboxStatsByHeadingLine,
  computeHierarchicalCheckboxStatsInRange,
  computeTodoStatsInRange,
  computeSubtreeCompletionStatsInRange,
  hasCheckboxCookie,
  findCheckboxCookie,
  formatCheckboxStats
};
