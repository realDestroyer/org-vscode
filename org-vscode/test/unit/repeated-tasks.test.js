const assert = require('assert');
const moment = require('moment');

const { createWorkflowRegistry } = require('../../out/workflowStates');
const { shiftTimestampContent, applyRepeatersOnCompletion } = require('../../out/repeatedTasks');

module.exports = {
  name: 'repeated-tasks',
  run() {
    {
      const shifted = shiftTimestampContent('2024-01-01 Mon +1w', { dateFormat: 'YYYY-MM-DD' });
      assert.strictEqual(shifted.didShift, true);
      assert.strictEqual(shifted.content, '2024-01-08 Mon +1w');
    }

    {
      const now = moment('2024-01-20', 'YYYY-MM-DD', true);
      const shifted = shiftTimestampContent('2024-01-01 Mon ++1w', { dateFormat: 'YYYY-MM-DD', now });
      assert.strictEqual(shifted.didShift, true);
      assert.strictEqual(shifted.content, '2024-01-22 Mon ++1w');
    }

    {
      const now = moment('2024-01-20', 'YYYY-MM-DD', true);
      const shifted = shiftTimestampContent('2024-01-01 Mon .+1m', { dateFormat: 'YYYY-MM-DD', now });
      assert.strictEqual(shifted.didShift, true);
      assert.strictEqual(shifted.content, '2024-02-20 Tue .+1m');
    }

    {
      const shifted = shiftTimestampContent('2024-01-01 Mon 09:30 +1w', { dateFormat: 'YYYY-MM-DD' });
      assert.strictEqual(shifted.didShift, true);
      assert.strictEqual(shifted.content, '2024-01-08 Mon 09:30 +1w');
    }

    {
      const shifted = shiftTimestampContent('2024-01-01 Mon +1w -2d', { dateFormat: 'YYYY-MM-DD' });
      assert.strictEqual(shifted.didShift, true);
      assert.strictEqual(shifted.content, '2024-01-08 Mon +1w -2d');
    }

    {
      const shifted = shiftTimestampContent('2024-01-01 Mon', { dateFormat: 'YYYY-MM-DD' });
      assert.strictEqual(shifted.didShift, false);
      assert.strictEqual(shifted.content, '2024-01-01 Mon');
    }

    {
      const registry = createWorkflowRegistry(undefined);
      const lines = [
        '* DONE Pay rent',
        '  SCHEDULED: [2024-01-01 Mon +1m]',
        '  :PROPERTIES:',
        '  :REPEAT_TO_STATE: IN_PROGRESS',
        '  :END:'
      ];

      const res = applyRepeatersOnCompletion({
        lines,
        headingLineIndex: 0,
        planning: { scheduled: '2024-01-01 Mon +1m', deadline: null, closed: null },
        workflowRegistry: registry,
        dateFormat: 'YYYY-MM-DD',
        now: moment('2024-01-15', 'YYYY-MM-DD', true)
      });

      assert.strictEqual(res.didRepeat, true);
      assert.strictEqual(res.planning.scheduled, '2024-02-01 Thu +1m');
      assert.strictEqual(res.repeatToStateKeyword, 'IN_PROGRESS');
    }

    {
      const registry = createWorkflowRegistry(undefined);
      const lines = [
        '* DONE Something',
        '  SCHEDULED: [2024-01-01 Mon +1w]'
      ];

      const res = applyRepeatersOnCompletion({
        lines,
        headingLineIndex: 0,
        planning: { scheduled: '2024-01-01 Mon +1w', deadline: null, closed: null },
        workflowRegistry: registry,
        dateFormat: 'YYYY-MM-DD',
        now: moment('2024-01-02', 'YYYY-MM-DD', true)
      });

      assert.strictEqual(res.didRepeat, true);
      assert.strictEqual(res.repeatToStateKeyword, 'TODO');
    }
  }
};
