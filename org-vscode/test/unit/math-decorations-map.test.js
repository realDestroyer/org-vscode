const assert = require('assert');
const fs = require('fs');
const path = require('path');

function testDefaultCommandMapKeysMatchCommandRegexOutput() {
  const filePath = path.join(__dirname, '..', '..', 'out', 'mathDecorations.js');
  const text = fs.readFileSync(filePath, 'utf8');

  assert.ok(
    /const\s+DEFAULT_COMMAND_MAP\s*=\s*\{/.test(text),
    'Expected mathDecorations.js to contain DEFAULT_COMMAND_MAP'
  );

  // In JS source, a correct LaTeX command key looks like "\\alpha" (string value is "\alpha").
  // A double-escaped key looks like "\\\\alpha" (string value is "\\alpha") and will NOT match
  // the regex /\\[A-Za-z]+/g used to find LaTeX commands in text.
  const hasDoubleEscapedCommandKeys = /"\\\\\\\\[A-Za-z]+"\s*:/.test(text);
  assert.strictEqual(
    hasDoubleEscapedCommandKeys,
    false,
    'DEFAULT_COMMAND_MAP contains double-escaped keys like "\\\\alpha"; keys should match "\\alpha"'
  );

  const hasSingleEscapedCommandKey = /"\\\\[A-Za-z]+"\s*:/.test(text);
  assert.strictEqual(
    hasSingleEscapedCommandKey,
    true,
    'Expected DEFAULT_COMMAND_MAP to contain keys like "\\alpha"'
  );
}

module.exports = {
  name: 'unit/math-decorations-map',
  run: () => {
    testDefaultCommandMapKeysMatchCommandRegexOutput();
  }
};
