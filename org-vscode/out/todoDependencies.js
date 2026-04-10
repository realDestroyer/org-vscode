"use strict";

const taskKeywordManager = require("./taskKeywordManager");
const { parseHeadingInfo, findSubtreeEndExclusive } = require("./moveBlockUtils");

function findIncompleteChildTask(lines, headingLineIndex, workflowRegistry) {
  const safeLines = Array.isArray(lines) ? lines : [];
  if (!safeLines.length) return null;
  if (!Number.isInteger(headingLineIndex) || headingLineIndex < 0 || headingLineIndex >= safeLines.length) {
    return null;
  }

  const startInfo = parseHeadingInfo(safeLines[headingLineIndex]);
  if (!startInfo) return null;

  const endExclusive = findSubtreeEndExclusive(safeLines, headingLineIndex, startInfo);
  for (let i = headingLineIndex + 1; i < endExclusive; i++) {
    const info = parseHeadingInfo(safeLines[i]);
    if (!info) continue;

    const keyword = taskKeywordManager.findTaskKeyword(safeLines[i]);
    if (!keyword) continue;
    if (!workflowRegistry.isDoneLike(keyword)) {
      return {
        lineNumber: i + 1,
        keyword,
        lineText: String(safeLines[i] || "").trim()
      };
    }
  }

  return null;
}

module.exports = {
  findIncompleteChildTask
};
