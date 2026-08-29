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
  const { getPreviewHtml, renderOrgToHtml, renderStandaloneHtml } = loadPreviewModule();
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
  assert.ok(!output.includes("script-src"));
  assert.ok(!output.includes('<script'));
  assert.ok(!output.includes('https://cdnjs.cloudflare.com'));

  const spoofedMermaidClass = renderStandaloneHtml([
    '#+BEGIN_EXPORT html',
    '<div class="org-mermaid">ordinary exported HTML</div>',
    '#+END_EXPORT'
  ].join('\n'), 'No diagram');
  assert.ok(!spoofedMermaidClass.includes('<script'));
  assert.ok(!spoofedMermaidClass.includes('script-src'));

  const maliciousSource = [
    '#+BeGiN_SrC MeRmAiD',
    'graph TD',
    'A["</script><img src=x onerror=alert(1)>"] --> B',
    '#+END_SRC',
    '#+BEGIN_SRC javascript',
    'const unchanged = "<tag>";',
    '#+END_SRC',
    '#+BEGIN_SRC mermaid',
    'this is not valid mermaid',
    '#+END_SRC'
  ].join('\n');
  const body = String(renderOrgToHtml(maliciousSource));
  const mermaidOutput = renderStandaloneHtml(maliciousSource, 'Mermaid safety');

  assert.ok(body.includes('<div class="org-mermaid">'));
  assert.ok(body.includes('<pre class="org-src org-mermaid-source">'));
  assert.ok(body.includes('<div class="org-mermaid-render" aria-hidden="true"></div>'));
  assert.ok(body.includes('&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!body.includes('</script><img'));
  assert.ok(body.includes('<code data-lang="javascript">'));
  assert.ok(body.includes('const unchanged = "&lt;tag&gt;";'));
  assert.ok(body.includes('this is not valid mermaid'));
  assert.strictEqual((body.match(/class="org-mermaid"/g) || []).length, 2);
  assert.ok(mermaidOutput.includes("securityLevel: 'strict'"));
  assert.ok(mermaidOutput.includes('if (!globalThis.mermaid) return;'));
  assert.ok(mermaidOutput.includes('new MutationObserver(renderAll)'));
  assert.ok(mermaidOutput.includes("addEventListener('change', renderAll)"));
  assert.ok(mermaidOutput.includes("script-src 'nonce-"));
  assert.ok(mermaidOutput.includes('sourceElement.textContent'));
  assert.ok(mermaidOutput.includes('sourceElement.hidden = false'));
  assert.ok(mermaidOutput.includes("document.getElementById('d' + renderId)?.remove()"));
  assert.ok(!mermaidOutput.includes('script-src https:'));
  assert.ok(!mermaidOutput.includes('src="http'));

  const initializerMatch = mermaidOutput.match(/<script nonce="[^"]+" data-org-mermaid-initializer>([\s\S]*?)<\/script>/);
  assert.ok(initializerMatch, 'standalone Mermaid initializer must be present');
  assert.doesNotThrow(() => new Function(initializerMatch[1]));

  const preview = getPreviewHtml(
    { cspSource: 'vscode-webview-resource:', asWebviewUri: (uri) => uri },
    'fixed-nonce',
    body,
    'vscode-webview-resource:/media/mermaid.min.js',
    true
  );
  assert.ok(preview.includes('src="vscode-webview-resource:/media/mermaid.min.js"'));
  assert.ok(preview.includes("securityLevel: 'strict'"));
  assert.ok(preview.includes("script-src vscode-webview-resource: 'nonce-fixed-nonce'"));
  assert.ok(!preview.includes('script-src https:'));

  const spoofedPreview = getPreviewHtml(
    { cspSource: 'vscode-webview-resource:' },
    'fixed-nonce',
    '<div class="org-mermaid">ordinary exported HTML</div>',
    'vscode-webview-resource:/media/mermaid.min.js',
    false
  );
  assert.ok(!spoofedPreview.includes('src="vscode-webview-resource:/media/mermaid.min.js"'));
  assert.ok(!spoofedPreview.includes("securityLevel: 'strict'"));
}

module.exports = {
  name: 'unit/org-preview-export',
  run: testRendersStandaloneDocument
};