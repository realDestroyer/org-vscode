const assert = require('assert');
const path = require('path');

const outDir = path.join(__dirname, '..', '..', 'out');
const {
  isCheckboxLine,
  parseCheckboxLine,
  findCheckboxKeyword,
  buildCheckboxLine,
  rotateCheckboxKeyword
} = require(path.join(outDir, 'checkboxKeywords.js'));
const { createWorkflowRegistry } = require(path.join(outDir, 'workflowStates.js'));

const registry = createWorkflowRegistry(undefined);

function testDetectsCheckboxLines() {
  assert.strictEqual(isCheckboxLine('  - [ ] plain checkbox'), true);
  assert.strictEqual(isCheckboxLine('  - [X] done checkbox'), true);
  assert.strictEqual(isCheckboxLine('  1. [-] ordered partial'), true);
  assert.strictEqual(isCheckboxLine('  * TODO a heading'), false);
  assert.strictEqual(isCheckboxLine('  - a plain bullet'), false);
}

function testParsesKeywordOnCheckbox() {
  const parsed = parseCheckboxLine('    - [ ] TODO Write the spec', registry);
  assert.ok(parsed, 'expected checkbox to parse');
  assert.strictEqual(parsed.indent, '    ');
  assert.strictEqual(parsed.bullet, '-');
  assert.strictEqual(parsed.state, ' ');
  assert.strictEqual(parsed.keyword, 'TODO');
  assert.strictEqual(parsed.text, 'Write the spec');
}

function testParsesCheckboxWithoutKeyword() {
  const parsed = parseCheckboxLine('  - [ ] Just text', registry);
  assert.strictEqual(parsed.keyword, null);
  assert.strictEqual(parsed.text, 'Just text');
  assert.strictEqual(findCheckboxKeyword('  - [ ] Just text', registry), null);
}

function testDoesNotTreatSimilarWordAsKeyword() {
  const parsed = parseCheckboxLine('  - [ ] TODOS are not keywords', registry);
  assert.strictEqual(parsed.keyword, null, 'TODOS must not match the TODO keyword');
}

function testRoundTripBuild() {
  const line = '  - [X] DONE Ship it';
  const parsed = parseCheckboxLine(line, registry);
  assert.strictEqual(buildCheckboxLine(parsed), line);
}

function testRotateAddsFirstKeyword() {
  const result = rotateCheckboxKeyword('  - [ ] Write the spec', 'right', registry);
  assert.strictEqual(result.keyword, 'TODO');
  assert.strictEqual(result.text, '  - [ ] TODO Write the spec');
  assert.strictEqual(result.changed, true);
}

function testRotatePreservesBulletAndMarker() {
  const result = rotateCheckboxKeyword('    - [ ] TODO Write the spec', 'right', registry);
  assert.strictEqual(result.keyword, 'IN_PROGRESS');
  assert.strictEqual(result.text, '    - [ ] IN_PROGRESS Write the spec');
  assert.ok(!/^\s*\*/.test(result.text), 'must never convert a checkbox into a heading');
}

function testRotateIntoDoneChecksTheBox() {
  const result = rotateCheckboxKeyword('  - [ ] CONTINUED Ship it', 'right', registry);
  assert.strictEqual(result.keyword, 'DONE');
  assert.strictEqual(result.text, '  - [X] DONE Ship it');
}

function testAbandoningACompletedBoxUnchecksIt() {
  const result = rotateCheckboxKeyword('  - [X] DONE Ship it', 'right', registry);
  assert.strictEqual(result.keyword, 'ABANDONED');
  assert.strictEqual(result.text, '  - [ ] ABANDONED Ship it');
}

function testRotateOutOfDoneUnchecksTheBox() {
  const result = rotateCheckboxKeyword('  - [X] DONE Ship it', 'left', registry);
  assert.strictEqual(result.keyword, 'CONTINUED');
  assert.strictEqual(result.text, '  - [ ] CONTINUED Ship it');
}

function testRotateWrapsThroughNoKeyword() {
  // Last keyword -> no keyword, so a keyword can always be removed again.
  const result = rotateCheckboxKeyword('  - [ ] ABANDONED Drop it', 'right', registry);
  assert.strictEqual(result.keyword, null);
  assert.strictEqual(result.text, '  - [ ] Drop it');
}

function testRotateLeftFromNoKeywordPicksLast() {
  // ABANDONED is done-like but does not stamp CLOSED, so the box stays unchecked.
  const result = rotateCheckboxKeyword('  - [ ] Drop it', 'left', registry);
  assert.strictEqual(result.keyword, 'ABANDONED');
  assert.strictEqual(result.text, '  - [ ] ABANDONED Drop it');
}

function testRotateIgnoresNonCheckboxLines() {
  assert.strictEqual(rotateCheckboxKeyword('* TODO A heading', 'right', registry), null);
}

function testCustomWorkflowKeywordsAreSupported() {
  const customRegistry = createWorkflowRegistry([
    { keyword: 'NEXT' },
    { keyword: 'EXAMPLE_STATE' },
    { keyword: 'DONE', isDoneLike: true, stampsClosed: true }
  ]);

  const result = rotateCheckboxKeyword('  - [ ] NEXT Do the thing', 'right', customRegistry);
  assert.strictEqual(result.keyword, 'EXAMPLE_STATE');
  assert.strictEqual(result.text, '  - [ ] EXAMPLE_STATE Do the thing');
}

function testKeywordOnlyCheckboxHasNoTrailingSpace() {
  const result = rotateCheckboxKeyword('  - [ ] ', 'right', registry);
  assert.strictEqual(result.text, '  - [ ] TODO');
}

module.exports = {
  name: 'unit/checkbox-keywords',
  run() {
    testDetectsCheckboxLines();
    testParsesKeywordOnCheckbox();
    testParsesCheckboxWithoutKeyword();
    testDoesNotTreatSimilarWordAsKeyword();
    testRoundTripBuild();
    testRotateAddsFirstKeyword();
    testRotatePreservesBulletAndMarker();
    testRotateIntoDoneChecksTheBox();
    testAbandoningACompletedBoxUnchecksIt();
    testRotateOutOfDoneUnchecksTheBox();
    testRotateWrapsThroughNoKeyword();
    testRotateLeftFromNoKeywordPicksLast();
    testRotateIgnoresNonCheckboxLines();
    testCustomWorkflowKeywordsAreSupported();
    testKeywordOnlyCheckboxHasNoTrailingSpace();
  }
};
