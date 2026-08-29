"use strict";

const { parseHeadingLine } = require("./orgSymbolProvider");
const taskKeywordManager = require("./taskKeywordManager");
const { getAllTagsFromLine, getPlanningForHeading } = require("./orgTagUtils");

const SCHEMA_VERSION = 1;

function planningDate(value) {
  const match = String(value || "").match(/\b(\d{4}-\d{2}-\d{2})\b/);
  return match ? match[1] : null;
}

function buildRecordsFromLines(lines, source, options = {}) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const path = String(source && source.path || "");
  const uri = String(source && source.uri || path);
  if (!path || !uri) return [];

  const records = [];
  for (let line = 0; line < safeLines.length; line++) {
    const parsed = parseHeadingLine(String(safeLines[line] || ""));
    if (!parsed) continue;

    const planning = getPlanningForHeading(safeLines, line);
    const record = {
      path,
      uri,
      line,
      level: Math.max(1, Math.floor(Number(parsed.level) || 1)),
      title: String(parsed.title || "").trim(),
      status: taskKeywordManager.findTaskKeyword(safeLines[line]),
      tags: getAllTagsFromLine(safeLines[line]),
      scheduled: planningDate(planning.scheduled),
      deadline: planningDate(planning.deadline),
      closed: planningDate(planning.closed),
      archived: options.archived === true
    };
    if (Object.prototype.hasOwnProperty.call(options, "updated")) {
      record.updated = options.updated;
    }
    records.push(record);
  }
  return records;
}

function isNullableString(value) {
  return value === null || typeof value === "string";
}

function isValidRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;
  const keys = ["path", "uri", "line", "level", "title", "status", "tags", "scheduled", "deadline", "closed", "archived"];
  if (!keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))) return false;
  if (Object.keys(record).some((key) => !keys.includes(key) && key !== "updated")) return false;
  if (typeof record.path !== "string" || !record.path) return false;
  if (typeof record.uri !== "string" || !record.uri) return false;
  if (!Number.isInteger(record.line) || record.line < 0) return false;
  if (!Number.isInteger(record.level) || record.level < 1) return false;
  if (typeof record.title !== "string" || !isNullableString(record.status)) return false;
  if (!Array.isArray(record.tags) || record.tags.some((tag) => typeof tag !== "string")) return false;
  if (![record.scheduled, record.deadline, record.closed].every(isNullableString)) return false;
  if (typeof record.archived !== "boolean") return false;
  if (Object.prototype.hasOwnProperty.call(record, "updated") &&
      typeof record.updated !== "string" && typeof record.updated !== "number") return false;
  return true;
}

function normalizeSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.version !== SCHEMA_VERSION || !Array.isArray(value.records)) return null;
  if (!value.records.every(isValidRecord)) return null;

  const snapshot = {
    version: SCHEMA_VERSION,
    records: value.records.map((record) => ({
      path: record.path,
      uri: record.uri,
      line: record.line,
      level: record.level,
      title: record.title,
      status: record.status,
      tags: record.tags.slice(),
      scheduled: record.scheduled,
      deadline: record.deadline,
      closed: record.closed,
      archived: record.archived,
      ...(Object.prototype.hasOwnProperty.call(record, "updated") ? { updated: record.updated } : {})
    }))
  };
  if (Object.prototype.hasOwnProperty.call(value, "updated")) {
    if (typeof value.updated !== "string" && typeof value.updated !== "number") return null;
    snapshot.updated = value.updated;
  }
  return snapshot;
}

function serializeSnapshot(records, options = {}) {
  const snapshot = normalizeSnapshot({
    version: SCHEMA_VERSION,
    records,
    ...(Object.prototype.hasOwnProperty.call(options, "updated") ? { updated: options.updated } : {})
  });
  if (!snapshot) throw new TypeError("Invalid workspace index snapshot");
  return JSON.stringify(snapshot);
}

function parseSnapshotJson(text) {
  try {
    return normalizeSnapshot(JSON.parse(String(text || "")));
  } catch {
    return null;
  }
}

module.exports = {
  SCHEMA_VERSION,
  buildRecordsFromLines,
  normalizeSnapshot,
  serializeSnapshot,
  parseSnapshotJson
};