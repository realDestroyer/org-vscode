# org-vscode v2.2.24

Release date: 2026-04-15

## Highlights

- Added Column View (MVP): a task table webview with sorting, filtering, and click-to-reveal.
- Added scope modes for Column View:
  - All Org Files
  - Active File
  - Current Subtree
- Added dynamic property columns (including inherited Org properties).
- Added persisted Column View layout per workspace:
  - Visible columns
  - Sort column + direction
  - Scope mode
- Improved Agenda View refresh behavior to preserve existing panel location/pop-out placement on save.

## Command

- Org-vscode: Open Column View
- Command ID: extension.openColumnView

## Validation

- Unit tests: 28 passing
- Extension-host tests: 29 passing
- Bundle: success
