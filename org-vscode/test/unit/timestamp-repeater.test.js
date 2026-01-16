const assert = require('assert');
const path = require('path');
const moment = require('moment');

const {
  parseRepeater,
  getRepeaterFromTimestamp,
  advanceDateByRepeater,
  processRepeaterOnDone,
  getAcceptedDateFormats
} = require(path.join(__dirname, '..', '..', 'out', 'orgTagUtils.js'));

// ============================================================================
// parseRepeater Tests
// ============================================================================

function testParseRepeaterCumulative() {
  // +Nd - cumulative repeater
  const r1d = parseRepeater("+1d");
  assert.deepStrictEqual(r1d, { type: '+', value: 1, unit: 'd' }, "Should parse +1d");

  const r2w = parseRepeater("+2w");
  assert.deepStrictEqual(r2w, { type: '+', value: 2, unit: 'w' }, "Should parse +2w");

  const r1m = parseRepeater("+1m");
  assert.deepStrictEqual(r1m, { type: '+', value: 1, unit: 'm' }, "Should parse +1m");

  const r1y = parseRepeater("+1y");
  assert.deepStrictEqual(r1y, { type: '+', value: 1, unit: 'y' }, "Should parse +1y");

  const r3h = parseRepeater("+3h");
  assert.deepStrictEqual(r3h, { type: '+', value: 3, unit: 'h' }, "Should parse +3h");
}

function testParseRepeaterCatchUp() {
  // ++Nd - catch-up repeater
  const r1d = parseRepeater("++1d");
  assert.deepStrictEqual(r1d, { type: '++', value: 1, unit: 'd' }, "Should parse ++1d");

  const r1w = parseRepeater("++1w");
  assert.deepStrictEqual(r1w, { type: '++', value: 1, unit: 'w' }, "Should parse ++1w");

  const r2m = parseRepeater("++2m");
  assert.deepStrictEqual(r2m, { type: '++', value: 2, unit: 'm' }, "Should parse ++2m");
}

function testParseRepeaterRestart() {
  // .+Nd - restart repeater
  const r1d = parseRepeater(".+1d");
  assert.deepStrictEqual(r1d, { type: '.+', value: 1, unit: 'd' }, "Should parse .+1d");

  const r1w = parseRepeater(".+1w");
  assert.deepStrictEqual(r1w, { type: '.+', value: 1, unit: 'w' }, "Should parse .+1w");

  const r3m = parseRepeater(".+3m");
  assert.deepStrictEqual(r3m, { type: '.+', value: 3, unit: 'm' }, "Should parse .+3m");
}

function testParseRepeaterInvalid() {
  assert.strictEqual(parseRepeater(null), null, "Should return null for null");
  assert.strictEqual(parseRepeater(""), null, "Should return null for empty string");
  assert.strictEqual(parseRepeater("-1d"), null, "Should return null for warning (not repeater)");
  assert.strictEqual(parseRepeater("1d"), null, "Should return null for missing +");
  assert.strictEqual(parseRepeater("+d"), null, "Should return null for missing number");
  assert.strictEqual(parseRepeater("+1x"), null, "Should return null for invalid unit");
}

// ============================================================================
// getRepeaterFromTimestamp Tests
// ============================================================================

function testGetRepeaterFromActiveTimestamp() {
  // Active timestamps should extract repeater
  const r1 = getRepeaterFromTimestamp("2026-01-15 Thu +1d", '<');
  assert.deepStrictEqual(r1, { type: '+', value: 1, unit: 'd' }, "Should extract +1d from active timestamp");

  const r2 = getRepeaterFromTimestamp("2026-01-15 ++1w", '<');
  assert.deepStrictEqual(r2, { type: '++', value: 1, unit: 'w' }, "Should extract ++1w from active timestamp");

  const r3 = getRepeaterFromTimestamp("2026-01-15 .+1m", '<');
  assert.deepStrictEqual(r3, { type: '.+', value: 1, unit: 'm' }, "Should extract .+1m from active timestamp");

  // With time
  const r4 = getRepeaterFromTimestamp("2026-01-15 Thu 14:00 +1d", '<');
  assert.deepStrictEqual(r4, { type: '+', value: 1, unit: 'd' }, "Should extract repeater with time present");

  // With warning
  const r5 = getRepeaterFromTimestamp("2026-01-15 Thu +1w -3d", '<');
  assert.deepStrictEqual(r5, { type: '+', value: 1, unit: 'w' }, "Should extract repeater with warning present");
}

function testGetRepeaterFromInactiveTimestamp() {
  // By default (strictActiveTimestamps=false for backward compat), inactive timestamps
  // are treated as active and DO have repeaters. In unit tests, VS Code isn't available,
  // so the setting defaults to false (backward compatible mode).
  const r1 = getRepeaterFromTimestamp("2026-01-15 Thu +1d", '[');
  assert.deepStrictEqual(r1, { type: '+', value: 1, unit: 'd' }, "In backward compat mode, inactive timestamps have repeaters");

  const r2 = getRepeaterFromTimestamp("2026-01-15 ++1w", '[');
  assert.deepStrictEqual(r2, { type: '++', value: 1, unit: 'w' }, "In backward compat mode, inactive timestamps have repeaters");
}

function testGetRepeaterNoRepeater() {
  const r1 = getRepeaterFromTimestamp("2026-01-15 Thu", '<');
  assert.strictEqual(r1, null, "Should return null when no repeater");

  const r2 = getRepeaterFromTimestamp("2026-01-15 Thu -3d", '<');
  assert.strictEqual(r2, null, "Should return null for warning-only timestamp");
}

// ============================================================================
// advanceDateByRepeater Tests
// ============================================================================

function testAdvanceDateCumulative() {
  const dateFormat = "YYYY-MM-DD";
  const baseDate = moment("2026-01-15", dateFormat);
  const today = moment("2026-01-20", dateFormat);

  // +1d should add 1 day to current date
  const r1d = { type: '+', value: 1, unit: 'd' };
  const result1d = advanceDateByRepeater(baseDate.clone(), r1d, today);
  assert.strictEqual(result1d.format(dateFormat), "2026-01-16", "Cumulative +1d should add 1 day");

  // +1w should add 7 days
  const r1w = { type: '+', value: 1, unit: 'w' };
  const result1w = advanceDateByRepeater(baseDate.clone(), r1w, today);
  assert.strictEqual(result1w.format(dateFormat), "2026-01-22", "Cumulative +1w should add 7 days");

  // +1m should add 1 month
  const r1m = { type: '+', value: 1, unit: 'm' };
  const result1m = advanceDateByRepeater(baseDate.clone(), r1m, today);
  assert.strictEqual(result1m.format(dateFormat), "2026-02-15", "Cumulative +1m should add 1 month");

  // +1y should add 1 year
  const r1y = { type: '+', value: 1, unit: 'y' };
  const result1y = advanceDateByRepeater(baseDate.clone(), r1y, today);
  assert.strictEqual(result1y.format(dateFormat), "2027-01-15", "Cumulative +1y should add 1 year");

  // +2h should add 2 hours
  const baseDateWithTime = moment("2026-01-15 10:00", "YYYY-MM-DD HH:mm");
  const r2h = { type: '+', value: 2, unit: 'h' };
  const result2h = advanceDateByRepeater(baseDateWithTime.clone(), r2h, today);
  assert.strictEqual(result2h.format("YYYY-MM-DD HH:mm"), "2026-01-15 12:00", "Cumulative +2h should add 2 hours");
}

function testAdvanceDateCatchUp() {
  const dateFormat = "YYYY-MM-DD";
  const today = moment("2026-01-20", dateFormat);

  // ++1d with old date should catch up to future
  const oldDate = moment("2026-01-10", dateFormat);
  const r1d = { type: '++', value: 1, unit: 'd' };
  const result1d = advanceDateByRepeater(oldDate.clone(), r1d, today);
  assert.strictEqual(result1d.format(dateFormat), "2026-01-21", "Catch-up ++1d should advance past today");

  // ++1w with date 3 weeks ago
  const threeWeeksAgo = moment("2026-01-01", dateFormat);
  const r1w = { type: '++', value: 1, unit: 'w' };
  const result1w = advanceDateByRepeater(threeWeeksAgo.clone(), r1w, today);
  assert.strictEqual(result1w.format(dateFormat), "2026-01-22", "Catch-up ++1w should advance past today");

  // ++1d with date YEARS in the past (must handle >1000 iterations)
  const yearsAgo = moment("2020-01-01", dateFormat);
  const resultYearsAgo = advanceDateByRepeater(yearsAgo.clone(), r1d, today);
  assert.ok(resultYearsAgo.isAfter(today), "Catch-up ++1d from years ago should advance past today");
  assert.strictEqual(resultYearsAgo.format(dateFormat), "2026-01-21", "Catch-up ++1d from 2020-01-01 should reach 2026-01-21");
}

function testAdvanceDateRestart() {
  const dateFormat = "YYYY-MM-DD";
  const today = moment("2026-01-20", dateFormat);

  // .+1d should start from today and add 1 day
  const oldDate = moment("2026-01-10", dateFormat);
  const r1d = { type: '.+', value: 1, unit: 'd' };
  const result1d = advanceDateByRepeater(oldDate.clone(), r1d, today);
  assert.strictEqual(result1d.format(dateFormat), "2026-01-21", "Restart .+1d should be today + 1 day");

  // .+1w should start from today and add 7 days
  const r1w = { type: '.+', value: 1, unit: 'w' };
  const result1w = advanceDateByRepeater(oldDate.clone(), r1w, today);
  assert.strictEqual(result1w.format(dateFormat), "2026-01-27", "Restart .+1w should be today + 7 days");
}

// ============================================================================
// processRepeaterOnDone Tests
// ============================================================================

function testProcessRepeaterScheduled() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const planning = {
    scheduled: "2026-01-15 Thu +1d",
    deadline: null,
    closed: null
  };

  const result = processRepeaterOnDone(planning, dateFormat, acceptedFormats);
  assert.ok(result, "Should return result for repeater");
  assert.strictEqual(result.hadRepeater, true, "Should indicate repeater was found");
  assert.strictEqual(result.newPlanning.scheduled, "2026-01-16 Fri +1d", "Should advance date by 1 day and preserve repeater");
  assert.strictEqual(result.newPlanning.closed, null, "Should clear closed");
}

function testProcessRepeaterDeadline() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const planning = {
    scheduled: null,
    deadline: "2026-01-20 Tue +1w -3d",
    closed: null
  };

  const result = processRepeaterOnDone(planning, dateFormat, acceptedFormats);
  assert.ok(result, "Should return result for repeater");
  assert.strictEqual(result.hadRepeater, true, "Should indicate repeater was found");
  assert.ok(result.newPlanning.deadline.includes("+1w"), "Should preserve repeater in output");
  assert.ok(result.newPlanning.deadline.includes("-3d"), "Should preserve warning in output");
}

function testProcessRepeaterBoth() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const planning = {
    scheduled: "2026-01-15 +1d",
    deadline: "2026-01-20 +1w",
    closed: null
  };

  const result = processRepeaterOnDone(planning, dateFormat, acceptedFormats);
  assert.ok(result, "Should return result");
  assert.strictEqual(result.hadRepeater, true, "Should indicate repeater was found");
  assert.ok(result.newPlanning.scheduled.includes("+1d"), "Should preserve scheduled repeater");
  assert.ok(result.newPlanning.deadline.includes("+1w"), "Should preserve deadline repeater");
}

function testProcessRepeaterNoRepeater() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  const planning = {
    scheduled: "2026-01-15 Thu",
    deadline: "2026-01-20 Tue -3d",
    closed: null
  };

  const result = processRepeaterOnDone(planning, dateFormat, acceptedFormats);
  assert.strictEqual(result, null, "Should return null when no repeater");
}

function testProcessRepeaterInactiveIgnored() {
  const dateFormat = "YYYY-MM-DD";
  const acceptedFormats = getAcceptedDateFormats(dateFormat);

  // Inactive timestamps with repeaters should be ignored
  const planning = {
    scheduled: null,
    deadline: null,
    closed: "2026-01-15 Thu 14:00"
  };

  const result = processRepeaterOnDone(planning, dateFormat, acceptedFormats);
  assert.strictEqual(result, null, "Should return null for inactive-only timestamps");
}

// ============================================================================
// Module exports
// ============================================================================

module.exports = {
  name: 'unit/timestamp-repeater',
  run: () => {
    // parseRepeater tests
    testParseRepeaterCumulative();
    testParseRepeaterCatchUp();
    testParseRepeaterRestart();
    testParseRepeaterInvalid();

    // getRepeaterFromTimestamp tests
    testGetRepeaterFromActiveTimestamp();
    testGetRepeaterFromInactiveTimestamp();
    testGetRepeaterNoRepeater();

    // advanceDateByRepeater tests
    testAdvanceDateCumulative();
    testAdvanceDateCatchUp();
    testAdvanceDateRestart();

    // processRepeaterOnDone tests
    testProcessRepeaterScheduled();
    testProcessRepeaterDeadline();
    testProcessRepeaterBoth();
    testProcessRepeaterNoRepeater();
    testProcessRepeaterInactiveIgnored();
  }
};
