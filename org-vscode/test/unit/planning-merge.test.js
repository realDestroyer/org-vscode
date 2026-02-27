const assert = require('assert');

const { createWorkflowRegistry } = require('../../out/workflowStates');
const { mergePlanningFromNearbyLines } = require('../../out/planningMerge');

module.exports = {
  name: 'planning-merge',
  run: () => {
    const workflowRegistry = createWorkflowRegistry(undefined);
    assert.ok(workflowRegistry, 'Expected workflow registry');

    // Scenario: current headline is followed by another headline, and that next headline
    // has a planning line (CLOSED). We must not steal that CLOSED planning when toggling
    // the current headline.
    const headline = '* Skibbidy rizzle';
    const nextHeadline = '* DONE Next task';
    const nextPlanning = '  CLOSED: [2026-01-20 Tue 11:00]';

    const merged = mergePlanningFromNearbyLines(headline, nextHeadline, nextPlanning);

    assert.strictEqual(merged.scheduled, null);
    assert.strictEqual(merged.deadline, null);
    assert.strictEqual(merged.closed, null, 'Should not inherit CLOSED from next headline planning');

    // But if there is a blank line between headline and planning, we do allow association.
    const mergedWithBlank = mergePlanningFromNearbyLines(headline, '', nextPlanning);
    assert.strictEqual(mergedWithBlank.closed, '2026-01-20 Tue 11:00');
  }
};
