const assert = require('assert');
const path = require('path');
const moment = require('moment');

const { getAcceptedDateFormats, SCHEDULED_REGEX, buildScheduledReplacement, getMatchingScheduledOnLine, rescheduleScheduledForHeadingByIndex } = require(path.join(__dirname, '..', '..', 'out', 'orgTagUtils.js'));

// Test that SCHEDULED_REGEX correctly matches various formats
// Capture groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start, (5) time-end,
//                 (6) repeater, (7) warning, (8) close-bracket
function testScheduledRegexMatching() {
  // Basic date
  const basic = "SCHEDULED: [2026-01-10]";
  const basicMatch = basic.match(SCHEDULED_REGEX);
  assert.notStrictEqual(basicMatch, null, "Should match basic date");
  assert.strictEqual(basicMatch[1], "[", "Should capture open bracket");
  assert.strictEqual(basicMatch[2], "2026-01-10", "Should capture date");
  assert.strictEqual(basicMatch[3], undefined, "Should not have weekday");
  assert.strictEqual(basicMatch[4], undefined, "Should not have time");
  assert.strictEqual(basicMatch[8], "]", "Should capture close bracket");

  // Date with day abbreviation
  const withDdd = "SCHEDULED: [2026-01-10 Sat]";
  const dddMatch = withDdd.match(SCHEDULED_REGEX);
  assert.notStrictEqual(dddMatch, null, "Should match date with ddd");
  assert.strictEqual(dddMatch[2], "2026-01-10", "Should capture date");
  assert.strictEqual(dddMatch[3], "Sat", "Should capture weekday");
  assert.strictEqual(dddMatch[4], undefined, "Should not have time");

  // Date with day and time
  const withTime = "SCHEDULED: [2026-01-10 Sat 14:30]";
  const timeMatch = withTime.match(SCHEDULED_REGEX);
  assert.notStrictEqual(timeMatch, null, "Should match date with ddd and time");
  assert.strictEqual(timeMatch[2], "2026-01-10", "Should capture date");
  assert.strictEqual(timeMatch[3], "Sat", "Should capture weekday");
  assert.strictEqual(timeMatch[4], "14:30", "Should capture time");

  // Date with time but no day abbreviation
  const timeNoDdd = "SCHEDULED: [2026-01-10 14:30]";
  const timeNoDddMatch = timeNoDdd.match(SCHEDULED_REGEX);
  assert.notStrictEqual(timeNoDddMatch, null, "Should match date with time but no ddd");
  assert.strictEqual(timeNoDddMatch[2], "2026-01-10", "Should capture date");
  assert.strictEqual(timeNoDddMatch[4], "14:30", "Should capture time");

  // Inline with other content
  const inline = "  SCHEDULED: [2026-01-10 Sat]  DEADLINE: [2026-01-15]";
  const inlineMatch = inline.match(SCHEDULED_REGEX);
  assert.notStrictEqual(inlineMatch, null, "Should match inline SCHEDULED");
  assert.strictEqual(inlineMatch[2], "2026-01-10", "Should capture correct date from inline");
  assert.strictEqual(inlineMatch[3], "Sat", "Should capture weekday from inline");

  // Active timestamp (Emacs format)
  const active = "SCHEDULED: <2026-01-10 Sat>";
  const activeMatch = active.match(SCHEDULED_REGEX);
  assert.notStrictEqual(activeMatch, null, "Should match active timestamp");
  assert.strictEqual(activeMatch[1], "<", "Should capture active open bracket");
  assert.strictEqual(activeMatch[2], "2026-01-10", "Should capture date from active");
  assert.strictEqual(activeMatch[8], ">", "Should capture active close bracket");

  // With repeater
  const withRepeater = "SCHEDULED: <2026-01-10 Sat +1w>";
  const repeaterMatch = withRepeater.match(SCHEDULED_REGEX);
  assert.notStrictEqual(repeaterMatch, null, "Should match with repeater");
  assert.strictEqual(repeaterMatch[6], "+1w", "Should capture repeater");

  // With warning
  const withWarning = "SCHEDULED: <2026-01-10 Sat -3d>";
  const warningMatch = withWarning.match(SCHEDULED_REGEX);
  assert.notStrictEqual(warningMatch, null, "Should match with warning");
  assert.strictEqual(warningMatch[7], "-3d", "Should capture warning");
}

// Test buildScheduledReplacement (actual function from calendar.js)
function testBuildScheduledReplacement() {
  const dateFormat = "YYYY-MM-DD";
  const parsedNewDate = moment("2026-01-11", "YYYY-MM-DD", true);
  const formattedNewDate = parsedNewDate.format(dateFormat);

  // Test basic date - should NOT add day abbreviation
  const basicLine = "SCHEDULED: [2026-01-10]";
  const basicMatch = basicLine.match(SCHEDULED_REGEX);
  const basicResult = basicLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(basicMatch, parsedNewDate, formattedNewDate));
  assert.strictEqual(basicResult, "SCHEDULED: [2026-01-11]", "Should not add ddd when original didn't have it");

  // Test with day abbreviation - should preserve ddd format
  const dddLine = "SCHEDULED: [2026-01-10 Sat]";
  const dddMatch = dddLine.match(SCHEDULED_REGEX);
  const dddResult = dddLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(dddMatch, parsedNewDate, formattedNewDate));
  assert.strictEqual(dddResult, "SCHEDULED: [2026-01-11 Sun]", "Should update ddd to correct day");

  // Test with time - should preserve time
  const timeLine = "SCHEDULED: [2026-01-10 Sat 14:30]";
  const timeMatch = timeLine.match(SCHEDULED_REGEX);
  const timeResult = timeLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(timeMatch, parsedNewDate, formattedNewDate));
  assert.strictEqual(timeResult, "SCHEDULED: [2026-01-11 Sun 14:30]", "Should preserve time component");

  // Test inline - should only replace SCHEDULED portion
  const inlineLine = "  SCHEDULED: [2026-01-10 Sat]  DEADLINE: [2026-01-15]";
  const inlineMatch = inlineLine.match(SCHEDULED_REGEX);
  const inlineResult = inlineLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(inlineMatch, parsedNewDate, formattedNewDate));
  assert.strictEqual(inlineResult, "  SCHEDULED: [2026-01-11 Sun]  DEADLINE: [2026-01-15]", "Should only replace SCHEDULED, not DEADLINE");

  // Test active timestamp - should preserve active bracket type
  const activeLine = "SCHEDULED: <2026-01-10 Sat>";
  const activeMatch = activeLine.match(SCHEDULED_REGEX);
  const activeResult = activeLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(activeMatch, parsedNewDate, formattedNewDate));
  assert.strictEqual(activeResult, "SCHEDULED: <2026-01-11 Sun>", "Should preserve active bracket type");

  // Test with repeater - should preserve repeater
  const repeaterLine = "SCHEDULED: <2026-01-10 Sat +1w>";
  const repeaterMatch = repeaterLine.match(SCHEDULED_REGEX);
  const repeaterResult = repeaterLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(repeaterMatch, parsedNewDate, formattedNewDate));
  assert.strictEqual(repeaterResult, "SCHEDULED: <2026-01-11 Sun +1w>", "Should preserve repeater");

  // Test with time range - should preserve time range
  const timeRangeLine = "SCHEDULED: <2026-01-10 Sat 14:00-15:30>";
  const timeRangeMatch = timeRangeLine.match(SCHEDULED_REGEX);
  const timeRangeResult = timeRangeLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(timeRangeMatch, parsedNewDate, formattedNewDate));
  assert.strictEqual(timeRangeResult, "SCHEDULED: <2026-01-11 Sun 14:00-15:30>", "Should preserve time range");

  // Test with warning - should preserve warning
  const warningLine = "SCHEDULED: <2026-01-10 Sat -3d>";
  const warningMatch = warningLine.match(SCHEDULED_REGEX);
  const warningResult = warningLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(warningMatch, parsedNewDate, formattedNewDate));
  assert.strictEqual(warningResult, "SCHEDULED: <2026-01-11 Sun -3d>", "Should preserve warning");
}

// Test getMatchingScheduledOnLine (actual function from calendar.js)
function testGetMatchingScheduledOnLine() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedDateFormats = getAcceptedDateFormats(dateFormat);
  const targetDate = moment("2026-01-10", "YYYY-MM-DD", true);

  // Should match same date
  const sameLine = "SCHEDULED: [2026-01-10 Sat]";
  const sameMatch = getMatchingScheduledOnLine(sameLine, targetDate, acceptedDateFormats);
  assert.notStrictEqual(sameMatch, null, "Should match same date");

  // Should NOT match different date
  const diffLine = "SCHEDULED: [2026-01-11 Sun]";
  const diffMatch = getMatchingScheduledOnLine(diffLine, targetDate, acceptedDateFormats);
  assert.strictEqual(diffMatch, null, "Should not match different date");

  // Should match without ddd suffix
  const noDddLine = "SCHEDULED: [2026-01-10]";
  const noDddMatch = getMatchingScheduledOnLine(noDddLine, targetDate, acceptedDateFormats);
  assert.notStrictEqual(noDddMatch, null, "Should match date without ddd");

  // Should return null for line without SCHEDULED
  const noScheduled = "* TODO Some task";
  const noMatch = getMatchingScheduledOnLine(noScheduled, targetDate, acceptedDateFormats);
  assert.strictEqual(noMatch, null, "Should return null for line without SCHEDULED");
}

// Test MM-DD-YYYY format
function testMMDDYYYYFormat() {
  const dateFormat = "MM-DD-YYYY";
  const parsedNewDate = moment("2026-01-11", "YYYY-MM-DD", true);
  const formattedNewDate = parsedNewDate.format(dateFormat);

  assert.strictEqual(formattedNewDate, "01-11-2026", "Should format as MM-DD-YYYY");

  const dddLine = "SCHEDULED: [01-10-2026 Sat]";
  const dddMatch = dddLine.match(SCHEDULED_REGEX);
  const dddResult = dddLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(dddMatch, parsedNewDate, formattedNewDate));
  assert.strictEqual(dddResult, "SCHEDULED: [01-11-2026 Sun]", "Should work with MM-DD-YYYY format");
}

// Test edge case: time without day abbreviation
function testTimeWithoutDayAbbrev() {
  const parsedNewDate = moment("2026-01-11", "YYYY-MM-DD", true);
  const formattedNewDate = "2026-01-11";

  const timeLine = "SCHEDULED: [2026-01-10 14:30]";
  const timeMatch = timeLine.match(SCHEDULED_REGEX);
  const timeResult = timeLine.replace(SCHEDULED_REGEX, buildScheduledReplacement(timeMatch, parsedNewDate, formattedNewDate));
  assert.strictEqual(timeResult, "SCHEDULED: [2026-01-11 14:30]", "Should preserve time without adding ddd");
}

function testRescheduleByHeadingIndex_PreservesRepeaterOnPlanningLine() {
  const dateFormat = "YYYY-MM-DD";
  const parsedNewDate = moment("2026-01-11", "YYYY-MM-DD", true);
  const bodyIndent = "  ";

  const lines = [
    "* TODO Pay rent",
    "  SCHEDULED: <2026-01-10 Sat +1m>  DEADLINE: <2026-01-15 Thu>",
    "  Some body text"
  ];

  const result = rescheduleScheduledForHeadingByIndex(lines, 0, parsedNewDate, dateFormat, bodyIndent);
  assert.strictEqual(result.updated, true, "Should update/insert scheduled stamp");
  assert.strictEqual(result.inserted, false, "Should update existing planning-line stamp, not insert a new line");
  assert.strictEqual(
    result.lines[1],
    "  SCHEDULED: <2026-01-11 Sun +1m>  DEADLINE: <2026-01-15 Thu>",
    "Should update date and weekday, preserving repeater and keeping DEADLINE"
  );
}

function testRescheduleByHeadingIndex_UpdatesRegularScheduledOnHeadingLine() {
  const dateFormat = "YYYY-MM-DD";
  const parsedNewDate = moment("2026-01-11", "YYYY-MM-DD", true);
  const bodyIndent = "  ";

  const lines = [
    "* TODO Submit report  SCHEDULED: <2026-01-10 Sat>",
    "  Notes"
  ];

  const result = rescheduleScheduledForHeadingByIndex(lines, 0, parsedNewDate, dateFormat, bodyIndent);
  assert.strictEqual(result.updated, true, "Should update inline scheduled stamp");
  assert.strictEqual(result.inserted, false, "Should update inline stamp, not insert planning line");
  assert.strictEqual(
    result.lines[0],
    "* TODO Submit report  SCHEDULED: <2026-01-11 Sun>",
    "Should update date and weekday on heading line"
  );
}

module.exports = {
  name: 'unit/calendar-reschedule',
  run: () => {
    testScheduledRegexMatching();
    testBuildScheduledReplacement();
    testGetMatchingScheduledOnLine();
    testMMDDYYYYFormat();
    testTimeWithoutDayAbbrev();
    testRescheduleByHeadingIndex_PreservesRepeaterOnPlanningLine();
    testRescheduleByHeadingIndex_UpdatesRegularScheduledOnHeadingLine();
  }
};
