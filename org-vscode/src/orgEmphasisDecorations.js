"use strict";

const vscode = require("vscode");

const EMPHASIS = [
  { marker: "*", kind: "bold" },
  { marker: "/", kind: "italic" },
  { marker: "_", kind: "underline" },
  { marker: "+", kind: "strike" }
];

function isWordChar(ch) {
  if (!ch) return false;
  return /[A-Za-z0-9]/.test(ch);
}

function shouldDecorate(editor) {
  if (!editor || !editor.document) return false;

  const lang = editor.document.languageId;
  if (!["vso", "org", "org-vscode", "vsorg"].includes(lang)) return false;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  return Boolean(config.get("decorateEmphasis", true));
}

function getRevealPositions(editor) {
  const byLine = new Map();
  if (!editor) return byLine;

  for (const selection of editor.selections || []) {
    const activeLine = selection.active.line;
    const start = selection.start;
    const end = selection.end;

    // Only handle single-line selections for reveal; if multi-line, reveal nothing extra.
    if (start.line !== end.line) {
      if (!byLine.has(activeLine)) byLine.set(activeLine, []);
      byLine.get(activeLine).push({ start: selection.active.character, end: selection.active.character });
      continue;
    }

    const line = start.line;
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push({
      start: Math.min(start.character, end.character),
      end: Math.max(start.character, end.character)
    });
  }

  return byLine;
}

function shouldRevealMarker(revealRangesForLine, index) {
  if (!revealRangesForLine || !revealRangesForLine.length) return false;
  for (const r of revealRangesForLine) {
    // Empty selection: start === end, reveal only if cursor is on the marker.
    if (r.start === r.end) {
      if (r.start === index) return true;
      continue;
    }
    // Non-empty selection: reveal if selection touches the marker character.
    if (r.start <= index && index < r.end) return true;
  }
  return false;
}

function getHeadingPrefixEnd(text) {
  const m = text.match(/^(\s*)(\*+)\s/);
  if (!m) return null;
  const indent = m[1] || "";
  const stars = m[2] || "";
  return indent.length + stars.length;
}

function findEmphasisForLine(text, lineNumber, revealPositions) {
  const styled = {
    bold: [],
    italic: [],
    underline: []
    ,
    strike: []
  };

  const hideRanges = [];
  const revealRangesForLine = revealPositions.get(lineNumber);
  const headingPrefixEnd = getHeadingPrefixEnd(text);

  for (const { marker, kind } of EMPHASIS) {
    for (let start = 0; start < text.length; start++) {
      if (text[start] !== marker) continue;

      // Never treat leading heading asterisks as emphasis markers.
      if (marker === "*" && headingPrefixEnd != null && start < headingPrefixEnd) {
        continue;
      }

      const before = start > 0 ? text[start - 1] : "";
      const openNext = start + 1 < text.length ? text[start + 1] : "";

      // Boundary before opener.
      if (isWordChar(before)) continue;

      // Disallow whitespace immediately inside.
      if (!openNext || /\s/.test(openNext)) continue;

      // Avoid matching repeated markers like "**" which is common for headings.
      if (openNext === marker) continue;

      // Find the nearest valid closing marker.
      let end = -1;
      for (let j = start + 2; j < text.length; j++) {
        if (text[j] !== marker) continue;

        const innerPrev = text[j - 1];
        const after = j + 1 < text.length ? text[j + 1] : "";

        // Disallow whitespace right before closer.
        if (!innerPrev || /\s/.test(innerPrev)) continue;

        // Boundary after closer.
        if (isWordChar(after)) continue;

        end = j;
        break;
      }

      if (end === -1) continue;

      const innerStart = start + 1;
      const innerEnd = end;
      const inner = text.substring(innerStart, innerEnd);
      if (!inner.length) continue;

      styled[kind].push(new vscode.Range(lineNumber, innerStart, lineNumber, innerEnd));

      const revealOpen = shouldRevealMarker(revealRangesForLine, start);
      const revealClose = shouldRevealMarker(revealRangesForLine, end);

      if (!revealOpen) hideRanges.push(new vscode.Range(lineNumber, start, lineNumber, start + 1));
      if (!revealClose) hideRanges.push(new vscode.Range(lineNumber, end, lineNumber, end + 1));

      // Continue scanning after the closer.
      start = end;
    }
  }

  return { styled, hideRanges };
}

function computeDecorationsForEditor(editor) {
  const boldRanges = [];
  const italicRanges = [];
  const underlineRanges = [];
  const strikeRanges = [];
  const hideRanges = [];

  const document = editor.document;
  const revealPositions = getRevealPositions(editor);

  const visible = (editor.visibleRanges && editor.visibleRanges.length)
    ? editor.visibleRanges
    : [new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Math.max(0, document.lineCount - 1), 0))];

  for (const visibleRange of visible) {
    const startLine = Math.max(0, visibleRange.start.line);
    const endLine = Math.min(document.lineCount - 1, visibleRange.end.line);

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const text = document.lineAt(lineNumber).text;
      const { styled, hideRanges: lineHide } = findEmphasisForLine(text, lineNumber, revealPositions);

      boldRanges.push(...styled.bold);
      italicRanges.push(...styled.italic);
      underlineRanges.push(...styled.underline);
      strikeRanges.push(...styled.strike);
      hideRanges.push(...lineHide);
    }
  }

  return { boldRanges, italicRanges, underlineRanges, strikeRanges, hideRanges };
}

function registerOrgEmphasisDecorations(ctx) {
  if (!vscode.window || typeof vscode.window.createTextEditorDecorationType !== "function") {
    return;
  }

  const boldType = vscode.window.createTextEditorDecorationType({ fontWeight: "bold" });
  const italicType = vscode.window.createTextEditorDecorationType({ fontStyle: "italic" });
  const underlineType = vscode.window.createTextEditorDecorationType({ textDecoration: "underline" });
  const strikeType = vscode.window.createTextEditorDecorationType({ textDecoration: "line-through" });
  const hideMarkerType = vscode.window.createTextEditorDecorationType({
    color: "transparent",
    textDecoration: "none; font-size: 0;"
  });

  ctx.subscriptions.push(boldType, italicType, underlineType, strikeType, hideMarkerType);

  let pendingTimer = null;

  function clear(editor) {
    if (!editor) return;
    editor.setDecorations(boldType, []);
    editor.setDecorations(italicType, []);
    editor.setDecorations(underlineType, []);
    editor.setDecorations(strikeType, []);
    editor.setDecorations(hideMarkerType, []);
  }

  function apply(editor) {
    if (!editor) return;

    if (!shouldDecorate(editor)) {
      clear(editor);
      return;
    }

    const { boldRanges, italicRanges, underlineRanges, strikeRanges, hideRanges } = computeDecorationsForEditor(editor);
    editor.setDecorations(boldType, boldRanges);
    editor.setDecorations(italicType, italicRanges);
    editor.setDecorations(underlineType, underlineRanges);
    editor.setDecorations(strikeType, strikeRanges);
    editor.setDecorations(hideMarkerType, hideRanges);
  }

  function scheduleApply(editor) {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      apply(editor || vscode.window.activeTextEditor);
    }, 50);
  }

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
      if (event.affectsConfiguration("Org-vscode.decorateEmphasis")) {
        scheduleApply(vscode.window.activeTextEditor);
      }
    })
  );
}

module.exports = {
  registerOrgEmphasisDecorations
};
