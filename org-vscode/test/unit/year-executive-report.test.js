const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

function withMockedVscode(run) {
  const Module = require('module');
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'vscode') return {};
    return originalLoad.apply(this, arguments);
  };

  try {
    return run();
  } finally {
    Module._load = originalLoad;
  }
}

module.exports = {
  name: 'unit/year-executive-report',
  run() {
    return withMockedVscode(async () => {
      const { generateExecutiveReportForFile } = require('../../out/yearExecutiveReport');

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'org-vscode-yir-'));
      const orgPath = path.join(tmpDir, '2026-Todo.org');

      const parsed = {
        year: 2026,
        days: [
          {
            line: '* [2026-01-01 Thu] Day',
            date: '2026-01-01',
            weekday: 'Thu',
            tasks: [
              {
                line: '* TODO Something',
                status: 'TODO',
                title: 'Something',
                tags: [],
                scheduled: null,
                deadline: null,
                closed: null,
                lineNumber: 1
              },
              {
                line: '* DONE Finished',
                status: 'DONE',
                title: 'Finished',
                tags: ['work'],
                scheduled: '2026-01-01 Thu',
                deadline: null,
                closed: '2026-01-01 Thu 10:00',
                lineNumber: 2
              }
            ]
          }
        ],
        aggregates: {
          totalTasks: 2,
          perStatus: { TODO: 1, DONE: 1 },
          perTag: { work: 1 },
          perMonth: { '2026-01': 2 },
          completedCount: 1
        },
        workflowMeta: {
          stampsClosedKeywords: ['DONE'],
          forwardKeywords: ['CONTINUED'],
          inProgressKeywords: ['IN_PROGRESS']
        }
      };

      const res = await generateExecutiveReportForFile(orgPath, parsed);
      assert.ok(res && res.reportDir, 'Expected reportDir in result');
      assert.ok(fs.existsSync(res.markdownPath), 'Expected markdown output file to exist');
      assert.ok(fs.existsSync(res.htmlPath), 'Expected html output file to exist');

      const htmlText = fs.readFileSync(res.htmlPath, 'utf8');
      assert.ok(htmlText.includes('<!doctype html>'), 'Expected HTML output to be a string document');
    });
  }
};
