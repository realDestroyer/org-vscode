"use strict";

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeKeyword(keyword) {
  if (typeof keyword !== "string") return null;
  const trimmed = keyword.trim();
  if (!trimmed) return null;
  if (/\s/.test(trimmed)) return null;
  return trimmed.toUpperCase();
}

function normalizeMarker(marker) {
  if (marker === undefined || marker === null || marker === "") return undefined;
  if (typeof marker !== "string") return undefined;
  const trimmed = marker.trim();
  if (!trimmed) return undefined;
  if (/\s/.test(trimmed)) return undefined;
  return trimmed;
}

function normalizeVisibility(value, defaultValue) {
  if (value === "show" || value === "hide") return value;
  return defaultValue;
}

function normalizeBoolean(value, defaultValue) {
  if (typeof value === "boolean") return value;
  return defaultValue;
}

function getDefaultWorkflowStates() {
  return [
    {
      keyword: "TODO",
      marker: "⊙",
      isDoneLike: false,
      stampsClosed: false,
      triggersForward: false,
      agendaVisibility: "show",
      taggedAgendaVisibility: "show"
    },
    {
      keyword: "IN_PROGRESS",
      marker: "⊘",
      isDoneLike: false,
      stampsClosed: false,
      triggersForward: false,
      agendaVisibility: "show",
      taggedAgendaVisibility: "show"
    },
    {
      keyword: "CONTINUED",
      marker: "⊜",
      isDoneLike: false,
      stampsClosed: false,
      triggersForward: true,
      agendaVisibility: "hide",
      taggedAgendaVisibility: "hide"
    },
    {
      keyword: "DONE",
      marker: "⊖",
      isDoneLike: true,
      stampsClosed: true,
      triggersForward: false,
      agendaVisibility: "hide",
      taggedAgendaVisibility: "hide"
    },
    {
      keyword: "ABANDONED",
      marker: "⊗",
      isDoneLike: true,
      stampsClosed: false,
      triggersForward: false,
      agendaVisibility: "hide",
      taggedAgendaVisibility: "hide"
    }
  ];
}

function normalizeState(raw) {
  if (!raw || typeof raw !== "object") return null;

  const keyword = normalizeKeyword(raw.keyword);
  if (!keyword) return null;

  const marker = normalizeMarker(raw.marker);

  return {
    keyword,
    marker,
    isDoneLike: normalizeBoolean(raw.isDoneLike, false),
    stampsClosed: normalizeBoolean(raw.stampsClosed, false),
    triggersForward: normalizeBoolean(raw.triggersForward, false),
    agendaVisibility: normalizeVisibility(raw.agendaVisibility, "show"),
    taggedAgendaVisibility: normalizeVisibility(raw.taggedAgendaVisibility, "show")
  };
}

function validateAndNormalizeWorkflowStates(configValue) {
  const errors = [];

  if (configValue === undefined || configValue === null) {
    return { ok: true, value: getDefaultWorkflowStates(), errors };
  }

  if (!Array.isArray(configValue)) {
    return { ok: false, value: getDefaultWorkflowStates(), errors: ["workflowStates must be an array"] };
  }

  const normalized = [];
  const seen = new Set();

  for (const raw of configValue) {
    const state = normalizeState(raw);
    if (!state) {
      errors.push("Invalid workflow state entry (must include a non-empty keyword without spaces)");
      continue;
    }

    if (seen.has(state.keyword)) {
      errors.push(`Duplicate workflow state keyword: ${state.keyword}`);
      continue;
    }

    seen.add(state.keyword);
    normalized.push(state);
  }

  if (normalized.length === 0) {
    errors.push("workflowStates must contain at least one valid state");
    return { ok: false, value: getDefaultWorkflowStates(), errors };
  }

  // Fail-safe: any validation problems cause a full fallback to defaults.
  if (errors.length > 0) {
    return { ok: false, value: getDefaultWorkflowStates(), errors };
  }

  return { ok: true, value: normalized, errors };
}

function getKeywordAlternation(states) {
  return states.map((s) => escapeRegExp(s.keyword)).join("|");
}

function getMarkerAlternation(states) {
  const markers = states
    .map((s) => s.marker)
    .filter((m) => typeof m === "string" && m.length > 0);

  // Deduplicate while preserving order.
  const deduped = [];
  const seen = new Set();
  for (const m of markers) {
    if (seen.has(m)) continue;
    seen.add(m);
    deduped.push(m);
  }

  return deduped.map((m) => escapeRegExp(m)).join("|");
}

function buildTaskPrefixRegex(states) {
  const keywordAlt = getKeywordAlternation(states);
  const markerAlt = getMarkerAlternation(states);
  const markerPart = markerAlt ? `(?:${markerAlt})\\s*` : "";

  // Matches task lines that start with:
  //   - optional indentation
  //   - optional configured marker (unicode mode)
  //   - optional asterisks (org classic)
  //   - a configured keyword
  // This mirrors the historical TASK_PREFIX_REGEX semantics.
  return new RegExp(`^(\\s*)(?:${markerPart})?(?:\\*+\\s+)?(?:${keywordAlt})\\b`);
}

function buildTaskHeadingRegex(states, { allowAsterisks = true } = {}) {
  const keywordAlt = getKeywordAlternation(states);
  const markerAlt = getMarkerAlternation(states);

  const headMarkerPart = (() => {
    const parts = [];
    if (allowAsterisks) parts.push("\\*+");
    if (markerAlt) parts.push(`(?:${markerAlt})`);
    if (parts.length === 0) return "\\*+";
    if (parts.length === 1) return parts[0];
    return `(?:${parts.join("|")})`;
  })();

  // Example matches:
  // * TODO Task
  // ⊙ TODO Task
  // (indent captured so callers can preserve indentation)
  return new RegExp(`^(?<indent>\\s*)(?:${headMarkerPart})\\s+(?:${keywordAlt})\\b`);
}

function createWorkflowRegistry(configValue) {
  const result = validateAndNormalizeWorkflowStates(configValue);
  const states = result.value;

  const keywordToState = new Map(states.map((s) => [s.keyword, s]));
  const cycleKeywords = states.map((s) => s.keyword);

  return {
    states,
    errors: result.errors,

    getCycleKeywords: () => cycleKeywords.slice(),
    isKnownState: (keyword) => keywordToState.has(normalizeKeyword(keyword) || ""),
    isDoneLike: (keyword) => {
      const k = normalizeKeyword(keyword);
      const st = k ? keywordToState.get(k) : undefined;
      return !!(st && st.isDoneLike);
    },
    stampsClosed: (keyword) => {
      const k = normalizeKeyword(keyword);
      const st = k ? keywordToState.get(k) : undefined;
      return !!(st && st.stampsClosed);
    },
    triggersForward: (keyword) => {
      const k = normalizeKeyword(keyword);
      const st = k ? keywordToState.get(k) : undefined;
      return !!(st && st.triggersForward);
    },
    getFirstNonDoneState: () => {
      const first = states.find((s) => !s.isDoneLike);
      return first ? first.keyword : null;
    },

    buildTaskHeadingRegex: (options) => buildTaskHeadingRegex(states, options)
  };
}

module.exports = {
  getDefaultWorkflowStates,
  validateAndNormalizeWorkflowStates,
  buildTaskPrefixRegex,
  buildTaskHeadingRegex,
  createWorkflowRegistry
};
