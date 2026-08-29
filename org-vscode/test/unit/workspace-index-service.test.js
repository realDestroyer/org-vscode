const assert = require('assert');
const path = require('path');
const Module = require('module');

function uri(value) {
  return {
    path: value,
    fsPath: value,
    toString() { return `file://${value}`; }
  };
}

async function run() {
  const root = uri('/workspace');
  const files = [
    uri('/workspace/notes.org'),
    uri('/workspace/archive.org_archive'),
    uri('/workspace/.hidden.org'),
    uri('/workspace/CurrentTasks.org')
  ];
  const contents = new Map([
    ['/workspace/notes.org', '* TODO Visible :WORK:'],
    ['/workspace/archive.org_archive', '* DONE Archived'],
    ['/workspace/.hidden.org', '* TODO Hidden'],
    ['/workspace/CurrentTasks.org', '* TODO Generated']
  ]);
  const settings = { enabled: true, persistence: false, includeArchives: false };
  const deleted = [];
  let configurationListener = null;
  const disposable = () => ({ dispose() {} });
  const vscodeMock = {
    Uri: {
      joinPath(base, ...parts) { return uri(`${base.path}/${parts.join('/')}`.replace(/\/+/g, '/')); }
    },
    workspace: {
      workspaceFolders: [{ name: 'workspace', uri: root }],
      getConfiguration: () => ({
        get(key, fallback) {
          if (key === 'workspaceIndex.enabled') return settings.enabled;
          if (key === 'workspaceIndex.persistence') return settings.persistence;
          if (key === 'workspaceIndex.includeArchives') return settings.includeArchives;
          return fallback;
        }
      }),
      findFiles: async () => files,
      asRelativePath: (file) => file.path.slice('/workspace/'.length),
      getWorkspaceFolder: (candidate) => candidate.path.startsWith('/workspace/') ? { name: 'workspace', uri: root } : undefined,
      fs: {
        readFile: async (file) => Buffer.from(contents.get(file.path) || '', 'utf8'),
        delete: async (file) => { deleted.push(file.path); }
      },
      onDidChangeConfiguration: (listener) => {
        configurationListener = listener;
        return disposable();
      },
      onDidChangeWorkspaceFolders: () => disposable()
    }
  };

  const originalLoad = Module._load;
  const modulePath = path.join(__dirname, '..', '..', 'out', 'workspaceIndex.js');
  delete require.cache[require.resolve(modulePath)];
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return vscodeMock;
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createWorkspaceIndexService } = require(modulePath);
    const service = createWorkspaceIndexService({ subscriptions: [], globalStorageUri: uri('/global') });
    await service.rebuild();
    assert.deepStrictEqual(service.records.map((item) => item.path), ['notes.org']);
    assert.match(service.records[0].uri, /^workspace:[a-f0-9]{12}\/notes\.org$/);

    settings.includeArchives = true;
    await service.rebuild();
    assert.deepStrictEqual(service.records.map((item) => item.path), ['notes.org', 'archive.org_archive']);
    assert.strictEqual(service.records[1].archived, true);

    const notesRecord = service.records.find((item) => item.path === 'notes.org');
    assert.strictEqual(service.resolveRecordUri({ ...notesRecord, line: -1 }), null);
    assert.strictEqual(service.resolveRecordUri(notesRecord).path, '/workspace/notes.org');

    vscodeMock.workspace.workspaceFolders = [
      { name: 'first', uri: uri('/first') },
      { name: 'second', uri: uri('/second') }
    ];
    vscodeMock.workspace.getWorkspaceFolder = (candidate) => {
      if (candidate.path.startsWith('/first/')) return vscodeMock.workspace.workspaceFolders[0];
      if (candidate.path.startsWith('/second/')) return vscodeMock.workspace.workspaceFolders[1];
      return undefined;
    };
    const { workspaceRootId } = require(modulePath);
    assert.strictEqual(service.resolveRecordUri({
      path: 'second/notes.org',
      uri: `workspace:${workspaceRootId(vscodeMock.workspace.workspaceFolders[1])}/notes.org`,
      line: 0
    }).path, '/second/notes.org');
    assert.strictEqual(service.resolveRecordUri({ path: 'unknown/notes.org', uri: 'workspace:000000000000/notes.org', line: 0 }), null);

    settings.enabled = false;
    configurationListener({ affectsConfiguration: (section) => section === 'Org-vscode.workspaceIndex' });
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual(service.records, []);
    assert.ok(deleted.some((item) => item.endsWith('/workspace-index-v1.json')));
    assert.ok(deleted.some((item) => /workspace-index-v1-[a-f0-9]{16}\.json$/.test(item)));
    service.dispose();
  } finally {
    Module._load = originalLoad;
    delete require.cache[require.resolve(modulePath)];
  }
}

module.exports = { name: 'unit/workspace-index-service', run };