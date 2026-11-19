"use strict";

const { normalizeTag } = require("./orgTagUtils");

const ALLOWED_KEYS = new Set([
  "text", "status", "tag", "file",
  "scheduled-before", "scheduled-after", "deadline-before", "deadline-after",
  "archived", "limit"
]);
const DEFAULT_MAX_RESULTS = 100;
const ABSOLUTE_MAX_RESULTS = 500;
const MAX_QUERY_LENGTH = 10000;

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function normalizeMax(value) {
  const number = Math.floor(Number(value));
  if (!Number.isFinite(number) || number < 1) return DEFAULT_MAX_RESULTS;
  return Math.min(number, ABSOLUTE_MAX_RESULTS);
}

function parseQuery(source, options = {}) {
  const query = {};
  const errors = [];
  const maxResults = normalizeMax(options.maxResults);
  const rawSource = String(source || "");
  if (rawSource.length > MAX_QUERY_LENGTH) {
    return { query: { limit: maxResults }, errors: [`Query exceeds ${MAX_QUERY_LENGTH} characters`] };
  }
  const lines = rawSource.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    const match = line.match(/^([a-z-]+):\s*(.*)$/i);
    if (!match) {
      errors.push(`Line ${index + 1}: expected key: value`);
      continue;
    }
    const key = match[1].toLowerCase();
    const value = match[2].trim();
    if (!ALLOWED_KEYS.has(key)) {
      errors.push(`Line ${index + 1}: unknown key "${key}"`);
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(query, key)) {
      errors.push(`Line ${index + 1}: duplicate key "${key}"`);
      continue;
    }
    if (!value) {
      errors.push(`Line ${index + 1}: "${key}" requires a value`);
      continue;
    }
    if (key.endsWith("-before") || key.endsWith("-after")) {
      if (!isIsoDate(value)) errors.push(`Line ${index + 1}: "${key}" requires YYYY-MM-DD`);
      else query[key] = value;
    } else if (key === "archived") {
      if (!/^(true|false)$/i.test(value)) errors.push(`Line ${index + 1}: "archived" requires true or false`);
      else query.archived = value.toLowerCase() === "true";
    } else if (key === "limit") {
      if (!/^\d+$/.test(value) || Number(value) < 1) errors.push(`Line ${index + 1}: "limit" requires a positive integer`);
      else query.limit = Math.min(Number(value), maxResults);
    } else {
      query[key] = value;
    }
  }

  if (!Object.prototype.hasOwnProperty.call(query, "limit")) query.limit = maxResults;
  return { query, errors };
}

function lower(value) {
  return String(value || "").toLowerCase();
}

function normalizeStatus(value) {
  return String(value || "").trim().toUpperCase();
}

function compareRecords(left, right) {
  const high = "9999-99-99";
  return String(left.scheduled || high).localeCompare(String(right.scheduled || high)) ||
    String(left.deadline || high).localeCompare(String(right.deadline || high)) ||
    (lower(left.path || left.uri) < lower(right.path || right.uri) ? -1 :
      lower(left.path || left.uri) > lower(right.path || right.uri) ? 1 : 0) ||
    left.line - right.line;
}

function matches(record, query) {
  if (query.text && !lower(record.title).includes(lower(query.text))) return false;
  if (query.status && normalizeStatus(record.status) !== normalizeStatus(query.status)) return false;
  if (query.tag && !(record.tags || []).some((tag) => normalizeTag(tag) === normalizeTag(query.tag))) return false;
  if (query.file && !lower(record.path || record.uri).includes(lower(query.file))) return false;
  if (Object.prototype.hasOwnProperty.call(query, "archived") && record.archived !== query.archived) return false;
  if (query["scheduled-before"] && (!record.scheduled || record.scheduled >= query["scheduled-before"])) return false;
  if (query["scheduled-after"] && (!record.scheduled || record.scheduled <= query["scheduled-after"])) return false;
  if (query["deadline-before"] && (!record.deadline || record.deadline >= query["deadline-before"])) return false;
  if (query["deadline-after"] && (!record.deadline || record.deadline <= query["deadline-after"])) return false;
  return true;
}

function runQuery(records, source, options = {}) {
  const parsed = parseQuery(source, options);
  if (parsed.errors.length) return { results: [], errors: parsed.errors };
  const hardCap = normalizeMax(options.maxResults);
  const limit = Math.min(parsed.query.limit, hardCap);
  const results = (Array.isArray(records) ? records : [])
    .filter((record) => matches(record, parsed.query))
    .sort(compareRecords)
    .slice(0, limit);
  return { results, errors: [] };
}

function validatePerspectives(value, options = {}) {
  if (!Array.isArray(value)) return { perspectives: [], errors: ["Perspectives must be an array"] };
  const perspectives = [];
  const errors = [];
  const names = new Set();
  value.forEach((item, index) => {
    const name = item && typeof item.name === "string" ? item.name.trim() : "";
    const query = item && typeof item.query === "string" ? item.query : "";
    if (!name || name.length > 100 || /[\r\n]/.test(name)) {
      errors.push(`Perspective ${index + 1}: invalid name`);
      return;
    }
    if (names.has(name.toLowerCase())) {
      errors.push(`Perspective ${index + 1}: duplicate name`);
      return;
    }
    const parsed = parseQuery(query, options);
    if (parsed.errors.length) {
      errors.push(`Perspective "${name}": ${parsed.errors.join("; ")}`);
      return;
    }
    names.add(name.toLowerCase());
    perspectives.push({ name, query });
  });
  return { perspectives, errors };
}

module.exports = {
  ABSOLUTE_MAX_RESULTS,
  MAX_QUERY_LENGTH,
  parseQuery,
  runQuery,
  validatePerspectives,
  compareRecords
};