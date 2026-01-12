const assert = require('assert');
const path = require('path');

const {
  findNearestHeadingLine,
  setPropertyInLines,
  deletePropertyInLines,
  getPropertyFromLines,
  getPropertyFromLinesWithInheritance,
  ensureIdInLines
} = require(path.join(__dirname, '..', '..', 'out', 'orgProperties.js'));

function testInsertsNewDrawerUnderHeading() {
  const lines = [
    '* TODO Heading',
    'Some body text'
  ];

  const heading = findNearestHeadingLine(lines, 0);
  assert.strictEqual(heading, 0);

  const res = setPropertyInLines(lines, heading, 'CUSTOM_ID', 'abc');
  assert.strictEqual(res.changed, true);

  assert.deepStrictEqual(res.lines, [
    '* TODO Heading',
    '  :PROPERTIES:',
    '  :CUSTOM_ID: abc',
    '  :END:',
    'Some body text'
  ]);
}

function testInsertsDrawerAfterPlanningLines() {
  const lines = [
    '* TODO Heading',
    '  SCHEDULED: [2026-01-01 Thu]',
    'Body'
  ];

  const heading = findNearestHeadingLine(lines, 2);
  assert.strictEqual(heading, 0);

  const res = setPropertyInLines(lines, heading, 'CATEGORY', 'Work');
  assert.strictEqual(res.changed, true);

  assert.deepStrictEqual(res.lines, [
    '* TODO Heading',
    '  SCHEDULED: [2026-01-01 Thu]',
    '  :PROPERTIES:',
    '  :CATEGORY: Work',
    '  :END:',
    'Body'
  ]);
}

function testUpdatesExistingPropertyValue() {
  const lines = [
    '* Heading',
    '  :PROPERTIES:',
    '  :CUSTOM_ID: old',
    '  :END:',
    'Text'
  ];

  const res = setPropertyInLines(lines, 0, 'custom_id', 'new');
  assert.strictEqual(res.changed, true);
  assert.strictEqual(res.lines[2], '  :CUSTOM_ID: new');
}

function testAddsPropertyIntoExistingDrawer() {
  const lines = [
    '* Heading',
    '  :PROPERTIES:',
    '  :CUSTOM_ID: abc',
    '  :END:',
    'Text'
  ];

  const res = setPropertyInLines(lines, 0, 'CATEGORY', 'Work');
  assert.strictEqual(res.changed, true);

  assert.deepStrictEqual(res.lines, [
    '* Heading',
    '  :PROPERTIES:',
    '  :CUSTOM_ID: abc',
    '  :CATEGORY: Work',
    '  :END:',
    'Text'
  ]);
}

function testDeletesPropertyKeepsDrawerIfOthersRemain() {
  const lines = [
    '* Heading',
    '  :PROPERTIES:',
    '  :CUSTOM_ID: abc',
    '  :CATEGORY: Work',
    '  :END:',
    'Text'
  ];

  const res = deletePropertyInLines(lines, 0, 'CUSTOM_ID');
  assert.strictEqual(res.changed, true);
  assert.strictEqual(res.removedDrawer, false);

  assert.deepStrictEqual(res.lines, [
    '* Heading',
    '  :PROPERTIES:',
    '  :CATEGORY: Work',
    '  :END:',
    'Text'
  ]);
}

function testDeletesDrawerIfBecomesEmpty() {
  const lines = [
    '* Heading',
    '  :PROPERTIES:',
    '  :CUSTOM_ID: abc',
    '  :END:',
    'Text'
  ];

  const res = deletePropertyInLines(lines, 0, 'CUSTOM_ID');
  assert.strictEqual(res.changed, true);
  assert.strictEqual(res.removedDrawer, true);

  assert.deepStrictEqual(res.lines, [
    '* Heading',
    'Text'
  ]);
}

function testGetsPropertyValue() {
  const lines = [
    '* Heading',
    '  :PROPERTIES:',
    '  :CATEGORY: Work',
    '  :END:'
  ];

  const v = getPropertyFromLines(lines, 0, 'category');
  assert.strictEqual(v, 'Work');
}

function testInheritsFromParentDrawer() {
  const lines = [
    '* Parent',
    '  :PROPERTIES:',
    '  :CATEGORY: Work',
    '  :END:',
    '** Child'
  ];

  const v = getPropertyFromLinesWithInheritance(lines, 4, 'CATEGORY');
  assert.strictEqual(v, 'Work');
}

function testChildOverridesParent() {
  const lines = [
    '* Parent',
    '  :PROPERTIES:',
    '  :CATEGORY: Work',
    '  :END:',
    '** Child',
    '   :PROPERTIES:',
    '   :CATEGORY: Personal',
    '   :END:'
  ];

  const v = getPropertyFromLinesWithInheritance(lines, 4, 'CATEGORY');
  assert.strictEqual(v, 'Personal');
}

function testInheritsFromFilePropertyWhenNoLocalOrParent() {
  const lines = [
    '#+PROPERTY: CATEGORY Home',
    '* Parent',
    '** Child'
  ];

  const v = getPropertyFromLinesWithInheritance(lines, 2, 'CATEGORY');
  assert.strictEqual(v, 'Home');
}

function testParentOverridesFileProperty() {
  const lines = [
    '#+PROPERTY: CATEGORY Home',
    '* Parent',
    '  :PROPERTIES:',
    '  :CATEGORY: Work',
    '  :END:',
    '** Child'
  ];

  const v = getPropertyFromLinesWithInheritance(lines, 5, 'CATEGORY');
  assert.strictEqual(v, 'Work');
}

function testEnsureIdCreatesIfMissing() {
  const lines = [
    '* Heading'
  ];

  const ensured = ensureIdInLines(lines, 0, () => 'abc-123');
  assert.strictEqual(ensured.changed, true);
  assert.strictEqual(ensured.id, 'abc-123');

  // Should now have a property drawer with :ID:
  assert.ok(ensured.lines.some((l) => l.includes(':ID: abc-123')));
}

function testEnsureIdDoesNotOverwriteExisting() {
  const lines = [
    '* Heading',
    '  :PROPERTIES:',
    '  :ID: keep-me',
    '  :END:'
  ];

  const ensured = ensureIdInLines(lines, 0, () => 'new-id');
  assert.strictEqual(ensured.changed, false);
  assert.strictEqual(ensured.id, 'keep-me');
}

module.exports = {
  name: 'unit/org-properties',
  run: () => {
    testInsertsNewDrawerUnderHeading();
    testInsertsDrawerAfterPlanningLines();
    testUpdatesExistingPropertyValue();
    testAddsPropertyIntoExistingDrawer();
    testDeletesPropertyKeepsDrawerIfOthersRemain();
    testDeletesDrawerIfBecomesEmpty();
    testGetsPropertyValue();
    testInheritsFromParentDrawer();
    testChildOverridesParent();
    testInheritsFromFilePropertyWhenNoLocalOrParent();
    testParentOverridesFileProperty();
    testEnsureIdCreatesIfMissing();
    testEnsureIdDoesNotOverwriteExisting();
  }
};
