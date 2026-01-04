const assert = require('assert');
const path = require('path');

const {
  upsertCheckboxCookieInHeadline,
  removeCheckboxCookieFromHeadline
} = require(path.join(__dirname, '..', '..', 'out', 'toggleCheckboxCookie.js'));

function testUpsertCookiePlacementBeforeTags() {
  const line = '* Heading :WORK:HOME:';
  assert.strictEqual(
    upsertCheckboxCookieInHeadline(line, 'fraction'),
    '* Heading [0/0] :WORK:HOME:'
  );

  assert.strictEqual(
    upsertCheckboxCookieInHeadline(line, 'percent'),
    '* Heading [0%] :WORK:HOME:'
  );
}

function testReplaceCookieInPlace() {
  const line = '* Heading [2/3] :TAG:';
  assert.strictEqual(
    upsertCheckboxCookieInHeadline(line, 'percent'),
    '* Heading [0%] :TAG:'
  );
}

function testRemoveCookie() {
  const line = '* Heading [2/3] :TAG:';
  assert.strictEqual(
    removeCheckboxCookieFromHeadline(line),
    '* Heading :TAG:'
  );
}

function testListItemCookieInsertion() {
  const line = '    - [-] Deliver country loving';
  assert.strictEqual(
    upsertCheckboxCookieInHeadline(line, 'fraction'),
    '    - [-] Deliver country loving [0/0]'
  );
}

module.exports = {
  name: 'unit/checkbox-cookie-toggle',
  run: () => {
    testUpsertCookiePlacementBeforeTags();
    testReplaceCookieInPlace();
    testRemoveCookie();
    testListItemCookieInsertion();
  }
};
