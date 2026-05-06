const assert = require('assert');
const path = require('path');

const {
  sanitizePayload,
  sanitizeLink,
  formatEntry,
  spliceEntry,
  CaptureValidationError,
  MAX_HEADLINE_LEN,
  MAX_BODY_LEN
} = require(path.join(__dirname, '..', '..', 'out', 'api', 'captureTodo.js'));

function expectThrows(fn, messageRe) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof CaptureValidationError, `expected CaptureValidationError, got ${e && e.name}`);
    if (messageRe) assert.ok(messageRe.test(e.message), `message "${e.message}" does not match ${messageRe}`);
    return;
  }
  throw new Error('expected throw, got none');
}

function testRequiresHeadline() {
  expectThrows(() => sanitizePayload({}), /headline is required/);
  expectThrows(() => sanitizePayload({ headline: '   ' }), /headline is required/);
}

function testHeadlineCollapsesNewlines() {
  const out = sanitizePayload({ headline: 'first line\nsecond line\twith tab' });
  assert.strictEqual(out.headline, 'first line second line with tab');
}

function testRejectsSrcInHeadline() {
  expectThrows(
    () => sanitizePayload({ headline: 'evil\n#+BEGIN_SRC sh\nrm -rf /\n#+END_SRC' }),
    /source blocks/
  );
}

function testRejectsForbiddenLinkFormsInHeadline() {
  expectThrows(
    () => sanitizePayload({ headline: 'click [[file:secrets.txt][here]]' }),
    /file:|forbid/i
  );
  expectThrows(
    () => sanitizePayload({ headline: 'goto [[*Inbox]]' }),
    /heading|forbid/i
  );
}

function testHeadlineLengthCap() {
  const long = 'A'.repeat(MAX_HEADLINE_LEN + 100);
  const out = sanitizePayload({ headline: long });
  assert.strictEqual(out.headline.length, MAX_HEADLINE_LEN);
}

function testStateValidation() {
  const out = sanitizePayload({ headline: 'h', state: 'in_progress' });
  assert.strictEqual(out.state, 'IN_PROGRESS');
  expectThrows(() => sanitizePayload({ headline: 'h', state: 'with space' }));
  expectThrows(() => sanitizePayload({ headline: 'h', state: '123BAD' }));
}

function testStateAllowedList() {
  const out = sanitizePayload({ headline: 'h', state: 'TODO' }, ['TODO', 'DONE']);
  assert.strictEqual(out.state, 'TODO');
  expectThrows(
    () => sanitizePayload({ headline: 'h', state: 'WIP' }, ['TODO', 'DONE']),
    /not one of the configured/
  );
}

function testTags() {
  const out = sanitizePayload({ headline: 'h', tags: ['email', 'urgent', 'email'] });
  assert.deepStrictEqual(out.tags, ['email', 'urgent']);
  expectThrows(() => sanitizePayload({ headline: 'h', tags: 'not-array' }));
  expectThrows(() => sanitizePayload({ headline: 'h', tags: ['has space'] }));
}

function testPropertiesValidation() {
  const out = sanitizePayload({
    headline: 'h',
    properties: { msgid: '<abc@host>', from: 'a@b' }
  });
  // Keys uppercased
  const keys = out.properties.map(p => p.key);
  assert.ok(keys.includes('MSGID'));
  assert.ok(keys.includes('FROM'));
  expectThrows(() => sanitizePayload({ headline: 'h', properties: { 'bad key': 'x' } }));
  expectThrows(() => sanitizePayload({ headline: 'h', properties: 'not-object' }));
}

function testBodySanitization() {
  expectThrows(() => sanitizePayload({ headline: 'h', body: '#+BEGIN_SRC sh\nrm\n#+END_SRC' }), /source blocks/);
  expectThrows(() => sanitizePayload({ headline: 'h', body: 'see [[file:/etc/passwd]]' }));
  // Newlines preserved
  const out = sanitizePayload({ headline: 'h', body: 'line1\nline2\r\nline3' });
  assert.ok(out.body.includes('line1\nline2\nline3'));
  // Length cap
  const out2 = sanitizePayload({ headline: 'h', body: 'x'.repeat(MAX_BODY_LEN + 50) });
  assert.strictEqual(out2.body.length, MAX_BODY_LEN);
}

function testTimestampValidation() {
  const out = sanitizePayload({ headline: 'h', scheduled: '2026-04-29' });
  assert.strictEqual(out.scheduled, '2026-04-29');
  const out2 = sanitizePayload({ headline: 'h', deadline: '2026-04-29 10:30' });
  assert.strictEqual(out2.deadline, '2026-04-29 10:30');
  expectThrows(() => sanitizePayload({ headline: 'h', scheduled: 'tomorrow' }));
}

function testLinkValidation() {
  // Happy path: built-in scheme with description.
  const out = sanitizePayload({
    headline: 'h',
    link: { scheme: 'mailto', path: 'a@b', description: 'a@b' }
  });
  assert.strictEqual(out.link.scheme, 'mailto');
  assert.strictEqual(out.link.path, 'a@b');
  assert.strictEqual(out.link.description, 'a@b');
  assert.strictEqual(out.link.rendered, '[[mailto:a@b][a@b]]');

  // Happy path: no description renders as [[scheme:path]].
  const noDesc = sanitizePayload({
    headline: 'h',
    link: { scheme: 'https', path: 'example.com/path' }
  });
  assert.strictEqual(noDesc.link.rendered, '[[https:example.com/path]]');

  // String form is no longer accepted.
  expectThrows(
    () => sanitizePayload({ headline: 'h', link: '[[mailto:a@b][a@b]]' }),
    /must be an object/
  );

  // file: and id: are explicitly forbidden.
  expectThrows(
    () => sanitizePayload({ headline: 'h', link: { scheme: 'file', path: 'secrets.txt' } }),
    /not permitted/
  );
  expectThrows(
    () => sanitizePayload({ headline: 'h', link: { scheme: 'id', path: 'abc' } }),
    /not permitted/
  );

  // Unknown / unregistered schemes are rejected.
  expectThrows(
    () => sanitizePayload({ headline: 'h', link: { scheme: 'msgid', path: 'abc@x' } }),
    /allowlist/
  );

  // Registered schemes pass via the knownSchemes option.
  const reg = sanitizePayload(
    { headline: 'h', link: { scheme: 'msgid', path: 'abc@x' } },
    undefined,
    { knownSchemes: ['msgid'] }
  );
  assert.strictEqual(reg.link.rendered, '[[msgid:abc@x]]');

  // Bracket characters in path are rejected (cannot escape the form).
  expectThrows(
    () => sanitizePayload({
      headline: 'h',
      link: { scheme: 'https', path: 'evil][[file:secrets' }
    }),
    /\[/
  );

  // Bracket characters in description are rejected.
  expectThrows(
    () => sanitizePayload({
      headline: 'h',
      link: { scheme: 'https', path: 'a.com', description: 'see][[file:x' }
    }),
    /\[/
  );

  // Missing scheme.
  expectThrows(
    () => sanitizePayload({ headline: 'h', link: { path: 'a@b' } }),
    /scheme/
  );

  // Missing path.
  expectThrows(
    () => sanitizePayload({ headline: 'h', link: { scheme: 'mailto' } }),
    /path/
  );

  // sanitizeLink is exported as its own helper.
  const direct = sanitizeLink({ scheme: 'mailto', path: 'a@b' });
  assert.strictEqual(direct.rendered, '[[mailto:a@b]]');
}

function testFormatEntryShape() {
  const sanitized = sanitizePayload({
    headline: 'Reply to RFP',
    state: 'TODO',
    tags: ['email'],
    scheduled: '2026-04-30',
    properties: { msgid: '<abc@x>', from: 'sender@x' },
    body: 'See attached.',
    link: { scheme: 'mailto', path: 'sender@x', description: 'sender@x' }
  });
  const out = formatEntry(sanitized, {
    headingLevel: 2,
    capturedBy: 'pub.email',
    now: new Date('2026-04-29T15:00:00')
  });
  assert.ok(out.startsWith('** TODO Reply to RFP :email:'), `headline: ${out.split('\n')[0]}`);
  assert.ok(out.includes('SCHEDULED: <2026-04-30>'));
  assert.ok(out.includes(':PROPERTIES:'));
  assert.ok(out.includes(':CAPTURED:'));
  assert.ok(out.includes(':CAPTURED_BY: pub.email'));
  assert.ok(out.includes(':MSGID: <abc@x>'));
  assert.ok(out.includes(':END:'));
  assert.ok(out.includes('[[mailto:sender@x][sender@x]]'));
  assert.ok(out.includes('See attached.'));
}

function testFormatEntryRejectsReservedPropertyOverrides() {
  const sanitized = sanitizePayload({
    headline: 'h',
    properties: { CAPTURED: 'spoofed', CAPTURED_BY: 'spoofed' }
  });
  const out = formatEntry(sanitized, { capturedBy: 'pub.real', now: new Date('2026-01-01T00:00:00') });
  // CAPTURED line should appear exactly once and be the system one.
  const capturedLines = out.split('\n').filter(l => /:CAPTURED:/.test(l));
  assert.strictEqual(capturedLines.length, 1);
  assert.ok(!capturedLines[0].includes('spoofed'));
  const capturedByLines = out.split('\n').filter(l => /:CAPTURED_BY:/.test(l));
  assert.strictEqual(capturedByLines.length, 1);
  assert.ok(capturedByLines[0].includes('pub.real'));
}

function testSpliceEntryAppendsToInbox() {
  const existing = '* Inbox\n  some intro\n\n* Other\n';
  const block = '** TODO New thing\n  :PROPERTIES:\n  :CAPTURED: [2026-01-01 00:00]\n  :END:';
  const next = spliceEntry(existing, block, '* Inbox');
  assert.ok(next.includes('** TODO New thing'));
  // Should appear before * Other
  const newIdx = next.indexOf('** TODO New thing');
  const otherIdx = next.indexOf('* Other');
  assert.ok(newIdx < otherIdx, 'new entry should be inside Inbox section');
}

function testSpliceEntryCreatesHeadingIfMissing() {
  const existing = '* Other\n  body\n';
  const block = '** TODO X\n  :PROPERTIES:\n  :CAPTURED: [2026-01-01 00:00]\n  :END:';
  const next = spliceEntry(existing, block, '* Inbox');
  assert.ok(next.includes('* Inbox'));
  assert.ok(next.includes('** TODO X'));
}

function testSpliceEntryEmptyFile() {
  const next = spliceEntry('', '** TODO X\n  :PROPERTIES:\n  :END:', '* Inbox');
  assert.ok(next.includes('* Inbox'));
  assert.ok(next.includes('** TODO X'));
}

module.exports = {
  name: 'unit/capture-todo',
  run: () => {
    testRequiresHeadline();
    testHeadlineCollapsesNewlines();
    testRejectsSrcInHeadline();
    testRejectsForbiddenLinkFormsInHeadline();
    testHeadlineLengthCap();
    testStateValidation();
    testStateAllowedList();
    testTags();
    testPropertiesValidation();
    testBodySanitization();
    testTimestampValidation();
    testLinkValidation();
    testFormatEntryShape();
    testFormatEntryRejectsReservedPropertyOverrides();
    testSpliceEntryAppendsToInbox();
    testSpliceEntryCreatesHeadingIfMissing();
    testSpliceEntryEmptyFile();
  }
};
