const assert = require('assert');
const path = require('path');
const moment = require('moment');

const {
  SCHEDULED_REGEX,
  DEADLINE_REGEX,
  CLOSED_REGEX,
  DAY_HEADING_REGEX,
  DAY_HEADING_DECORATE_REGEX,
  SCHEDULED_STRIP_RE,
  DEADLINE_STRIP_RE,
  CLOSED_STRIP_RE,
  isPlanningLine,
  parsePlanningFromText,
  getAcceptedDateFormats,
  buildScheduledReplacement,
  getMatchingScheduledOnLine
} = require(path.join(__dirname, '..', '..', 'out', 'orgTagUtils.js'));

// ============================================================================
// SCHEDULED_REGEX Tests
// Capture groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start,
//                 (5) time-end, (6) repeater, (7) warning, (8) close-bracket
// ============================================================================

function testScheduledRegexBasicFormats() {
  // Basic date with inactive bracket
  const inactive = "SCHEDULED: [2026-01-15]";
  const inactiveMatch = inactive.match(SCHEDULED_REGEX);
  assert.notStrictEqual(inactiveMatch, null, "Should match inactive bracket");
  assert.strictEqual(inactiveMatch[1], "[", "Should capture open bracket [");
  assert.strictEqual(inactiveMatch[2], "2026-01-15", "Should capture date");
  assert.strictEqual(inactiveMatch[3], undefined, "Should not have dayname");
  assert.strictEqual(inactiveMatch[4], undefined, "Should not have time-start");
  assert.strictEqual(inactiveMatch[5], undefined, "Should not have time-end");
  assert.strictEqual(inactiveMatch[6], undefined, "Should not have repeater");
  assert.strictEqual(inactiveMatch[7], undefined, "Should not have warning");
  assert.strictEqual(inactiveMatch[8], "]", "Should capture close bracket ]");

  // Basic date with active bracket (Emacs standard)
  const active = "SCHEDULED: <2026-01-15>";
  const activeMatch = active.match(SCHEDULED_REGEX);
  assert.notStrictEqual(activeMatch, null, "Should match active bracket");
  assert.strictEqual(activeMatch[1], "<", "Should capture open bracket <");
  assert.strictEqual(activeMatch[2], "2026-01-15", "Should capture date");
  assert.strictEqual(activeMatch[8], ">", "Should capture close bracket >");
}

function testScheduledRegexWithDayname() {
  const withDdd = "SCHEDULED: <2026-01-15 Thu>";
  const match = withDdd.match(SCHEDULED_REGEX);
  assert.notStrictEqual(match, null, "Should match with dayname");
  assert.strictEqual(match[2], "2026-01-15", "Should capture date");
  assert.strictEqual(match[3], "Thu", "Should capture dayname");
}

function testScheduledRegexWithTime() {
  // Single time
  const withTime = "SCHEDULED: <2026-01-15 Thu 14:30>";
  const timeMatch = withTime.match(SCHEDULED_REGEX);
  assert.notStrictEqual(timeMatch, null, "Should match with time");
  assert.strictEqual(timeMatch[2], "2026-01-15", "Should capture date");
  assert.strictEqual(timeMatch[3], "Thu", "Should capture dayname");
  assert.strictEqual(timeMatch[4], "14:30", "Should capture time-start");
  assert.strictEqual(timeMatch[5], undefined, "Should not have time-end");

  // Time without dayname
  const timeNoDdd = "SCHEDULED: <2026-01-15 14:30>";
  const timeNoDddMatch = timeNoDdd.match(SCHEDULED_REGEX);
  assert.notStrictEqual(timeNoDddMatch, null, "Should match time without dayname");
  assert.strictEqual(timeNoDddMatch[4], "14:30", "Should capture time-start without dayname");

  // Single-digit hour (Emacs allows this)
  const singleHour = "SCHEDULED: <2026-01-15 9:00>";
  const singleMatch = singleHour.match(SCHEDULED_REGEX);
  assert.notStrictEqual(singleMatch, null, "Should match single-digit hour");
  assert.strictEqual(singleMatch[4], "9:00", "Should capture single-digit hour");
}

function testScheduledRegexWithTimeRange() {
  const timeRange = "SCHEDULED: <2026-01-15 Thu 14:00-15:30>";
  const match = timeRange.match(SCHEDULED_REGEX);
  assert.notStrictEqual(match, null, "Should match time range");
  assert.strictEqual(match[4], "14:00", "Should capture time-start");
  assert.strictEqual(match[5], "15:30", "Should capture time-end");

  // Time range without dayname
  const rangeNoDdd = "SCHEDULED: <2026-01-15 14:00-15:30>";
  const rangeMatch = rangeNoDdd.match(SCHEDULED_REGEX);
  assert.notStrictEqual(rangeMatch, null, "Should match time range without dayname");
  assert.strictEqual(rangeMatch[4], "14:00", "Should capture time-start");
  assert.strictEqual(rangeMatch[5], "15:30", "Should capture time-end");
}

function testScheduledRegexWithRepeaters() {
  // Cumulative repeater (+Nd)
  const cumulative = "SCHEDULED: <2026-01-15 Thu +1d>";
  const cumMatch = cumulative.match(SCHEDULED_REGEX);
  assert.notStrictEqual(cumMatch, null, "Should match cumulative repeater");
  assert.strictEqual(cumMatch[6], "+1d", "Should capture +1d repeater");

  // Catch-up repeater (++Nd)
  const catchUp = "SCHEDULED: <2026-01-15 Thu ++1w>";
  const catchMatch = catchUp.match(SCHEDULED_REGEX);
  assert.notStrictEqual(catchMatch, null, "Should match catch-up repeater");
  assert.strictEqual(catchMatch[6], "++1w", "Should capture ++1w repeater");

  // Restart/habit repeater (.+Nd)
  const restart = "SCHEDULED: <2026-01-15 Thu .+1d>";
  const restartMatch = restart.match(SCHEDULED_REGEX);
  assert.notStrictEqual(restartMatch, null, "Should match restart repeater");
  assert.strictEqual(restartMatch[6], ".+1d", "Should capture .+1d repeater");

  // All time units: h, d, w, m, y
  const units = [
    { input: "SCHEDULED: <2026-01-15 +2h>", expected: "+2h", desc: "hour" },
    { input: "SCHEDULED: <2026-01-15 +3d>", expected: "+3d", desc: "day" },
    { input: "SCHEDULED: <2026-01-15 +1w>", expected: "+1w", desc: "week" },
    { input: "SCHEDULED: <2026-01-15 +1m>", expected: "+1m", desc: "month" },
    { input: "SCHEDULED: <2026-01-15 +1y>", expected: "+1y", desc: "year" }
  ];
  for (const { input, expected, desc } of units) {
    const match = input.match(SCHEDULED_REGEX);
    assert.notStrictEqual(match, null, `Should match ${desc} repeater`);
    assert.strictEqual(match[6], expected, `Should capture ${expected} repeater`);
  }
}

function testScheduledRegexWithWarnings() {
  // Single-dash warning (-Nd)
  const singleDash = "SCHEDULED: <2026-01-15 Thu -3d>";
  const singleMatch = singleDash.match(SCHEDULED_REGEX);
  assert.notStrictEqual(singleMatch, null, "Should match single-dash warning");
  assert.strictEqual(singleMatch[7], "-3d", "Should capture -3d warning");

  // Double-dash warning (--Nd, first occurrence only)
  const doubleDash = "SCHEDULED: <2026-01-15 Thu --1w>";
  const doubleMatch = doubleDash.match(SCHEDULED_REGEX);
  assert.notStrictEqual(doubleMatch, null, "Should match double-dash warning");
  assert.strictEqual(doubleMatch[7], "--1w", "Should capture --1w warning");
}

function testScheduledRegexFullFormat() {
  // Full format: date + dayname + time-range + repeater + warning
  const full = "SCHEDULED: <2026-01-15 Thu 14:00-15:30 +1w -3d>";
  const match = full.match(SCHEDULED_REGEX);
  assert.notStrictEqual(match, null, "Should match full format");
  assert.strictEqual(match[1], "<", "Should capture open bracket");
  assert.strictEqual(match[2], "2026-01-15", "Should capture date");
  assert.strictEqual(match[3], "Thu", "Should capture dayname");
  assert.strictEqual(match[4], "14:00", "Should capture time-start");
  assert.strictEqual(match[5], "15:30", "Should capture time-end");
  assert.strictEqual(match[6], "+1w", "Should capture repeater");
  assert.strictEqual(match[7], "-3d", "Should capture warning");
  assert.strictEqual(match[8], ">", "Should capture close bracket");
}

function testScheduledRegexInContext() {
  // Inline with DEADLINE
  const inline = "  SCHEDULED: <2026-01-15 Thu>  DEADLINE: <2026-01-20>";
  const match = inline.match(SCHEDULED_REGEX);
  assert.notStrictEqual(match, null, "Should match inline SCHEDULED");
  assert.strictEqual(match[2], "2026-01-15", "Should capture SCHEDULED date, not DEADLINE");

  // On planning line with indentation
  const indented = "    SCHEDULED: <2026-01-15 Thu>";
  const indentMatch = indented.match(SCHEDULED_REGEX);
  assert.notStrictEqual(indentMatch, null, "Should match indented SCHEDULED");
}

// ============================================================================
// DEADLINE_REGEX Tests
// Capture groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start,
//                 (5) time-end, (6) repeater, (7) warning, (8) close-bracket
// ============================================================================

function testDeadlineRegexBasicFormats() {
  // Active bracket (Emacs standard for DEADLINE)
  const active = "DEADLINE: <2026-01-20>";
  const activeMatch = active.match(DEADLINE_REGEX);
  assert.notStrictEqual(activeMatch, null, "Should match active DEADLINE");
  assert.strictEqual(activeMatch[1], "<", "Should capture open bracket <");
  assert.strictEqual(activeMatch[2], "2026-01-20", "Should capture date");
  assert.strictEqual(activeMatch[8], ">", "Should capture close bracket >");

  // Inactive bracket (for compatibility)
  const inactive = "DEADLINE: [2026-01-20]";
  const inactiveMatch = inactive.match(DEADLINE_REGEX);
  assert.notStrictEqual(inactiveMatch, null, "Should match inactive DEADLINE");
  assert.strictEqual(inactiveMatch[1], "[", "Should capture open bracket [");
  assert.strictEqual(inactiveMatch[8], "]", "Should capture close bracket ]");
}

function testDeadlineRegexWithAllComponents() {
  // Full format
  const full = "DEADLINE: <2026-01-20 Mon 17:00 +1m -1w>";
  const match = full.match(DEADLINE_REGEX);
  assert.notStrictEqual(match, null, "Should match full DEADLINE format");
  assert.strictEqual(match[2], "2026-01-20", "Should capture date");
  assert.strictEqual(match[3], "Mon", "Should capture dayname");
  assert.strictEqual(match[4], "17:00", "Should capture time");
  assert.strictEqual(match[6], "+1m", "Should capture repeater");
  assert.strictEqual(match[7], "-1w", "Should capture warning");
}

function testDeadlineRegexWarningVariants() {
  // Deadlines commonly have warnings
  const warn3d = "DEADLINE: <2026-01-20 -3d>";
  assert.strictEqual(warn3d.match(DEADLINE_REGEX)[7], "-3d", "Should capture -3d warning");

  const warn1w = "DEADLINE: <2026-01-20 -1w>";
  assert.strictEqual(warn1w.match(DEADLINE_REGEX)[7], "-1w", "Should capture -1w warning");

  const warnFirst = "DEADLINE: <2026-01-20 --2d>";
  assert.strictEqual(warnFirst.match(DEADLINE_REGEX)[7], "--2d", "Should capture --2d (first only) warning");
}

// ============================================================================
// CLOSED_REGEX Tests
// Capture groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start,
//                 (5) time-end, (6) repeater, (7) warning, (8) close-bracket
// Note: CLOSED uses inactive brackets [...] per Emacs convention
// ============================================================================

function testClosedRegexBasicFormats() {
  // Inactive bracket (Emacs standard for CLOSED)
  const inactive = "CLOSED: [2026-01-15]";
  const inactiveMatch = inactive.match(CLOSED_REGEX);
  assert.notStrictEqual(inactiveMatch, null, "Should match inactive CLOSED");
  assert.strictEqual(inactiveMatch[1], "[", "Should capture open bracket [");
  assert.strictEqual(inactiveMatch[2], "2026-01-15", "Should capture date");
  assert.strictEqual(inactiveMatch[8], "]", "Should capture close bracket ]");

  // Active bracket (for compatibility, though not standard)
  const active = "CLOSED: <2026-01-15>";
  const activeMatch = active.match(CLOSED_REGEX);
  assert.notStrictEqual(activeMatch, null, "Should match active CLOSED for compatibility");
  assert.strictEqual(activeMatch[1], "<", "Should capture open bracket <");
}

function testClosedRegexWithTime() {
  // CLOSED typically has time
  const withTime = "CLOSED: [2026-01-15 Thu 14:30]";
  const match = withTime.match(CLOSED_REGEX);
  assert.notStrictEqual(match, null, "Should match CLOSED with time");
  assert.strictEqual(match[2], "2026-01-15", "Should capture date");
  assert.strictEqual(match[3], "Thu", "Should capture dayname");
  assert.strictEqual(match[4], "14:30", "Should capture time");
}

function testClosedRegexCompletedAlias() {
  // COMPLETED is an alias for CLOSED
  const completed = "COMPLETED: [2026-01-15 Thu 14:30]";
  const match = completed.match(CLOSED_REGEX);
  assert.notStrictEqual(match, null, "Should match COMPLETED as alias for CLOSED");
  assert.strictEqual(match[2], "2026-01-15", "Should capture date from COMPLETED");
}

// ============================================================================
// DAY_HEADING_REGEX Tests
// Capture groups: (1) indent, (2) marker, (3) open-bracket, (4) date, (5) dayname,
//                 (6) time-start, (7) time-end, (8) repeater, (9) warning,
//                 (10) close-bracket, (11) rest of line
// ============================================================================

function testDayHeadingRegexBasicFormats() {
  // Unicode marker with active bracket
  const unicode = "⊘ <2026-01-15>";
  const unicodeMatch = unicode.match(DAY_HEADING_REGEX);
  assert.notStrictEqual(unicodeMatch, null, "Should match unicode marker");
  assert.strictEqual(unicodeMatch[1], "", "Should capture empty indent");
  assert.strictEqual(unicodeMatch[2], "⊘", "Should capture unicode marker");
  assert.strictEqual(unicodeMatch[3], "<", "Should capture open bracket");
  assert.strictEqual(unicodeMatch[4], "2026-01-15", "Should capture date");
  assert.strictEqual(unicodeMatch[10], ">", "Should capture close bracket");
  assert.strictEqual(unicodeMatch[11], "", "Should capture empty rest");

  // Asterisk marker
  const asterisk = "* <2026-01-15 Thu>";
  const asteriskMatch = asterisk.match(DAY_HEADING_REGEX);
  assert.notStrictEqual(asteriskMatch, null, "Should match asterisk marker");
  assert.strictEqual(asteriskMatch[2], "*", "Should capture asterisk marker");

  // Multiple asterisks
  const multiStar = "*** <2026-01-15 Thu>";
  const multiMatch = multiStar.match(DAY_HEADING_REGEX);
  assert.notStrictEqual(multiMatch, null, "Should match multiple asterisks");
  assert.strictEqual(multiMatch[2], "***", "Should capture all asterisks");

  // Inactive bracket
  const inactive = "⊘ [2026-01-15 Thu]";
  const inactiveMatch = inactive.match(DAY_HEADING_REGEX);
  assert.notStrictEqual(inactiveMatch, null, "Should match inactive bracket");
  assert.strictEqual(inactiveMatch[3], "[", "Should capture open bracket [");
  assert.strictEqual(inactiveMatch[10], "]", "Should capture close bracket ]");
}

function testDayHeadingRegexWithIndent() {
  const indented = "  ⊘ <2026-01-15 Thu>";
  const match = indented.match(DAY_HEADING_REGEX);
  assert.notStrictEqual(match, null, "Should match indented day heading");
  assert.strictEqual(match[1], "  ", "Should capture indent");
}

function testDayHeadingRegexWithAllComponents() {
  // Full format with everything
  const full = "⊘ <2026-01-15 Thu 09:00-17:00 +1d -1h> Weekly standup";
  const match = full.match(DAY_HEADING_REGEX);
  assert.notStrictEqual(match, null, "Should match full day heading format");
  assert.strictEqual(match[2], "⊘", "Should capture marker");
  assert.strictEqual(match[3], "<", "Should capture open bracket");
  assert.strictEqual(match[4], "2026-01-15", "Should capture date");
  assert.strictEqual(match[5], "Thu", "Should capture dayname");
  assert.strictEqual(match[6], "09:00", "Should capture time-start");
  assert.strictEqual(match[7], "17:00", "Should capture time-end");
  assert.strictEqual(match[8], "+1d", "Should capture repeater");
  assert.strictEqual(match[9], "-1h", "Should capture warning");
  assert.strictEqual(match[10], ">", "Should capture close bracket");
  assert.strictEqual(match[11], " Weekly standup", "Should capture rest of line");
}

function testDayHeadingRegexRepeaterTypes() {
  const cumulative = "⊘ <2026-01-15 +1w>";
  assert.strictEqual(cumulative.match(DAY_HEADING_REGEX)[8], "+1w", "Should capture cumulative repeater");

  const catchUp = "⊘ <2026-01-15 ++2w>";
  assert.strictEqual(catchUp.match(DAY_HEADING_REGEX)[8], "++2w", "Should capture catch-up repeater");

  const restart = "⊘ <2026-01-15 .+1d>";
  assert.strictEqual(restart.match(DAY_HEADING_REGEX)[8], ".+1d", "Should capture restart repeater");
}

// ============================================================================
// STRIP Regex Tests
// ============================================================================

function testStripRegexes() {
  // SCHEDULED_STRIP_RE
  const schedLine = "some text SCHEDULED: <2026-01-15 Thu +1w> more text";
  const schedStripped = schedLine.replace(SCHEDULED_STRIP_RE, "");
  assert.strictEqual(schedStripped, "some text  more text", "Should strip SCHEDULED with active brackets");

  const schedInactive = "text SCHEDULED: [2026-01-15] more";
  assert.strictEqual(schedInactive.replace(SCHEDULED_STRIP_RE, ""), "text  more", "Should strip SCHEDULED with inactive brackets");

  // DEADLINE_STRIP_RE
  const deadLine = "text DEADLINE: <2026-01-20 -3d> more";
  assert.strictEqual(deadLine.replace(DEADLINE_STRIP_RE, ""), "text  more", "Should strip DEADLINE");

  // CLOSED_STRIP_RE
  const closedLine = "text CLOSED: [2026-01-15 Thu 14:30] more";
  assert.strictEqual(closedLine.replace(CLOSED_STRIP_RE, ""), "text  more", "Should strip CLOSED");

  const completedLine = "text COMPLETED: [2026-01-15 14:30] more";
  assert.strictEqual(completedLine.replace(CLOSED_STRIP_RE, ""), "text  more", "Should strip COMPLETED");
}

// ============================================================================
// isPlanningLine Tests
// ============================================================================

function testIsPlanningLineBasic() {
  // Lines with SCHEDULED
  assert.strictEqual(isPlanningLine("SCHEDULED: <2026-01-15>"), true, "Should recognize SCHEDULED with active bracket");
  assert.strictEqual(isPlanningLine("SCHEDULED: [2026-01-15]"), true, "Should recognize SCHEDULED with inactive bracket");
  assert.strictEqual(isPlanningLine("  SCHEDULED: <2026-01-15 Thu>"), true, "Should recognize indented SCHEDULED");

  // Lines with DEADLINE
  assert.strictEqual(isPlanningLine("DEADLINE: <2026-01-20>"), true, "Should recognize DEADLINE with active bracket");
  assert.strictEqual(isPlanningLine("DEADLINE: [2026-01-20]"), true, "Should recognize DEADLINE with inactive bracket");

  // Lines with CLOSED
  assert.strictEqual(isPlanningLine("CLOSED: [2026-01-15 14:30]"), true, "Should recognize CLOSED with inactive bracket");
  assert.strictEqual(isPlanningLine("CLOSED: <2026-01-15>"), true, "Should recognize CLOSED with active bracket");

  // Combined
  assert.strictEqual(isPlanningLine("SCHEDULED: <2026-01-15>  DEADLINE: <2026-01-20>"), true, "Should recognize combined planning");
}

function testIsPlanningLineNegative() {
  // Not planning lines
  assert.strictEqual(isPlanningLine("* TODO Some task"), false, "Should not match task heading");
  assert.strictEqual(isPlanningLine("Just some text"), false, "Should not match plain text");
  assert.strictEqual(isPlanningLine("SCHEDULED without timestamp"), false, "Should not match SCHEDULED without timestamp");
  assert.strictEqual(isPlanningLine(""), false, "Should not match empty line");
}

// ============================================================================
// parsePlanningFromText Tests
// ============================================================================

function testParsePlanningFromTextScheduled() {
  const text = "SCHEDULED: <2026-01-15 Thu>";
  const planning = parsePlanningFromText(text);
  assert.strictEqual(planning.scheduled, "2026-01-15 Thu", "Should parse SCHEDULED date with dayname");
  assert.strictEqual(planning.deadline, null, "Should not have deadline");
  assert.strictEqual(planning.closed, null, "Should not have closed");
}

function testParsePlanningFromTextDeadline() {
  const text = "DEADLINE: <2026-01-20 Mon -3d>";
  const planning = parsePlanningFromText(text);
  assert.strictEqual(planning.deadline, "2026-01-20 Mon -3d", "Should parse DEADLINE with warning");
}

function testParsePlanningFromTextClosed() {
  const text = "CLOSED: [2026-01-15 Thu 14:30]";
  const planning = parsePlanningFromText(text);
  assert.strictEqual(planning.closed, "2026-01-15 Thu 14:30", "Should parse CLOSED with time");
}

function testParsePlanningFromTextClosedPrefersLast() {
  const text = "CLOSED: [2026-01-01] CLOSED: [2026-02-01]";
  const planning = parsePlanningFromText(text);
  assert.strictEqual(planning.closed, "2026-02-01", "Should prefer last CLOSED when multiple exist");
}

function testParsePlanningFromTextCombined() {
  const text = "SCHEDULED: <2026-01-15 Thu>  DEADLINE: <2026-01-20>";
  const planning = parsePlanningFromText(text);
  assert.strictEqual(planning.scheduled, "2026-01-15 Thu", "Should parse SCHEDULED from combined");
  assert.strictEqual(planning.deadline, "2026-01-20", "Should parse DEADLINE from combined");
}

function testParsePlanningFromTextBothBracketTypes() {
  // Test that both bracket types work
  const active = "SCHEDULED: <2026-01-15>";
  const activeP = parsePlanningFromText(active);
  assert.strictEqual(activeP.scheduled, "2026-01-15", "Should parse active bracket SCHEDULED");

  const inactive = "SCHEDULED: [2026-01-15]";
  const inactiveP = parsePlanningFromText(inactive);
  assert.strictEqual(inactiveP.scheduled, "2026-01-15", "Should parse inactive bracket SCHEDULED");
}

// ============================================================================
// buildScheduledReplacement Mutation Tests
// ============================================================================

function testBuildScheduledReplacementPreservesBracketType() {
  const dateFormat = "YYYY-MM-DD";
  const newDate = moment("2026-01-16", "YYYY-MM-DD", true);
  const formattedDate = newDate.format(dateFormat);

  // Active bracket should stay active
  const activeLine = "SCHEDULED: <2026-01-15>";
  const activeMatch = activeLine.match(SCHEDULED_REGEX);
  const activeResult = activeLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(activeMatch, newDate, formattedDate));
  assert.strictEqual(activeResult, "SCHEDULED: <2026-01-16>", "Should preserve active bracket");

  // Inactive bracket should stay inactive
  const inactiveLine = "SCHEDULED: [2026-01-15]";
  const inactiveMatch = inactiveLine.match(SCHEDULED_REGEX);
  const inactiveResult = inactiveLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(inactiveMatch, newDate, formattedDate));
  assert.strictEqual(inactiveResult, "SCHEDULED: [2026-01-16]", "Should preserve inactive bracket");
}

function testBuildScheduledReplacementPreservesRepeater() {
  const newDate = moment("2026-01-16", "YYYY-MM-DD", true);
  const formattedDate = "2026-01-16";

  // Cumulative repeater
  const cumLine = "SCHEDULED: <2026-01-15 Thu +1w>";
  const cumMatch = cumLine.match(SCHEDULED_REGEX);
  const cumResult = cumLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(cumMatch, newDate, formattedDate));
  assert.strictEqual(cumResult, "SCHEDULED: <2026-01-16 Fri +1w>", "Should preserve cumulative repeater");

  // Catch-up repeater
  const catchLine = "SCHEDULED: <2026-01-15 ++2d>";
  const catchMatch = catchLine.match(SCHEDULED_REGEX);
  const catchResult = catchLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(catchMatch, newDate, formattedDate));
  assert.strictEqual(catchResult, "SCHEDULED: <2026-01-16 ++2d>", "Should preserve catch-up repeater");

  // Restart repeater
  const restartLine = "SCHEDULED: <2026-01-15 .+1d>";
  const restartMatch = restartLine.match(SCHEDULED_REGEX);
  const restartResult = restartLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(restartMatch, newDate, formattedDate));
  assert.strictEqual(restartResult, "SCHEDULED: <2026-01-16 .+1d>", "Should preserve restart repeater");
}

function testBuildScheduledReplacementPreservesWarning() {
  const newDate = moment("2026-01-16", "YYYY-MM-DD", true);
  const formattedDate = "2026-01-16";

  const warnLine = "SCHEDULED: <2026-01-15 Thu -3d>";
  const warnMatch = warnLine.match(SCHEDULED_REGEX);
  const warnResult = warnLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(warnMatch, newDate, formattedDate));
  assert.strictEqual(warnResult, "SCHEDULED: <2026-01-16 Fri -3d>", "Should preserve warning");

  // Double-dash warning
  const warn2Line = "SCHEDULED: <2026-01-15 --1w>";
  const warn2Match = warn2Line.match(SCHEDULED_REGEX);
  const warn2Result = warn2Line.replace(SCHEDULED_REGEX, buildScheduledReplacement(warn2Match, newDate, formattedDate));
  assert.strictEqual(warn2Result, "SCHEDULED: <2026-01-16 --1w>", "Should preserve double-dash warning");
}

function testBuildScheduledReplacementPreservesTimeRange() {
  const newDate = moment("2026-01-16", "YYYY-MM-DD", true);
  const formattedDate = "2026-01-16";

  const rangeLine = "SCHEDULED: <2026-01-15 Thu 14:00-15:30>";
  const rangeMatch = rangeLine.match(SCHEDULED_REGEX);
  const rangeResult = rangeLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(rangeMatch, newDate, formattedDate));
  assert.strictEqual(rangeResult, "SCHEDULED: <2026-01-16 Fri 14:00-15:30>", "Should preserve time range");
}

function testBuildScheduledReplacementPreservesAllComponents() {
  const newDate = moment("2026-01-16", "YYYY-MM-DD", true);
  const formattedDate = "2026-01-16";

  // Full format with everything
  const fullLine = "SCHEDULED: <2026-01-15 Thu 14:00-15:30 +1w -3d>";
  const fullMatch = fullLine.match(SCHEDULED_REGEX);
  const fullResult = fullLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(fullMatch, newDate, formattedDate));
  assert.strictEqual(fullResult, "SCHEDULED: <2026-01-16 Fri 14:00-15:30 +1w -3d>", "Should preserve all components");
}

function testBuildScheduledReplacementDayNameUpdate() {
  const newDate = moment("2026-01-16", "YYYY-MM-DD", true); // Friday

  // Original has dayname - should update to new day
  const withDdd = "SCHEDULED: <2026-01-15 Thu>"; // Thursday
  const withMatch = withDdd.match(SCHEDULED_REGEX);
  const withResult = withDdd.replace(SCHEDULED_REGEX, buildScheduledReplacement(withMatch, newDate, "2026-01-16"));
  assert.strictEqual(withResult, "SCHEDULED: <2026-01-16 Fri>", "Should update dayname to Fri");

  // Original without dayname - should NOT add dayname
  const noDdd = "SCHEDULED: <2026-01-15>";
  const noMatch = noDdd.match(SCHEDULED_REGEX);
  const noResult = noDdd.replace(SCHEDULED_REGEX, buildScheduledReplacement(noMatch, newDate, "2026-01-16"));
  assert.strictEqual(noResult, "SCHEDULED: <2026-01-16>", "Should NOT add dayname if original didn't have it");
}

// ============================================================================
// getMatchingScheduledOnLine Tests
// ============================================================================

function testGetMatchingScheduledOnLineDateMatching() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);
  const targetDate = moment("2026-01-15", "YYYY-MM-DD", true);

  // Should match same date
  const sameActive = "SCHEDULED: <2026-01-15 Thu>";
  assert.notStrictEqual(getMatchingScheduledOnLine(sameActive, targetDate, acceptedFormats), null, "Should match same date (active)");

  const sameInactive = "SCHEDULED: [2026-01-15]";
  assert.notStrictEqual(getMatchingScheduledOnLine(sameInactive, targetDate, acceptedFormats), null, "Should match same date (inactive)");

  // Should NOT match different date
  const diffDate = "SCHEDULED: <2026-01-16 Fri>";
  assert.strictEqual(getMatchingScheduledOnLine(diffDate, targetDate, acceptedFormats), null, "Should not match different date");

  // Should return null for no SCHEDULED
  const noSched = "* TODO Some task";
  assert.strictEqual(getMatchingScheduledOnLine(noSched, targetDate, acceptedFormats), null, "Should return null for no SCHEDULED");
}

// ============================================================================
// DAY_HEADING_DECORATE_REGEX Tests
// ============================================================================

function testDayHeadingDecorateRegex() {
  // Should match asterisk markers only (not unicode)
  const asterisk = "* <2026-01-15 Thu>";
  const asteriskMatch = asterisk.match(DAY_HEADING_DECORATE_REGEX);
  assert.notStrictEqual(asteriskMatch, null, "Should match asterisk day heading");
  assert.strictEqual(asteriskMatch[2], "*", "Should capture asterisk");
  assert.strictEqual(asteriskMatch[4], "2026-01-15", "Should capture date");
  assert.strictEqual(asteriskMatch[5], "Thu", "Should capture dayname");

  // Should match both bracket types
  const activeBracket = "** <2026-01-15>";
  assert.strictEqual(activeBracket.match(DAY_HEADING_DECORATE_REGEX)[3], "<", "Should match active bracket");

  const inactiveBracket = "** [2026-01-15]";
  assert.strictEqual(inactiveBracket.match(DAY_HEADING_DECORATE_REGEX)[3], "[", "Should match inactive bracket");

  // Should NOT match unicode marker (decorate is for asterisks only)
  const unicode = "⊘ <2026-01-15>";
  assert.strictEqual(unicode.match(DAY_HEADING_DECORATE_REGEX), null, "Should NOT match unicode marker");
}

// ============================================================================
// Date Format Variations Tests
// ============================================================================

function testDateFormatVariations() {
  // MM-DD-YYYY format
  const mmddyyyy = "SCHEDULED: <01-15-2026 Thu>";
  const mmMatch = mmddyyyy.match(SCHEDULED_REGEX);
  assert.notStrictEqual(mmMatch, null, "Should match MM-DD-YYYY format");
  assert.strictEqual(mmMatch[2], "01-15-2026", "Should capture MM-DD-YYYY date");

  // DD-MM-YYYY format (European)
  const ddmmyyyy = "SCHEDULED: <15-01-2026 Thu>";
  const ddMatch = ddmmyyyy.match(SCHEDULED_REGEX);
  assert.notStrictEqual(ddMatch, null, "Should match DD-MM-YYYY format");
  assert.strictEqual(ddMatch[2], "15-01-2026", "Should capture DD-MM-YYYY date");
}

// ============================================================================
// Module exports
// ============================================================================

module.exports = {
  name: 'unit/timestamp-regex',
  run: () => {
    // SCHEDULED_REGEX tests
    testScheduledRegexBasicFormats();
    testScheduledRegexWithDayname();
    testScheduledRegexWithTime();
    testScheduledRegexWithTimeRange();
    testScheduledRegexWithRepeaters();
    testScheduledRegexWithWarnings();
    testScheduledRegexFullFormat();
    testScheduledRegexInContext();

    // DEADLINE_REGEX tests
    testDeadlineRegexBasicFormats();
    testDeadlineRegexWithAllComponents();
    testDeadlineRegexWarningVariants();

    // CLOSED_REGEX tests
    testClosedRegexBasicFormats();
    testClosedRegexWithTime();
    testClosedRegexCompletedAlias();

    // DAY_HEADING_REGEX tests
    testDayHeadingRegexBasicFormats();
    testDayHeadingRegexWithIndent();
    testDayHeadingRegexWithAllComponents();
    testDayHeadingRegexRepeaterTypes();

    // STRIP regex tests
    testStripRegexes();

    // isPlanningLine tests
    testIsPlanningLineBasic();
    testIsPlanningLineNegative();

    // parsePlanningFromText tests
    testParsePlanningFromTextScheduled();
    testParsePlanningFromTextDeadline();
    testParsePlanningFromTextClosed();
    testParsePlanningFromTextClosedPrefersLast();
    testParsePlanningFromTextCombined();
    testParsePlanningFromTextBothBracketTypes();

    // buildScheduledReplacement mutation tests
    testBuildScheduledReplacementPreservesBracketType();
    testBuildScheduledReplacementPreservesRepeater();
    testBuildScheduledReplacementPreservesWarning();
    testBuildScheduledReplacementPreservesTimeRange();
    testBuildScheduledReplacementPreservesAllComponents();
    testBuildScheduledReplacementDayNameUpdate();

    // getMatchingScheduledOnLine tests
    testGetMatchingScheduledOnLineDateMatching();

    // DAY_HEADING_DECORATE_REGEX tests
    testDayHeadingDecorateRegex();

    // Date format variations
    testDateFormatVariations();
  }
};
