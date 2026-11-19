const assert = require('assert');
const Module = require('module');
const path = require('path');

function testHiddenLinkDecorationCollapsesLongTargets() {
  const decorationOptions = [];
  const disposable = () => ({ dispose() {} });
  const vscodeMock = {
    commands: {
      registerCommand: () => disposable()
    },
    workspace: {
      getConfiguration: () => ({
        get: () => false,
        update: async () => undefined
      }),
      onDidChangeConfiguration: () => disposable(),
      onDidChangeTextDocument: () => disposable()
    },
    window: {
      activeTextEditor: null,
      createTextEditorDecorationType: (options) => {
        decorationOptions.push(options);
        return disposable();
      },
      onDidChangeActiveTextEditor: () => disposable(),
      onDidChangeTextEditorSelection: () => disposable(),
      onDidChangeTextEditorVisibleRanges: () => disposable()
    },
    ConfigurationTarget: { Global: 1 }
  };
  const originalLoad = Module._load;
  const modulePath = path.resolve(__dirname, '..', '..', 'src', 'orgLinkDecorations.js');

  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscodeMock;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[require.resolve(modulePath)];
    const { registerOrgLinkDecorations } = require(modulePath);
    registerOrgLinkDecorations({ subscriptions: [] });
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(modulePath)];
  }

  assert.strictEqual(decorationOptions[1].color, 'transparent');
  assert.strictEqual(
    decorationOptions[1].letterSpacing,
    '-1ch',
    'hidden link text must not reserve wrapped rows for a long URL'
  );
}

module.exports = {
  name: 'unit/org-link-decorations',
  run: testHiddenLinkDecorationCollapsesLongTargets
};
