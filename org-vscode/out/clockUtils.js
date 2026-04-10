"use strict";

const moment = require("moment");
const { parseHeadingInfo, findSubtreeEndExclusive } = require("./moveBlockUtils");

const CLOCK_LINE_RE = /^(\s*)CLOCK:\s*\[([^\]]+)\](?:--\[([^\]]+)\])?\s*$/;

function formatOrgClockTimestamp(now, dateFormat) {
  return moment(now).format(`${dateFormat} ddd HH:mm`);
}

function parseClockLine(lineText) {
  const m = String(lineText || "").match(CLOCK_LINE_RE);
  if (!m) return null;

  return {
    indent: m[1] || "",
    start: m[2] || "",
    end: m[3] || null
  };
}

function closeClockLine(lineText, endTimestamp) {
  const parsed = parseClockLine(lineText);
  if (!parsed || parsed.end) {
    return { changed: false, line: String(lineText || "") };
  }
  return {
    changed: true,
    line: `${parsed.indent}CLOCK: [${parsed.start}]--[${endTimestamp}]`
  };
}

function findOpenClockLineInSubtree(lines, headingLineIndex) {
  const arr = Array.isArray(lines) ? lines : [];
  if (!arr.length) return -1;
  const startInfo = parseHeadingInfo(arr[headingLineIndex]);
  if (!startInfo) return -1;

  const endExclusive = findSubtreeEndExclusive(arr, headingLineIndex, startInfo);
  for (let i = endExclusive - 1; i > headingLineIndex; i--) {
    const parsed = parseClockLine(arr[i]);
    if (parsed && !parsed.end) return i;
  }
  return -1;
}

function computeClockTableRows(lines, acceptedDateFormats) {
  const arr = Array.isArray(lines) ? lines : [];
  const headingRegex = /^\s*\*+\s+/;
  const rows = new Map();
  let currentHeading = "(No Heading)";
  let totalMinutes = 0;

  for (let i = 0; i < arr.length; i++) {
    const line = String(arr[i] || "");
    if (headingRegex.test(line)) {
      currentHeading = line.replace(/^\s*\*+\s+/, "").trim() || "(No Heading)";
      continue;
    }

    const parsed = parseClockLine(line);
    if (!parsed || !parsed.end) continue;

    const start = moment(parsed.start, acceptedDateFormats, true);
    const end = moment(parsed.end, acceptedDateFormats, true);
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) continue;

    const minutes = end.diff(start, "minutes");
    totalMinutes += minutes;
    rows.set(currentHeading, (rows.get(currentHeading) || 0) + minutes);
  }

  const items = Array.from(rows.entries())
    .map(([heading, minutes]) => ({ heading, minutes }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    totalMinutes,
    rows: items
  };
}

function formatDuration(minutes) {
  const safe = Math.max(0, Number(minutes) || 0);
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

module.exports = {
  CLOCK_LINE_RE,
  closeClockLine,
  computeClockTableRows,
  findOpenClockLineInSubtree,
  formatDuration,
  formatOrgClockTimestamp,
  parseClockLine
};
