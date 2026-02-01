<p align="center">
	<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/org-vscode-logo.png?raw=true" alt="org-vscode" width="512" />
</p>  

![VS Marketplace Version](https://img.shields.io/visual-studio-marketplace/v/realDestroyer.org-vscode?label=VS%20Marketplace)
![Open VSX Version](https://img.shields.io/open-vsx/v/realDestroyer/org-vscode?label=Open%20VSX)

> A fast, keyboard-driven Org Mode–style task manager built for Visual Studio Code.
> Inspired by Emacs Org Mode

Org-vscode’s long-term direction is to emulate Emacs Org Mode as closely as practical in VS Code (syntax, navigation, and editing workflows). Some Emacs features are still in progress — see the v2.2 parity checklist below.

## 🎬 Demo

![Demo](https://github.com/realDestroyer/org-vscode/raw/master/Images/demo-example-file.gif)

Video download (mp4): https://github.com/realDestroyer/org-vscode/raw/master/Images/demo1.mp4

---

## Summary

Org-vscode helps you manage tasks, notes, and projects in plain text `.org` files — with a keyboard-first workflow, clickable Agenda/Calendar views, tags, checklists, and multi-line selection editing.

## Feature Highlights

- Selection-aware editing across multiple lines (status, schedule, deadline, tags, indentation)
- Optional auto-indent of body/planning lines on Enter (`Org-vscode.autoIndentNonHeaderText` + `Org-vscode.bodyIndentation`)
- Optional scheduled-date suffix on task headlines via decorations (`Org-vscode.decorateHeadingScheduledDates`)
- v2 Org-mode alignment: `:TAGS:` at end of headline, planning lines under headings, `CLOSED:` stamp
- Align Schedules behavior is configurable (and won’t align `:PROPERTIES:` drawers)
- Configurable TODO workflow states (`Org-vscode.workflowStates`) with per-state semantics (done-like, CLOSED stamping, carryover/forward-trigger, agenda visibility)
- Repeating tasks via Org repeaters (`+`, `++`, `.+`) with optional `REPEAT_TO_STATE` reopen behavior
- Optional LOGBOOK drawer logging for completion history (`Org-vscode.logIntoDrawer`, `Org-vscode.logDrawerName`)
- Faster Agenda scanning on large `.org` files (performance improvements for big task files)
- Agenda View + Tagged Agenda View (Emacs-style match strings) + Calendar View (click task text to jump to the exact source line)
	- Agenda View includes scheduled tasks, deadline-only tasks, and an optional (default-on) `[UNDATED]` section for tasks with no dates
- Checklists with hierarchical parent/child checkbox states
- Org-mode statistics cookies: `[/]` (fraction) and `[%]` (percent)
- Subtree completion stats on headings (TODO subtree completion + checkbox completion)
- Emphasis rendering for `*bold*`, `/italic/`, `_underline_`, `+strike+`
- Org-mode syntax highlighting for common constructs: lists, code blocks, links, priorities (`[#A]`), property drawers, directives (`#+...`), and basic math fragments
- Execute `#+BEGIN_SRC` code blocks (Org-babel-style MVP) and insert/update `#+RESULTS:` immediately (CodeLens + right-click + command palette)
- Live Preview (HTML) with editor → preview scroll sync
- Math symbol decorations (experimental): renders common LaTeX commands (e.g. `\alpha`) as Unicode glyphs while editing
- Smart navigation helpers: Document Outline (headings) + clickable Org links (including `[[*heading]]`, `[[id:...]]`, `[[#target]]`, `file:`, `http(s)`, `mailto:`)
- Org link auto-completion inside `[[...]]` (including workspace-wide `id:` suggestions)
- Property drawer helpers: set/get/delete properties (with inheritance) + ID helpers (get-or-create, set/replace)
- Org table generator (command + snippets)
- Reports/tools: Export Current Tasks, Export Yearly Summary, Executive Report, Year-In-Review Dashboard
- Customization: Syntax Color Customizer (colors + Workflow States editor) + settings for heading markers / indentation / decorations
- Commands: Sort Headings by Scheduled Date (`Org-vscode.sortClosedTasksToTop` optional)

See every feature in one file:

- Demo GIF: https://github.com/realDestroyer/org-vscode/blob/master/Images/demo-example-file.gif
- Download the example file: https://raw.githubusercontent.com/realDestroyer/org-vscode/master/examples/demo-walkthrough.org

For the full guide (examples + screenshots), see:

- https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md

## 🚀 Quick Start (Emacs-inspired)

Most workflows are designed to feel familiar if you use Emacs Org Mode — keyboard-first, selection-aware edits, and “structure-first” navigation.

- Open the Command Palette and run Org-vscode commands (many have default keybindings below).
- Use `Ctrl+Shift+O` to jump to headings (Outline is powered by the Org heading structure).
- Use `Ctrl+Click` (Windows/Linux) / `Cmd+Click` (Mac) on `[[links]]` to follow them.
- Type `[[` (or `[[id:`) to trigger Org link completion.

## 🔑 Keyboard Shortcuts

Most editing shortcuts support multi-line selection: highlight multiple task lines (or use multi-cursor) and run the command to apply it to every selected line.

| Shortcut             | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `Ctrl + →`           | Cycle TODO keyword forward (selection-aware)           |
| `Ctrl + ←`           | Cycle TODO keyword backward (selection-aware)          |
| *(Command Palette)*  | Org-vscode: Set TODO State...                          |
| `Shift + Alt + ↑`    | Move task block up (keeps children/subtree)            |
| `Shift + Alt + ↓`    | Move task block down (keeps children/subtree)          |
| `Alt + →`            | Increase heading level (selection-aware)               |
| `Alt + ←`            | Decrease heading level (selection-aware)               |
| `Alt + Enter`        | Smart insert new element (Org Meta-Return style)       |
| `Ctrl + Shift + [`   | Fold section                                           |
| `Ctrl + Shift + ]`   | Unfold section                                         |
| `Ctrl + Alt + S`     | Schedule a task (selection-aware)                      |
| `Ctrl + Alt + D`     | Add deadline to task (selection-aware)                 |
| `Ctrl + Alt + X`     | Toggle checkbox item (selection-aware)                 |
| `Alt + Shift + →`    | Smart date forward (selection-aware)                   |
| `Alt + Shift + ←`    | Smart date backward (selection-aware)                  |
| `Ctrl + Shift + →`   | Deadline date forward (selection-aware)                |
| `Ctrl + Shift + ←`   | Deadline date backward (selection-aware)               |
| `Alt + Shift + A`    | Align all scheduled timestamps                         |
| `Alt + Shift + S`    | Add separator line (hyphens)                           |
| `Ctrl + Shift + T`   | Add tag to task (selection-aware)                      |
| *(Command Palette)*  | Org-vscode: Convert Dates in Current File              |
| `Ctrl + Shift + G`   | Open the Tagged Agenda View                            |
| `Ctrl + Shift + C`   | Open the Calendar View                                 |
| `Ctrl + Alt + P`     | Open Live Preview to the side                          |
| `Ctrl + Shift + E`   | Export all active (non-DONE) tasks to CurrentTasks.org |
| `Ctrl + Alt + M`     | Show popup message (GitHub link)                       |

Src block execution currently has no default keybinding (use CodeLens, right-click, or Command Palette: **Org-vscode: Execute Src Block**).

---

## 🧩 Snippets

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

---

## ✅ Multi-line selection editing

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/multiline-support-example.gif?raw=true" width="700" height="400" />

---

## More Details

Everything else lives in the How-To. Jump straight to the section you need:

- Migration (v1 → v2): https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#v2-format--migration
- Agenda View: https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#agenda-view--scheduling
- Checkboxes: https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#checkboxes
- Deadlines: https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#deadlines
- CONTINUED auto-forwarding: https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#continued-auto-forwarding
- Inline tags: https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#inline-tags--tag-filtering
- Align scheduled tasks: https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#align-scheduled-tasks
- Tagged Agenda: https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#tagged-agenda-view
- Calendar View: https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#calendar-view
- Syntax Color Customizer: https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#syntax-color-customizer
- Year-In-Review Dashboard: https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md#year-in-review-dashboard

Other docs:

- Changelog: https://github.com/realDestroyer/org-vscode/blob/master/docs/CHANGELOG.md
- Roadmap: https://github.com/realDestroyer/org-vscode/blob/master/docs/roadmap.md

---

## 🐞 Issues and Contributions

If you run into a bug or have a feature request, please open an [issue](https://github.com/realdestroyer/org-vscode/issues).

Pull requests welcome!

---

## 👨‍💻 Author

* Maintained by [@realDestroyer](https://github.com/realDestroyer)
* Originally forked from a legacy project by Bobby Boyd — now significantly overhauled with countless new features created from scratch.

---

## 📄 License

MIT License — see [LICENSE](https://github.com/realdestroyer/org-vscode/blob/master/LICENSE) for full details.
