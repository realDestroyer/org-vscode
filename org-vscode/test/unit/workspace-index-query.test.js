const assert = require('assert');
const path = require('path');

const core = require(path.join(__dirname, '..', '..', 'out', 'workspaceIndexCore.js'));
const { MAX_QUERY_LENGTH, parseQuery, runQuery, validatePerspectives } = require(path.join(__dirname, '..', '..', 'out', 'orgQuery.js'));

function record(overrides = {}) {
  return {
    path: 'notes/tasks.org', uri: 'file:///workspace/notes/tasks.org', line: 0, level: 1,
    title: 'Example', status: 'TODO', tags: ['WORK'], scheduled: null,
    deadline: null, closed: null, archived: false, ...overrides
  };
}

function run() {
  const updated = '2026-08-28T00:00:00.000Z';
  const records = core.buildRecordsFromLines([
    '* TODO Build index :work:query:',
    '  SCHEDULED: <2026-09-01 Tue> DEADLINE: <2026-09-03 Thu>',
    '  Body text must remain private',
    '  :PROPERTIES:',
    '  :SECRET: not indexed',
    '  :END:',
    '** DONE Child task',
    '  CLOSED: [2026-08-27 Thu]'
  ], { path: 'notes/tasks.org', uri: 'file:///workspace/notes/tasks.org' }, { updated, archived: true });

  assert.strictEqual(records.length, 2);
  assert.deepStrictEqual(records[0], record({
    title: 'Build index', tags: ['WORK', 'QUERY'], scheduled: '2026-09-01',
    deadline: '2026-09-03', archived: true, updated
  }));
  assert.strictEqual(records[1].line, 6);
  assert.strictEqual(records[1].level, 2);
  assert.strictEqual(records[1].status, 'DONE');
  assert.strictEqual(records[1].closed, '2026-08-27');
  assert.ok(!JSON.stringify(records).includes('SECRET'));
  assert.ok(!JSON.stringify(records).includes('Body text'));

  const json = core.serializeSnapshot(records, { updated });
  assert.deepStrictEqual(core.parseSnapshotJson(json).records, records);
  assert.strictEqual(core.parseSnapshotJson('{"version":2,"records":[]}'), null);
  assert.strictEqual(core.parseSnapshotJson('{"version":1,"records":[{"title":"bad"}]}'), null);
  assert.strictEqual(core.normalizeSnapshot({ version: 1, records: [record({ body: 'must not persist' })] }), null);
  assert.strictEqual(core.parseSnapshotJson('not json'), null);

  const invalid = parseQuery('unknown: value\narchived: maybe\ndeadline-before: 2026-02-30\nno colon');
  assert.strictEqual(invalid.errors.length, 4);
  assert.strictEqual(parseQuery('limit: 9999', { maxResults: 500 }).query.limit, 500);
  assert.ok(parseQuery(`text: ${'x'.repeat(MAX_QUERY_LENGTH)}`).errors.length);
  assert.strictEqual(validatePerspectives([{ name: 'Due', query: 'status: TODO' }]).errors.length, 0);
  assert.ok(validatePerspectives([{ name: '', query: '' }]).errors.length);

  const queryRecords = [
    record({ path: 'z.org', line: 3, title: 'Literal .* <script>', tags: ['WORK'], scheduled: '2026-09-02' }),
    record({ path: 'a.org', line: 2, title: 'Literal .* <script>', tags: ['work'], scheduled: '2026-09-01' }),
    record({ path: 'archive.org_archive', title: 'Archived', archived: true }),
    record({ path: 'a.org', line: 1, title: 'Other', status: 'DONE', deadline: '2026-09-01' })
  ];
  const queried = runQuery(queryRecords, 'text: .* <SCRIPT>\nstatus: todo\ntag: WoRk\narchived: false\nlimit: 50');
  assert.deepStrictEqual(queried.results.map((item) => item.path), ['a.org', 'z.org']);
  assert.strictEqual(runQuery([record({ tags: ['WORK_TAG'] })], 'tag: work-tag').results.length, 1);
  assert.deepStrictEqual(runQuery(queryRecords, 'deadline-before: 2026-09-02').results.map((item) => item.title), ['Other']);
  assert.strictEqual(runQuery(queryRecords, 'text: [a-z]+').results.length, 0, 'regex-like text must be literal');
  assert.strictEqual(runQuery(queryRecords, 'text: <script>').results.length, 2, 'HTML-like text must be literal');

  const many = Array.from({ length: 10000 }, (_, line) => record({ line, title: `Task ${line}` }));
  const started = Date.now();
  assert.strictEqual(runQuery(many, 'status: TODO\nlimit: 1000', { maxResults: 500 }).results.length, 500);
  assert.ok(Date.now() - started < 2000, '10k record query should complete within two seconds');
}

module.exports = { name: 'unit/workspace-index-query', run };