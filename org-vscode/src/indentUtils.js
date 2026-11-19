"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDesiredIndentForNewLine = computeDesiredIndentForNewLine;
exports.normalizeBodyIndentation = normalizeBodyIndentation;

function leadingWhitespace(text) {
  const match = String(text || "").match(/^\s*/);
  return match ? match[0] : "";
}

function isHeadingLine(text) {
  const line = String(text || "");
  // Asterisk-mode headings: "* ", "** ", etc.
  if (/^\s*\*+\s+/.test(line)) return true;
  // Unicode-mode headings: "⊙ ", "⊘ ", etc.
  if (/^\s*[⊙⊘⊖⊜⊗]\s/.test(line)) return true;
  return false;
}

function normalizeBodyIndentation(raw, defaultCount = 2) {
  const fallback = Math.max(0, Math.floor(Number(defaultCount) || 0));
  const count = Math.max(0, Math.floor(Number(raw) || 0));
  // If caller passes undefined/null/NaN, honor fallback.
  const finalCount = (raw === undefined || raw === null || Number.isNaN(Number(raw))) ? fallback : count;
  return " ".repeat(finalCount);
}

/**
 * Computes the desired indentation for a newly created line.
 *
 * Behavior:
 * - If the nearest previous non-empty line is a heading, indent to heading indent + 2 spaces.
 * - Otherwise, keep the indentation of that nearest previous non-empty line.
 *
 * @param {(lineIndex: number) => string} getLineText
 * @param {number} lineIndex The current line index (0-based) where indent is being computed.
 * @param {{ bodyIndent?: string }} [options]
 * @returns {string}
 */
function computeDesiredIndentForNewLine(getLineText, lineIndex, options) {
  const bodyIndent = (options && typeof options.bodyIndent === "string") ? options.bodyIndent : "  ";

  for (let i = lineIndex - 1; i >= 0; i--) {
    const text = String(getLineText(i) || "");
    if (!text.trim()) continue;

    const baseIndent = leadingWhitespace(text);
    if (isHeadingLine(text)) return baseIndent + bodyIndent;
    return baseIndent;
  }

  return "";
}
