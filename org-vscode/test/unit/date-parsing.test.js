const assert = require('assert');
const path = require('path');
const moment = require('moment');

const { getAcceptedDateFormats } = require(path.join(__dirname, '..', '..', 'out', 'orgTagUtils.js'));

function testParsingWithDddYYYYMMDD() {
  const formats = getAcceptedDateFormats('YYYY-MM-DD');

  // Test date with day abbreviation
  const withDdd = moment('2026-01-10 Sat', formats, true);
  assert.strictEqual(withDdd.isValid(), true);
  assert.strictEqual(withDdd.format('YYYY-MM-DD'), '2026-01-10');

  // Test date without day abbreviation
  const withoutDdd = moment('2026-01-10', formats, true);
  assert.strictEqual(withoutDdd.isValid(), true);
  assert.strictEqual(withoutDdd.format('YYYY-MM-DD'), '2026-01-10');

  // Test date with time (CLOSED stamps)
  const withTime = moment('2026-01-10 Sat 14:30', formats, true);
  assert.strictEqual(withTime.isValid(), true);
  assert.strictEqual(withTime.format('YYYY-MM-DD HH:mm'), '2026-01-10 14:30');
}

function testParsingWithDddMMDDYYYY() {
  const formats = getAcceptedDateFormats('MM-DD-YYYY');

  // Test date with day abbreviation
  const withDdd = moment('01-10-2026 Sat', formats, true);
  assert.strictEqual(withDdd.isValid(), true);
  assert.strictEqual(withDdd.format('YYYY-MM-DD'), '2026-01-10');

  // Test date without day abbreviation
  const withoutDdd = moment('01-10-2026', formats, true);
  assert.strictEqual(withoutDdd.isValid(), true);
  assert.strictEqual(withoutDdd.format('YYYY-MM-DD'), '2026-01-10');

  // Test date with time (CLOSED stamps)
  const withTime = moment('01-10-2026 Sat 14:30', formats, true);
  assert.strictEqual(withTime.isValid(), true);
  assert.strictEqual(withTime.format('YYYY-MM-DD HH:mm'), '2026-01-10 14:30');
}

function testBackwardsCompatibilityMMDDYYYY() {
  const formats = getAcceptedDateFormats('YYYY-MM-DD');

  // Even with YYYY-MM-DD configured, should still parse old MM-DD-YYYY dates
  const oldFormat = moment('01-10-2026', formats, true);
  assert.strictEqual(oldFormat.isValid(), true);
  assert.strictEqual(oldFormat.format('YYYY-MM-DD'), '2026-01-10');

  const oldFormatWithDdd = moment('01-10-2026 Sat', formats, true);
  assert.strictEqual(oldFormatWithDdd.isValid(), true);
  assert.strictEqual(oldFormatWithDdd.format('YYYY-MM-DD'), '2026-01-10');
}

function testInvalidDayAbbreviation() {
  const formats = getAcceptedDateFormats('YYYY-MM-DD');

  // Jan 10, 2026 is Saturday, not Monday - strict mode should reject
  const wrongDay = moment('2026-01-10 Mon', formats, true);
  assert.strictEqual(wrongDay.isValid(), false);
}

function testParsingWithTime() {
  const formats = getAcceptedDateFormats('YYYY-MM-DD');

  // Test with 1-digit hour (Emacs allows this)
  const singleDigitHour = moment('2026-01-10 9:30', formats, true);
  assert.strictEqual(singleDigitHour.isValid(), true);
  assert.strictEqual(singleDigitHour.format('YYYY-MM-DD H:mm'), '2026-01-10 9:30');

  // Test with 2-digit hour
  const doubleDigitHour = moment('2026-01-10 14:30', formats, true);
  assert.strictEqual(doubleDigitHour.isValid(), true);
  assert.strictEqual(doubleDigitHour.format('YYYY-MM-DD HH:mm'), '2026-01-10 14:30');

  // Test with ddd and 1-digit hour time
  const withDddAndTime1 = moment('2026-01-10 Sat 9:30', formats, true);
  assert.strictEqual(withDddAndTime1.isValid(), true);
  assert.strictEqual(withDddAndTime1.format('YYYY-MM-DD ddd H:mm'), '2026-01-10 Sat 9:30');

  // Test with ddd and 2-digit hour time
  const withDddAndTime2 = moment('2026-01-10 Sat 14:30', formats, true);
  assert.strictEqual(withDddAndTime2.isValid(), true);
  assert.strictEqual(withDddAndTime2.format('YYYY-MM-DD ddd HH:mm'), '2026-01-10 Sat 14:30');
}

function testISOFallback() {
  const formats = getAcceptedDateFormats('MM-DD-YYYY');

  // Even with MM-DD-YYYY configured, ISO format should work as fallback
  const iso = moment('2026-01-10', formats, true);
  assert.strictEqual(iso.isValid(), true);
  assert.strictEqual(iso.format('YYYY-MM-DD'), '2026-01-10');

  const isoWithDdd = moment('2026-01-10 Sat', formats, true);
  assert.strictEqual(isoWithDdd.isValid(), true);
  assert.strictEqual(isoWithDdd.format('YYYY-MM-DD'), '2026-01-10');
}

function testEdgeCaseEmptyOrInvalidInput() {
  const formats = getAcceptedDateFormats('YYYY-MM-DD');

  // Empty string
  const empty = moment('', formats, true);
  assert.strictEqual(empty.isValid(), false);

  // Invalid date
  const invalid = moment('not-a-date', formats, true);
  assert.strictEqual(invalid.isValid(), false);

  // Invalid month
  const invalidMonth = moment('2026-13-01', formats, true);
  assert.strictEqual(invalidMonth.isValid(), false);

  // Invalid day
  const invalidDay = moment('2026-01-45', formats, true);
  assert.strictEqual(invalidDay.isValid(), false);
}

module.exports = {
  name: 'unit/date-parsing',
  run: () => {
    testParsingWithDddYYYYMMDD();
    testParsingWithDddMMDDYYYY();
    testBackwardsCompatibilityMMDDYYYY();
    testInvalidDayAbbreviation();
    testParsingWithTime();
    testISOFallback();
    testEdgeCaseEmptyOrInvalidInput();
  }
};
