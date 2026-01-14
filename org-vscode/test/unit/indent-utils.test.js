const assert = require('assert');

const { computeDesiredIndentForNewLine } = require('../../out/indentUtils');

module.exports = {
  name: 'indent-utils',
  run() {
    {
      const lines = ['* TODO Heading'];
      const indent = computeDesiredIndentForNewLine((i) => lines[i], 1);
      assert.strictEqual(indent, '  ', 'Indents body line after asterisk heading');
    }

    {
      const lines = ['* TODO Heading'];
      const indent = computeDesiredIndentForNewLine((i) => lines[i], 1, { bodyIndent: '    ' });
      assert.strictEqual(indent, '    ', 'Honors configured bodyIndent when under heading');
    }

    {
      const lines = ['  ⊙ TODO Heading'];
      const indent = computeDesiredIndentForNewLine((i) => lines[i], 1);
      assert.strictEqual(indent, '    ', 'Indents body line after unicode heading (preserves heading indent + 2)');
    }

    {
      const lines = ['* TODO Heading', '  some body'];
      const indent = computeDesiredIndentForNewLine((i) => lines[i], 2);
      assert.strictEqual(indent, '  ', 'Keeps indent of previous body line');
    }

    {
      const lines = ['* TODO Heading', '', ''];
      const indent = computeDesiredIndentForNewLine((i) => lines[i], 3);
      assert.strictEqual(indent, '  ', 'Skips blank lines and uses nearest previous non-empty');
    }

    {
      const lines = ['plain text'];
      const indent = computeDesiredIndentForNewLine((i) => lines[i], 1);
      assert.strictEqual(indent, '', 'No indentation added when not under heading');
    }
  }
};
