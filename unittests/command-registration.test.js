const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

function createVscodeMock() {
  const registered = new Set();

  const disposable = () => ({ dispose() {} });

  const vscode = {
    __registeredCommands: registered,

    commands: {
      registerCommand: (id, handler) => {
        registered.add(id);
        // handler intentionally unused
        return disposable();
      },
      executeCommand: () => Promise.resolve(undefined)
    },

    workspace: {
      onDidChangeConfiguration: () => disposable(),
      getConfiguration: () => ({
        get: () => undefined,
        update: async () => undefined
      })
    },

    languages: {
      registerOnTypeFormattingEditProvider: () => disposable()
    },

    window: {
      activeTextEditor: null,
      showInformationMessage: () => Promise.resolve(undefined),
      createWebviewPanel: () => ({
        webview: {
          cspSource: 'vscode-resource:',
          html: '',
          onDidReceiveMessage: () => disposable(),
          postMessage: () => Promise.resolve(true)
        },
        onDidDispose: () => disposable(),
        reveal: () => undefined,
        dispose: () => undefined
      })
    },

    ViewColumn: { One: 1, Beside: 2 },

    Position: function () {},
    Range: function () {},
    TextEdit: {
      replace: () => ({}),
      insert: () => ({}),
      delete: () => ({})
    },

    ConfigurationTarget: { Global: 1 }
  };

  return vscode;
}

function withMockedVscode(run) {
  const vscodeMock = createVscodeMock();
  const originalLoad = Module._load;

  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscodeMock;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return run(vscodeMock);
  } finally {
    Module._load = originalLoad;
  }
}

function getContributedCommands() {
  const repoRoot = path.resolve(__dirname, '..');
  const pkgPath = path.join(repoRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const contributes = pkg.contributes || {};
  const commands = contributes.commands || [];
  return commands
    .map(c => c && c.command)
    .filter(Boolean);
}

function activateExtension(vscodeMock) {
  const extensionPath = path.resolve(__dirname, '..', 'org-vscode', 'out', 'extension.js');
  const extension = require(extensionPath);
  const context = { subscriptions: [] };
  extension.activate(context);
  return vscodeMock.__registeredCommands;
}

function testAllContributedCommandsAreRegistered() {
  return withMockedVscode((vscodeMock) => {
    const registered = activateExtension(vscodeMock);
    const contributed = getContributedCommands();

    // Sanity check: we expect at least a handful of commands.
    assert.ok(contributed.length > 0, 'No contributed commands found in package.json');

    const missing = contributed.filter(id => !registered.has(id));
    assert.deepStrictEqual(
      missing,
      [],
      `Some contributed commands were not registered: ${missing.join(', ')}`
    );

    // Spot checks for historically-regressed commands.
    assert.ok(registered.has('org-vscode.insertTable'), 'org-vscode.insertTable must be registered');
    assert.ok(registered.has('org-vscode.exportCurrentTasks'), 'org-vscode.exportCurrentTasks must be registered');
  });
}

module.exports = {
  name: 'command-registration',
  run: testAllContributedCommandsAreRegistered
};
