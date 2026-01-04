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

module.exports = {
  name: 'unit/checkbox-auto-done',
  run: () => {
    testTransitionsMarkDoneAndRevertToInProgress();
  }
};
