"use strict";

/*
  Heading folding provider
  ------------------------
  Issue #111: VS Code's default folding for org files only covered drawer
  markers (PROPERTIES / LOGBOOK) plus implicit indent-based folding. That
  meant headings whose body content was not indented (the most common
  Emacs Org / Orgzly Revived layout) had no fold control next to the
  heading line.

  This provider supplies explicit fold ranges keyed off heading lines so
  every heading gets a chevron regardless of body indentation.

  Folding rule:
    For each heading line H at level L, fold from H.line through the line
    just before the next heading at level <= L, or EOF if none. Empty
    trailing lines are trimmed off the fold so the chevron sits flush
    with the visible content.

  Rule rationale:
    - Same model VS Code applies to Markdown headings, which is the
      mental model most users carry over.
    - Always returning at least one foldable line per heading is what
      makes the fold control appear in the gutter; without that VS Code
      shows nothing.
*/

const vscode = require("vscode");
const { parseHeadingLine } = require("./orgSymbolProvider");

function buildFoldingRanges(lines) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const levels = new Array(safeLines.length).fill(null);
  const endLines = new Array(safeLines.length).fill(null);
  const lastContentAtOrBefore = new Array(safeLines.length).fill(-1);
  const openHeadings = [];
  let lastContentLine = -1;

  for (let line = 0; line < safeLines.length; line += 1) {
    if (String(safeLines[line] || "").trim()) lastContentLine = line;
    lastContentAtOrBefore[line] = lastContentLine;

    const parsed = parseHeadingLine(safeLines[line]);
    if (!parsed) continue;
    levels[line] = parsed.level;

    while (openHeadings.length && levels[openHeadings[openHeadings.length - 1]] >= parsed.level) {
      endLines[openHeadings.pop()] = line - 1;
    }
    openHeadings.push(line);
  }

  while (openHeadings.length) endLines[openHeadings.pop()] = safeLines.length - 1;

  const ranges = [];
  for (let line = 0; line < safeLines.length; line += 1) {
    if (levels[line] === null || endLines[line] === null) continue;
    const endLine = lastContentAtOrBefore[endLines[line]];
    if (endLine > line) ranges.push(new vscode.FoldingRange(line, endLine, vscode.FoldingRangeKind.Region));
  }

  return ranges;
}

const VISIBILITY_STATES = ["folded", "children", "subtree"];

function collectHeadingLevels(lines) {
  return lines.map((line) => parseHeadingLine(line)?.level ?? null);
}

function findDirectChildHeadingLines(lines, headingLine) {
  const levels = collectHeadingLevels(lines);
  const parentLevel = levels[headingLine];
  if (parentLevel === null || parentLevel === undefined) return [];

  const children = [];
  for (let line = headingLine + 1; line < levels.length; line += 1) {
    const level = levels[line];
    if (level === null) continue;
    if (level <= parentLevel) break;
    if (level === parentLevel + 1) children.push(line);
  }
  return children;
}

function getNextVisibilityState(currentState, reverse = false) {
  const currentIndex = VISIBILITY_STATES.indexOf(currentState);
  const normalizedIndex = currentIndex >= 0 ? currentIndex : VISIBILITY_STATES.indexOf("subtree");
  const delta = reverse ? -1 : 1;
  return VISIBILITY_STATES[(normalizedIndex + delta + VISIBILITY_STATES.length) % VISIBILITY_STATES.length];
}

function buildVisibilityPlan(lines, headingLine, currentState, reverse = false) {
  if (!parseHeadingLine(lines?.[headingLine])) return null;

  const nextState = getNextVisibilityState(currentState, reverse);
  return {
    state: nextState,
    headingLine,
    childLines: nextState === "children" ? findDirectChildHeadingLines(lines, headingLine) : []
  };
}

function buildGlobalVisibilityPlan(lines, currentState, reverse = false) {
  const levels = collectHeadingLevels(lines || []);
  const headingLevels = levels.filter((level) => level !== null);
  if (!headingLevels.length) return null;

  const minimumLevel = Math.min(...headingLevels);
  const rootLines = [];
  const childLines = [];
  for (let line = 0; line < levels.length; line += 1) {
    if (levels[line] === minimumLevel) rootLines.push(line);
    if (levels[line] === minimumLevel + 1) childLines.push(line);
  }

  const nextState = getNextVisibilityState(currentState, reverse);
  return {
    state: nextState,
    rootLines,
    childLines: nextState === "children" ? childLines : []
  };
}

class OrgHeadingFoldingProvider {
  provideFoldingRanges(document) {
    try {
      const lines = [];
      for (let i = 0; i < document.lineCount; i += 1) {
        lines.push(document.lineAt(i).text);
      }
      return buildFoldingRanges(lines);
    } catch (e) {
      console.warn("OrgHeadingFoldingProvider failed:", e);
      return [];
    }
  }
}

function registerOrgFoldingProvider(ctx) {
  const selector = [
    { language: "vso", scheme: "file" },
    { language: "org", scheme: "file" },
    { language: "vsorg", scheme: "file" },
    { language: "org-vscode", scheme: "file" }
  ];
  ctx.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      selector,
      new OrgHeadingFoldingProvider()
    )
  );
}

module.exports = {
  OrgHeadingFoldingProvider,
  registerOrgFoldingProvider,
  buildFoldingRanges,
  buildGlobalVisibilityPlan,
  buildVisibilityPlan,
  findDirectChildHeadingLines,
  getNextVisibilityState
};
