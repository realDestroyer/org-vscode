const assert = require('assert');
const path = require('path');
const Module = require('module');

function createVscodeMock({ tokenColorCustomizations } = {}) {
  const disposable = () => ({ dispose() {} });

  const vscode = {
    __lastWebviewHtml: '',

    commands: {
      executeCommand: async () => undefined
    },

    workspace: {
      getConfiguration: (section) => {
        return {
          get: (key) => {
            if (section === 'editor' && key === 'tokenColorCustomizations') {
              return tokenColorCustomizations;
            }
            if (section === 'Org-vscode' && key === 'workflowStates') {
              return undefined;
            }
            return undefined;
          },
          update: async () => undefined
        };
      }
    },

    window: {
      showInformationMessage: async () => undefined,
      showErrorMessage: async () => undefined,
      createWebviewPanel: () => {
        const webview = {
          cspSource: 'vscode-resource:',
          onDidReceiveMessage: () => disposable(),
          postMessage: async () => true
        };

        let _html = '';
        Object.defineProperty(webview, 'html', {
          get: () => _html,
          set: (v) => {
            _html = String(v || '');
            vscode.__lastWebviewHtml = _html;
          }
        });

        return {
          webview,
          onDidDispose: () => disposable(),
          reveal: () => undefined,
          dispose: () => undefined
        };
      }
    },

    ViewColumn: { One: 1 },

    ConfigurationTarget: { Global: 1 }
  };

  return vscode;
}

function withMockedVscode(vscodeMock, run) {
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

function extractSingleWebviewScript(html) {
  const matches = Array.from(html.matchAll(/<script\s+nonce="[^"]+">([\s\S]*?)<\/script>/g));
  assert.strictEqual(matches.length, 1, `Expected exactly 1 <script nonce> tag, found ${matches.length}`);
  return matches[0][1];
}

function assertWebviewHtmlIsParseable(html) {
  const script = extractSingleWebviewScript(html);

  // Detect the specific past failure mode: a literal newline inside rules.join('...')
  assert.ok(!/rules\.join\('\s*\n/.test(script), 'Found a literal newline inside rules.join(\'...\') in webview script');

  // Parse check only (do not execute)
  assert.doesNotThrow(() => {
    // eslint-disable-next-line no-new
    new Function(script);
  }, 'Webview <script> content should be syntactically valid JavaScript');
}

function testWebviewDoesNotBreakOnMaliciousConfigValues() {
  const malicious = '#123456;}</style><script>var a=/</script><style>';

  const tokenColorCustomizations = {
    textMateRules: [
      {
        name: 'TODO Keyword',
        scope: 'keyword.control.todo.vso',
        settings: {
          foreground: malicious,
          background: malicious,
          fontStyle: 'bold italic underline;}</style><script>var b=/</script>'
        }
      }
    ]
  };

  const vscodeMock = createVscodeMock({ tokenColorCustomizations });

  const extensionRoot = path.resolve(__dirname, '..', '..');
  const modulePath = path.join(extensionRoot, 'out', 'syntaxColorCustomizer.js');
  delete require.cache[require.resolve(modulePath)];

  withMockedVscode(vscodeMock, () => {
    const customizer = require(modulePath);
    customizer.openSyntaxColorCustomizer();

    const html = vscodeMock.__lastWebviewHtml;
    assert.ok(html.includes('<title>Syntax Color Customizer</title>'));

    // Ensure obvious injection artifacts are not present in the HTML we send to the webview.
    assert.ok(!html.includes('</style><script>'), 'Injected </style><script> should not appear in webview HTML');

    assertWebviewHtmlIsParseable(html);
  });
}

module.exports = {
  name: 'unit/syntax-color-customizer-webview',
  run: () => {
    testWebviewDoesNotBreakOnMaliciousConfigValues();
  }
};
