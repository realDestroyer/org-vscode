"use strict";

// Maps workflow state keywords to TextMate scope names.
//
// The bundled grammar only knows the five built-in keywords, so user-defined
// states get generated scope names that are themed via editor decorations
// (see customStateDecorations.js) rather than by the static grammar.

const BUILTIN_STATE_SCOPES = {
  TODO: {
    symbol: "constant.character.todo.vso",
    keyword: "keyword.control.todo.vso",
    taskText: "string.task.todo.vso"
  },
  IN_PROGRESS: {
    symbol: "constant.character.in_progress.vso",
    keyword: ["keyword.control.in_progress.vso", "support.constant.in_progress.vso"],
    taskText: "string.task.in_progress.vso"
  },
  CONTINUED: {
    symbol: "constant.character.continued.vso",
    keyword: ["keyword.control.continued.vso", "markup.quote.continued.vso"],
    taskText: "string.task.continued.vso"
  },
  DONE: {
    symbol: "constant.character.done.vso",
    keyword: ["keyword.control.done.vso", "entity.name.function.vso"],
    taskText: "string.task.done.vso"
  },
  ABANDONED: {
    symbol: "constant.character.abandoned.vso",
    keyword: "keyword.control.abandoned.vso",
    taskText: "string.task.abandoned.vso"
  }
};

// Deterministic fallback palette so multiple custom states don't all look alike.
const CUSTOM_DEFAULT_PALETTE = [
  { symbol: "#C586C0", keyword: "#C586C0", taskText: "#E6CCE4" },
  { symbol: "#4EC9B0", keyword: "#4EC9B0", taskText: "#C7ECE4" },
  { symbol: "#DCDCAA", keyword: "#DCDCAA", taskText: "#EFEFD2" },
  { symbol: "#569CD6", keyword: "#569CD6", taskText: "#CBE0F2" },
  { symbol: "#D7BA7D", keyword: "#D7BA7D", taskText: "#EFE3CB" },
  { symbol: "#F7CA18", keyword: "#F7CA18", taskText: "#FBEBB1" }
];

function normalizeKeyword(keyword) {
  if (typeof keyword !== "string") return "";
  return keyword.trim().toUpperCase();
}

function isBuiltinStateKeyword(keyword) {
  return Object.prototype.hasOwnProperty.call(BUILTIN_STATE_SCOPES, normalizeKeyword(keyword));
}

function sanitizeKeywordForScope(keyword) {
  return normalizeKeyword(keyword)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function paletteForKeyword(keyword) {
  const slug = sanitizeKeywordForScope(keyword);
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) % 100000;
  }
  return CUSTOM_DEFAULT_PALETTE[hash % CUSTOM_DEFAULT_PALETTE.length];
}

/**
 * Returns the scope names used to theme a workflow state, or null for
 * keywords that cannot produce a usable scope slug.
 */
function getScopesForKeyword(keyword) {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) return null;

  if (isBuiltinStateKeyword(normalized)) {
    return { keyword: normalized, isBuiltin: true, scopes: BUILTIN_STATE_SCOPES[normalized] };
  }

  const slug = sanitizeKeywordForScope(normalized);
  if (!slug) return null;

  return {
    keyword: normalized,
    isBuiltin: false,
    scopes: {
      symbol: `constant.character.custom.${slug}.vso`,
      keyword: `keyword.control.custom.${slug}.vso`,
      taskText: `string.task.custom.${slug}.vso`
    }
  };
}

/**
 * Builds Syntax Color Customizer rows and groups for user-defined workflow states.
 * Built-in states are skipped because the static defaults already cover them.
 */
function buildCustomStateColorEntries(states) {
  const list = Array.isArray(states) ? states : [];
  const colors = {};
  const groups = {};
  const seen = new Set();

  for (const state of list) {
    const keyword = normalizeKeyword(state && state.keyword);
    if (!keyword || seen.has(keyword)) continue;
    if (isBuiltinStateKeyword(keyword)) continue;

    const descriptor = getScopesForKeyword(keyword);
    if (!descriptor) continue;

    seen.add(keyword);

    const palette = paletteForKeyword(keyword);
    const symbolName = `${keyword} Symbol`;
    const keywordName = `${keyword} Keyword`;
    const taskTextName = `${keyword} Task Text`;

    colors[symbolName] = {
      scope: descriptor.scopes.symbol,
      foreground: palette.symbol,
      background: "",
      fontStyle: "bold"
    };
    colors[keywordName] = {
      scope: descriptor.scopes.keyword,
      foreground: palette.keyword,
      background: "",
      fontStyle: "bold"
    };
    colors[taskTextName] = {
      scope: descriptor.scopes.taskText,
      foreground: palette.taskText,
      background: "",
      fontStyle: ""
    };

    groups[`${keyword} Tasks (custom)`] = [symbolName, keywordName, taskTextName];
  }

  return { colors, groups };
}

module.exports = {
  BUILTIN_STATE_SCOPES,
  isBuiltinStateKeyword,
  sanitizeKeywordForScope,
  getScopesForKeyword,
  buildCustomStateColorEntries
};
