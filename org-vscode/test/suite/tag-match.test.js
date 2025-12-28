const assert = require('assert');

suite('Tag match-string parsing (Emacs style)', function () {
  test('AND (+A+B) requires all tags', () => {
    const { matchesTagMatchString } = require('../../out/orgTagUtils');
    assert.strictEqual(matchesTagMatchString('+A+B', ['A']), false);
    assert.strictEqual(matchesTagMatchString('+A+B', ['A', 'B']), true);
  });

  test('NOT (-A) excludes tags', () => {
    const { matchesTagMatchString } = require('../../out/orgTagUtils');
    assert.strictEqual(matchesTagMatchString('+A-B', ['A', 'B']), false);
    assert.strictEqual(matchesTagMatchString('+A-B', ['A']), true);
  });

  test('OR (A|B) matches either side', () => {
    const { matchesTagMatchString } = require('../../out/orgTagUtils');
    assert.strictEqual(matchesTagMatchString('A|B', ['A']), true);
    assert.strictEqual(matchesTagMatchString('A|B', ['B']), true);
    assert.strictEqual(matchesTagMatchString('A|B', ['C']), false);
  });

  test('Compat any:/all:/comma are normalized', () => {
    const { normalizeTagMatchInput, matchesTagMatchString } = require('../../out/orgTagUtils');

    assert.strictEqual(normalizeTagMatchInput('any:a,b'), 'A|B');
    assert.strictEqual(normalizeTagMatchInput('all:a,b'), '+A+B');
    assert.strictEqual(normalizeTagMatchInput('a,b'), '+A+B');

    assert.strictEqual(matchesTagMatchString('any:a,b', ['B']), true);
    assert.strictEqual(matchesTagMatchString('all:a,b', ['A']), false);
    assert.strictEqual(matchesTagMatchString('a,b', ['A', 'B']), true);
  });

  test('Group tags expand to members (#+TAGS: [ GTD : ... ])', () => {
    const { parseTagGroupsFromText, matchesTagMatchString } = require('../../out/orgTagUtils');

    const fileText = [
      '#+TAGS: [ GTD : Control Persp ]',
      '#+TAGS: [ CONTROL : Plan Review ]',
      ''
    ].join('\n');

    const groups = parseTagGroupsFromText(fileText);

    // GTD should match any member, including subgroup members.
    assert.strictEqual(matchesTagMatchString('GTD', ['PERSP'], { groups }), true);
    assert.strictEqual(matchesTagMatchString('GTD', ['PLAN'], { groups }), true);
    assert.strictEqual(matchesTagMatchString('GTD', ['OTHER'], { groups }), false);

    // Negating a group excludes any member.
    assert.strictEqual(matchesTagMatchString('+WORK-GTD', ['WORK', 'CONTROL'], { groups }), false);
    assert.strictEqual(matchesTagMatchString('+WORK-GTD', ['WORK'], { groups }), true);
  });
});
