const assert = require('assert');
const path = require('path');

const {
  computeMetaReturn,
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

function testCustomUnicodeMarkerInsertsAfterSubtree() {
  const plan = computeSmartInsertNewElement(['! Parent', '  ~ Child', '* Next'], 0, ['!', '~']);
  assert.strictEqual(plan.insertBeforeLineIndex, 2);
  assert.strictEqual(plan.newLineText, '! ');
}

function testMetaReturnInsertsBeforeHeadingAtItsPrefix() {
  const plan = computeMetaReturn(['* Current', 'body'], 0, 0);
  assert.deepStrictEqual(plan, {
    insertBeforeLineIndex: 0,
    newLineText: '* ',
    cursorColumn: 2
  });
}

function testMetaReturnSplitsHeadingAtCursor() {
  const plan = computeMetaReturn(['* First second'], 0, 7);
  assert.deepStrictEqual(plan, {
    insertBeforeLineIndex: 1,
    newLineText: '* second',
    replaceCurrentLineText: '* First',
    cursorColumn: 2
  });
}

function testMetaReturnDoesNotSkipListSubtree() {
  const plan = computeMetaReturn(['- first', '  - child', '- second'], 0, 7);
  assert.strictEqual(plan.insertBeforeLineIndex, 1);
  assert.strictEqual(plan.newLineText, '- ');
}

function testMetaReturnPreservesOrderedNumberWhenInsertingBefore() {
  const plan = computeMetaReturn(['8. current'], 0, 0);
  assert.strictEqual(plan.insertBeforeLineIndex, 0);
  assert.strictEqual(plan.newLineText, '8. ');
}

function testMetaReturnTurnsBodyLineIntoHeadingAtLineStart() {
  const plan = computeMetaReturn(['** Parent', 'ordinary text'], 1, 0);
  assert.deepStrictEqual(plan, {
    replaceCurrentLineText: '** ordinary text',
    cursorColumn: 3
  });
}

module.exports = {
  name: 'unit/smart-insert-new-element',
  run: () => {
    testHeadingInsertsAfterSubtree();
    testListItemInsertsSiblingAfterSubtree();
    testCheckboxListItemInsertsUnchecked();
    testOrderedListIncrements();
    testTableRowInsertsEmptyRow();
    testCustomUnicodeMarkerInsertsAfterSubtree();
    testMetaReturnInsertsBeforeHeadingAtItsPrefix();
    testMetaReturnSplitsHeadingAtCursor();
    testMetaReturnDoesNotSkipListSubtree();
    testMetaReturnPreservesOrderedNumberWhenInsertingBefore();
    testMetaReturnTurnsBodyLineIntoHeadingAtLineStart();
  }
};
