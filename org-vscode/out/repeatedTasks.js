"use strict";

const moment = require("moment");

const { getAcceptedDateFormats } = require("./orgTagUtils");
const { getPropertyFromLinesWithInheritance } = require("./orgProperties");

// Matches an Org repeater token:
//   +1w   ++2m   .+3d
// Capture groups:
//  1) prefix: "+", "++", ".+"
//  2) amount: number
//  3) unit: d|w|m|y
const REPEATER_TOKEN_RE = /(\.|\+)?\+(\d+)([dwmy])/g;

function normalizeKeywordValue(v) {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  if (/\s/.test(t)) return null;
  return t.toUpperCase();
}

function getDefaultRepeatToStateKeyword(workflowRegistry) {
  const states = workflowRegistry && Array.isArray(workflowRegistry.states) ? workflowRegistry.states : [];
  const firstTodoLike = states.find((s) => s && s.keyword && !s.isDoneLike);
  return firstTodoLike ? firstTodoLike.keyword : null;
}

function getRepeatToStateKeyword(lines, headingLineIndex, workflowRegistry) {
  const raw = getPropertyFromLinesWithInheritance(lines, headingLineIndex, "REPEAT_TO_STATE");
  const propKeyword = normalizeKeywordValue(raw);

  if (propKeyword && workflowRegistry && workflowRegistry.isKnownState && workflowRegistry.isKnownState(propKeyword)) {
    if (!workflowRegistry.isDoneLike(propKeyword)) return propKeyword;
  }

  return getDefaultRepeatToStateKeyword(workflowRegistry);
}

function parseTimestampContentParts(content) {
  const t = String(content || "").trim();
  // date [day] [time] [rest...]
  const m = t.match(/^(\d{2,4}-\d{2}-\d{2,4})(?:\s+([A-Za-z]{3}))?(?:\s+(\d{1,2}:\d{2}))?(?:\s+(.*))?$/);
  if (!m) {
    return { date: null, hadDay: false, time: null, rest: null };
  }

  return {
    date: m[1] || null,
    hadDay: m[2] !== undefined,
    time: m[3] || null,
    rest: (m[4] || "").trim() || null
  };
}

function getFirstRepeater(rest) {
  if (!rest) return null;

  REPEATER_TOKEN_RE.lastIndex = 0;
  const m = REPEATER_TOKEN_RE.exec(rest);
  if (!m) return null;

  const rawPrefix = m[1] || "+";
  const prefix = rawPrefix === "." ? ".+" : (rawPrefix === "+" ? "+" : "+");

  // Special-case for "++": this regex sees the second '+' as the literal before the amount,
  // so we detect it from the original match string.
  const matchText = m[0];
  const effectivePrefix = matchText.startsWith("++") ? "++" : (matchText.startsWith(".+") ? ".+" : "+");

  const amount = Number.parseInt(m[2], 10);
  const unit = m[3];

  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (!unit || !/[dwmy]/.test(unit)) return null;

  return { prefix: effectivePrefix, amount, unit };
}

function unitToMomentUnit(u) {
  switch (u) {
    case "d": return "days";
    case "w": return "weeks";
    case "m": return "months";
    case "y": return "years";
    default: return null;
  }
}

function shiftDateForRepeater(baseDate, repeater, now) {
  const momentUnit = unitToMomentUnit(repeater.unit);
  if (!momentUnit) return null;

  const today = (now || moment()).clone().startOf("day");

  if (repeater.prefix === ".+") {
    // One interval after *today* (completion date), regardless of previous base.
    return today.clone().add(repeater.amount, momentUnit);
  }

  if (repeater.prefix === "++") {
    // At least one interval, then catch up into the future.
    let next = baseDate.clone().add(repeater.amount, momentUnit);
    while (next.isSameOrBefore(today, "day")) {
      next = next.add(repeater.amount, momentUnit);
    }
    return next;
  }

  // Simple '+' : one interval after previous base.
  return baseDate.clone().add(repeater.amount, momentUnit);
}

function shiftTimestampContent(content, { dateFormat, now, acceptedDateFormats } = {}) {
  const parts = parseTimestampContentParts(content);
  if (!parts.date) return { content: String(content || ""), didShift: false };

  const formats = Array.isArray(acceptedDateFormats) && acceptedDateFormats.length
    ? acceptedDateFormats
    : getAcceptedDateFormats(dateFormat || "YYYY-MM-DD");

  // Parse using just date or date+time. Weekday is ignored (we always recompute).
  const baseParseText = parts.time ? `${parts.date} ${parts.time}` : parts.date;
  const baseDate = moment(baseParseText, formats, true);
  if (!baseDate.isValid()) return { content: String(content || ""), didShift: false };

  const repeater = getFirstRepeater(parts.rest);
  if (!repeater) return { content: String(content || ""), didShift: false };

  const nextDate = shiftDateForRepeater(baseDate, repeater, now);
  if (!nextDate || !nextDate.isValid()) return { content: String(content || ""), didShift: false };

  const fmt = String(dateFormat || "YYYY-MM-DD");
  const formattedDate = nextDate.format(fmt);
  const dayPart = parts.hadDay ? ` ${nextDate.format("ddd")}` : "";
  const timePart = parts.time ? ` ${parts.time}` : "";
  const restPart = parts.rest ? ` ${parts.rest}` : "";

  return {
    content: `${formattedDate}${dayPart}${timePart}${restPart}`,
    didShift: true
  };
}

function applyRepeatersOnCompletion({ lines, headingLineIndex, planning, workflowRegistry, dateFormat, now } = {}) {
  const nextPlanning = Object.assign({}, planning || {});

  const acceptedDateFormats = getAcceptedDateFormats(dateFormat || "YYYY-MM-DD");

  let didRepeat = false;

  if (nextPlanning.scheduled) {
    const shifted = shiftTimestampContent(nextPlanning.scheduled, { dateFormat, now, acceptedDateFormats });
    if (shifted.didShift) {
      nextPlanning.scheduled = shifted.content;
      didRepeat = true;
    }
  }

  if (nextPlanning.deadline) {
    const shifted = shiftTimestampContent(nextPlanning.deadline, { dateFormat, now, acceptedDateFormats });
    if (shifted.didShift) {
      nextPlanning.deadline = shifted.content;
      didRepeat = true;
    }
  }

  if (!didRepeat) {
    return { didRepeat: false, planning: nextPlanning, repeatToStateKeyword: null };
  }

  const repeatToStateKeyword = getRepeatToStateKeyword(lines || [], headingLineIndex, workflowRegistry);
  return { didRepeat: true, planning: nextPlanning, repeatToStateKeyword };
}

module.exports = {
  shiftTimestampContent,
  applyRepeatersOnCompletion
};
