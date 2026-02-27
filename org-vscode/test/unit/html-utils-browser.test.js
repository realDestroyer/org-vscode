const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBrowserHtmlUtils({ mediaRoot }) {
  const ctx = { console };
  ctx.window = ctx;
  ctx.self = ctx;
  ctx.global = ctx;
  vm.createContext(ctx);

  vm.runInContext(fs.readFileSync(`${mediaRoot}/htm.js`, 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(`${mediaRoot}/htmlUtils.browser.js`, 'utf8'), ctx);

  return ctx.htmlUtils;
}

function findMediaRoot() {
  // When running unit tests we cd into the inner `org-vscode/` folder.
  // There is also an outer `media/` folder (used by the packaged extension).
  const innerMedia = path.resolve(__dirname, '..', '..', 'media');
  const outerMedia = path.resolve(__dirname, '..', '..', '..', 'media');
  if (fs.existsSync(path.join(innerMedia, 'htm.js'))) return innerMedia;
  if (fs.existsSync(path.join(outerMedia, 'htm.js'))) return outerMedia;
  return innerMedia;
}

module.exports = {
  name: 'unit/html-utils-browser',
  run() {
    const mediaRoot = findMediaRoot();
    const { html, raw } = loadBrowserHtmlUtils({ mediaRoot });

    const nested = html`<div class="stat"><span class="stat-label">Total</span><span class="stat-value">1</span></div>`;
    assert.ok(String(nested).includes('<span class="stat-label">Total</span>'));
    assert.ok(!String(nested).includes('&lt;span'));

    const rawInsert = html`<div>${raw('<span>raw</span>')}</div>`;
    assert.strictEqual(String(rawInsert), '<div><span>raw</span></div>');

    const withVoid = html`<div><input type="text" value="a&b" /></div>`;
    assert.ok(String(withVoid).includes('<input type="text" value="a&amp;b">'));
    assert.ok(!String(withVoid).includes('&lt;input'));
  }
};
