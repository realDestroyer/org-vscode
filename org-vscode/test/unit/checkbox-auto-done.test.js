const assert = require('assert');
const path = require('path');

const { computeHeadingTransitions } = require(path.join(__dirname, '..', '..', 'out', 'checkboxAutoDoneTransitions.js'));

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
    testTransitionsMarkDoneAndRevertToInProgress();
    testDoesNotAutoDoneWhenChildSubtaskIncomplete();
    testAutoDoneAfterChildSubtasksComplete();
  }
};
