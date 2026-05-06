const assert = require('assert');
const path = require('path');

const {
  createTrustStore,
  normalizeExtensionId,
  TRUST_STORE_KEY
} = require(path.join(__dirname, '..', '..', 'out', 'api', 'trustStore.js'));

function makeMemento(initial) {
  const store = new Map();
  if (initial) {
    for (const [k, v] of Object.entries(initial)) store.set(k, v);
  }
  return {
    get: (key, def) => (store.has(key) ? store.get(key) : def),
    update: async (key, value) => {
      if (value === undefined) store.delete(key);
      else store.set(key, value);
    },
    _raw: store
  };
}

function testNormalizeExtensionId() {
  assert.strictEqual(normalizeExtensionId('publisher.name'), 'publisher.name');
  assert.strictEqual(normalizeExtensionId('  publisher.name  '), 'publisher.name');
  assert.strictEqual(normalizeExtensionId('org-vscode-internal'), 'org-vscode-internal');
  assert.strictEqual(normalizeExtensionId(''), null);
  assert.strictEqual(normalizeExtensionId('bad name'), null);
  assert.strictEqual(normalizeExtensionId('a.b.c'), null);
}

async function testRoundTripDecisions() {
  const memento = makeMemento();
  const store = createTrustStore(memento);

  assert.strictEqual(store.getDecision('pub.email', 'captureTodo'), undefined);

  const ok = await store.setDecision('pub.email', 'captureTodo', 'allow');
  assert.strictEqual(ok, true);
  assert.strictEqual(store.getDecision('pub.email', 'captureTodo'), 'allow');

  await store.setDecision('pub.email', 'registerLinkType', 'deny');
  assert.strictEqual(store.getDecision('pub.email', 'registerLinkType'), 'deny');
  // Capability decisions are independent.
  assert.strictEqual(store.getDecision('pub.email', 'captureTodo'), 'allow');

  const entries = store.listEntries();
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].extensionId, 'pub.email');
  assert.strictEqual(entries[0].capabilities.captureTodo, 'allow');
  assert.strictEqual(entries[0].capabilities.registerLinkType, 'deny');
  assert.ok(entries[0].decidedAt, 'decidedAt should be set');
}

async function testInvalidInputsRejected() {
  const memento = makeMemento();
  const store = createTrustStore(memento);

  assert.strictEqual(await store.setDecision('', 'captureTodo', 'allow'), false);
  assert.strictEqual(await store.setDecision('pub.email', 'unknownCap', 'allow'), false);
  assert.strictEqual(await store.setDecision('pub.email', 'captureTodo', 'maybe'), false);
}

async function testRevoke() {
  const memento = makeMemento();
  const store = createTrustStore(memento);
  await store.setDecision('pub.x', 'captureTodo', 'allow');
  assert.strictEqual(await store.revokeAll('pub.x'), true);
  assert.strictEqual(store.getDecision('pub.x', 'captureTodo'), undefined);
  assert.strictEqual(await store.revokeAll('pub.x'), false, 'second revoke is a no-op');
}

function testRequiresMemento() {
  assert.throws(() => createTrustStore(null), /Memento/);
  assert.throws(() => createTrustStore({ get: () => null }), /Memento/);
}

function testIgnoresCorruptStorage() {
  const memento = makeMemento({ [TRUST_STORE_KEY]: 'not-an-object' });
  const store = createTrustStore(memento);
  assert.strictEqual(store.getDecision('pub.x', 'captureTodo'), undefined);
  assert.deepStrictEqual(store.listEntries(), []);
}

module.exports = {
  name: 'unit/trust-store',
  run: async () => {
    testNormalizeExtensionId();
    await testRoundTripDecisions();
    await testInvalidInputsRejected();
    await testRevoke();
    testRequiresMemento();
    testIgnoresCorruptStorage();
  }
};
