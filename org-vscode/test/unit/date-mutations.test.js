const assert = require('assert');
const path = require('path');

const { getAcceptedDateFormats } = require(path.join(__dirname, '..', '..', 'out', 'orgTagUtils.js'));
const { transformDayHeadingDate } = require(path.join(__dirname, '..', '..', 'out', 'incrementDate.js'));
const { transformScheduledDate } = require(path.join(__dirname, '..', '..', 'out', 'rescheduleTask.js'));
const { transformDeadlineDate } = require(path.join(__dirname, '..', '..', 'out', 'deadlineDateAdjust.js'));

// ============================================================================
// transformDayHeadingDate Tests (from incrementDate.js)
// Tests day heading mutations: ⊘ <2026-01-15 Thu> or * <2026-01-15>
// ============================================================================

function testDayHeadingIncrementBasic() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Basic active bracket - increment
  const basic = "⊘ <2026-01-15>";
  const basicResult = transformDayHeadingDate(basic, true, dateFormat, acceptedFormats);
  assert.strictEqual(basicResult.text, "⊘ <2026-01-16>", "Should increment date by 1 day");
  assert.strictEqual(basicResult.parseError, false, "Should not have parse error");

  // Basic inactive bracket - increment
  const inactive = "⊘ [2026-01-15]";
  const inactiveResult = transformDayHeadingDate(inactive, true, dateFormat, acceptedFormats);
  assert.strictEqual(inactiveResult.text, "⊘ [2026-01-16]", "Should increment and preserve inactive bracket");
}

function testDayHeadingDecrementBasic() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Basic decrement
  const basic = "⊘ <2026-01-15>";
  const basicResult = transformDayHeadingDate(basic, false, dateFormat, acceptedFormats);
  assert.strictEqual(basicResult.text, "⊘ <2026-01-14>", "Should decrement date by 1 day");
}

function testDayHeadingPreservesBracketType() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Active bracket stays active
  const active = "⊘ <2026-01-15 Thu>";
  const activeResult = transformDayHeadingDate(active, true, dateFormat, acceptedFormats);
  assert.ok(activeResult.text.includes("<2026-01-16"), "Should use active bracket <");
  assert.ok(activeResult.text.endsWith(">"), "Should end with >");

  // Inactive bracket stays inactive
  const inactive = "⊘ [2026-01-15 Thu]";
  const inactiveResult = transformDayHeadingDate(inactive, true, dateFormat, acceptedFormats);
  assert.ok(inactiveResult.text.includes("[2026-01-16"), "Should use inactive bracket [");
  assert.ok(inactiveResult.text.endsWith("]"), "Should end with ]");
}

function testDayHeadingPreservesDayName() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // With day name - should update to correct day
  const withDdd = "⊘ <2026-01-15 Thu>"; // Thursday
  const withResult = transformDayHeadingDate(withDdd, true, dateFormat, acceptedFormats);
  assert.strictEqual(withResult.text, "⊘ <2026-01-16 Fri>", "Should update dayname to Fri");

  // Without day name - should NOT add day name
  const noDdd = "⊘ <2026-01-15>";
  const noResult = transformDayHeadingDate(noDdd, true, dateFormat, acceptedFormats);
  assert.strictEqual(noResult.text, "⊘ <2026-01-16>", "Should NOT add dayname if original didn't have it");
}

function testDayHeadingPreservesTime() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Single time
  const withTime = "⊘ <2026-01-15 Thu 14:30>";
  const timeResult = transformDayHeadingDate(withTime, true, dateFormat, acceptedFormats);
  assert.strictEqual(timeResult.text, "⊘ <2026-01-16 Fri 14:30>", "Should preserve single time");

  // Time range
  const withRange = "⊘ <2026-01-15 Thu 09:00-17:00>";
  const rangeResult = transformDayHeadingDate(withRange, true, dateFormat, acceptedFormats);
  assert.strictEqual(rangeResult.text, "⊘ <2026-01-16 Fri 09:00-17:00>", "Should preserve time range");

  // Time without day name
  const timeNoDdd = "⊘ <2026-01-15 14:30>";
  const timeNoDddResult = transformDayHeadingDate(timeNoDdd, true, dateFormat, acceptedFormats);
  assert.strictEqual(timeNoDddResult.text, "⊘ <2026-01-16 14:30>", "Should preserve time without adding dayname");
}

function testDayHeadingPreservesRepeater() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Cumulative repeater +Nd
  const cumulative = "⊘ <2026-01-15 Thu +1d>";
  const cumResult = transformDayHeadingDate(cumulative, true, dateFormat, acceptedFormats);
  assert.strictEqual(cumResult.text, "⊘ <2026-01-16 Fri +1d>", "Should preserve cumulative repeater");

  // Catch-up repeater ++Nd
  const catchUp = "⊘ <2026-01-15 ++1w>";
  const catchResult = transformDayHeadingDate(catchUp, true, dateFormat, acceptedFormats);
  assert.strictEqual(catchResult.text, "⊘ <2026-01-16 ++1w>", "Should preserve catch-up repeater");

  // Restart repeater .+Nd
  const restart = "⊘ <2026-01-15 .+1d>";
  const restartResult = transformDayHeadingDate(restart, true, dateFormat, acceptedFormats);
  assert.strictEqual(restartResult.text, "⊘ <2026-01-16 .+1d>", "Should preserve restart repeater");
}

function testDayHeadingPreservesWarning() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Single-dash warning
  const singleWarn = "⊘ <2026-01-15 Thu -3d>";
  const singleResult = transformDayHeadingDate(singleWarn, true, dateFormat, acceptedFormats);
  assert.strictEqual(singleResult.text, "⊘ <2026-01-16 Fri -3d>", "Should preserve single-dash warning");

  // Double-dash warning
  const doubleWarn = "⊘ <2026-01-15 --1w>";
  const doubleResult = transformDayHeadingDate(doubleWarn, true, dateFormat, acceptedFormats);
  assert.strictEqual(doubleResult.text, "⊘ <2026-01-16 --1w>", "Should preserve double-dash warning");
}

function testDayHeadingPreservesAllComponents() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Full format with everything
  const full = "⊘ <2026-01-15 Thu 09:00-17:00 +1w -3d>";
  const fullResult = transformDayHeadingDate(full, true, dateFormat, acceptedFormats);
  assert.strictEqual(fullResult.text, "⊘ <2026-01-16 Fri 09:00-17:00 +1w -3d>", "Should preserve all components");
}

function testDayHeadingPreservesRestOfLine() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const withRest = "⊘ <2026-01-15 Thu> Weekly standup meeting";
  const restResult = transformDayHeadingDate(withRest, true, dateFormat, acceptedFormats);
  assert.strictEqual(restResult.text, "⊘ <2026-01-16 Fri> Weekly standup meeting", "Should preserve rest of line");
}

function testDayHeadingPreservesIndent() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const indented = "  ⊘ <2026-01-15 Thu>";
  const indentResult = transformDayHeadingDate(indented, true, dateFormat, acceptedFormats);
  assert.strictEqual(indentResult.text, "  ⊘ <2026-01-16 Fri>", "Should preserve indentation");
}

function testDayHeadingAsteriskMarker() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Single asterisk
  const single = "* <2026-01-15 Thu>";
  const singleResult = transformDayHeadingDate(single, true, dateFormat, acceptedFormats);
  assert.strictEqual(singleResult.text, "* <2026-01-16 Fri>", "Should work with single asterisk");

  // Multiple asterisks
  const multi = "*** <2026-01-15 Thu>";
  const multiResult = transformDayHeadingDate(multi, true, dateFormat, acceptedFormats);
  assert.strictEqual(multiResult.text, "*** <2026-01-16 Fri>", "Should work with multiple asterisks");
}

function testDayHeadingNoMatch() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Not a day heading
  const task = "* TODO Some task";
  const taskResult = transformDayHeadingDate(task, true, dateFormat, acceptedFormats);
  assert.strictEqual(taskResult.text, null, "Should return null for non-day-heading");
  assert.strictEqual(taskResult.parseError, false, "Should not have parse error");
}

function testDayHeadingInvalidDate() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Invalid date
  const invalid = "⊘ <2026-13-45>";
  const invalidResult = transformDayHeadingDate(invalid, true, dateFormat, acceptedFormats);
  assert.strictEqual(invalidResult.text, null, "Should return null for invalid date");
  assert.strictEqual(invalidResult.parseError, true, "Should have parse error");
}

function testDayHeadingMMDDYYYYFormat() {
  const dateFormat = "MM-DD-YYYY";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const mmdd = "⊘ <01-15-2026 Thu>";
  const mmddResult = transformDayHeadingDate(mmdd, true, dateFormat, acceptedFormats);
  assert.strictEqual(mmddResult.text, "⊘ <01-16-2026 Fri>", "Should work with MM-DD-YYYY format");
}

// ============================================================================
// transformScheduledDate Tests (from rescheduleTask.js)
// Tests SCHEDULED mutations: SCHEDULED: <2026-01-15 Thu>
// ============================================================================

function testScheduledIncrementBasic() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const basic = "SCHEDULED: <2026-01-15>";
  const basicResult = transformScheduledDate(basic, true, dateFormat, acceptedFormats);
  assert.strictEqual(basicResult.text, "SCHEDULED: <2026-01-16>", "Should increment SCHEDULED date");
}

function testScheduledDecrementBasic() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const basic = "SCHEDULED: <2026-01-15>";
  const basicResult = transformScheduledDate(basic, false, dateFormat, acceptedFormats);
  assert.strictEqual(basicResult.text, "SCHEDULED: <2026-01-14>", "Should decrement SCHEDULED date");
}

function testScheduledPreservesBracketType() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Active bracket stays active
  const active = "SCHEDULED: <2026-01-15 Thu>";
  const activeResult = transformScheduledDate(active, true, dateFormat, acceptedFormats);
  assert.strictEqual(activeResult.text, "SCHEDULED: <2026-01-16 Fri>", "Should preserve active bracket");

  // Inactive bracket stays inactive
  const inactive = "SCHEDULED: [2026-01-15 Thu]";
  const inactiveResult = transformScheduledDate(inactive, true, dateFormat, acceptedFormats);
  assert.strictEqual(inactiveResult.text, "SCHEDULED: [2026-01-16 Fri]", "Should preserve inactive bracket");
}

function testScheduledPreservesDayName() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // With day name
  const withDdd = "SCHEDULED: <2026-01-15 Thu>";
  const withResult = transformScheduledDate(withDdd, true, dateFormat, acceptedFormats);
  assert.strictEqual(withResult.text, "SCHEDULED: <2026-01-16 Fri>", "Should update dayname");

  // Without day name
  const noDdd = "SCHEDULED: <2026-01-15>";
  const noResult = transformScheduledDate(noDdd, true, dateFormat, acceptedFormats);
  assert.strictEqual(noResult.text, "SCHEDULED: <2026-01-16>", "Should NOT add dayname");
}

function testScheduledPreservesTime() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Time without dayname (common format)
  const timeNoDow = "SCHEDULED: <2026-01-15 14:30>";
  const timeNoDowResult = transformScheduledDate(timeNoDow, true, dateFormat, acceptedFormats);
  assert.strictEqual(timeNoDowResult.text, "SCHEDULED: <2026-01-16 14:30>", "Should preserve time without adding dayname");

  // Single time with dayname
  const withTime = "SCHEDULED: <2026-01-15 Thu 14:30>";
  const timeResult = transformScheduledDate(withTime, true, dateFormat, acceptedFormats);
  assert.strictEqual(timeResult.text, "SCHEDULED: <2026-01-16 Fri 14:30>", "Should preserve time");

  // Time range
  const withRange = "SCHEDULED: <2026-01-15 Thu 14:00-15:30>";
  const rangeResult = transformScheduledDate(withRange, true, dateFormat, acceptedFormats);
  assert.strictEqual(rangeResult.text, "SCHEDULED: <2026-01-16 Fri 14:00-15:30>", "Should preserve time range");
}

function testScheduledPreservesRepeater() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // All repeater types
  const cumulative = "SCHEDULED: <2026-01-15 +1d>";
  assert.strictEqual(transformScheduledDate(cumulative, true, dateFormat, acceptedFormats).text,
    "SCHEDULED: <2026-01-16 +1d>", "Should preserve +1d repeater");

  const catchUp = "SCHEDULED: <2026-01-15 ++1w>";
  assert.strictEqual(transformScheduledDate(catchUp, true, dateFormat, acceptedFormats).text,
    "SCHEDULED: <2026-01-16 ++1w>", "Should preserve ++1w repeater");

  const restart = "SCHEDULED: <2026-01-15 .+1d>";
  assert.strictEqual(transformScheduledDate(restart, true, dateFormat, acceptedFormats).text,
    "SCHEDULED: <2026-01-16 .+1d>", "Should preserve .+1d repeater");
}

function testScheduledPreservesWarning() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const warn = "SCHEDULED: <2026-01-15 -3d>";
  assert.strictEqual(transformScheduledDate(warn, true, dateFormat, acceptedFormats).text,
    "SCHEDULED: <2026-01-16 -3d>", "Should preserve warning");
}

function testScheduledPreservesAllComponents() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const full = "SCHEDULED: <2026-01-15 Thu 14:00-15:30 +1w -3d>";
  const fullResult = transformScheduledDate(full, true, dateFormat, acceptedFormats);
  assert.strictEqual(fullResult.text, "SCHEDULED: <2026-01-16 Fri 14:00-15:30 +1w -3d>",
    "Should preserve all SCHEDULED components");
}

function testScheduledInline() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // SCHEDULED with DEADLINE on same line
  const inline = "  SCHEDULED: <2026-01-15 Thu>  DEADLINE: <2026-01-20>";
  const inlineResult = transformScheduledDate(inline, true, dateFormat, acceptedFormats);
  assert.strictEqual(inlineResult.text, "  SCHEDULED: <2026-01-16 Fri>  DEADLINE: <2026-01-20>",
    "Should only modify SCHEDULED, not DEADLINE");
}

function testScheduledNoMatch() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const noSched = "* TODO Some task";
  const noResult = transformScheduledDate(noSched, true, dateFormat, acceptedFormats);
  assert.strictEqual(noResult.text, null, "Should return null for line without SCHEDULED");
}

// ============================================================================
// transformDeadlineDate Tests (from deadlineDateAdjust.js)
// Tests DEADLINE mutations: DEADLINE: <2026-01-20 Tue -3d>
// ============================================================================

function testDeadlineIncrementBasic() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const basic = "DEADLINE: <2026-01-20>";
  const basicResult = transformDeadlineDate(basic, true, dateFormat, acceptedFormats);
  assert.strictEqual(basicResult.text, "DEADLINE: <2026-01-21>", "Should increment DEADLINE date");
}

function testDeadlineDecrementBasic() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const basic = "DEADLINE: <2026-01-20>";
  const basicResult = transformDeadlineDate(basic, false, dateFormat, acceptedFormats);
  assert.strictEqual(basicResult.text, "DEADLINE: <2026-01-19>", "Should decrement DEADLINE date");
}

function testDeadlinePreservesBracketType() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Active bracket (Jan 20, 2026 = Tue, Jan 21, 2026 = Wed)
  const active = "DEADLINE: <2026-01-20 Tue>";
  const activeResult = transformDeadlineDate(active, true, dateFormat, acceptedFormats);
  assert.strictEqual(activeResult.text, "DEADLINE: <2026-01-21 Wed>", "Should preserve active bracket");

  // Inactive bracket
  const inactive = "DEADLINE: [2026-01-20 Tue]";
  const inactiveResult = transformDeadlineDate(inactive, true, dateFormat, acceptedFormats);
  assert.strictEqual(inactiveResult.text, "DEADLINE: [2026-01-21 Wed]", "Should preserve inactive bracket");
}

function testDeadlinePreservesTime() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Time without dayname (common format)
  const timeNoDow = "DEADLINE: <2026-01-20 17:00>";
  const timeNoDowResult = transformDeadlineDate(timeNoDow, true, dateFormat, acceptedFormats);
  assert.strictEqual(timeNoDowResult.text, "DEADLINE: <2026-01-21 17:00>", "Should preserve time without adding dayname");

  // Time with dayname (Jan 20 = Tue, Jan 21 = Wed)
  const timeWithDow = "DEADLINE: <2026-01-20 Tue 17:00>";
  const timeWithDowResult = transformDeadlineDate(timeWithDow, true, dateFormat, acceptedFormats);
  assert.strictEqual(timeWithDowResult.text, "DEADLINE: <2026-01-21 Wed 17:00>", "Should preserve time and update dayname");
}

function testDeadlinePreservesWarning() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Deadlines commonly have warnings (Jan 20 = Tue, Jan 21 = Wed)
  const warn3d = "DEADLINE: <2026-01-20 Tue -3d>";
  assert.strictEqual(transformDeadlineDate(warn3d, true, dateFormat, acceptedFormats).text,
    "DEADLINE: <2026-01-21 Wed -3d>", "Should preserve -3d warning");

  const warn1w = "DEADLINE: <2026-01-20 -1w>";
  assert.strictEqual(transformDeadlineDate(warn1w, true, dateFormat, acceptedFormats).text,
    "DEADLINE: <2026-01-21 -1w>", "Should preserve -1w warning");

  const warnFirst = "DEADLINE: <2026-01-20 --2d>";
  assert.strictEqual(transformDeadlineDate(warnFirst, true, dateFormat, acceptedFormats).text,
    "DEADLINE: <2026-01-21 --2d>", "Should preserve --2d warning");
}

function testDeadlinePreservesRepeater() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const monthly = "DEADLINE: <2026-01-20 +1m>";
  assert.strictEqual(transformDeadlineDate(monthly, true, dateFormat, acceptedFormats).text,
    "DEADLINE: <2026-01-21 +1m>", "Should preserve monthly repeater");
}

function testDeadlinePreservesAllComponents() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Jan 20, 2026 = Tue, Jan 21, 2026 = Wed
  const full = "DEADLINE: <2026-01-20 Tue 17:00 +1m -1w>";
  const fullResult = transformDeadlineDate(full, true, dateFormat, acceptedFormats);
  assert.strictEqual(fullResult.text, "DEADLINE: <2026-01-21 Wed 17:00 +1m -1w>",
    "Should preserve all DEADLINE components");
}

function testDeadlineNoMatch() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const noDeadline = "SCHEDULED: <2026-01-15>";
  const noResult = transformDeadlineDate(noDeadline, true, dateFormat, acceptedFormats);
  assert.strictEqual(noResult.text, null, "Should return null for line without DEADLINE");
}

// ============================================================================
// Cross-cutting Tests
// ============================================================================

function testMonthBoundary() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // End of month increment
  const endOfMonth = "⊘ <2026-01-31>";
  const endResult = transformDayHeadingDate(endOfMonth, true, dateFormat, acceptedFormats);
  assert.strictEqual(endResult.text, "⊘ <2026-02-01>", "Should handle month boundary correctly");

  // Start of month decrement
  const startOfMonth = "SCHEDULED: <2026-02-01>";
  const startResult = transformScheduledDate(startOfMonth, false, dateFormat, acceptedFormats);
  assert.strictEqual(startResult.text, "SCHEDULED: <2026-01-31>", "Should handle month boundary on decrement");
}

function testYearBoundary() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // End of year increment
  const endOfYear = "DEADLINE: <2026-12-31>";
  const endResult = transformDeadlineDate(endOfYear, true, dateFormat, acceptedFormats);
  assert.strictEqual(endResult.text, "DEADLINE: <2027-01-01>", "Should handle year boundary correctly");

  // Start of year decrement
  const startOfYear = "⊘ <2026-01-01>";
  const startResult = transformDayHeadingDate(startOfYear, false, dateFormat, acceptedFormats);
  assert.strictEqual(startResult.text, "⊘ <2025-12-31>", "Should handle year boundary on decrement");
}

function testLeapYear() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Feb 28 -> Feb 29 in leap year
  const feb28_2024 = "⊘ <2024-02-28>"; // 2024 is a leap year
  const feb28Result = transformDayHeadingDate(feb28_2024, true, dateFormat, acceptedFormats);
  assert.strictEqual(feb28Result.text, "⊘ <2024-02-29>", "Should handle leap year Feb 28 -> 29");

  // Feb 29 -> Mar 1 in leap year
  const feb29_2024 = "⊘ <2024-02-29>";
  const feb29Result = transformDayHeadingDate(feb29_2024, true, dateFormat, acceptedFormats);
  assert.strictEqual(feb29Result.text, "⊘ <2024-03-01>", "Should handle leap year Feb 29 -> Mar 1");

  // Feb 28 -> Mar 1 in non-leap year
  const feb28_2025 = "⊘ <2025-02-28>"; // 2025 is NOT a leap year
  const feb28_2025Result = transformDayHeadingDate(feb28_2025, true, dateFormat, acceptedFormats);
  assert.strictEqual(feb28_2025Result.text, "⊘ <2025-03-01>", "Should handle non-leap year Feb 28 -> Mar 1");
}

function testDayNameCorrectness() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Test a full week of increments
  const dates = [
    { input: "⊘ <2026-01-12 Mon>", expected: "⊘ <2026-01-13 Tue>" },
    { input: "⊘ <2026-01-13 Tue>", expected: "⊘ <2026-01-14 Wed>" },
    { input: "⊘ <2026-01-14 Wed>", expected: "⊘ <2026-01-15 Thu>" },
    { input: "⊘ <2026-01-15 Thu>", expected: "⊘ <2026-01-16 Fri>" },
    { input: "⊘ <2026-01-16 Fri>", expected: "⊘ <2026-01-17 Sat>" },
    { input: "⊘ <2026-01-17 Sat>", expected: "⊘ <2026-01-18 Sun>" },
    { input: "⊘ <2026-01-18 Sun>", expected: "⊘ <2026-01-19 Mon>" }
  ];

  for (const { input, expected } of dates) {
    const result = transformDayHeadingDate(input, true, dateFormat, acceptedFormats);
    assert.strictEqual(result.text, expected, `Day name should be correct: ${input} -> ${expected}`);
  }
}

// ============================================================================
// Module exports
// ============================================================================

module.exports = {
  name: 'unit/date-mutations',
  run: () => {
    // Day heading tests
    testDayHeadingIncrementBasic();
    testDayHeadingDecrementBasic();
    testDayHeadingPreservesBracketType();
    testDayHeadingPreservesDayName();
    testDayHeadingPreservesTime();
    testDayHeadingPreservesRepeater();
    testDayHeadingPreservesWarning();
    testDayHeadingPreservesAllComponents();
    testDayHeadingPreservesRestOfLine();
    testDayHeadingPreservesIndent();
    testDayHeadingAsteriskMarker();
    testDayHeadingNoMatch();
    testDayHeadingInvalidDate();
    testDayHeadingMMDDYYYYFormat();

    // SCHEDULED tests
    testScheduledIncrementBasic();
    testScheduledDecrementBasic();
    testScheduledPreservesBracketType();
    testScheduledPreservesDayName();
    testScheduledPreservesTime();
    testScheduledPreservesRepeater();
    testScheduledPreservesWarning();
    testScheduledPreservesAllComponents();
    testScheduledInline();
    testScheduledNoMatch();

    // DEADLINE tests
    testDeadlineIncrementBasic();
    testDeadlineDecrementBasic();
    testDeadlinePreservesBracketType();
    testDeadlinePreservesTime();
    testDeadlinePreservesWarning();
    testDeadlinePreservesRepeater();
    testDeadlinePreservesAllComponents();
    testDeadlineNoMatch();

    // Cross-cutting tests
    testMonthBoundary();
    testYearBoundary();
    testLeapYear();
    testDayNameCorrectness();
  }
};
