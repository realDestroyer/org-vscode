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

const SAMPLE = [
  '#+TITLE: 2026 Org File',
  '* DONE [#A] Ship the thing                                     :ALPHA:BETA:',
  '  SCHEDULED: <2026-01-05>  DEADLINE: <2026-01-10>  CLOSED: [2026-01-08 Thu 09:00]',
  '  :PROPERTIES:',
  '  :ID: abc-123',
  '  :END:',
  '  :LOGBOOK:',
  '  - State "DONE" from "IN_PROGRESS" [2026-01-08 Thu 09:00]',
  '  - State "IN_PROGRESS" from "TODO" [2026-01-05 Mon 08:00]',
  '  :END:',
  '  CLOCK: [2026-01-05 Mon 09:00]--[2026-01-05 Mon 11:30] => 2:30',
  '  A plain note that should survive.',
  '** DONE Sub one',
  '   CLOSED: [2026-01-06 Tue 10:00]',
  '** TODO Sub two',
  '* DONE Late delivery                                           :ALPHA:',
  '  SCHEDULED: <2026-02-01>  DEADLINE: <2026-02-05>  CLOSED: [2026-02-12 Thu 09:00]',
  '* CONTINUED Recurring chore                                    :CHORE:',
  '  SCHEDULED: <2026-03-02>',
  '* CONTINUED Recurring chore                                    :CHORE:',
  '  SCHEDULED: <2026-03-03>',
  '* TODO No dates at all'
].join('\n');

module.exports = {
  name: 'unit/year-metrics',
  run() {
    return withMockedVscode(() => {
      const { parseOrgContent } = require(path.join(__dirname, '..', '..', 'out', 'yearSummary.js'));
      const parsed = parseOrgContent(SAMPLE);
      const metrics = parsed.metrics;

      assert.ok(metrics, 'parseOrgContent should attach metrics');

      // --- Parser enrichment -------------------------------------------------
      const all = parsed.days.flatMap(day => day.tasks);
      const ship = all.find(task => task.title.includes('Ship the thing'));
      assert.ok(ship, 'Parent task should be parsed');
      assert.strictEqual(ship.priority, 'A', 'Priority cookie is captured');
      assert.strictEqual(ship.clockMinutes, 150, 'CLOCK ranges accumulate minutes');
      assert.strictEqual(ship.stateChanges.length, 2, 'LOGBOOK state changes are structured');
      assert.strictEqual(ship.stateChanges[0].to, 'DONE');
      assert.strictEqual(ship.stateChanges[0].from, 'IN_PROGRESS');
      assert.strictEqual(ship.childCount, 2, 'Star-nested children are counted');
      assert.ok(
        ship.notes.every(note => !note.includes(':ID:') && !note.startsWith('- State')),
        'Drawer contents stay out of notes'
      );
      assert.ok(ship.notes.includes('A plain note that should survive.'), 'Real notes are preserved');

      const subOne = all.find(task => task.title === 'Sub one');
      assert.strictEqual(subOne.level, 2, 'Star depth is recorded');
      assert.strictEqual(subOne.parentLine, ship.lineNumber, 'Children link to their parent');

      // --- Clock -------------------------------------------------------------
      assert.strictEqual(metrics.clock.totalMinutes, 150);
      assert.strictEqual(metrics.clock.totalHours, 2.5);
      assert.strictEqual(metrics.clock.trackedTasks, 1);
      assert.strictEqual(metrics.clock.perTag.find(entry => entry.key === 'ALPHA').hours, 2.5);

      // --- Deadlines ---------------------------------------------------------
      assert.strictEqual(metrics.deadlines.tracked, 2);
      assert.strictEqual(metrics.deadlines.resolved, 2);
      assert.strictEqual(metrics.deadlines.onTime, 1, 'Closed on/before deadline counts as on time');
      assert.strictEqual(metrics.deadlines.late, 1);
      assert.strictEqual(metrics.deadlines.onTimeRate, 50);
      assert.strictEqual(metrics.deadlines.averageDaysLate, 7);
      assert.strictEqual(metrics.deadlines.worstMisses[0].title, 'Late delivery');
      assert.strictEqual(metrics.deadlines.worstMisses[0].daysLate, 7);

      // --- Cycle time --------------------------------------------------------
      assert.strictEqual(metrics.cycleTimes.scheduledToClosed.count, 2);
      assert.strictEqual(metrics.cycleTimes.scheduledToClosed.averageDays, 7, '(3 + 11) / 2');
      assert.strictEqual(metrics.cycleTimes.longest[0].days, 11);
      assert.strictEqual(metrics.cycleTimes.logbookSpan.count, 1, 'Newest-first LOGBOOK still yields a span');
      assert.strictEqual(metrics.cycleTimes.logbookSpan.averageDays, 3);

      // --- Carryover ---------------------------------------------------------
      assert.strictEqual(metrics.carryover.forwardedTasks, 2);
      assert.strictEqual(metrics.carryover.uniqueChains, 1, 'Repeated titles collapse into one chain');
      assert.strictEqual(metrics.carryover.topChains[0].forwards, 2);
      assert.strictEqual(metrics.carryover.topChains[0].firstSeen, '2026-03-02');
      assert.strictEqual(metrics.carryover.topChains[0].lastSeen, '2026-03-03');

      // --- Projects ----------------------------------------------------------
      const rollup = metrics.projects.find(entry => entry.lineNumber === ship.lineNumber);
      assert.ok(rollup, 'Parent with children becomes a project rollup');
      assert.strictEqual(rollup.total, 2);
      assert.strictEqual(rollup.done, 1);
      assert.strictEqual(rollup.percent, 50);

      // --- Tag pairs / quarters / bullets ------------------------------------
      const pair = metrics.tagPairs.find(entry => entry.a === 'ALPHA' && entry.b === 'BETA');
      assert.strictEqual(pair.count, 1);

      assert.strictEqual(metrics.quarters[0].quarter, 'Q1');
      assert.ok(metrics.quarters[0].total >= 3, 'Q1 collects January work');
      assert.strictEqual(metrics.quarters[0].hours, 2.5);

      const alphaBullet = metrics.resumeBullets.find(bullet => bullet.tag === 'ALPHA');
      assert.strictEqual(alphaBullet.count, 2);
      assert.ok(alphaBullet.text.includes('delivered 2 items'), 'Bullet text is review ready');

      // --- Hygiene -----------------------------------------------------------
      assert.strictEqual(metrics.hygiene.undatedCount, 2, 'Sub two and the dateless TODO');
      assert.ok(metrics.hygiene.untaggedCount >= 3);

      // --- Ranked wins -------------------------------------------------------
      assert.strictEqual(metrics.rankedWins[0].title, 'Ship the thing', 'Subtasks/clock/priority outrank bare items');
      assert.strictEqual(metrics.rankedWins[0].subtasks, 2);

      // --- Year switching ----------------------------------------------------
      assert.deepStrictEqual(parsed.availableYears.map(entry => entry.year), [2026]);
      assert.strictEqual(parsed.yearComparison[0].year, 2026);

      const multiYear = [
        '* DONE Old work                         :LEGACY:',
        '  SCHEDULED: <2025-06-01>  CLOSED: [2025-06-02 Mon 09:00]',
        '* DONE New work                         :CURRENT:',
        '  SCHEDULED: <2026-06-01>  CLOSED: [2026-06-02 Tue 09:00]'
      ].join('\n');

      const forced2025 = parseOrgContent(multiYear, { year: 2025 });
      assert.strictEqual(forced2025.year, 2025);
      assert.strictEqual(forced2025.aggregates.totalTasks, 1, 'Requested year filters the data set');
      assert.deepStrictEqual(forced2025.availableYears.map(entry => entry.year), [2026, 2025]);
      assert.strictEqual(forced2025.yearComparison.length, 2, 'Comparison spans every year in the file');

      const forced2026 = parseOrgContent(multiYear, { year: 2026 });
      assert.strictEqual(forced2026.year, 2026);
      assert.strictEqual(forced2026.aggregates.totalTasks, 1);
    });
  }
};
