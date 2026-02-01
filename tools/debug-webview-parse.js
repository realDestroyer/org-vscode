/*
  Debug helper: reproduces Syntax Color Customizer webview JS parse errors by
  mocking vscode + injecting tokenColorCustomizations values.

  Usage:
    node tools/debug-webview-parse.js
*/

const path = require('path');
const Module = require('module');
const vm = require('vm');

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

function createVscodeMock() {
  const disposable = () => ({ dispose() {} });

  const vscode = {
    __lastWebviewHtml: '',

    commands: {
      executeCommand: async () => undefined
    },

    workspace: {
      getConfiguration: (section) => ({
        get: (key) => {
          if (section === 'editor' && key === 'tokenColorCustomizations') return tokenColorCustomizations;
          if (section === 'Org-vscode' && key === 'workflowStates') return undefined;
          return undefined;
        },
        update: async () => undefined
      })
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

function extractSingleWebviewScript(html) {
  const matches = Array.from(html.matchAll(/<script\s+nonce="[^"]+">([\s\S]*?)<\/script>/g));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly 1 <script nonce> tag, found ${matches.length}`);
  }
  return matches[0][1];
}

function findFirstFailingLine(script) {
  // Prefix-based bisection doesn't work for JavaScript because incomplete
  // prefixes fail to parse even when the full script is valid.
  // Instead, rely on vm.Script's SyntaxError line/column reporting.
  try {
    // eslint-disable-next-line no-new
    new vm.Script(script, { filename: 'webview-inline.js' });
    return { ok: true };
  } catch (err) {
    const stack = String(err && err.stack ? err.stack : err);
    const m = stack.match(/webview-inline\.js:(\d+):(\d+)/);
    const line = m ? Number(m[1]) : null;
    const column = m ? Number(m[2]) : null;
    return { ok: false, err, line, column, stack };
  }
}

function main() {
  const vscodeMock = createVscodeMock();
  const originalLoad = Module._load;

  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscodeMock;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const modulePath = path.join(__dirname, '..', 'org-vscode', 'out', 'syntaxColorCustomizer.js');
    delete require.cache[require.resolve(modulePath)];

    const customizer = require(modulePath);
    customizer.openSyntaxColorCustomizer();

    const html = vscodeMock.__lastWebviewHtml;
    const script = extractSingleWebviewScript(html);

    try {
      // eslint-disable-next-line no-new
      new vm.Script(script, { filename: 'webview-inline.js' });
      console.log('OK: webview <script> parses');
      return;
    } catch (err) {
      console.error('ERROR: webview <script> does not parse:', err && err.message ? err.message : String(err));
    }

    const res = findFirstFailingLine(script);
    if (res && res.ok === false) {
      console.error(res.stack);
      const lines = script.split(/\r?\n/);
      const failingLine = typeof res.line === 'number' ? res.line : 1;
      console.error(`Approx location: line ${res.line ?? '??'}, column ${res.column ?? '??'} (of ${lines.length} lines)`);
      const start = Math.max(1, failingLine - 8);
      const end = Math.min(lines.length, failingLine + 8);
      for (let i = start; i <= end; i++) {
        const prefix = String(i).padStart(5, ' ');
        console.error(prefix + ': ' + lines[i - 1]);
      }
    }
  } finally {
    Module._load = originalLoad;
  }
}

main();
