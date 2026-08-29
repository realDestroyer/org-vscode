const assert = require('assert');
const path = require('path');

const {
  normalizePriorityValues,
  cyclePriorityOnHeadingLine
} = require(path.join(__dirname, '..', '..', 'out', 'priorityCycle.js'));

function cycle(text, direction = 'forward') {
  return cyclePriorityOnHeadingLine(text, {
    direction,
    priorityValues: ['A', 'B', 'C'],
    markers: ['⊙', '⊘'],
    keywords: ['TODO', 'IN_PROGRESS']
  });
}

function testForwardCyclePreservesHeading() {
  assert.strictEqual(cycle('* TODO Task :tag:').text, '* TODO [#A] Task :tag:');
  assert.strictEqual(cycle('* Project heading :tag:').text, '* [#A] Project heading :tag:');
  assert.strictEqual(cycle('* [#C] Project heading :tag:').text, '* Project heading :tag:');
  assert.strictEqual(cycle('* TODO [#A] Task :tag:').text, '* TODO [#B] Task :tag:');
  assert.strictEqual(cycle('* TODO [#C] Task :tag:').text, '* TODO Task :tag:');
  assert.strictEqual(
    cycle('  *** TODO [#B] Title SCHEDULED: <2026-08-28 Fri> :tag:').text,
    '  *** TODO [#C] Title SCHEDULED: <2026-08-28 Fri> :tag:'
  );
}

function testBackwardCycleAndUnicodeMarker() {
  assert.strictEqual(cycle('⊙ TODO Task', 'backward').text, '⊙ TODO [#C] Task');
  assert.strictEqual(cycle('⊙ TODO [#A] Task', 'backward').text, '⊙ TODO Task');
  assert.strictEqual(cycle('  ⊘ IN_PROGRESS [#C] Task', 'backward').text, '  ⊘ IN_PROGRESS [#B] Task');
}

function testOnlyActualHeadingsChange() {
  assert.deepStrictEqual(cycle('TODO Task'), { changed: false, text: 'TODO Task' });
  assert.deepStrictEqual(cycle('- TODO Task'), { changed: false, text: '- TODO Task' });
  assert.deepStrictEqual(cycle('x TODO [#A] Task'), { changed: false, text: 'x TODO [#A] Task' });
  assert.deepStrictEqual(
    cyclePriorityOnHeadingLine('- groceries', { markers: ['-'], keywords: ['TODO'] }),
    { changed: false, text: '- groceries' }
  );
}

function testPriorityValueNormalization() {
  assert.deepStrictEqual(normalizePriorityValues(['a', 'B', 'A', '12', '-', 3]), ['A', 'B']);
  assert.deepStrictEqual(normalizePriorityValues([]), ['A', 'B', 'C']);
  assert.deepStrictEqual(normalizePriorityValues('bad'), ['A', 'B', 'C']);
}

module.exports = {
  name: 'unit/priority-cycle',
  run: () => {
    testForwardCyclePreservesHeading();
    testBackwardCycleAndUnicodeMarker();
    testOnlyActualHeadingsChange();
    testPriorityValueNormalization();
  }
};