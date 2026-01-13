const assert = require('assert');
const path = require('path');

const {
  getDefaultWorkflowStates,
  validateAndNormalizeWorkflowStates,
  buildTaskPrefixRegex,
  buildTaskHeadingRegex,
  createWorkflowRegistry
} = require(path.join(__dirname, '..', '..', 'out', 'workflowStates.js'));

function testDefaultsAreStable() {
  const defaults = getDefaultWorkflowStates();
  assert.ok(Array.isArray(defaults));
  assert.strictEqual(defaults.length, 5);
  assert.deepStrictEqual(
    defaults.map(s => s.keyword),
    ['TODO', 'IN_PROGRESS', 'CONTINUED', 'DONE', 'ABANDONED']
  );
}

function testValidationFallsBackOnInvalid() {
  const result = validateAndNormalizeWorkflowStates({ not: 'an array' });
  assert.strictEqual(result.ok, false);
  assert.ok(Array.isArray(result.value));
  assert.ok(result.errors.length > 0);
}

function testNormalizationUppercasesAndDedupes() {
  const result = validateAndNormalizeWorkflowStates([
    { keyword: 'todo', marker: '⊙' },
    { keyword: 'TODO', marker: '⊙' },
    { keyword: 'in_progress', marker: '⊘', agendaVisibility: 'show' }
  ]);

  assert.strictEqual(result.ok, false, 'Duplicate keywords should be rejected');
  assert.deepStrictEqual(
    result.value.map(s => s.keyword),
    ['TODO', 'IN_PROGRESS', 'CONTINUED', 'DONE', 'ABANDONED']
  );
}

function testRegexEscapesMarkers() {
  const custom = [
    { keyword: 'TODO', marker: '+' },
    { keyword: 'DONE', marker: '(' }
  ];

  const registry = createWorkflowRegistry(custom);
  const re = registry.buildTaskHeadingRegex({ allowAsterisks: false });

  assert.ok(re.test('+ TODO hello'));
  assert.ok(re.test('( DONE hello'));
  assert.ok(re.test('* TODO hello') === false, 'Asterisk headings should be disallowed in this regex');

  const re2 = buildTaskHeadingRegex(registry.states, { allowAsterisks: true });
  assert.ok(re2.test('+ TODO hello'));
  assert.ok(re2.test('* DONE hello'));
}

function testTaskPrefixRegexMatchesBothStyles() {
  const defaults = getDefaultWorkflowStates();
  const re = buildTaskPrefixRegex(defaults);
  assert.ok(re.test('* TODO Task'));
  assert.ok(re.test('  * IN_PROGRESS Task'));
  assert.ok(re.test('⊙ TODO Task'));
  assert.ok(re.test('    ⊖ DONE Task'));
  assert.ok(!re.test('Not a task line'));
}

function testPredicatesUseConfig() {
  const custom = [
    { keyword: 'NEXT', isDoneLike: false },
    { keyword: 'WON', isDoneLike: true, stampsClosed: true }
  ];

  const registry = createWorkflowRegistry(custom);
  assert.deepStrictEqual(registry.getCycleKeywords(), ['NEXT', 'WON']);
  assert.ok(registry.isKnownState('next'));
  assert.ok(!registry.isDoneLike('NEXT'));
  assert.ok(registry.isDoneLike('WON'));
  assert.ok(registry.stampsClosed('WON'));
}

module.exports = {
  name: 'unit/workflow-states',
  run: () => {
    testDefaultsAreStable();
    testValidationFallsBackOnInvalid();
    testNormalizationUppercasesAndDedupes();
    testRegexEscapesMarkers();
    testTaskPrefixRegexMatchesBothStyles();
    testPredicatesUseConfig();
  }
};
