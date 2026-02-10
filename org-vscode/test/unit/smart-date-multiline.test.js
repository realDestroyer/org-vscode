const assert = require('assert');
const path = require('path');

const { getAcceptedDateFormats } = require(path.join(__dirname, '..', '..', 'out', 'orgTagUtils.js'));
const { computeSmartDateReplacements } = require(path.join(__dirname, '..', '..', 'out', 'smartDateAdjust.js'));
const { computeRescheduleReplacements } = require(path.join(__dirname, '..', '..', 'out', 'rescheduleTask.js'));

function makeGetLineText(lines) {
  return (lineNumber) => (lineNumber >= 0 && lineNumber < lines.length) ? lines[lineNumber] : '';
}

function testSmartDateDedupesPlanningLine() {
  const dateFormat = 'YYYY-MM-DD';
  const accepted = getAcceptedDateFormats(dateFormat);

  const lines = [
    '* TODO Task one',
    '  SCHEDULED: <2026-02-09 Mon>'
  ];

  // Selection covers both the heading and its immediate planning line.
  const targetLines = new Set([0, 1]);

  const { replacements, warnedParse } = computeSmartDateReplacements(
    makeGetLineText(lines),
    lines.length,
    targetLines,
    true,
    dateFormat,
    accepted
  );

  assert.strictEqual(warnedParse, false, 'Should not warn parse');
  assert.strictEqual(replacements.size, 1, 'Should only compute one replacement (no overlapping edits)');
  assert.ok(replacements.has(1), 'Should update the planning line');
  assert.strictEqual(replacements.get(1), '  SCHEDULED: <2026-02-10 Tue>', 'Should increment scheduled date exactly once');
}

function testRescheduleDedupesPlanningLine() {
  const dateFormat = 'YYYY-MM-DD';
  const accepted = getAcceptedDateFormats(dateFormat);

  const lines = [
    '* TODO Task one',
    '  SCHEDULED: <2026-02-09 Mon>'
  ];

  // Selection covers both the heading and its immediate planning line.
  const targetLines = new Set([0, 1]);

  const { replacements, warnedParse } = computeRescheduleReplacements(
    makeGetLineText(lines),
    lines.length,
    targetLines,
    true,
    dateFormat,
    accepted
  );

  assert.strictEqual(warnedParse, false, 'Should not warn parse');
  assert.strictEqual(replacements.size, 1, 'Should only compute one replacement (no overlapping edits)');
  assert.ok(replacements.has(1), 'Should update the planning line');
  assert.strictEqual(replacements.get(1), '  SCHEDULED: <2026-02-10 Tue>', 'Should increment scheduled date exactly once');
}

module.exports = {
  name: 'smart-date-multiline',
  run: () => {
    testSmartDateDedupesPlanningLine();
    testRescheduleDedupesPlanningLine();
  }
};
