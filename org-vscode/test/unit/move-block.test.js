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

module.exports = {
  name: 'unit/move-block',
  run: () => {
    testMoveDownMovesWholeSubtreeFromInsideDrawer();
    testMoveUpMovesWholeSubtreeFromInsideBody();
  }
};
