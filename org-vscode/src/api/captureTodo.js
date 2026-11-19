"use strict";

/*
  Capture TODO
  ------------
  Append a structured TODO entry to a configured org inbox file.

  This module exposes two layers:

  1. Pure helpers (sanitizePayload, formatEntry) — no vscode dependency,
     unit-testable. These own the formatting invariants so external callers
     never have to format org by hand.

  2. captureTodo(payload, options) — the orchestrating function used by
     both the public API path (extensionApi) and the internal command.
     This is the layer that touches vscode (loaded lazily so the helpers
     remain testable in plain Node).

  Threat model:
   - Payloads come from external extensions and may carry user-controlled
     content (email body, subject, sender, etc.). Treat as untrusted.
   - Reject #+BEGIN_SRC blocks anywhere in body/headline so the captured
     entry can never become an RCE vector via the existing CodeLens
     "Execute Src Block" path.
   - Restrict link forms in body/headline to mailto:, https:, and
     custom-registered schemes. Specifically reject file:, id:, *heading,
     #anchor since those can navigate outside the inbox or to user data.
   - Cap all string fields. Strip control chars (except newlines/tabs in
     body, which are preserved).
*/

const SCHEDULED_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/;

const MAX_HEADLINE_LEN = 500;
const MAX_BODY_LEN = 8000;
const MAX_PROPERTY_VALUE_LEN = 1000;
const MAX_TAGS = 32;
const MAX_PROPERTIES = 64;
const MAX_LINK_LEN = 2000;

const SRC_BLOCK_RE = /^\s*#\+BEGIN_SRC\b/im;
// Headlines collapse all whitespace, so the line-anchored form above won't
// catch a hostile single-line "evil #+BEGIN_SRC sh ..." payload. Use a
// looser anywhere-in-string match for headlines specifically.
const SRC_BLOCK_ANYWHERE_RE = /#\+BEGIN_SRC\b/i;
const FORBIDDEN_LINK_FORM_RE = /\[\[\s*(?:file:|id:|\*|#)/i;
// Allow only a conservative scheme charset in property keys.
const PROPERTY_KEY_RE = /^[A-Za-z][A-Za-z0-9_\-]*$/;
// Tag charset matches org-mode: alphanumerics, _, @, #, %, -.
const TAG_RE = /^[A-Za-z0-9_@#%\-]+$/;

// Built-in schemes that captureTodo will accept without an explicit
// registration. file:, id:, *heading, and #anchor are intentionally absent
// because they navigate to user data outside the inbox.
const BUILT_IN_LINK_SCHEMES = ["http", "https", "mailto"];
// Mirror of linkTypeRegistry's normalizeType regex so payloads validate
// the same way registered schemes do.
const LINK_SCHEME_RE = /^[a-z0-9][a-z0-9+\-.]*$/;
const FORBIDDEN_LINK_SCHEMES = new Set(["file", "id"]);

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stripControlChars(str, { allowNewlines = false } = {}) {
  if (typeof str !== "string") return "";
  // Remove C0 control chars except optionally \n and \t. Strip C1.
  // \u0000-\u0008, \u000B, \u000C, \u000E-\u001F, \u007F, \u0080-\u009F.
  if (allowNewlines) {
    return str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "");
  }
  return str.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
}

function clampLen(str, max) {
  if (typeof str !== "string") return "";
  if (str.length <= max) return str;
  return str.slice(0, max);
}

class CaptureValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "CaptureValidationError";
    this.code = "ORG_VSCODE_CAPTURE_INVALID";
  }
}

function sanitizePayload(rawPayload, allowedWorkflowStates, sanitizeOptions) {
  if (!sanitizeOptions || typeof sanitizeOptions !== "object") {
    sanitizeOptions = {};
  }
  if (!isPlainObject(rawPayload)) {
    throw new CaptureValidationError("Payload must be an object");
  }

  // ---- headline (required) ------------------------------------------------
  // Preserve newlines/tabs through the control-char strip so the next step
  // can collapse them into single spaces (otherwise "a\nb" becomes "ab").
  const headlineInput = stripControlChars(
    String(rawPayload.headline || ""),
    { allowNewlines: true }
  );
  // Headlines must be a single line; collapse any embedded whitespace.
  const headlineCollapsed = headlineInput.replace(/\s+/g, " ").trim();
  if (!headlineCollapsed) {
    throw new CaptureValidationError("Payload.headline is required");
  }
  if (SRC_BLOCK_ANYWHERE_RE.test(headlineCollapsed)) {
    throw new CaptureValidationError("Headline may not contain source blocks");
  }
  if (FORBIDDEN_LINK_FORM_RE.test(headlineCollapsed)) {
    throw new CaptureValidationError(
      "Headline may not contain file:, id:, *heading, or #anchor links"
    );
  }
  const headline = clampLen(headlineCollapsed, MAX_HEADLINE_LEN);

  // ---- state --------------------------------------------------------------
  const stateInput = typeof rawPayload.state === "string"
    ? rawPayload.state.trim().toUpperCase()
    : "TODO";
  if (!stateInput) {
    throw new CaptureValidationError("Payload.state must be a non-empty workflow keyword");
  }
  if (!/^[A-Z][A-Z0-9_]*$/.test(stateInput)) {
    throw new CaptureValidationError("Payload.state contains invalid characters");
  }
  if (Array.isArray(allowedWorkflowStates) && allowedWorkflowStates.length > 0) {
    const allowed = allowedWorkflowStates.map((s) => String(s).toUpperCase());
    if (!allowed.includes(stateInput)) {
      throw new CaptureValidationError(
        `Payload.state "${stateInput}" is not one of the configured workflow states`
      );
    }
  }
  const state = stateInput;

  // ---- tags ---------------------------------------------------------------
  let tags = [];
  if (rawPayload.tags !== undefined) {
    if (!Array.isArray(rawPayload.tags)) {
      throw new CaptureValidationError("Payload.tags must be an array of strings");
    }
    if (rawPayload.tags.length > MAX_TAGS) {
      throw new CaptureValidationError(`Payload.tags exceeds limit of ${MAX_TAGS}`);
    }
    const seen = new Set();
    for (const t of rawPayload.tags) {
      if (typeof t !== "string") continue;
      const cleaned = stripControlChars(t).trim();
      if (!cleaned) continue;
      if (!TAG_RE.test(cleaned)) {
        throw new CaptureValidationError(`Invalid tag: "${cleaned}"`);
      }
      if (!seen.has(cleaned)) {
        seen.add(cleaned);
        tags.push(cleaned);
      }
    }
  }

  // ---- scheduled / deadline ----------------------------------------------
  function validateTimestamp(value, fieldName) {
    if (value === undefined || value === null || value === "") return undefined;
    if (typeof value !== "string") {
      throw new CaptureValidationError(`Payload.${fieldName} must be a string`);
    }
    const trimmed = value.trim();
    // Accept either ISO YYYY-MM-DD[ HH:MM] or already-formatted org timestamp.
    if (SCHEDULED_RE.test(trimmed)) return trimmed;
    if (/^<\d{4}-\d{2}-\d{2}[^>]*>$/.test(trimmed)) return trimmed;
    throw new CaptureValidationError(
      `Payload.${fieldName} must be YYYY-MM-DD, YYYY-MM-DD HH:MM, or an org timestamp`
    );
  }

  const scheduled = validateTimestamp(rawPayload.scheduled, "scheduled");
  const deadline = validateTimestamp(rawPayload.deadline, "deadline");

  // ---- properties ---------------------------------------------------------
  const properties = [];
  if (rawPayload.properties !== undefined) {
    if (!isPlainObject(rawPayload.properties)) {
      throw new CaptureValidationError("Payload.properties must be an object");
    }
    const entries = Object.entries(rawPayload.properties);
    if (entries.length > MAX_PROPERTIES) {
      throw new CaptureValidationError(`Payload.properties exceeds limit of ${MAX_PROPERTIES}`);
    }
    for (const [key, rawValue] of entries) {
      if (!PROPERTY_KEY_RE.test(key)) {
        throw new CaptureValidationError(`Invalid property key: "${key}"`);
      }
      const upperKey = key.toUpperCase();
      const stringValue = rawValue === undefined || rawValue === null
        ? ""
        : String(rawValue);
      const cleaned = clampLen(
        stripControlChars(stringValue).replace(/\s+/g, " ").trim(),
        MAX_PROPERTY_VALUE_LEN
      );
      properties.push({ key: upperKey, value: cleaned });
    }
  }

  // ---- body ---------------------------------------------------------------
  let body = "";
  if (rawPayload.body !== undefined && rawPayload.body !== null) {
    if (typeof rawPayload.body !== "string") {
      throw new CaptureValidationError("Payload.body must be a string");
    }
    if (SRC_BLOCK_RE.test(rawPayload.body)) {
      throw new CaptureValidationError("Body may not contain source blocks");
    }
    if (FORBIDDEN_LINK_FORM_RE.test(rawPayload.body)) {
      throw new CaptureValidationError(
        "Body may not contain file:, id:, *heading, or #anchor links"
      );
    }
    body = clampLen(
      stripControlChars(rawPayload.body, { allowNewlines: true }).replace(/\r\n?/g, "\n"),
      MAX_BODY_LEN
    );
  }

  // ---- link (optional convenience) ---------------------------------------
  // Structured form only: { scheme, path, description? }. The string form
  // was considered for parity with Emacs Org's [[scheme:path][desc]] syntax
  // but rejected for v1: org-vscode owns the formatting invariants for the
  // rest of the captured node and validating scheme as a discrete field
  // (instead of regex-parsing a hand-rolled bracket string) keeps the
  // allowlist enforcement honest.
  let link;
  if (rawPayload.link !== undefined && rawPayload.link !== null) {
    link = sanitizeLink(rawPayload.link, sanitizeOptions.knownSchemes);
  }

  return {
    headline,
    state,
    tags,
    scheduled,
    deadline,
    properties,
    body,
    link
  };
}

function sanitizeLink(rawLink, knownSchemesArg) {
  if (!isPlainObject(rawLink)) {
    throw new CaptureValidationError(
      "Payload.link must be an object { scheme, path, description? }"
    );
  }

  if (typeof rawLink.scheme !== "string") {
    throw new CaptureValidationError("Payload.link.scheme must be a string");
  }
  const scheme = stripControlChars(rawLink.scheme).trim().toLowerCase();
  if (!scheme) {
    throw new CaptureValidationError("Payload.link.scheme must be a non-empty string");
  }
  if (!LINK_SCHEME_RE.test(scheme)) {
    throw new CaptureValidationError(
      `Payload.link.scheme "${scheme}" contains unsupported characters`
    );
  }
  if (FORBIDDEN_LINK_SCHEMES.has(scheme)) {
    throw new CaptureValidationError(
      `Payload.link.scheme "${scheme}" is not permitted (file:/id: navigate outside the inbox)`
    );
  }
  const knownSchemes = Array.isArray(knownSchemesArg) ? knownSchemesArg : [];
  const allowed = new Set([
    ...BUILT_IN_LINK_SCHEMES,
    ...knownSchemes
      .filter((s) => typeof s === "string")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  ]);
  if (!allowed.has(scheme)) {
    throw new CaptureValidationError(
      `Payload.link.scheme "${scheme}" is not in the allowlist; ` +
      `register it via orgApi.registerLinkType() before using it in captureTodo()`
    );
  }

  if (typeof rawLink.path !== "string") {
    throw new CaptureValidationError("Payload.link.path must be a string");
  }
  // Paths must be a single line; strip control chars then collapse newlines
  // to spaces so a multi-line path can't break out of the [[...]] form.
  const pathSanitized = stripControlChars(rawLink.path, { allowNewlines: true })
    .replace(/\s+/g, " ")
    .trim();
  if (!pathSanitized) {
    throw new CaptureValidationError("Payload.link.path must be a non-empty string");
  }
  if (pathSanitized.length > MAX_LINK_LEN) {
    throw new CaptureValidationError("Payload.link.path exceeds length limit");
  }
  // Disallow characters that would break out of the [[scheme:path]...] form.
  if (/[\[\]]/.test(pathSanitized)) {
    throw new CaptureValidationError(
      "Payload.link.path may not contain '[' or ']'"
    );
  }

  let description;
  if (rawLink.description !== undefined && rawLink.description !== null) {
    if (typeof rawLink.description !== "string") {
      throw new CaptureValidationError("Payload.link.description must be a string");
    }
    const desc = stripControlChars(rawLink.description, { allowNewlines: true })
      .replace(/\s+/g, " ")
      .trim();
    if (desc) {
      if (desc.length > MAX_LINK_LEN) {
        throw new CaptureValidationError(
          "Payload.link.description exceeds length limit"
        );
      }
      if (/[\[\]]/.test(desc)) {
        throw new CaptureValidationError(
          "Payload.link.description may not contain '[' or ']'"
        );
      }
      description = desc;
    }
  }

  const target = `${scheme}:${pathSanitized}`;
  const rendered = description
    ? `[[${target}][${description}]]`
    : `[[${target}]]`;

  return { scheme, path: pathSanitized, description, rendered };
}

function buildHeadlineLine(level, state, headline, tags) {
  const stars = "*".repeat(Math.max(1, level));
  const tagSuffix = tags.length > 0 ? ` :${tags.join(":")}:` : "";
  return `${stars} ${state} ${headline}${tagSuffix}`;
}

function buildPlanningLine(scheduled, deadline) {
  const parts = [];
  if (scheduled) parts.push(`SCHEDULED: ${formatTimestamp(scheduled)}`);
  if (deadline) parts.push(`DEADLINE: ${formatTimestamp(deadline)}`);
  return parts.length > 0 ? parts.join(" ") : null;
}

function formatTimestamp(value) {
  // If already wrapped, leave it alone.
  if (/^<.*>$/.test(value)) return value;
  return `<${value}>`;
}

function formatEntry(sanitized, options = {}) {
  const level = Number.isInteger(options.headingLevel) && options.headingLevel >= 1
    ? options.headingLevel
    : 2;
  const indent = "  "; // body/property/planning indented 2 spaces under heading
  const now = options.now instanceof Date ? options.now : new Date();
  const stamp = formatIsoStamp(now);

  const lines = [];
  lines.push(buildHeadlineLine(level, sanitized.state, sanitized.headline, sanitized.tags));

  const planning = buildPlanningLine(sanitized.scheduled, sanitized.deadline);
  if (planning) {
    lines.push(`${indent}${planning}`);
  }

  // Property drawer always present so we can stamp :CAPTURED:.
  lines.push(`${indent}:PROPERTIES:`);
  // Stamp the captured-at time first so reviewers can sort/filter on it.
  lines.push(`${indent}:CAPTURED: ${stamp}`);
  if (options.capturedBy) {
    // String already validated as an extension id by the caller.
    lines.push(`${indent}:CAPTURED_BY: ${options.capturedBy}`);
  }
  for (const prop of sanitized.properties) {
    // CAPTURED / CAPTURED_BY are reserved; payload values cannot override.
    if (prop.key === "CAPTURED" || prop.key === "CAPTURED_BY") continue;
    lines.push(`${indent}:${prop.key}: ${prop.value}`);
  }
  lines.push(`${indent}:END:`);

  if (sanitized.link) {
    // sanitizeLink returns { scheme, path, description, rendered }; the
    // pre-rendered bracket form is what we splice into the entry.
    lines.push(`${indent}${sanitized.link.rendered}`);
  }

  if (sanitized.body) {
    const bodyLines = sanitized.body.split("\n");
    for (const bl of bodyLines) {
      lines.push(bl ? `${indent}${bl}` : "");
    }
  }

  return lines.join("\n");
}

function formatIsoStamp(date) {
  // YYYY-MM-DD HH:MM (org-style inactive timestamp body).
  const pad = (n) => String(n).padStart(2, "0");
  return `[${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}]`;
}

/*
  Splice an entry block into existing file content under a target heading.
  If the target heading is not found, append a new top-level heading and
  the entry beneath it. Returns the new full file content.

  - existingContent: string (possibly empty)
  - entryBlock: pre-formatted lines from formatEntry
  - targetHeading: like "* Inbox" (optional, default = top of file)
*/
function spliceEntry(existingContent, entryBlock, targetHeading) {
  const trimmedTarget = typeof targetHeading === "string" ? targetHeading.trim() : "";
  const eol = existingContent.includes("\r\n") ? "\r\n" : "\n";
  const lines = existingContent.length === 0 ? [] : existingContent.split(/\r?\n/);

  // Compute the heading level from the entry's first line so we can pick
  // a parent heading that's strictly higher (fewer stars).
  const entryFirst = entryBlock.split(/\r?\n/)[0] || "";
  const entryLevelMatch = entryFirst.match(/^(\*+)\s/);
  const entryLevel = entryLevelMatch ? entryLevelMatch[1].length : 2;

  if (!trimmedTarget) {
    // No target: append at end of file.
    return appendBlock(lines, entryBlock, eol);
  }

  // Find target heading by exact match (after trimming trailing whitespace).
  const targetIdx = lines.findIndex((line) => line.trimEnd() === trimmedTarget);
  if (targetIdx === -1) {
    // Target heading missing: create it at end of file, then add entry.
    const headerLines = lines.length > 0 && lines[lines.length - 1] !== ""
      ? ["", trimmedTarget]
      : [trimmedTarget];
    const withHeader = lines.concat(headerLines);
    return appendBlock(withHeader, entryBlock, eol);
  }

  // Find end of the target heading's section: next heading with level <=
  // target level, or end of file.
  const targetLevelMatch = lines[targetIdx].match(/^\s*(?:[⊙⊘⊜⊖⊗]\s*)?(\*+)\s/);
  const targetLevel = targetLevelMatch ? targetLevelMatch[1].length : 1;
  if (entryLevel <= targetLevel) {
    // Don't bury a same-or-higher-level heading inside the target.
    return appendBlock(lines, entryBlock, eol);
  }

  let insertAt = lines.length;
  for (let i = targetIdx + 1; i < lines.length; i += 1) {
    const m = lines[i].match(/^\s*(?:[⊙⊘⊜⊖⊗]\s*)?(\*+)\s/);
    if (m && m[1].length <= targetLevel) {
      insertAt = i;
      break;
    }
  }

  // Trim trailing blank lines just before insertAt so we get exactly one
  // blank line between sibling captures.
  while (insertAt > targetIdx + 1 && lines[insertAt - 1] === "") {
    insertAt -= 1;
  }

  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const entryLines = entryBlock.split(/\r?\n/);

  const stitched = [];
  stitched.push(...before);
  if (before.length > targetIdx + 1) stitched.push("");
  stitched.push(...entryLines);
  if (after.length > 0) stitched.push("");
  stitched.push(...after);

  return stitched.join(eol);
}

function appendBlock(lines, entryBlock, eol) {
  const out = lines.slice();
  // Ensure exactly one blank line before the new entry, unless file is empty.
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  if (out.length > 0) out.push("");
  out.push(...entryBlock.split(/\r?\n/));
  out.push("");
  return out.join(eol);
}

module.exports = {
  sanitizePayload,
  sanitizeLink,
  formatEntry,
  spliceEntry,
  CaptureValidationError,
  // Exported for tests / docs.
  MAX_HEADLINE_LEN,
  MAX_BODY_LEN,
  MAX_PROPERTY_VALUE_LEN,
  MAX_TAGS,
  MAX_PROPERTIES,
  MAX_LINK_LEN,
  BUILT_IN_LINK_SCHEMES
};
