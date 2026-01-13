# Task Sequence Upgrade List (Workflow States)

**Status:** Implemented.

This document is retained as the original dependency audit. The shipped behavior is now driven by `Org-vscode.workflowStates`.

- User-facing docs: see `docs/howto.md` (“Workflow States (TODO Keywords)”).
- Final audit: `docs/workflowStatesFinalAudit.md`.

This document is a **pre-implementation dependency audit** for making Org-vscode task workflow states (a.k.a. TODO keywords / status keywords) user-configurable.

Goal: before changing any behavior, catalog **every feature and file** that currently assumes a fixed set of states/symbols so we don’t miss a hidden dependency.

## Current hard-coded workflow

Today the extension assumes a single global sequence:

- Keywords: `TODO`, `IN_PROGRESS`, `CONTINUED`, `DONE`, `ABANDONED`
- Unicode markers: `⊙`, `⊘`, `⊜`, `⊖`, `⊗`

And several features assume semantics beyond “just a label”, such as:

- **Done-ness**: `DONE` and sometimes `ABANDONED` are treated as “completed”.
- **CLOSED stamping**: transitioning to `DONE` adds `CLOSED: [timestamp]`.
- **CONTINUED forwarding**: transitioning to `CONTINUED` auto-copies a task to the next day as `TODO`.
- **Agenda filters**: agenda shows only `TODO`/`IN_PROGRESS` by default.

## What “configurable states” implies

When states become user-configurable, we need *data* that drives all parsing/rendering, not scattered regexes.

At minimum, a state definition will need:

- `keyword` (e.g. `WAITING`)
- `category` (proposed): `todo` | `done` | `inactive`
- `symbol` (optional; for unicode marker style)
- `addsClosedStamp` (bool; default true for done-like states)
- `isAgendaActive` (bool; should it appear in Agenda/Tagged Agenda)
- `isExportedToCurrentTasks` (bool)

And a single global order (agreed for v1 of this enhancement):

- `globalCycleOrder: string[]`

## Dependency catalog

### Canonical keyword/symbol utilities

- org-vscode/org-vscode/out/taskKeywordManager.js
  - Hard-codes keyword array + symbol array.
  - `cleanTaskText()` strips the fixed keywords and symbols.
  - `rotateKeyword()` encodes the global cycle order.
  - `buildTaskLine()` embeds keyword and optionally unicode symbol.

### Cycling commands + CLOSED/CONTINUED semantics

- org-vscode/org-vscode/out/keywordRight.js
- org-vscode/org-vscode/out/keywordLeft.js
  - Regex matches fixed keywords.
  - Inserts/removes `CLOSED:` when transitioning to/from `DONE`.
  - Hooks into continued-forwarding logic when transitioning to/from `CONTINUED`.
  - Special handling for syncing updates into `CurrentTasks.org`.

- org-vscode/org-vscode/out/continuedTaskHandler.js
  - Assumes the continued state keyword is literally `CONTINUED`.
  - Assumes forwarding creates a new task starting as `TODO`.
  - Strips fixed keywords/symbols when building forwarded text.

### Agenda webviews (Full Agenda + Tagged Agenda)

- org-vscode/org-vscode/out/agenda/agenda.js
  - **Filtering:** only shows scheduled tasks with `TODO` or `IN_PROGRESS`.
  - **Parsing:** matches fixed keywords/symbols.
  - **Rendering:** CSS classes `.todo`, `.in_progress`, `.continued`, `.done`, `.abandoned` are hard-coded.
  - **Editing:** `changeStatus` message handler:
    - Adds `CLOSED` when `newStatus === "DONE"`.
    - Optionally removes CLOSED when toggling away from `DONE`.
    - Triggers continued-forwarding when `newStatus === "CONTINUED"`.

- org-vscode/org-vscode/out/taggedAgenda.js
  - Matches fixed keywords/symbols.
  - Defaults to excluding `CONTINUED` (config `includeContinuedInTaggedAgenda`).
  - Status changes repeat the same DONE/CLOSED + CONTINUED forwarding semantics as Full Agenda.

### Calendar view

- org-vscode/org-vscode/out/calendar.js
  - Extracts scheduled tasks only if they contain one of the fixed keywords.
  - Strips fixed keywords/symbols for display.
  - Uses symbol/stars detection to determine “is a task”.

### Export to CurrentTasks

- org-vscode/org-vscode/out/exportCurrentTasks.js
  - Exports only a fixed list of keywords: `TODO`, `IN_PROGRESS`, `CONTINUED`, `ABANDONED`.
  - (Notably excludes `DONE` by design.)

### Yearly reports (parser + report builder + dashboard)

- org-vscode/org-vscode/out/yearSummary.js
  - Task parsing regex hard-codes the keyword set and unicode symbols.
  - Aggregation keys assume those specific statuses.

- org-vscode/org-vscode/out/yearReportBuilder.js
  - Treats `DONE` as the completion count for completion rate.
  - Hard-codes special sections:
    - “Carryover Watch” == `CONTINUED`
    - “In-Progress Focus” == `IN_PROGRESS`

- org-vscode/org-vscode/out/yearExecutiveReport.js
  - Uses the yearSummary parser + yearReportBuilder model; inherits their status assumptions.

- org-vscode/org-vscode/out/yearDashboard.js
  - Uses yearSummary parser + yearReportBuilder model; inherits their status assumptions.

### Decorations and rendering tied to fixed states

- org-vscode/org-vscode/out/todoLineDecorations.js
  - Regex matches fixed symbols + fixed keyword set.
  - `STATUS_TO_KEYWORD_SCOPE` is hard-coded per state.
  - Background highlighting depends on those known TextMate scopes existing.

- org-vscode/org-vscode/out/unicodeHeadingDecorations.js
  - Regex matches fixed keyword set.
  - Maps status -> symbol and status -> scope via hard-coded tables.

### Checkbox automation and stats (done-ness semantics)

- org-vscode/org-vscode/out/checkboxAutoDoneTransitions.js
  - Uses fixed keyword set and assumes:
    - `DONE` is the completion status.
    - Reverting from DONE goes to `IN_PROGRESS`.
    - `ABANDONED` is ignored in transitions.

- org-vscode/org-vscode/out/checkboxAutoDone.js
  - Applies transitions from checkboxAutoDoneTransitions.
  - Will need a config-driven definition of "done-like" vs "active".

- org-vscode/org-vscode/out/checkboxStats.js
  - Heading regex hard-codes symbols + keyword set.
  - Has hard-coded `DONE_KEYWORDS = {DONE, ABANDONED}`.

- org-vscode/org-vscode/out/checkboxStatsDecorations.js
  - Depends on checkboxStats parsing and therefore the fixed keyword regex.

### Grammar, scopes, and default colors

- org-vscode/org-vscode/vso.tmLanguage.json
  - Explicit grammar patterns for each fixed keyword.
  - Explicit symbol patterns for each fixed unicode marker.
  - Scope names are state-specific (e.g. `keyword.control.todo.vso`, `string.task.done.vso`, etc.).

- org-vscode/package.json and org-vscode/org-vscode/package.json
  - `contributes.configurationDefaults.editor.tokenColorCustomizations.textMateRules`
    - Has default rules for the fixed state scopes.

- org-vscode/org-vscode/out/syntaxColorCustomizer.js
  - `DEFAULT_COLORS` hard-codes entries for each fixed state/scope (symbol/keyword/task-text).

### Editor/UX strings that encode the fixed cycle order

- org-vscode/org-vscode/out/extension.js
  - On-type formatter rotates through a fixed unicode symbol array.

- org-vscode/org-vscode/out/keybindingCustomizer.js
  - Descriptions hard-code the cycle order for ToggleStatusRight/Left.

### Headings/symbol parsing helpers

- org-vscode/org-vscode/out/orgTagUtils.js
  - `TASK_PREFIX_REGEX` hard-codes keyword set + symbol set.

- org-vscode/org-vscode/out/orgSymbolProvider.js
  - `STATUS_WORDS` is a hard-coded set used to strip status keywords from Outline titles.

- org-vscode/org-vscode/out/migrateFileToV2.js
  - Heading detection regex includes the fixed unicode symbol set.

### Snippets and docs

- org-vscode/org-vscode/snippets/vso.json
  - Snippets insert `* TODO ...` and reference planning/CLOSED stamps.

- org-vscode/org-vscode/README.md
  - Documents the fixed keyword list, fixed unicode mapping, and CONTINUED semantics.

- org-vscode/org-vscode/roadmap.md
  - Mentions fixed state names and agenda filtering behavior.

### Tests

- org-vscode/org-vscode/test/**
  - Unit + functional tests embed fixed keywords, fixed done-ness assumptions, and CONTINUED forwarding behavior.

## Non-negotiable migration risks

These are places we must treat as “semantic dependencies”, not just string matches:

- Which states are considered **done-like** (impacts checkbox stats/auto-done, reports, and exports).
- Which state triggers **CLOSED stamping** (currently only DONE in agenda handlers; commands may differ).
- Which state triggers **forwarding** and what the target state is (currently CONTINUED -> TODO copy).
- Which states are **agenda-visible** by default (currently TODO/IN_PROGRESS).

## Suggested implementation ordering (after this audit)

1. Introduce a single config-driven workflow state source (global order only).
2. Update core parsing/regex to use derived sets from that config.
3. Update commands + agenda/calendar/export/yearly reports.
4. Update decorations + color customizer strategy (dynamic states can’t be represented in a static TextMate grammar).
5. Update docs/snippets/tests.

---

If you want, next step is for me to turn this doc into a tracked checklist issue (or split it into subtasks) before any code changes.
