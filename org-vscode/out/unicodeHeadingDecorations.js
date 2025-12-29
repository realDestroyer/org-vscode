"use strict";

const vscode = require("vscode");

const TASK_LINE_REGEX = /^(\s*)(\*+)\s+(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/;
const HEADING_LINE_REGEX = /^(\s*)(\*+)\s+\S/;
const DAY_HEADING_REGEX = /^(\s*)(\*+)\s*\[(\d{2,4}-\d{2}-\d{2,4})(?:\s+([A-Za-z]{3}))?.*$/;
const UNICODE_PREFIX_REGEX = /^(\s*)[⊙⊘⊜⊖⊗]\s/;

const STATUS_TO_SCOPE = {
  TODO: "constant.character.todo.vso",
  IN_PROGRESS: "constant.character.in_progress.vso",
  CONTINUED: "constant.character.continued.vso",
  DONE: "constant.character.done.vso",
  ABANDONED: "constant.character.abandoned.vso"
};

function statusToSymbol(status) {
  switch (status) {
    case "TODO":
      return "⊙";
    case "IN_PROGRESS":
      return "⊘";
    case "CONTINUED":
      return "⊜";
    case "DONE":
      return "⊖";
    case "ABANDONED":
      return "⊗";
    default:
      return "";
  }
}

function normalizeScopes(scope) {
  if (!scope) return [];
  if (Array.isArray(scope)) {
    return scope
      .flatMap((entry) => String(entry).split(","))
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return String(scope)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createTokenColorResolver() {
  const config = vscode.workspace.getConfiguration();
  const customizations = config.get("editor.tokenColorCustomizations") || {};
  const rules = Array.isArray(customizations.textMateRules)
    ? customizations.textMateRules
    : [];

  const resolved = new Map();

  return function getForegroundForScope(scope) {
    if (!scope) return undefined;
    if (resolved.has(scope)) return resolved.get(scope);

    for (const rule of rules) {
      const scopes = normalizeScopes(rule && rule.scope);
      if (!scopes.length) continue;
      if (!scopes.includes(scope)) continue;

      const foreground = rule && rule.settings && rule.settings.foreground;
      if (typeof foreground === "string" && foreground.trim()) {
        resolved.set(scope, foreground.trim());
        return foreground.trim();
      }
    }

    resolved.set(scope, undefined);
    return undefined;
  };
}

function getRevealLines(editor) {
  const revealLines = new Set();
  if (!editor) return revealLines;

  for (const selection of editor.selections || []) {
    const lineNumber = selection.active.line;
    if (lineNumber < 0 || lineNumber >= editor.document.lineCount) continue;

    const lineText = editor.document.lineAt(lineNumber).text;
    const taskMatch = lineText.match(TASK_LINE_REGEX);
    const dayMatch = !taskMatch ? lineText.match(DAY_HEADING_REGEX) : null;
    const headingMatch = !taskMatch && !dayMatch ? lineText.match(HEADING_LINE_REGEX) : null;
    const match = taskMatch || dayMatch || headingMatch;
    if (!match) continue;

    const indent = match[1] || "";
    const stars = match[2] || "";
    const prefixEnd = indent.length + stars.length;

    // If cursor is in (or before) the asterisk prefix region, reveal the raw stars.
    if (selection.active.character <= prefixEnd) {
      revealLines.add(lineNumber);
    }
  }

  return revealLines;
}

function shouldDecorate(editor) {
  if (!editor) return false;
  if (editor.document.languageId !== "vso") return false;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
  if (headingMarkerStyle !== "asterisks") return false;

  const decorateUnicodeHeadings = config.get("decorateUnicodeHeadings", false);
  const decorateHeadingIndentation = config.get("decorateHeadingIndentation", true);

  // Either unicode-marker decorations OR indentation-only decorations can be enabled.
  return Boolean(decorateUnicodeHeadings || decorateHeadingIndentation);
}

function computeDecorationsForEditor(editor) {
  const markerDecorations = [];
  const hideRanges = [];
  const document = editor.document;
  const revealLines = getRevealLines(editor);
  const getForegroundForScope = createTokenColorResolver();
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const decorateUnicodeHeadings = config.get("decorateUnicodeHeadings", false);
  const decorateHeadingIndentation = config.get("decorateHeadingIndentation", true);
  const INDENT_SPACE = "\u00A0";
  const spacesPerLevelRaw = config.get("adjustHeadingIndentation", 2);
  const spacesPerLevel = typeof spacesPerLevelRaw === "boolean"
    ? (spacesPerLevelRaw ? 2 : 0)
    : Math.max(0, Math.floor(Number(spacesPerLevelRaw) || 0));

  for (const visibleRange of editor.visibleRanges) {
    const startLine = Math.max(0, visibleRange.start.line);
    const endLine = Math.min(document.lineCount - 1, visibleRange.end.line);

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const lineText = document.lineAt(lineNumber).text;

      if (UNICODE_PREFIX_REGEX.test(lineText)) {
        continue;
      }

      if (revealLines.has(lineNumber)) {
        continue;
      }

      const taskMatch = lineText.match(TASK_LINE_REGEX);
      if (taskMatch) {
        const indent = taskMatch[1] || "";
        const status = taskMatch[3];
        const symbol = decorateUnicodeHeadings ? statusToSymbol(status) : "";
        if (decorateUnicodeHeadings && !symbol) continue;

        const stars = taskMatch[2] || "";
        const indentCount = decorateHeadingIndentation
          ? Math.max(0, stars.length - 1) * spacesPerLevel
          : 0;
        const visualIndent = indentCount > 0 ? INDENT_SPACE.repeat(indentCount) : "";

        // Insert unicode symbol at the start of the asterisk prefix.
        const insertAt = new vscode.Position(lineNumber, indent.length);
        const markerRange = new vscode.Range(insertAt, insertAt);
        const scope = decorateUnicodeHeadings ? STATUS_TO_SCOPE[status] : undefined;
        const foreground = scope ? getForegroundForScope(scope) : undefined;
        markerDecorations.push({
          range: markerRange,
          renderOptions: {
            before: {
              contentText: decorateUnicodeHeadings
                ? (visualIndent + symbol + " ")
                : (visualIndent + "* "),
              ...(foreground ? { color: foreground } : {})
            }
          }
        });

        // Hide the asterisks (and a single trailing space) so unicode takes their place.
        let hideEnd = indent.length + stars.length;
        if (lineText.length > hideEnd && lineText[hideEnd] === " ") {
          hideEnd += 1;
        }
        const hideStart = new vscode.Position(lineNumber, indent.length);
        const hideStop = new vscode.Position(lineNumber, Math.min(hideEnd, lineText.length));
        if (hideStop.character > hideStart.character) {
          hideRanges.push(new vscode.Range(hideStart, hideStop));
        }

        continue;
      }

      const dayMatch = lineText.match(DAY_HEADING_REGEX);
      if (dayMatch) {
        const indent = dayMatch[1] || "";
        const stars = dayMatch[2] || "";
        const indentCount = decorateHeadingIndentation
          ? Math.max(0, stars.length - 1) * spacesPerLevel
          : 0;
        const visualIndent = indentCount > 0 ? INDENT_SPACE.repeat(indentCount) : "";
        const insertAt = new vscode.Position(lineNumber, indent.length);
        const markerRange = new vscode.Range(insertAt, insertAt);
        const foreground = decorateUnicodeHeadings
          ? getForegroundForScope(STATUS_TO_SCOPE.IN_PROGRESS)
          : undefined;
        markerDecorations.push({
          range: markerRange,
          renderOptions: {
            before: {
              contentText: decorateUnicodeHeadings
                ? (visualIndent + "⊘ ")
                : (visualIndent + "* "),
              ...(foreground ? { color: foreground } : {})
            }
          }
        });

        let hideEnd = indent.length + stars.length;
        if (lineText.length > hideEnd && lineText[hideEnd] === " ") {
          hideEnd += 1;
        }
        const hideStart = new vscode.Position(lineNumber, indent.length);
        const hideStop = new vscode.Position(lineNumber, Math.min(hideEnd, lineText.length));
        if (hideStop.character > hideStart.character) {
          hideRanges.push(new vscode.Range(hideStart, hideStop));
        }

        continue;
      }

      const headingMatch = lineText.match(HEADING_LINE_REGEX);
      if (headingMatch) {
        const indent = headingMatch[1] || "";
        const stars = headingMatch[2] || "";

        const indentCount = decorateHeadingIndentation
          ? Math.max(0, stars.length - 1) * spacesPerLevel
          : 0;
        const visualIndent = indentCount > 0 ? INDENT_SPACE.repeat(indentCount) : "";

        // Keep column alignment consistent with status headings (which add a 2-char marker like "⊖ ").
        const insertAt = new vscode.Position(lineNumber, indent.length);
        const markerRange = new vscode.Range(insertAt, insertAt);
        markerDecorations.push({
          range: markerRange,
          renderOptions: {
            before: {
              contentText: decorateUnicodeHeadings
                ? (visualIndent + INDENT_SPACE.repeat(2))
                : (visualIndent + "* ")
            }
          }
        });

        let hideEnd = indent.length + stars.length;
        if (lineText.length > hideEnd && lineText[hideEnd] === " ") {
          hideEnd += 1;
        }
        const hideStart = new vscode.Position(lineNumber, indent.length);
        const hideStop = new vscode.Position(lineNumber, Math.min(hideEnd, lineText.length));
        if (hideStop.character > hideStart.character) {
          hideRanges.push(new vscode.Range(hideStart, hideStop));
        }
      }
    }
  }

  return { markerDecorations, hideRanges };
}

function registerUnicodeHeadingDecorations(ctx) {
  // Unit tests mock vscode; skip decoration wiring when APIs aren't present.
  if (!vscode.window || typeof vscode.window.createTextEditorDecorationType !== "function") {
    return;
  }

  const markerDecorationType = vscode.window.createTextEditorDecorationType({});
  const hideDecorationType = vscode.window.createTextEditorDecorationType({
    // Collapse the asterisk prefix visually so the unicode marker replaces it.
    color: "transparent",
    textDecoration: "none; font-size: 0;"
  });
  ctx.subscriptions.push(markerDecorationType);
  ctx.subscriptions.push(hideDecorationType);

  let pendingTimer = null;

  function apply(editor) {
    if (!editor) return;

    if (!shouldDecorate(editor)) {
      editor.setDecorations(markerDecorationType, []);
      editor.setDecorations(hideDecorationType, []);
      return;
    }

    const { markerDecorations, hideRanges } = computeDecorationsForEditor(editor);
    editor.setDecorations(markerDecorationType, markerDecorations);
    editor.setDecorations(hideDecorationType, hideRanges);
  }

  function scheduleApply(editor) {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }

    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      apply(editor || vscode.window.activeTextEditor);
    }, 50);
  }

  // Initial paint.
  scheduleApply(vscode.window.activeTextEditor);

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => scheduleApply(editor)),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        scheduleApply(event.textEditor);
      }
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) {
        scheduleApply(event.textEditor);
      }
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const active = vscode.window.activeTextEditor;
      if (active && event.document.uri.toString() === active.document.uri.toString()) {
        scheduleApply(active);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (
        event.affectsConfiguration("Org-vscode.decorateUnicodeHeadings") ||
        event.affectsConfiguration("Org-vscode.decorateHeadingIndentation") ||
        event.affectsConfiguration("Org-vscode.adjustHeadingIndentation") ||
        event.affectsConfiguration("Org-vscode.headingMarkerStyle")
      ) {
        scheduleApply(vscode.window.activeTextEditor);
      }
    })
  );
}

module.exports = {
  registerUnicodeHeadingDecorations
};
