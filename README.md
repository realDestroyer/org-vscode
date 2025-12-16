# Org-vscode

![Version](https://img.shields.io/badge/version-v1.10.5-blue.svg)

> A fast, keyboard-driven Org Mode–style task manager built for Visual Studio Code.
> Inspired by Emacs Org Mode

---

## 🚀 What is Org-vscode?

Organize your thoughts, tasks, projects, and notes — all inside VSCode — using a minimal Org file format with Org-compatible `*` headings (recommended) and optional decorative Unicode rendering.

Whether you're an Emacs power user or just want a highly structured task system, Org-vscode is built to help you:

* Stay focused
* Schedule your work
* Set deadlines with visual warnings
* Track task progress
* Auto-forward CONTINUED tasks to the next day
* Visually plan via calendar and agenda views
* Tag tasks/projects
* Search/open files based on tag or title
* Export current active tasks for quick review
* Quickly build tables, checklists, and templates
* **Customize syntax colors with a visual UI**
* Work entirely from the keyboard

---

## 🧩 Core Features

**Task States**  
`TODO`, `IN_PROGRESS`, `CONTINUED`, `DONE`, `ABANDONED`.

If you use `Org-vscode.headingMarkerStyle: "unicode"`, those task states are rendered as symbols:
`⊙` TODO, `⊘` IN\_PROGRESS, `⊜` CONTINUED, `⊖` DONE, `⊗` ABANDONED.

**Org-mode Compatibility (Preserve `*` Headings)**

If you edit your files in Emacs/org-mode (or want plain Org interoperability), set:

```json
"Org-vscode.headingMarkerStyle": "asterisks"
```

This keeps `* TODO ...` headings in the file (no Unicode replacement) while still allowing Org-vscode commands/views to work.

**Recommended setup (Org-compatible source + pretty UI)**

```json
"Org-vscode.headingMarkerStyle": "asterisks",
"Org-vscode.decorateUnicodeHeadings": true
```

Optional indentation controls (decorations + Alt+Left/Right indentation):

```json
"Org-vscode.decorateHeadingIndentation": true,
"Org-vscode.adjustHeadingIndentation": 2
```

**CONTINUED Auto-Forwarding**  
When you mark a task as CONTINUED, it automatically copies to the next day as TODO. Toggle away from CONTINUED and the copy is removed.

**Deadline Support**  
Add `DEADLINE: [<date>]` to tasks. Date formatting is controlled by `Org-vscode.dateFormat` (default: `MM-DD-YYYY`). Agenda View shows color-coded warnings (overdue, due today, due soon).

**Agenda View**  
See all scheduled TODO and IN\_PROGRESS tasks from all `.org` files in one clean, date-grouped panel. Fully clickable + status toggleable.

**Calendar View**  
Drag & drop tasks to reschedule. Filter by tag. Auto-syncs to file.

**Inline Tagging**  
Use `[+TAG:urgent,project]` to categorize tasks. Supports AND/OR logic filtering.

**Tagged Agenda View**  
Filter tasks by one or multiple tags, grouped by file. Click-to-edit support.

**Table Builder**  
Visually generate Org-style tables with alignment, row headers, and optional labels.

**Align Timestamps**  
Neatly formats all `SCHEDULED:` timestamps to the same column width.

**Export Active Tasks**  
Copy all non-DONE tasks to `CurrentTasks.org` for quick review or reporting.

**Year-in-Review Dashboard**  
Select a full-year Org file, export CSV/JSON summaries, render executive Markdown/HTML, and explore an interactive dashboard with timelines, tag heatmaps, and download buttons directly inside VS Code.

**Syntax Color Customizer**  
Customize your syntax highlighting colors with a beautiful webview UI. Pick colors for each task state, toggle bold/italic styles, see live previews, and save directly to your settings. No manual JSON editing required!

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/Syntax-Highlight-WebUI.png?raw=true" width="700" />

**Built-In Snippets**  
Use `/todo`, `/template`, `/meeting`, `/checklist`, and more to insert pre-styled blocks.

---

## 📊 Yearly Review Workflow

1. Run **Org Mode: Export Year Summary** to emit `year-summary.csv` + `year-summary.json` inside `.vscode-orgmode/reports/<year>`.
2. Run **Org Mode: Generate Executive Report** to produce polished Markdown/HTML briefs for leadership updates.
3. Open **Org Mode: Open Year-in-Review Dashboard** to browse timelines, tag heatmaps, and filterable task lists with quick-open links back to the source file and download buttons for each artifact.

The dashboard reuses the same parser as the exporter, so updates stay in sync and can be regenerated at any time.

---

## Learn More

Full How-To Guide (with examples, images, and keyboard shortcuts):
[View the Org-vscode How-To →](https://github.com/realdestroyer/org-vscode/blob/master/howto.md)

See recent changes in the [CHANGELOG](https://github.com/realdestroyer/org-vscode/blob/master/CHANGELOG.md)
See what’s coming next on the [ROADMAP](https://github.com/realdestroyer/org-vscode/blob/master/roadmap.md)

---

## 🔑 Keyboard Shortcuts

| Shortcut             | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `Ctrl + →`           | Cycle TODO keyword forward                             |
| `Ctrl + ←`           | Cycle TODO keyword backward                            |
| `Shift + Alt + ↑`    | Move task block up                                     |
| `Shift + Alt + ↓`    | Move task block down                                   |
| `Alt + →`            | Increase heading level                                 |
| `Alt + ←`            | Decrease heading level                                 |
| `Ctrl + Shift + [`   | Fold section                                           |
| `Ctrl + Shift + ]`   | Unfold section                                         |
| `Ctrl + Alt + S`     | Schedule a task                                        |
| `Ctrl + Alt + D`     | Add deadline to task                                   |
| `Alt + Shift + →`    | Smart date forward (day heading or SCHEDULED)          |
| `Alt + Shift + ←`    | Smart date backward (day heading or SCHEDULED)         |
| `Ctrl + Shift + →`   | Deadline date forward                                  |
| `Ctrl + Shift + ←`   | Deadline date backward                                 |
| `Alt + Shift + A`    | Align all scheduled timestamps                         |
| `Alt + Shift + S`    | Add separator line (hyphens)                           |
| `Ctrl + Shift + T`   | Add tag to current task                                |
| `Ctrl + Shift + G`   | Open the Tagged Agenda View                            |
| `Ctrl + Shift + C`   | Open the Calendar View                                 |
| `Ctrl + Shift + E`   | Export all active (non-DONE) tasks to CurrentTasks.org |
| `Ctrl + Alt + M`     | Show popup message (GitHub link)                       |

## 📦 Install

### Option 1: Marketplace Install

Search for `org-vscode` in the Extensions Marketplace inside VSCode.

### Option 2: Manual Install

Download the latest `.vsix` from [Releases](https://github.com/realDestroyer/org-vscode/releases)
Then: Extensions Panel → More Actions (⋯) → *Install from VSIX...*

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/install-vsix.png?raw=true" width="700" height="400" />

---

## 🎬 Demo

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/fullDemo.gif?raw=true" width="700" height="400" />

---

## Snippets Cheat Sheet

| Snippet      | Description                        |
| ------------ | ---------------------------------- |
| `/header`    | Insert header block                |
| `/todo`      | New scheduled TODO                 |
| `/tagged`    | TODO with tags                     |
| `/deadline`  | TODO with SCHEDULED and DEADLINE   |
| `/dl`        | Add DEADLINE line to existing task |
| `/day`       | Day heading with date & separator  |
| `/meeting`   | Meeting notes structure            |
| `/checklist` | Create checklist block             |
| `/template`  | Full task block w/ fields          |
| `/table2`    | 2x2 Org table                      |
| `/table3`    | 3x3 Org table                      |

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
