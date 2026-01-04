const assert = require('assert');
const Module = require('module');
const path = require('path');

function createVscodeMock(dateFormat) {
  const disposable = () => ({ dispose() {} });

  return {
    workspace: {
      onDidChangeConfiguration: () => disposable(),
      getConfiguration: () => ({
        get: (key, fallback) => {
          if (key === 'dateFormat') return dateFormat;
          return fallback;
        }
      })
    },
    window: {
      showInformationMessage: () => Promise.resolve(undefined),
      showErrorMessage: () => Promise.resolve(undefined)
    }
  };
}

function withMockedVscode(dateFormat, run) {
  const vscodeMock = createVscodeMock(dateFormat);
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

function testReportParsingHonorsConfiguredDateFormat() {
  // test/unit -> test -> <extension root>
  const extensionRoot = path.resolve(__dirname, '..', '..');
  const yearSummaryPath = path.join(extensionRoot, 'out', 'yearSummary.js');
  const yearReportBuilderPath = path.join(extensionRoot, 'out', 'yearReportBuilder.js');

  return withMockedVscode('DD-MM-YYYY', () => {
    delete require.cache[require.resolve(yearSummaryPath)];
    delete require.cache[require.resolve(yearReportBuilderPath)];

    const { parseOrgContent } = require(yearSummaryPath);
    const { buildDashboardModel } = require(yearReportBuilderPath);

    const org = [
      '* [31-01-2026 Sat]',
      '** TODO First task :TAG:',
      '   SCHEDULED: [31-01-2026]',
      '* [01-02-2026 Sun]',
      '** DONE Second task :TAG:',
      '   SCHEDULED: [01-02-2026]',
      ''
    ].join('\n');

    const parsed = parseOrgContent(org);
    assert.strictEqual(parsed.year, 2026, 'deriveYear should parse DD-MM-YYYY dates');

    const perMonth = parsed.aggregates && parsed.aggregates.perMonth ? parsed.aggregates.perMonth : {};
    assert.ok(perMonth['2026-01'] >= 1, 'January bucket should exist for DD-MM-YYYY');
    assert.ok(perMonth['2026-02'] >= 1, 'February bucket should exist for DD-MM-YYYY');

    const dashboard = buildDashboardModel('fake.org', parsed);
    assert.ok(Array.isArray(dashboard.taskFeed), 'dashboard.taskFeed should exist');
    assert.ok(dashboard.taskFeed.length >= 1, 'dashboard.taskFeed should include tasks');
    assert.ok(
      dashboard.taskFeed.some((t) => t.monthKey === '2026-01' || t.monthKey === '2026-02'),
      'Tasks should be bucketed into real months, not unscheduled'
    );
  });
}

module.exports = {
  name: 'unit/date-format',
  run: testReportParsingHonorsConfiguredDateFormat
};
