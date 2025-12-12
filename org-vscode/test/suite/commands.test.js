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
});
