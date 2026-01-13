# Workflow States Final Audit

Date: 2026-01-12

This document captures a repo-wide audit for remaining hard-coded assumptions about Org-vscode workflow keywords (TODO states) and unicode markers after migrating behavior to `Org-vscode.workflowStates`.

## Summary

- Runtime logic in the extension has been migrated to a registry-driven model (`workflowStates` registry + `taskKeywordManager` helpers).
- Remaining hard-coded references are mostly:
  - **Static syntax highlighting (TextMate grammar)** and **default token color scopes**, which cannot be made dynamic at runtime.
  - **Legacy “bucket” mappings** used for decorations/webviews (todo / in_progress / continued / done / abandoned) so existing CSS + scopes keep working.
  - **Docs/README strings** that still describe the original fixed workflow.

## Verified: No remaining hard-coded regex alternations in runtime code

A search for the exact legacy keyword alternation `TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED` did not turn up any matches in the active JS under `org-vscode/out/**` other than older files under `Test Org Files/`.

## Known intentional “static” areas (cannot be fully dynamic)

### 1) TextMate grammar and static scopes

These files still encode the original keywords/markers because TextMate grammars and scope definitions are static:

- `vso.tmLanguage.json`
- `org-vscode/vso.tmLanguage.json` (nested package)
- `package.json` / `org-vscode/package.json` tokenColorCustomizations defaults

Impact:
- Custom workflow keywords will not automatically receive keyword-specific TextMate scopes.
- The extension’s decoration layer compensates by mapping configured keywords into legacy buckets.

### 2) Syntax Color Customizer

- `org-vscode/out/syntaxColorCustomizer.js`

This UI is still keyed to the legacy scope set (TODO / IN_PROGRESS / CONTINUED / DONE / ABANDONED). That’s expected given the static grammar limitation.

### 3) Decoration “bucket” mapping

- `org-vscode/out/todoLineDecorations.js`
- `org-vscode/out/unicodeHeadingDecorations.js`

These intentionally keep five legacy buckets/scopes and map configured keywords into them using registry semantics:
- first cycle keyword → `TODO` bucket
- forward-trigger keyword → `CONTINUED` bucket
- stampsClosed or done-like → `DONE` bucket
- done-like but not stampsClosed → `ABANDONED` bucket
- otherwise → `IN_PROGRESS` bucket

## Cosmetic / wording leftovers

### Year report copy still mentions legacy names

- `org-vscode/out/yearReportBuilder.js`

The content strings still say things like “DONE items”, “CONTINUED items”, “IN_PROGRESS items”. The underlying selection logic is registry-driven now; this is just user-facing wording that could be made generic (e.g. “completed items”, “carryover items”, “in-progress items”).

## Docs that are now stale (recommended update before publishing)

The following docs/READMEs still describe the legacy fixed workflow and should be updated to mention `Org-vscode.workflowStates`:

As of this audit, the How-To has been updated to document `Org-vscode.workflowStates` and the new **Set TODO State...** command.

Suggested doc updates:
- Introduce `Org-vscode.workflowStates` with a short example configuration.
- Explain semantics fields (`isDoneLike`, `stampsClosed`, `triggersForward`, visibility flags).
- Clarify the static syntax highlighting limitation and the bucket/decorations behavior.

## Out-of-scope / ignored hits

- `Test Org Files/**` and generated report outputs under `.vscode-orgmode/**` contain unicode marker characters and legacy text, but these are not shipped runtime code.

