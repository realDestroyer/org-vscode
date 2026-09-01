const assert = require('assert');
const path = require('path');

function withMockedVscode(run) {
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function (request) {
    if (request === 'vscode') {
      return {
        workspace: {
          getConfiguration() { return { get() { return undefined; } }; },
          onDidChangeConfiguration() { return { dispose() {} }; }
        },
        window: {},
        commands: {}
      };
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    return run();
  } finally {
    Module._load = originalLoad;
  }
}

module.exports = {
  name: 'unit/year-summary-formats',
  run() {
    return withMockedVscode(() => {
      const { parseOrgContent, toDateKey } = require(path.join(__dirname, '..', '..', 'out', 'yearSummary.js'));

      assert.strictEqual(toDateKey('<2026-01-13 Tue 15:00>'), '2026-01-13', 'Weekday/time suffixes should not defeat parsing');
      assert.strictEqual(toDateKey('01-02-2025'), '2025-01-02', 'Day-heading order should normalize');
      assert.strictEqual(toDateKey('2nd January 2025, 9:42:00 am'), '2025-01-02', 'Prose CLOSED stamps should normalize');
      assert.strictEqual(toDateKey('not a date'), '', 'Unparsable values return empty');

      // New format: no day headings, planning lives on the child line.
      const modern = [
        '#+TITLE: 2026 Org File',
        '* DONE Meet with DLA to discuss OT-SDN                                 :SDN:DOD:',
        '  SCHEDULED: <2026-03-27>  DEADLINE: <2026-03-27>  CLOSED: [2026-04-06 Mon 08:13]',
        '  :LOGBOOK:',
        '  - State "DONE" from "IN_PROGRESS" [2026-04-06 Mon 08:13]',
        '  :END:',
        '** DONE Write the summary document',
        '   SCHEDULED: <2026-03-27>  CLOSED: [2026-04-06 Mon 08:16]',
        '* IN_PROGRESS Upgrade DNAC                                             :DNAC:',
        '  SCHEDULED: <2026-01-13 Tue 15:00>',
        '* DONE Task closed without a schedule',
        '  CLOSED: [2026-05-04 Mon 07:31]',
        '* TODO Task with no dates at all'
      ].join('\n');

      const parsedModern = parseOrgContent(modern);
      assert.strictEqual(parsedModern.year, 2026, 'Year comes from #+TITLE');
      assert.ok(parsedModern.days.length > 0, 'Modern files must produce day buckets');
      assert.ok(parsedModern.days.every(day => day.synthetic), 'All buckets are synthetic when no day headings exist');
      assert.strictEqual(parsedModern.aggregates.totalTasks, 5, 'Every heading is captured without a day heading');

      const byDate = new Map(parsedModern.days.map(day => [day.date || 'undated', day]));
      assert.ok(byDate.has('2026-03-27'), 'SCHEDULED drives the bucket date');
      assert.strictEqual(byDate.get('2026-03-27').tasks.length, 2, 'Parent and child tasks share the scheduled bucket');
      assert.strictEqual(byDate.get('2026-03-27').weekday, 'Fri', 'Synthetic buckets carry a weekday');
      assert.ok(byDate.has('2026-01-13'), 'Weekday/time suffixed timestamps still bucket correctly');
      assert.ok(byDate.has('2026-05-04'), 'CLOSED is used when SCHEDULED is absent');
      assert.ok(byDate.has('undated'), 'Tasks with no dates are retained');
      assert.strictEqual(byDate.get('undated').tasks[0].title, 'Task with no dates at all');

      const modernTask = byDate.get('2026-03-27').tasks[0];
      assert.deepStrictEqual(modernTask.tags, ['SDN', 'DOD']);
      assert.strictEqual(modernTask.title, 'Meet with DLA to discuss OT-SDN');
      assert.strictEqual(modernTask.completed, '2026-04-06 Mon 08:13');

      assert.strictEqual(parsedModern.aggregates.perMonth['2026-03'], 2, 'Scheduled tasks bucket by month');
      assert.strictEqual(parsedModern.aggregates.perMonth['2026-01'], 1, 'Suffixed timestamps are not dropped as unscheduled');
      assert.strictEqual(parsedModern.aggregates.perMonth['2026-05'], 1, 'CLOSED-only tasks bucket by their day');
      assert.strictEqual(parsedModern.aggregates.perMonth.unscheduled, 1, 'Undated tasks stay unscheduled');

      // Legacy format: day headings own their tasks.
      const legacy = [
        '#+TITLE: 2025 Org File',
        '* [01-02-2025 Thu] ----------------------------------------',
        ' * DONE Fix ACI contracts                                   :ACI:',
        '      SCHEDULED: [01-02-2025]  CLOSED: [2nd January 2025, 9:42:00 am]',
        ' * CONTINUED DNAC Templating',
        '* [01-03-2025 Fri] ----------------------------------------',
        ' * DONE NetTeam Training'
      ].join('\n');

      const parsedLegacy = parseOrgContent(legacy);
      assert.strictEqual(parsedLegacy.year, 2025);
      assert.strictEqual(parsedLegacy.days.length, 2, 'Day headings define the buckets');
      assert.ok(parsedLegacy.days.every(day => !day.synthetic), 'Day headings are never synthetic');
      assert.strictEqual(parsedLegacy.days[0].date, '01-02-2025', 'Original heading date text is preserved');
      assert.strictEqual(parsedLegacy.days[0].weekday, 'Thu');
      assert.strictEqual(parsedLegacy.days[0].tasks.length, 2);
      assert.strictEqual(parsedLegacy.days[1].tasks.length, 1);
      assert.strictEqual(parsedLegacy.aggregates.perMonth['2025-01'], 3, 'Legacy months bucket from heading dates');

      // Mixed file: headings adopt following tasks, leading tasks fall back to their own dates.
      const mixed = [
        '#+TITLE: 2026 Org File',
        '* DONE Orphan task before any day heading',
        '  SCHEDULED: <2026-02-10>',
        '* [02-11-2026 Wed] ----------------------------------------',
        ' * DONE Task under a day heading'
      ].join('\n');

      const parsedMixed = parseOrgContent(mixed);
      assert.strictEqual(parsedMixed.aggregates.totalTasks, 2, 'Both layouts contribute tasks');
      const synthetic = parsedMixed.days.filter(day => day.synthetic);
      const headings = parsedMixed.days.filter(day => !day.synthetic);
      assert.strictEqual(synthetic.length, 1, 'Orphan task gets a synthetic bucket');
      assert.strictEqual(synthetic[0].date, '2026-02-10');
      assert.strictEqual(headings.length, 1, 'Day heading keeps owning its own tasks');
      assert.strictEqual(headings[0].tasks.length, 1);
    });
  }
};
