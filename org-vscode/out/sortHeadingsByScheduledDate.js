"use strict";

const vscode = require("vscode");
const taskKeywordManager = require("./taskKeywordManager");
const {
  isPlanningLine,
  parsePlanningFromText,
  getAcceptedDateFormats,
  momentFromTimestampContent
} = require("./orgTagUtils");

const HEADING_LINE_REGEX = /^(\s*)(\*+)\s+\S/;
const UNICODE_HEADING_LINE_REGEX = /^(\s*)([⊖⊙⊘⊜⊗])\s+\S/;

function getEolString(document) {
  return document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
}

function getSpacesPerLevel(config) {
  const spacesPerLevelRaw = config.get("adjustHeadingIndentation", 2);
  const spacesPerLevel = typeof spacesPerLevelRaw === "boolean"
    ? (spacesPerLevelRaw ? 2 : 0)
    : Math.max(0, Math.floor(Number(spacesPerLevelRaw) || 0));
  return spacesPerLevel;
}

function parseHeadingLevel(lineText, config) {
  const text = String(lineText || "");
  const mStar = text.match(HEADING_LINE_REGEX);
  const mUnicode = !mStar ? text.match(UNICODE_HEADING_LINE_REGEX) : null;
  if (!mStar && !mUnicode) return null;

  const indent = (mStar ? mStar[1] : mUnicode[1]) || "";
  const starsLen = mStar ? ((mStar[2] || "").length || 0) : 0;

  // In unicode-heading mode, hierarchy is represented by indentation rather than stars.
  // Some users also create indented * headings; treat indentation as a fallback level signal.
  const spacesPerLevel = getSpacesPerLevel(config);
  const indentLevel = (spacesPerLevel > 0)
    ? (Math.floor(indent.length / spacesPerLevel) + 1)
    : 0;

  const effective = Math.max(starsLen, indentLevel);
  return effective > 0 ? effective : null;
}

function isTaskClosedLike(lineText, planning) {
  const registry = taskKeywordManager.getWorkflowRegistry();
  const keyword = taskKeywordManager.findTaskKeyword(lineText);
  const k = String(keyword || "").toUpperCase();

  if (registry && registry.stampsClosed && registry.stampsClosed(k)) return true;
  if (registry && registry.isDoneLike && registry.isDoneLike(k)) return true;
  if (planning && planning.closed) return true;

  return false;
}

function getPlanningForHeadingFromLines(lines, headingLine) {
  const head = headingLine >= 0 && headingLine < lines.length ? String(lines[headingLine] || "") : "";
  const next = headingLine + 1 >= 0 && headingLine + 1 < lines.length ? String(lines[headingLine + 1] || "") : "";
  const combined = isPlanningLine(next) ? `${head}\n${next}` : head;
  return parsePlanningFromText(combined);
}

function findNearestHeadingAtOrAbove(lines, fromLine, config) {
  for (let i = Math.min(fromLine, lines.length - 1); i >= 0; i--) {
    const level = parseHeadingLevel(lines[i], config);
    if (level !== null) {
      return { line: i, level };
    }
  }
  return null;
}

function findParentHeadingAbove(lines, childLine, childLevel, config) {
  for (let i = Math.min(childLine - 1, lines.length - 1); i >= 0; i--) {
    const level = parseHeadingLevel(lines[i], config);
    if (level === null) continue;
    if (level < childLevel) {
      return { line: i, level };
    }
  }
  return null;
}

function findSubtreeEndExclusive(lines, startLine, startLevel, config, hardStopExclusive) {
  const stop = typeof hardStopExclusive === "number" ? Math.min(hardStopExclusive, lines.length) : lines.length;
  for (let i = startLine + 1; i < stop; i++) {
    const level = parseHeadingLevel(lines[i], config);
    if (level === null) continue;
    if (level <= startLevel) return i;
  }
  return stop;
}

function computeBlocksForHeadingStarts({ document, lines, headingStarts, scopeEndExclusive, acceptedDateFormats, config }) {
  const blocks = headingStarts.map((entry, index) => {
    const { line, level } = entry;

    const endExclusive = findSubtreeEndExclusive(lines, line, level, config, scopeEndExclusive);

    const headingText = String(lines[line] || "");
    const planning = getPlanningForHeadingFromLines(lines, line);

    let scheduledKey = Number.POSITIVE_INFINITY;
    if (planning && planning.scheduled) {
      const m = momentFromTimestampContent(planning.scheduled, acceptedDateFormats, true);
      if (m && m.isValid()) {
        scheduledKey = m.valueOf();
      }
    }

    const closedLike = isTaskClosedLike(headingText, planning);

    const startPos = new vscode.Position(line, 0);
    const endPos = new vscode.Position(endExclusive, 0);
    const range = new vscode.Range(startPos, endPos);
    const blockText = document.getText(range);

    return {
      index,
      startLine: line,
      endExclusive,
      scheduledKey,
      closedLike,
      blockText
    };
  });

  blocks.sort((a, b) => {
    if (closedToTop && a.closedLike !== b.closedLike) {
      return a.closedLike ? -1 : 1;
    }

    if (a.scheduledKey !== b.scheduledKey) {
      return a.scheduledKey < b.scheduledKey ? -1 : 1;
    }

    return a.index - b.index;
  });

  return blocks;
}

function sortHeadingsByScheduledDate() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document) return;
  if (editor.document.languageId !== "vso") return;

  const document = editor.document;
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const acceptedDateFormats = getAcceptedDateFormats(dateFormat);
  const closedToTop = Boolean(config.get("sortClosedTasksToTop", false));

  const text = document.getText();
  getEolString(document);
  const lines = text.split(/\r?\n/);

  const cursorLine = editor.selection && editor.selection.active ? editor.selection.active.line : 0;
  const current = findNearestHeadingAtOrAbove(lines, cursorLine, config);

  // If we can't find any headings, nothing to do.
  if (!current) {
    vscode.window.setStatusBarMessage("Org-vscode: No headings found to sort.", 2500);
    return;
  }

  // Prefer sorting direct children of the current heading if there are >= 2.
  const currentSubtreeEnd = findSubtreeEndExclusive(lines, current.line, current.level, config);
  const directChildren = [];

  for (let i = current.line + 1; i < currentSubtreeEnd; i++) {
    const level = parseHeadingLevel(lines[i], config);
    if (level === null) continue;
    if (level === current.level + 1) {
      directChildren.push({ line: i, level });
    }
  }

  let scopeStartLine = 0;
  let scopeEndExclusive = lines.length;
  let headingStarts = [];

  if (directChildren.length >= 2) {
    scopeStartLine = current.line + 1;
    scopeEndExclusive = currentSubtreeEnd;
    headingStarts = directChildren;
  } else {
    // Fallback: sort sibling headings at the current heading level.
    const parent = findParentHeadingAbove(lines, current.line, current.level, config);
    scopeStartLine = parent ? (parent.line + 1) : 0;
    scopeEndExclusive = parent
      ? findSubtreeEndExclusive(lines, parent.line, parent.level, config)
      : lines.length;

    for (let i = scopeStartLine; i < scopeEndExclusive; i++) {
      const level = parseHeadingLevel(lines[i], config);
      if (level === null) continue;
      if (level === current.level) {
        headingStarts.push({ line: i, level });
      }
    }
  }

  if (headingStarts.length <= 1) {
    vscode.window.setStatusBarMessage("Org-vscode: No sibling headings to sort.", 2500);
    return;
  }

  const blocks = computeBlocksForHeadingStarts({
    document,
    lines,
    headingStarts,
    scopeEndExclusive,
    acceptedDateFormats,
    config
  });

  const replaceStartLine = Math.min(...blocks.map((b) => b.startLine));
  const replaceEndExclusive = Math.max(...blocks.map((b) => b.endExclusive));

  const replaceStart = new vscode.Position(replaceStartLine, 0);
  const replaceEnd = new vscode.Position(replaceEndExclusive, 0);
  const replaceRange = new vscode.Range(replaceStart, replaceEnd);

  const newText = blocks.map((b) => b.blockText).join("");

  editor.edit((editBuilder) => {
    editBuilder.replace(replaceRange, newText);
  }).then((ok) => {
    if (!ok) {
      vscode.window.showErrorMessage("Org-vscode: Sort by scheduled date failed to apply edits.");
      return;
    }

    // If the document didn't end with a newline but our split/join logic introduced one, normalize is handled by VS Code.
    vscode.window.setStatusBarMessage("Org-vscode: Sorted headings by SCHEDULED date.", 2500);
  });
}

module.exports = {
  sortHeadingsByScheduledDate
};
