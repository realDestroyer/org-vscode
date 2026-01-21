const assert = require('assert');
const path = require('path');

const { findSrcBlockAtLine, applyResultsAfterEndSrc } = require(path.join(__dirname, '..', '..', 'out', 'srcBlockUtils.js'));

function testFindSrcBlockBasic() {
  const lines = [
    '#+BEGIN_SRC python',
    "print('hi')",
    '#+END_SRC'
  ];

  const block = findSrcBlockAtLine(lines, 1);
  assert.ok(block, 'Block should be found');
  assert.strictEqual(block.beginLine, 0);
  assert.strictEqual(block.endLine, 2);
  assert.strictEqual(block.language, 'python');
  assert.strictEqual(block.code, "print('hi')");
}

function testFindSrcBlockCaseAndWhitespace() {
  const lines = [
    '  #+begin_src   PowerShell   :results output',
    'Write-Output "Hello"',
    '  #+end_src'
  ];

  const block = findSrcBlockAtLine(lines, 2);
  assert.ok(block, 'Block should be found');
  assert.strictEqual(block.language, 'powershell');
  assert.strictEqual(block.code, 'Write-Output "Hello"');
}

function testFindSrcBlockOutsideReturnsNull() {
  const lines = [
    '#+BEGIN_SRC python',
    'print(1)',
    '#+END_SRC',
    '#+RESULTS:',
    ': 1'
  ];

  const block = findSrcBlockAtLine(lines, 4);
  assert.strictEqual(block, null, 'Cursor in results should not match src block in MVP');
}

function testApplyResultsInsert() {
  const lines = [
    '#+BEGIN_SRC python',
    'print("A")',
    '#+END_SRC',
    'After'
  ];

  const out = applyResultsAfterEndSrc(lines, 2, 'A');
  assert.deepStrictEqual(out.updatedLines.slice(0, 6), [
    '#+BEGIN_SRC python',
    'print("A")',
    '#+END_SRC',
    '#+RESULTS:',
    ': A',
    'After'
  ]);
}

function testApplyResultsReplaceExisting() {
  const lines = [
    '#+BEGIN_SRC python',
    'print("B")',
    '#+END_SRC',
    '#+RESULTS:',
    ': old',
    'After'
  ];

  const out = applyResultsAfterEndSrc(lines, 2, 'B');
  assert.deepStrictEqual(out.updatedLines.slice(0, 6), [
    '#+BEGIN_SRC python',
    'print("B")',
    '#+END_SRC',
    '#+RESULTS:',
    ': B',
    'After'
  ]);
}

module.exports = {
  name: 'unit/src-block-utils',
  run: function () {
    testFindSrcBlockBasic();
    testFindSrcBlockCaseAndWhitespace();
    testFindSrcBlockOutsideReturnsNull();
    testApplyResultsInsert();
    testApplyResultsReplaceExisting();
  }
};
