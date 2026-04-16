const assert = require("assert");
const path = require("path");

const columnView = require(path.join(__dirname, "..", "..", "out", "columnView.js"));

function testCollectColumnRowsFromLines() {
  const lines = [
    "#+PROPERTY: Effort 0:30",
    "* TODO Parent task :WORK:",
    "  SCHEDULED: <2026-04-15 Wed>",
    "  :PROPERTIES:",
    "  :CATEGORY: Operations",
    "  :END:",
    "** IN_PROGRESS Child task :LAB:",
    "   DEADLINE: <2026-04-16 Thu>",
    ""
  ];

  const parsed = columnView._test.collectColumnRowsFromLines(lines, "demo.org");
  assert.ok(parsed, "parser should return a result object");
  assert.strictEqual(parsed.rows.length, 2, "expected two heading rows");

  const parent = parsed.rows[0];
  assert.strictEqual(parent.file, "demo.org");
  assert.strictEqual(parent.line, 2);
  assert.strictEqual(parent.level, 1);
  assert.strictEqual(parent.status, "TODO");
  assert.strictEqual(parent.title, "Parent task");
  assert.strictEqual(parent.scheduled, "2026-04-15 Wed");
  assert.strictEqual(parent.deadline, "");
  assert.strictEqual(parent.tags, "WORK");
  assert.strictEqual(parent.properties.CATEGORY, "Operations");
  assert.strictEqual(parent.properties.EFFORT, "0:30");

  const child = parsed.rows[1];
  assert.strictEqual(child.line, 7);
  assert.strictEqual(child.level, 2);
  assert.strictEqual(child.status, "IN_PROGRESS");
  assert.strictEqual(child.title, "Child task");
  assert.strictEqual(child.scheduled, "");
  assert.strictEqual(child.deadline, "2026-04-16 Thu");
  assert.strictEqual(child.tags, "LAB");
  assert.strictEqual(child.properties.CATEGORY, "Operations", "child should inherit CATEGORY");
  assert.strictEqual(child.properties.EFFORT, "0:30", "child should inherit file-level EFFORT");

  assert.ok(parsed.propertyKeys.includes("CATEGORY"));
  assert.ok(parsed.propertyKeys.includes("EFFORT"));
}

function testSubtreeRangeHelpers() {
  const lines = [
    "* TODO Parent",
    "** TODO Child A",
    "*** TODO Grandchild",
    "** TODO Child B",
    "* TODO Sibling"
  ];

  const h1 = columnView._test.findHeadingAtOrAbove(lines, 2);
  assert.ok(h1, "should find heading above current cursor");
  assert.strictEqual(h1.headingLine, 2);
  assert.strictEqual(h1.level, 3);

  const h2 = columnView._test.findHeadingAtOrAbove(lines, 3);
  assert.ok(h2, "should find exact heading at cursor when available");
  assert.strictEqual(h2.headingLine, 3);
  assert.strictEqual(h2.level, 2);

  const endForChildB = columnView._test.findSubtreeEnd(lines, h2.headingLine, h2.level);
  assert.strictEqual(endForChildB, 3, "Child B subtree should end before next top-level heading");

  const parsedSubtree = columnView._test.collectColumnRowsFromLines(lines, "demo.org", {
    startIndex: h2.headingLine,
    endIndex: endForChildB,
    filePath: "E:/demo.org"
  });

  assert.strictEqual(parsedSubtree.rows.length, 1, "subtree-limited parse should only include subtree headings");
  assert.strictEqual(parsedSubtree.rows[0].title, "Child B");
  assert.strictEqual(parsedSubtree.rows[0].filePath, "E:/demo.org");
}

module.exports = {
  name: "unit/column-view",
  run: () => {
    testCollectColumnRowsFromLines();
    testSubtreeRangeHelpers();
  }
};
