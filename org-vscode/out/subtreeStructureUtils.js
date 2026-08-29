"use strict";

const {
  findNearestHeadingStart,
  findSubtreeEndExclusive,
  parseHeadingInfo
} = require("./moveBlockUtils");

function changeHeadingLevel(line, delta, spacesPerLevel = 2, unicodeMarkers) {
  const info = parseHeadingInfo(line, unicodeMarkers);
  if (!info || delta === 0) return line;

  if (info.kind === "star") {
    const nextLevel = info.starCount + delta;
    if (nextLevel < 1) return null;
    return line.replace(/^(\s*)\*+/, `$1${"*".repeat(nextLevel)}`);
  }

  if (spacesPerLevel <= 0) return null;
  const indentationDelta = delta * spacesPerLevel;
  const nextIndent = info.indent + indentationDelta;
  if (nextIndent < 0) return null;
  return `${" ".repeat(nextIndent)}${line.slice(info.indent)}`;
}

function relevelSubtreeLines(lines, delta, spacesPerLevel = 2, unicodeMarkers) {
  if (!Array.isArray(lines) || !Number.isInteger(delta)) return null;

  const updatedLines = [];
  for (const line of lines) {
    const updated = changeHeadingLevel(line, delta, spacesPerLevel, unicodeMarkers);
    if (updated === null) return null;
    updatedLines.push(updated);
  }
  return updatedLines;
}

function computeSubtreeLevelResult(lines, cursorLine, delta, spacesPerLevel = 2, unicodeMarkers) {
  if (!Array.isArray(lines) || !lines.length || !Number.isInteger(delta) || delta === 0) return null;

  const heading = findNearestHeadingStart(lines, cursorLine, unicodeMarkers);
  if (!heading || heading.info.isDayHeading) return null;
  const endExclusive = findSubtreeEndExclusive(lines, heading.startLine, heading.info, unicodeMarkers);
  const subtreeLines = relevelSubtreeLines(lines.slice(heading.startLine, endExclusive), delta, spacesPerLevel, unicodeMarkers);
  if (!subtreeLines) return null;

  return {
    updatedLines: [
      ...lines.slice(0, heading.startLine),
      ...subtreeLines,
      ...lines.slice(endExclusive)
    ],
    startLine: heading.startLine,
    endExclusive,
    newCursorLine: cursorLine
  };
}

function computeRefilePlan(sourceLines, cursorLine, targetLines, targetLine, sameDocument, spacesPerLevel = 2, unicodeMarkers) {
  const source = findNearestHeadingStart(sourceLines, cursorLine, unicodeMarkers);
  const targetInfo = parseHeadingInfo(targetLines?.[targetLine], unicodeMarkers);
  if (!source || source.info.isDayHeading || !targetInfo) return null;

  const rawSourceEndExclusive = findSubtreeEndExclusive(sourceLines, source.startLine, source.info, unicodeMarkers);
  const sourceEndExclusive = rawSourceEndExclusive === sourceLines.length && sourceLines.at(-1) === ""
    ? rawSourceEndExclusive - 1
    : rawSourceEndExclusive;
  if (sameDocument && targetLine >= source.startLine && targetLine < sourceEndExclusive) return null;

  if (spacesPerLevel <= 0 && (source.info.starCount === null || targetInfo.starCount === null)) return null;
  const sourceLevel = source.info.starCount ?? (Math.floor(source.info.indent / spacesPerLevel) + 1);
  const targetLevel = targetInfo.starCount ?? (Math.floor(targetInfo.indent / spacesPerLevel) + 1);
  const subtreeLines = relevelSubtreeLines(
    sourceLines.slice(source.startLine, sourceEndExclusive),
    targetLevel + 1 - sourceLevel,
    spacesPerLevel,
    unicodeMarkers
  );
  if (!subtreeLines) return null;

  const rawTargetInsertLine = findSubtreeEndExclusive(targetLines, targetLine, targetInfo, unicodeMarkers);
  const targetInsertLine = rawTargetInsertLine === targetLines.length && targetLines.at(-1) === ""
    ? rawTargetInsertLine - 1
    : rawTargetInsertLine;

  return {
    sourceStartLine: source.startLine,
    sourceEndExclusive,
    targetInsertLine,
    subtreeLines
  };
}

module.exports = {
  changeHeadingLevel,
  computeRefilePlan,
  computeSubtreeLevelResult,
  relevelSubtreeLines
};