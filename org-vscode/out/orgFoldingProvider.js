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
  const ranges = [];
  // Cache parsed levels so we don't reparse a line twice.
  const levels = new Array(lines.length).fill(null);

  for (let i = 0; i < lines.length; i += 1) {
    const parsed = parseHeadingLine(lines[i]);
    if (!parsed) continue;
    levels[i] = parsed.level;
  }

  for (let i = 0; i < lines.length; i += 1) {
    const level = levels[i];
    if (level === null) continue;

    // Walk forward to find the end of this heading's section.
    let endLine = lines.length - 1;
    for (let j = i + 1; j < lines.length; j += 1) {
      const otherLevel = levels[j];
      if (otherLevel !== null && otherLevel <= level) {
        endLine = j - 1;
        break;
      }
    }

    // Trim trailing blank lines so the fold stops at real content.
    while (endLine > i && lines[endLine].trim() === "") {
      endLine -= 1;
    }

    // VS Code requires startLine < endLine for a folding range to render.
    if (endLine > i) {
      ranges.push(new vscode.FoldingRange(i, endLine, vscode.FoldingRangeKind.Region));
    }
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
