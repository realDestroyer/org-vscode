const assert = require('assert');
const path = require('path');

const { buildHeadingCodeLensPlan, normalizeHeadingCodeLensActions } = require(
  path.join(__dirname, '..', '..', 'out', 'headingCodeLensUtils.js')
);

module.exports = {
  name: 'unit/heading-codelens',
  run: () => {
    assert.deepStrictEqual(normalizeHeadingCodeLensActions(['status', 'bogus', 'status', 'refile']), ['status', 'refile']);
    assert.deepStrictEqual(
      buildHeadingCodeLensPlan(['* TODO One', 'body', '  ! CUSTOM Two', '* <2026-08-29 Sat>', '! <29-08-2026 Sat>'], ['status', 'property'], ['!']),
      [
        { line: 0, action: 'status' },
        { line: 0, action: 'property' },
        { line: 2, action: 'status' },
        { line: 2, action: 'property' }
      ]
    );
    assert.deepStrictEqual(buildHeadingCodeLensPlan(['* TODO One'], ['status'], undefined, true), []);
  }
};