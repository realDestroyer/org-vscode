# Yearly Summary / Review Workflow

This document captures the end-to-end plan for turning a full-year `.org` file into reporting artifacts that help with annual reviews. The feature tracks added to [roadmap.md](../roadmap.md) map to the stages below.

## Objectives
- Parse entire Org files (e.g., `Test Org Files/work.org`) to capture every scheduled task, status symbol, tag hint, timestamp, and supporting notes.
- Aggregate the parsed data into yearly metrics: per-tag counts, task timelines, PTO/out-of-office streaks, and notable accomplishments.
- Export structured data (CSV/JSON) plus executive-friendly narratives (Markdown/HTML).
- Surface the results inside VS Code via a Year-in-Review dashboard webview and quick-download commands.

## Step-by-Step Implementation Plan

1. **Org Parsing Pipeline**
   1. Add a host-side module (plain `.js`) that streams an Org file and splits on the heading regex `^⊘ \[(\d{2}-\d{2}-\d{4})` to isolate day blocks.
   2. Within each block, capture task lines via `^\s+[⊙⊖⊜⊗]\s+(DONE|TODO|CONTINUED|ABANDONED)\s+:` and attach child text until the next status prefix.
   3. Normalize metadata (SCHEDULED/CLOSED timestamps, inline `TAG:[…]` fragments, URLs, code blocks) so downstream steps can treat everything as structured JSON.
   4. Keep the parser isolated so additional commands (agenda, calendar, reporting) can reuse it without duplicating regex logic.

2. **In-Memory Aggregation**
   1. Convert parser output into JS objects like `{ date, weekday, tasks: [{ status, title, tags, scheduled, completed, notes }] }`.
   2. Build reducers for per-tag stats (tasks per tag, unique days, completion ratio) and timelines (tasks per month/quarter, PTO detection from heading suffixes like `PTO`).
   3. Calculate highlight lists: most-referenced projects (prefix match like `KACE Ticket`), notable accomplishments (DONE tasks with `:TAG:` markers), and unresolved carries (CONTINUED entries).

3. **Exporter Commands**
   1. Command `orgMode.exportYearSummary` prompts for an Org file and destination folder (default `.vscode-orgmode/reports/<year>`).
   2. Emit `year-summary.csv` where each row represents a task with columns `date,status,tags,title,scheduled,completed,notes`.
   3. Emit `year-summary.json` that contains the full parsed structure plus aggregated metrics for reuse.
   4. Provide quick actions in the command palette to open the containing folder or copy the CSV path.

4. **Executive Report Templates**
   1. Create lightweight Markdown + HTML templates (Handlebars/EJS-free to keep CSP simple) that accept a plain JS data object.
   2. Populate sections like "Top Tags", "Key Projects", "Timeline Highlights", and "Opportunities/Next Steps" using the aggregations.
   3. Render Markdown directly to `.md`; for HTML, build a static file that uses inline CSS and no remote scripts so it can be emailed or printed.
   4. Add a command `orgMode.generateExecutiveReport` that consumes the JSON summary (generating it on-demand if missing) and writes both `.md` and `.html` outputs.

5. **Year-in-Review Dashboard (Webview)**
   1. Reuse the existing calendar webview scaffolding: add a new command (e.g., `orgMode.openYearInReview`) that launches a webview panel.
   2. Ship a bundled JS frontend (FullCalendar is already vendored; add a minimalist chart lib or draw charts manually with Canvas/SVG) that reads summary data via `acquireVsCodeApi().postMessage`.
   3. Visuals to include:
      - Tag heatmap stacked by month.
      - Task volume timeline with filters.
      - Click-to-filter list of supporting tasks.
      - Download buttons for CSV/Markdown outputs.
   4. Maintain CSP compliance by referencing local scripts with the injected `nonce` just like calendar view.

6. **Command Wiring & UX Polish**
   1. Register all new commands in `package.json` with clear titles and activation events.
   2. Update README + how-to docs explaining how to run the exporters and dashboard, including sample screenshots when ready.
   3. Add tests (where feasible) that feed fixture Org files into the parser and assert counts to prevent regressions.
   4. Consider telemetry or lightweight logging (opt-in) to understand which outputs are most used.

7. **Validation & Release Prep**
   1. Dogfood on `Test Org Files/work.org` to ensure large files parse quickly and memory usage stays reasonable.
   2. Verify CSV imports cleanly in Excel/Sheets and that HTML reports render offline.
   3. Capture release notes for roadmap v1.7.x once the feature set stabilizes (likely 1.7.6+).

Keep this document updated as milestones complete so roadmap entries stay accurate.
