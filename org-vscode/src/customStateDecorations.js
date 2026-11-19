"use strict";

const vscode = require("vscode");
const taskKeywordManager = require("./taskKeywordManager");
const checkboxKeywords = require("./checkboxKeywords");
const { getScopesForKeyword, isBuiltinStateKeyword } = require("./workflowStateScopes");

// User-defined workflow keywords cannot be added to the static TextMate grammar,
// so their Syntax Color Customizer settings are applied as editor decorations.

function normalizeScopes(scope) {
  if (!scope) return [];
  const list = Array.isArray(scope) ? scope : [scope];
  return list
    .flatMap((entry) => String(entry).split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function createTokenColorResolver() {
  const config = vscode.workspace.getConfiguration();
  const customizations = config.get("editor.tokenColorCustomizations") || {};
  const rules = Array.isArray(customizations.textMateRules) ? customizations.textMateRules : [];

  return {
    getSettingsForScope(scope) {
      if (!scope) return null;
      for (const rule of rules) {
        const scopes = normalizeScopes(rule && rule.scope);
        if (!scopes.includes(scope)) continue;
        const settings = (rule && rule.settings) || {};
        return {
          foreground: typeof settings.foreground === "string" ? settings.foreground.trim() : "",
          background: typeof settings.background === "string" ? settings.background.trim() : "",
          fontStyle: typeof settings.fontStyle === "string" ? settings.fontStyle.trim() : ""
        };
      }
      return null;
    }
  };
}

function toDecorationOptions(settings) {
  if (!settings || !settings.foreground) return null;
  const options = { color: settings.foreground };
  if (settings.background) options.backgroundColor = settings.background;
  if (settings.fontStyle) {
    if (settings.fontStyle.includes("bold")) options.fontWeight = "bold";
    if (settings.fontStyle.includes("italic")) options.fontStyle = "italic";
    if (settings.fontStyle.includes("underline")) options.textDecoration = "underline";
  }
  return options;
}

function getCustomStates(registry) {
  return (registry && Array.isArray(registry.states) ? registry.states : [])
    .filter((state) => state && state.keyword && !isBuiltinStateKeyword(state.keyword));
}

function shouldDecorate(editor) {
  if (!editor || !editor.document) return false;
  if (editor.document.languageId !== "vso") return false;
  const config = vscode.workspace.getConfiguration("Org-vscode");
  return Boolean(config.get("decorateCustomWorkflowStates", true));
}

function isHeadingLine(text, registry) {
  const value = String(text || "");
  if (/^\s*\*+\s+\S/.test(value)) return true;
  const markers = (registry && Array.isArray(registry.states) ? registry.states : [])
    .map((state) => state && state.marker)
    .filter((marker) => typeof marker === "string" && marker.length > 0);
  return markers.some((marker) => value.trimStart().startsWith(marker));
}

/**
 * Locates the keyword, marker, and trailing text ranges for custom states on a line.
 * Returns null when the line carries no custom-state keyword.
 */
function computeLineParts(text, registry) {
  const value = String(text || "");

  if (checkboxKeywords.isCheckboxLine(value)) {
    const keyword = checkboxKeywords.findCheckboxKeyword(value, registry);
    if (!keyword || isBuiltinStateKeyword(keyword)) return null;
    const keywordStart = value.indexOf(keyword);
    if (keywordStart === -1) return null;
    return {
      keyword,
      markerStart: -1,
      markerEnd: -1,
      keywordStart,
      keywordEnd: keywordStart + keyword.length,
      textStart: keywordStart + keyword.length,
      textEnd: value.length
    };
  }

  if (!isHeadingLine(value, registry)) return null;

  const keyword = taskKeywordManager.findTaskKeyword(value);
  if (!keyword || isBuiltinStateKeyword(keyword)) return null;

  const keywordStart = value.indexOf(keyword);
  if (keywordStart === -1) return null;

  const state = (registry.states || []).find((s) => s && s.keyword === keyword);
  const marker = state && typeof state.marker === "string" ? state.marker : "";
  const markerStart = marker ? value.indexOf(marker) : -1;

  return {
    keyword,
    markerStart,
    markerEnd: markerStart === -1 ? -1 : markerStart + marker.length,
    keywordStart,
    keywordEnd: keywordStart + keyword.length,
    textStart: keywordStart + keyword.length,
    textEnd: value.length
  };
}

function registerCustomStateDecorations(ctx) {
  // Unit tests mock vscode; skip decoration wiring when the API isn't present.
  if (!vscode.window || typeof vscode.window.createTextEditorDecorationType !== "function") {
    return;
  }

  /** @type {Map<string, { symbol?: any, keyword?: any, taskText?: any }>} */
  const decorationTypes = new Map();
  let decorationTypesDirty = true;
  let pendingTimer = null;

  function disposeTypes() {
    for (const group of decorationTypes.values()) {
      for (const type of Object.values(group)) {
        try {
          type.dispose();
        } catch (_) {
          // ignore
        }
      }
    }
    decorationTypes.clear();
  }

  function rebuildDecorationTypes(registry) {
    disposeTypes();

    const resolver = createTokenColorResolver();

    for (const state of getCustomStates(registry)) {
      const descriptor = getScopesForKeyword(state.keyword);
      if (!descriptor) continue;

      const group = {};
      for (const part of ["symbol", "keyword", "taskText"]) {
        const options = toDecorationOptions(resolver.getSettingsForScope(descriptor.scopes[part]));
        if (!options) continue;
        group[part] = vscode.window.createTextEditorDecorationType(options);
      }

      if (Object.keys(group).length) {
        decorationTypes.set(descriptor.keyword, group);
      }
    }
    decorationTypesDirty = false;
  }

  function clearEditor(editor) {
    if (!editor) return;
    for (const group of decorationTypes.values()) {
      for (const type of Object.values(group)) {
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

    const registry = taskKeywordManager.getWorkflowRegistry();
    if (decorationTypesDirty) rebuildDecorationTypes(registry);
    if (!decorationTypes.size) return;

    /** @type {Map<any, any[]>} */
    const rangesByType = new Map();
    for (const group of decorationTypes.values()) {
      for (const type of Object.values(group)) {
        rangesByType.set(type, []);
      }
    }

    const doc = editor.document;
    const visible = (editor.visibleRanges && editor.visibleRanges.length)
      ? editor.visibleRanges
      : [new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Math.max(0, doc.lineCount - 1), 0))];

    for (const visibleRange of visible) {
      const startLine = Math.max(0, visibleRange.start.line);
      const endLine = Math.min(doc.lineCount - 1, visibleRange.end.line);

      for (let line = startLine; line <= endLine; line++) {
        const text = doc.lineAt(line).text;
        const parts = computeLineParts(text, registry);
        if (!parts) continue;

        const group = decorationTypes.get(parts.keyword);
        if (!group) continue;

        if (group.symbol && parts.markerStart !== -1) {
          rangesByType.get(group.symbol).push(new vscode.Range(line, parts.markerStart, line, parts.markerEnd));
        }
        if (group.keyword) {
          rangesByType.get(group.keyword).push(new vscode.Range(line, parts.keywordStart, line, parts.keywordEnd));
        }
        if (group.taskText && parts.textEnd > parts.textStart) {
          rangesByType.get(group.taskText).push(new vscode.Range(line, parts.textStart, line, parts.textEnd));
        }
      }
    }

    for (const [type, ranges] of rangesByType.entries()) {
      editor.setDecorations(type, ranges);
    }
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
    { dispose: disposeTypes },
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
        event.affectsConfiguration("Org-vscode.decorateCustomWorkflowStates") ||
        event.affectsConfiguration("Org-vscode.workflowStates") ||
        event.affectsConfiguration("editor.tokenColorCustomizations")
      ) {
        decorationTypesDirty = true;
        scheduleApply(vscode.window.activeTextEditor);
      }
    })
  );
}

module.exports = {
  registerCustomStateDecorations,
  computeLineParts
};
