# Org-vscode How-To

> Organize your thoughts and tasks into hierarchical lists.
>
> * Create items using `*` (Org-mode compatible, recommended) with optional decorative Unicode rendering.
> * Mark tasks using configurable workflow states (TODO keywords) via `Org-vscode.workflowStates`.
> * Fold lists with `Tab`.
> * Increment or decrement headings using `Alt + Left/Right`.

---

## 📘 Table of Contents <a id="table-of-contents"></a>

* [⚙️ Extension Settings](#extension-settings)
* [✅ Multi-line selection editing](#-multi-line-selection-editing)
* [🧭 v2 Format + Migration](#v2-format--migration)
* [✅ Workflow States (TODO Keywords)](#workflow-states-todo-keywords)
* [📁 Change the Main Directory](#change-the-main-directory)
* [📝 Create a New .org File](#create-a-new-org-file)
* [🔖 Create a Header](#create-a-header)
* [🧩 Org-vscode Snippets](#org-vscode-snippets)
* [🔎 Org syntax + links](#org-syntax--links)
* [🧾 Properties & IDs](#properties--ids)
* [🪟 Preview (Live HTML/Markdown/etc.)](#preview-live-html)
* [∑ Math Symbol Decorations](#math-symbol-decorations)
* [📂 Open a File by Tags or Titles](#open-a-file-by-tags-or-titles)
* [📅 Agenda View & Scheduling](#agenda-view--scheduling)
* [☑️ Checkboxes](#checkboxes)
* [⏰ Deadlines](#deadlines)
* [🔁 Repeaters (Recurring Tasks)](#repeaters)
* [🔄 CONTINUED Auto-Forwarding](#continued-auto-forwarding)
* [📼 Partial Demo](#partial-demo)
* [🔤 Unicode Headings](#unicode-headings-based-on-asterisk-level)
* [🔁 Cycle Task Statuses](#cycle-task-statuses)
* [📒 LOGBOOK (State Change History)](#logbook)
* [🏷 Inline Tags & Tag Filtering](#inline-tags--tag-filtering)
* [🧮 Insert Org Table](#insert-org-table)
* [Align Scheduled Task Tags](#align-scheduled-tasks)
* [Tagged Agenda View](#tagged-agenda-view)
* [📆 Calendar View](#calendar-view)
* [🎨 Syntax Color Customizer](#syntax-color-customizer)
* [📊 Year-In-Review Dashboard](#year-in-review-dashboard)

---

## ⚙️ Extension Settings <a id="extension-settings"></a>

This section covers the most common editor/formatting settings so you can keep Org-vscode fast to navigate and predictable to edit.

- Jump to: [Org-mode compatibility](#org-mode-compatibility), [Indentation & auto-indent](#indentation-and-auto-indent), [Settings screenshots](#settings-screenshots)

### Org-mode compatibility (preserve `*` headings) <a id="org-mode-compatibility"></a>

If you want to preserve plain `*` headings in your files for use in other editors (Emacs/org-mode), set:

```json
"Org-vscode.headingMarkerStyle": "asterisks"
```

Default is `"unicode"`.

Recommended (Org-compatible source + pretty UI):

```json
"Org-vscode.headingMarkerStyle": "asterisks",
"Org-vscode.decorateUnicodeHeadings": true
```

### Indentation & auto-indent <a id="indentation-and-auto-indent"></a>

Optional indentation controls (decorations + Alt+Left/Right indentation):

```json
"Org-vscode.decorateHeadingIndentation": true,
"Org-vscode.adjustHeadingIndentation": 2,
"Org-vscode.autoIndentNonHeaderText": false,
"Org-vscode.bodyIndentation": 2
```

Notes:

- `adjustHeadingIndentation` controls heading indentation/level operations.
- `bodyIndentation` controls how far non-heading/body lines (including planning lines like `SCHEDULED:` / `DEADLINE:` / `CLOSED:`) are indented under a heading.

If you want body text to automatically indent under headings when you press Enter, enable:

```json
"Org-vscode.autoIndentNonHeaderText": true
```

Indent-only mode (Org-Indent style)

If you prefer plain `*` headings but still want visual indentation, turn unicode markers off and leave indentation on. Headings will keep a trailing `*` visible (like Emacs Org-Indent):

```json
"Org-vscode.headingMarkerStyle": "asterisks",
"Org-vscode.decorateUnicodeHeadings": false,
"Org-vscode.decorateHeadingIndentation": true
```

### Scheduled dates on folded headings

If you keep planning stamps on the child planning line (v2 format) and fold subtrees, you can optionally append the scheduled date to the heading line via decorations:

```json
"Org-vscode.decorateHeadingScheduledDates": true
```

Notes:

- Only task headings (headings with a TODO keyword) are decorated.
- The displayed date follows your `Org-vscode.dateFormat`.

### Deadline dates on folded headings

Similarly, you can append a task's `DEADLINE:` date to the heading line:

```json
"Org-vscode.decorateHeadingDeadlineDates": true
```

Notes:

- This is implemented via editor decorations (virtual text). It does not modify the file.

### Closed dates on folded headings

You can also append a task's `CLOSED:` date to the heading line:

```json
"Org-vscode.decorateHeadingClosedDates": true
```

Notes:

- For repeated tasks (multiple `CLOSED:` stamps in a LOGBOOK), Org-vscode prefers the *last* `CLOSED:` timestamp.
- These decorations are inline; VS Code does not support truly pinning them to the right edge of the editor window.

### Sort headings by SCHEDULED date

Run **Org-vscode: Sort Headings by Scheduled Date** to reorder headings by their `SCHEDULED:` timestamp.

Behavior:

- If your cursor is on (or inside) a heading that has 2+ **direct child headings**, the command sorts those children.
- Otherwise, it sorts the heading’s **siblings** at the current level (or the file’s **top-level** headings if there is no parent heading).
- Unscheduled headings sort last.

Optional setting:

```json
"Org-vscode.sortClosedTasksToTop": true
```

When enabled, done-like/closed tasks are placed at the top of the sorted region.

Additionally, when enabled, any command that transitions a task into a **done-like** TODO state will automatically move that task directly under the last done-like sibling (so your “DONE section” stays grouped as you complete items).

Notes:

- This setting uses the TODO keyword to detect done-like tasks (not just the presence of a `CLOSED:` stamp) so repeating tasks that reopen to `TODO` keep sorting with active items.
- Done-like tasks are ordered by `CLOSED:` timestamp (most recent first).

### Settings screenshots <a id="settings-screenshots"></a>

Extensions → org-vscode → Settings:

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/extension-settings.png?raw=true" width="900" />

VS Code Settings editor (search for `Org-vscode:`):

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/extension-settingsJson.png?raw=true" width="900" />

## 🧭 v2 Format + Migration <a id="v2-format--migration"></a>

Org-vscode v2 aligns more closely with Emacs Org-mode:

- **Tags**: end-of-headline `:TAG1:TAG2:`
- **Planning** (`SCHEDULED`, `DEADLINE`, `CLOSED`) lives on the indented line directly under the heading
- **Completion stamp**: `CLOSED:` is canonical (legacy `COMPLETED:` is still accepted)

### Migrate a file to v2 (explicit)

Run **Org-vscode: Migrate File to v2 Format** on a file that still contains legacy constructs like:

- `[+TAG:FOO,BAR]`
- `SCHEDULED:` / `DEADLINE:` / `CLOSED:` stamps on the headline line
- `COMPLETED:` timestamps

The migration is designed to be a single-file, explicit, one-time rewrite (no automatic background changes).

For the rationale and more examples, see: [Migration: v1 → v2](migrate-v1-to-v2.md)

### Tag naming note (hyphens)

To keep Emacs-style tag match strings unambiguous (where `-TAG` means “NOT TAG”), tag names normalize hyphens to underscores:

- `test-tag` becomes `TEST_TAG`
- existing `TEST-TAG` migrates to `TEST_TAG`

## ✅ Multi-line selection editing

Most editing commands can operate on multiple tasks at once.

1. Select multiple task lines (or use multi-cursor).
2. Run the normal shortcut/command.

Notes:

* Prompts (like picking a date or tag) happen once and apply to all selected tasks.
* Day headings are skipped where it wouldn’t make sense to edit them.

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/multiline-support-example.gif?raw=true" width="700" height="400" />

---

## ✅ Workflow States (TODO Keywords) <a id="workflow-states-todo-keywords"></a>

Org-vscode’s task keywords (workflow states) are **configurable** via `Org-vscode.workflowStates`.

You can edit this setting either:

- In JSON (Settings UI or `settings.json`), or
- Via the built-in GUI: run **“org-vscode Customize Syntax Colors”** and switch to the **Workflow States** tab.

### Workflow States GUI (Recommended)

1. Open the Command Palette → run **org-vscode Customize Syntax Colors**.
2. Click the **Workflow States** tab.
3. Edit the table:
  - **Keyword**: the TODO keyword to use in the file (must be one token; no spaces)
  - **Marker**: optional symbol shown when using Unicode heading markers
  - **Done-like**: counts as “done” for reports/exports
  - **Stamps CLOSED**: writes a `CLOSED:` timestamp when entering the state
  - **Triggers Forward**: marks the “carryover/forward-trigger” state (default is `CONTINUED`)
  - **Agenda / Tagged Agenda**: whether this state appears in those views
4. Reorder states with ↑ / ↓ to change your cycle order.
5. Click **Save Workflow**.

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/keyword-customization.jpg?raw=true" width="900" />

- The **order** of the array is the cycle order used by `Ctrl + →` / `Ctrl + ←`.
- Each state can optionally define semantics like:
  - **done-like** (used by exports/reports)
  - **CLOSED stamping** when transitioning into the state
  - **carryover/forward-trigger** behavior (default: `CONTINUED`)
  - **Agenda / Tagged Agenda visibility**

Default configuration (short example):

```json
"Org-vscode.workflowStates": [
  { "keyword": "TODO", "marker": "⊙", "agendaVisibility": "show", "taggedAgendaVisibility": "show" },
  { "keyword": "IN_PROGRESS", "marker": "⊘", "agendaVisibility": "show", "taggedAgendaVisibility": "show" },
  { "keyword": "CONTINUED", "marker": "⊜", "triggersForward": true, "agendaVisibility": "hide", "taggedAgendaVisibility": "hide" },
  { "keyword": "DONE", "marker": "⊖", "isDoneLike": true, "stampsClosed": true, "agendaVisibility": "hide", "taggedAgendaVisibility": "hide" },
  { "keyword": "ABANDONED", "marker": "⊗", "isDoneLike": true, "agendaVisibility": "hide", "taggedAgendaVisibility": "hide" }
]
```

**Note on syntax highlighting:** TextMate grammars/scopes are static, so custom keywords won’t automatically get new keyword-specific scopes. Org-vscode compensates with decorations by mapping custom states into a small set of legacy “buckets” for coloring.

---

## 📁 Change the Main Directory <a id="change-the-main-directory"></a>

By default, the main directory is set to your home folder.
To change it, use the command:
**`Org-vscode: Change Org-vscode Directory`**

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/changeDir.gif?raw=true" width="700" height="400" />

---

## 📝 Create a New `.org` File <a id="create-a-new-org-file"></a>

Create a new file inside your main directory using:
**`Org-vscode: Create new .org file`**

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/newFile.gif?raw=true" width="700" height="400" />

---

## 🔖 Create a Header <a id="create-a-header"></a>

Use the `/header` snippet to quickly generate a structured header.

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/headerSnippet.gif?raw=true" width="700" height="400" />

## ✨ Org-vscode Snippets <a id="org-vscode-snippets"></a>

Save time and create boilerplate with handy built-in snippets.
Just type the prefix and hit `Tab` to expand the snippet inside a `.org` file.

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/snippet-example.gif?raw=true" width="700" height="400" />


| Prefix       | Description                     |
| ------------ | ------------------------------- |
| `/header`    | Create a section header block   |
| `/todo`      | New TODO task (scheduled today) |
| `/checklist` | Checklist block with boxes      |
| `/meeting`   | Daily log or meeting notes      |
| `/tagged`    | Tagged task template            |
| `/deadline`  | Task with SCHEDULED + DEADLINE  |
| `/dl`        | Add DEADLINE to existing task   |
| `/table2`    | Quick 2x2 org-style table       |
| `/table3`    | Quick 3x3 org-style table       |
| `/section`   | Labeled section block           |
| `/template`  | Full task template with tags    |
| `/day`       | Day heading with date & separator |

### Example Expansions <a id="example-expansions"></a>

#### `/todo` <a id="todo"></a>

```org
* TODO Task description
  SCHEDULED: <04-21-2025>
```

---

## 🔎 Org syntax + links <a id="org-syntax--links"></a>

Org-vscode includes expanded Org-mode syntax highlighting plus navigation helpers for common Org constructs.

### Syntax highlighting (examples)

- Blocks:

```org
#+BEGIN_SRC javascript
console.log('hello')
#+END_SRC
```

### ▶️ Src block execution (Org-babel-style MVP) <a id="src-block-execution"></a>

Org-vscode can execute `#+BEGIN_SRC <language> ... #+END_SRC` blocks and immediately insert (or update) a `#+RESULTS:` block right after the `#+END_SRC`.

**How to run a block:**

- Click the CodeLens above `#+BEGIN_SRC` (**Execute src block**)
- Or right-click in the editor → **Execute Src Block**
- Or run from Command Palette: **Org-vscode: Execute Src Block**

**Supported languages (MVP):** Python, PowerShell, Bash, JavaScript (Node), C++.

**Results format (MVP):** results are inserted as:

```org
#+RESULTS:
: <line 1>
: <line 2>
```

Example:

```org
#+BEGIN_SRC python
print("Hello")
#+END_SRC
#+RESULTS:
: Hello
```

**Security / trust:** execution is disabled when the workspace is not trusted (VS Code Workspace Trust).

**Tooling requirements:**

- Python requires a Python executable (`python`/`python3` or your configured command)
- PowerShell uses `pwsh` (preferred) or `powershell`
- JavaScript uses `node`
- Bash uses `bash` (typically via WSL, Git Bash, or MSYS on Windows)
- C++ requires a compiler (`g++`, `clang++`, or `cl` from Visual Studio Build Tools)

**Configuration (Settings UI):**

- `Org-vscode.srcExecution.pythonCommand`
- `Org-vscode.srcExecution.powershellCommand`
- `Org-vscode.srcExecution.bashCommand`
- `Org-vscode.srcExecution.javascriptCommand`
- `Org-vscode.srcExecution.cppCompiler`
- `Org-vscode.srcExecution.cppCompilerStyle` (`auto`, `gcc`, `msvc`)

- Inline fragments:

```org
Inline math: $a^2 + b^2 = c^2$
Priority: [#A]
```

- Properties/drawers:

```org
:PROPERTIES:
:ID: 01234567-89ab-cdef-0123-456789abcdef
:CUSTOM_ID: demo-anchor
:END:
```

### Link navigation + completion

- Follow `[[links]]` with Ctrl+Click (Windows/Linux) / Cmd+Click (Mac).
- Type `[[` (or `[[id:`) to get link completions.

Optional UI enhancement:

- `Org-vscode.decorateLinkDescriptions`: when enabled, bracket links like `[[https://github.com][Github]]` are visually rendered as just `Github` (decorations only).
  - The full link is automatically revealed while your cursor is inside it (so it stays editable).
  - Command: **Org-vscode: Toggle Link Description Rendering**

Examples:

```org
[[https://example.com][External link]]
[[file:./notes.org][Local file]]
[[*A Heading In This File]]
[[id:01234567-89ab-cdef-0123-456789abcdef]]
[[#demo-anchor]]
```

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/links-example.jpg?raw=true" width="900" />

---

## 🧾 Properties & IDs <a id="properties--ids"></a>

Org-vscode supports Org-style property drawers and provides commands to manage properties without manual drawer editing.

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/property-inheritance-example.jpg?raw=true" width="900" />

### Property drawers

Property drawers use the canonical Org syntax:

```org
:PROPERTIES:
:OWNER: Alice
:CUSTOM_ID: demo-anchor
:END:
```

### Commands

- **Org-vscode: Set Property**
  - Sets/updates a property on the nearest heading.
  - Creates a `:PROPERTIES:` drawer if missing.
- **Org-vscode: Get Property (with inheritance)**
  - Looks up a property using Emacs-style precedence:
    1) current heading drawer
    2) parent heading drawers (nearest parent first)
    3) file-level `#+PROPERTY` directives
- **Org-vscode: Delete Property**
  - Deletes a property from the nearest heading and removes the drawer if it becomes empty.

### File-level properties (`#+PROPERTY`)

You can define file defaults with:

```org
#+PROPERTY: OWNER Alice
```

These act as a fallback for `Get Property (with inheritance)` when the property isn’t found on the current heading or any parent heading.

### IDs

IDs are used for cross-file link navigation and completion via `[[id:...]]`.

- **Org-vscode: Get or Create ID**
  - Ensures the nearest heading has an `:ID:` property.
  - Creates a UUID when missing.
  - Copies the ID to your clipboard.
- **Org-vscode: Set ID**
  - Sets/replaces the `:ID:` property on the nearest heading.
  - If you submit an empty input, it generates a UUID.
  - Copies the resulting ID to your clipboard.

#### `/checklist` <a id="checklist"></a>

```org
- [ ] First item
- [ ]
- [ ]
```

#### `/meeting` <a id="meeting"></a>

```org
* 04-21-2025 :: Weekly Sync
- Attendees:
- Notes:
- Action Items:
```

#### `/template` <a id="template"></a>

```org
* TODO Task Name
  SCHEDULED: <04-21-2025>
  CLOSED: []

- Description:
- Tags: :TAG:

------------------------
```

Snippets make it easy to maintain formatting consistency and move quickly through repetitive structures!

---

## 🪟 Preview (Live HTML) <a id="preview-live-html"></a>

Org-vscode includes a lightweight Live Preview (webview) so you can read your Org file as rendered HTML while you edit.

- Open preview to the side: `Ctrl + Alt + P`
- Or use the Command Palette:
  - **Org-vscode: Open Preview**
  - **Org-vscode: Open Preview To Side**

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/live-preview-example.gif?raw=true" width="700" height="400" />

Notes:

- Preview updates automatically as you type.
- Scroll sync (editor → preview) is supported.

---

## ∑ Math Symbol Decorations <a id="math-symbol-decorations"></a>

Inside math fragments (e.g. `$...$` or `$$...$$`), Org-vscode can optionally render common LaTeX commands as Unicode symbols while editing.

Example:

```org
Inline: $\alpha + \beta = \gamma$ and $a \leq b$.
```

Toggle the feature:

```json
"Org-vscode.decorateMath": true
```

This is intentionally lightweight (not a full LaTeX renderer). For org-fragtog-style “fragment images”, see the roadmap.

---

## 📂 Open a File by Tags or Titles <a id="open-a-file-by-tags-or-titles"></a>

You can open a file using either:

* **`Org-vscode: Open By Title`**
* **`Org-vscode: Open By Tag`**

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/openCommands.gif?raw=true" width="700" height="400" />

---

## 📅 Agenda View & Scheduling <a id="agenda-view-scheduling"></a>

* **Schedule an item** → Use `Ctrl + Alt + S`.
* **View your agenda** → Use **`Org-vscode: Agenda View`**.

The Agenda View respects `Org-vscode.workflowStates[*].agendaVisibility`.

By default it shows **TODO** and **IN_PROGRESS** tasks, and hides **CONTINUED** / **DONE** / **ABANDONED**.

Agenda View sections (Emacs-inspired):

- **Dated items**: tasks with `SCHEDULED: <...>`.
- **Deadline items**: tasks with `DEADLINE: <...>` even if they have no schedule (setting: `Org-vscode.agendaIncludeDeadlines`, default: `true`).
- **Undated items**: tasks with no `SCHEDULED` and no `DEADLINE` appear under an **`[UNDATED]`** section (setting: `Org-vscode.agendaIncludeUndated`, default: `true`).

### Tabs + range filtering

The Agenda View has two tabs:

- **Agenda**: scheduled / deadline / undated items (based on the settings above)
- **Closed**: recently completed tasks, grouped by completion date

Closed tasks are determined from `CLOSED:` planning stamps and (for repeaters/completion history) LOGBOOK `State "..." [timestamp]` entries; the most recent completion is used.

Use the **Range** selector (**All / This week / This month / This year**) to limit *both* the Agenda and Closed tabs.

- **This week** uses ISO week boundaries (**Monday–Sunday**).

### Performance notes (large `.org` files)

Agenda View scanning is optimized to stay fast even on large Org files.

If you still see slow loads, the biggest knobs are:

- Reduce the number of scanned files by setting your Org-vscode folder to only the directories you use for tasks.
- Disable click highlighting if you don’t need it: set `Org-vscode.agendaHighlightTaskOnClick` to `false`.

### Click-to-navigate (Agenda + Tagged Agenda)

You can click the **task text** (or the **filename**) to jump your cursor to the exact line in the source `.org` file.

Optional settings:

```json
"Org-vscode.agendaRevealTaskOnClick": true,
"Org-vscode.agendaHighlightTaskOnClick": true
```

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/openAgenda.gif?raw=true" width="700" height="400" />

---

## ☑️ Checkboxes <a id="checkboxes"></a>

Checkbox completion stats are cookie-driven (Emacs-style): add `[/]` (fraction) or `[%]` (percent) to the end of a heading or list item to show stats (Org-vscode renders them as `[n/m]` or `[p%]`).

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/checkbox-example.png?raw=true" width="900" />

### Toggle a checkbox from the keyboard

Place the cursor anywhere on a checkbox line (you do not need to put the cursor inside the `[ ]` brackets), then press:

* `Ctrl + Alt + X` → **Org-vscode: Toggle Checkbox Item**

This toggles the current checkbox and updates parent/child `[-]` / `[X]` / `[ ]` states.

Multi-line selection support:

- If you select multiple checkbox lines and press `Ctrl + Alt + X`, Org-vscode bulk-toggles the selection:
  - if **all** selected checkbox items are checked, it **unchecks** them all
  - otherwise it **checks** them all

Auto-DONE behavior:

- If `Org-vscode.autoDoneWhenAllCheckboxesChecked` is enabled, a task only auto-completes when:
  - all checkboxes in its subtree are checked, and
  - there are no incomplete child task headings (e.g. `** TODO ...`) in that subtree
- For repeating tasks, completing the last checkbox will reschedule/reopen the task and reset the subtree (checkboxes unchecked, child subtasks reset) for the next iteration.

### Toggle checkboxes from Agenda / Tagged Agenda

In both Agenda View and Tagged Agenda View:

1. Expand **Show Details**
2. Click any checkbox to toggle it

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/checkbox-agendaView-example.png?raw=true" width="900" />

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/checkbox-taggedAgenda-example.png?raw=true" width="900" />

---

## ⏰ Deadlines <a id="deadlines"></a>

Add deadline dates to tasks to track when they're due. Deadlines appear in the Agenda View with color-coded warning badges.

### Adding a Deadline

**Option 1: Keyboard Shortcut**
* Press `Ctrl + Alt + D` on a task line
* Enter month, day, and year when prompted
* The deadline is inserted after the SCHEDULED date (if present)

**Option 2: Snippet**
* Type `/deadline` for a new task with both SCHEDULED and DEADLINE
* Type `/dl` to add just a DEADLINE line to an existing task

### Deadline Format

```org
* TODO Complete documentation :PROJECT:
  SCHEDULED: <12-10-2025>  DEADLINE: <12-15-2025>
```

Date formatting is controlled by `Org-vscode.dateFormat` (default: `MM-DD-YYYY`).

If you change `Org-vscode.dateFormat`, Org-vscode does not automatically rewrite existing dates.
Use **Org-vscode: Convert Dates in Current File** from the Command Palette to convert day headings, `SCHEDULED:`, and `DEADLINE:` stamps.

### Adjusting Deadline Dates

* `Ctrl + Shift + →` — Move deadline forward one day
* `Ctrl + Shift + ←` — Move deadline backward one day

### Agenda View Deadline Badges

Tasks with deadlines show color-coded badges:

| Badge | Color | Meaning |
|-------|-------|---------|
| ⚠ OVERDUE | 🔴 Red (pulsing) | Past the deadline |
| ⚠ DUE TODAY | 🟠 Orange | Deadline is today |
| ⏰ Due in X days | 🟡 Yellow | 1-3 days until deadline |
| 📅 Due: date | ⚫ Gray | 4+ days until deadline |

---

## 🔁 Repeaters (Recurring Tasks) <a id="repeaters"></a>

Repeaters let a task automatically reschedule itself when you complete it.

Add a repeater token inside the timestamp:

```org
* TODO Pay rent
  SCHEDULED: <01-01-2026 +1m>
```

Supported repeater styles:

- `+1w` (regular): shift forward one interval from the scheduled/deadline date
- `++1w` (catch-up): keep shifting forward until the next date is in the future
- `.+1w` (from completion): shift forward from today (completion date)

Notes:

- Repeaters can be used on both `SCHEDULED:` and `DEADLINE:` timestamps.
- Repeaters work when completing a task from the editor, Agenda View, or Tagged Agenda View.

### Reopen state (REPEAT_TO_STATE)

By default, completing a repeating task will advance its date and reopen it as the first configured workflow state (typically `TODO`).

To reopen to a specific state, set `REPEAT_TO_STATE` in a property drawer (supports inheritance from parent headings):

```org
* Project
  :PROPERTIES:
  :REPEAT_TO_STATE: IN_PROGRESS
  :END:

** TODO Weekly review
  SCHEDULED: <01-15-2026 +1w>
```

### Command: Set Repeater

Use **Org-vscode: Set Repeater...** to add/update/remove repeater tokens across one or more selected tasks.

- You can apply to `SCHEDULED`, `DEADLINE`, or `BOTH`.
- This command updates existing stamps; use `Ctrl + Alt + S` / `Ctrl + Alt + D` first if the task has no `SCHEDULED:`/`DEADLINE:`.

---

## 🔄 CONTINUED Auto-Forwarding <a id="continued-auto-forwarding"></a>

Org-vscode supports a configurable “carryover/forward-trigger” state (default: `CONTINUED`).

When you toggle a task into the forward-trigger state, Org-vscode automatically copies it to the next day as the **first configured workflow state** (default: `TODO`) with an updated scheduled date.

This works both from the editor hotkeys and when you click the keyword in Agenda/TaggedAgenda views.

### How It Works

1. **Toggle into the forward-trigger state** (default: `CONTINUED`) using `Ctrl + →` / `Ctrl + ←` or by clicking the keyword in Agenda/TaggedAgenda.
  - The task on the current day becomes the forward-trigger keyword.
  - A copy appears under the next day's heading as the **first workflow keyword** (default: `TODO`).
  - The `SCHEDULED:` date is updated to the next day.

2. **Toggle away from the forward-trigger state**
  - The forwarded copy is automatically removed from the next day.

### Example

**Before toggling to CONTINUED:**
```org
* [12-10-2025 Wed] -------
** TODO : Review pull request    SCHEDULED: <12-10-2025>
```

**After toggling to CONTINUED:**
```org
* [12-10-2025 Wed] -------
** CONTINUED : Review pull request    SCHEDULED: <12-10-2025>

* [12-11-2025 Thu] -------
** TODO : Review pull request    SCHEDULED: <12-11-2025>
```

This feature ensures tasks that roll over to the next day are automatically tracked without manual copying.

---

## 📼 Partial Demo <a id="partial-demo"></a>

* **Partial Demo**

  <img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/fullDemo.gif?raw=true" width="700" height="400" />

---

## 🔤 Heading Marker Styles <a id="unicode-headings-based-on-asterisk-level"></a>

Org-vscode supports two heading marker styles:

- **unicode** (default): task headings may include an optional Unicode marker *from your configured workflow state* (e.g. `⊙ TODO ...`).
- **asterisks**: preserves Org-style `* TODO ...` headings in-file for interoperability.

Important:

- **Heading depth** is always determined by the number of asterisks at the start of the line (`*`, `**`, `***`, ...).
- **Workflow markers** (like `⊙`, `⊘`, etc.) come from `Org-vscode.workflowStates[*].marker` and represent the task state — they do not represent heading depth.

If you want Org-compatible source files but still prefer a “pretty” UI, enable decorations:

```json
"Org-vscode.headingMarkerStyle": "asterisks",
"Org-vscode.decorateUnicodeHeadings": true
```

**Note:**

* The number of asterisks (`*`) at the start of a line determines heading depth.
* In `unicode` mode, Org-vscode stores Unicode markers directly in the file.
* In `asterisks` mode, Org-vscode stores plain `* TODO ...` headings in the file.
* If you enable `Org-vscode.decorateUnicodeHeadings`, Org-vscode can render Unicode markers visually via editor decorations while keeping the file content as `*`.

---

## 🔁 Cycle Task Statuses <a id="cycle-task-statuses"></a>

Org-vscode task states (TODO keywords) are configurable via `Org-vscode.workflowStates`.

In the editor, you can change task keywords in two ways:

* `Ctrl + →` — cycle forward (selection-aware)
* `Ctrl + ←` — cycle backward (selection-aware)
* **Org-vscode: Set TODO State...** — pick an exact state from a list (Command Palette)

Default task states (when you do not override `workflowStates`):

| Status Keyword | Symbol | Notes |
| -------------- | ------ | ----- |
| `TODO`         | ⊙      | First state in the cycle |
| `IN_PROGRESS`  | ⊘      | Work-in-progress |
| `CONTINUED`    | ⊜      | Default carryover/forward-trigger state |
| `DONE`         | ⊖      | done-like; stamps `CLOSED:` |
| `ABANDONED`    | ⊗      | done-like |

### 💡 Ways to Change Task Status <a id="ways-to-change-task-status"></a>

#### 🔘 In Agenda View or Tagged Agenda View <a id="in-agenda-view-or-tagged-agenda-view"></a>

* Click on the current status (e.g. `TODO`) to cycle through the configured options.
* The task line is automatically updated in the source file.
* If switching **into a state that stamps CLOSED** (default: `DONE`), a `CLOSED:` timestamp is inserted on the next line.
* If switching **out of a CLOSED-stamping state**, the `CLOSED:` line is removed.

---

## 📒 LOGBOOK (State Change History) <a id="logbook"></a>

By default, Org-vscode writes a single `CLOSED:` timestamp when you enter a CLOSED-stamping state (typically `DONE`).
If you want a *history* of completions/state changes (Org-mode-style), you can enable LOGBOOK logging.

### Enable LOGBOOK logging

```json
"Org-vscode.logIntoDrawer": true,
"Org-vscode.logDrawerName": "LOGBOOK"
```

### What it does

- On a completion transition into a state that stamps `CLOSED:` (typically `DONE`), Org-vscode inserts a newest-first entry into a drawer (default `:LOGBOOK:`) under the heading.
- Works from the editor (Set TODO State / cycle left-right), checkbox auto-done, Agenda View, and Tagged Agenda View.

Example:

```org
* DONE Weekly review
  SCHEDULED: <2026-01-15 +1w>  CLOSED: [2026-01-16 Fri 09:12]
  :LOGBOOK:
  - State "DONE" from "TODO" [2026-01-16 Fri 09:12]
  :END:
```

#### ✏️ In the `.org` file directly <a id="in-the-org-file-directly"></a>

You can manually change task keywords:

```org
* TODO Finish feature documentation :PROJECT:
```

Or remove/change the keyword symbol, and the extension will update it accordingly on save.

---

## 🌿 Inline Tags & Tag Filtering <a id="inline-tags-tag-filtering"></a>

Org-vscode supports **inline tagging** to categorize tasks and enable advanced filtering in the UI.

### 📝 Add Tags to a Task <a id="add-tags-to-a-task"></a>

To tag a task, use Emacs-style end-of-headline tags:

```org
* TODO Prepare project proposal :WORK:URGENT:
```

* Tags are comma-separated
* Placement must be immediately after the status keyword
* No spaces allowed in tag names

---

### 🌿 Add Tags to an Existing Task <a id="add-tags-to-an-existing-task"></a>

Use the command:
**`Org-vscode: Add Tag to Task`**
🔑 **Keybinding:** `Ctrl + Shift + T`

This command prompts you to enter one or more tags (comma-separated), and automatically inserts them into the currently selected task.

---
## 📏 Align Scheduled Tasks <a id="align-scheduled-tasks"></a>

Use this command to visually align `SCHEDULED:` timestamps (and end-of-line tags, when present) in your current `.org` file.
This improves readability by ensuring every scheduled date starts in the same column — even across differently sized task descriptions.

**v2 behavior note:** Tag alignment applies only to heading/task lines (it will not align `:PROPERTIES:` drawers). You can also configure what this command aligns (tags vs legacy inline `SCHEDULED:` vs planning-line normalization).

### v2 format demo

In v2 format, planning metadata lives on the indented line directly under the heading.

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/v2-align-schedules.gif?raw=true" width="700" height="400" />

---

### Legacy (v1 inline) demo

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/align-schedules.gif?raw=true" width="700" height="400" />

---

### 🛠 What It Does <a id="what-it-does"></a>

* Scans the file for `SCHEDULED: <date>` (format controlled by `Org-vscode.dateFormat`)
* Determines the longest task description in the file
* Pads shorter lines so timestamps and/or end-of-line tags line up cleanly
* Preserves original indentation

Optional configuration (tags-only mode):

```json
"Org-vscode.alignSchedulesAlignTags": true,
"Org-vscode.alignSchedulesAlignInlineScheduled": false,
"Org-vscode.alignSchedulesNormalizePlanningLines": false
```

---

### 📌 Example <a id="example"></a>

#### v2 format (planning line)

**Before:**

```org
* TODO Review meeting notes :TEST_TAG:
  SCHEDULED: <06-21-2025> DEADLINE: <06-25-2025>

* DONE Email client :TEST_TAG:
  SCHEDULED: <06-20-2025>  DEADLINE: <06-22-2025>

* IN_PROGRESS Fix bug :TEST_TAG:
  SCHEDULED: <06-22-2025> DEADLINE: <06-30-2025>
```

**After Running Align:**

```org
* TODO Review meeting notes        :TEST_TAG:
  SCHEDULED: <06-21-2025>  DEADLINE: <06-25-2025>

* DONE Email client                :TEST_TAG:
  SCHEDULED: <06-20-2025>  DEADLINE: <06-22-2025>

* IN_PROGRESS Fix bug              :TEST_TAG:
  SCHEDULED: <06-22-2025>  DEADLINE: <06-30-2025>
```

---

#### Legacy (v1 inline schedules)

**Before:**

```org
* TODO Review meeting notes           SCHEDULED: <06-21-2025>
* DONE Email client      SCHEDULED: <06-20-2025>
* IN_PROGRESS Fix bug             SCHEDULED: <06-22-2025>
```

**After Running Align:**

```org
* TODO Review meeting notes           SCHEDULED: <06-21-2025>
* DONE Email client                   SCHEDULED: <06-20-2025>
* IN_PROGRESS Fix bug                 SCHEDULED: <06-22-2025>
```

---

### ▶️ How to Use <a id="how-to-use"></a>

* Run the command: **`Org-vscode: Align Scheduled Tasks`**
* 🗝️ **Keybinding:** `Alt + Shift + A`
* The alignment only affects the currently open file

A helpful formatting tool for keeping things clean — especially in large org files!
---

## 📂 Open Files by Tag <a id="open-files-by-tag"></a>

Use the command:
**`Org-vscode: Open By Tag`**
🔑 *(No keybinding — must be run via Command Palette)*

You'll be prompted to pick a tag, and then a file containing that tag. This helps you jump to relevant `.org` files based on tag metadata.

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/open-by-tag.gif?raw=true" width="700" height="400" />
---

## 🧠 Tagged Agenda View <a id="tagged-agenda-view"></a>

Use the command:
**`Org-vscode: Tagged Agenda View`**
🔑 **Keybinding:** `Ctrl + Shift + G`

This lets you filter tasks across all files by tag(s). Two modes are supported:

* `any:tag1,tag2` → **OR logic** (match *any* tag)
* `all:tag1,tag2` → **AND logic** (must match *all* tags)

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/tagged-agenda-example.gif?raw=true" width="700" height="400" />

#### 📁 Features: <a id="features"></a>

* Groups results by file
* Shows each task with its current status, and whether it's **SCHEDULED**, **DEADLINE**, or **UNDATED**
* Clickable filenames open the source (or reveal the exact task line)
* Clickable task text reveals the exact task line
* Clickable status cycles through keywords
* Default: includes tasks of **all statuses** for reporting/analytics (`Org-vscode.taggedAgendaIncludeAllStatuses`)
* Use `[Expand All]` / `[Collapse All]` buttons to show/hide groups

#### 🔍 Example: <a id="example-2"></a>

```text
Enter tags (comma-separated). Use 'any:' for OR logic. Ex: any:urgent,review
```

---
🧮 Insert Org Table

Create beautiful .org mode tables using a built-in visual editor.

Use the command:Org-vscode: Insert Org Table🔑 Keybinding: Alt + Shift + T

This opens a web-based table builder that lets you:

Choose number of rows and columns

Add optional header row

Enable column labels (A, B, C, ...)

Enable row numbers (1, 2, 3, ...)

Add row separators

Choose alignment: Left, Center, or Right

Once you’re done, click Insert Table to automatically place it at your cursor.

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/insert-table-example.gif?raw=true" width="700" height="400" />


---
## 📆 Calendar View <a id="calendar-view"></a>

The **Calendar View** provides a powerful visual way to see your scheduled Org tasks in a monthly or weekly layout — with interactive support for drag-to-reschedule, tag filtering, and click-to-open behavior.

### 🧭 Open the Calendar View <a id="open-the-calendar-view"></a>

Use the command:
**`Org-vscode: Open Calendar View`**
🔑 **Keybinding:** `Ctrl + Shift + C`

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/calendar-example.gif?raw=true" width="700" height="400" />

---

### ✨ Features: <a id="features-2"></a>

#### ✅ Displays Scheduled Tasks <a id="displays-scheduled-tasks"></a>

* Tasks with `SCHEDULED: <date>` are shown as calendar events (format controlled by `Org-vscode.dateFormat`).
* Supports both marker styles (`unicode` and `asterisks`).
* Automatically parses `.org` files in your main directory (excluding `CurrentTasks.org`).

#### 🖱 Click to Open Task <a id="click-to-open-task"></a>

* Clicking an event will open the source `.org` file in your editor.

#### 🔀 Drag to Reschedule <a id="drag-to-reschedule"></a>

* Drag and drop events to a new date on the calendar.
* The `.org` file will be automatically updated with the new `SCHEDULED:` date.

#### 🏷 Tag Bubbles for Filtering <a id="tag-bubbles-for-filtering"></a>

* If a task contains end-of-headline tags like `:WORK:URGENT:`, those tags appear as clickable colored bubbles.
* Click a tag to filter tasks shown on the calendar.
* Use `Ctrl + Click` to multi-select tags.

#### 🎨 Custom Color Coding <a id="custom-color-coding"></a>

* Each tag is assigned a unique background color using HSL values.
* This makes it easy to visually distinguish different categories of tasks.

---

### 💡 Bonus Behavior <a id="bonus-behavior"></a>

* Supports FullCalendar views: `Month`, `Week`, `Day`.
* Updates automatically if you reschedule or change a task keyword.

Use this view to stay on top of deadlines and visually manage your priorities!

---

## 🎨 Syntax Color Customizer <a id="syntax-color-customizer"></a>

The **Syntax Color Customizer** provides a beautiful webview interface for customizing how your Org files look. No more manually editing JSON in settings.json!

### 🧭 Open the Syntax Color Customizer <a id="open-the-syntax-color-customizer"></a>

Use the Command Palette (`Ctrl + Shift + P`) and run:
**`org-vscode Customize Syntax Colors`**

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/Syntax-Highlight-WebUI.png?raw=true" width="900" />

### ✨ Features <a id="syntax-customizer-features"></a>

#### 🎨 Visual Color Pickers <a id="visual-color-pickers"></a>

* Click any color swatch to open the native color picker
* Or type hex codes directly (e.g., `#FF5A5A`)
* Changes sync instantly between picker and text input

#### 📝 Font Style Toggles <a id="font-style-toggles"></a>

* Toggle **Bold** and **Italic** for each element
* Combine styles (bold + italic) for emphasis

#### 👁 Live Preview <a id="live-preview"></a>

* See exactly how each element will appear
* Previews update in real-time as you adjust colors and styles

Note: the preview is instantaneous, but some in-editor visuals (like heading date suffixes) are VS Code decorations rendered by the extension. Those update when you save your colors and may take a moment to refresh.

#### 📂 Organized by Task Type <a id="organized-by-task-type"></a>

Elements are grouped for easy navigation:
* **TODO Tasks** - Symbol, keyword, and task text
* **IN_PROGRESS Tasks** - Symbol, keyword, and task text
* **CONTINUED Tasks** - Symbol, keyword, and task text
* **DONE Tasks** - Symbol, keyword, and task text
* **ABANDONED Tasks** - Symbol, keyword, and task text
* **Heading Decorations** - Heading SCHEDULED / DEADLINE suffix styling
* **Other Elements** - SCHEDULED/DEADLINE/CLOSED stamps, inline tags, agenda dates, property drawers

#### 💾 Save & Reset <a id="save-and-reset"></a>

* **Save Colors** - Writes your customizations to VS Code user settings
* **Reset to Defaults** - Restores the extension's default color scheme

#### ⌨️ Keyboard Shortcuts Link <a id="keyboard-shortcuts-link"></a>

At the bottom of the customizer, there's a quick link to open VS Code's Keyboard Shortcuts editor, pre-filtered to org-vscode commands. This makes it easy to customize your keybindings alongside your colors.

### 🎯 Default Colors <a id="default-colors"></a>

Even without customization, the extension now provides sensible default colors that work out of the box:

| Element | Default Color | Style |
|---------|--------------|-------|
| TODO | Green (`#24FF02`) | Bold |
| IN_PROGRESS | Blue (`#33BFFF`) | Italic |
| CONTINUED | Gray (`#888888`) | Italic |
| DONE | Bright Green (`#3AF605`) | Bold |
| ABANDONED | Red (`#FF3B3B`) | Bold |
| SCHEDULED | Yellow (`#d1e800`) | Bold |
| Tags | Purple (`#C984F7`) | Bold |
| Dates | Gold (`#F7CA18`) | Italic |

---

## 📊 Year-In-Review Dashboard <a id="year-in-review-dashboard"></a>

The Year-In-Review suite turns any Org journal into executive-ready artifacts (CSV, Markdown, HTML) and an interactive dashboard. Everything begins with a single command:

### 1. Launch the dashboard command

Run **`org-vscode: Open Year-In-Review Dashboard`** from the Command Palette.

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/year-in-review-dashboard-command.jpg?raw=true" width="700" height="120" />

### 2. Pick the Org file you want to summarize

Choose any `.org`, `.vsorg`, or `.vso` file from your Org-vscode directory. The extension parses the whole year, builds fresh CSV/JSON/Markdown/HTML reports, and then opens the dashboard beside your editor.

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/year-in-review-dashboard-step1.jpg?raw=true" width="700" height="420" />

### 3. Explore the **Insights** tab

- Use the **Open Org File / Reveal Report Folder / CSV / Markdown / HTML** bubbles to jump straight to the generated artifacts.
- The **Timeline Pulse** bar chart respects the status dropdown so you can isolate DONE-only months or compare everything at once.
- Click any square in the **Tag Heatmap** to filter the Task Storyboard by that month/tag combo; stack additional filters with the keyword search box and `Reset filters` button.

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/year-in-review-dashboard-example.jpg?raw=true" width="900" height="420" />

### 4. Dive into the **Raw Tasks** tab

- Every column header is sortable—click once for ascending, again for descending.
- Type into the inline filter boxes to match exact strings (e.g., show only `ABANDONED` rows or a date range).
- Drag the slim resize handle on the right edge of any header to widen or shrink that column; the table grows horizontally and stays scrollable so you can see long notes.
- Use **Open CSV Artifact** at the top-right if you want to inspect or share the underlying `year-summary.csv` directly.

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/year-in-review-dashboard-rawTasks-example.jpg?raw=true" width="900" height="285" />

Tip: Because the Year-In-Review model shares the same parser as the exporters, you can rerun the command any time you update your Org file—the dashboard will refresh immediately with the latest stats and files.

📄 **Want a starting point?** Copy the [example template](https://github.com/realDestroyer/org-vscode/blob/master/examples/year-template.org) into your own `.org` file and run the dashboard to see it in action.
