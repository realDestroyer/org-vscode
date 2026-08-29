const assert = require('assert');
const path = require('path');

const { alignOrgTableLines, classifyContext, commandForContext, renumberOrderedListLines } = require(
  path.join(__dirname, '..', '..', 'out', 'contextActionUtils.js')
);

module.exports = {
  name: 'unit/context-actions',
  run: () => {
    assert.strictEqual(classifyContext('- [ ] [[file:task.org][Task]]', 12), 'link');
    assert.strictEqual(classifyContext('- [ ] Task', 3), 'checkbox');
    assert.strictEqual(classifyContext('- [ ] Task', 5), 'checkbox');
    assert.strictEqual(classifyContext('- [ ] Task', 7), 'checkbox');
    assert.strictEqual(classifyContext('* TODO See [[id:abc][Target]]', 18), 'link');
    assert.strictEqual(classifyContext('SCHEDULED: <2026-08-29 Sat>', 16), 'timestamp');
    assert.strictEqual(classifyContext('SCHEDULED: <29-08-2026 Sat>', 16), 'timestamp');
    assert.strictEqual(classifyContext('<2026-08-29> body', 12), null);
    assert.strictEqual(classifyContext('| A | B |', 2), 'table');
    assert.strictEqual(classifyContext('  1. Item', 5), 'ordered-list');
    assert.strictEqual(classifyContext('** TODO Heading', 4), 'heading');
    assert.strictEqual(classifyContext('! CUSTOM Heading', 4, ['!']), 'heading');
    assert.strictEqual(classifyContext('plain body', 3), null);
    assert.strictEqual(commandForContext('checkbox'), 'extension.toggleCheckboxItem');
    assert.strictEqual(commandForContext('table'), null);
    assert.strictEqual(commandForContext('timestamp'), null);
    assert.deepStrictEqual(
      alignOrgTableLines(['| Name |Age|', '|--+--|', '| Ada|37 |']),
      ['| Name | Age |', '|------+-----|', '| Ada  | 37  |']
    );
    assert.deepStrictEqual(
      renumberOrderedListLines(['3. one', '8. two', '- stop'], 1),
      ['3. one', '4. two', '- stop']
    );
  }
};