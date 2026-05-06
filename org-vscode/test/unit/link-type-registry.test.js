const assert = require('assert');
const path = require('path');

const {
  createLinkTypeRegistry,
  linkTypeRegistry,
  normalizeType,
  validateHandler
} = require(path.join(__dirname, '..', '..', 'out', 'api', 'linkTypeRegistry.js'));

function makeHandler(type, extra) {
  return Object.assign({
    type,
    description: `${type} handler`,
    resolve: (p) => ({ displayText: `${type}:${p}`, url: `https://example.com/${type}/${p}` })
  }, extra || {});
}

function testNormalizeType() {
  assert.strictEqual(normalizeType('MSGID'), 'msgid');
  assert.strictEqual(normalizeType('  Bug  '), 'bug');
  assert.strictEqual(normalizeType(''), null);
  assert.strictEqual(normalizeType(null), null);
  assert.strictEqual(normalizeType('has space'), null);
  assert.strictEqual(normalizeType('has/slash'), null);
}

function testValidateHandler() {
  assert.strictEqual(validateHandler(null).ok, false);
  assert.strictEqual(validateHandler({}).ok, false);
  assert.strictEqual(validateHandler({ type: 'msgid' }).ok, false, 'missing resolve');
  assert.strictEqual(validateHandler({ type: 'msgid', resolve: 'no' }).ok, false);
  assert.strictEqual(validateHandler({ type: 'msgid', resolve: () => ({}) }).ok, true);
  assert.strictEqual(
    validateHandler({ type: 'msgid', resolve: () => ({}), pattern: 'not-regex' }).ok,
    false
  );
  assert.strictEqual(
    validateHandler({ type: 'msgid', resolve: () => ({}), pattern: /x/ }).ok,
    true
  );

  // Reserved schemes
  for (const reserved of ['http', 'https', 'mailto', 'file', 'id']) {
    const r = validateHandler({ type: reserved, resolve: () => ({}) });
    assert.strictEqual(r.ok, false, `reserved scheme ${reserved} must be rejected`);
  }
}

function testRegisterAndDispose() {
  const registry = createLinkTypeRegistry();
  const handler = makeHandler('msgid');
  const d = registry.register(handler, 'pub.email');
  assert.strictEqual(registry.hasType('msgid'), true);
  assert.strictEqual(registry.hasType('MSGID'), true);
  assert.strictEqual(registry.getHandler('msgid'), handler);
  assert.deepStrictEqual(registry.getTypes(), ['msgid']);

  d.dispose();
  assert.strictEqual(registry.hasType('msgid'), false);
  // Idempotent dispose
  d.dispose();
}

function testDuplicateRegistrationThrows() {
  const registry = createLinkTypeRegistry();
  registry.register(makeHandler('bug'), 'pub.a');
  assert.throws(() => registry.register(makeHandler('bug'), 'pub.b'), /already registered/);
}

function testInvalidHandlerThrows() {
  const registry = createLinkTypeRegistry();
  assert.throws(() => registry.register({}), /Invalid link handler/);
  assert.throws(() => registry.register({ type: 'http', resolve: () => ({}) }), /reserved/);
}

function testUnregisterAllForOwner() {
  const registry = createLinkTypeRegistry();
  registry.register(makeHandler('a'), 'pub.x');
  registry.register(makeHandler('b'), 'pub.x');
  registry.register(makeHandler('c'), 'pub.y');
  assert.strictEqual(registry.unregisterAllForOwner('pub.x'), 2);
  assert.deepStrictEqual(registry.getTypes(), ['c']);
}

function testSingletonIsIsolatedAcrossTests() {
  // The exported singleton must be usable; cleanup after.
  const initial = linkTypeRegistry.getTypes().length;
  const d = linkTypeRegistry.register(makeHandler('zzunique'), 'pub.test');
  assert.strictEqual(linkTypeRegistry.getTypes().length, initial + 1);
  d.dispose();
  assert.strictEqual(linkTypeRegistry.getTypes().length, initial);
}

module.exports = {
  name: 'unit/link-type-registry',
  run: () => {
    testNormalizeType();
    testValidateHandler();
    testRegisterAndDispose();
    testDuplicateRegistrationThrows();
    testInvalidHandlerThrows();
    testUnregisterAllForOwner();
    testSingletonIsIsolatedAcrossTests();
  }
};
