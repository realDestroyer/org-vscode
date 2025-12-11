# Change Log

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

- **SCHEDULED Tag Ordering:**
  - Fixed issue where adding a SCHEDULED date to a line that already had a DEADLINE would place SCHEDULED after DEADLINE, breaking syntax highlighting.
  - The `Ctrl+Alt+S` command now correctly inserts SCHEDULED before any existing DEADLINE tag.
  - Also added zero-padding for single-digit months/days (e.g., `1` → `01`).

# [1.9.0] 12-10-25
`Enhanced`

- **CONTINUED Task Auto-Forwarding:**
  - When toggling a task to `CONTINUED` status, the task is automatically copied to the next day as a `TODO` with an updated `SCHEDULED:` date.
  - When toggling away from `CONTINUED`, the forwarded copy is automatically removed from the next day.
  - Creates the next day's heading if it doesn't already exist.

- **DEADLINE Support:**
  - New `DEADLINE: [MM-DD-YYYY]` metadata for tasks with due dates.
  - New snippet `/deadline` creates a task with both SCHEDULED and DEADLINE dates.
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
  - You can now add inline tags using the format `: [+TAG:tag1,tag2] -`
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
