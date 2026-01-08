# Change Log

# [Unreleased]

# [2.2.1] 01-07-26
`Fixed / Enhanced`

- **Fix: Activation bundling:** Updated the bundle pipeline to prefer ESM entrypoints (avoids a runtime crash caused by a missing `./impl/*` module).
- **Enhanced: Keyboard shortcuts discoverability:** Legacy `extension.*` commands now display under the `org-vscode:` category without changing command IDs.
- **Enhanced: Keybinding Customizer:** Cleaner command display names, summaries for all rows, hides noisy `when` clauses, includes commands without default keybindings, and keeps summary text on one line.

# [2.2.0] 01-06-26
`Added / Enhanced`

- **Preview (MVP):** Live HTML preview with editor → preview scroll sync. Commands: `Org-vscode: Open Preview` and `Org-vscode: Open Preview To Side`.
- **Keybinding:** `Ctrl+Alt+P` opens preview to the side.
- **Editing (Org Meta-Return style):** `Alt+Enter` smart-inserts a new heading / list item / table row depending on context.
- **Math (experimental):** Optional math symbol decorations that render common LaTeX commands as Unicode glyphs inside `$...$` and `$$...$$` (setting: `Org-vscode.decorateMath`).

# [2.1.5] 01-06-26
`Fixed / Enhanced`

- **Fix: Task-state highlighting scopes:** Unicode task symbols now use `constant.character.*.vso` only for the symbol itself (not the entire line), restoring correct per-token coloring for TODO/IN_PROGRESS/CONTINUED/DONE/ABANDONED headings.
- **Enhanced: Syntax Color Customizer:** Added controls for additional Org syntax scopes (links, lists, checkboxes, blocks, math, emphasis, priority, comments, and tables).

# [2.1.4] 01-06-26
`Enhanced`

- **Expanded Org syntax highlighting:** Better highlighting coverage for common Org constructs (blocks, lists, links, priorities, drawers/properties, directives, and basic math fragments).
- **Navigation:** Document Outline for Org headings + improved Org link handling (including `[[*heading]]`, `[[id:...]]`, and `[[#target]]`).
- **Link completion:** Auto-complete link targets inside `[[...]]`, including workspace-wide `id:` suggestions.
- **Docs/examples:** Updated documentation and the shipped example Org file to showcase the new syntax and navigation helpers.

# [2.1.3] 01-05-26
`Enhanced`

- **Statistics cookies (Org-mode placeholders):** Cookies now use `[/]` (fraction) and `[%]` (percent) placeholders, which Org-vscode renders as `[n/m]` and `[p%]`.
- **Subtree completion stats:** Heading cookies include TODO subtree completion in addition to checkbox completion (DONE/ABANDONED count as complete).

# [2.1.2] 01-04-26
`Fixed / Enhanced`

- **Agenda View / Tagged Agenda:** Clicking a checkbox in “Show Details” now immediately updates the checkmark in the webview (no full refresh needed, so filters/expansions stay open).
- **Checkbox auto-DONE:** When `Org-vscode.autoDoneWhenAllCheckboxesChecked` is enabled, tasks now revert from `DONE` back to `IN_PROGRESS` if any checkbox becomes unchecked (and `CLOSED` is removed).

# [2.1.1] 01-04-26
`Enhanced`

- **Checkbox statistics (Emacs parity):** Supports `[n/m]` and `[p%]` cookies on headings and list items, with hierarchical counting (top-level items only; children determine parent completion).
- **Checkbox toggling:** Toggle checkbox at cursor with `Ctrl+Alt+X` (command: Org-vscode: Toggle Checkbox Item).
- **Agenda View / Tagged Agenda:** “Show Details” supports clicking checkboxes to toggle completion (writes back to source files).
- **Docs:** Added checkbox usage screenshots and updated guides.

# [2.1.0] 12-29-25
`Enhanced`

- **Agenda View:** Added file filter chips (quickly view one .org file or all).
- **Agenda View:** Improved “Show Details” readability so expanded task details wrap and stay within the panel.
- **TODO line decoration:** Optional whole-line background highlighting per task state (uses your tokenColorCustomizations backgrounds).
- **Checkbox automation:** Optional auto-DONE when all child checkboxes under a heading are checked.
- **Emphasis rendering:** Optional runtime styling for `*bold*`, `/italic/`, `_underline_`, `+strike+` with markers hidden unless you’re editing them.
- **Editing commands:** Added emphasis wrap/toggle commands for bold/italic/underline.

# [2.0.2] 12-29-25
`Enhanced`

- **Tagged Agenda:** CONTINUED tasks are omitted by default to avoid duplicates when a task was continued into a future TODO. Set `Org-vscode.includeContinuedInTaggedAgenda` to include them.
- **Indent decoration:** Heading indentation decorations can be enabled/disabled independently of unicode marker decorations.
  - When `decorateUnicodeHeadings` is OFF but indentation is ON, headings render Org-Indent-style with the trailing `*` visible.
- **Insert Org Table:** The table generator now emits canonical Org-mode pipe tables (Emacs compatible), and the webview UI buttons/marquee work correctly under strict CSP.
- **Snippets packaging:** Ensures `snippets/vso.json` ships in the VSIX so snippet completions work after install.

# [2.0.1] 12-28-25
`Fixed`

- **Year-in-Review packaging:** ensures `media/yearDashboardView.js` ships in the VSIX so the dashboard webview loads correctly.

# [2.0.0] 12-28-25
`Enhanced / Breaking`

- **Emacs-style tags + match strings:**
  - Canonical tags are end-of-headline `:TAG1:TAG2:` with outline + `#+FILETAGS` inheritance.
  - Tag filtering supports Emacs match strings like `+A+B`, `A|B`, and `+A-B`.
  - Tag groups via `#+TAGS:` blocks are supported and expanded.
  - Tag names normalize hyphens to underscores (e.g. `TEST-TAG` → `TEST_TAG`) to keep match strings unambiguous.

- **Emacs-style planning lines (SCHEDULED/DEADLINE):**
  - Canonical planning metadata lives on the indented line directly under the heading.
  - Backward-compatible: legacy inline stamps are still recognized.

- **Explicit v2 migration command:**
  - Adds **Org-vscode: Migrate File to v2 Format** (no automatic rewrites).
  - Migrates legacy `[+TAG:...]` blocks, inline planning stamps, and `COMPLETED:` → `CLOSED:`.

- **DONE timestamps use `CLOSED` (Issue #18):**
  - DONE transitions now write `CLOSED: [...]` instead of `COMPLETED: [...]`.
  - Backward-compatible: legacy `COMPLETED` timestamps are still parsed/removed.

- **Syntax highlighting + snippets/docs:**
  - Grammar highlights `CLOSED` (and legacy `COMPLETED`) consistently.
  - Snippets and docs now prefer `CLOSED` in examples.

# [1.10.9] 12-23-25
`Enhanced`

- **Editor shortcuts no longer depend on `vso` language mode:**
  - Keybindings now work when the editor language mode is `org`/`vsorg`/`org-vscode` (not only `vso`).

- **Heading increment/decrement (Alt+Left/Right):**
  - Runs reliably even when the current file language mode isn't `vso`.
  - Selection-aware for asterisk headings (bulk increment/decrement across selected lines).

# [1.10.8] 12-17-25
`Enhanced`

- **Multi-line selection editing:**
  - Status cycling (`Ctrl+Left/Right`) now applies across multi-line selections / multi-cursor.
  - Scheduling (`Ctrl+Alt+S`), deadlines (`Ctrl+Alt+D`), and inline tags (`Ctrl+Shift+T`) now support applying to multiple selected tasks at once.
  - Heading increment/decrement (`Alt+Left/Right`) supports multi-line selection.
  - Date adjusters (smart date, deadline date, day heading increment/decrement) support multi-line selection.

# [1.10.7] 12-16-25
`Fixed`

- **Agenda View chronological ordering:**
  - Fixed date-group sorting so agenda sections display in true chronological order.
  - Avoids unstable sorting caused by greedy bracket parsing in the agenda header key.

`Enhanced`

- **Cross-platform file paths (Linux/macOS/Windows):**
  - Commands that create/open/read org files now consistently use `path.join(...)` for directory/file paths.

- **Docs:**
  - Added CONTRIBUTING workflow guide (Issue -> Branch -> PR -> Review -> Merge).

# [1.10.6] 12-16-25
`Enhanced`

- **Org-compatible source + decorative headings:**
  - `Org-vscode.decorateUnicodeHeadings` can render Unicode heading markers visually while keeping `*` headings in the file.
  - `Org-vscode.decorateHeadingIndentation` optionally adds org-indent-like visual indentation for headings.
  - `Org-vscode.adjustHeadingIndentation` is now numeric (spaces per level; `0` disables), used by heading increment/decrement and decoration indentation width.
  - Heading increment/decrement now works even if `headingMarkerStyle` doesn't match the current file, and prompts to update settings.

- **Date formatting correctness:**
  - Commands and views that parse/write scheduled/deadline dates now use `Org-vscode.dateFormat` consistently.
  - Calendar drag/drop rescheduling now writes dates using the configured format.
  - Added **Org-vscode: Convert Dates in Current File** for explicit, safe date format conversion.

- **Snippets + tests:**
  - Built-in snippets emit `*` headings (Org-friendly) instead of forcing Unicode markers.
  - Added functional integration coverage for asterisk-mode workflows.

# [1.10.5] 12-15-25
`Enhanced`

- **Org-mode interoperability:**
  - Added `Org-vscode.headingMarkerStyle` setting (`unicode` default, `asterisks` to preserve `*` headings in-file).
  - Disabled the on-type `*` → Unicode conversion when `headingMarkerStyle` is set to `asterisks`.
  - Updated commands and views (Agenda/TaggedAgenda/Calendar/Move Up/Down/Continued auto-forwarding) to support and preserve either marker style.
  - Updated syntax highlighting so `* TODO ...` task headings are properly scoped in asterisk mode.
  - Year Summary now detects day headings written with either `⊘ [...]` or `* [...]`.

# [1.10.4] 12-12-25
`Fixed`

- **Insert Table:**
  - Fixed `org-vscode.insertTable` not being registered on activation (command not found).

# [1.10.3] 12-12-25
`Fixed`

- **Syntax Color Customizer:**
  - Fixed **Save Colors** button not applying settings.
  - Synced Marketplace README content with the main repo README.

# [1.10.2] 12-12-25
`Enhanced`

- **Syntax Color Customizer scope expansion:**
  - Added defaults for additional Org elements (DEADLINE/CLOSED/COMPLETED/timestamps/day headers/headings/directives/properties).
  - Added an optional **Body / Notes Text** control (uses theme default unless you explicitly set it).

# [1.10.1] 12-11-25
`Fixed`

- **Agenda / TaggedAgenda CONTINUED parity:**
  - Clicking task keywords in Agenda and TaggedAgenda now triggers the same CONTINUED auto-forward/remove behavior as the editor hotkeys.
  - Agenda no longer collapses (dispose/reopen) after changing a task status.

# [1.10.0] 12-11-25
`Added`

- **Syntax Color Customizer Webview:**
  - New command **"org-vscode Customize Syntax Colors"** opens an interactive UI for customizing syntax highlighting.
  - Visual color pickers for every task state: TODO, IN_PROGRESS, CONTINUED, DONE, ABANDONED.
  - Also customize SCHEDULED stamps, inline tags, and agenda dates.
  - Toggle bold/italic font styles for each element.
  - Live preview shows exactly how your text will appear.
  - Save changes directly to user settings or reset to extension defaults.
  - Quick link to VS Code's Keyboard Shortcuts editor (filtered to org-vscode).

- **Default Syntax Highlighting Colors:**
  - Users now get proper syntax highlighting out of the box without manual configuration.
  - Extension provides sensible default colors via `configurationDefaults` in package.json.
  - Users can still override colors in their personal settings or use the new Customizer UI.

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/Syntax-Highlight-WebUI.png?raw=true" width="900" />

# [1.9.1] 12-11-25
`Fixed`

  - Fixed issue where adding a SCHEDULED date to a line that already had a DEADLINE would place SCHEDULED after DEADLINE, breaking syntax highlighting.
  - The `Ctrl+Alt+S` command now correctly inserts SCHEDULED before any existing DEADLINE tag.
  - Also added zero-padding for single-digit months/days (e.g., `1` → `01`).

# [1.9.0] 12-10-25
`Enhanced`

- **CONTINUED Task Auto-Forwarding:**
  - When toggling away from `CONTINUED`, the forwarded copy is automatically removed from the next day.
  - Creates the next day's heading if it doesn't already exist.

- **DEADLINE Support:**
  Added tag support using Emacs-style end-of-headline tags `:foo:bar:` (legacy `: [+TAG:foo,bar] -` is still recognized for backward compatibility).
  - New snippet `/dl` adds a DEADLINE line to an existing task.
  - Agenda View now displays deadline badges with color-coded warnings:
    - 🔴 **OVERDUE** (pulsing red) - Past deadline
    - 🟠 **DUE TODAY** (orange) - Deadline is today
    - 🟡 **Due in X days** (yellow) - 1-3 day warning
    - ⚫ **Due: date** (gray) - Future deadline (4+ days)
  - Year Summary parser now tracks DEADLINE dates in exports.
  - Distinct syntax highlighting for DEADLINE (red/orange vs SCHEDULED cyan).

- **Smart Date Keybind Consolidation:**
  - `Alt+Shift+Left/Right` now intelligently detects whether cursor is on a day heading or SCHEDULED line and adjusts accordingly.
  - `Ctrl+Shift+Left/Right` now adjusts DEADLINE dates.
  - Added negative keybindings to properly unbind old commands on update.

- **New Keybindings:**
  - `Ctrl+Alt+D` - Add/remove DEADLINE to task (prompts for date)
  - `Alt+Shift+S` - Add separator line (moved from Ctrl+Alt+D)

- **Agenda View Improvements:**
  - Now shows only `TODO` and `IN_PROGRESS` tasks (excludes CONTINUED, DONE, ABANDONED).
  - CONTINUED tasks are excluded since their forwarded TODO copy will appear instead.

- **Align Schedules Fix:**
  - `Alt+Shift+A` now preserves DEADLINE tags when aligning SCHEDULED timestamps.

- **Day Heading Snippet:**
  - New `/day` snippet inserts a day heading with today's date and weekday picker.

# [1.8.0] 12-04-25
`Enhanced`

- **Year-in-Review Suite:**
  - Added three new commands — `orgMode.exportYearSummary`, `orgMode.generateExecutiveReport`, and `orgMode.openYearInReview` — to build JSON/CSV summaries, polished Markdown/HTML executive reports, and an interactive dashboard that visualizes tag heatmaps, status timelines, and task feeds for a full Org file.
  - Shared the parsing/build pipeline across exporters so one Org scan feeds every artifact, reducing churn on large notebooks.
  - Webview assets now load lazily with safe fallbacks if a packaged file goes missing, preventing activation failures.
- **Heading Depth Controls:**
  - `Alt+Right` / `Alt+Left` no longer fight each other — the commands now rotate Unicode symbols deterministically and optionally adjust indentation by two spaces.
  - New setting `Org-vscode.adjustHeadingIndentation` (defaults to `true`) lets you decide whether heading depth should move with the symbol or stay pinned.

# [1.7.6] 12-03-25
`Enhanced`

- **Syntax Highlighting Refresh:**
  - Updated `vso.tmLanguage.json` so #+ directives, property drawers, and inline timestamps each receive their own scopes for clearer theming across editors.
  - DEADLINE, CLOSED, and general SCHEDULED markers now share consistent keyword highlighting inside every task state row so the metadata is easier to scan.
  - General Org timestamps (e.g., `<2025-12-03 Wed 09:00>`) are now scoped once and reused everywhere, reducing flicker between Agenda, Calendar, and file views.

# [1.7.5] 12-02-25
`Enhanced`

- **Calendar Palette Sync:**
  - Calendar events now inherit the same deterministic colors used by their tag chips, so each task block, chip, and tooltip all share a single visual identity.
  - Updated the rendering logic to compute colors once per tag and reuse them for both the chip row and FullCalendar events, improving consistency and performance.
  - Improved contrast handling so text automatically flips to a readable shade regardless of the assigned background color.

# [1.7.4] 11-28-25
`Enhanced`

- **Calendar Status & Density Tweaks:**
  - Added a slim status bar that mirrors the current view range, total task count, and any active tag filters to give quick context without leaving the webview.
  - Streamlined event cards to highlight the title and scheduled day while keeping metadata tucked away in tooltips.
  - Minor drag-and-drop polish so rescheduling feedback stays stable during rapid calendar navigation.

# [1.7.3] 11-15-25
`Enhanced`

- **Calendar Tag Bubble Refresh:**
  - Restored the classic "bubbly" styling with rounded capsules, gradients, and hover cues that make the filter bar easy to parse at a glance.
  - Chip row now shows only the tags that exist inside the currently visible range (month/week), keeping the control surface tidy for large files.
  - Added keyboard/mouse affordances (Ctrl/Cmd multi-select, desaturation of inactive chips) so advanced filtering feels natural.

# [1.7.2] 11-04-25
`Docs & Packaging`

- Updated README, roadmap, and marketplace metadata to reflect the refreshed calendar efforts and to prep for the 1.7.3+ releases.
- Cleaned up `package.json`, icon placement, and VSIX packaging so the Marketplace listing installs without warnings.
- Added roadmap entries for the yearly summary/export initiatives to make upcoming work visible.

# [1.7.1] 08-04-25
`Refactored`

- Centralized Task Keyword/Symbol Manager:
  - All logic for task keyword transitions, symbol assignment, and completion stamps is now handled by a new manager (`taskKeywordManager.js`).
  - Refactored all relevant files (`keywordLeft.js`, `keywordRight.js`, `agenda.js`, `taggedAgenda.js`, and recommended for `calendar.js`) to use this manager, eliminating duplicated logic and ensuring consistent behavior across all views and commands.
  - Blank lines or notes now default to TODO when keyword rotation is triggered.
  - This refactor improves maintainability, reliability, and future extensibility of task status handling throughout the extension.

# [1.7.0] 06-20-25
`Enhanced`

- **Calendar View Rework:**
  - Task tags are now interactive: tag "bubbles" are displayed above the calendar, one for each unique tag found in the currently visible tasks.
  - Clicking a tag filters the visible tasks in the calendar to only those matching the tag.
  - Ctrl+Clicking tag bubbles allows multiple tags to be selected (OR logic).
  - When tags are selected, unselected tags are visually desaturated (grayed out) for clarity.
  - If no tags are selected, all tasks and tags remain colorful.
  - Enhanced styling and clarity around filtering behavior.
vsce 
# [1.6.9] 06-14-25
`Enhanced`

- Unified Task Symbols:
  - Updated all internal functions (Agenda View, Tagged Agenda View, Calendar View, keywordLeft/Right, etc.) to support the new Unicode task symbols:
    - ⊙ TODO
    - ⊘ IN_PROGRESS
    - ⊜ CONTINUED
    - ⊖ DONE
    - ⊗ ABANDONED
  - Symbols are now accurately rotated in both source files and supporting views.
  - Agenda and Tagged Agenda Views now update the keyword correctly while intentionally hiding the Unicode symbol for a cleaner look.

- Visual Cycling Behavior:
  - Stopped infinite cycling: you can no longer rotate beyond TODO (left) or ABANDONED (right).
  - COMPLETED timestamps are reliably added or removed when toggling to/from DONE in every view.
  - Cleaned symbol detection logic to prevent keyword misfires (e.g. detecting "DONE" inside "ABANDONED").

`Fixed`

- Unicode-aware task matching:
  - Substring-matching bugs are now eliminated using stricter regex to detect keywords correctly (e.g. DONE was falsely matched inside ABANDONED).
  - Symbol detection logic in task movement (moveUp / moveDown) updated to use the full Unicode task set.

`Added`

- Message Utility Activation:
  - Fully integrated and exposed the previously unused `showMessage.js` feature.
  - A new command (`extension.showMessageTest`) displays an information popup with a customizable message and button.
  - Added a `Ctrl + Alt + M` keybinding for testing the GitHub redirect example.

# [1.6.8] 05-15-25
`Fixed`

- Open By Tag:
  - Restored support for opening .org files by tag from the #+TAGS: header using the VS-Org: Open By Tag command.
  - The previous version only supported .vsorg files and silently ignored .org files.
  - Updated logic to support both extensions, clean up blank entries, and normalize tag casing for accurate matching. 🔍✨
  - You can now confidently open any project by tag, no matter which file type or case it's in!

# [1.6.7] 05-07-25
`Enhanced`

- Tag Insertion:
  - When adding a new tag to a task using the addTag command, the extension now checks the file’s #+TAGS: header at the top.
  - If the tag isn’t already listed, it will automatically be added to the #+TAGS: line, keeping the header in sync with inline tags. 💪
  - This makes it easier to spot what kinds of projects or contexts a file includes—especially when quickly skimming or using global tag search.
  - Existing tags in the header are preserved, and no duplicates will be added.


# [1.6.6] 04-30-25
`Fixed`
- Fixed a bug where tasks containing commas in their description (e.g. “Work on mock interview questions, etc.”) would fail to update their status.
- The issue was caused by parsing the message.text on commas without safely escaping them. The text was split mid-sentence, causing the update logic to fail to find the original task line.
- Commas in task text and scheduled date fields are now safely encoded and decoded during message passing between the webview and extension backend. 🎯


## [1.6.5] 04-29-25
`Fixed`

- Tagged Agenda View:
  - Fixed the erroneously added "cw" letters in a loop. My guess is, I must've been typing on a different window or playing Counter-Strike and alt+tabbed while playing with VSCode in the background and an automated deployment must've kicked off.

## [1.6.4] 04-24-25
`Fixed`

- Tagged Agenda View:
  - COMPLETED timestamps now use a consistent long-form style (e.g. 25th March 2025, 8:35:37 am) when toggling to DONE, matching the format used in the main Agenda View and status change commands.
  - Previously, marking a task as DONE in the Tagged Agenda View inserted a shortened ISO date (e.g. 2025-03-25). This has been updated for consistency and readability.
  - Fixed a parsing bug where the time portion (including seconds) of the COMPLETED timestamp was being truncated due to incorrect handling of commas in message payloads.


## [1.6.3] 04-23-25

`Fixed`

- Agenda View:
  - COMPLETED timestamps now match the correct long-form style (e.g. 23rd April 2025, 7:46:58 am) for consistency with keywordLeft / keywordRight actions.
  - Previously, toggling to DONE in the Agenda View used an ISO format (e.g. 2025-04-23). This has been updated to keep formatting consistent across features.

## [1.6.2] 04-21-25

`Added`

- Calendar View Enhancements:
  - Tags are now visually extracted and displayed as colored bubbles above the calendar
  - Tasks are color-coded by their primary tag
  - Tag colors are assigned dynamically (no hardcoding required)
  - Rescheduling via drag-and-drop now correctly handles tasks with inline tags

`Fixed`

- Rescheduling bug where tagged tasks could not be matched back to source file due to missing tag text during comparison

## [1.6.1] 04-16-25

`Added`

- New feature: Export all active (non-DONE) tasks to `CurrentTasks.org` with `Ctrl + Shift + E`
- Each task section is grouped under a `##### Source: <filename> #####` header
- Tasks updated in `CurrentTasks.org` with `keywordLeft` or `keywordRight` will sync changes to the original file automatically


## [v1.0.0 thru v1.5.0] 03-18-25 thru 04-09-25
`Added`

- New Feature(s):
  - Agenda View
  - Tagged Agenda View
  - Calendar View
  - Keyword Left/Right integration between files
  - ReadFiles/ChangeDir 
  - Tagging
  - Tag Searching
  - Insert Table
  - Insert Visual Date Separator
  - Increment/Decrement SCHEDULED Date Stamp
  - Increment/Decrement Day Separator Date Stamp 
  - SCHEDULED alignment keyboard shortcut


## [1.0.0-rebuild] 03-18-25

`Added`

- Agenda View
  - Modifications within Agenda View are replicated in source file
  - [Expand All] / [Collapse All] toggle functionality for grouped tasks
  - Click-to-toggle TODO/DONE directly from the Agenda View
- Calendar View
  - You can now drag & drop tasks to different days, weeks, or months
  - Dragging updates the source file with the new scheduled date
  - Click-to-toggle TODO/DONE directly from the Calendar View
- Tagged Task Support
  - You can now add tags using Emacs-style end-of-headline tags `:tag1:tag2:` (legacy `: [+TAG:tag1,tag2] -` is still recognized for backward compatibility)
  - Tags are attached to TODO lines and can be used to filter tasks
- Tagged Agenda View
  - New agenda view that filters tasks by tag(s)
  - Supports AND / OR logic depending on input
  - Fully interactive: open files, toggle status, grouped by date
- Workspace Compatibility
  - You can now store .org files in a workspace and they will be read
- File Watch & Auto Refresh
  - Agenda and Calendar views automatically refresh on save

`Changed`

- DONE date format changed to `Day Month Name, Year` (e.g. `18th October, 2018`)

`Fixed`

- Agenda view now works cross-platform (including macOS)
- Scheduling bugs when dates were invalid or partial

## [0.1.4] 08-09-24

`Fixed`

- Fixed scheduling bug

`Changed`

- Changed the keybinds for folding to the default vscode keybinds ```Shift + Ctrl + [``` to fold and ```Shift + Ctrl + ]``` to unfold

## [0.1.3] 10-18-18

`Added`

- Added the `DD-MM-YYYY` date format [Issue #73](https://github.com/robaboyd/vs-org/issues/73)
  - The setting can be changed under the VS-Org config in the Extension preferences
  - The already scheduled TODOs will update to the new format when the setting is changed

`Changed`

- DONE date format changed to `Day Month Name, Year` ex. 18th October, 2018

## [0.1.2] 10-12-18

`Fixed`

- Agenda view now shows on mac [Issue #65](https://github.com/robaboyd/vs-org/issues/65)

## [0.1.1] 10-10-18

`Changed`

-Syntax Highlighting update. The text on the line is now the same color as the heading

## [0.1.0] 10-8-18

`Added`

- Agenda View. Plan, and organize your taks in a easy to use interface.
- `ctrl+alt+s` keybind to schedule an item, saves the document as well
- `VS-Org: Agenda View` command
- Scheduling auto saves a file

`Changed`

- Completed Text goes on a new line
- Inserting `TODO` or `DONE` auto saves the file

## [0.0.8] 9-30-18

`Changed`

- The new .vsorg file now has focus when it's created

`Fixed`

- Vs-Org will now properly format the \* when the are typed (`editor.formatOnType` needed to be true, the extension sets this for .vsorg files automatically)
- Users no longer need to set `editor.inserFileNewline` to true, the extension does this by default

## [0.0.7] 9-28-18

`Changed`

- Syntax highlighting for `COMPLETED: DATE` is now the comment syntax (depending on your theme it's not so cluttered)
- `COMPLETED: DATE` is now appended to the end of the task that is completed

## [0.0.6] 9-27-18

`Changed`

- Syntax Highlighting for DONE on highlights the DONE keyword, no longer does full line
- The DONE date is now on its own line with `COMPLETED:`

`Fixed`

- Switching from DONE or TODO no longer removes other done or todos on the line

## [0.0.5] 9-27-18

`Changed`

- The default keybind for folding is now `tab`
- The default keybind for unfolding is now `shift+tab`
- Syntax highlighting for `#+` is now the selected themes comment color

`Fixed`

- Adding TODO, DONE or changing the level of the heading no longer get rid of special characters
- VS-Org Keybinds are only active when the file extension is .vsorg or .vso
- Fixed issue with `#` acting like a comment, `#+` is now a comment

## [0.0.4] 9-26-18

`Changed`

- Changed to proper version number

## [0.0.3] 9-25-18

`Added`

- Snippet adds an underline as a divider after #+TAGS

`Changed`

- Changed syntax highlighting for the TODO keyword. Only highlights TODO, not the rest of the line.

## [0.0.2] 9-25-18

`Added`

- Initial release

### Keybinds

- Typing \* , ** , or \*** will properly format to "⊖", "⊙", "⊘".
- alt+shift+upArrow will swap the BLOCK of text with the BLOCK of text above it.
- alt+shift+downArrow will swap the BLOCK of text with the BLOCK of text below it.
- shift+rightArrow will add TODO or DONE keyword
- shift+rightLeft will add DONE or TODO keyword
- Fold and Unfold code with default keybinds ctrl+shift+] or [
- alt+rightArrow will increment the level of the heading
- alt+leftArrow will decrement the level of the heading

### Commands

- Search by tags with the `VS-Org: Open By Tag` command
- Search by titles with the `VS-Org: Open By Title` command
- Change main directory with the `VS-Org: Change VS-Org Directory` command.
- Create a new file with the `VS-Org: Create new .vsorg file` command.
