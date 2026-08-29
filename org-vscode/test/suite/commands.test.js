const assert = require('assert');
const vscode = require('vscode');
const os = require('os');
const path = require('path');

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

  test('Export HTML writes a standalone document', async () => {
    const source = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: '* TODO Export example\n- [X] Finished item\n'
    });
    await vscode.window.showTextDocument(source);

    const destination = vscode.Uri.file(path.join(
      os.tmpdir(),
      `org-vscode-export-${Date.now()}-${Math.random().toString(16).slice(2)}.html`
    ));

    try {
      await vscode.commands.executeCommand('org-vscode.exportHtml', destination);
      const output = Buffer.from(await vscode.workspace.fs.readFile(destination)).toString('utf8');

      assert.ok(output.startsWith('<!DOCTYPE html>'));
      assert.ok(output.includes('Export example'));
      assert.ok(output.includes('<input type="checkbox" disabled checked>'));
      assert.ok(!output.includes('acquireVsCodeApi'));
    } finally {
      await vscode.workspace.fs.delete(destination, { useTrash: false }).then(undefined, () => undefined);
    }
  });

  test('.org_archive files use the Org language', async () => {
    const archiveUri = vscode.Uri.file(path.join(
      os.tmpdir(),
      `org-vscode-archive-${Date.now()}-${Math.random().toString(16).slice(2)}.org_archive`
    ));

    try {
      await vscode.workspace.fs.writeFile(archiveUri, Buffer.from('* DONE Archived example\n', 'utf8'));
      const document = await vscode.workspace.openTextDocument(archiveUri);
      assert.strictEqual(document.languageId, 'vso');
    } finally {
      await vscode.workspace.fs.delete(archiveUri, { useTrash: false }).then(undefined, () => undefined);
    }
  });

  test('Priority commands cycle selected Org headings and preserve other lines', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: '* TODO Task :work:\n* Project heading\nBody [#A]\n'
    });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(3, 0));

    await vscode.commands.executeCommand('org-vscode.cyclePriority');
    assert.strictEqual(document.getText(), '* TODO [#A] Task :work:\n* [#A] Project heading\nBody [#A]\n');

    await vscode.commands.executeCommand('org-vscode.cyclePriorityBackward');
    assert.strictEqual(document.getText(), '* TODO Task :work:\n* Project heading\nBody [#A]\n');
  });

  test('Insert heading link creates a target ID and inserts the link', async () => {
    const targetUri = vscode.Uri.file(path.join(
      os.tmpdir(),
      `org-vscode-link-target-${Date.now()}-${Math.random().toString(16).slice(2)}.org`
    ));

    try {
      await vscode.workspace.fs.writeFile(targetUri, Buffer.from('* TODO Synthetic target\nTarget body\n', 'utf8'));
      const source = await vscode.workspace.openTextDocument({ language: 'vso', content: 'See: ' });
      const editor = await vscode.window.showTextDocument(source);
      editor.selection = new vscode.Selection(new vscode.Position(0, 5), new vscode.Position(0, 5));

      await vscode.commands.executeCommand('org-vscode.insertHeadingLink', { uri: targetUri, line: 0 });

      const targetText = Buffer.from(await vscode.workspace.fs.readFile(targetUri)).toString('utf8');
      const id = targetText.match(/^\s*:ID:\s*(\S+)\s*$/m)?.[1];
      assert.ok(id, 'Selected target should receive an ID property');
      assert.strictEqual(editor.document.getText(), `See: [[id:${id}][Synthetic target]]`);
    } finally {
      await vscode.workspace.fs.delete(targetUri, { useTrash: false }).then(undefined, () => undefined);
    }
  });

  test('Insert heading link preserves the insertion point in the target document', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: '* TODO Local target\nBody\n\nRelated: '
    });
    const editor = await vscode.window.showTextDocument(document);
    const insertion = new vscode.Position(3, 'Related: '.length);
    editor.selection = new vscode.Selection(insertion, insertion);

    await vscode.commands.executeCommand('org-vscode.insertHeadingLink', { uri: document.uri, line: 0 });

    const output = editor.document.getText();
    const id = output.match(/^\s*:ID:\s*(\S+)\s*$/m)?.[1];
    assert.ok(id, 'Local target should receive an ID property');
    assert.ok(output.endsWith(`Related: [[id:${id}][Local target]]`));
  });

  test('Promote subtree adjusts every nested heading and preserves body content', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: '* Parent\n** Moving\nbody\n*** Child\n* Sibling\n'
    });
    const editor = await vscode.window.showTextDocument(document);
    const cursor = new vscode.Position(2, 2);
    editor.selection = new vscode.Selection(cursor, cursor);

    await vscode.commands.executeCommand('org-vscode.promoteSubtree');

    assert.strictEqual(editor.document.getText(), '* Parent\n* Moving\nbody\n** Child\n* Sibling\n');
  });

  test('Refile subtree within one document adjusts target indexes safely', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: '* Moving\n** Child\n* Destination\n** Existing\n'
    });
    const editor = await vscode.window.showTextDocument(document);
    const cursor = new vscode.Position(0, 0);
    editor.selection = new vscode.Selection(cursor, cursor);

    await vscode.commands.executeCommand('org-vscode.refileSubtree', { uri: document.uri, line: 2 });

    assert.strictEqual(
      editor.document.getText(),
      '* Destination\n** Existing\n** Moving\n*** Child\n'
    );
  });

  test('Refile subtree updates source and destination documents together', async () => {
    const targetUri = vscode.Uri.file(path.join(
      os.tmpdir(),
      `org-vscode-refile-target-${Date.now()}-${Math.random().toString(16).slice(2)}.org`
    ));

    try {
      await vscode.workspace.fs.writeFile(targetUri, Buffer.from('* Destination\n** Existing\n', 'utf8'));
      const source = await vscode.workspace.openTextDocument({
        language: 'vso',
        content: '* Moving\nbody\n** Child\n* Remains\n'
      });
      const editor = await vscode.window.showTextDocument(source);
      const cursor = new vscode.Position(1, 0);
      editor.selection = new vscode.Selection(cursor, cursor);

      await vscode.commands.executeCommand('org-vscode.refileSubtree', { uri: targetUri, line: 0 });

      const target = await vscode.workspace.openTextDocument(targetUri);
      assert.strictEqual(source.getText(), '* Remains\n');
      assert.strictEqual(target.getText(), '* Destination\n** Existing\n** Moving\nbody\n*** Child\n');
    } finally {
      await vscode.workspace.fs.delete(targetUri, { useTrash: false }).then(undefined, () => undefined);
    }
  });

  test('Visibility commands cycle heading state without changing document text', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: '* Parent\nbody\n** Child\nchild body\n*** Grandchild\n'
    });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));
    const original = document.getText();

    assert.strictEqual(await vscode.commands.executeCommand('org-vscode.cycleVisibility'), 'folded');
    assert.strictEqual(await vscode.commands.executeCommand('org-vscode.cycleVisibility'), 'children');
    assert.strictEqual(await vscode.commands.executeCommand('org-vscode.cycleVisibility'), 'subtree');
    assert.strictEqual(await vscode.commands.executeCommand('org-vscode.cycleGlobalVisibility'), 'folded');
    assert.strictEqual(await vscode.commands.executeCommand('org-vscode.cycleGlobalVisibility'), 'children');
    assert.strictEqual(await vscode.commands.executeCommand('org-vscode.cycleGlobalVisibility'), 'subtree');
    assert.strictEqual(document.getText(), original);
  });

  test('Context action toggles checkboxes and aligns tables', async () => {
    const checkboxDocument = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: '- [ ] Context checkbox\n'
    });
    let editor = await vscode.window.showTextDocument(checkboxDocument);
    editor.selection = new vscode.Selection(new vscode.Position(0, 3), new vscode.Position(0, 3));
    assert.strictEqual(await vscode.commands.executeCommand('org-vscode.contextAction'), 'checkbox');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.ok(checkboxDocument.lineAt(0).text.startsWith('- [X]'));

    const tableDocument = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: '| A|Long |\n|x| y|\n'
    });
    editor = await vscode.window.showTextDocument(tableDocument);
    editor.selection = new vscode.Selection(new vscode.Position(0, 2), new vscode.Position(0, 2));
    assert.strictEqual(await vscode.commands.executeCommand('org-vscode.contextAction'), 'table');
    assert.strictEqual(tableDocument.lineAt(0).text, '| A | Long |');
    assert.strictEqual(tableDocument.lineAt(1).text, '| x | y    |');
  });

  test('Insert Structure at End places a sibling after the complete subtree', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: '* Parent\nbody\n** Child\nchild body\n* Existing\n'
    });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 0));

    await vscode.commands.executeCommand('org-vscode.insertStructureAtEnd');

    assert.strictEqual(document.lineAt(4).text, '* ');
    assert.strictEqual(document.lineAt(5).text, '* Existing');
  });

  test('Meta-Return splits a heading at the cursor without skipping its subtree', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: '* First second\n** Existing child\n'
    });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(new vscode.Position(0, 7), new vscode.Position(0, 7));

    await vscode.commands.executeCommand('org-vscode.insertNewElement');

    assert.strictEqual(document.lineAt(0).text, '* First');
    assert.strictEqual(document.lineAt(1).text, '* second');
    assert.strictEqual(document.lineAt(2).text, '** Existing child');
  });

  test('Heading CodeLens is opt-in and uses configured actions', async () => {
    const uri = vscode.Uri.file(path.join(os.tmpdir(), `org-vscode-codelens-${Date.now()}.org`));
    const config = vscode.workspace.getConfiguration('Org-vscode');
    const previousEnabled = config.get('headingCodeLens.enabled');
    const previousActions = config.get('headingCodeLens.actions');
    await vscode.workspace.fs.writeFile(uri, Buffer.from('* TODO First\nbody\n* TODO Second\n'));
    try {
      await config.update('headingCodeLens.enabled', true, vscode.ConfigurationTarget.Global);
      await config.update('headingCodeLens.actions', ['status', 'property'], vscode.ConfigurationTarget.Global);
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document);
      const lenses = await vscode.commands.executeCommand('vscode.executeCodeLensProvider', uri);
      assert.strictEqual(lenses.length, 4);
      assert.deepStrictEqual(lenses.map((lens) => lens.command.arguments[0].action), ['status', 'property', 'status', 'property']);
      const stale = lenses[0].command.arguments[0];
      await editor.edit((editBuilder) => editBuilder.insert(new vscode.Position(0, 0), 'changed '));
      assert.strictEqual(await vscode.commands.executeCommand('org-vscode.runHeadingAction', stale), false);
    } finally {
      await config.update('headingCodeLens.actions', previousActions, vscode.ConfigurationTarget.Global);
      await config.update('headingCodeLens.enabled', previousEnabled, vscode.ConfigurationTarget.Global);
      await vscode.workspace.fs.delete(uri, { useTrash: false }).then(undefined, () => undefined);
    }
  });

  test('Context action repairs the weekday of the exact timestamp under the cursor', async () => {
    const document = await vscode.workspace.openTextDocument({
      language: 'vso',
      content: 'DEADLINE: <2026-08-29 Mon> CLOSED: [2026-08-27 Thu]\n'
    });
    const editor = await vscode.window.showTextDocument(document);
    editor.selection = new vscode.Selection(new vscode.Position(0, 14), new vscode.Position(0, 14));

    assert.strictEqual(await vscode.commands.executeCommand('org-vscode.contextAction'), 'timestamp');
    assert.strictEqual(document.lineAt(0).text, 'DEADLINE: <2026-08-29 Sat> CLOSED: [2026-08-27 Thu]');
  });

  test('Context action honors a configured non-ISO date format', async () => {
    const config = vscode.workspace.getConfiguration('Org-vscode');
    const previousDateFormat = config.get('dateFormat');
    await config.update('dateFormat', 'DD-MM-YYYY', vscode.ConfigurationTarget.Global);
    try {
      const document = await vscode.workspace.openTextDocument({ language: 'vso', content: '<29-08-2026 Mon>\n' });
      const editor = await vscode.window.showTextDocument(document);
      editor.selection = new vscode.Selection(new vscode.Position(0, 5), new vscode.Position(0, 5));

      assert.strictEqual(await vscode.commands.executeCommand('org-vscode.contextAction'), 'timestamp');
      assert.strictEqual(document.lineAt(0).text, '<29-08-2026 Sat>');
    } finally {
      await config.update('dateFormat', previousDateFormat, vscode.ConfigurationTarget.Global);
    }
  });

  test('File search links reveal headings in another Org file', async () => {
    const targetUri = vscode.Uri.file(path.join(
      os.tmpdir(),
      `org-vscode-file-link-${Date.now()}-${Math.random().toString(16).slice(2)}.org_archive`
    ));
    const sourceUri = vscode.Uri.file(path.join(
      os.tmpdir(),
      `org-vscode-file-link-source-${Date.now()}-${Math.random().toString(16).slice(2)}.org`
    ));

    try {
      await vscode.workspace.fs.writeFile(targetUri, Buffer.from('* TODO Destination heading\nBody\n', 'utf8'));
      const sourceContent = `* Source\n[[file:${path.basename(targetUri.fsPath)}::*Destination heading]]\n`;
      await vscode.workspace.fs.writeFile(sourceUri, Buffer.from(sourceContent, 'utf8'));
      const source = await vscode.workspace.openTextDocument(sourceUri);
      await vscode.window.showTextDocument(source);

      const links = await vscode.commands.executeCommand('vscode.executeLinkProvider', sourceUri);
      assert.ok(
        links.some((link) => link.target?.scheme === 'command' && link.target.toString().includes('followOrgLink')),
        'File search suffix should resolve through the Org link navigation command'
      );

      await vscode.commands.executeCommand('org-vscode.followOrgLink', {
        type: 'file-search',
        file: `file:${path.basename(targetUri.fsPath)}`,
        search: '*Destination heading'
      });

      assert.strictEqual(vscode.window.activeTextEditor.document.uri.toString(), targetUri.toString());
      assert.strictEqual(vscode.window.activeTextEditor.selection.active.line, 0);
    } finally {
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
      await vscode.workspace.fs.delete(targetUri, { useTrash: false }).then(undefined, () => undefined);
      await vscode.workspace.fs.delete(sourceUri, { useTrash: false }).then(undefined, () => undefined);
    }
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

  test('Column View command opens and reuses webview panel', async () => {
    const ext = vscode.extensions.getExtension('realDestroyer.org-vscode');
    assert.ok(ext, 'Extension realDestroyer.org-vscode not found in test host');
    await ext.activate();

    const countColumnViewTabs = () => {
      const groups = (vscode.window.tabGroups && vscode.window.tabGroups.all) || [];
      const tabs = groups.flatMap((g) => g.tabs || []);
      return tabs.filter((t) => String(t.label || '').includes('Column View')).length;
    };

    const before = countColumnViewTabs();

    await vscode.commands.executeCommand('extension.openColumnView');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const afterFirstOpen = countColumnViewTabs();

    assert.ok(
      afterFirstOpen >= Math.max(1, before),
      'Column View panel should be visible after first command execution'
    );

    await vscode.commands.executeCommand('extension.openColumnView');
    await new Promise((resolve) => setTimeout(resolve, 250));
    const afterSecondOpen = countColumnViewTabs();

    assert.strictEqual(
      afterSecondOpen,
      afterFirstOpen,
      'Second execution should reuse the existing Column View panel'
    );

    await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  });
});
