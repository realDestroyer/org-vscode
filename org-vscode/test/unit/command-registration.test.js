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
      executeCommand: () => Promise.resolve(undefined),
      getCommands: async () => Array.from(registered)
    },

    workspace: {
      onDidChangeConfiguration: () => disposable(),
      getConfiguration: () => ({
        get: () => undefined,
        update: async () => undefined
      })
    },

    languages: {
      registerOnTypeFormattingEditProvider: () => disposable(),
      registerCodeLensProvider: () => disposable(),
      registerDocumentLinkProvider: () => disposable(),
      registerDocumentSymbolProvider: () => disposable(),
      registerCompletionItemProvider: () => disposable(),
      registerFoldingRangeProvider: () => disposable()
    },

    window: {
      activeTextEditor: null,
      showInformationMessage: () => Promise.resolve(undefined),
      showErrorMessage: () => Promise.resolve(undefined),
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
    CodeLens: function () {
      // allow `new vscode.CodeLens(range, command)` in activation
      return {};
    },
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

function getContributedCommands(extensionRoot) {
  const pkgPath = path.join(extensionRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const contributes = pkg.contributes || {};
  const commands = contributes.commands || [];
  return commands.map((c) => c && c.command).filter(Boolean);
}

function getContributedKeybindings(extensionRoot) {
  const pkgPath = path.join(extensionRoot, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return (pkg.contributes && pkg.contributes.keybindings) || [];
}

function getPackageManifest(extensionRoot) {
  return JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf8'));
}

function activateExtension(extensionRoot, vscodeMock) {
  const extensionPath = path.join(extensionRoot, 'out', 'extension.js');
  // Ensure we load a fresh copy for each run.
  delete require.cache[require.resolve(extensionPath)];

  const extension = require(extensionPath);
  const context = { subscriptions: [] };
  extension.activate(context);
  return vscodeMock.__registeredCommands;
}

function testAllContributedCommandsAreRegistered() {
  // test/unit -> test -> org-vscode (extension root here)
  const extensionRoot = path.resolve(__dirname, '..', '..');
  // But package.json is one level up from org-vscode
  const packageJsonRoot = path.resolve(__dirname, '..', '..', '..');

  return withMockedVscode((vscodeMock) => {
    const registered = activateExtension(extensionRoot, vscodeMock);
    const contributed = getContributedCommands(packageJsonRoot);

    // Sanity check: we expect at least a handful of commands.
    assert.ok(contributed.length > 0, 'No contributed commands found in package.json');

    const missing = contributed.filter((id) => !registered.has(id));
    assert.deepStrictEqual(
      missing,
      [],
      `Some contributed commands were not registered: ${missing.join(', ')}`
    );

    // Spot checks for historically-regressed commands.
    assert.ok(registered.has('org-vscode.insertTable'), 'org-vscode.insertTable must be registered');
    assert.ok(registered.has('org-vscode.exportCurrentTasks'), 'org-vscode.exportCurrentTasks must be registered');
    assert.ok(registered.has('org-vscode.exportHtml'), 'standalone HTML export command must be registered');
    assert.ok(registered.has('org-vscode.insertHeadingLink'), 'heading link insertion command must be registered');
    assert.ok(registered.has('extension.toggleCheckboxCookie'), 'statistics cookie command must be registered');

    const manifest = getPackageManifest(packageJsonRoot);
    const vsoLanguage = (manifest.contributes.languages || []).find((language) => language.id === 'vso');
    assert.ok(vsoLanguage.extensions.includes('.org_archive'), '.org_archive must activate the vso language');
    assert.ok(
      manifest.activationEvents.includes('onCommand:org-vscode.exportHtml'),
      'standalone HTML export must activate the extension'
    );
    assert.ok(
      manifest.activationEvents.includes('onCommand:org-vscode.insertHeadingLink'),
      'heading link insertion must activate the extension'
    );
    assert.ok(
      (manifest.contributes.menus['editor/title'] || []).some((item) => item.command === 'org-vscode.exportHtml'),
      'standalone HTML export must be available from the editor title menu'
    );

    const cookieBinding = getContributedKeybindings(packageJsonRoot)
      .find((binding) => binding.command === 'extension.toggleCheckboxCookie');
    assert.ok(cookieBinding, 'statistics cookie command must have a contributed keybinding');
    assert.strictEqual(cookieBinding.key, 'ctrl+alt+k');
  });
}

module.exports = {
  name: 'unit/command-registration',
  run: testAllContributedCommandsAreRegistered
};
