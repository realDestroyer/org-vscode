"use strict";

const moment = require("moment");

const { createWorkflowRegistry, buildTaskPrefixRegex } = require("./workflowStates");

// Utilities for parsing and formatting Org-mode style tags.
// Supports both legacy org-vscode inline tags ([+TAG:FOO,BAR]) and Emacs-style end-of-headline tags (:FOO:BAR:).

// Keep tag identifiers compatible with Org-style tag match strings.
// We normalize '-' to '_' in tag names to avoid ambiguity with the '-' NOT operator in match strings.
const VALID_TAG = /^[A-Za-z0-9_@#%]+$/;

const PLANNING_KEYWORDS = ["SCHEDULED", "DEADLINE", "CLOSED", "COMPLETED"];

// ============================================================================
// Centralized Regex Constants for Date/Planning Parsing
// ============================================================================
// All files should import these instead of defining inline regexes.
//
// Full Emacs org-mode timestamp format:
//   <DATE [DAYNAME] [TIME[-TIME]] [REPEATER] [WARNING]>   Active (appears in agenda)
//   [DATE [DAYNAME] [TIME[-TIME]] [REPEATER] [WARNING]]   Inactive (reference only)
//
// Components:
//   DATE:      YYYY-MM-DD (or MM-DD-YYYY, DD-MM-YYYY for compatibility)
//   DAYNAME:   Mon, Tue, Wed, Thu, Fri, Sat, Sun (optional)
//   TIME:      H:MM or HH:MM (optional)
//   TIME-TIME: H:MM-H:MM time range (optional)
//   REPEATER:  +Nd, ++Nw, .+Nm (cumulative/catch-up/restart) (optional)
//              Units: h=hour, d=day, w=week, m=month, y=year
//   WARNING:   -Nd, --Nw (warn before deadline, all/first occurrence) (optional)
//
// Examples:
//   <2024-01-15>                          Active date
//   [2024-01-15 Mon]                      Inactive with day
//   <2024-01-15 Mon 14:00>                Active with time
//   <2024-01-15 Mon 14:00-15:30>          Active with time range
//   <2024-01-15 Mon +1w>                  Weekly repeater
//   <2024-01-15 Mon .+1d>                 Daily habit (restart)
//   <2024-01-15 -3d>                      Warn 3 days before
//   <2024-01-15 +1m -1w>                  Monthly, warn 1 week before
// ============================================================================

// Shared pattern components
const DATE_PATTERN = '\\d{2,4}-\\d{2}-\\d{2,4}';
const DAYNAME_PATTERN = '[A-Za-z]{3}';
const TIME_PATTERN = '\\d{1,2}:\\d{2}';
const REPEATER_PATTERN = '[.+]?\\+\\d+[hdwmy]';
const WARNING_PATTERN = '-{1,2}\\d+[hdwmy]';

// Full timestamp inner pattern (without brackets)
// Capture groups: (1) date, (2) dayname, (3) time-start, (4) time-end, (5) repeater, (6) warning
const TIMESTAMP_INNER =
  `(${DATE_PATTERN})` +                           // (1) date
  `(?:\\s+(${DAYNAME_PATTERN}))?` +               // (2) dayname (optional)
  `(?:\\s+(${TIME_PATTERN})(?:-(${TIME_PATTERN}))?)` + '?' + // (3) time-start, (4) time-end (optional)
  `(?:\\s+(${REPEATER_PATTERN}))?` +              // (5) repeater (optional)
  `(?:\\s+(${WARNING_PATTERN}))?`;                // (6) warning (optional)

// --- Parsing Regexes (with capture groups) ---
// SCHEDULED capture groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start, (5) time-end, (6) repeater, (7) warning, (8) close-bracket
const SCHEDULED_REGEX = new RegExp(
  '\\bSCHEDULED:\\s*([<\\[])' + TIMESTAMP_INNER + '([>\\]])'
);
// DEADLINE capture groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start, (5) time-end, (6) repeater, (7) warning, (8) close-bracket
const DEADLINE_REGEX = new RegExp(
  '\\bDEADLINE:\\s*([<\\[])' + TIMESTAMP_INNER + '([>\\]])'
);
// CLOSED capture groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start, (5) time-end, (6) repeater, (7) warning, (8) close-bracket
// Note: CLOSED typically doesn't have repeaters/warnings but we parse them for completeness
const CLOSED_REGEX = new RegExp(
  '\\b(?:CLOSED|COMPLETED):\\s*([<\\[])' + TIMESTAMP_INNER + '([>\\]])'
);

// Day heading regex - matches headings with inline timestamps like "* <2024-01-15 Mon +1w> Weekly standup"
// In Emacs: active <...> timestamps in headlines APPEAR in agenda, inactive [...] do NOT
// Full timestamp support including repeaters/warnings since they affect agenda behavior
// Capture groups: (1) indent, (2) marker, (3) open-bracket, (4) date, (5) weekday, (6) time-start, (7) time-end, (8) repeater, (9) warning, (10) close-bracket, (11) rest of line
const DAY_HEADING_REGEX = new RegExp(
  '^(\\s*)(⊘|\\*+)\\s*([<\\[])' + TIMESTAMP_INNER + '([>\\]])(.*)$'
);

// Day heading regex for decoration purposes (asterisks only, permissive for in-editing)
// - Only matches asterisk markers (\*+), not unicode ⊘
// - Uses .*$ ending (no closing bracket required) to match partial lines during editing
// - Supports both <...> and [...] brackets
// - Capture groups: (1) indent, (2) asterisks, (3) open-bracket, (4) date, (5) weekday
const DAY_HEADING_DECORATE_REGEX = /^(\s*)(\*+)\s*([<\[])(\d{2,4}-\d{2}-\d{2,4})(?:\s+([A-Za-z]{3}))?.*$/;

function getWorkflowStatesConfigValue() {
  try {
    // Avoid a hard dependency so unit tests can run without VS Code.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const vscode = require("vscode");
    return vscode.workspace.getConfiguration("Org-vscode").get("workflowStates");
  } catch {
    return undefined;
  }
}

function getTaskPrefixRegex() {
  const configValue = getWorkflowStatesConfigValue();
  const registry = createWorkflowRegistry(configValue);
  return buildTaskPrefixRegex(registry.states);
}

// --- Strip Regexes (for removal, no capture needed) ---
// Use with .replace(REGEX, "") - note: no 'g' flag, use new RegExp(X.source, 'g') for global
// Must match both active <...> and inactive [...] timestamps with any content (including repeaters/warnings)
const SCHEDULED_STRIP_RE = /\bSCHEDULED:\s*[<\[][^\]>]*[>\]]/;
const DEADLINE_STRIP_RE = /\bDEADLINE:\s*[<\[][^\]>]*[>\]]/;
const CLOSED_STRIP_RE = /\b(?:CLOSED|COMPLETED):\s*[<\[][^\]>]*[>\]]/;
const PLANNING_STRIP_RE = /\b(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\s*[<\[][^\]>]*[>\]]/;

/**
 * Strip all inline planning stamps (SCHEDULED/DEADLINE/CLOSED/COMPLETED) from text.
 * Consolidates duplicate whitespace and trims trailing whitespace.
 * @param {string} text - The text to strip planning from
 * @returns {string} Text with planning stamps removed
 */
function stripInlinePlanning(text) {
  return String(text || "")
    .replace(new RegExp(PLANNING_STRIP_RE.source, "g"), "")
    .replace(/\s{2,}/g, " ")
    .trimRight();
}

function isPlanningLine(line) {
  const text = String(line || "");
  return /^[ \t]*(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\s*[<\[]/.test(text);
}

function parsePlanningFromText(text) {
  const out = {
    scheduled: null,
    deadline: null,
    closed: null,
    completed: null
  };

  const t = String(text || "");
  // Match both active <...> and inactive [...] timestamps
  const scheduledMatch = t.match(/\bSCHEDULED:\s*[<\[]([^\]>]+)[>\]]/);
  const deadlineMatch = t.match(/\bDEADLINE:\s*[<\[]([^\]>]+)[>\]]/);
  const closedMatch = t.match(/\bCLOSED:\s*[<\[]([^\]>]+)[>\]]/);
  const completedMatch = t.match(/\bCOMPLETED:\s*[<\[]([^\]>]+)[>\]]/);

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

/**
 * Normalize an Org timestamp content string (inside [] or <> without the brackets)
 * down to just the parts moment can parse using acceptedDateFormats.
 *
 * Examples:
 * - "2026-01-15" -> "2026-01-15"
 * - "2026-01-15 Thu" -> "2026-01-15 Thu"
 * - "2026-01-15 Thu 9:00 +1w -1d" -> "2026-01-15 Thu 9:00"
 *
 * @param {string} raw
 * @returns {string}
 */
function normalizeTimestampContentForParsing(raw) {
  const text = String(raw || "").trim();
  const m = text.match(/^(\d{2,4}-\d{2}-\d{2,4})(?:\s+([A-Za-z]{3}))?(?:\s+(\d{1,2}:\d{2}))?/);
  if (!m) return text;
  return [m[1], m[2], m[3]].filter(Boolean).join(" ");
}

/**
 * Parse a timestamp content string via moment(), safely ignoring repeaters/warnings.
 * @param {string} raw
 * @param {string[]} acceptedDateFormats
 * @param {boolean} strict
 * @returns {moment.Moment}
 */
function momentFromTimestampContent(raw, acceptedDateFormats, strict) {
  const normalized = normalizeTimestampContentForParsing(raw);
  return moment(normalized, acceptedDateFormats, strict);
}

/**
 * Build a SCHEDULED replacement string, preserving all components.
 *
 * SCHEDULED_REGEX capture groups:
 *   (1) open-bracket: < or [
 *   (2) date: YYYY-MM-DD
 *   (3) dayname: Mon, Tue, etc. (optional)
 *   (4) time-start: HH:MM (optional)
 *   (5) time-end: HH:MM (optional, for time ranges)
 *   (6) repeater: +1d, ++1w, .+1m, etc. (optional)
 *   (7) warning: -3d, --1w, etc. (optional)
 *   (8) close-bracket: > or ]
 *
 * @param {RegExpMatchArray} match - Match from SCHEDULED_REGEX
 * @param {moment.Moment} parsedNewDate - The new date as a moment object
 * @param {string} formattedNewDate - The new date formatted per dateFormat setting
 * @returns {string} The replacement SCHEDULED string
 */
function buildScheduledReplacement(match, parsedNewDate, formattedNewDate) {
  const openBracket = match[1] || '<';
  const closeBracket = match[8] || (openBracket === '<' ? '>' : ']');
  const hadDayAbbrev = match[3] !== undefined;
  const timeStart = match[4] || null;
  const timeEnd = match[5] || null;
  const repeater = match[6] || null;
  const warning = match[7] || null;

  const dayPart = hadDayAbbrev ? ` ${parsedNewDate.format("ddd")}` : "";
  const timePart = timeStart ? (timeEnd ? ` ${timeStart}-${timeEnd}` : ` ${timeStart}`) : "";
  const repeaterPart = repeater ? ` ${repeater}` : "";
  const warningPart = warning ? ` ${warning}` : "";

  return `SCHEDULED: ${openBracket}${formattedNewDate}${dayPart}${timePart}${repeaterPart}${warningPart}${closeBracket}`;
}

/**
 * Check if a line has SCHEDULED matching a specific date.
 *
 * Note: With updated SCHEDULED_REGEX, the date is in capture group 2.
 *
 * @param {string} line - The line to check
 * @param {moment.Moment} targetDate - The date to match against
 * @param {string[]} acceptedDateFormats - Formats to try when parsing
 * @returns {RegExpMatchArray|null} The match if found and date matches, null otherwise
 */
function getMatchingScheduledOnLine(line, targetDate, acceptedDateFormats) {
  const match = line.match(SCHEDULED_REGEX);
  if (!match) return null;
  const dateMatch = match[2];
  const existingDate = moment(dateMatch, acceptedDateFormats, true);
  if (existingDate.isValid() && existingDate.isSame(targetDate, 'day')) {
    return match;
  }
  return null;
}

module.exports = {
  // Centralized regex constants
  SCHEDULED_REGEX,
  DEADLINE_REGEX,
  CLOSED_REGEX,
  DAY_HEADING_REGEX,
  DAY_HEADING_DECORATE_REGEX,
  getTaskPrefixRegex,
  SCHEDULED_STRIP_RE,
  DEADLINE_STRIP_RE,
  CLOSED_STRIP_RE,
  PLANNING_STRIP_RE,
  // Functions
  stripInlinePlanning,
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
  getAcceptedDateFormats,
  momentFromTimestampContent,
  buildScheduledReplacement,
  getMatchingScheduledOnLine
};
