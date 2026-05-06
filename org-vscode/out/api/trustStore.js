"use strict";

/*
  Trust Store
  -----------
  Persists per-extension consent decisions for org-vscode's public API.
  Each calling extension is identified by its publisher.name id (e.g.
  "wdtbrchan.mail-client-vscode"). The user grants or denies access on
  first use of registerLinkType / captureTodo from that caller.

  Storage shape (workspace state, key = TRUST_STORE_KEY):
    {
      "wdtbrchan.mail-client-vscode": {
        capabilities: { captureTodo: "allow", registerLinkType: "deny" },
        decidedAt: "2026-04-29T12:34:56.000Z"
      },
      ...
    }

  decision values: "allow" | "deny" | undefined (= ask)

  Decisions are intentionally per-workspace, not global. A SEL-approved
  workspace having allowed an extension does not grant that same extension
  rights in any other workspace.

  This module has no vscode dependency. The caller passes a Memento-shaped
  object (`{ get(key, default), update(key, value) }`) so it can be unit
  tested against a plain Map.
*/

const TRUST_STORE_KEY = "org-vscode.externalApi.trust";

const SUPPORTED_CAPABILITIES = Object.freeze(["registerLinkType", "captureTodo"]);
const VALID_DECISIONS = new Set(["allow", "deny"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeExtensionId(extensionId) {
  if (typeof extensionId !== "string") return null;
  const trimmed = extensionId.trim();
  if (!trimmed) return null;
  // VS Code extension ids look like "publisher.name". Tolerate the
  // "org-vscode-internal" sentinel used for first-party calls.
  if (!/^[A-Za-z0-9_\-]+(\.[A-Za-z0-9_\-]+)?$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeCapability(capability) {
  if (typeof capability !== "string") return null;
  return SUPPORTED_CAPABILITIES.includes(capability) ? capability : null;
}

function readAll(memento) {
  const raw = memento.get(TRUST_STORE_KEY, undefined);
  if (!isPlainObject(raw)) return {};
  return raw;
}

async function writeAll(memento, value) {
  // Memento.update returns Thenable<void> in VS Code; await for parity.
  await memento.update(TRUST_STORE_KEY, value);
}

function createTrustStore(memento) {
  if (!memento || typeof memento.get !== "function" || typeof memento.update !== "function") {
    throw new Error("createTrustStore requires a Memento-shaped object");
  }

  function getDecision(extensionId, capability) {
    const id = normalizeExtensionId(extensionId);
    const cap = normalizeCapability(capability);
    if (!id || !cap) return undefined;

    const all = readAll(memento);
    const entry = all[id];
    if (!isPlainObject(entry)) return undefined;
    const caps = isPlainObject(entry.capabilities) ? entry.capabilities : {};
    const decision = caps[cap];
    return VALID_DECISIONS.has(decision) ? decision : undefined;
  }

  async function setDecision(extensionId, capability, decision) {
    const id = normalizeExtensionId(extensionId);
    const cap = normalizeCapability(capability);
    if (!id || !cap) return false;
    if (!VALID_DECISIONS.has(decision)) return false;

    const all = readAll(memento);
    const prevEntry = isPlainObject(all[id]) ? all[id] : {};
    const prevCaps = isPlainObject(prevEntry.capabilities) ? prevEntry.capabilities : {};
    const next = {
      ...all,
      [id]: {
        ...prevEntry,
        capabilities: { ...prevCaps, [cap]: decision },
        decidedAt: new Date().toISOString()
      }
    };
    await writeAll(memento, next);
    return true;
  }

  async function revokeAll(extensionId) {
    const id = normalizeExtensionId(extensionId);
    if (!id) return false;
    const all = readAll(memento);
    if (!Object.prototype.hasOwnProperty.call(all, id)) return false;
    const next = { ...all };
    delete next[id];
    await writeAll(memento, next);
    return true;
  }

  function listEntries() {
    const all = readAll(memento);
    const out = [];
    for (const [id, entry] of Object.entries(all)) {
      if (!isPlainObject(entry)) continue;
      const caps = isPlainObject(entry.capabilities) ? entry.capabilities : {};
      out.push({
        extensionId: id,
        capabilities: { ...caps },
        decidedAt: typeof entry.decidedAt === "string" ? entry.decidedAt : null
      });
    }
    return out;
  }

  return {
    getDecision,
    setDecision,
    revokeAll,
    listEntries
  };
}

module.exports = {
  createTrustStore,
  normalizeExtensionId,
  SUPPORTED_CAPABILITIES,
  TRUST_STORE_KEY
};
