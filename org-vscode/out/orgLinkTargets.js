"use strict";

const { parseHeadingLine } = require("./orgSymbolProvider");
const { findNearestHeadingLine, getPropertyFromLines } = require("./orgProperties");

const ORG_FILE_GLOB = "**/*.{org,org_archive,vsorg,vso}";
const ORG_FILE_EXCLUDE_GLOB = "**/{node_modules,.git,.vscode-test}/**";

function collectHeadingTargets(lines, uri) {
  const targets = [];

  for (let line = 0; line < lines.length; line++) {
    const parsed = parseHeadingLine(lines[line]);
    if (!parsed || !parsed.title) continue;

    targets.push({
      uri,
      line,
      level: parsed.level,
      title: parsed.title,
      id: getPropertyFromLines(lines, line, "ID")
    });
  }

  return targets;
}

function sanitizeLinkDescription(title) {
  return String(title || "").replace(/[\[\]]/g, "").trim();
}

function formatIdLink(id, title) {
  const target = String(id || "").trim();
  if (!target) return "";

  const description = sanitizeLinkDescription(title);
  return description ? `[[id:${target}][${description}]]` : `[[id:${target}]]`;
}

function parseFileLinkTarget(rawTarget) {
  const target = String(rawTarget || "");
  if (!/^file:/i.test(target)) return null;

  const separator = target.indexOf("::", 5);
  if (separator < 0) return { fileTarget: target, search: null };

  return {
    fileTarget: target.slice(0, separator),
    search: target.slice(separator + 2).trim() || null
  };
}

function findOrgTargetLine(lines, target) {
  const type = target?.type;
  const value = String(target?.value || "").trim();
  if (!type || !value) return null;

  if (type === "heading") {
    for (let line = 0; line < lines.length; line++) {
      const parsed = parseHeadingLine(lines[line]);
      if (parsed && (parsed.title === value || parsed.title.endsWith(` ${value}`))) return line;
    }
    return null;
  }

  const property = type === "id" ? "ID" : type === "anchor" ? "CUSTOM_ID" : null;
  if (property) {
    const propertyPattern = new RegExp(`^\\s*:${property}:\\s*(\\S+)\\s*$`, "i");
    for (let line = 0; line < lines.length; line++) {
      const match = String(lines[line] || "").match(propertyPattern);
      if (match && match[1] === value) return findNearestHeadingLine(lines, line) ?? line;
    }
  }

  if (type === "anchor") {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const targetPattern = new RegExp(`<<\\s*${escaped}\\s*>>`);
    for (let line = 0; line < lines.length; line++) {
      if (targetPattern.test(String(lines[line] || ""))) return line;
    }
  }

  return null;
}

function parseFileSearch(search) {
  const value = String(search || "").trim();
  if (value.startsWith("*")) return { type: "heading", value: value.slice(1).trim() };
  if (value.startsWith("#")) return { type: "anchor", value: value.slice(1).trim() };
  return null;
}

module.exports = {
  ORG_FILE_GLOB,
  ORG_FILE_EXCLUDE_GLOB,
  collectHeadingTargets,
  findOrgTargetLine,
  formatIdLink,
  parseFileLinkTarget,
  parseFileSearch,
  sanitizeLinkDescription
};