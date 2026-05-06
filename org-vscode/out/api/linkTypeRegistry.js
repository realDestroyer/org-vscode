"use strict";

/*
  Link Type Registry
  ------------------
  Holds custom org link scheme handlers contributed by other VS Code
  extensions via the public API (see extensionApi.js).

  Contract for a handler:

    {
      type: "msgid",                         // required, lowercased on register
      description: "Email Message-ID links", // optional, free text
      pattern: /^[^\s<>]+@[^\s<>]+$/,        // optional RegExp tested against path
      resolve(path, context) {                // required
        return {
          displayText: "...",                 // optional
          url: "vscode://...",                // optional URI string
          tooltip: "...",                     // optional
          exists: true,                       // optional
          metadata: {}                        // optional
        };
      },
      complete(prefix, context) {             // optional
        return [{ text, label, detail, sortPriority }];
      }
    }

  This module deliberately has no vscode dependency. The VS Code wiring
  (Disposable shape, caller attestation, prompts) lives in extensionApi.js
  so this can be unit-tested under plain Node.

  Trust note: registration here is intentionally unauthenticated. Callers
  should go through extensionApi.registerLinkType() which gates on
  trustStore consent before reaching this registry.
*/

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeType(type) {
  if (typeof type !== "string") return null;
  const trimmed = type.trim();
  if (!trimmed) return null;
  // Org link schemes are case-insensitive in our parser; force lowercase.
  // Allow only safe scheme characters to avoid surprises in URI building.
  if (!/^[a-z0-9][a-z0-9+\-.]*$/i.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

function validateHandler(handler) {
  if (!isPlainObject(handler)) {
    return { ok: false, reason: "Handler must be an object" };
  }
  const type = normalizeType(handler.type);
  if (!type) {
    return { ok: false, reason: "Handler.type must be a non-empty scheme string" };
  }
  if (typeof handler.resolve !== "function") {
    return { ok: false, reason: "Handler.resolve must be a function" };
  }
  if (handler.pattern !== undefined && !(handler.pattern instanceof RegExp)) {
    return { ok: false, reason: "Handler.pattern must be a RegExp when provided" };
  }
  if (handler.complete !== undefined && typeof handler.complete !== "function") {
    return { ok: false, reason: "Handler.complete must be a function when provided" };
  }
  // Built-in schemes are owned by org-vscode and may not be overridden.
  // This prevents a third party from shadowing https/file/id and silently
  // intercepting clicks the user expects to go to the built-in handler.
  const reserved = new Set([
    "http", "https", "mailto", "file", "id", "*", "#"
  ]);
  if (reserved.has(type)) {
    return { ok: false, reason: `Scheme "${type}" is reserved by org-vscode` };
  }
  return { ok: true, type };
}

function createLinkTypeRegistry() {
  // Map<string, { handler, ownerId }>
  const handlers = new Map();

  function register(handler, ownerId) {
    const validation = validateHandler(handler);
    if (!validation.ok) {
      const err = new Error(`Invalid link handler: ${validation.reason}`);
      err.code = "ORG_VSCODE_INVALID_HANDLER";
      throw err;
    }

    const type = validation.type;
    if (handlers.has(type)) {
      const existing = handlers.get(type);
      const err = new Error(
        `Link scheme "${type}" is already registered by ${existing.ownerId || "unknown"}`
      );
      err.code = "ORG_VSCODE_SCHEME_TAKEN";
      throw err;
    }

    handlers.set(type, { handler, ownerId: ownerId || "unknown" });

    let disposed = false;
    return {
      type,
      ownerId: ownerId || "unknown",
      dispose() {
        if (disposed) return;
        const current = handlers.get(type);
        // Only delete if it's still ours (defensive, in case of overrides).
        if (current && current.handler === handler) {
          handlers.delete(type);
        }
        disposed = true;
      }
    };
  }

  function getHandler(type) {
    const normalized = normalizeType(type);
    if (!normalized) return undefined;
    const entry = handlers.get(normalized);
    return entry ? entry.handler : undefined;
  }

  function hasType(type) {
    const normalized = normalizeType(type);
    if (!normalized) return false;
    return handlers.has(normalized);
  }

  function getTypes() {
    return Array.from(handlers.keys()).sort();
  }

  function getOwners() {
    const out = {};
    for (const [type, entry] of handlers.entries()) {
      out[type] = entry.ownerId;
    }
    return out;
  }

  function unregisterAllForOwner(ownerId) {
    if (!ownerId) return 0;
    let removed = 0;
    for (const [type, entry] of Array.from(handlers.entries())) {
      if (entry.ownerId === ownerId) {
        handlers.delete(type);
        removed += 1;
      }
    }
    return removed;
  }

  return {
    register,
    getHandler,
    hasType,
    getTypes,
    getOwners,
    unregisterAllForOwner
  };
}

// Module-level singleton used by orgLinkProvider's fallthrough.
const linkTypeRegistry = createLinkTypeRegistry();

module.exports = {
  createLinkTypeRegistry,
  linkTypeRegistry,
  // Exposed for tests
  normalizeType,
  validateHandler
};
