"use strict";

// Workflow keywords on checkbox list items, e.g. `- [ ] TODO Write the spec`.
// Kept separate from heading keyword detection so checkbox keywords are never
// counted as task headings by Agenda, Tagged Agenda, or subtree statistics.

// Groups: 1=indent, 2=bullet, 3=space, 4=state char, 5=space, 6=rest
const CHECKBOX_ITEM_REGEX = /^(\s*)([-+*]|\d+[.)])(\s+)\[( |x|X|-)\](\s+)(.*)$/;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getCycleKeywords(registry) {
  if (!registry || typeof registry.getCycleKeywords !== "function") return [];
  const cycle = registry.getCycleKeywords();
  return Array.isArray(cycle) ? cycle.filter((k) => typeof k === "string" && k.trim()) : [];
}

function buildLeadingKeywordRegex(registry) {
  const keywords = getCycleKeywords(registry);
  if (!keywords.length) return null;
  const alternation = keywords.map(escapeRegExp).join("|");
  return new RegExp(`^(${alternation})\\b[ \\t]*`);
}

function isCheckboxLine(line) {
  return CHECKBOX_ITEM_REGEX.test(String(line == null ? "" : line));
}

/**
 * Splits a checkbox line into its structural parts plus any leading workflow keyword.
 * Returns null when the line is not a checkbox item.
 */
function parseCheckboxLine(line, registry) {
  const match = String(line == null ? "" : line).match(CHECKBOX_ITEM_REGEX);
  if (!match) return null;

  const rest = match[6] || "";
  const keywordRegex = buildLeadingKeywordRegex(registry);

  let keyword = null;
  let text = rest;

  if (keywordRegex) {
    const keywordMatch = rest.match(keywordRegex);
    if (keywordMatch) {
      keyword = String(keywordMatch[1]).toUpperCase();
      text = rest.slice(keywordMatch[0].length);
    }
  }

  return {
    indent: match[1] || "",
    bullet: match[2] || "-",
    spaceAfterBullet: match[3] || " ",
    state: match[4] || " ",
    spaceAfterBox: match[5] || " ",
    keyword,
    text
  };
}

function findCheckboxKeyword(line, registry) {
  const parsed = parseCheckboxLine(line, registry);
  return parsed ? parsed.keyword : null;
}

function buildCheckboxLine(parts) {
  const safe = parts && typeof parts === "object" ? parts : {};
  const indent = safe.indent || "";
  const bullet = safe.bullet || "-";
  const spaceAfterBullet = safe.spaceAfterBullet || " ";
  const state = safe.state || " ";
  const spaceAfterBox = safe.spaceAfterBox || " ";
  const text = safe.text == null ? "" : String(safe.text);
  const keyword = safe.keyword ? String(safe.keyword).toUpperCase() : null;

  const body = keyword ? (text ? `${keyword} ${text}` : keyword) : text;
  return `${indent}${bullet}${spaceAfterBullet}[${state}]${spaceAfterBox}${body}`;
}

/**
 * Rotates the workflow keyword on a checkbox item.
 *
 * The ring includes a "no keyword" slot so a keyword can be removed again.
 * The checkbox marker is synced only for states that stamp CLOSED, so
 * abandoning an item does not mark it complete.
 */
function rotateCheckboxKeyword(line, direction, registry) {
  const parsed = parseCheckboxLine(line, registry);
  if (!parsed) return null;

  const cycle = getCycleKeywords(registry);
  if (!cycle.length) return null;

  const ring = [null].concat(cycle);
  const foundIndex = parsed.keyword ? ring.indexOf(parsed.keyword) : 0;
  const currentIndex = foundIndex === -1 ? 0 : foundIndex;
  const step = direction === "left" ? -1 : 1;
  const nextIndex = (currentIndex + step + ring.length) % ring.length;
  const nextKeyword = ring[nextIndex];

  const completes = (keyword) =>
    Boolean(keyword && registry && typeof registry.stampsClosed === "function" && registry.stampsClosed(keyword));

  const wasComplete = completes(parsed.keyword);
  const willBeComplete = completes(nextKeyword);

  let state = parsed.state;
  if (willBeComplete && !wasComplete) state = "X";
  else if (!willBeComplete && wasComplete) state = " ";

  const text = buildCheckboxLine({ ...parsed, keyword: nextKeyword, state });

  return {
    previousKeyword: parsed.keyword,
    keyword: nextKeyword,
    changed: text !== String(line == null ? "" : line),
    text
  };
}

module.exports = {
  CHECKBOX_ITEM_REGEX,
  isCheckboxLine,
  parseCheckboxLine,
  findCheckboxKeyword,
  buildCheckboxLine,
  rotateCheckboxKeyword
};
