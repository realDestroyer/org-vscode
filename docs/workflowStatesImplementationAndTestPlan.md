# Workflow States (TODO Keywords) — Implementation + Test Plan

**Status:** Implemented.

This document is retained as the original plan. For current behavior and remaining static limitations (TextMate scopes), see `docs/howto.md` and `docs/workflowStatesFinalAudit.md`.

Date: 2026-01-12

This plan turns the audit in [docs/taskSequenceUpgradeList.md](taskSequenceUpgradeList.md) into a sequenced implementation checklist with a regression-focused test strategy.

## Goals

- Make workflow states **config-driven** (keywords + optional Unicode marker), with a **single global cycle order** for v1.
- Preserve existing semantics (DONE/CLOSED stamping, CONTINUED forwarding, agenda visibility) by encoding them as **data** instead of hard-coded strings.
- Add an Emacs-like command: **“Set TODO State…”** (QuickPick).
- Add/expand tests so regressions around workflow states are caught early.

## Non-Goals (for this phase)

- Multiple independent sequences per file/project (multi-sequence) — planned later.
- A full “Workflow States Customizer” webview — planned later.
- A dynamic TextMate grammar (not feasible; TextMate scopes are static at runtime).

## Constraints / Guardrails

- No version bump yet.
- Backwards compatible defaults: if the user doesn’t configure anything, behavior must match today.
- Any new config must validate strictly and fail safe (fall back to defaults; never corrupt files).

## Proposed Configuration Model (v1)

A single array, ordered by cycle order:

- `org-vscode.workflowStates`: array of state definitions.

Each state definition:
- `keyword` (string, required, uppercase recommended)
- `marker` (string, optional, e.g. `⊙`)
- `category` (enum-like string): `todo | inProgress | done | cancelled | paused | other` (used for defaults)
- `isDoneLike` (boolean): affects completion stats + exports + filters
- `stampsClosed` (boolean): if true, switching to this state stamps `CLOSED: [...]`
- `triggersForward` (boolean): if true, apply continued/forward logic (replaces hard-coded CONTINUED)
- `agendaVisibility` (enum-like): `show | hide` (default `show`)
- `taggedAgendaVisibility` (enum-like): `show | hide` (default `show`)

Defaults should exactly reproduce current behavior:
- `TODO` (marker `⊙`)
- `IN_PROGRESS` (marker `⊘`)
- `CONTINUED` (marker `⊜`, `triggersForward: true`)
- `DONE` (marker `⊖`, `isDoneLike: true`, `stampsClosed: true`)
- `ABANDONED` (marker `⊗`, `isDoneLike: true` OR false depending on current semantics; document and test the intended behavior)

Additionally:
- `org-vscode.workflowClosedStampFormat` (optional): string format for new `CLOSED` entries (keep current behavior if omitted)
- Keep existing toggles like `includeContinuedInTaggedAgenda` for back-compat. `taggedAgendaVisibility` is now the preferred mechanism.

## Technical Approach (Core Design)

Create a single “source of truth” module that:

- Reads/validates config
- Normalizes keywords/markers
- Exposes helper predicates and **prebuilt regex fragments**

Suggested module (name can change to match repo conventions):
- `out/workflowStates.js`

API surface (sketch):
- `getWorkflowStates()` → array
- `getDefaultWorkflowStates()`
- `getCycleKeywords()`
- `isKnownState(keyword)`
- `isDoneLike(keyword)`
- `stampsClosed(keyword)`
- `isForwardState(keyword)`
- `getTaskPrefixRegex()` (keywords + markers)
- `stripTaskPrefix(text)` (replaces scattered normalization)

This module becomes the dependency that every regex/parser/view uses, instead of embedding `TODO|IN_PROGRESS|...` in-place.

## Implementation Milestones (PR-sized)

### PR 1 — Data model + unit tests (no behavior changes)

Deliverables:
- Add config schema to extension `package.json`.
- Implement `out/workflowStates.js` (or equivalent).
- Create/expand unit tests for:
  - validation + fallback behavior
  - regex generation correctness
  - predicate semantics (done-like, stampsClosed, forward-state)

Acceptance:
- No existing tests break.
- Behavior remains identical with default config.

### PR 2 — Replace hard-coded state regexes (core parsing & helpers)

Targets from audit:
- `out/orgTagUtils.js` (`TASK_PREFIX_REGEX` and any status stripping)
- `out/orgSymbolProvider.js` (`STATUS_WORDS`)
- `out/checkboxAutoDoneTransitions.js` (DONE/IN_PROGRESS/ABANDONED assumptions)
- Any other shared normalizers

Acceptance:
- Unit tests added/updated to cover both defaults and a small custom set.

### PR 3 — Commands (cycle + Set TODO State…)

Deliverables:
- Refactor rotate-left/right commands to use registry cycle order.
- Add **Set TODO State…** command:
  - QuickPick of configured states
  - Applies `CLOSED` stamping rules
  - Applies forward-state rules

Acceptance:
- Integration tests assert cycling order follows config.
- Integration tests verify CLOSED stamping behavior.

### PR 4 — Agenda + Tagged Agenda webviews

Deliverables:
- Replace hard-coded filters (`TODO|IN_PROGRESS`) with `agendaVisibility` logic.
- Update webview message handlers to use registry semantics:
  - CLOSED stamp on `stampsClosed`
  - Forwarding on `isForwardState`

Acceptance:
- Integration tests verify:
  - default behavior unchanged
  - custom config changes agenda inclusion without breaking parsing

### PR 5 — Calendar + exports + year reports

Deliverables:
- Update Calendar scheduled-task extraction to use registry-derived prefix regex.
- Update exports and stats/reporting to use `isDoneLike`.
- Confirm any “special sections” (e.g. `CONTINUED` carryover) are derived from `isForwardState` rather than keyword.

Acceptance:
- Add unit tests for report categorization.
- Add integration tests for `exportCurrentTasks` output filtering.

### PR 6 — Styling strategy (scopes vs decorations)

Because TextMate grammar is static, we need a stable approach for arbitrary user-defined states:

Option A (recommended):
- Keep existing TextMate scopes for legacy states (back-compat).
- Add editor decorations for configured workflow states (keyword + marker), using colors from settings.

Option B:
- Introduce a limited set of generic scopes (e.g. `keyword.control.workflowstate.vso`) and rely on decoration or tokenColorCustomizations by category.

Acceptance:
- No crashes on unknown states.
- Visuals degrade gracefully when custom states exist.

## Test Strategy (Regression-First)

The repo has two complementary test layers:

- Unit tests (node, mocked vscode): `npm run test:unit`
  - fast, deterministic
- VS Code integration tests: `npm test`
  - slower, executes the extension in a test host

### A. Unit test additions (fast “logic firewall”)

Add new unit tests in `org-vscode/test/unit/` (naming consistent with others):

1) `workflow-states-registry.test.js`
- Valid config parses and normalizes.
- Invalid config falls back to defaults.
- Duplicate keywords rejected/handled.
- Empty list handled safely.

2) `workflow-states-regex.test.js`
- Generated regex matches legacy examples (keywords + markers).
- Regex escaping works (e.g. markers like `+`, `*`, `(` if user sets them).

3) Update existing unit tests to become config-aware where they currently assume fixed keywords:
- `checkbox-auto-done.test.js`
  - Make “done target” and “revert target” derive from the registry, OR explicitly assert the defaults.

### B. Integration tests (behavior verification in real VS Code)

Expand `org-vscode/test/suite/` tests to cover:

1) Default behavior equivalence (must not change)
- Rotating left/right results identical.
- `DONE` adds `CLOSED`, leaving DONE removes/retains `CLOSED` per current rules.
- Forward-state logic unchanged.

2) Custom workflow config behavior
- Set workspace settings for `org-vscode.workflowStates` (test workspace or `workspace.getConfiguration().update`).
- Verify:
  - Cycle order uses custom order
  - “Set TODO State…” applies selected state
  - Agenda visibility uses `agendaVisibility`

3) “Golden file” scenarios
Create small input buffers representing:
- headings with markers+keywords
- headings with planning lines
- headings with tags
- confirm transformations only affect the prefix and relevant planning fields

### C. Regression matrix (what every PR must keep green)

Minimal matrix for every PR:
- Switching between done-like and non-done-like states
- CLOSED stamping and (if supported) un-stamping behavior
- Forwarding state: entering/leaving forward state
- Filters: Agenda + Tagged Agenda inclusion
- Export: `exportCurrentTasks` output

## How we’ll prevent “silent drift”

- Centralize all state semantics behind a small API.
- Prefer unit tests for regex/predicates + integration tests for user-facing flows.
- Add at least one test that uses a *non-default* state set (to prevent reintroducing hard-coded keywords).

## Execution Checklist

- [ ] PR 1: registry + schema + unit tests
- [ ] PR 2: core parsers/regex consumers
- [ ] PR 3: commands + Set TODO State
- [ ] PR 4: agenda webviews
- [ ] PR 5: calendar/export/reports
- [ ] PR 6: styling strategy

---

Notes:
- This plan intentionally mirrors [docs/taskSequenceUpgradeList.md](taskSequenceUpgradeList.md) and should be updated if new keyword-dependent sites are discovered.
