"use strict";

const HAN_CHARACTER_RE = /\p{Script=Han}/u;
const MAX_TRANSLITERATED_TITLE_LENGTH = 500;

function buildPinyinAliases(title, options = {}) {
  const text = String(title || "").trim();
  if (!options.enabled || !text || !HAN_CHARACTER_RE.test(text)) return [];

  const transliterate = options.transliterate || require("pinyin-pro").pinyin;
  const source = text.slice(0, MAX_TRANSLITERATED_TITLE_LENGTH);
  const fullParts = transliterate(source, { toneType: "none", type: "array" });
  const initialParts = transliterate(source, { pattern: "first", toneType: "none", type: "array" });
  const compactInitials = (source.match(/[A-Za-z0-9]+|\p{Script=Han}+/gu) || [])
    .map((part) => HAN_CHARACTER_RE.test(part)
      ? transliterate(part, { pattern: "first", toneType: "none", type: "array" }).join("")
      : part[0])
    .join("")
    .toLowerCase();
  const aliases = [
    Array.isArray(fullParts) ? fullParts.join(" ") : "",
    Array.isArray(fullParts) ? fullParts.join("") : "",
    Array.isArray(initialParts) ? initialParts.join("") : "",
    compactInitials
  ].filter(Boolean);

  return Array.from(new Set(aliases));
}

function buildPinyinSearchText(title, options = {}) {
  const text = String(title || "").trim();
  return [text, ...buildPinyinAliases(text, options)].filter(Boolean).join(" ");
}

module.exports = {
  MAX_TRANSLITERATED_TITLE_LENGTH,
  buildPinyinAliases,
  buildPinyinSearchText
};