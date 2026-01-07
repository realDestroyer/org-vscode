# Roadmap

Live version: 2.2.0

These are the features that I have either already implemented, or plan to in the near future.

## Features

| Feature Name              | Description                                                                                | Progress    | Version  | Author        |
| ------------------------- | ------------------------------------------------------------------------------------------ | ----------- | -------- | ------------- |
| v2 Org-mode Alignment     | Emacs-style end-of-headline tags, FILETAGS inheritance, planning lines under headings, CLOSED stamp, and explicit migration command | DONE | v2.0.0 | realDestroyer |
| Tagged Agenda CONTINUED default | Tagged Agenda omits CONTINUED tasks by default (opt-in setting to include) to avoid duplicates when auto-forwarding | DONE | v2.0.2 | realDestroyer |
| Org-Indent-style indent decoration | When unicode decorations are off, indentation decorations still render with a trailing `*` (Emacs Org-Indent behavior) | DONE | v2.0.2 | realDestroyer |
| Insert Table (Org pipe output) | Insert Table webview generates canonical Org pipe tables and functions correctly under strict CSP | DONE | v2.0.2 | realDestroyer |
| Snippets ship in VSIX | Ensure `snippets/vso.json` is included in packaged VSIX so snippet completions work after install | DONE | v2.0.2 | realDestroyer |
| Checkbox + subtree stats | Org-mode statistics cookies (`[/]` and `[%]`), hierarchical counting, TODO-subtree completion included on heading cookies (DONE/ABANDONED count as complete), clickable agenda details, and editor toggle shortcut | DONE | v2.1.3 | realDestroyer |
| Org syntax + navigation helpers | Expanded Org-mode syntax highlighting plus Document Outline, clickable Org links, and `[[...]]` link completion (including workspace `id:` suggestions) | DONE | v2.1.4 | realDestroyer |
| Syntax scopes + customizer expansion | Fix task-state scope application for Unicode markers + expand Syntax Color Customizer to cover new Org syntax scopes | DONE | v2.1.5 | realDestroyer |
| Preview (Live HTML) + scroll sync | Webview-based live preview with automatic refresh and editor → preview scroll sync | In Progress | v2.2.0 | realDestroyer |
| Org Meta-Return insert | `Alt+Enter` context-aware insert of heading / list item / table row | In Progress | v2.2.0 | realDestroyer |
| Math symbol decorations | Render common LaTeX commands (e.g. `\alpha`) as Unicode glyphs inside `$...$` / `$$...$$` | In Progress | v2.2.0 | realDestroyer |
| LaTeX fragment rendering (org-fragtog-style) | Render LaTeX fragments as “inline images” (full math fragment preview, not only symbol substitutions) | Not Started |  | realDestroyer |
| Multi-line Selection Editing | Most editor shortcuts (status, schedule, deadline, tags, headings, date adjusters) apply to all selected task lines | DONE | v1.10.8 | realDestroyer |
| Keybinding Language-Mode Resilience | Core shortcuts keep working even when `.org` files are not in `vso` language mode | DONE | v1.10.9 | realDestroyer |
| TODO Notifications        | Notify users of status outside VSCode (email, sms, etc.)                                   | Not Started |          | realDestroyer |
| Make Titles Unique        | Don't allow duplicate titles                                                               | Not Started |          | realDestroyer |
| Calendar Right-Click Menu | Right-click task to create, duplicate, or delete in calendar                              | In Progress |          | realDestroyer |
| Bulleted Lists            | Make an ordered or unordered list                                                          | In Progress |          | realDestroyer |
| TODO Tracking             | Show TODO completion on the up-most level                                                  | In Progress |          | realDestroyer |
| JIRA Integration          | Allow tasks to be pushed to JIRA (Epic, Story, Issues, sub-tasks, etc.)                    | In Progress |          | realDestroyer |
| Agenda View Date Sorting  | Ensure Agenda View date groups render in chronological order                               | DONE        | v1.10.7  | realDestroyer |
| Cross-platform Paths      | Use `path.join(...)` for file open/read/create paths so commands work on Linux/macOS/Windows | DONE      | v1.10.7  | realDestroyer |
| Preserve Org `*` Headings | Optional marker style toggle (`headingMarkerStyle`) to keep `* TODO` headings for Emacs/org-mode compatibility | DONE | v1.10.5 | realDestroyer |
| Decorative Unicode Headings | Render Unicode markers via editor decorations while keeping `*` headings as the source of truth | DONE | v1.10.6 | realDestroyer |
| Configurable Date Format  | Ensure all date parsing/writing respects `Org-vscode.dateFormat` across commands/views     | DONE | v1.10.6 | realDestroyer |
| Syntax Color Customizer   | Webview UI with color pickers for all task states, live preview, save/reset to defaults   | DONE        | v1.10.0  | realDestroyer |
| Default Syntax Colors     | Extension provides out-of-box syntax highlighting via configurationDefaults               | DONE        | v1.10.0  | realDestroyer |
| CONTINUED Auto-Forwarding | When toggling to CONTINUED, auto-copy task to next day as TODO; remove on toggle-away     | DONE        | v1.9.0   | realDestroyer |
| DEADLINE Support          | Add DEADLINE dates with Ctrl+Alt+D, snippets, and color-coded Agenda badges               | DONE        | v1.9.0   | realDestroyer |
| Smart Date Keybinds       | Consolidated Alt+Shift+Arrow for day heading/SCHEDULED; Ctrl+Shift+Arrow for DEADLINE     | DONE        | v1.9.0   | realDestroyer |
| Day Heading Snippet       | /day snippet inserts day heading with today's date and weekday picker                     | DONE        | v1.9.0   | realDestroyer |
| Agenda View Filter        | Show only TODO and IN_PROGRESS tasks (exclude CONTINUED/DONE/ABANDONED)                   | DONE        | v1.9.0   | realDestroyer |
| Yearly Summary Exporter   | Parse full-year Org files and emit CSV/JSON summaries with per-tag metrics for reviews     | DONE        | v1.8.0   | realDestroyer |
| Executive Review Templates| Produce Markdown/HTML executive reports highlighting key accomplishments and timelines     | DONE        | v1.8.0   | realDestroyer |
| Year-in-Review Dashboard  | Webview dashboard that visualizes yearly stats (tag heatmaps, timelines, filters)          | DONE        | v1.8.0   | realDestroyer |
| Syntax Highlighting Refresh | Extended Org scopes for #+ directives, property drawers, and DEADLINE/CLOSED metadata so syntax colors match Calendar and Agenda views. | DONE | v1.7.6 | realDestroyer |
| Calendar Palette Sync     | Match calendar event colors to their tag chips for unified visuals                        | DONE        | v1.7.5   | realDestroyer |
| Calendar Status Bar       | Add calendar status strip + density tweaks for quick context                              | DONE        | v1.7.4   | realDestroyer |
| Calendar Tag Bubble Refresh| Restore bubbly tag chips scoped to current view with multi-select filtering              | DONE        | v1.7.3   | realDestroyer |
| Centralized Task Keyword/Symbol Manager | Refactored all keyword/symbol logic into a single manager file (`taskKeywordManager.js`) for consistency and maintainability across all commands and views. | DONE        | v1.7.1   | realDestroyer |
| Calendar Tag Filtering    | Filter calendar tasks by tag                                                              | DONE | v1.7.0 | realDestroyer |
| Hide Tags in Calendar     | Display only task content in calendar view (remove visible tag syntax from entry)        | DONE | v1.7.0 | realDestroyer |
| Calendar Filtering        | Filter tasks by status, date range, or deadline                                           | DONE | v1.7.0 | realDestroyer |
| Unicode Overhaul + Message Popup | Updated all status cycling + file syncing for âŠ™ âŠ˜ âŠœ âŠ– âŠ—; Ctrl+Alt+M message popup added    | DONE | v1.6.9   | realDestroyer |
| Bug Fixes                   | See CHANGELOG.md for full details                                                          | DONE | v1.6.8   | realDestroyer |
| Smart Tag Insertion         | Adds new tags inline and to #+TAGS header if missing                                       | DONE | v1.6.7   | realDestroyer |
| Comma-safe Message Parsing  | Escapes commas in message.text so complex task strings update correctly                    | DONE | v1.6.6   | realDestroyer |
| Bug Fixes                   | See CHANGELOG.md for full details                                                          | DONE | v1.6.5   | realDestroyer |
| Bug Fixes                   | See CHANGELOG.md for full details                                                          | DONE | v1.6.4   | realDestroyer |
| Agenda View Timestamp Format | Agenda View now adds long-form CLOSED timestamps when toggling DONE                        | DONE | v1.6.3   | realDestroyer |
| Bug Fixes                   | See CHANGELOG.md for full details                                                          | DONE | v1.6.2   | realDestroyer |
| Export Active Tasks         | Export all active (non-DONE) tasks to CurrentTasks.org with Ctrl + Shift + E               | DONE | v1.6.1   | realDestroyer |
| Expandable Agenda Children| Collapsible child lines for indented task content in Agenda View                          | DONE | v1.5.2 | realDestroyer |
| Export Current Tasks      | Export all non-DONE tasks to CurrentTasks.org, including child lines, and enable syncing with source files via keyword toggles | DONE | v1.5.1 | realDestroyer |
| Tables                    | Insert Tables into doc                                                                     | DONE        | v1.5.0   |               |
| Tagged Agenda View        | View a filtered list of tasks by tag (AND/OR modes supported)                             | DONE        | v1.4.0   | realDestroyer |
| Tagged Task Support       | Support Emacs-style end-of-headline tags using `:tag1:tag2:`                               | DONE        | v1.4.0   | realDestroyer |
| Expand/Collapse Agenda    | Agenda view now supports toggling sections, and [Expand All]/[Collapse All] functionality | DONE        | v1.3.0   | realDestroyer |
| Click to Modify Tasks     | Agenda and calendar views allow click-based toggling of TODO/DONE                         | DONE        | v1.3.0   | realDestroyer |
| Read entire workspace/dir | Read workspace or home directory for all .org files for calendar/agenda                   | DONE        | v1.2.0   | realDestroyer |
| Calendar Modifications    | You can drag and drop tasks in calendar view now, and it will accurately change sched date | DONE        | v1.2.0   | realDestroyer |
| Calendar View             | View a calendar with your scheduled tasks properly placed                                 | DONE        | v1.2.0   | realDestroyer |
| Agenda View / File Changes| The Agenda View now has the ability to modify the original line in the .org files         | DONE        | v1.1.0   | realDestroyer |
| Agenda View               | View a list of your scheduled tasks                                                        | DONE        | v1.0.0   | realDestroyer |
| Schedule TODOS            | Schedule todos for a later date                                                            | DONE        | v0.0.2  | BobyBoyd      |
| Increment Headings        | Pressing alt+ left or right arrow will increment or decrement the headings                | DONE        | v0.0.2   | BobyBoyd      |
| Header Formatting         | Format the headers automatically when they are typed.                                     | DONE        | v0.0.2   | BobyBoyd      |
| TODO and DONE             | Add the TODO and DONE keywords with alt + left keybind                                    | DONE        | v0.0.2   | BobyBoyd      |
| Add Formatting for all `*`| Can now add as many `*` and Org-vscode will format it                                     | DONE        | v0.0.2   | BobyBoyd      |
| View Tag List             | Open a file from the list of tags in the command prompt (`ctrl+shift+p`, `cmd+shift+p(mac)`) | DONE        | v0.0.2   | BobyBoyd      |
| View Title List           | Open a file from the list of titles in the command prompt (`ctrl+shift+p`, `cmd+shift+p(mac)`) | DONE        | v0.0.2   | BobyBoyd      |
| Create new .org file      | Create a .org file from the command prompt (`ctrl+shift+p`, `cmd+shift+p(mac)`)          | DONE        | v0.0.2   | BobyBoyd      |



