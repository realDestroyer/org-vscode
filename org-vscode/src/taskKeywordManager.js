// Centralized task keyword and symbol management for Org-vscode extension
const moment = require("moment");

const { createWorkflowRegistry } = require("./workflowStates");

let _cachedVscode = undefined;
let _cachedWorkflowStatesConfig = undefined;
let _workflowStatesConfigRead = false;
let _cachedWorkflowRegistry = null;

let _cachedTaskPrefixCaptureRegex = null;
let _cachedCleanTaskRegexes = null;

// Legacy exports retained for back-compat; the live behavior is configuration-driven.
const keywords = ["TODO", "IN_PROGRESS", "CONTINUED", "DONE", "ABANDONED"];
const characterArray = ["⊙ ", "⊘ ", "⊜ ", "⊖ ", "⊗ "];

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeKeyword(keyword) {
  if (typeof keyword !== "string") return null;
  const t = keyword.trim();
  if (!t) return null;
  return t.toUpperCase();
}

function getWorkflowStatesConfigValue() {
  if (_workflowStatesConfigRead) return _cachedWorkflowStatesConfig;
  if (_cachedVscode === null) return undefined;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _cachedVscode = require("vscode");
    if (!_cachedVscode?.workspace?.getConfiguration) {
      _cachedVscode = null;
      _cachedWorkflowStatesConfig = undefined;
      _workflowStatesConfigRead = true;
      return undefined;
    }
    _cachedWorkflowStatesConfig = _cachedVscode.workspace.getConfiguration("Org-vscode").get("workflowStates");
    _workflowStatesConfigRead = true;
    return _cachedWorkflowStatesConfig;
  } catch {
    // Not running inside VS Code (e.g. unit tests).
    _cachedVscode = null;
    _cachedWorkflowStatesConfig = undefined;
    _workflowStatesConfigRead = true;
    return undefined;
  }
}

function invalidateWorkflowCache() {
  _cachedWorkflowStatesConfig = undefined;
  _workflowStatesConfigRead = false;
  _cachedWorkflowRegistry = null;
  _cachedTaskPrefixCaptureRegex = null;
  _cachedCleanTaskRegexes = null;
}

function getWorkflowRegistry() {
  if (_cachedWorkflowRegistry) return _cachedWorkflowRegistry;
  _cachedWorkflowRegistry = createWorkflowRegistry(getWorkflowStatesConfigValue());
  return _cachedWorkflowRegistry;
}

function getCycleKeywords() {
  return getWorkflowRegistry().getCycleKeywords();
}

function getDefaultKeyword() {
  const cycle = getCycleKeywords();
  return cycle[0] || "TODO";
}

function getMarkerForKeyword(keyword) {
  const k = normalizeKeyword(keyword);
  if (!k) return "";

  const registry = getWorkflowRegistry();
  const st = registry.states.find((s) => s.keyword === k);
  if (!st || !st.marker) return "";
  return `${st.marker} `;
}

function buildTaskPrefixCaptureRegex() {
  if (_cachedTaskPrefixCaptureRegex) return _cachedTaskPrefixCaptureRegex;
  const registry = getWorkflowRegistry();
  const kws = registry.getCycleKeywords();
  const keywordAlt = kws.map(escapeRegExp).join("|");

  const markers = (registry.states || [])
    .map((s) => s.marker)
    .filter((m) => typeof m === "string" && m.length > 0);
  const markerAlt = Array.from(new Set(markers)).map(escapeRegExp).join("|");
  const markerPart = markerAlt ? `(?:${markerAlt})\\s*` : "";

  // Mirrors historical TASK_PREFIX_REGEX semantics, but captures the keyword.
  _cachedTaskPrefixCaptureRegex = new RegExp(`^(?:\\s*)(?:${markerPart})?(?:\\*+\\s+)?(${keywordAlt})\\b`);
  return _cachedTaskPrefixCaptureRegex;
}

function findTaskKeyword(lineText) {
  const m = String(lineText || "").match(buildTaskPrefixCaptureRegex());
  return m ? normalizeKeyword(m[1]) : null;
}

function getKeywordIndex(keyword) {
  const k = normalizeKeyword(keyword);
  if (!k) return -1;
  return getCycleKeywords().indexOf(k);
}

function getSymbolForKeyword(keyword) {
  return getMarkerForKeyword(keyword);
}

function rotateKeyword(currentKeyword, direction = 'left') {
  const cycle = getCycleKeywords();
  const idx = getKeywordIndex(currentKeyword);
  if (!currentKeyword || idx === -1 || cycle.length === 0) {
    // If no keyword found, always start with the first configured workflow state.
    const first = getDefaultKeyword();
    return { keyword: first, symbol: getSymbolForKeyword(first) };
  }
  let nextIdx;
  if (direction === 'left') {
    nextIdx = idx > 0 ? idx - 1 : cycle.length - 1;
  } else {
    nextIdx = idx < cycle.length - 1 ? idx + 1 : 0;
  }
  return { keyword: cycle[nextIdx], symbol: getSymbolForKeyword(cycle[nextIdx]) };
}

function cleanTaskText(lineText) {
  if (!_cachedCleanTaskRegexes) {
    const registry = getWorkflowRegistry();
    const kws = registry.getCycleKeywords();
    const kwAlt = kws.length ? kws.map(escapeRegExp).join("|") : "";
    const kwRe = kwAlt ? new RegExp(`\\b(?:${kwAlt})\\b`, "g") : null;

    const markers = (registry.states || [])
      .map((s) => s.marker)
      .filter((m) => typeof m === "string" && m.length > 0);
    const markerAlt = Array.from(new Set(markers)).map(escapeRegExp).join("|");
    const markerRe = markerAlt ? new RegExp(`(?:${markerAlt})`, "g") : null;

    _cachedCleanTaskRegexes = { kwRe, markerRe };
  }

  const { kwRe, markerRe } = _cachedCleanTaskRegexes;

  let out = String(lineText || "");
  out = out.replace(/^\s*\*+\s+/, "");
  if (markerRe) out = out.replace(markerRe, "");
  if (kwRe) out = out.replace(kwRe, "");
  return out.trim();
}

function buildTaskLine(leadingSpaces, keyword, cleanedText, options = {}) {
  const headingMarkerStyle = options.headingMarkerStyle || "unicode";
  const starPrefix = (options.starPrefix || "*").trim() || "*";

  if (headingMarkerStyle === "asterisks") {
    const suffix = cleanedText ? ` ${cleanedText}` : "";
    return `${leadingSpaces}${starPrefix} ${keyword}${suffix}`;
  }

  const marker = getSymbolForKeyword(keyword);
  const suffix = cleanedText ? ` ${cleanedText}` : "";
  return `${leadingSpaces}${marker}${keyword}${suffix}`;
}

function buildCompletedStamp(leadingSpaces, dateFormat, bodyIndent) {
  const fmt = dateFormat || "MM-DD-YYYY";
  const indent = (typeof bodyIndent === "string") ? bodyIndent : "  ";
  return `${leadingSpaces}${indent}CLOSED:[${moment().format(`${fmt} ddd HH:mm`)}]`;
}

// Back-compat alias: prefer CLOSED, but keep the existing exported name.
function buildClosedStamp(leadingSpaces, dateFormat) {
  return buildCompletedStamp(leadingSpaces, dateFormat);
}

module.exports = {
  keywords,
  characterArray,
  invalidateWorkflowCache,
  getWorkflowRegistry,
  getCycleKeywords,
  getDefaultKeyword,
  findTaskKeyword,
  getKeywordIndex,
  getSymbolForKeyword,
  rotateKeyword,
  cleanTaskText,
  buildTaskLine,
  buildCompletedStamp,
  buildClosedStamp
};
