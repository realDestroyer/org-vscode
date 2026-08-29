const assert = require('assert');
const path = require('path');

const {
  computeRefilePlan,
  computeSubtreeLevelResult
} = require(path.join(__dirname, '..', '..', 'out', 'subtreeStructureUtils.js'));

function testPromoteAndDemoteWholeStarSubtree() {
  const lines = ['* Parent', '** Child', 'body', '*** Grandchild', '* Sibling'];
  const demoted = computeSubtreeLevelResult(lines, 2, 1);
  assert.deepStrictEqual(demoted.updatedLines, ['* Parent', '*** Child', 'body', '**** Grandchild', '* Sibling']);

  const promoted = computeSubtreeLevelResult(demoted.updatedLines, 1, -1);
  assert.deepStrictEqual(promoted.updatedLines, lines);
}

function testUnicodeSubtreeUsesConfiguredIndentation() {
  const lines = ['⊖ Parent', '  ⊙ Child', '    ⊘ Grandchild', '⊖ Sibling'];
  const result = computeSubtreeLevelResult(lines, 1, 1, 2);
  assert.deepStrictEqual(result.updatedLines, ['⊖ Parent', '    ⊙ Child', '      ⊘ Grandchild', '⊖ Sibling']);
}

function testUnicodeSubtreeSupportsConfiguredMarkers() {
  const lines = ['! Parent', '  ~ Child', '! Sibling'];
  const result = computeSubtreeLevelResult(lines, 1, 1, 2, ['!', '~']);
  assert.deepStrictEqual(result.updatedLines, ['! Parent', '    ~ Child', '! Sibling']);
}

function testUnicodeSubtreeHonorsDisabledLevelAdjustment() {
  assert.strictEqual(computeSubtreeLevelResult(['! Parent'], 0, 1, 0, ['!']), null);
}

function testPromotionRejectsTopLevelUnderflow() {
  assert.strictEqual(computeSubtreeLevelResult(['* Parent', '** Child'], 0, -1), null);
}

function testRefileRelevelsAndPreservesContent() {
  const source = ['* Moving', 'body', '** Child', '* Other'];
  const target = ['* Destination', '** Existing'];
  const plan = computeRefilePlan(source, 1, target, 0, false);
  assert.deepStrictEqual(plan.subtreeLines, ['** Moving', 'body', '*** Child']);
  assert.strictEqual(plan.targetInsertLine, 2);
}

function testRefileExcludesFinalNewlineSentinels() {
  const source = ['* Moving', '** Child', ''];
  const target = ['* Destination', '** Existing', ''];
  const plan = computeRefilePlan(source, 0, target, 0, false);
  assert.deepStrictEqual(plan.subtreeLines, ['** Moving', '*** Child']);
  assert.strictEqual(plan.sourceEndExclusive, 2);
  assert.strictEqual(plan.targetInsertLine, 2);
}

function testRefileRejectsSelfAndDescendantTargets() {
  const lines = ['* Moving', '** Child', '*** Grandchild', '* Other'];
  assert.strictEqual(computeRefilePlan(lines, 0, lines, 0, true), null);
  assert.strictEqual(computeRefilePlan(lines, 0, lines, 1, true), null);
}

module.exports = {
  name: 'unit/subtree-structure',
  run: () => {
    testPromoteAndDemoteWholeStarSubtree();
    testUnicodeSubtreeUsesConfiguredIndentation();
    testUnicodeSubtreeSupportsConfiguredMarkers();
    testUnicodeSubtreeHonorsDisabledLevelAdjustment();
    testPromotionRejectsTopLevelUnderflow();
    testRefileRelevelsAndPreservesContent();
    testRefileExcludesFinalNewlineSentinels();
    testRefileRejectsSelfAndDescendantTargets();
  }
};