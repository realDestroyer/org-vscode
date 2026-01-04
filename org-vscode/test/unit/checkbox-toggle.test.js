const assert = require('assert');
const path = require('path');

const { computeCheckboxToggleEdits } = require(path.join(__dirname, '..', '..', 'out', 'checkboxToggle.js'));

function applyEdits(lines, edits) {
  const out = lines.slice();
  for (const e of edits) {
    out[e.lineIndex] = e.newText;
  }
  return out;
}

function testToggleLeafUpdatesAncestors() {
  const lines = [
    '* H',
    '  - [-] Parent',
    '    - [ ] c1',
    '    - [ ] c2',
  ];

  const edits = computeCheckboxToggleEdits(lines, 2);
  const updated = applyEdits(lines, edits);

  assert.strictEqual(updated[2], '    - [X] c1');
  // Parent should become partial because one child checked.
  assert.strictEqual(updated[1], '  - [-] Parent');
}

function testToggleParentTogglesDescendants() {
  const lines = [
    '* H',
    '  - [-] Parent',
    '    - [X] c1',
    '    - [ ] c2',
    '  - [ ] Sibling'
  ];

  const edits = computeCheckboxToggleEdits(lines, 1);
  const updated = applyEdits(lines, edits);

  assert.strictEqual(updated[1], '  - [X] Parent');
  assert.strictEqual(updated[2], '    - [X] c1');
  assert.strictEqual(updated[3], '    - [X] c2');
  assert.strictEqual(updated[4], '  - [ ] Sibling');
}

module.exports = {
  name: 'unit/checkbox-toggle',
  run: () => {
    testToggleLeafUpdatesAncestors();
    testToggleParentTogglesDescendants();
  }
};
