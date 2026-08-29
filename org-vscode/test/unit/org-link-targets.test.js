const assert = require('assert');
const path = require('path');
const Module = require('module');

function loadLinkTargets() {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') {
      return {
        workspace: {
          getConfiguration: () => ({ get: () => undefined })
        }
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(path.join(__dirname, '..', '..', 'out', 'orgLinkTargets.js'));
  } finally {
    Module._load = originalLoad;
  }
}

function testCollectsCanonicalHeadingTargets() {
  const { collectHeadingTargets } = loadLinkTargets();
  const lines = [
    '* TODO [#A] First target :WORK:',
    '  :PROPERTIES:',
    '  :ID: existing-id',
    '  :END:',
    '** Second target',
    '** Second target'
  ];

  assert.deepStrictEqual(collectHeadingTargets(lines, 'file:///targets.org'), [
    { uri: 'file:///targets.org', line: 0, level: 1, title: 'First target', id: 'existing-id' },
    { uri: 'file:///targets.org', line: 4, level: 2, title: 'Second target', id: null },
    { uri: 'file:///targets.org', line: 5, level: 2, title: 'Second target', id: null }
  ]);
}

function testFormatsSafeIdLinks() {
  const { formatIdLink } = loadLinkTargets();
  assert.strictEqual(formatIdLink(' abc-123 ', 'Target [draft]'), '[[id:abc-123][Target draft]]');
  assert.strictEqual(formatIdLink('abc-123', ''), '[[id:abc-123]]');
  assert.strictEqual(formatIdLink('', 'Target'), '');
}

function testParsesAndResolvesLinkTargets() {
  const { findOrgTargetLine, parseFileLinkTarget, parseFileSearch } = loadLinkTargets();
  const lines = [
    '* TODO First target',
    '  :PROPERTIES:',
    '  :ID: global-id',
    '  :CUSTOM_ID: local-anchor',
    '  :END:',
    '<<classic-target>>'
  ];

  assert.deepStrictEqual(parseFileLinkTarget('file:notes.org::*First target'), {
    fileTarget: 'file:notes.org',
    search: '*First target'
  });
  assert.deepStrictEqual(parseFileLinkTarget('file:notes.org::#local-anchor'), {
    fileTarget: 'file:notes.org',
    search: '#local-anchor'
  });
  assert.deepStrictEqual(parseFileSearch('#local-anchor'), { type: 'anchor', value: 'local-anchor' });
  assert.strictEqual(findOrgTargetLine(lines, { type: 'heading', value: 'First target' }), 0);
  assert.strictEqual(findOrgTargetLine(lines, { type: 'id', value: 'global-id' }), 0);
  assert.strictEqual(findOrgTargetLine(lines, { type: 'anchor', value: 'local-anchor' }), 0);
  assert.strictEqual(findOrgTargetLine(lines, { type: 'anchor', value: 'classic-target' }), 5);
}

module.exports = {
  name: 'unit/org-link-targets',
  run: () => {
    testCollectsCanonicalHeadingTargets();
    testFormatsSafeIdLinks();
    testParsesAndResolvesLinkTargets();
  }
};