const assert = require('assert');
const path = require('path');
const Module = require('module');

function loadPreviewModule() {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return {};
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return require(path.join(__dirname, '..', '..', 'out', 'orgPreview.js'));
  } finally {
    Module._load = originalLoad;
  }
}

function testRendersStandaloneDocument() {
  const { renderStandaloneHtml } = loadPreviewModule();
  const output = renderStandaloneHtml([
    '* TODO Example <unsafe>',
    '- [X] Finished item',
    '| Name | Value |',
    ''
  ].join('\n'), 'Example & Notes');

  assert.ok(output.startsWith('<!DOCTYPE html>'));
  assert.ok(output.includes("default-src 'none'"));
  assert.ok(output.includes('<title>Example &amp; Notes</title>'));
  assert.ok(output.includes('<h1 class="org-heading">'));
  assert.ok(output.includes('Example &lt;unsafe&gt;'));
  assert.ok(output.includes('<input type="checkbox" disabled checked>'));
  assert.ok(output.includes('<table class="org-table">'));
  assert.ok(!output.includes('acquireVsCodeApi'));
  assert.ok(!output.includes('--vscode-'));
  assert.ok(!output.includes('<script'));
}

module.exports = {
  name: 'unit/org-preview-export',
  run: testRendersStandaloneDocument
};