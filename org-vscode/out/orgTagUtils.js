"use strict";

// Utilities for parsing and formatting Org-mode style tags.
// Supports both legacy org-vscode inline tags ([+TAG:FOO,BAR]) and Emacs-style end-of-headline tags (:FOO:BAR:).

// Keep tag identifiers compatible with Org-style tag match strings.
// We normalize '-' to '_' in tag names to avoid ambiguity with the '-' NOT operator in match strings.
const VALID_TAG = /^[A-Za-z0-9_@#%]+$/;

const PLANNING_KEYWORDS = ["SCHEDULED", "DEADLINE", "CLOSED", "COMPLETED"];

function isPlanningLine(line) {
  const text = String(line || "");
  // In Emacs Org, planning often lives on the line *after* the heading,
  // typically indented with at least 2 spaces.
  return /^\s{2,}(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\s*\[/.test(text);
}

function parsePlanningFromText(text) {
  const out = {
    scheduled: null,
    deadline: null,
    closed: null,
    completed: null
  };

  const t = String(text || "");
  const scheduledMatch = t.match(/SCHEDULED:\s*\[([^\]]+)\]/);
  const deadlineMatch = t.match(/DEADLINE:\s*\[([^\]]+)\]/);
  const closedMatch = t.match(/CLOSED:\s*\[([^\]]+)\]/);
  const completedMatch = t.match(/COMPLETED:\s*\[([^\]]+)\]/);

  if (scheduledMatch) out.scheduled = scheduledMatch[1];
  if (deadlineMatch) out.deadline = deadlineMatch[1];
  if (closedMatch) out.closed = closedMatch[1];
  if (completedMatch) out.completed = completedMatch[1];

  // Back-compat: if a file still uses COMPLETED, treat it as CLOSED.
  if (!out.closed && out.completed) out.closed = out.completed;

  return out;
}

function getPlanningForHeading(lines, headingIndex) {
  const arr = Array.isArray(lines) ? lines : [];
  const head = headingIndex >= 0 && headingIndex < arr.length ? String(arr[headingIndex] || "") : "";
  const next = headingIndex + 1 >= 0 && headingIndex + 1 < arr.length ? String(arr[headingIndex + 1] || "") : "";

  // Back-compat: planning may still live on the headline line.
  // Preferred: planning on the immediate child line.
  const combined = isPlanningLine(next) ? `${head}\n${next}` : head;
  return parsePlanningFromText(combined);
}

function normalizeTag(tag) {
  return String(tag || "").trim().toUpperCase().replace(/-/g, "_");
}

function uniqueUpper(tags) {
  const out = [];
  const seen = new Set();
  for (const t of tags) {
    const tag = normalizeTag(t);
    if (!tag) continue;
    if (!VALID_TAG.test(tag)) continue;
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function parseLegacyInlineTags(line) {
  const match = String(line || "").match(/\[\+TAG:([^\]]+)\]/i);
  if (!match) return [];
  return uniqueUpper(match[1].split(","));
}

function parseEndOfLineTags(line) {
  const text = String(line || "");
  // Tags must be at end-of-line, preceded by whitespace, and surrounded by single colons.
  // Example: "* TODO Title :WORK:URGENT:"
  const match = text.match(/\s+(:([A-Za-z0-9_@#%\-]+:)+)\s*$/);
  if (!match) return [];

  return uniqueUpper(match[1].split(":"));
}

function getAllTagsFromLine(line) {
  return uniqueUpper([
    ...parseEndOfLineTags(line),
    ...parseLegacyInlineTags(line)
  ]);
}

function stripLegacyInlineTagBlock(line) {
  return String(line || "").replace(/:?\s*\[\+TAG:[^\]]+\]\s*-?\s*/gi, " ");
}

function stripEndOfLineTags(line) {
  return String(line || "").replace(/\s+(:([A-Za-z0-9_@#%\-]+:)+)\s*$/g, "");
}

function stripAllTagSyntax(line) {
  return stripEndOfLineTags(stripLegacyInlineTagBlock(line));
}

function normalizeTagsAfterPlanning(line) {
  // If a line contains an Emacs-style tag block (e.g. :WORK:PROJECT:) that is followed by
  // planning keywords (SCHEDULED/DEADLINE/...), move that tag block back to the end.
  // This repairs older behavior where planning stamps were appended after the tags.
  let text = String(line || "");
  const movedTags = [];

  const misplacedTagBlockRe = /\s+:(?:[A-Za-z0-9_@#%\-]+:)+(?=\s+(?:SCHEDULED:|DEADLINE:|CLOSED:|COMPLETED:))/g;
  text = text.replace(misplacedTagBlockRe, (m) => {
    const parts = String(m || "")
      .trim()
      .split(":")
      .filter(Boolean);
    movedTags.push(...parts);
    return "";
  });

  if (!movedTags.length) return text;

  const cleaned = text.replace(/\s+$/g, "");
  return setEndOfLineTags(cleaned, movedTags);
}

function insertBeforeEndOfLineTags(line, insertion) {
  const base = normalizeTagsAfterPlanning(line).replace(/\s+$/g, "");
  const ins = String(insertion || "");
  if (!ins) return base;
  const insWithSpace = ins.startsWith(" ") ? ins : ` ${ins}`;

  const match = base.match(/\s+(:([A-Za-z0-9_@#%\-]+:)+)\s*$/);
  if (!match || match.index === undefined) {
    return `${base}${insWithSpace}`;
  }

  const before = base.slice(0, match.index).replace(/\s+$/g, "");
  const tagBlock = match[0];
  return `${before}${insWithSpace}${tagBlock}`;
}

function setEndOfLineTags(line, tags) {
  const cleaned = stripEndOfLineTags(stripLegacyInlineTagBlock(line)).replace(/\s+$/g, "");
  const normalized = uniqueUpper(tags);
  if (normalized.length === 0) return cleaned;
  return `${cleaned} :${normalized.join(":")}:`;
}

function parseFileTagsFromText(fileText) {
  const match = String(fileText || "").match(/^\s*#\+FILETAGS:\s*(.*)$/mi);
  if (!match) return [];
  // FILETAGS is a colon-delimited list like ":Peter:Boss:Secret:".
  return uniqueUpper(match[1].split(":"));
}

function createInheritanceTracker(fileTags) {
  const baseFileTags = uniqueUpper(fileTags);
  const stack = [];

  function getCurrentInheritedTags() {
    return stack.length ? stack[stack.length - 1].tags : baseFileTags;
  }

  function handleLine(line) {
    const text = String(line || "");

    // Treat org headings (asterisk-based) as the inheritance structure.
    // Unicode-only headings are not reliably hierarchical, so we don't include them in the stack.
    const headingMatch = text.match(/^\s*(?:[⊙⊖⊘⊜⊗]\s*)?(\*+)\s+/);
    if (!headingMatch) {
      return { isHeading: false, inheritedTags: getCurrentInheritedTags() };
    }

    const level = headingMatch[1].length;
    while (stack.length >= level) stack.pop();
    const parentTags = getCurrentInheritedTags();
    const explicitTags = getAllTagsFromLine(text);
    const effectiveTags = uniqueUpper([...parentTags, ...explicitTags]);
    stack.push({ level, tags: effectiveTags });
    return { isHeading: true, level, inheritedTags: effectiveTags };
  }

  return {
    handleLine,
    getCurrentInheritedTags
  };
}

function parseTagGroupsFromText(fileText) {
  const text = String(fileText || "");
  const groups = new Map();

  // Collect all #+TAGS lines (can appear multiple times)
  const lines = text.split(/\r?\n/);
  const tagLines = lines.filter(l => /^\s*#\+TAGS:\s*/i.test(l));

  for (const line of tagLines) {
    // Group tags: [ GTD : Control Persp ]
    // Mutually exclusive groups: { Context : @Home @Work }
    const blocks = [];
    const bracketRe = /\[([^\]]+)\]/g;
    const braceRe = /\{([^\}]+)\}/g;
    let m;
    while ((m = bracketRe.exec(line)) !== null) blocks.push(m[1]);
    while ((m = braceRe.exec(line)) !== null) blocks.push(m[1]);

    for (const b of blocks) {
      const inner = String(b || "").trim();
      if (!inner) continue;
      const parts = inner.split(":");
      if (parts.length < 2) continue;
      const groupRaw = parts.shift();
      const membersRaw = parts.join(":");
      const group = normalizeTag(groupRaw);
      if (!group || !VALID_TAG.test(group)) continue;

      const members = membersRaw
        .split(/\s+/)
        .map(t => normalizeTag(t))
        .filter(t => t && VALID_TAG.test(t));

      if (!members.length) continue;

      const existing = groups.get(group) || [];
      groups.set(group, uniqueUpper(existing.concat(members)));
    }
  }

  return groups;
}

function expandGroupTag(tag, groups, visited) {
  if (!groups || !groups.size) return [tag];
  const t = normalizeTag(tag);
  if (!t) return [];
  const v = visited || new Set();
  if (v.has(t)) return [];
  v.add(t);

  const direct = groups.get(t);
  if (!direct || !direct.length) return [t];

  const expanded = [];
  for (const member of direct) {
    const memberNorm = normalizeTag(member);
    if (!memberNorm) continue;

    // Always include the direct member tag itself.
    expanded.push(memberNorm);

    // If the member is itself a group tag, include its members (subgroups).
    const sub = expandGroupTag(memberNorm, groups, v);
    expanded.push(...sub);
  }
  return uniqueUpper(expanded);
}

function normalizeTagMatchInput(raw) {
  const input = String(raw || "").trim();
  if (!input) return "";

  // Back-compat shims:
  // - any:a,b  -> A|B
  // - all:a,b  -> +A+B
  // - a,b      -> +A+B
  const lower = input.toLowerCase();
  const anyPrefix = lower.startsWith("any:");
  const allPrefix = lower.startsWith("all:");
  if (anyPrefix || allPrefix) {
    const rest = input.replace(/^any:|^all:/i, "").trim();
    const tags = rest.split(",").map(t => normalizeTag(t)).filter(Boolean);
    if (!tags.length) return "";
    return anyPrefix
      ? tags.join("|")
      : tags.map(t => `+${t}`).join("");
  }

  // If the user typed a comma-separated list without operators, treat it like AND.
  if (input.includes(",") && !/[+\-|]/.test(input)) {
    const tags = input.split(",").map(t => normalizeTag(t)).filter(Boolean);
    return tags.map(t => `+${t}`).join("");
  }

  return input.toUpperCase();
}

function parseTagMatchString(raw) {
  const expr = normalizeTagMatchInput(raw);
  if (!expr) return [];

  // OR clauses separated by '|'
  const clauses = expr.split("|").map(s => s.trim()).filter(Boolean);
  return clauses.map((clause) => {
    const required = new Set();
    const forbidden = new Set();

    // Parse tokens like +FOO, -BAR, or BAZ.
    // We ignore any unsupported syntax for now (properties, TODO keywords, etc.).
    const tokenRe = /([+\-])?([A-Z0-9_@#%]+)/g;
    let m;
    while ((m = tokenRe.exec(clause)) !== null) {
      const op = m[1] || "+"; // bare tag means required
      const tag = m[2];
      if (!tag || !VALID_TAG.test(tag)) continue;
      if (op === "-") forbidden.add(tag);
      else required.add(tag);
    }

    return {
      raw: clause,
      required: Array.from(required),
      forbidden: Array.from(forbidden)
    };
  });
}

function matchesTagMatchString(raw, tags, options) {
  const clauses = parseTagMatchString(raw);
  if (!clauses.length) return false;

  const tagSet = new Set(uniqueUpper(tags));

  const groups = options && options.groups ? options.groups : null;

  return clauses.some((c) => {
    for (const t of c.required) {
      const expanded = expandGroupTag(t, groups);
      // If this is a group tag, require at least one member.
      if (expanded.length > 1 || (groups && groups.has(normalizeTag(t)))) {
        if (!expanded.some(x => tagSet.has(x))) return false;
      } else {
        if (!tagSet.has(t)) return false;
      }
    }
    for (const t of c.forbidden) {
      const expanded = expandGroupTag(t, groups);
      // For group tags, exclude any member tag.
      if (expanded.some(x => tagSet.has(x))) return false;
    }
    return true;
  });
}

/**
 * Returns the standard array of accepted date formats for parsing Org-mode dates.
 * Matches Emacs org-mode timestamp format: DATE [DAYNAME] [H:MM or HH:MM]
 * All components after DATE are optional.
 *
 * @param {string} dateFormat - The on-disk date format from Org-vscode.dateFormat setting (e.g., "YYYY-MM-DD")
 * @returns {string[]} Array of moment.js format strings to try
 */
function getAcceptedDateFormats(dateFormat) {
  return [
    // On-disk format (dateFormat setting) - all variants
    // Note: Both H:mm and HH:mm are included to support both 1-digit and 2-digit hours
    dateFormat + " ddd HH:mm",    // With day abbreviation and 2-digit hour time
    dateFormat + " ddd H:mm",     // With day abbreviation and 1-digit hour time
    dateFormat + " ddd",          // With day abbreviation only
    dateFormat + " HH:mm",        // With 2-digit hour time only (no day)
    dateFormat + " H:mm",         // With 1-digit hour time only (no day)
    dateFormat,                   // Base format

    // MM-DD-YYYY fallback - all variants (backwards compatibility)
    "MM-DD-YYYY ddd HH:mm",
    "MM-DD-YYYY ddd H:mm",
    "MM-DD-YYYY ddd",
    "MM-DD-YYYY HH:mm",
    "MM-DD-YYYY H:mm",
    "MM-DD-YYYY",

    // ISO fallback - all variants
    "YYYY-MM-DD ddd HH:mm",
    "YYYY-MM-DD ddd H:mm",
    "YYYY-MM-DD ddd",
    "YYYY-MM-DD HH:mm",
    "YYYY-MM-DD H:mm",
    "YYYY-MM-DD"
  ];
}

module.exports = {
  normalizeTag,
  uniqueUpper,
  isPlanningLine,
  parsePlanningFromText,
  getPlanningForHeading,
  parseLegacyInlineTags,
  parseEndOfLineTags,
  getAllTagsFromLine,
  stripLegacyInlineTagBlock,
  stripEndOfLineTags,
  stripAllTagSyntax,
  normalizeTagsAfterPlanning,
  insertBeforeEndOfLineTags,
  setEndOfLineTags,
  parseFileTagsFromText,
  createInheritanceTracker,
  parseTagGroupsFromText,
  expandGroupTag,
  parseTagMatchString,
  matchesTagMatchString,
  normalizeTagMatchInput,
  getAcceptedDateFormats
};
