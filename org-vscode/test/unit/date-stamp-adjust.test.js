const assert = require('assert');
const path = require('path');

const { getAcceptedDateFormats } = require(path.join(__dirname, '..', '..', 'out', 'orgTagUtils.js'));
const {
  chooseTimestamp,
  computeDateStampReplacements,
  findTimestampCandidates
} = require(path.join(__dirname, '..', '..', 'out', 'dateStampAdjust.js'));

const dateFormat = 'YYYY-MM-DD';
const accepted = getAcceptedDateFormats(dateFormat);

function getLine(lines) {
  return lineNumber => lines[lineNumber] || '';
}

module.exports = {
  name: 'unit/date-stamp-adjust',
  run() {
    const line = '* Journal entry <2026-09-07 Mon> and follow-up [2026-09-08 Tue]';
    const candidates = findTimestampCandidates(line);
    assert.strictEqual(candidates.length, 2, 'Both active and inactive timestamps should be found');

    const first = chooseTimestamp(line, candidates[0].start + 3);
    assert.deepStrictEqual(first, candidates[0], 'Cursor inside a timestamp should select that timestamp');

    const nearest = chooseTimestamp(line, 0);
    assert.deepStrictEqual(nearest, candidates[0], 'Text before timestamps should select the nearest timestamp');

    const lines = [
      '* Journal entry <2026-09-07 Mon>',
      '  SCHEDULED: <2026-09-08 Tue>  DEADLINE: <2026-09-10 Thu>',
      'Plain note [2026-09-09 Wed 10:00]'
    ];
    const cursorPositions = new Map([
      [0, 2],
      [1, 18],
      [2, 0]
    ]);
    const result = computeDateStampReplacements(
      getLine(lines),
      new Set([0, 1, 2]),
      cursorPositions,
      true,
      dateFormat,
      accepted
    );

    assert.strictEqual(result.warnedParse, false);
    assert.strictEqual(result.replacements.size, 3, 'Each selected line should update one timestamp');
    assert.strictEqual(result.replacements.get(0), '* Journal entry <2026-09-08 Tue>');
    assert.strictEqual(result.replacements.get(1), '  SCHEDULED: <2026-09-09 Wed>  DEADLINE: <2026-09-10 Thu>', 'Cursor should choose SCHEDULED');
    assert.strictEqual(result.replacements.get(2), 'Plain note [2026-09-10 Thu 10:00]', 'Inactive timestamps should retain their time');

    const headingOnly = computeDateStampReplacements(
      getLine(['* TODO Task one', '  SCHEDULED: <2026-02-09 Mon>']),
      new Set([0]),
      new Map([[0, 4]]),
      true,
      dateFormat,
      accepted
    );
    assert.strictEqual(headingOnly.replacements.get(1), '  SCHEDULED: <2026-02-10 Tue>', 'A heading should fall back to its immediate planning line');

    const backward = computeDateStampReplacements(
      getLine(['* TODO Write journal <2026-01-01 Thu>']),
      new Set([0]),
      new Map([[0, 30]]),
      false,
      dateFormat,
      accepted
    );
    assert.strictEqual(backward.replacements.get(0), '* TODO Write journal <2025-12-31 Wed>');
  }
};
