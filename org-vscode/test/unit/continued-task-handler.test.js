const assert = require('assert');
const path = require('path');

const {
  findContainingDayHeading,
  findNextDayHeading,
  findLastTaskLineUnderHeading,
  findForwardedTask,
  getTaskIdentifier,
  getImmediatePlanningLine,
  buildDayHeading,
  stripInlinePlanning,
  DAY_HEADING_REGEX
} = require(path.join(__dirname, '..', '..', 'out', 'continuedTaskHandler.js'));

// ============================================================================
// DAY_HEADING_REGEX Tests
// ============================================================================

function testDayHeadingRegex() {
  // Basic inactive timestamp heading
  const match1 = "* [2026-01-15 Thu] -------".match(DAY_HEADING_REGEX);
  assert.ok(match1, "Should match inactive timestamp day heading");
  assert.strictEqual(match1[2], "*", "Should capture marker");
  assert.strictEqual(match1[3], "[", "Should capture open bracket");
  assert.strictEqual(match1[4], "2026-01-15", "Should capture date");
  assert.strictEqual(match1[5], "Thu", "Should capture weekday");
  assert.strictEqual(match1[10], "]", "Should capture close bracket");

  // Active timestamp heading
  const match2 = "* <2026-01-15 Thu> -------".match(DAY_HEADING_REGEX);
  assert.ok(match2, "Should match active timestamp day heading");
  assert.strictEqual(match2[3], "<", "Should capture < open bracket");
  assert.strictEqual(match2[10], ">", "Should capture > close bracket");

  // Multi-asterisk marker
  const match3 = "** [2026-01-15 Thu] -------".match(DAY_HEADING_REGEX);
  assert.ok(match3, "Should match multi-asterisk marker");
  assert.strictEqual(match3[2], "**", "Should capture ** marker");

  // More asterisks
  const match4 = "*** [2026-01-15 Thu] -------".match(DAY_HEADING_REGEX);
  assert.ok(match4, "Should match triple-asterisk heading");
  assert.strictEqual(match4[2], "***", "Should capture *** marker");

  // With time
  const match5 = "* [2026-01-15 Thu 10:00] -------".match(DAY_HEADING_REGEX);
  assert.ok(match5, "Should match heading with time");
  assert.strictEqual(match5[6], "10:00", "Should capture time");

  // Non-day heading should not match
  const noMatch = "* TODO Some task".match(DAY_HEADING_REGEX);
  assert.strictEqual(noMatch, null, "Should not match non-day heading");
}

// ============================================================================
// findContainingDayHeading Tests
// ============================================================================

function testFindContainingDayHeading() {
  const lines = [
    "* [2026-01-14 Wed] -------",
    "** TODO Task on 14th",
    "* [2026-01-15 Thu] -------",
    "** TODO Task on 15th",
    "   SCHEDULED: <2026-01-15 Thu>",
    "** TODO Another task"
  ];

  // Task on line 1 should find heading on line 0
  const result1 = findContainingDayHeading(lines, 1);
  assert.ok(result1, "Should find day heading");
  assert.strictEqual(result1.lineIndex, 0, "Should find heading at line 0");
  assert.strictEqual(result1.date, "2026-01-14", "Should have correct date");

  // Task on line 3 should find heading on line 2
  const result2 = findContainingDayHeading(lines, 3);
  assert.ok(result2, "Should find day heading");
  assert.strictEqual(result2.lineIndex, 2, "Should find heading at line 2");
  assert.strictEqual(result2.date, "2026-01-15", "Should have correct date");
  assert.strictEqual(result2.weekday, "Thu", "Should have correct weekday");

  // Planning line on line 4 should find same heading
  const result3 = findContainingDayHeading(lines, 4);
  assert.strictEqual(result3.lineIndex, 2, "Planning line should find same heading");

  // Task on line 5 should still find heading at line 2
  const result4 = findContainingDayHeading(lines, 5);
  assert.strictEqual(result4.lineIndex, 2, "Later task should find heading");
}

function testFindContainingDayHeadingNoHeading() {
  const lines = [
    "* TODO Some task without day heading",
    "  SCHEDULED: <2026-01-15 Thu>"
  ];

  const result = findContainingDayHeading(lines, 0);
  assert.strictEqual(result, null, "Should return null when no day heading found");
}

function testFindContainingDayHeadingActiveBrackets() {
  // Test with active timestamps <...> (Emacs standard for agenda visibility)
  const lines = [
    "* <2026-01-15 Thu> -------",
    "** TODO Task with active day heading",
    "   SCHEDULED: <2026-01-15 Thu>"
  ];

  const result = findContainingDayHeading(lines, 1);
  assert.ok(result, "Should find day heading with active brackets");
  assert.strictEqual(result.openBracket, "<", "Should extract < as open bracket");
  assert.strictEqual(result.closeBracket, ">", "Should extract > as close bracket");
  assert.strictEqual(result.date, "2026-01-15", "Should extract date");
  assert.strictEqual(result.weekday, "Thu", "Should extract weekday");
}

function testFindContainingDayHeadingInactiveBrackets() {
  // Test with inactive timestamps [...] (reference only, not in agenda)
  const lines = [
    "* [2026-01-15 Thu] -------",
    "** TODO Task with inactive day heading"
  ];

  const result = findContainingDayHeading(lines, 1);
  assert.ok(result, "Should find day heading with inactive brackets");
  assert.strictEqual(result.openBracket, "[", "Should extract [ as open bracket");
  assert.strictEqual(result.closeBracket, "]", "Should extract ] as close bracket");
}

// ============================================================================
// findNextDayHeading Tests
// ============================================================================

function testFindNextDayHeading() {
  const lines = [
    "* [2026-01-14 Wed] -------",
    "** TODO Task on 14th",
    "* [2026-01-15 Thu] -------",
    "** TODO Task on 15th",
    "* [2026-01-16 Fri] -------"
  ];

  // After line 0, next heading is at line 2
  const result1 = findNextDayHeading(lines, 0);
  assert.ok(result1, "Should find next day heading");
  assert.strictEqual(result1.lineIndex, 2, "Should find heading at line 2");
  assert.strictEqual(result1.date, "2026-01-15", "Should have correct date");

  // After line 2, next heading is at line 4
  const result2 = findNextDayHeading(lines, 2);
  assert.ok(result2, "Should find next day heading");
  assert.strictEqual(result2.lineIndex, 4, "Should find heading at line 4");
  assert.strictEqual(result2.date, "2026-01-16", "Should have correct date");

  // After line 4, no more headings
  const result3 = findNextDayHeading(lines, 4);
  assert.strictEqual(result3, null, "Should return null when no more headings");
}

// ============================================================================
// findLastTaskLineUnderHeading Tests
// ============================================================================

function testFindLastTaskLineUnderHeading() {
  const lines = [
    "* [2026-01-15 Thu] -------",
    "** TODO First task",
    "** TODO Second task",
    "   SCHEDULED: <2026-01-15 Thu>",
    "** TODO Third task",
    "",
    "* [2026-01-16 Fri] -------"
  ];

  // Last task under heading at line 0
  const result = findLastTaskLineUnderHeading(lines, 0);
  assert.strictEqual(result, 4, "Should find last task at line 4");
}

function testFindLastTaskLineUnderHeadingAtEOF() {
  const lines = [
    "* [2026-01-15 Thu] -------",
    "** TODO First task",
    "** TODO Last task"
  ];

  const result = findLastTaskLineUnderHeading(lines, 0);
  assert.strictEqual(result, 2, "Should find last task at EOF");
}

// ============================================================================
// getTaskIdentifier Tests
// ============================================================================

function testGetTaskIdentifier() {
  // Basic task
  const id1 = getTaskIdentifier("** TODO Buy groceries");
  assert.strictEqual(id1, "Buy groceries", "Should extract task identifier");

  // Task with tags
  const id2 = getTaskIdentifier("** TODO Buy groceries :shopping:");
  assert.strictEqual(id2, "Buy groceries :shopping:", "Should preserve tags");

  // Task with scheduling (should be stripped)
  const id3 = getTaskIdentifier("** TODO Buy groceries SCHEDULED: <2026-01-15 Thu>");
  assert.strictEqual(id3, "Buy groceries", "Should strip SCHEDULED");

  // Different keywords should produce same identifier
  const id4 = getTaskIdentifier("** DONE Buy groceries");
  const id5 = getTaskIdentifier("** TODO Buy groceries");
  assert.strictEqual(id4, id5, "Different keywords should produce same identifier");
}

// ============================================================================
// getImmediatePlanningLine Tests
// ============================================================================

function testGetImmediatePlanningLine() {
  const lines = [
    "** TODO Task with planning",
    "   SCHEDULED: <2026-01-15 Thu>",
    "** TODO Task without planning"
  ];

  // Task at line 0 has planning at line 1
  const result1 = getImmediatePlanningLine(lines, 0);
  assert.strictEqual(result1.index, 1, "Should find planning line");
  assert.ok(result1.text.includes("SCHEDULED"), "Should have SCHEDULED");

  // Task at line 2 has no planning
  const result2 = getImmediatePlanningLine(lines, 2);
  assert.strictEqual(result2.index, -1, "Should return -1 for no planning");
  assert.strictEqual(result2.text, "", "Should return empty text");
}

// ============================================================================
// buildDayHeading Tests
// ============================================================================

function testBuildDayHeading() {
  // Basic heading with asterisk marker
  const h1 = buildDayHeading("2026-01-15", "Thu", "", "", "*");
  assert.ok(h1.includes("[2026-01-15 Thu]"), "Should include date in brackets");
  assert.ok(h1.includes("*"), "Should include asterisk marker");
  assert.ok(h1.includes("---"), "Should include separator");

  // With custom suffix
  const h2 = buildDayHeading("2026-01-15", "Thu", " custom suffix", "", "*");
  assert.ok(h2.includes(" custom suffix"), "Should use custom suffix");
  assert.ok(!h2.includes("---"), "Should not include default separator");

  // With multi-asterisk marker (level 2)
  const h3 = buildDayHeading("2026-01-15", "Thu", "", "", "**");
  assert.ok(h3.includes("** ["), "Should use double asterisk marker");

  // With triple asterisk marker (level 3)
  const h4 = buildDayHeading("2026-01-15", "Thu", "", "", "***");
  assert.ok(h4.includes("*** ["), "Should use triple asterisk marker");

  // With active timestamp brackets
  const h5 = buildDayHeading("2026-01-15", "Thu", "", "", "*", "<", ">");
  assert.ok(h5.includes("<2026-01-15 Thu>"), "Should use active brackets");
}

// ============================================================================
// stripInlinePlanning Tests
// ============================================================================

function testStripInlinePlanning() {
  const stripped1 = stripInlinePlanning("Buy groceries SCHEDULED: <2026-01-15 Thu>");
  assert.strictEqual(stripped1, "Buy groceries", "Should strip SCHEDULED");

  const stripped2 = stripInlinePlanning("Task DEADLINE: <2026-01-20 Tue -3d> SCHEDULED: <2026-01-15>");
  assert.strictEqual(stripped2, "Task", "Should strip both DEADLINE and SCHEDULED");

  const stripped3 = stripInlinePlanning("Clean task");
  assert.strictEqual(stripped3, "Clean task", "Should leave clean tasks unchanged");

  const stripped4 = stripInlinePlanning(null);
  assert.strictEqual(stripped4, "", "Should handle null");
}

// ============================================================================
// findForwardedTask Tests
// ============================================================================

function testFindForwardedTask() {
  const lines = [
    "* [2026-01-15 Thu] -------",
    "** TODO Buy groceries",
    "** TODO Call mom",
    "* [2026-01-16 Fri] -------",
    "** TODO Buy groceries",
    "   SCHEDULED: <2026-01-16 Fri>",
    "** TODO Different task"
  ];

  // Find forwarded "Buy groceries" after heading at line 3
  const result1 = findForwardedTask(lines, 3, "Buy groceries");
  assert.strictEqual(result1, 4, "Should find forwarded task at line 4");

  // "Call mom" is not forwarded
  const result2 = findForwardedTask(lines, 3, "Call mom");
  assert.strictEqual(result2, -1, "Should not find non-forwarded task");

  // "Different task" is different
  const result3 = findForwardedTask(lines, 3, "Different task");
  assert.strictEqual(result3, 6, "Should find different task");
}

// ============================================================================
// Module exports
// ============================================================================

module.exports = {
  name: 'unit/continued-task-handler',
  run: () => {
    // DAY_HEADING_REGEX tests
    testDayHeadingRegex();

    // findContainingDayHeading tests
    testFindContainingDayHeading();
    testFindContainingDayHeadingNoHeading();
    testFindContainingDayHeadingActiveBrackets();
    testFindContainingDayHeadingInactiveBrackets();

    // findNextDayHeading tests
    testFindNextDayHeading();

    // findLastTaskLineUnderHeading tests
    testFindLastTaskLineUnderHeading();
    testFindLastTaskLineUnderHeadingAtEOF();

    // getTaskIdentifier tests
    testGetTaskIdentifier();

    // getImmediatePlanningLine tests
    testGetImmediatePlanningLine();

    // buildDayHeading tests
    testBuildDayHeading();

    // stripInlinePlanning tests
    testStripInlinePlanning();

    // findForwardedTask tests
    testFindForwardedTask();
  }
};
