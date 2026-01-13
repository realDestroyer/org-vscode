"use strict";

const vscode = require("vscode");
const taskKeywordManager = require("./taskKeywordManager");

// We intentionally base the background colors on the user's TextMate customizations
// (editor.tokenColorCustomizations) so the same Syntax Color Customizer UI can drive both.
const STATUS_TO_KEYWORD_SCOPE = {
  TODO: "keyword.control.todo.vso",
  IN_PROGRESS: "support.constant.in_progress.vso",
  CONTINUED: "markup.quote.continued.vso",
  DONE: "entity.name.function.vso",
  ABANDONED: "keyword.control.abandoned.vso"
};

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
  const rules = Array.isArray(customizations.textMateRules) ? customizations.textMateRules : [];

  const cache = new Map();

  return {
    getBackgroundForScope(scope) {
      if (!scope) return undefined;
      if (cache.has(scope)) return cache.get(scope);

      for (const rule of rules) {
        const scopes = normalizeScopes(rule && rule.scope);
        if (!scopes.length) continue;
        if (!scopes.includes(scope)) continue;

        const bg = rule && rule.settings && rule.settings.background;
        if (typeof bg === "string" && bg.trim()) {
          const value = bg.trim();
          cache.set(scope, value);
          return value;
        }
      }

      cache.set(scope, undefined);
      return undefined;
    }
  };
}

function shouldDecorate(editor) {
  if (!editor) return false;
  if (editor.document.languageId !== "vso") return false;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  return Boolean(config.get("decorateTodoStateLines", true));
}

function mapKeywordToDecorationBucket(keyword, registry) {
  const k = String(keyword || "").toUpperCase();
  if (!k) return null;

  // Preserve legacy buckets/scopes; map custom states into them.
  if (k === "ABANDONED") return "ABANDONED";
  if (registry && registry.stampsClosed && registry.stampsClosed(k)) return "DONE";
  if (registry && registry.isDoneLike && registry.isDoneLike(k)) return "DONE";
  if (registry && registry.triggersForward && registry.triggersForward(k)) return "CONTINUED";

  const cycle = (registry && registry.getCycleKeywords) ? registry.getCycleKeywords() : [];
  if (cycle.length && k === String(cycle[0] || "").toUpperCase()) return "TODO";

  // Default active/non-done statuses to IN_PROGRESS.
  return "IN_PROGRESS";
}

function getHeadingMarkerAlternation(registry) {
  const markers = (registry?.states || [])
    .map((s) => s && s.marker)
    .filter((m) => typeof m === "string" && m.length > 0);
  const deduped = Array.from(new Set(markers));
  if (!deduped.length) return "";
  return deduped
    .map((m) => String(m).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
}

function isHeadingLine(text, registry) {
  const t = String(text || "");
  if (/^\s*\*+\s+\S/.test(t)) return true;
  const markerAlt = getHeadingMarkerAlternation(registry);
  if (!markerAlt) return false;
  return new RegExp(`^\\s*(?:${markerAlt})\\s+\\S`).test(t);
}

function computeLineRanges(editor, enabledStatuses) {
  const byStatus = {
    TODO: [],
    IN_PROGRESS: [],
    CONTINUED: [],
    DONE: [],
    ABANDONED: []
  };

  if (!editor || !editor.document || !enabledStatuses.size) {
    return byStatus;
  }

  const doc = editor.document;
  const visible = (editor.visibleRanges && editor.visibleRanges.length)
    ? editor.visibleRanges
    : [new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Math.max(0, doc.lineCount - 1), 0))];

  for (const range of visible) {
    const startLine = Math.max(0, range.start.line);
    const endLine = Math.min(doc.lineCount - 1, range.end.line);

    for (let line = startLine; line <= endLine; line++) {
      const text = doc.lineAt(line).text;

      const registry = taskKeywordManager.getWorkflowRegistry();
      if (!isHeadingLine(text, registry)) continue;

      const keyword = taskKeywordManager.findTaskKeyword(text);
      if (!keyword) continue;

      const bucket = mapKeywordToDecorationBucket(keyword, registry);
      if (!bucket || !enabledStatuses.has(bucket)) continue;

      const endCol = text.length;
      byStatus[bucket].push(new vscode.Range(line, 0, line, endCol));
    }
  }

  return byStatus;
}

function registerTodoLineDecorations(ctx) {
  // Unit tests mock vscode; skip decoration wiring when APIs aren't present.
  if (!vscode.window || typeof vscode.window.createTextEditorDecorationType !== "function") {
    return;
  }

  const decorationTypes = new Map();
  let pendingTimer = null;

  function disposeTypes() {
    for (const type of decorationTypes.values()) {
      try {
        type.dispose();
      } catch (_) {
        // ignore
      }
    }
    decorationTypes.clear();
  }

  function rebuildDecorationTypes() {
    disposeTypes();

    const resolver = createTokenColorResolver();

    for (const [status, scope] of Object.entries(STATUS_TO_KEYWORD_SCOPE)) {
      const background = resolver.getBackgroundForScope(scope);
      if (!background) continue;

      decorationTypes.set(
        status,
        vscode.window.createTextEditorDecorationType({
          isWholeLine: true,
          backgroundColor: background
        })
      );
    }

    for (const type of decorationTypes.values()) {
      ctx.subscriptions.push(type);
    }
  }

  function clearEditor(editor) {
    if (!editor) return;
    for (const status of Object.keys(STATUS_TO_KEYWORD_SCOPE)) {
      const type = decorationTypes.get(status);
      if (type) {
        editor.setDecorations(type, []);
      }
    }
  }

  function apply(editor) {
    if (!editor) return;

    if (!shouldDecorate(editor)) {
      clearEditor(editor);
      return;
    }

    // Refresh types on every apply so changes to tokenColorCustomizations/backgrounds
    // show up without needing reload.
    rebuildDecorationTypes();

    const enabledStatuses = new Set(decorationTypes.keys());
    const byStatus = computeLineRanges(editor, enabledStatuses);

    for (const status of Object.keys(STATUS_TO_KEYWORD_SCOPE)) {
      const type = decorationTypes.get(status);
      if (!type) continue;
      editor.setDecorations(type, byStatus[status] || []);
    }
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
        event.affectsConfiguration("Org-vscode.decorateTodoStateLines") ||
        event.affectsConfiguration("editor.tokenColorCustomizations")
      ) {
        scheduleApply(vscode.window.activeTextEditor);
      }
    })
  );
}

module.exports = {
  registerTodoLineDecorations
};
