"use strict";

const UNICODE_HEADING_REGEX = /^\s*[⊙⊘⊜⊖⊗]\s/;
const STAR_HEADING_REGEX = /^\s*(\*+)\s/;
// Match day headings with either active <...> or inactive [...] timestamps
const DAY_HEADING_REGEX = /^\s*\*\s*[<\[]\d{4}-\d{2}-\d{2}\b/;

function getIndent(line) {
  return line.match(/^\s*/)?.[0].length || 0;
}

function parseHeadingInfo(line) {
  const indent = getIndent(line);
  const starMatch = line.match(STAR_HEADING_REGEX);
  if (starMatch) {
    return {
      kind: "star",
      indent,
      starCount: starMatch[1].length,
      isDayHeading: DAY_HEADING_REGEX.test(line)
    };
  }

  if (UNICODE_HEADING_REGEX.test(line)) {
    return {
      kind: "unicode",
      indent,
      starCount: null,
      isDayHeading: false
    };
  }

  return null;
}

function sameDepth(a, b) {
  if (!a || !b) return false;
  if (a.starCount != null && b.starCount != null) {
    return a.starCount === b.starCount && a.indent === b.indent;
  }
  return a.indent === b.indent;
}

function isOutsideSubtree(nextInfo, currentInfo) {
  if (!nextInfo || !currentInfo) return false;

  if (currentInfo.starCount != null && nextInfo.starCount != null) {
    if (nextInfo.starCount < currentInfo.starCount) return true;
    if (nextInfo.starCount === currentInfo.starCount && nextInfo.indent <= currentInfo.indent) return true;
    return false;
  }

  // Fallback: indentation-based hierarchy.
  return nextInfo.indent <= currentInfo.indent;
}

function findNearestHeadingStart(lines, cursorLine) {
  for (let i = Math.min(cursorLine, lines.length - 1); i >= 0; i--) {
    const info = parseHeadingInfo(lines[i]);
    if (info) return { startLine: i, info };
  }
  return null;
}

function findSubtreeEndExclusive(lines, startLine, startInfo) {
  for (let i = startLine + 1; i < lines.length; i++) {
    const info = parseHeadingInfo(lines[i]);
    if (info && isOutsideSubtree(info, startInfo)) {
      return i;
    }
  }
  return lines.length;
}

function findPrevSiblingStart(lines, startLine, startInfo) {
  for (let i = startLine - 1; i >= 0; i--) {
    const info = parseHeadingInfo(lines[i]);
    if (!info) continue;
    if (info.isDayHeading) continue;
    if (sameDepth(info, startInfo)) return { startLine: i, info };
  }
  return null;
}

function findNextSiblingStart(lines, endExclusive, startInfo) {
  for (let i = endExclusive; i < lines.length; i++) {
    const info = parseHeadingInfo(lines[i]);
    if (!info) continue;
    if (info.isDayHeading) continue;
    if (sameDepth(info, startInfo)) return { startLine: i, info };
    if (isOutsideSubtree(info, startInfo)) {
      // We've moved past the sibling region.
      return null;
    }
  }
  return null;
}

function computeMoveBlockResult(lines, cursorLine, direction) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  if (typeof cursorLine !== "number" || Number.isNaN(cursorLine)) return null;
  if (direction !== "up" && direction !== "down") return null;

  const heading = findNearestHeadingStart(lines, cursorLine);
  if (!heading) return null;
  if (heading.info.isDayHeading) return null;

  const startLine = heading.startLine;
  const startInfo = heading.info;
  const endExclusive = findSubtreeEndExclusive(lines, startLine, startInfo);

  const offsetInBlock = Math.max(0, cursorLine - startLine);

  if (direction === "up") {
    const prev = findPrevSiblingStart(lines, startLine, startInfo);
    if (!prev) return null;

    const prevEndExclusive = findSubtreeEndExclusive(lines, prev.startLine, prev.info);
    if (prevEndExclusive > startLine) return null;

    const before = lines.slice(0, prev.startLine);
    const prevBlock = lines.slice(prev.startLine, prevEndExclusive);
    const between = lines.slice(prevEndExclusive, startLine);
    const curBlock = lines.slice(startLine, endExclusive);
    const after = lines.slice(endExclusive);

    const updatedLines = [...before, ...curBlock, ...between, ...prevBlock, ...after];
    const newStartLine = prev.startLine;
    const newCursorLine = Math.min(updatedLines.length - 1, newStartLine + offsetInBlock);
    return { updatedLines, newCursorLine, newStartLine };
  }

  const next = findNextSiblingStart(lines, endExclusive, startInfo);
  if (!next) return null;

  const nextEndExclusive = findSubtreeEndExclusive(lines, next.startLine, next.info);

  const before = lines.slice(0, startLine);
  const curBlock = lines.slice(startLine, endExclusive);
  const between = lines.slice(endExclusive, next.startLine);
  const nextBlock = lines.slice(next.startLine, nextEndExclusive);
  const after = lines.slice(nextEndExclusive);

  const updatedLines = [...before, ...nextBlock, ...between, ...curBlock, ...after];
  const newStartLine = startLine + nextBlock.length;
  const newCursorLine = Math.min(updatedLines.length - 1, newStartLine + offsetInBlock);
  return { updatedLines, newCursorLine, newStartLine };
}

function computeMoveBlockRangeResult(lines, selectionStartLine, selectionEndLineInclusive, direction) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  if (typeof selectionStartLine !== "number" || Number.isNaN(selectionStartLine)) return null;
  if (typeof selectionEndLineInclusive !== "number" || Number.isNaN(selectionEndLineInclusive)) return null;
  if (direction !== "up" && direction !== "down") return null;

  const startLineClamped = Math.max(0, Math.min(lines.length - 1, selectionStartLine));
  const endLineClamped = Math.max(0, Math.min(lines.length - 1, selectionEndLineInclusive));

  const heading = findNearestHeadingStart(lines, startLineClamped);
  if (!heading) return null;
  if (heading.info.isDayHeading) return null;

  const groupStartLine = heading.startLine;
  const groupInfo = heading.info;

  // Expand selection to include consecutive sibling subtrees at the same depth.
  let groupEndExclusive = findSubtreeEndExclusive(lines, groupStartLine, groupInfo);
  let cursor = groupEndExclusive;
  while (true) {
    if (cursor > endLineClamped) break;
    const nextInfo = parseHeadingInfo(lines[cursor]);
    if (!nextInfo) {
      cursor++;
      continue;
    }
    if (nextInfo.isDayHeading) break;
    if (!sameDepth(nextInfo, groupInfo)) break;

    const nextEnd = findSubtreeEndExclusive(lines, cursor, nextInfo);
    groupEndExclusive = nextEnd;
    cursor = nextEnd;
  }

  const offsetInGroup = Math.max(0, startLineClamped - groupStartLine);

  if (direction === "up") {
    const prev = findPrevSiblingStart(lines, groupStartLine, groupInfo);
    if (!prev) return null;

    const prevEndExclusive = findSubtreeEndExclusive(lines, prev.startLine, prev.info);
    if (prevEndExclusive > groupStartLine) return null;

    const before = lines.slice(0, prev.startLine);
    const prevBlock = lines.slice(prev.startLine, prevEndExclusive);
    const between = lines.slice(prevEndExclusive, groupStartLine);
    const groupBlock = lines.slice(groupStartLine, groupEndExclusive);
    const after = lines.slice(groupEndExclusive);

    const updatedLines = [...before, ...groupBlock, ...between, ...prevBlock, ...after];
    const newStartLine = prev.startLine;
    const newCursorLine = Math.min(updatedLines.length - 1, newStartLine + offsetInGroup);
    const newSelectionStartLine = newStartLine;
    const newSelectionEndLineExclusive = newStartLine + groupBlock.length;
    return { updatedLines, newCursorLine, newStartLine, newSelectionStartLine, newSelectionEndLineExclusive };
  }

  const next = findNextSiblingStart(lines, groupEndExclusive, groupInfo);
  if (!next) return null;

  const nextEndExclusive = findSubtreeEndExclusive(lines, next.startLine, next.info);

  const before = lines.slice(0, groupStartLine);
  const groupBlock = lines.slice(groupStartLine, groupEndExclusive);
  const between = lines.slice(groupEndExclusive, next.startLine);
  const nextBlock = lines.slice(next.startLine, nextEndExclusive);
  const after = lines.slice(nextEndExclusive);

  const updatedLines = [...before, ...nextBlock, ...between, ...groupBlock, ...after];
  const newStartLine = groupStartLine + nextBlock.length;
  const newCursorLine = Math.min(updatedLines.length - 1, newStartLine + offsetInGroup);
  const newSelectionStartLine = newStartLine;
  const newSelectionEndLineExclusive = newStartLine + groupBlock.length;
  return { updatedLines, newCursorLine, newStartLine, newSelectionStartLine, newSelectionEndLineExclusive };
}

module.exports = {
  parseHeadingInfo,
  findNearestHeadingStart,
  findSubtreeEndExclusive,
  computeMoveBlockResult,
  computeMoveBlockRangeResult
};
