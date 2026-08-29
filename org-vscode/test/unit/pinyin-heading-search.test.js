const assert = require('assert');
const path = require('path');
const Module = require('module');

const {
  MAX_TRANSLITERATED_TITLE_LENGTH,
  buildPinyinAliases,
  buildPinyinSearchText
} = require(path.join(__dirname, '..', '..', 'out', 'pinyinHeadingSearch.js'));

function testOptInAndLatinPreservation() {
  let calls = 0;
  const transliterate = () => {
    calls += 1;
    return ['unexpected'];
  };

  assert.strictEqual(buildPinyinSearchText('中文标题', { enabled: false, transliterate }), '中文标题');
  assert.strictEqual(buildPinyinSearchText('Release Notes', { enabled: true, transliterate }), 'Release Notes');
  assert.strictEqual(calls, 0);
}

function testFullAndInitialAliases() {
  const searchText = buildPinyinSearchText('中文标题', { enabled: true });
  assert.ok(searchText.includes('zhong wen biao ti'));
  assert.ok(searchText.includes('zhongwenbiaoti'));
  assert.ok(searchText.includes('zwbt'));

  const multilingual = buildPinyinSearchText('Project 中文', { enabled: true });
  assert.ok(multilingual.startsWith('Project 中文 '));
  assert.ok(multilingual.includes('zhongwen'));
  assert.ok(buildPinyinAliases('Project 中文', { enabled: true }).includes('pzw'));
}

function testInputBoundAndBatchPerformance() {
  let longestInput = 0;
  const transliterate = (text, options) => {
    longestInput = Math.max(longestInput, text.length);
    return options.pattern === 'first' ? ['z'] : ['zhong'];
  };
  buildPinyinSearchText('中'.repeat(2000), { enabled: true, transliterate });
  assert.strictEqual(longestInput, MAX_TRANSLITERATED_TITLE_LENGTH);

  const started = Date.now();
  for (let index = 0; index < 1000; index++) {
    buildPinyinSearchText(`项目 ${index}`, { enabled: true });
  }
  assert.ok(Date.now() - started < 2000, '1,000 heading aliases should build within two seconds');
}

function testQuickPickIntegration() {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
      return { workspace: { asRelativePath: () => 'notes.org' } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const commandsPath = path.join(__dirname, '..', '..', 'out', 'orgLinkCommands.js');
    delete require.cache[require.resolve(commandsPath)];
    const { createTargetPick } = require(commandsPath);
    const target = { uri: { scheme: 'file' }, line: 4, title: '中文标题', id: null };
    const disabled = createTargetPick(target, false);
    const enabled = createTargetPick(target, true);

    assert.deepStrictEqual(disabled, {
      label: '$(symbol-namespace) 中文标题',
      description: 'notes.org:5',
      detail: 'An ID will be created',
      target
    });
    assert.strictEqual(enabled.label, disabled.label);
    assert.strictEqual(enabled.description, disabled.description);
    assert.strictEqual(enabled.target, target);
    assert.ok(enabled.detail.includes('Pinyin:'));
    assert.ok(enabled.detail.includes('zhongwenbiaoti'));
    assert.ok(enabled.detail.includes('zwbt'));
  } finally {
    Module._load = originalLoad;
  }
}

module.exports = {
  name: 'unit/pinyin-heading-search',
  run: () => {
    testOptInAndLatinPreservation();
    testFullAndInitialAliases();
    testInputBoundAndBatchPerformance();
    testQuickPickIntegration();
  }
};