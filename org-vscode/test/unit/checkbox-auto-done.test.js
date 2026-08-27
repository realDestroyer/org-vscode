const assert = require('assert');
const path = require('path');

const {
  computeHeadingTransitions,
  contentChangesTouchCheckbox
} = require(path.join(__dirname, '..', '..', 'out', 'checkboxAutoDoneTransitions.js'));

function fakeDocument(lines) {
  return {
    lineCount: lines.length,
    lineAt(lineNumber) {
      return { text: lines[lineNumber] };
    }
  };
}

function changeAt(line, text) {
  return {
    text,
    range: { start: { line }, end: { line } }
  };
}

function testOnlyCheckboxChangesScheduleReconciliation() {
  assert.strictEqual(
    contentChangesTouchCheckbox(
      fakeDocument(['* DONE - Parent task']),
      [changeAt(0, '* DONE - Parent task')]
    ),
    false,
    'heading text containing a hyphen must not schedule checkbox reconciliation'
  );

  assert.strictEqual(
    contentChangesTouchCheckbox(
      fakeDocument(['  CLOSED: [2026-08-26 Wed 10:00]']),
      [changeAt(0, '\n  CLOSED: [2026-08-26 Wed 10:00]')]
    ),
    false,
    'a CLOSED timestamp must not schedule checkbox reconciliation'
  );

  assert.strictEqual(
    contentChangesTouchCheckbox(
      fakeDocument(['  - [X] Completed item']),
      [changeAt(0, 'X')]
    ),
    true,
    'editing a checkbox marker in place must schedule reconciliation'
  );

  assert.strictEqual(
    contentChangesTouchCheckbox(
      fakeDocument(['  - [ ] New item']),
      [changeAt(0, '  - [ ] New item')]
    ),
    true,
    'inserting a checkbox line must schedule reconciliation'
  );
}

function testTransitionsMarkDoneAndRevertToInProgress() {
  const lines = [
    '* IN_PROGRESS Task A',
    '  - [X] one',
    '  - [X] two',
    '',
    '* DONE Task B',
    '  - [X] one',
    '  - [ ] two',
    '',
    '* ABANDONED Task C',
    '  - [ ] one',
    '  - [X] two',
  ];

  const { toMarkDone, toMarkInProgress } = computeHeadingTransitions(lines);

  assert.deepStrictEqual(toMarkDone, [0], 'Expected Task A to be marked DONE');
  assert.deepStrictEqual(toMarkInProgress, [4], 'Expected Task B to revert to IN_PROGRESS');
}

function testDoesNotAutoDoneWhenChildSubtaskIncomplete() {
  const lines = [
    '* IN_PROGRESS Parent',
    '  - [X] one',
    '  - [X] two',
    '  ** TODO Child still todo',
  ];

  const { toMarkDone } = computeHeadingTransitions(lines);

  assert.deepStrictEqual(toMarkDone, [], 'Expected Parent to NOT be marked DONE while a child task is still TODO');
}

function testAutoDoneAfterChildSubtasksComplete() {
  const lines = [
    '* IN_PROGRESS Parent',
    '  - [X] checklist item',
    '  ** DONE Completed child task'
  ];

  const { toMarkDone } = computeHeadingTransitions(lines);

  assert.deepStrictEqual(toMarkDone, [0], 'Expected Parent to be marked DONE after its checkbox and child task complete');
}

module.exports = {
  name: 'unit/checkbox-auto-done',
  run: () => {
    testOnlyCheckboxChangesScheduleReconciliation();
    testTransitionsMarkDoneAndRevertToInProgress();
    testDoesNotAutoDoneWhenChildSubtaskIncomplete();
    testAutoDoneAfterChildSubtasksComplete();
  }
};
