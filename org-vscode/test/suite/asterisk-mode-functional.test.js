const assert = require('assert');
const vscode = require('vscode');
const os = require('os');
const path = require('path');

async function waitFor(predicate, timeoutMs = 4000, intervalMs = 50) {
  const start = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error('Timed out waiting for condition');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

async function writeTempVsoFile(contents) {
  const fileName = `org-vscode-test-${Date.now()}-${Math.random().toString(16).slice(2)}.vso`;
  const filePath = path.join(os.tmpdir(), fileName);
  const fileUri = vscode.Uri.file(filePath);
  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(contents, 'utf8'));
  return fileUri;
}

async function openFileInEditor(uri) {
  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc);
  return { doc, editor };
}

function setCursor(editor, line, character = 0) {
  const pos = new vscode.Position(line, character);
  editor.selection = new vscode.Selection(pos, pos);
}

suite('Asterisk-mode functional behavior', function () {
  this.timeout(60_000);

  let ext;
  let oldHeadingMarkerStyle;

  suiteSetup(async () => {
    ext = vscode.extensions.getExtension('realDestroyer.org-vscode');
    assert.ok(ext, 'Extension realDestroyer.org-vscode not found in test host');
    await ext.activate();

    const cfg = vscode.workspace.getConfiguration('Org-vscode');
    oldHeadingMarkerStyle = cfg.get('headingMarkerStyle');
    await cfg.update('headingMarkerStyle', 'asterisks', vscode.ConfigurationTarget.Global);
  });

  suiteTeardown(async () => {
    const cfg = vscode.workspace.getConfiguration('Org-vscode');
    await cfg.update('headingMarkerStyle', oldHeadingMarkerStyle, vscode.ConfigurationTarget.Global);
  });

  test('Toggling status preserves asterisks and adds/removes COMPLETED', async () => {
    const uri = await writeTempVsoFile('**** TODO I like chicken\n');
    const { doc, editor } = await openFileInEditor(uri);

    setCursor(editor, 0, 0);

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('**** IN_PROGRESS I like chicken'));

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('**** CONTINUED I like chicken'));

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('**** DONE I like chicken'));
    await waitFor(() => doc.getText().includes('COMPLETED:['));

    const afterDone = doc.getText();
    assert.ok(!/[⊙⊘⊖⊜⊗]/.test(afterDone), 'Should not insert unicode in asterisk mode');

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('**** ABANDONED I like chicken'));
    await waitFor(() => !doc.getText().includes('COMPLETED:['));
  });

  test('CONTINUED forwards to next day and removal cleans it up', async () => {
    const separator = ' -------------------------------------------------------------------------------------------------------------------------------';
    const contents = [
      `* [12-14-2025 Sun]${separator}`,
      '  *** IN_PROGRESS I like chicken SCHEDULED: [12-14-2025]',
      `* [12-15-2025 Mon]${separator}`,
      ''
    ].join('\n');

    const uri = await writeTempVsoFile(contents);
    const { doc, editor } = await openFileInEditor(uri);

    // Task line is line 1.
    setCursor(editor, 1, 0);

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('*** CONTINUED I like chicken SCHEDULED: [12-14-2025]'));
    await waitFor(() => doc.getText().includes('*** TODO I like chicken SCHEDULED: [12-15-2025]'));

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('*** DONE I like chicken SCHEDULED: [12-14-2025]'));
    await waitFor(() => !doc.getText().includes('*** TODO I like chicken SCHEDULED: [12-15-2025]'));
  });
});
