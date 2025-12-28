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

  test('Toggling status preserves asterisks and adds/removes CLOSED', async () => {
    const uri = await writeTempVsoFile('**** TODO I like chicken\n');
    const { doc, editor } = await openFileInEditor(uri);

    setCursor(editor, 0, 0);

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('**** IN_PROGRESS I like chicken'));

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('**** CONTINUED I like chicken'));

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('**** DONE I like chicken'));
    await waitFor(() => doc.getText().includes('CLOSED: ['));

    const afterDone = doc.getText();
    assert.ok(!/[⊙⊘⊖⊜⊗]/.test(afterDone), 'Should not insert unicode in asterisk mode');

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('**** ABANDONED I like chicken'));
    await waitFor(() => !doc.getText().includes('CLOSED: ['));
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
    let { doc, editor } = await openFileInEditor(uri);

    // Task line is line 1.
    setCursor(editor, 1, 0);

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('*** CONTINUED I like chicken'));
    await waitFor(() => doc.getText().includes('    SCHEDULED: [12-14-2025]'));
    await waitFor(() => doc.getText().includes('*** TODO I like chicken'));
    await waitFor(() => doc.getText().includes('    SCHEDULED: [12-15-2025]'));

    await vscode.commands.executeCommand('extension.toggleStatusRight');
    await waitFor(() => doc.getText().includes('*** DONE I like chicken'));
    await waitFor(() => doc.getText().includes('    SCHEDULED: [12-14-2025]'));
    await waitFor(() => !doc.getText().includes('    SCHEDULED: [12-15-2025]'));
  });

  test('Selection toggles status for multiple task lines', async () => {
    const separator = ' -------------------------------------------------------------------------------------------------------------------------------';
    const contents = [
      `* [12-14-2025 Sun]${separator}`,
      '  *** TODO Task A',
      '  *** TODO Task B',
      '  *** TODO Task C',
      ''
    ].join('\n');

    const uri = await writeTempVsoFile(contents);
    let { doc, editor } = await openFileInEditor(uri);

    // Select from the day heading through the last task.
    const start = new vscode.Position(0, 0);
    const end = new vscode.Position(3, doc.lineAt(3).text.length);
    editor.selection = new vscode.Selection(start, end);

    await vscode.commands.executeCommand('extension.toggleStatusRight');

    await waitFor(() => doc.getText().includes('*** IN_PROGRESS Task A'));
    await waitFor(() => doc.getText().includes('*** IN_PROGRESS Task B'));
    await waitFor(() => doc.getText().includes('*** IN_PROGRESS Task C'));

    // Ensure the day heading did not get converted into a TODO item.
    assert.ok(doc.getText().includes(`* [12-14-2025 Sun]${separator}`));
  });

  test('Selection can add TODO keyword to headings (but not day headings)', async () => {
    const separator = ' -------------------------------------------------------------------------------------------------------------------------------';
    const contents = [
      `* [12-14-2025 Sun]${separator}`,
      '  ** Project Notes',
      '  ** Create JIRA project EPIC',
      '  ** Create Stories for Equipment Ordering',
      ''
    ].join('\n');

    const uri = await writeTempVsoFile(contents);
    let { doc, editor } = await openFileInEditor(uri);

    // Select the two note headings only (no existing TODO keywords).
    const start = new vscode.Position(2, 0);
    const end = new vscode.Position(4, 0);
    editor.selection = new vscode.Selection(start, end);

    await vscode.commands.executeCommand('extension.toggleStatusRight');

    await waitFor(() => doc.getText().includes('** TODO Create JIRA project EPIC'));
    await waitFor(() => doc.getText().includes('** TODO Create Stories for Equipment Ordering'));

    // Ensure the day heading did not get converted into a TODO item.
    assert.ok(doc.getText().includes(`* [12-14-2025 Sun]${separator}`));
  });

  test('Selection adds SCHEDULED to multiple tasks', async () => {
    const separator = ' -------------------------------------------------------------------------------------------------------------------------------';
    const contents = [
      `* [12-14-2025 Sun]${separator}`,
      '  *** TODO Task A',
      '  *** TODO Task B',
      '  *** TODO Task C',
      ''
    ].join('\n');

    const uri = await writeTempVsoFile(contents);
    const { doc, editor } = await openFileInEditor(uri);

    const originalShowInputBox = vscode.window.showInputBox;
    const answers = ['12', '31', '2025'];
    vscode.window.showInputBox = async () => answers.shift();

    try {
      const start = new vscode.Position(0, 0);
      const end = new vscode.Position(3, doc.lineAt(3).text.length);
      editor.selection = new vscode.Selection(start, end);

      await vscode.commands.executeCommand('extension.scheduling');

      await waitFor(() => doc.getText().includes('  *** TODO Task A\n    SCHEDULED: [2025-12-31]'));
      await waitFor(() => doc.getText().includes('  *** TODO Task B\n    SCHEDULED: [2025-12-31]'));
      await waitFor(() => doc.getText().includes('  *** TODO Task C\n    SCHEDULED: [2025-12-31]'));
      assert.ok(doc.getText().includes(`* [12-14-2025 Sun]${separator}`));
    } finally {
      vscode.window.showInputBox = originalShowInputBox;
    }
  });

  test('Selection adds DEADLINE to multiple tasks', async () => {
    const separator = ' -------------------------------------------------------------------------------------------------------------------------------';
    const contents = [
      `* [12-14-2025 Sun]${separator}`,
      '  *** TODO Task A',
      '  *** TODO Task B',
      '  *** TODO Task C',
      ''
    ].join('\n');

    const uri = await writeTempVsoFile(contents);
    const { doc, editor } = await openFileInEditor(uri);

    const originalShowInputBox = vscode.window.showInputBox;
    const answers = ['12', '31', '2025'];
    vscode.window.showInputBox = async () => answers.shift();

    try {
      const start = new vscode.Position(0, 0);
      const end = new vscode.Position(3, doc.lineAt(3).text.length);
      editor.selection = new vscode.Selection(start, end);

      await vscode.commands.executeCommand('extension.deadline');

      await waitFor(() => doc.getText().includes('  *** TODO Task A\n    DEADLINE: [2025-12-31]'));
      await waitFor(() => doc.getText().includes('  *** TODO Task B\n    DEADLINE: [2025-12-31]'));
      await waitFor(() => doc.getText().includes('  *** TODO Task C\n    DEADLINE: [2025-12-31]'));
      assert.ok(doc.getText().includes(`* [12-14-2025 Sun]${separator}`));
    } finally {
      vscode.window.showInputBox = originalShowInputBox;
    }
  });

  test('Selection adds end-of-line tag to multiple tasks (Emacs style)', async () => {
    const contents = [
      '#+TAGS: FOO',
      '  *** TODO Task A',
      '  *** TODO Task B',
      ''
    ].join('\n');

    const uri = await writeTempVsoFile(contents);
    const { doc, editor } = await openFileInEditor(uri);

    const originalShowInputBox = vscode.window.showInputBox;
    vscode.window.showInputBox = async () => 'test';

    try {
      const start = new vscode.Position(1, 0);
      const end = new vscode.Position(3, 0);
      editor.selection = new vscode.Selection(start, end);

      await vscode.commands.executeCommand('extension.addTagToTask');

      await waitFor(() => doc.getText().includes('*** TODO Task A :TEST:'));
      await waitFor(() => doc.getText().includes('*** TODO Task B :TEST:'));

      // In Emacs Org-mode, #+TAGS configures allowed tags/groups/keys; it is not automatically mutated.
      await waitFor(() => doc.getText().includes('#+TAGS: FOO'));
      assert.ok(!doc.getText().includes('#+TAGS: FOO, TEST'));
    } finally {
      vscode.window.showInputBox = originalShowInputBox;
    }
  });

  test('Add File Tag inserts/updates #+FILETAGS in Emacs style', async () => {
    const contents = [
      '#+TITLE: Example',
      '',
      '*** TODO Task A',
      ''
    ].join('\n');

    const uri = await writeTempVsoFile(contents);
    const { doc } = await openFileInEditor(uri);

    const originalShowInputBox = vscode.window.showInputBox;
    vscode.window.showInputBox = async () => 'foo';

    try {
      await vscode.commands.executeCommand('extension.addFileTag');
      await waitFor(() => doc.getText().includes('#+FILETAGS: :FOO:'));

      // Running again should append (and normalize) without duplicating existing tags.
      vscode.window.showInputBox = async () => 'bar';
      await vscode.commands.executeCommand('extension.addFileTag');
      await waitFor(() => doc.getText().includes('#+FILETAGS: :FOO:BAR:'));
    } finally {
      vscode.window.showInputBox = originalShowInputBox;
    }
  });

  test('Selection increments heading stars across multiple lines (non-vso language mode)', async () => {
    const separator = ' -------------------------------------------------------------------------------------------------------------------------------';
    const contents = [
      `* [12-14-2025 Sun]${separator}`,
      '  *** TODO Task A',
      '  *** TODO Task B',
      '  *** TODO Task C',
      ''
    ].join('\n');

    const uri = await writeTempVsoFile(contents);
    let { doc, editor } = await openFileInEditor(uri);

    // Force language mode to a non-vso language to simulate environments where another extension owns .org.
    // (The VS Code test host doesn't necessarily have an 'org' language installed.)
    doc = await vscode.languages.setTextDocumentLanguage(doc, 'plaintext');
    editor = await vscode.window.showTextDocument(doc);

    const start = new vscode.Position(1, 0);
    const end = new vscode.Position(3, doc.lineAt(3).text.length);
    editor.selection = new vscode.Selection(start, end);

    const before1 = doc.lineAt(1).text;
    const before2 = doc.lineAt(2).text;
    const before3 = doc.lineAt(3).text;

    const starsBefore1 = (before1.match(/^\s*\*+/) || [''])[0].trim().length;
    const starsBefore2 = (before2.match(/^\s*\*+/) || [''])[0].trim().length;
    const starsBefore3 = (before3.match(/^\s*\*+/) || [''])[0].trim().length;

    await vscode.commands.executeCommand('extension.increment');

    await waitFor(() => {
      const after1Now = doc.lineAt(1).text;
      const after2Now = doc.lineAt(2).text;
      const after3Now = doc.lineAt(3).text;
      const starsAfter1Now = (after1Now.match(/^\s*\*+/) || [''])[0].trim().length;
      const starsAfter2Now = (after2Now.match(/^\s*\*+/) || [''])[0].trim().length;
      const starsAfter3Now = (after3Now.match(/^\s*\*+/) || [''])[0].trim().length;
      return (
        starsAfter1Now === starsBefore1 + 1 &&
        starsAfter2Now === starsBefore2 + 1 &&
        starsAfter3Now === starsBefore3 + 1
      );
    });

    const after1 = doc.lineAt(1).text;
    const after2 = doc.lineAt(2).text;
    const after3 = doc.lineAt(3).text;

    const starsAfter1 = (after1.match(/^\s*\*+/) || [''])[0].trim().length;
    const starsAfter2 = (after2.match(/^\s*\*+/) || [''])[0].trim().length;
    const starsAfter3 = (after3.match(/^\s*\*+/) || [''])[0].trim().length;

    assert.strictEqual(starsAfter1, starsBefore1 + 1);
    assert.strictEqual(starsAfter2, starsBefore2 + 1);
    assert.strictEqual(starsAfter3, starsBefore3 + 1);
  });
});
