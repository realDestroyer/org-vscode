"use strict";

let vscode;

function getVscode() {
  if (vscode) return vscode;
  try {
    // Only available inside the VS Code extension host.
    vscode = require("vscode");
    return vscode;
  } catch {
    return null;
  }
}

const ORG_LANG_IDS = new Set(["vso", "org", "vsorg", "org-vscode"]);

const STAR_HEADING_REGEX = /^(\s*)(\*+)\s+(.*)$/;
const UNICODE_HEADING_REGEX = /^(\s*)([⊙⊘⊖⊜⊗])\s+(.*)$/;

// Keep list parsing consistent with our grammar decision: no '*' unordered bullets.
const UNORDERED_LIST_ITEM_REGEX = /^(\s*)([-+])\s+(.*)$/;
const ORDERED_LIST_ITEM_REGEX = /^(\s*)(\d+)([.)])\s+(.*)$/;

const CHECKBOX_ITEM_REGEX = /^(\s*)((?:[-+])|(?:\d+[.)]))\s+\[( |x|X|-)\]\s*(.*)$/;
const TABLE_ROW_REGEX = /^(\s*)\|/;
const DEFAULT_UNICODE_MARKERS = ["⊙", "⊘", "⊖", "⊜", "⊗"];

function isOrgLanguageId(languageId) {
  return ORG_LANG_IDS.has(String(languageId || ""));
}

function parseHeadingLineForInsert(text, unicodeMarkers = DEFAULT_UNICODE_MARKERS) {
  const s = String(text || "");

  const star = s.match(STAR_HEADING_REGEX);
  if (star) {
    const leading = star[1] || "";
    const stars = star[2] || "*";
    return { kind: "heading", style: "star", level: stars.length, leading, marker: stars };
  }

  const uni = s.match(UNICODE_HEADING_REGEX);
  if (uni) {
    const leading = uni[1] || "";
    const symbol = uni[2] || "⊙";
    const level = Math.floor(leading.length / 2) + 1;
    return { kind: "heading", style: "unicode", level, leading, marker: symbol };
  }

  const leading = s.match(/^\s*/)?.[0] || "";
  const marker = unicodeMarkers.find((candidate) => s.slice(leading.length).startsWith(`${candidate} `));
  if (marker) {
    return { kind: "heading", style: "unicode", level: Math.floor(leading.length / 2) + 1, leading, marker };
  }

  return null;
}

function parseListItemForInsert(text) {
  const s = String(text || "");

  const checkbox = s.match(CHECKBOX_ITEM_REGEX);
  if (checkbox) {
    const leading = checkbox[1] || "";
    const bullet = checkbox[2] || "-";
    return { kind: "list", leading, bullet, isCheckbox: true };
  }

  const unordered = s.match(UNORDERED_LIST_ITEM_REGEX);
  if (unordered) {
    const leading = unordered[1] || "";
    const bullet = unordered[2] || "-";
    return { kind: "list", leading, bullet, isCheckbox: false };
  }

  const ordered = s.match(ORDERED_LIST_ITEM_REGEX);
  if (ordered) {
    const leading = ordered[1] || "";
    const n = Number(ordered[2]);
    const delim = ordered[3] || ".";
    const next = Number.isFinite(n) ? (n + 1) : 1;
    return { kind: "list", leading, bullet: `${next}${delim}`, isCheckbox: false };
  }

  return null;
}

function countOrgTableColumns(lineText) {
  const s = String(lineText || "");
  // Split on '|' and drop the leading/trailing empties.
  const parts = s.split("|");
  if (parts.length < 3) return 1;
  return Math.max(1, parts.length - 2);
}

function isHeadingLine(text, unicodeMarkers) {
  return Boolean(parseHeadingLineForInsert(text, unicodeMarkers));
}

function getHeadingLevel(text, unicodeMarkers) {
  const parsed = parseHeadingLineForInsert(text, unicodeMarkers);
  return parsed ? Math.max(1, parsed.level) : null;
}

function isListItemLine(text) {
  return Boolean(parseListItemForInsert(text));
}

function getIndentLength(text) {
  const m = String(text || "").match(/^\s*/);
  return m ? m[0].length : 0;
}

function findHeadingSubtreeEndExclusive(lines, headingLineIndex, headingLevel, unicodeMarkers) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const start = Math.max(0, Number(headingLineIndex) || 0);
  const level = Math.max(1, Number(headingLevel) || 1);

  for (let i = start + 1; i < safeLines.length; i++) {
    const l = safeLines[i];
    const lvl = getHeadingLevel(l, unicodeMarkers);
    if (lvl != null && lvl <= level) {
      return i;
    }
  }

  return safeLines.length;
}

function findListItemSubtreeEndExclusive(lines, listLineIndex, baseIndent, unicodeMarkers) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const start = Math.max(0, Number(listLineIndex) || 0);
  const indent = Math.max(0, Number(baseIndent) || 0);

  for (let i = start + 1; i < safeLines.length; i++) {
    const l = safeLines[i];
    if (isHeadingLine(l, unicodeMarkers)) {
      return i;
    }
    if (isListItemLine(l) && getIndentLength(l) <= indent) {
      return i;
    }
  }

  return safeLines.length;
}

function findNearestHeadingLineIndex(lines, fromLineIndex, unicodeMarkers) {
  const safeLines = Array.isArray(lines) ? lines : [];
  for (let i = Math.max(0, Number(fromLineIndex) || 0); i >= 0; i--) {
    if (isHeadingLine(safeLines[i], unicodeMarkers)) return i;
  }
  return null;
}

function computeSmartInsertNewElement(lines, cursorLineIndex, unicodeMarkers) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const lineIndex = Math.max(0, Number(cursorLineIndex) || 0);
  const current = safeLines[lineIndex] ?? "";

  // 1) Table row: insert a new empty row below.
  const tableMatch = String(current).match(TABLE_ROW_REGEX);
  if (tableMatch) {
    const leading = tableMatch[1] || "";
    const cols = countOrgTableColumns(String(current).trimEnd());
    const cells = Array(cols).fill("   ").join("|");
    const newLineText = `${leading}|${cells}|`;
    return {
      insertBeforeLineIndex: lineIndex + 1,
      newLineText,
      cursorColumn: newLineText.length
    };
  }

  // 2) List item: insert a new sibling item after this item's subtree.
  const list = parseListItemForInsert(current);
  if (list) {
    const subtreeEnd = findListItemSubtreeEndExclusive(safeLines, lineIndex, list.leading.length, unicodeMarkers);
    const bullet = list.bullet;
    const newLineText = list.isCheckbox
      ? `${list.leading}${bullet} [ ] `
      : `${list.leading}${bullet} `;

    return {
      insertBeforeLineIndex: subtreeEnd,
      newLineText,
      cursorColumn: newLineText.length
    };
  }

  // 3) Heading line: insert new sibling heading after this subtree.
  const heading = parseHeadingLineForInsert(current, unicodeMarkers);
  if (heading) {
    const subtreeEnd = findHeadingSubtreeEndExclusive(safeLines, lineIndex, heading.level, unicodeMarkers);
    const newLineText = `${heading.leading}${heading.marker} `;
    return {
      insertBeforeLineIndex: subtreeEnd,
      newLineText,
      cursorColumn: newLineText.length
    };
  }

  // 4) Plain text: use nearest heading context if present.
  const nearestHeading = findNearestHeadingLineIndex(safeLines, lineIndex, unicodeMarkers);
  if (nearestHeading != null) {
    const h = parseHeadingLineForInsert(safeLines[nearestHeading], unicodeMarkers);
    if (h) {
      const subtreeEnd = findHeadingSubtreeEndExclusive(safeLines, nearestHeading, h.level, unicodeMarkers);
      const newLineText = `${h.leading}${h.marker} `;
      return {
        insertBeforeLineIndex: subtreeEnd,
        newLineText,
        cursorColumn: newLineText.length
      };
    }
  }

  // 5) No context: insert a top-level star heading at cursor line.
  return {
    insertBeforeLineIndex: lineIndex,
    newLineText: "* ",
    cursorColumn: 2
  };
}

function computeMetaReturn(lines, cursorLineIndex, cursorCharacter, unicodeMarkers) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const lineIndex = Math.max(0, Number(cursorLineIndex) || 0);
  const current = String(safeLines[lineIndex] ?? "");
  const character = Math.max(0, Math.min(current.length, Number(cursorCharacter) || 0));

  if (TABLE_ROW_REGEX.test(current)) {
    return computeSmartInsertNewElement(safeLines, lineIndex, unicodeMarkers);
  }

  const list = parseListItemForInsert(current);
  const heading = parseHeadingLineForInsert(current, unicodeMarkers);
  let prefix = null;
  if (list) {
    prefix = list.isCheckbox
      ? `${list.leading}${list.bullet} [ ] `
      : `${list.leading}${list.bullet} `;
  } else if (heading) {
    prefix = `${heading.leading}${heading.marker} `;
  }

  if (prefix) {
    if (character <= prefix.length) {
      const ordered = current.match(ORDERED_LIST_ITEM_REGEX);
      const beforePrefix = ordered
        ? `${ordered[1] || ""}${ordered[2]}${ordered[3] || "."} `
        : prefix;
      return {
        insertBeforeLineIndex: lineIndex,
        newLineText: beforePrefix,
        cursorColumn: beforePrefix.length
      };
    }

    return {
      insertBeforeLineIndex: lineIndex + 1,
      newLineText: `${prefix}${current.slice(character).trimStart()}`,
      replaceCurrentLineText: current.slice(0, character).trimEnd(),
      cursorColumn: prefix.length
    };
  }

  const nearestHeading = findNearestHeadingLineIndex(safeLines, lineIndex, unicodeMarkers);
  const parent = nearestHeading == null ? null : parseHeadingLineForInsert(safeLines[nearestHeading], unicodeMarkers);
  const headingPrefix = parent ? `${parent.leading}${parent.marker} ` : "* ";
  if (character === 0) {
    return {
      replaceCurrentLineText: `${headingPrefix}${current.trimStart()}`,
      cursorColumn: headingPrefix.length
    };
  }

  return {
    insertBeforeLineIndex: lineIndex + 1,
    newLineText: `${headingPrefix}${current.slice(character).trimStart()}`,
    replaceCurrentLineText: current.slice(0, character).trimEnd(),
    cursorColumn: headingPrefix.length
  };
}

function computeInsertEditForDocument(document, insertBeforeLineIndex, newLineText) {
  const vs = getVscode();
  if (!vs) {
    throw new Error("vscode API is not available (must run inside VS Code extension host)");
  }

  const targetLine = Number(insertBeforeLineIndex);
  const docLineCount = document.lineCount;

  if (targetLine >= docLineCount) {
    const lastLine = document.lineAt(docLineCount - 1);
    const needsLeadingNewline = lastLine.text.length > 0;
    return {
      insertPosition: lastLine.range.end,
      insertText: (needsLeadingNewline ? "\n" : "") + String(newLineText || ""),
      insertedLineIndex: needsLeadingNewline ? docLineCount : (docLineCount - 1)
    };
  }

  const pos = new vs.Position(targetLine, 0);
  return {
    insertPosition: pos,
    insertText: String(newLineText || "") + "\n",
    insertedLineIndex: targetLine
  };
}

async function applyInsertCommand(computePlan) {
  const vs = getVscode();
  if (!vs) return;

  const editor = vs.window.activeTextEditor;
  if (!editor || !editor.document || !isOrgLanguageId(editor.document.languageId)) {
    return;
  }

  const doc = editor.document;
  const cursorLine = editor.selection.active.line;
  const cursorCharacter = editor.selection.active.character;
  const lines = doc.getText().split(/\r?\n/);

  const taskKeywordManager = require("./taskKeywordManager");
  const markers = taskKeywordManager.getWorkflowRegistry().states.map((state) => state.marker).filter(Boolean);
  const plan = computePlan(lines, cursorLine, cursorCharacter, markers);
  if (!plan) {
    return;
  }

  const editPlan = plan.newLineText == null
    ? null
    : computeInsertEditForDocument(doc, plan.insertBeforeLineIndex, plan.newLineText);

  const ok = await editor.edit((eb) => {
    if (plan.replaceCurrentLineText != null) {
      eb.replace(doc.lineAt(cursorLine).range, plan.replaceCurrentLineText);
    }
    if (editPlan) {
      eb.insert(editPlan.insertPosition, editPlan.insertText);
    }
  });

  if (!ok) return;

  const targetLine = editPlan ? editPlan.insertedLineIndex : cursorLine;
  const newPos = new vs.Position(targetLine, plan.cursorColumn);
  editor.selection = new vs.Selection(newPos, newPos);
  editor.revealRange(new vs.Range(newPos, newPos));
}

async function insertNewElement() {
  return applyInsertCommand((lines, line, character, markers) => (
    computeMetaReturn(lines, line, character, markers)
  ));
}

async function insertStructureAtEnd() {
  return applyInsertCommand((lines, line, _character, markers) => (
    computeSmartInsertNewElement(lines, line, markers)
  ));
}

module.exports = {
  insertNewElement,
  insertStructureAtEnd,
  computeMetaReturn,
  computeSmartInsertNewElement
};
