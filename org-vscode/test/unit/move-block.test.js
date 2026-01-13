const assert = require('assert');
const path = require('path');

const { computeMoveBlockResult } = require(path.join(__dirname, '..', '..', 'out', 'moveBlockUtils.js'));

function testMoveDownMovesWholeSubtreeFromInsideDrawer() {
  const lines = [
    '* [2026-01-12 Mon] ------------------------------------------------',
    '  * TODO This is the first task [/]  :SDN:TRAINING:JUICY:',
    '    SCHEDULED: [2026-01-12]  DEADLINE: [2026-01-12]',
    '    :PROPERTIES:',
    '    :CATEGORY: EXAMPLE',
    '    :END:',
    '    - [ ] fart',
    '  ** TODO This is a subtask of the [/]',
    '    SCHEDULED: [2026-01-12]  DEADLINE: [2026-01-17]',
    '    - [ ] Checkbox 1',
    '  * TODO This is a second task :JUICY:',
    '    SCHEDULED: [2026-01-12]  DEADLINE: [2026-01-17]'
  ];

  // Cursor inside the property drawer of the first task.
  const cursorLine = 4;
  const result = computeMoveBlockResult(lines, cursorLine, 'down');
  assert.ok(result, 'Expected a move result');

  const updated = result.updatedLines;
  assert.strictEqual(updated[0], lines[0]);
  assert.strictEqual(updated[1], lines[10]);
  assert.strictEqual(updated[2], lines[11]);

  // First task should now appear after the second task, including its child subtree.
  assert.strictEqual(updated[3], lines[1]);
  assert.strictEqual(updated[4], lines[2]);
  assert.strictEqual(updated[5], lines[3]);
  assert.strictEqual(updated[6], lines[4]);
  assert.strictEqual(updated[7], lines[5]);
  assert.strictEqual(updated[8], lines[6]);
  assert.strictEqual(updated[9], lines[7]);
  assert.strictEqual(updated[10], lines[8]);
  assert.strictEqual(updated[11], lines[9]);
}

function testMoveUpMovesWholeSubtreeFromInsideBody() {
  const lines = [
    '* [2026-01-12 Mon] ------------------------------------------------',
    '  * TODO A :JUICY:',
    '    SCHEDULED: [2026-01-12]  DEADLINE: [2026-01-17]',
    '  * TODO B :JUICY:',
    '    SCHEDULED: [2026-01-12]  DEADLINE: [2026-01-12]',
    '    :PROPERTIES:',
    '    :CATEGORY: EXAMPLE',
    '    :END:',
    '  ** TODO B child',
    '    - [ ] c1'
  ];

  // Cursor inside the body of B.
  const cursorLine = 6;
  const result = computeMoveBlockResult(lines, cursorLine, 'up');
  assert.ok(result, 'Expected a move result');

  const updated = result.updatedLines;
  assert.strictEqual(updated[0], lines[0]);

  // B (with child) should now be before A.
  assert.strictEqual(updated[1], lines[3]);
  assert.strictEqual(updated[2], lines[4]);
  assert.strictEqual(updated[3], lines[5]);
  assert.strictEqual(updated[4], lines[6]);
  assert.strictEqual(updated[5], lines[7]);
  assert.strictEqual(updated[6], lines[8]);
  assert.strictEqual(updated[7], lines[9]);
  assert.strictEqual(updated[8], lines[1]);
  assert.strictEqual(updated[9], lines[2]);
}

function testMoveUpDoesNotDropInterveningParentHeadingOrDrawer() {
  const lines = [
    '* [2026-01-05 Mon] ------------------------------------------------',
    '  * TODO Begin planning CWID (Connect with Industry Day) for LCSC',
    '  * DONE Check back with Ken Gonzales regarding PROFINET traffic on Soldermask-GSE network [0/0] :MOSCOW_MFG:SDN:',
    '    SCHEDULED: [2026-01-05]  DEADLINE: [2026-01-05]  CLOSED: [2026-01-11 Sun 18:11]',
    '  ** TODO Test calculation',
    '  * TODO Create new org-vscode features :ORG_VSCODE_FEATURES:',
    '    :PROPERTIES:',
    '    :ORG-VSCODE:',
    '    :END:',
    '  ** TODO Implement Clocking Work Time feature',
    '    - https://orgmode.org/manual/Clocking-Work-Time.html',
    '  ** DONE Implement Property Drawer feature',
    '    CLOSED: [2026-01-11 Sun 20:13]'
  ];

  // Cursor on the "Implement Clocking" heading line.
  const cursorLine = 9;
  const result = computeMoveBlockResult(lines, cursorLine, 'up');
  assert.ok(result, 'Expected a move result');

  const updated = result.updatedLines;
  assert.strictEqual(updated.length, lines.length, 'Move should not change total line count');

  // The parent heading + drawer must not be dropped.
  const parentIdx = updated.indexOf(lines[5]);
  assert.ok(parentIdx !== -1, 'Parent heading should remain after move');
  assert.strictEqual(updated[parentIdx + 1], lines[6]);
  assert.strictEqual(updated[parentIdx + 2], lines[7]);
  assert.strictEqual(updated[parentIdx + 3], lines[8]);
}

module.exports = {
  name: 'unit/move-block',
  run: () => {
    testMoveDownMovesWholeSubtreeFromInsideDrawer();
    testMoveUpMovesWholeSubtreeFromInsideBody();
    testMoveUpDoesNotDropInterveningParentHeadingOrDrawer();
  }
};
