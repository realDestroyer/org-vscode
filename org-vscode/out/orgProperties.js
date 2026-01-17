"use strict";

const { isPlanningLine } = require("./orgTagUtils");

// Matches org headings in this extension's v2 style:
// - optional unicode status prefix
// - then one or more asterisks + whitespace
const HEADING_LINE_REGEX = /^\s*(?:[⊙⊘⊜⊖⊗]\s*)?\*+\s+/;

const PROPERTY_DRAWER_BEGIN_RE = /^\s*:PROPERTIES:\s*$/i;
const DRAWER_END_RE = /^\s*:END:\s*$/i;

// File-level property, e.g.:
// #+PROPERTY: CATEGORY Work
// #+PROPERTY: Effort 0:30
const FILE_PROPERTY_RE = /^\s*#\+PROPERTY:\s*([A-Za-z0-9_@#%\-]+)\s*(.*?)\s*$/i;

// Capture groups:
// 1) indent
// 2) key
// 3) value
const PROPERTY_LINE_RE = /^(\s*):([A-Za-z0-9_@#%\-]+):\s*(.*?)\s*$/;

function isHeadingLine(text) {
  return HEADING_LINE_REGEX.test(String(text || ""));
}

function getHeadingLevel(lineText) {
  const m = String(lineText || "").match(/^\s*(?:[⊙⊘⊜⊖⊗]\s*)?(\*+)\s+/);
  return m ? m[1].length : null;
}

function findNearestHeadingLine(lines, fromLine) {
  for (let i = Math.max(0, fromLine); i >= 0; i--) {
    if (isHeadingLine(lines[i])) return i;
  }
  return null;
}

function getHeadingIndent(lineText) {
  return String(lineText || "").match(/^\s*/)?.[0] || "";
}

function normalizePropertyKey(key) {
  return String(key || "").trim().toUpperCase();
}

function parseFileProperties(lines) {
  const props = new Map();
  for (const line of lines) {
    const m = String(line || "").match(FILE_PROPERTY_RE);
    if (!m) continue;

    const key = normalizePropertyKey(m[1]);
    if (!key) continue;

    const value = (m[2] || "").trim();
    // If multiple #+PROPERTY lines exist for same key, last one wins.
    props.set(key, value);
  }
  return props;
}

function findParentHeadingLineIndices(lines, headingLineIndex) {
  const parents = [];
  if (headingLineIndex == null || headingLineIndex < 0 || headingLineIndex >= lines.length) return parents;

  let currentLevel = getHeadingLevel(lines[headingLineIndex]);
  if (currentLevel == null) return parents;

  let searchFrom = headingLineIndex - 1;
  while (searchFrom >= 0) {
    let found = false;
    for (let i = searchFrom; i >= 0; i--) {
      const level = getHeadingLevel(lines[i]);
      if (level == null) continue;
      if (level < currentLevel) {
        parents.push(i);
        currentLevel = level;
        searchFrom = i - 1;
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  return parents;
}

function isDrawerBegin(text) {
  return PROPERTY_DRAWER_BEGIN_RE.test(String(text || ""));
}

function isDrawerEnd(text) {
  return DRAWER_END_RE.test(String(text || ""));
}

function findPropertyDrawerRange(lines, headingLineIndex) {
  if (headingLineIndex == null || headingLineIndex < 0 || headingLineIndex >= lines.length) {
    return null;
  }

  let i = headingLineIndex + 1;

  // Skip consecutive planning lines directly under the heading.
  while (i < lines.length && isPlanningLine(lines[i])) {
    i++;
  }

  // Only treat a drawer as "the heading's property drawer" if it appears immediately
  // at the top of the entry (after optional planning lines). If we hit content or a
  // new heading first, abort.
  while (i < lines.length) {
    const t = lines[i];

    if (isDrawerBegin(t)) {
      const beginLine = i;
      let endLine = null;
      for (let j = i + 1; j < lines.length; j++) {
        if (isDrawerEnd(lines[j])) {
          endLine = j;
          break;
        }
      }
      if (endLine == null) return null;
      return { beginLine, endLine };
    }

    if (!String(t || "").trim()) {
      // If the entry begins with blank lines, allow drawer right after.
      i++;
      continue;
    }

    if (isHeadingLine(t)) {
      return null;
    }

    // First non-blank, non-drawer content means no property drawer at the top.
    return null;
  }

  return null;
}

function parsePropertyDrawer(lines, headingLineIndex) {
  const range = findPropertyDrawerRange(lines, headingLineIndex);
  if (!range) {
    return { range: null, properties: new Map(), indent: null, keyLineMap: new Map() };
  }

  const beginText = lines[range.beginLine] || "";
  const indent = beginText.match(/^\s*/)?.[0] || "";

  const properties = new Map();
  const keyLineMap = new Map();

  for (let i = range.beginLine + 1; i < range.endLine; i++) {
    const m = (lines[i] || "").match(PROPERTY_LINE_RE);
    if (!m) continue;

    const rawKey = m[2];
    const key = normalizePropertyKey(rawKey);

    // Ignore drawer markers accidentally matched as properties.
    if (key === "PROPERTIES" || key === "END") continue;

    const value = m[3] || "";
    properties.set(key, value);
    keyLineMap.set(key, i);
  }

  return { range, properties, indent, keyLineMap };
}

function computeInsertionLineAfterPlanning(lines, headingLineIndex) {
  let i = headingLineIndex + 1;
  while (i < lines.length && isPlanningLine(lines[i])) i++;
  return i;
}

function setPropertyInLines(lines, headingLineIndex, key, value) {
  const normalizedKey = normalizePropertyKey(key);
  const normalizedValue = String(value ?? "");

  if (!normalizedKey) {
    return { lines, changed: false };
  }

  const nextLines = lines.slice();

  const parsed = parsePropertyDrawer(nextLines, headingLineIndex);

  // 1) Existing drawer + property line: replace
  if (parsed.range && parsed.keyLineMap.has(normalizedKey)) {
    const lineIndex = parsed.keyLineMap.get(normalizedKey);
    const existingLine = nextLines[lineIndex] || "";
    const indent = existingLine.match(/^\s*/)?.[0] || parsed.indent || "";

    const newLine = normalizedValue.trim().length
      ? `${indent}:${normalizedKey}: ${normalizedValue}`
      : `${indent}:${normalizedKey}:`;

    if (newLine !== existingLine) {
      nextLines[lineIndex] = newLine;
      return { lines: nextLines, changed: true };
    }

    return { lines: nextLines, changed: false };
  }

  // 2) Existing drawer but missing property: insert before :END:
  if (parsed.range) {
    const indent = parsed.indent || getHeadingIndent(nextLines[headingLineIndex]) + "  ";
    const newLine = normalizedValue.trim().length
      ? `${indent}:${normalizedKey}: ${normalizedValue}`
      : `${indent}:${normalizedKey}:`;

    nextLines.splice(parsed.range.endLine, 0, newLine);
    return { lines: nextLines, changed: true };
  }

  // 3) No drawer: insert a new drawer block at top of entry
  const headingIndent = getHeadingIndent(nextLines[headingLineIndex]);
  const drawerIndent = `${headingIndent}  `;

  const insertAt = computeInsertionLineAfterPlanning(nextLines, headingLineIndex);
  const block = [
    `${drawerIndent}:PROPERTIES:`,
    normalizedValue.trim().length
      ? `${drawerIndent}:${normalizedKey}: ${normalizedValue}`
      : `${drawerIndent}:${normalizedKey}:`,
    `${drawerIndent}:END:`
  ];

  nextLines.splice(insertAt, 0, ...block);
  return { lines: nextLines, changed: true };
}

function deletePropertyInLines(lines, headingLineIndex, key) {
  const normalizedKey = normalizePropertyKey(key);
  if (!normalizedKey) return { lines, changed: false, removedDrawer: false };

  const nextLines = lines.slice();
  const parsed = parsePropertyDrawer(nextLines, headingLineIndex);
  if (!parsed.range) return { lines: nextLines, changed: false, removedDrawer: false };

  const lineIndex = parsed.keyLineMap.get(normalizedKey);
  if (lineIndex == null) return { lines: nextLines, changed: false, removedDrawer: false };

  nextLines.splice(lineIndex, 1);

  // Re-parse to see if drawer is now empty (no properties between markers).
  const reparsed = parsePropertyDrawer(nextLines, headingLineIndex);
  let hasAny = false;
  if (reparsed.range) {
    for (let i = reparsed.range.beginLine + 1; i < reparsed.range.endLine; i++) {
      const m = (nextLines[i] || "").match(PROPERTY_LINE_RE);
      if (m) {
        const k = normalizePropertyKey(m[2]);
        if (k !== "PROPERTIES" && k !== "END") {
          hasAny = true;
          break;
        }
      }
    }
  }

  if (!hasAny && reparsed.range) {
    // Remove entire drawer marker block.
    const count = reparsed.range.endLine - reparsed.range.beginLine + 1;
    nextLines.splice(reparsed.range.beginLine, count);
    return { lines: nextLines, changed: true, removedDrawer: true };
  }

  return { lines: nextLines, changed: true, removedDrawer: false };
}

function getPropertyFromLines(lines, headingLineIndex, key) {
  const normalizedKey = normalizePropertyKey(key);
  if (!normalizedKey) return null;

  const parsed = parsePropertyDrawer(lines, headingLineIndex);
  return parsed.properties.get(normalizedKey) ?? null;
}

function getPropertyFromLinesWithInheritance(lines, headingLineIndex, key) {
  const normalizedKey = normalizePropertyKey(key);
  if (!normalizedKey) return null;

  // 1) Current entry
  const local = getPropertyFromLines(lines, headingLineIndex, normalizedKey);
  if (local != null) return local;

  // 2) Parent headings (closest first)
  const parents = findParentHeadingLineIndices(lines, headingLineIndex);
  for (const parentIndex of parents) {
    const v = getPropertyFromLines(lines, parentIndex, normalizedKey);
    if (v != null) return v;
  }

  // 3) File-level defaults
  const fileProps = parseFileProperties(lines);
  return fileProps.get(normalizedKey) ?? null;
}

function getAllPropertyKeysWithInheritance(lines, headingLineIndex) {
  const keys = new Set();

  // current
  const current = parsePropertyDrawer(lines, headingLineIndex);
  for (const k of current.properties.keys()) keys.add(k);

  // parents
  const parents = findParentHeadingLineIndices(lines, headingLineIndex);
  for (const parentIndex of parents) {
    const parsed = parsePropertyDrawer(lines, parentIndex);
    for (const k of parsed.properties.keys()) keys.add(k);
  }

  // file
  const fileProps = parseFileProperties(lines);
  for (const k of fileProps.keys()) keys.add(k);

  return Array.from(keys);
}

function ensureIdInLines(lines, headingLineIndex, generateId) {
  const existing = getPropertyFromLines(lines, headingLineIndex, "ID");
  if (existing != null && String(existing).trim().length) {
    return { id: String(existing), lines: lines.slice(), changed: false };
  }

  const id = typeof generateId === "function" ? String(generateId()) : "";
  if (!id.trim()) {
    return { id: null, lines: lines.slice(), changed: false };
  }

  const result = setPropertyInLines(lines, headingLineIndex, "ID", id);
  return { id, lines: result.lines, changed: result.changed };
}

module.exports = {
  HEADING_LINE_REGEX,
  PROPERTY_DRAWER_BEGIN_RE,
  DRAWER_END_RE,
  PROPERTY_LINE_RE,
  FILE_PROPERTY_RE,
  isHeadingLine,
  getHeadingLevel,
  findNearestHeadingLine,
  findParentHeadingLineIndices,
  parseFileProperties,
  parsePropertyDrawer,
  setPropertyInLines,
  deletePropertyInLines,
  getPropertyFromLines,
  getPropertyFromLinesWithInheritance,
  getAllPropertyKeysWithInheritance,
  ensureIdInLines,
  normalizePropertyKey
};
