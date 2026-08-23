const assert = require('assert');
const path = require('path');

const outDir = path.join(__dirname, '..', '..', 'out');
const {
  isBuiltinStateKeyword,
  sanitizeKeywordForScope,
  getScopesForKeyword,
  buildCustomStateColorEntries
} = require(path.join(outDir, 'workflowStateScopes.js'));

function testIdentifiesBuiltins() {
  assert.strictEqual(isBuiltinStateKeyword('TODO'), true);
  assert.strictEqual(isBuiltinStateKeyword('in_progress'), true);
  assert.strictEqual(isBuiltinStateKeyword('ABANDONED'), true);
  assert.strictEqual(isBuiltinStateKeyword('EXAMPLE_STATE'), false);
  assert.strictEqual(isBuiltinStateKeyword(''), false);
}

function testSanitizesKeywords() {
  assert.strictEqual(sanitizeKeywordForScope('EXAMPLE_STATE'), 'example_state');
  assert.strictEqual(sanitizeKeywordForScope('Waiting-On'), 'waiting_on');
  assert.strictEqual(sanitizeKeywordForScope('  NEXT  '), 'next');
  assert.strictEqual(sanitizeKeywordForScope('!!!'), '');
}

function testBuiltinScopesAreStable() {
  const todo = getScopesForKeyword('TODO');
  assert.strictEqual(todo.isBuiltin, true);
  assert.strictEqual(todo.scopes.keyword, 'keyword.control.todo.vso');
  assert.strictEqual(todo.scopes.symbol, 'constant.character.todo.vso');
  assert.strictEqual(todo.scopes.taskText, 'string.task.todo.vso');
}

function testCustomScopesAreGenerated() {
  const custom = getScopesForKeyword('EXAMPLE_STATE');
  assert.strictEqual(custom.isBuiltin, false);
  assert.strictEqual(custom.keyword, 'EXAMPLE_STATE');
  assert.strictEqual(custom.scopes.symbol, 'constant.character.custom.example_state.vso');
  assert.strictEqual(custom.scopes.keyword, 'keyword.control.custom.example_state.vso');
  assert.strictEqual(custom.scopes.taskText, 'string.task.custom.example_state.vso');
}

function testUnusableKeywordReturnsNull() {
  assert.strictEqual(getScopesForKeyword('!!!'), null);
  assert.strictEqual(getScopesForKeyword(''), null);
}

function testBuildsEntriesOnlyForCustomStates() {
  const { colors, groups } = buildCustomStateColorEntries([
    { keyword: 'TODO' },
    { keyword: 'DONE' },
    { keyword: 'EXAMPLE_STATE' }
  ]);

  assert.ok(colors['EXAMPLE_STATE Keyword'], 'custom keyword row should exist');
  assert.ok(colors['EXAMPLE_STATE Symbol'], 'custom symbol row should exist');
  assert.ok(colors['EXAMPLE_STATE Task Text'], 'custom task text row should exist');
  assert.strictEqual(colors['TODO Keyword'], undefined, 'built-ins already have static rows');

  assert.deepStrictEqual(groups['EXAMPLE_STATE Tasks (custom)'], [
    'EXAMPLE_STATE Symbol',
    'EXAMPLE_STATE Keyword',
    'EXAMPLE_STATE Task Text'
  ]);

  assert.strictEqual(
    colors['EXAMPLE_STATE Keyword'].scope,
    'keyword.control.custom.example_state.vso'
  );
  assert.ok(/^#[0-9A-Fa-f]{6}$/.test(colors['EXAMPLE_STATE Keyword'].foreground));
}

function testDeduplicatesAndSkipsInvalid() {
  const { colors } = buildCustomStateColorEntries([
    { keyword: 'NEXT' },
    { keyword: 'next' },
    { keyword: '' },
    null
  ]);

  const keys = Object.keys(colors).filter((k) => k.startsWith('NEXT '));
  assert.strictEqual(keys.length, 3, 'duplicate keywords should only produce one set of rows');
}

function testDefaultColorsAreDeterministic() {
  const first = buildCustomStateColorEntries([{ keyword: 'EXAMPLE_STATE' }]);
  const second = buildCustomStateColorEntries([{ keyword: 'EXAMPLE_STATE' }]);
  assert.strictEqual(
    first.colors['EXAMPLE_STATE Keyword'].foreground,
    second.colors['EXAMPLE_STATE Keyword'].foreground
  );
}

function testHandlesNonArrayInput() {
  const { colors, groups } = buildCustomStateColorEntries(undefined);
  assert.deepStrictEqual(colors, {});
  assert.deepStrictEqual(groups, {});
}

module.exports = {
  name: 'unit/workflow-state-scopes',
  run() {
    testIdentifiesBuiltins();
    testSanitizesKeywords();
    testBuiltinScopesAreStable();
    testCustomScopesAreGenerated();
    testUnusableKeywordReturnsNull();
    testBuildsEntriesOnlyForCustomStates();
    testDeduplicatesAndSkipsInvalid();
    testDefaultColorsAreDeterministic();
    testHandlesNonArrayInput();
  }
};
