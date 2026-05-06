"use strict";

/*
  Issue #111: heading folding must work for both indented and unindented
  body content. Previous setup only had indent-based folding plus
  drawer-marker folding from language-configuration.json, so a heading
  with flush-left content got no fold control at all.
*/

const assert = require("assert");
const path = require("path");
const Module = require("module");

function loadFolding() {
  // orgFoldingProvider requires("vscode") for FoldingRange / FoldingRangeKind
  // and languages.registerFoldingRangeProvider. The unit test only exercises
  // the pure helper (buildFoldingRanges), but the require still has to
  // resolve, so we mock vscode for the duration of the load.
  const vscodeMock = {
    FoldingRange: class FoldingRange {
      constructor(start, end, kind) {
        this.start = start;
        this.end = end;
        this.kind = kind;
      }
    },
    FoldingRangeKind: { Region: 3, Comment: 1, Imports: 2 },
    languages: {
      registerFoldingRangeProvider() {
        return { dispose() {} };
      }
    }
  };

  const originalRequire = Module.prototype.require;
  const target = require.resolve(
    path.join(__dirname, "..", "..", "out", "orgFoldingProvider.js")
  );
  // orgFoldingProvider transitively requires orgSymbolProvider, which also
  // captures vscode at load time. Clear both from the cache so neither
  // bleeds our stub into other test files.
  const symbolModule = require.resolve(
    path.join(__dirname, "..", "..", "out", "orgSymbolProvider.js")
  );
  delete require.cache[target];
  delete require.cache[symbolModule];

  Module.prototype.require = function patchedRequire(request) {
    if (request === "vscode") return vscodeMock;
    return originalRequire.apply(this, arguments);
  };

  try {
    return require(target);
  } finally {
    Module.prototype.require = originalRequire;
    // Evict our stub-tainted modules so the next test file gets a clean
    // load with whatever vscode mock it sets up.
    delete require.cache[target];
    delete require.cache[symbolModule];
  }
}

const { buildFoldingRanges } = loadFolding();

function testUnindentedBodyFoldsUnderHeading() {
  // RexxMagnus's case from issue #111: body lines flush-left, not
  // indented under their parent heading.
  const lines = [
    "* Top level",            // 0
    "Content",                // 1
    "** Child item",          // 2
    "Child item content",     // 3
    "** Child item 2",        // 4
    "Child item 2 content"    // 5
  ];
  const ranges = buildFoldingRanges(lines);

  assert.strictEqual(ranges.length, 3, `expected 3 ranges, got ${ranges.length}`);
  assert.deepStrictEqual([ranges[0].start, ranges[0].end], [0, 5]);
  assert.deepStrictEqual([ranges[1].start, ranges[1].end], [2, 3]);
  assert.deepStrictEqual([ranges[2].start, ranges[2].end], [4, 5]);
}

function testHeadingWithoutBodyProducesNoRange() {
  // VS Code requires startLine < endLine; a heading immediately followed
  // by another heading at the same level has nothing to fold.
  const lines = [
    "* A",
    "* B"
  ];
  const ranges = buildFoldingRanges(lines);
  assert.strictEqual(ranges.length, 0);
}

function testTrailingBlankLinesAreTrimmed() {
  const lines = [
    "* Heading",
    "body",
    "",
    "",
    ""
  ];
  const ranges = buildFoldingRanges(lines);
  assert.strictEqual(ranges.length, 1);
  assert.deepStrictEqual([ranges[0].start, ranges[0].end], [0, 1]);
}

function testNestedLevelsCollapseCorrectly() {
  const lines = [
    "* L1",                  // 0
    "l1 body",               // 1
    "** L2a",                // 2
    "l2a body",              // 3
    "*** L3",                // 4
    "l3 body",               // 5
    "** L2b",                // 6
    "l2b body"               // 7
  ];
  const ranges = buildFoldingRanges(lines);
  assert.strictEqual(ranges.length, 4);
  assert.deepStrictEqual([ranges[0].start, ranges[0].end], [0, 7]);
  assert.deepStrictEqual([ranges[1].start, ranges[1].end], [2, 5]);
  assert.deepStrictEqual([ranges[2].start, ranges[2].end], [4, 5]);
  assert.deepStrictEqual([ranges[3].start, ranges[3].end], [6, 7]);
}

function testUnicodeHeadingsAlsoFold() {
  // The unicode heading style (⊙ / ⊘ / ⊖ / ⊜ / ⊗) is the v2 default.
  // parseHeadingLine derives level from leading indent (2 spaces per level).
  const lines = [
    "⊙ Top",
    "  body line",
    "  ⊘ Child",
    "  child body"
  ];
  const ranges = buildFoldingRanges(lines);
  assert.strictEqual(ranges.length, 2);
  assert.deepStrictEqual([ranges[0].start, ranges[0].end], [0, 3]);
  assert.deepStrictEqual([ranges[1].start, ranges[1].end], [2, 3]);
}

module.exports = {
  name: "unit/heading-folding",
  run() {
    testUnindentedBodyFoldsUnderHeading();
    testHeadingWithoutBodyProducesNoRange();
    testTrailingBlankLinesAreTrimmed();
    testNestedLevelsCollapseCorrectly();
    testUnicodeHeadingsAlsoFold();
  }
};
