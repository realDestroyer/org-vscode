const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Module = require('module');

function makeMemento() {
  const m = new Map();
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    update: async (k, v) => { if (v === undefined) m.delete(k); else m.set(k, v); }
  };
}

function createVscodeMock(options) {
  const opts = options || {};
  const config = new Map(Object.entries(opts.config || {}));
  return {
    workspace: {
      getConfiguration: () => ({
        get: (key, def) => (config.has(key) ? config.get(key) : def)
      }),
      workspaceFolders: opts.workspaceFolders || []
    },
    window: {
      showWarningMessage: async () => opts.userChoice
    },
    extensions: {
      getExtension: (id) => (opts.extensions || {})[id] || undefined,
      all: Object.values(opts.extensions || {})
    },
    Uri: {
      file: (p) => ({ toString: () => `file://${p.replace(/\\/g, '/')}`, fsPath: p })
    }
  };
}

function withMockedVscode(vscodeMock, fn) {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscodeMock;
    return originalLoad.call(this, request, parent, isMain);
  };
  // Clear any cached api modules so they pick up the mock.
  for (const k of Object.keys(require.cache)) {
    if (k.includes(`${path.sep}out${path.sep}api${path.sep}`)) delete require.cache[k];
  }
  try { return fn(); } finally { Module._load = originalLoad; }
}

async function testCaptureDisabledByDefault() {
  const vscodeMock = createVscodeMock({ config: {} });
  await withMockedVscode(vscodeMock, async () => {
    const { createExtensionApi, CaptureDisabledError } = require(
      path.join(__dirname, '..', '..', 'out', 'api', 'extensionApi.js')
    );
    const api = createExtensionApi(vscodeMock, {
      workspaceState: makeMemento(),
      version: '1.0.0'
    });
    let caught;
    try {
      await api.captureTodo({ headline: 'x' });
    } catch (e) { caught = e; }
    assert.ok(caught instanceof CaptureDisabledError, `expected CaptureDisabledError, got ${caught && caught.name}`);
  });
}

async function testCaptureRejectsUnknownCaller() {
  const vscodeMock = createVscodeMock({
    config: { 'Org-vscode.enableExternalCapture': true },
    extensions: {} // no extensions registered → no caller match possible
  });
  await withMockedVscode(vscodeMock, async () => {
    const { createExtensionApi, TrustDeniedError } = require(
      path.join(__dirname, '..', '..', 'out', 'api', 'extensionApi.js')
    );
    const api = createExtensionApi(vscodeMock, {
      workspaceState: makeMemento(),
      version: '1.0.0'
    });
    let caught;
    try {
      await api.captureTodo({ headline: 'x' });
    } catch (e) { caught = e; }
    assert.ok(caught instanceof TrustDeniedError, `expected TrustDeniedError, got ${caught && caught.name}`);
  });
}

async function testRegisterLinkTypeRequiresTrust() {
  const vscodeMock = createVscodeMock({
    config: { 'Org-vscode.enableExternalCapture': true },
    extensions: {}
  });
  await withMockedVscode(vscodeMock, async () => {
    const { createExtensionApi, TrustDeniedError } = require(
      path.join(__dirname, '..', '..', 'out', 'api', 'extensionApi.js')
    );
    const api = createExtensionApi(vscodeMock, {
      workspaceState: makeMemento(),
      version: '1.0.0'
    });
    let caught;
    try {
      await api.registerLinkType({ type: 'msgid', resolve: () => ({}) });
    } catch (e) { caught = e; }
    assert.ok(caught instanceof TrustDeniedError);
  });
}

async function testGetCapturedSchemesReadsRegistry() {
  const vscodeMock = createVscodeMock({});
  await withMockedVscode(vscodeMock, async () => {
    const { createExtensionApi } = require(
      path.join(__dirname, '..', '..', 'out', 'api', 'extensionApi.js')
    );
    const { linkTypeRegistry } = require(
      path.join(__dirname, '..', '..', 'out', 'api', 'linkTypeRegistry.js')
    );
    const api = createExtensionApi(vscodeMock, {
      workspaceState: makeMemento(),
      version: '1.0.0'
    });
    const initial = api.getCapturedSchemes().length;
    const d = linkTypeRegistry.register({
      type: 'extapitest',
      resolve: () => ({})
    }, 'pub.test');
    assert.strictEqual(api.getCapturedSchemes().includes('extapitest'), true);
    assert.strictEqual(api.getCapturedSchemes().length, initial + 1);
    d.dispose();
  });
}

// ─────────────────────────────────────────────────────────────────────
// matchCallerInStack — regression tests for the v1 hardening fixes
// ─────────────────────────────────────────────────────────────────────
function loadMatchCaller() {
  // Pure helper, no mock needed.
  return require(path.join(__dirname, '..', '..', 'out', 'api', 'extensionApi.js')).matchCallerInStack;
}

function testMatchesWindowsCaseInsensitive() {
  const matchCallerInStack = loadMatchCaller();
  // VS Code reports E:\... but V8 frames sometimes appear lowercase e:\...
  const stack =
    'Error\n' +
    '    at zb (e:\\Projects\\VSCode OrgMode\\org-vscode\\dist\\extension.js:5045:4358)\n' +
    '    at e:\\Projects\\VSCode OrgMode\\org-vscode\\examples\\external-consumer\\extension.js:62:30\n';
  const out = matchCallerInStack(
    stack,
    [
      { id: 'realDestroyer.org-vscode', extensionPath: 'E:\\Projects\\VSCode OrgMode\\org-vscode' },
      { id: 'org-vscode-examples.consumer', extensionPath: 'E:\\Projects\\VSCode OrgMode\\org-vscode\\examples\\external-consumer' }
    ],
    'E:\\Projects\\VSCode OrgMode\\org-vscode',
    { isWin: true, sep: '\\' }
  );
  assert.ok(out, 'expected a match');
  assert.strictEqual(out.id, 'org-vscode-examples.consumer');
}

function testMostSpecificPrefixWins() {
  const matchCallerInStack = loadMatchCaller();
  // Nested extension path. Without longest-prefix sort, the consumer would
  // be mis-attributed to the parent org-vscode extension.
  const stack =
    'Error\n' +
    '    at /workspace/org-vscode/examples/external-consumer/extension.js:10:5\n';
  const out = matchCallerInStack(
    stack,
    [
      { id: 'realDestroyer.org-vscode', extensionPath: '/workspace/org-vscode' },
      { id: 'examples.consumer', extensionPath: '/workspace/org-vscode/examples/external-consumer' }
    ],
    '/workspace/org-vscode',
    { isWin: false, sep: '/' }
  );
  assert.ok(out, 'expected a match');
  assert.strictEqual(out.id, 'examples.consumer');
}

function testHandlesPathsWithSpaces() {
  const matchCallerInStack = loadMatchCaller();
  // Path contains "VSCode OrgMode" (a space). The legacy regex used
  // [^\s]+\.js which would have stopped at the first space.
  const stack =
    'Error\n' +
    '    at fn (E:\\Projects\\VSCode OrgMode\\some-ext\\out\\extension.js:1:1)\n';
  const out = matchCallerInStack(
    stack,
    [{ id: 'pub.some-ext', extensionPath: 'E:\\Projects\\VSCode OrgMode\\some-ext' }],
    null,
    { isWin: true, sep: '\\' }
  );
  assert.ok(out);
  assert.strictEqual(out.id, 'pub.some-ext');
}

function testHandlesAnonymousAndAsyncFrames() {
  const matchCallerInStack = loadMatchCaller();
  // Frames without a wrapping function name (anonymous / top-level) and
  // async-prefixed frames must still be parsed.
  const stack =
    'Error\n' +
    '    at /home/me/.vscode/extensions/pub.foo/extension.js:42:10\n' +
    '    at async Object.handler (/home/me/.vscode/extensions/pub.foo/extension.js:99:1)\n';
  const out = matchCallerInStack(
    stack,
    [{ id: 'pub.foo', extensionPath: '/home/me/.vscode/extensions/pub.foo' }],
    null,
    { isWin: false, sep: '/' }
  );
  assert.ok(out);
  assert.strictEqual(out.id, 'pub.foo');
}

function testSkipsOrgVscodeInternalFrames() {
  const matchCallerInStack = loadMatchCaller();
  // Top of stack is inside org-vscode; the real caller is below it.
  const stack =
    'Error\n' +
    '    at zb (/workspace/org-vscode/dist/extension.js:1:1)\n' +
    '    at Object.api.captureTodo (/workspace/org-vscode/dist/extension.js:2:1)\n' +
    '    at /home/me/.vscode/extensions/pub.bar/extension.js:5:5\n';
  const out = matchCallerInStack(
    stack,
    [
      { id: 'realDestroyer.org-vscode', extensionPath: '/workspace/org-vscode' },
      { id: 'pub.bar', extensionPath: '/home/me/.vscode/extensions/pub.bar' }
    ],
    '/workspace/org-vscode',
    { isWin: false, sep: '/' }
  );
  assert.ok(out);
  assert.strictEqual(out.id, 'pub.bar');
}

function testReturnsNullWhenNoExtensionMatches() {
  const matchCallerInStack = loadMatchCaller();
  const stack =
    'Error\n' +
    '    at /tmp/random/file.js:1:1\n';
  const out = matchCallerInStack(
    stack,
    [{ id: 'pub.foo', extensionPath: '/home/me/.vscode/extensions/pub.foo' }],
    null,
    { isWin: false, sep: '/' }
  );
  assert.strictEqual(out, null);
}

function testIgnoresVscodeNodeModulesShim() {
  const matchCallerInStack = loadMatchCaller();
  // Frames inside node_modules/vscode (the shim) must be skipped even if
  // they happen to live under an extension's tree.
  const stack =
    'Error\n' +
    '    at /home/me/.vscode/extensions/pub.foo/node_modules/vscode/index.js:1:1\n' +
    '    at /home/me/.vscode/extensions/pub.foo/extension.js:5:5\n';
  const out = matchCallerInStack(
    stack,
    [{ id: 'pub.foo', extensionPath: '/home/me/.vscode/extensions/pub.foo' }],
    null,
    { isWin: false, sep: '/' }
  );
  assert.ok(out);
  assert.strictEqual(out.id, 'pub.foo');
}

module.exports = {
  name: 'unit/extension-api',
  run: async () => {
    await testCaptureDisabledByDefault();
    await testCaptureRejectsUnknownCaller();
    await testRegisterLinkTypeRequiresTrust();
    await testGetCapturedSchemesReadsRegistry();
    testMatchesWindowsCaseInsensitive();
    testMostSpecificPrefixWins();
    testHandlesPathsWithSpaces();
    testHandlesAnonymousAndAsyncFrames();
    testSkipsOrgVscodeInternalFrames();
    testReturnsNullWhenNoExtensionMatches();
    testIgnoresVscodeNodeModulesShim();
  }
};
