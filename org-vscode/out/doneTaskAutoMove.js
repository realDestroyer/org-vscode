"use strict";

// Auto-move newly completed tasks (done-like keyword) directly under the last done-like
// sibling in the current sibling group, when Org-vscode.sortClosedTasksToTop is enabled.

const taskKeywordManager = require("./taskKeywordManager");

const HEADING_LINE_REGEX = /^(\s*)(\*+)\s+\S/;
const UNICODE_HEADING_LINE_REGEX = /^(\s*)([⊖⊙⊘⊜⊗])\s+\S/;

function getEolString(document, vscode) {
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

  const spacesPerLevel = getSpacesPerLevel(config);
  const indentLevel = (spacesPerLevel > 0)
    ? (Math.floor(indent.length / spacesPerLevel) + 1)
    : 0;

  const effective = Math.max(starsLen, indentLevel);
  return effective > 0 ? effective : null;
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

function isDoneLikeHeadingLine(lineText, registry) {
  const keyword = taskKeywordManager.findTaskKeyword(lineText);
  if (!keyword) return false;
  return !!(registry && registry.isDoneLike && registry.isDoneLike(keyword));
}

function findLineIndexNear(lines, approxIndex, targetLineText, radius = 60) {
  if (!targetLineText) return -1;
  const start = Math.max(0, Math.min(lines.length - 1, approxIndex) - radius);
  const end = Math.min(lines.length - 1, Math.min(lines.length - 1, approxIndex) + radius);
  for (let i = start; i <= end; i++) {
    if (lines[i] === targetLineText) return i;
  }
  // Fallback: scan whole document (rare; used when previous edits shifted far).
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === targetLineText) return i;
  }
  return -1;
}

function isClosedToTopEnabled(vscode) {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const configLower = vscode.workspace.getConfiguration("org-vscode");
  return Boolean(config.get("sortClosedTasksToTop", configLower.get("sortClosedTasksToTop", false)));
}

function getHeadingLineText(lines, lineIndex) {
  if (!Number.isInteger(lineIndex) || lineIndex < 0 || lineIndex >= lines.length) return null;
  return String(lines[lineIndex] || "");
}

function getBlockText(document, vscode, startLine, endExclusive) {
  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endExclusive, 0);
  const range = new vscode.Range(startPos, endPos);
  return { range, text: document.getText(range) };
}

async function applyAutoMoveDoneInternal(document, approxLineIndex, expectedHeadingLineText = null, returnNewLineNumber = false) {
  let vscode;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    vscode = require("vscode");
  } catch {
    return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
  }

  if (!document || document.languageId !== "vso") {
    return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
  }
  if (!isClosedToTopEnabled(vscode)) {
    return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
  }

  const registry = taskKeywordManager.getWorkflowRegistry();
  const config = vscode.workspace.getConfiguration("Org-vscode");

  const text = document.getText();
  const lines = text.split(/\r?\n/);

  let headingLineIndex = -1;
  if (expectedHeadingLineText) {
    headingLineIndex = findLineIndexNear(lines, approxLineIndex, expectedHeadingLineText);
  }

  const heading = (headingLineIndex >= 0)
    ? { line: headingLineIndex, level: parseHeadingLevel(lines[headingLineIndex], config) }
    : findNearestHeadingAtOrAbove(lines, approxLineIndex, config);

  if (!heading || heading.level === null) {
    return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
  }
  if (!isDoneLikeHeadingLine(lines[heading.line], registry)) {
    return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
  }

  const parent = findParentHeadingAbove(lines, heading.line, heading.level, config);
  const parentHeadingText = parent ? getHeadingLineText(lines, parent.line) : null;
  const scopeStartLine = parent ? (parent.line + 1) : 0;
  const scopeEndExclusive = parent
    ? findSubtreeEndExclusive(lines, parent.line, parent.level, config)
    : lines.length;

  const siblingStarts = [];
  for (let i = scopeStartLine; i < scopeEndExclusive; i++) {
    const lvl = parseHeadingLevel(lines[i], config);
    if (lvl === null) continue;
    if (lvl === heading.level) siblingStarts.push(i);
  }
  if (siblingStarts.length <= 1) {
    return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
  }

  const blocks = siblingStarts.map((startLine) => {
    const endExclusive = findSubtreeEndExclusive(lines, startLine, heading.level, config, scopeEndExclusive);
    return {
      startLine,
      endExclusive,
      doneLike: isDoneLikeHeadingLine(lines[startLine], registry),
      headingText: getHeadingLineText(lines, startLine)
    };
  });

  const movingIndex = blocks.findIndex((b) => b.startLine === heading.line);
  if (movingIndex === -1) {
    return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
  }

  // Determine the done-like prefix among siblings, excluding the moving block.
  const nonMoving = blocks.filter((b) => b.startLine !== heading.line);
  if (!nonMoving.length) {
    return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
  }

  let donePrefixLen = 0;
  for (const b of nonMoving) {
    if (!b.doneLike) break;
    donePrefixLen++;
  }

  // If the moving block is already within the prefix and at its end, do nothing.
  // We aim to position it at the end of the done-like prefix.
  const movingIsDoneLike = blocks[movingIndex].doneLike;
  if (!movingIsDoneLike) {
    return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
  }

  const currentInNonMovingOrder = (() => {
    // Compute the moving block's index if we remove it.
    let idx = 0;
    for (const b of blocks) {
      if (b.startLine === heading.line) return idx;
      idx++;
    }
    return -1;
  })();
  // If the moving block is already immediately after the done prefix (i.e., last done-like), no move.
  // This is hard to compute perfectly without rebuilding, so we rely on anchor comparisons below.

  // Anchor is the first non-done block after the done prefix (excluding the moving block).
  const anchor = donePrefixLen < nonMoving.length ? nonMoving[donePrefixLen] : null;

  const moving = blocks[movingIndex];
  const movingBlock = getBlockText(document, vscode, moving.startLine, moving.endExclusive);

  // Step 1: delete the moving block.
  {
    const delEdit = new vscode.WorkspaceEdit();
    delEdit.delete(document.uri, movingBlock.range);
    const ok = await vscode.workspace.applyEdit(delEdit);
    if (!ok) return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
  }

  // Re-read after deletion.
  const afterDeleteText = document.getText();
  const afterDeleteLines = afterDeleteText.split(/\r?\n/);

  // Re-locate parent scope in the new document (for end insertion cases).
  const parentInAfter = (() => {
    if (!parentHeadingText) return null;
    const idx = findLineIndexNear(afterDeleteLines, Math.min(scopeStartLine, afterDeleteLines.length - 1), parentHeadingText);
    if (idx < 0) return null;
    const lvl = parseHeadingLevel(afterDeleteLines[idx], config);
    if (lvl === null) return null;
    return { line: idx, level: lvl };
  })();

  const scopeStartAfter = parentInAfter ? (parentInAfter.line + 1) : 0;
  const scopeEndAfter = parentInAfter
    ? findSubtreeEndExclusive(afterDeleteLines, parentInAfter.line, parentInAfter.level, config)
    : afterDeleteLines.length;

  // Step 2: insert at the desired position.
  let insertPos = null;
  if (anchor && anchor.headingText) {
    const anchorLine = findLineIndexNear(afterDeleteLines, Math.min(anchor.startLine, afterDeleteLines.length - 1), anchor.headingText);
    if (anchorLine >= 0) {
      insertPos = new vscode.Position(anchorLine, 0);
    }
  }

  if (!insertPos) {
    // Insert at the end of the sibling scope (after the last remaining sibling subtree).
    const lastSibling = nonMoving[nonMoving.length - 1];
    const lastLine = lastSibling?.headingText
      ? findLineIndexNear(afterDeleteLines, Math.min(lastSibling.startLine, afterDeleteLines.length - 1), lastSibling.headingText)
      : -1;
    if (lastLine >= 0) {
      const lastLevel = parseHeadingLevel(afterDeleteLines[lastLine], config);
      const endExclusive = lastLevel
        ? findSubtreeEndExclusive(afterDeleteLines, lastLine, lastLevel, config, scopeEndAfter)
        : scopeEndAfter;
      insertPos = new vscode.Position(endExclusive, 0);
    } else {
      insertPos = new vscode.Position(scopeEndAfter, 0);
    }
  }

  {
    const insEdit = new vscode.WorkspaceEdit();
    insEdit.insert(document.uri, insertPos, movingBlock.text);
    const ok = await vscode.workspace.applyEdit(insEdit);
    if (!ok) {
      return returnNewLineNumber ? { applied: false, newLineNumber: null } : false;
    }
    const newLineNumber = (insertPos && Number.isFinite(insertPos.line)) ? (insertPos.line + 1) : null;
    return returnNewLineNumber ? { applied: true, newLineNumber } : true;
  }
}

/**
 * Apply a minimal move (delete + insert) for a newly-completed task.
 * This tends to preserve folding better than replacing the entire sibling region.
 *
 * @param {import('vscode').TextDocument} document
 * @param {number} approxLineIndex 0-based
 * @param {string|null} expectedHeadingLineText exact heading line text after completion (optional)
 * @returns {Promise<boolean>} true if an edit was applied
 */
async function applyAutoMoveDone(document, approxLineIndex, expectedHeadingLineText = null) {
  return await applyAutoMoveDoneInternal(document, approxLineIndex, expectedHeadingLineText, false);
}

/**
 * Like applyAutoMoveDone(), but also returns the new 1-based line number of the moved heading.
 *
 * @param {import('vscode').TextDocument} document
 * @param {number} approxLineIndex 0-based
 * @param {string|null} expectedHeadingLineText exact heading line text after completion (optional)
 * @returns {Promise<{ applied: boolean, newLineNumber: number | null }>} result
 */
async function applyAutoMoveDoneWithResult(document, approxLineIndex, expectedHeadingLineText = null) {
  const res = await applyAutoMoveDoneInternal(document, approxLineIndex, expectedHeadingLineText, true);
  return res && typeof res === 'object' ? res : { applied: false, newLineNumber: null };
}

/**
 * Computes a single replace edit that moves the done-like heading block to the end of the
 * contiguous done-like prefix within its sibling group.
 *
 * @param {import('vscode').TextDocument} document
 * @param {number} approxLineIndex 0-based
 * @param {string|null} expectedHeadingLineText exact heading line text after completion (optional)
 * @returns {{ range: import('vscode').Range, newText: string } | null}
 */
function computeAutoMoveDoneEdit(document, approxLineIndex, expectedHeadingLineText = null) {
  let vscode;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    vscode = require("vscode");
  } catch {
    return null;
  }

  if (!document) return null;
  if (document.languageId !== "vso") return null;
  if (!isClosedToTopEnabled(vscode)) return null;

  const registry = taskKeywordManager.getWorkflowRegistry();
  const config = vscode.workspace.getConfiguration("Org-vscode");

  const text = document.getText();
  const lines = text.split(/\r?\n/);

  let headingLineIndex = -1;
  if (expectedHeadingLineText) {
    headingLineIndex = findLineIndexNear(lines, approxLineIndex, expectedHeadingLineText);
  }

  const heading = (headingLineIndex >= 0)
    ? { line: headingLineIndex, level: parseHeadingLevel(lines[headingLineIndex], config) }
    : findNearestHeadingAtOrAbove(lines, approxLineIndex, config);

  if (!heading || heading.level === null) return null;
  if (!isDoneLikeHeadingLine(lines[heading.line], registry)) return null;

  const parent = findParentHeadingAbove(lines, heading.line, heading.level, config);
  const scopeStartLine = parent ? (parent.line + 1) : 0;
  const scopeEndExclusive = parent
    ? findSubtreeEndExclusive(lines, parent.line, parent.level, config)
    : lines.length;

  const siblingStarts = [];
  for (let i = scopeStartLine; i < scopeEndExclusive; i++) {
    const lvl = parseHeadingLevel(lines[i], config);
    if (lvl === null) continue;
    if (lvl === heading.level) {
      siblingStarts.push(i);
    }
  }

  if (siblingStarts.length <= 1) return null;

  const blocks = siblingStarts.map((startLine) => {
    const endExclusive = findSubtreeEndExclusive(lines, startLine, heading.level, config, scopeEndExclusive);
    const startPos = new vscode.Position(startLine, 0);
    const endPos = new vscode.Position(endExclusive, 0);
    const range = new vscode.Range(startPos, endPos);
    const blockText = document.getText(range);

    return {
      startLine,
      endExclusive,
      doneLike: isDoneLikeHeadingLine(lines[startLine], registry),
      blockText
    };
  });

  const currentIndex = blocks.findIndex((b) => b.startLine === heading.line);
  if (currentIndex === -1) return null;

  // Determine the contiguous done-like prefix at the start of the sibling set.
  let donePrefixEnd = 0;
  while (donePrefixEnd < blocks.length && blocks[donePrefixEnd].doneLike) {
    donePrefixEnd++;
  }

  // Place the newly-done block at the end of the done prefix.
  let insertIndex = donePrefixEnd;
  if (currentIndex < insertIndex) insertIndex -= 1;
  if (insertIndex === currentIndex) return null;

  const reordered = blocks.slice();
  const [moving] = reordered.splice(currentIndex, 1);
  reordered.splice(insertIndex, 0, moving);

  const replaceStartLine = Math.min(...blocks.map((b) => b.startLine));
  const replaceEndExclusive = Math.max(...blocks.map((b) => b.endExclusive));

  const replaceRange = new vscode.Range(
    new vscode.Position(replaceStartLine, 0),
    new vscode.Position(replaceEndExclusive, 0)
  );

  const newText = reordered.map((b) => b.blockText).join("");

  // Defensive: keep the document EOL behavior stable when concatenating blocks.
  // If blocks somehow lost a separator, ensure at least one EOL between concatenations.
  // (Most blocks include trailing newlines naturally because their ranges end at line start.)
  if (!newText.endsWith(getEolString(document, vscode)) && text.endsWith(getEolString(document, vscode))) {
    // no-op: VS Code will normalize; leave as-is.
  }

  return { range: replaceRange, newText };
}

module.exports = {
  applyAutoMoveDone,
  applyAutoMoveDoneWithResult,
  computeAutoMoveDoneEdit
};
