const assert = require('assert');
const vscode = require('vscode');

suite('Command registration', function () {
  this.timeout(60_000);

  test('All contributed commands are registered', async () => {
    const ext = vscode.extensions.getExtension('realDestroyer.org-vscode');
    assert.ok(ext, 'Extension realDestroyer.org-vscode not found in test host');

    await ext.activate();

    const registeredCommands = await vscode.commands.getCommands(true);
    const contributed = (ext.packageJSON && ext.packageJSON.contributes && ext.packageJSON.contributes.commands) || [];
    const contributedIds = contributed.map(c => c && c.command).filter(Boolean);

    assert.ok(contributedIds.length > 0, 'No contributed commands found in extension package.json');

    const missing = contributedIds.filter(id => !registeredCommands.includes(id));
    assert.deepStrictEqual(missing, [], `Missing contributed commands: ${missing.join(', ')}`);

    // Regressions we hit recently
    assert.ok(registeredCommands.includes('org-vscode.insertTable'), 'org-vscode.insertTable must be registered');
    assert.ok(registeredCommands.includes('org-vscode.exportCurrentTasks'), 'org-vscode.exportCurrentTasks must be registered');
  });

  test('All keybinding commands exist', async () => {
    const ext = vscode.extensions.getExtension('realDestroyer.org-vscode');
    assert.ok(ext, 'Extension realDestroyer.org-vscode not found in test host');

    await ext.activate();

    const registeredCommands = await vscode.commands.getCommands(true);
    const keybindings = (ext.packageJSON && ext.packageJSON.contributes && ext.packageJSON.contributes.keybindings) || [];
    // VS Code allows keybinding contributions that *remove* bindings by prefixing
    // the command with '-'. Those are not real commands and should not be asserted.
    const ids = keybindings
      .map(k => k && k.command)
      .filter(Boolean)
      .filter(id => !id.startsWith('-'));

    const uniqueIds = Array.from(new Set(ids));

    const missing = uniqueIds.filter(id => !registeredCommands.includes(id));
    assert.deepStrictEqual(missing, [], `Missing keybinding commands: ${missing.join(', ')}`);
  });

  test('Migrate file to v2 rewrites legacy constructs', async () => {
    const ext = vscode.extensions.getExtension('realDestroyer.org-vscode');
    assert.ok(ext, 'Extension realDestroyer.org-vscode not found in test host');
    await ext.activate();

    const input = [
      '* DONE : [+TAG:Work,proj] - : Example task  SCHEDULED: [2025-01-02]',
      '  COMPLETED:[2nd January 2025, 9:42:00 am]',
      '',
      '* TODO Another task :OldTag:  DEADLINE: [2025-02-03]',
      '* TODO : [+TAG:TEST-TAG] - Hyphen tag example  SCHEDULED: [2025-03-04]'
    ].join('\n');

    const doc = await vscode.workspace.openTextDocument({ language: 'vso', content: input });
    const editor = await vscode.window.showTextDocument(doc);

      await vscode.commands.executeCommand('extension.migrateFileToV2');

    const out = editor.document.getText();

    // Headline tags: legacy [+TAG:...] moved to end-of-headline and normalized.
    assert.ok(/\* DONE .*:WORK:PROJ:\s*$/.test(out.split(/\r?\n/)[0]), 'Legacy inline tags should become end-of-headline tags');

    // Inline planning moved to planning line under the heading.
    // In Org-mode, SCHEDULED/DEADLINE use active timestamps (<...>).
      assert.ok(/\n\s{2,}SCHEDULED: <2025-01-02>/.test(out), 'SCHEDULED should be moved to an indented planning line');

    // COMPLETED converted to CLOSED (even when it was already on the planning line).
    assert.ok(!/\bCOMPLETED:\s*\[/.test(out), 'COMPLETED should not remain after migration');
    assert.ok(/\bCLOSED:\s*\[2nd January 2025, 9:42:00 am\]/.test(out), 'COMPLETED should migrate to CLOSED');

    // DEADLINE should be moved off the headline into planning line.
      assert.ok(/\n\s{2,}DEADLINE: <2025-02-03>/.test(out), 'DEADLINE should be moved to an indented planning line');

    // Hyphenated tags should not be dropped during migration.
    assert.ok(/^\* TODO .*:TEST_TAG:\s*$/m.test(out), 'Hyphenated legacy tags should become end-of-headline tags (normalized to underscores)');
  });

  test('Align Scheduled Tasks auto-aligns legacy inline SCHEDULED columns', async () => {
    const ext = vscode.extensions.getExtension('realDestroyer.org-vscode');
    assert.ok(ext, 'Extension realDestroyer.org-vscode not found in test host');
    await ext.activate();

    const input = [
      '* TODO Short  SCHEDULED: [2025-01-02]  DEADLINE: [2025-02-03]',
      '* TODO A much longer headline here  SCHEDULED: [2025-01-02]'
    ].join('\n');

    const doc = await vscode.workspace.openTextDocument({ language: 'vso', content: input });
    const editor = await vscode.window.showTextDocument(doc);

      await vscode.commands.executeCommand('extension.alignSchedules');

    const lines = editor.document.getText().split(/\r?\n/);
    const idx1 = lines[0].indexOf('SCHEDULED:');
    const idx2 = lines[1].indexOf('SCHEDULED:');
    assert.ok(idx1 > 0 && idx2 > 0, 'Both lines should contain SCHEDULED after alignment');
    assert.strictEqual(idx1, idx2, 'SCHEDULED should start at the same column on both lines');
  });

  test('Align Scheduled Tasks auto-aligns end-of-line tags when no inline SCHEDULED exists', async () => {
    const ext = vscode.extensions.getExtension('realDestroyer.org-vscode');
    assert.ok(ext, 'Extension realDestroyer.org-vscode not found in test host');
    await ext.activate();

    const input = [
      '* TODO Short :WORK:',
      '* TODO A much longer headline here :WORK:'
    ].join('\n');

    const doc = await vscode.workspace.openTextDocument({ language: 'vso', content: input });
    const editor = await vscode.window.showTextDocument(doc);

    await vscode.commands.executeCommand('extension.alignSchedules');

    const lines = editor.document.getText().split(/\r?\n/);
    const idx1 = lines[0].indexOf(':WORK:');
    const idx2 = lines[1].indexOf(':WORK:');
    assert.ok(idx1 > 0 && idx2 > 0, 'Both lines should contain an aligned tag block');
    assert.strictEqual(idx1, idx2, 'Tag blocks should start at the same column on both lines');
  });

  test('Align Scheduled Tasks never drops CLOSED on planning lines', async () => {
    const ext = vscode.extensions.getExtension('realDestroyer.org-vscode');
    assert.ok(ext, 'Extension realDestroyer.org-vscode not found in test host');
    await ext.activate();

    const input = [
      '* DONE Something important :TEST-TAG:',
      '  SCHEDULED: [2025-12-17]  DEADLINE: [2026-01-31]  CLOSED: [2025-12-28 Sun 10:49]'
    ].join('\n');

    const doc = await vscode.workspace.openTextDocument({ language: 'vso', content: input });
    const editor = await vscode.window.showTextDocument(doc);

    await vscode.commands.executeCommand('extension.alignSchedules');

    const out = editor.document.getText();
    assert.ok(/\bCLOSED:\s*\[2025-12-28 Sun 10:49\]/.test(out), 'CLOSED should remain on the planning line after alignment');
  });
});
