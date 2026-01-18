const assert = require('assert');
const path = require('path');

const { computeTodoStateChange, buildPlanningBody } = require(path.join(__dirname, '..', '..', 'out', 'setTodoState.js'));
const { createWorkflowRegistry } = require(path.join(__dirname, '..', '..', 'out', 'workflowStates.js'));

// ============================================================================
// computeTodoStateChange Tests
// ============================================================================

function createDefaultRegistry() {
  return createWorkflowRegistry([
    { keyword: "TODO", isDoneLike: false, stampsClosed: false, triggersForward: false },
    { keyword: "IN_PROGRESS", isDoneLike: false, stampsClosed: false, triggersForward: false },
    { keyword: "DONE", isDoneLike: true, stampsClosed: true, triggersForward: false },
    { keyword: "ABANDONED", isDoneLike: true, stampsClosed: false, triggersForward: false }
  ]);
}

function testBasicTodoToDone() {
  const registry = createDefaultRegistry();
  const result = computeTodoStateChange({
    currentLineText: "* TODO Simple task",
    nextLineText: null,
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });

  assert.strictEqual(result.effectiveKeyword, "DONE", "Should transition to DONE");
  assert.ok(result.newLineText.includes("DONE"), "New line should contain DONE");
  assert.ok(result.mergedPlanning.closed, "Should have CLOSED timestamp");
}

function testRepeaterResetsToDo() {
  const registry = createDefaultRegistry();
  const result = computeTodoStateChange({
    currentLineText: "* TODO Daily standup",
    nextLineText: "  SCHEDULED: <2026-01-15 Thu +1d>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });

  assert.strictEqual(result.effectiveKeyword, "TODO", "Should reset to TODO due to repeater");
  assert.ok(result.newLineText.includes("TODO"), "New line should contain TODO");
  assert.strictEqual(result.mergedPlanning.scheduled, "2026-01-16 Fri +1d", "Should advance date by 1 day");
  assert.strictEqual(result.mergedPlanning.closed, null, "Should NOT have CLOSED timestamp");
}

function testRepeaterCatchUp() {
  const registry = createDefaultRegistry();
  const result = computeTodoStateChange({
    currentLineText: "* TODO Weekly review",
    nextLineText: "  SCHEDULED: <2026-01-01 Thu ++1w>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });

  assert.strictEqual(result.effectiveKeyword, "TODO", "Should reset to TODO due to repeater");
  // Catch-up should advance past today (2026-01-16)
  const scheduledDate = result.mergedPlanning.scheduled.split(" ")[0];
  assert.ok(scheduledDate >= "2026-01-17", `Catch-up should advance past today, got: ${scheduledDate}`);
  assert.ok(result.mergedPlanning.scheduled.includes("++1w"), "Should preserve ++1w repeater");
}

function testRepeaterRestart() {
  const registry = createDefaultRegistry();
  const result = computeTodoStateChange({
    currentLineText: "* TODO Habit task",
    nextLineText: "  SCHEDULED: <2026-01-01 Thu .+1d>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });

  assert.strictEqual(result.effectiveKeyword, "TODO", "Should reset to TODO due to repeater");
  // Restart should be today + 1 day
  assert.ok(result.mergedPlanning.scheduled.includes(".+1d"), "Should preserve .+1d repeater");
}

function testNoRepeaterNormalDone() {
  const registry = createDefaultRegistry();
  const result = computeTodoStateChange({
    currentLineText: "* TODO One-time task",
    nextLineText: "  SCHEDULED: <2026-01-15 Thu>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });

  assert.strictEqual(result.effectiveKeyword, "DONE", "Should transition to DONE (no repeater)");
  assert.strictEqual(result.mergedPlanning.scheduled, "2026-01-15 Thu", "Should NOT modify date");
  assert.ok(result.mergedPlanning.closed, "Should have CLOSED timestamp");
}

function testDeadlineWithRepeater() {
  const registry = createDefaultRegistry();
  const result = computeTodoStateChange({
    currentLineText: "* TODO Monthly report",
    nextLineText: "  DEADLINE: <2026-01-20 Tue +1m -3d>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });

  assert.strictEqual(result.effectiveKeyword, "TODO", "Should reset to TODO due to repeater");
  assert.strictEqual(result.mergedPlanning.deadline, "2026-02-20 Fri +1m -3d", "Should advance deadline by 1 month");
  assert.ok(result.mergedPlanning.deadline.includes("-3d"), "Should preserve warning");
}

function testBuildPlanningBody() {
  const body1 = buildPlanningBody({ scheduled: "2026-01-15 Thu", deadline: null, closed: null });
  assert.strictEqual(body1, "SCHEDULED: <2026-01-15 Thu>", "Should format SCHEDULED only");

  const body2 = buildPlanningBody({ scheduled: null, deadline: "2026-01-20 Tue -3d", closed: null });
  assert.strictEqual(body2, "DEADLINE: <2026-01-20 Tue -3d>", "Should format DEADLINE only");

  const body3 = buildPlanningBody({ scheduled: "2026-01-15", deadline: "2026-01-20", closed: "2026-01-14 Tue 10:00" });
  assert.strictEqual(body3, "SCHEDULED: <2026-01-15>  DEADLINE: <2026-01-20>  CLOSED: [2026-01-14 Tue 10:00]", "Should format all");

  const body4 = buildPlanningBody({ scheduled: null, deadline: null, closed: null });
  assert.strictEqual(body4, "", "Should return empty string for no planning");
}

function testAlreadyDoneNoChange() {
  const registry = createDefaultRegistry();
  const result = computeTodoStateChange({
    currentLineText: "* DONE Already done task",
    nextLineText: "  SCHEDULED: <2026-01-15 Thu +1d>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });

  // When already DONE and transitioning to DONE, repeater should NOT trigger
  assert.strictEqual(result.effectiveKeyword, "DONE", "Should stay DONE");
  assert.strictEqual(result.mergedPlanning.scheduled, "2026-01-15 Thu +1d", "Should NOT advance (already done)");
}

function testAllRepeaterUnits() {
  const registry = createDefaultRegistry();

  // +1d (days)
  const resultD = computeTodoStateChange({
    currentLineText: "* TODO Test",
    nextLineText: "  SCHEDULED: <2026-01-15 Thu +1d>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });
  assert.strictEqual(resultD.mergedPlanning.scheduled, "2026-01-16 Fri +1d", "+1d should advance by 1 day");

  // +1w (weeks)
  const resultW = computeTodoStateChange({
    currentLineText: "* TODO Test",
    nextLineText: "  SCHEDULED: <2026-01-15 Thu +1w>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });
  assert.strictEqual(resultW.mergedPlanning.scheduled, "2026-01-22 Thu +1w", "+1w should advance by 7 days");

  // +1m (months)
  const resultM = computeTodoStateChange({
    currentLineText: "* TODO Test",
    nextLineText: "  SCHEDULED: <2026-01-15 Thu +1m>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });
  assert.strictEqual(resultM.mergedPlanning.scheduled, "2026-02-15 Sun +1m", "+1m should advance by 1 month");

  // +1y (years)
  const resultY = computeTodoStateChange({
    currentLineText: "* TODO Test",
    nextLineText: "  SCHEDULED: <2026-01-15 Thu +1y>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });
  assert.strictEqual(resultY.mergedPlanning.scheduled, "2027-01-15 Fri +1y", "+1y should advance by 1 year");

  // +2h (hours)
  const resultH = computeTodoStateChange({
    currentLineText: "* TODO Test",
    nextLineText: "  SCHEDULED: <2026-01-15 Thu 10:00 +2h>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });
  assert.strictEqual(resultH.mergedPlanning.scheduled, "2026-01-15 Thu 12:00 +2h", "+2h should advance by 2 hours");
}

function testCatchUpFromYearsAgo() {
  const registry = createDefaultRegistry();

  // ++1d from 2020 should catch up to today or later (relative to today)
  const result = computeTodoStateChange({
    currentLineText: "* TODO Test",
    nextLineText: "  SCHEDULED: <2020-01-01 Wed ++1d>",
    nextNextLineText: null,
    targetKeyword: "DONE",
    dateFormat: "YYYY-MM-DD",
    bodyIndent: "  ",
    headingMarkerStyle: "asterisk",
    workflowRegistry: registry
  });

  // The date should not be in the past (>= today)
  const outDate = result.mergedPlanning.scheduled.split(" ")[0];
  const today = new Date().toISOString().split("T")[0];
  assert.ok(outDate >= today, `Catch-up ++1d from 2020 should be on/after today (${today}), got ${outDate}`);
  assert.ok(result.mergedPlanning.scheduled.includes("++1d"), "Should preserve ++1d repeater");
}

// ============================================================================
// Module exports
// ============================================================================

module.exports = {
  name: 'unit/set-todo-state',
  run: () => {
    testBasicTodoToDone();
    testRepeaterResetsToDo();
    testRepeaterCatchUp();
    testRepeaterRestart();
    testNoRepeaterNormalDone();
    testDeadlineWithRepeater();
    testBuildPlanningBody();
    testAlreadyDoneNoChange();
    testAllRepeaterUnits();
    testCatchUpFromYearsAgo();
  }
};
