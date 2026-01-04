const assert = require('assert');
const path = require('path');

const { computeCheckboxStatsByHeadingLine, computeHierarchicalCheckboxStatsInRange, hasCheckboxCookie, findCheckboxCookie, formatCheckboxStats } = require(path.join(__dirname, '..', '..', 'out', 'checkboxStats.js'));

function testCheckboxStatsHierarchicalByHeading() {
  const lines = [
    '* Project',
    '  - [ ] a',
    '  - [X] b',
    '** Sub',
    '   - [x] c',
    '* Another',
    ' - [ ] z'
  ];

  const map = computeCheckboxStatsByHeadingLine(lines);

  // Hierarchical: top-level checkboxes under * Project are a and b.
  assert.deepStrictEqual(map.get(0), { checked: 1, total: 2 });
  assert.deepStrictEqual(map.get(3), { checked: 1, total: 1 });
  assert.deepStrictEqual(map.get(5), { checked: 0, total: 1 });
}

function testCheckboxStatsHierarchicalNestedList() {
  const lines = [
    '* H',
    '  - [-] Parent',
    '    - [X] c1',
    '    - [ ] c2',
    '  - [X] Done'
  ];

  const stats = computeHierarchicalCheckboxStatsInRange(lines, 1, lines.length, -1);
  // Heading-level: only Parent and Done count (2). Parent is incomplete because c2 is unchecked.
  assert.deepStrictEqual(stats, { checked: 1, total: 2 });

  // List-item-level: children of Parent are c1/c2 (2), 1 checked.
  const parentIndent = 2;
  const childStats = computeHierarchicalCheckboxStatsInRange(lines, 2, 4, parentIndent);
  assert.deepStrictEqual(childStats, { checked: 1, total: 2 });
}

function testCheckboxCookieDetection() {
  assert.strictEqual(hasCheckboxCookie('* Heading [2/3]'), true);
  assert.strictEqual(hasCheckboxCookie('* Heading [66%]'), true);
  assert.strictEqual(hasCheckboxCookie('* Heading'), false);

  assert.deepStrictEqual(findCheckboxCookie('* Heading [2/3]'), {
    start: 10,
    end: 15,
    raw: '[2/3]',
    mode: 'fraction'
  });
}

function testCheckboxFormatting() {
  assert.strictEqual(formatCheckboxStats({ checked: 2, total: 3 }, 'fraction'), '[2/3]');
  assert.strictEqual(formatCheckboxStats({ checked: 2, total: 3 }, 'percent'), '[66%]');
  assert.strictEqual(formatCheckboxStats({ checked: 0, total: 0 }, 'fraction'), '[0/0]');
  assert.strictEqual(formatCheckboxStats({ checked: 0, total: 0 }, 'percent'), '[0%]');
}

module.exports = {
  name: 'unit/checkbox-stats',
  run: () => {
    testCheckboxStatsHierarchicalByHeading();
    testCheckboxStatsHierarchicalNestedList();
    testCheckboxCookieDetection();
    testCheckboxFormatting();
  }
};
