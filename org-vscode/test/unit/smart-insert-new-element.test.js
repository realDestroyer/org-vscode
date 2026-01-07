const assert = require('assert');
const path = require('path');

const {
  computeSmartInsertNewElement
} = require(path.join(__dirname, '..', '..', 'out', 'smartInsertNewElement.js'));

function testHeadingInsertsAfterSubtree() {
  const lines = [
    '* Parent',
    'Some body',
    '** Child',
    'More',
    '* Next'
  ];

  const plan = computeSmartInsertNewElement(lines, 0);
  assert.deepStrictEqual(
    plan,
    {
      insertBeforeLineIndex: 4,
      newLineText: '* ',
      cursorColumn: 2
    }
  );
}

function testListItemInsertsSiblingAfterSubtree() {
  const lines = [
    '* H',
    '  - one',
    '    - child',
    '  - two',
    '* H2'
  ];

  const plan = computeSmartInsertNewElement(lines, 1);
  assert.strictEqual(plan.insertBeforeLineIndex, 3);
  assert.strictEqual(plan.newLineText, '  - ');
}

function testCheckboxListItemInsertsUnchecked() {
  const lines = [
    '- [X] done item',
    '- [ ] open item'
  ];

  const plan = computeSmartInsertNewElement(lines, 0);
  assert.strictEqual(plan.insertBeforeLineIndex, 1);
  assert.strictEqual(plan.newLineText, '- [ ] ');
}

function testOrderedListIncrements() {
  const lines = [
    '1. first',
    '2. second'
  ];

  const plan = computeSmartInsertNewElement(lines, 0);
  assert.strictEqual(plan.insertBeforeLineIndex, 1);
  assert.strictEqual(plan.newLineText, '2. ');
}

function testTableRowInsertsEmptyRow() {
  const lines = [
    '| A | B |',
    '| 1 | 2 |'
  ];

  const plan = computeSmartInsertNewElement(lines, 0);
  assert.strictEqual(plan.insertBeforeLineIndex, 1);
  assert.strictEqual(plan.newLineText, '|   |   |');
}

module.exports = {
  name: 'unit/smart-insert-new-element',
  run: () => {
    testHeadingInsertsAfterSubtree();
    testListItemInsertsSiblingAfterSubtree();
    testCheckboxListItemInsertsUnchecked();
    testOrderedListIncrements();
    testTableRowInsertsEmptyRow();
  }
};
