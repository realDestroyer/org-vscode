"use strict";

const vscode = require("vscode");
const taskKeywordManager = require("./taskKeywordManager");
const {
  isPlanningLine,
  parsePlanningFromText,
  getAcceptedDateFormats,
  momentFromTimestampContent
} = require("./orgTagUtils");

const HEADING_SCHEDULED_DECORATION_SCOPE = "meta.decoration.heading.scheduled.vso";
const HEADING_DEADLINE_DECORATION_SCOPE = "meta.decoration.heading.deadline.vso";

const HEADING_LINE_REGEX = /^(\s*)(\*+)\s+\S/;

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

function createTokenStyleResolver() {
  const cache = new Map();

  return {
    getStyleForScope(scope) {
      if (!scope) return {};
      if (cache.has(scope)) return cache.get(scope);

      const config = vscode.workspace.getConfiguration();
      const customizations = config.get("editor.tokenColorCustomizations") || {};
      const rules = Array.isArray(customizations.textMateRules) ? customizations.textMateRules : [];

      for (const rule of rules) {
        const scopes = normalizeScopes(rule && rule.scope);
        if (!scopes.length) continue;
        if (!scopes.includes(scope)) continue;

        const settings = (rule && rule.settings) ? rule.settings : {};
        const resolved = {
          foreground: typeof settings.foreground === "string" ? settings.foreground.trim() : "",
          background: typeof settings.background === "string" ? settings.background.trim() : "",
          fontStyle: typeof settings.fontStyle === "string" ? settings.fontStyle.trim() : ""
        };
        cache.set(scope, resolved);
        return resolved;
      }

      const empty = { foreground: "", background: "", fontStyle: "" };
      cache.set(scope, empty);
      return empty;
    },

    clear() {
      cache.clear();
    }
  };
}

function styleKey(style) {
  if (!style) return "";
  return `${String(style.foreground || "")}||${String(style.background || "")}||${String(style.fontStyle || "")}`;
}

function decorationTypeOptionsFromStyle(style) {
  const raw = style || {};
  const fontStyle = String(raw.fontStyle || "");

  const after = {
    margin: "0 0 0 0.5em",
    color: (raw.foreground && raw.foreground.trim()) ? raw.foreground.trim() : new vscode.ThemeColor("descriptionForeground")
  };

  if (raw.background && raw.background.trim()) {
    after.backgroundColor = raw.background.trim();
  }

  if (fontStyle.includes("italic")) {
    after.fontStyle = "italic";
  }
  if (fontStyle.includes("bold")) {
    after.fontWeight = "bold";
  }

  const decorations = [];
  if (fontStyle.includes("underline")) decorations.push("underline");
  if (fontStyle.includes("strikethrough")) decorations.push("line-through");
  if (decorations.length) {
    after.textDecoration = decorations.join(" ");
  }

  return { after };
}

function shouldDecorateScheduled(editor) {
  if (!editor) return false;
  if (!editor.document) return false;
  if (editor.document.languageId !== "vso") return false;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  return Boolean(config.get("decorateHeadingScheduledDates", false));
}

function shouldDecorateDeadline(editor) {
  if (!editor) return false;
  if (!editor.document) return false;
  if (editor.document.languageId !== "vso") return false;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  return Boolean(config.get("decorateHeadingDeadlineDates", false));
}

function getPlanningForHeadingInDocument(document, headingLine) {
  const head = headingLine >= 0 && headingLine < document.lineCount
    ? String(document.lineAt(headingLine).text || "")
    : "";
  const next = headingLine + 1 >= 0 && headingLine + 1 < document.lineCount
    ? String(document.lineAt(headingLine + 1).text || "")
    : "";

  const combined = isPlanningLine(next) ? `${head}\n${next}` : head;
  return parsePlanningFromText(combined);
}

function computeScheduledDecorationsForEditor(editor) {
  const decorations = [];
  if (!editor) return decorations;

  const document = editor.document;
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const acceptedDateFormats = getAcceptedDateFormats(dateFormat);

  const visible = (editor.visibleRanges && editor.visibleRanges.length)
    ? editor.visibleRanges
    : [new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Math.max(0, document.lineCount - 1), 0))];

  for (const visibleRange of visible) {
    const startLine = Math.max(0, visibleRange.start.line);
    const endLine = Math.min(document.lineCount - 1, visibleRange.end.line);

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const lineText = document.lineAt(lineNumber).text;

      const headingMatch = lineText.match(HEADING_LINE_REGEX);
      if (!headingMatch) continue;

      const keyword = taskKeywordManager.findTaskKeyword(lineText);
      if (!keyword) continue;

      const planning = getPlanningForHeadingInDocument(document, lineNumber);
      if (!planning || !planning.scheduled) continue;

      const scheduledMoment = momentFromTimestampContent(planning.scheduled, acceptedDateFormats, true);
      if (!scheduledMoment || !scheduledMoment.isValid()) continue;

      const scheduledFormatted = scheduledMoment.format(dateFormat);
      const insertAt = new vscode.Position(lineNumber, lineText.length);
      const range = new vscode.Range(insertAt, insertAt);
      decorations.push({
        range,
        renderOptions: {
          after: {
            contentText: `  (S: ${scheduledFormatted})`
          }
        }
      });
    }
  }

  return decorations;
}

function computeDeadlineDecorationsForEditor(editor) {
  const decorations = [];
  if (!editor) return decorations;

  const document = editor.document;
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const acceptedDateFormats = getAcceptedDateFormats(dateFormat);

  const visible = (editor.visibleRanges && editor.visibleRanges.length)
    ? editor.visibleRanges
    : [new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Math.max(0, document.lineCount - 1), 0))];

  for (const visibleRange of visible) {
    const startLine = Math.max(0, visibleRange.start.line);
    const endLine = Math.min(document.lineCount - 1, visibleRange.end.line);

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const lineText = document.lineAt(lineNumber).text;

      const headingMatch = lineText.match(HEADING_LINE_REGEX);
      if (!headingMatch) continue;

      const keyword = taskKeywordManager.findTaskKeyword(lineText);
      if (!keyword) continue;

      const planning = getPlanningForHeadingInDocument(document, lineNumber);
      if (!planning || !planning.deadline) continue;

      const deadlineMoment = momentFromTimestampContent(planning.deadline, acceptedDateFormats, true);
      if (!deadlineMoment || !deadlineMoment.isValid()) continue;

      const deadlineFormatted = deadlineMoment.format(dateFormat);
      const insertAt = new vscode.Position(lineNumber, lineText.length);
      const range = new vscode.Range(insertAt, insertAt);
      decorations.push({
        range,
        renderOptions: {
          after: {
            contentText: `  (D: ${deadlineFormatted})`
          }
        }
      });
    }
  }

  return decorations;
}

function registerHeadingScheduledDecorations(ctx) {
  if (!vscode.window || typeof vscode.window.createTextEditorDecorationType !== "function") {
    return;
  }

  const styleResolver = createTokenStyleResolver();

  let scheduledDecorationType = null;
  let scheduledDecorationKey = "";

  ctx.subscriptions.push({
    dispose() {
      if (scheduledDecorationType) {
        try { scheduledDecorationType.dispose(); } catch (_) { /* ignore */ }
        scheduledDecorationType = null;
      }
    }
  });

  function getScheduledDecorationType() {
    const style = styleResolver.getStyleForScope(HEADING_SCHEDULED_DECORATION_SCOPE);
    const key = styleKey(style);
    if (scheduledDecorationType && key === scheduledDecorationKey) return scheduledDecorationType;

    if (scheduledDecorationType) {
      try { scheduledDecorationType.dispose(); } catch (_) { /* ignore */ }
    }

    scheduledDecorationKey = key;
    scheduledDecorationType = vscode.window.createTextEditorDecorationType(decorationTypeOptionsFromStyle(style));
    return scheduledDecorationType;
  }

  let pendingTimer = null;

  function clearEditor(editor) {
    if (!editor) return;
    const type = getScheduledDecorationType();
    editor.setDecorations(type, []);
  }

  function apply(editor) {
    if (!editor) return;
    if (!shouldDecorateScheduled(editor)) {
      clearEditor(editor);
      return;
    }

    const type = getScheduledDecorationType();
    const decorations = computeScheduledDecorationsForEditor(editor);
    editor.setDecorations(type, decorations);
  }

  function scheduleApply(editor) {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }

    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      apply(editor || vscode.window.activeTextEditor);
    }, 75);
  }

  scheduleApply(vscode.window.activeTextEditor);

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => scheduleApply(editor)),
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
        event.affectsConfiguration("Org-vscode.decorateHeadingScheduledDates") ||
        event.affectsConfiguration("Org-vscode.dateFormat") ||
        event.affectsConfiguration("editor.tokenColorCustomizations")
      ) {
        // Force recreation on tokenColorCustomizations change.
        if (event.affectsConfiguration("editor.tokenColorCustomizations")) {
          scheduledDecorationKey = "";
          styleResolver.clear();
        }
        scheduleApply(vscode.window.activeTextEditor);
      }
    })
  );
}

function registerHeadingDeadlineDecorations(ctx) {
  if (!vscode.window || typeof vscode.window.createTextEditorDecorationType !== "function") {
    return;
  }

  const styleResolver = createTokenStyleResolver();

  let deadlineDecorationType = null;
  let deadlineDecorationKey = "";

  ctx.subscriptions.push({
    dispose() {
      if (deadlineDecorationType) {
        try { deadlineDecorationType.dispose(); } catch (_) { /* ignore */ }
        deadlineDecorationType = null;
      }
    }
  });

  function getDeadlineDecorationType() {
    const style = styleResolver.getStyleForScope(HEADING_DEADLINE_DECORATION_SCOPE);
    const key = styleKey(style);
    if (deadlineDecorationType && key === deadlineDecorationKey) return deadlineDecorationType;

    if (deadlineDecorationType) {
      try { deadlineDecorationType.dispose(); } catch (_) { /* ignore */ }
    }

    deadlineDecorationKey = key;
    deadlineDecorationType = vscode.window.createTextEditorDecorationType(decorationTypeOptionsFromStyle(style));
    return deadlineDecorationType;
  }

  let pendingTimer = null;

  function clearEditor(editor) {
    if (!editor) return;
    const type = getDeadlineDecorationType();
    editor.setDecorations(type, []);
  }

  function apply(editor) {
    if (!editor) return;
    if (!shouldDecorateDeadline(editor)) {
      clearEditor(editor);
      return;
    }

    const type = getDeadlineDecorationType();
    const decorations = computeDeadlineDecorationsForEditor(editor);
    editor.setDecorations(type, decorations);
  }

  function scheduleApply(editor) {
    if (pendingTimer) {
      clearTimeout(pendingTimer);
    }

    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      apply(editor || vscode.window.activeTextEditor);
    }, 75);
  }

  scheduleApply(vscode.window.activeTextEditor);

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => scheduleApply(editor)),
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
        event.affectsConfiguration("Org-vscode.decorateHeadingDeadlineDates") ||
        event.affectsConfiguration("Org-vscode.dateFormat") ||
        event.affectsConfiguration("editor.tokenColorCustomizations")
      ) {
        if (event.affectsConfiguration("editor.tokenColorCustomizations")) {
          deadlineDecorationKey = "";
          styleResolver.clear();
        }
        scheduleApply(vscode.window.activeTextEditor);
      }
    })
  );
}

module.exports = {
  registerHeadingScheduledDecorations,
  registerHeadingDeadlineDecorations
};
