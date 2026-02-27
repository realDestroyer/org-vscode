const assert = require('assert');
const path = require('path');

module.exports = {
  name: 'unit/year-summary-tags',
  run() {
    const { parseOrgContent } = require(path.join(__dirname, '..', '..', 'out', 'yearSummary.js'));

    const raw = [
      '* [2026-01-02 Fri] Day',
      '* DONE Get Spare 2440a1 switches reachable remotely via vrf port :2440:SPARE: SCHEDULED: <2026-01-02> DEADLINE: <2026-01-02> CLOSED: [2026-01-02 Fri 11:08]',
      '* DONE Send reply email to Evergreen :LWS_MFG:LWS_LINE2:FUJI: SCHEDULED: <2026-01-02> DEADLINE: <2026-01-02> CLOSED: [2026-01-02 Fri 15:30]',
      '* DONE Create R&D Feedback file :SDN:TRAINING:FEEDBACK:RND: SCHEDULED: <2026-01-01> DEADLINE: <2026-01-15> CLOSED: [01-05-2026 Mon 08:22]'
    ].join('\n');

    const parsed = parseOrgContent(raw);
    assert.ok(parsed.days.length > 0, 'Expected at least one day');
    assert.strictEqual(parsed.days[0].tasks.length, 3, 'Expected three tasks on the day');

    const [t1, t2, t3] = parsed.days[0].tasks;

    assert.deepStrictEqual(t1.tags, ['2440', 'SPARE']);
    assert.ok(!t1.title.includes(':2440:SPARE:'), 'Title should not include tag syntax');

    assert.deepStrictEqual(t2.tags, ['LWS_MFG', 'LWS_LINE2', 'FUJI']);
    assert.ok(!t2.title.includes(':LWS_MFG:LWS_LINE2:FUJI:'), 'Title should not include tag syntax');

    assert.deepStrictEqual(t3.tags, ['SDN', 'TRAINING', 'FEEDBACK', 'RND']);
    assert.ok(!t3.title.includes(':SDN:TRAINING:FEEDBACK:RND:'), 'Title should not include tag syntax');
  }
};
