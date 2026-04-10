const assert = require('assert');
const {
  parseClockLine,
  closeClockLine,
  formatDuration,
  computeClockTableRows
} = require('../../out/clockUtils');

function testParseAndCloseClockLine() {
  const parsed = parseClockLine('  CLOCK: [2026-04-09 Thu 09:00]');
  assert.ok(parsed, 'Expected CLOCK line to parse');
  assert.strictEqual(parsed.indent, '  ');
  assert.strictEqual(parsed.start, '2026-04-09 Thu 09:00');
  assert.strictEqual(parsed.end, null);

  const closed = closeClockLine('  CLOCK: [2026-04-09 Thu 09:00]', '2026-04-09 Thu 10:15');
  assert.strictEqual(closed.changed, true);
  assert.strictEqual(closed.line, '  CLOCK: [2026-04-09 Thu 09:00]--[2026-04-09 Thu 10:15]');
}

function testComputeClockTableRows() {
  const lines = [
    '* TODO Parent A',
    '  :LOGBOOK:',
    '  CLOCK: [2026-04-09 Thu 09:00]--[2026-04-09 Thu 10:30]',
    '  CLOCK: [2026-04-09 Thu 11:00]--[2026-04-09 Thu 11:45]',
    '  :END:',
    '* TODO Parent B',
    '  :LOGBOOK:',
    '  CLOCK: [2026-04-09 Thu 13:00]--[2026-04-09 Thu 14:00]',
    '  :END:'
  ];

  const accepted = ['YYYY-MM-DD ddd HH:mm'];
  const summary = computeClockTableRows(lines, accepted);
  assert.strictEqual(summary.totalMinutes, 195, 'Total minutes should include all closed CLOCK ranges');
  assert.strictEqual(summary.rows.length, 2, 'Should produce one row per heading with clock time');
  assert.strictEqual(summary.rows[0].heading, 'TODO Parent A');
  assert.strictEqual(summary.rows[0].minutes, 135);
  assert.strictEqual(summary.rows[1].heading, 'TODO Parent B');
  assert.strictEqual(summary.rows[1].minutes, 60);

  assert.strictEqual(formatDuration(195), '03:15');
}

module.exports = {
  name: 'unit/clock-utils',
  run() {
    testParseAndCloseClockLine();
    testComputeClockTableRows();
  }
};
