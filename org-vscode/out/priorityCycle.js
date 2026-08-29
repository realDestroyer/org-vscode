"use strict";

function normalizePriorityValues(values, fallback = ["A", "B", "C"]) {
  const source = Array.isArray(values) ? values : fallback;
  const normalized = [];
  const seen = new Set();

  for (const value of source) {
    if (typeof value !== "string") continue;
    const candidate = value.trim().toUpperCase();
    if (!/^[A-Z0-9]$/.test(candidate) || seen.has(candidate)) continue;
    seen.add(candidate);
    normalized.push(candidate);
  }

  if (normalized.length > 0) return normalized;
  return source === fallback ? fallback.slice() : normalizePriorityValues(fallback, fallback);
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHeadingPrefixRegex(markers) {
  const markerAlternation = Array.from(new Set(
    (Array.isArray(markers) ? markers : [])
      .filter((marker) => typeof marker === "string" && marker.trim())
      .map((marker) => escapeRegExp(marker.trim()))
  )).join("|");
  const headingMarker = markerAlternation ? `(?:\\*+|${markerAlternation})` : "\\*+";
  return new RegExp(`^(?<prefix>\\s*${headingMarker}\\s+)(?<body>.*)$`);
}

function cyclePriorityOnHeadingLine(lineText, options = {}) {
  const text = String(lineText || "");
  const match = text.match(buildHeadingPrefixRegex(options.markers));
  if (!match || !match.groups) return { changed: false, text };

  const values = normalizePriorityValues(options.priorityValues);
  const direction = options.direction === "backward" ? "backward" : "forward";
  const keywords = new Set((Array.isArray(options.keywords) ? options.keywords : [])
    .filter((keyword) => typeof keyword === "string")
    .map((keyword) => keyword.trim().toUpperCase()));
  const firstTokenMatch = match.groups.body.match(/^(?<token>\S+)(?<rest>(?:\s+.*)?)$/);
  const hasKeyword = !!(firstTokenMatch && keywords.has(firstTokenMatch.groups.token.toUpperCase()));
  const isStarHeading = /^\s*\*+\s+/.test(text);
  if (!isStarHeading && !hasKeyword) return { changed: false, text };
  const bodyAfterKeyword = hasKeyword ? firstTokenMatch.groups.rest.trimStart() : match.groups.body;
  const cookieMatch = bodyAfterKeyword.match(/^\[#(?<value>[A-Za-z0-9])\](?<after>(?:\s+.*)?)$/);
  const currentValue = cookieMatch ? cookieMatch.groups.value.toUpperCase() : null;
  const currentIndex = currentValue ? values.indexOf(currentValue) : -1;

  let nextValue;
  if (direction === "forward") {
    nextValue = currentIndex < 0 ? values[0] : values[currentIndex + 1];
  } else {
    nextValue = currentIndex < 0 ? values[values.length - 1] : values[currentIndex - 1];
  }

  if (!cookieMatch) {
    if (!nextValue) return { changed: false, text };
    const keywordPrefix = hasKeyword ? `${firstTokenMatch.groups.token} ` : "";
    const title = hasKeyword ? bodyAfterKeyword : match.groups.body;
    const titleSuffix = title ? ` ${title}` : "";
    return {
      changed: true,
      text: `${match.groups.prefix}${keywordPrefix}[#${nextValue}]${titleSuffix}`
    };
  }

  if (!nextValue) {
    const after = cookieMatch.groups.after || "";
    const keywordPrefix = hasKeyword ? firstTokenMatch.groups.token : "";
    const separator = keywordPrefix && after ? " " : "";
    return { changed: true, text: `${match.groups.prefix}${keywordPrefix}${separator}${after.trimStart()}` };
  }

  const keywordPrefix = hasKeyword ? `${firstTokenMatch.groups.token} ` : "";
  return {
    changed: true,
    text: `${match.groups.prefix}${keywordPrefix}[#${nextValue}]${cookieMatch.groups.after || ""}`
  };
}

module.exports = {
  normalizePriorityValues,
  cyclePriorityOnHeadingLine
};