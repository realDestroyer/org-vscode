"use strict";

const CHECKBOX_RE = /^\s*(?:[-+*]|\d+[.)])\s+(\[(?: |x|X|-)\])/;
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
  const checkbox = text.match(CHECKBOX_RE);
  if (checkbox) {
    const markerStart = checkbox[0].length - checkbox[1].length;
    if (column >= markerStart && column < markerStart + checkbox[1].length) return "checkbox";
  }
  if (regexContainsCharacter(BRACKET_LINK_RE, text, column)) return "link";
  if (regexContainsCharacter(TIMESTAMP_RE, text, column)) return "timestamp";
  if (TABLE_RE.test(text)) return "table";
  if (LIST_RE.test(text)) return "list";
  if (isHeading(text, unicodeMarkers)) return "heading";
  return null;
}

function commandForContext(context) {
  if (context === "checkbox") return "extension.toggleCheckboxItem";
  if (context === "heading") return "extension.toggleStatusRight";
  if (context === "table" || context === "list") return "org-vscode.insertNewElement";
  return null;
}

module.exports = { classifyContext, commandForContext };