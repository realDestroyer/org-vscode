"use strict";

const CHECKBOX_RE = /^\s*(?:[-+*]|\d+[.)])\s+(\[(?: |x|X|-)\])/;
const ORDERED_LIST_RE = /^(\s*)(\d+)([.)])(\s+)/;
const DEFAULT_UNICODE_MARKERS = ["⊙", "⊘", "⊜", "⊖", "⊗"];
const LIST_RE = /^\s*(?:[-+]|\d+[.)])\s+/;
const TABLE_RE = /^\s*\|/;
const TIMESTAMP_RE = /[<[]\d{2,4}-\d{2}-\d{2,4}(?:\s+[^>\]]+)?[>\]]/g;
const BRACKET_LINK_RE = /\[\[[^\]\n]+\](?:\[[^\]\n]*\])?\]/g;

function regexContainsCharacter(regex, text, character) {
  regex.lastIndex = 0;
  for (let match; (match = regex.exec(text)); ) {
    if (character >= match.index && character < match.index + match[0].length) return true;
  }
  return false;
}

function isHeading(text, unicodeMarkers = DEFAULT_UNICODE_MARKERS) {
  if (/^\s*\*+\s+/.test(text)) return true;
  const trimmed = text.trimStart();
  return unicodeMarkers.some((marker) => trimmed.startsWith(`${marker} `));
}

function classifyContext(lineText, character, unicodeMarkers) {
  const text = String(lineText || "");
  const column = Math.max(0, Number(character) || 0);
  if (regexContainsCharacter(BRACKET_LINK_RE, text, column)) return "link";
  if (regexContainsCharacter(TIMESTAMP_RE, text, column)) return "timestamp";
  if (CHECKBOX_RE.test(text)) return "checkbox";
  if (TABLE_RE.test(text)) return "table";
  if (ORDERED_LIST_RE.test(text)) return "ordered-list";
  if (LIST_RE.test(text)) return "list";
  if (isHeading(text, unicodeMarkers)) return "heading";
  return null;
}

function commandForContext(context) {
  if (context === "checkbox") return "extension.toggleCheckboxItem";
  return null;
}

function alignOrgTableLines(lines) {
  const rows = (Array.isArray(lines) ? lines : []).map((line) => String(line || ""));
  const parsed = rows.map((line) => {
    const indent = line.match(/^\s*/)?.[0] || "";
    const trimmed = line.trim();
    if (/^\|[-+]+\|?$/.test(trimmed)) return { indent, separator: true };
    return {
      indent,
      separator: false,
      cells: trimmed.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
    };
  });
  const columnCount = parsed.reduce((max, row) => Math.max(max, row.cells?.length || 0), 0);
  const widths = Array(columnCount).fill(1);
  for (const row of parsed) {
    for (let column = 0; column < (row.cells?.length || 0); column++) {
      widths[column] = Math.max(widths[column], row.cells[column].length);
    }
  }
  return parsed.map((row) => {
    if (row.separator) return `${row.indent}|${widths.map((width) => "-".repeat(width + 2)).join("+")}|`;
    const cells = Array.from({ length: columnCount }, (_, column) => (row.cells[column] || "").padEnd(widths[column], " "));
    return `${row.indent}| ${cells.join(" | ")} |`;
  });
}

function renumberOrderedListLines(lines, targetLineIndex) {
  const result = (Array.isArray(lines) ? lines : []).map((line) => String(line || ""));
  const target = result[targetLineIndex]?.match(ORDERED_LIST_RE);
  if (!target) return result;
  const indent = target[1];
  const delimiter = target[3];
  let start = targetLineIndex;
  while (start > 0) {
    const previous = result[start - 1].match(ORDERED_LIST_RE);
    if (!previous || previous[1] !== indent || previous[3] !== delimiter) break;
    start -= 1;
  }
  let nextNumber = Number(result[start].match(ORDERED_LIST_RE)[2]);
  for (let line = start; line < result.length; line++) {
    const match = result[line].match(ORDERED_LIST_RE);
    if (!match || match[1] !== indent || match[3] !== delimiter) break;
    result[line] = result[line].replace(ORDERED_LIST_RE, `${indent}${nextNumber}${delimiter}${match[4]}`);
    nextNumber += 1;
  }
  return result;
}

module.exports = { alignOrgTableLines, classifyContext, commandForContext, renumberOrderedListLines };