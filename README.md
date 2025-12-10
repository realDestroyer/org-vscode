# Org-vscode

![Version](https://img.shields.io/badge/version-v1.99.3-blue.svg)

> A fast, keyboard-driven Org Mode–style task manager built for Visual Studio Code.
> Inspired by Emacs Org Mode

---

## 🚀 What is Org-vscode?

Organize your thoughts, tasks, projects, and notes — all inside VSCode — using a minimal Org file format powered by Unicode symbols and intuitive keyboard controls.

Whether you're an Emacs power user or just want a highly structured task system, Org-vscode is built to help you:

* Stay focused
* Schedule your work
* Track task progress
* Visually plan via calendar and agenda views
* Tag tasks/projects
* Search/open files based on tag or title
* Export current active tasks for quick review
* Quickly build tables, checklists, and templates
* Work entirely from the keyboard

---

## 🧩 Core Features

**Unicode Task States**  
`⊙` TODO, `⊘` IN\_PROGRESS, `⊜` CONTINUED, `⊖` DONE, `⊗` ABANDONED

**Agenda View**  
See all scheduled tasks from all `.org` files in one clean, date-grouped panel. Fully clickable + status toggleable.

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

**Built-In Snippets**  
Use `/todo`, `/template`, `/meeting`, `/checklist`, and more to insert pre-styled blocks.

**Year-in-Review Suite**  
Pick any yearly Org file and instantly produce JSON/CSV summaries, polished Markdown + HTML executive reports, and an interactive dashboard that highlights tag heatmaps, monthly throughput, and notable wins. Commands live in the palette as `Org Mode: Export Yearly Summary`, `Org Mode: Generate Executive Report`, and `Org Mode: Open Year-In-Review Dashboard`.

---

## Learn More

Full How-To Guide (with examples, images, and keyboard shortcuts):
[View the Org-vscode How-To →](https://github.com/realdestroyer/org-vscode/blob/master/howto.md)

See recent changes in the [CHANGELOG](https://github.com/realdestroyer/org-vscode/blob/master/CHANGELOG.md)
See what’s coming next on the [ROADMAP](https://github.com/realdestroyer/org-vscode/blob/master/roadmap.md)

---

## 📊 Year-in-Review Suite

1. Run `Org Mode: Open Year-In-Review Dashboard` (or export-only commands) and choose the Org source file for the year.
2. The extension parses every day/task once, then emits:
	- `year-summary.json` and `year-summary.csv`
	- `year-executive-report.md` and `.html`
	- A dashboard webview with timelines, tag heatmaps, filters, and quick links back to source lines.
3. Use the action buttons inside the dashboard to open artifacts, reveal the report folder, or jump straight to the original task lines inside VS Code.

All artifacts land in `.vscode-orgmode/reports/<year>` next to your source file, making it easy to archive them with the rest of your planning docs.

### 📝 Recommended Org File Structure for Year-in-Review

For best results, organize your yearly journal like this:

```org
#+TITLE: 2025 Work Journal
#+TAGS: PROJECT_A, PROJECT_B, MEETING, ADMIN
-------------------------

⊘ [01-02-2025 Thu] ---------------------------------------------------------------
    ⊖ DONE : [+TAG:PROJECT_A] - Completed the quarterly report
    ⊖ DONE : Team standup
    ⊜ CONTINUED : [+TAG:PROJECT_B] - Database migration                              SCHEDULED: [01-03-2025]

⊘ [01-03-2025 Fri] ---------------------------------------------------------------
    ⊖ DONE : [+TAG:PROJECT_B] - Database migration
      COMPLETED:[3rd January 2025, 4:15:22 pm]
    ⊙ TODO : [+TAG:ADMIN] - Submit expense report                                    SCHEDULED: [01-06-2025]
```

**Key elements the parser looks for:**

| Element | Format | Purpose |
|---------|--------|---------|
| Day heading | `⊘ [MM-DD-YYYY Day] ---` | Groups tasks by calendar day |
| Task status | `⊙ TODO`, `⊘ IN_PROGRESS`, `⊜ CONTINUED`, `⊖ DONE`, `⊗ ABANDONED` | Tracked in stats & heatmap |
| Inline tags | `[+TAG:NAME]` or `[+TAG:A,B]` | Powers tag heatmap & filters |
| Schedule | `SCHEDULED: [MM-DD-YYYY]` | Shown in Raw Tasks table |
| Completion | `COMPLETED:[...]` | Auto-inserted when toggling to DONE |

**Tips:**
- Use the `/dayheading` snippet (coming soon) or copy the separator line pattern to stay consistent.
- Keep one `.org` file per year for cleaner dashboards.
- Tags declared in `#+TAGS:` at the top aren't required but help with other Org-vscode features like "Open By Tag."

---

## 🔑 Keyboard Shortcuts

| Shortcut           | Description                                            |     |
| ------------------ | ------------------------------------------------------ | --- |
| `Ctrl + →`         | Cycle TODO keyword forward                             |     |
| `Ctrl + ←`         | Cycle TODO keyword backward                            |     |
| `Shift + Alt + ↑`  | Move task block up                                     |     |
| `Shift + Alt + ↓`  | Move task block down                                   |     |
| `Alt + →`          | Increase heading level                                 |     |
| `Alt + ←`          | Decrease heading level                                 |     |
| `Ctrl + Shift + [` | Fold section                                           |     |
| `Ctrl + Shift + ]` | Unfold section                                         |     |
| `Ctrl + Alt + S`   | Schedule a task                                        |     |
| `Alt + Shift + →`  | Reschedule task forward                                |     |
| `Alt + Shift + ←`  | Reschedule task backward                               |     |
| `Alt + Shift + A`  | Align all scheduled timestamps                         |     |
| `Ctrl + Shift + T` | Insert date stamp or add tag to current task           |     |
| `Ctrl + Right`     | Increment inline date                                  |     |
| `Ctrl + Left`      | Decrement inline date                                  |     |
| `Ctrl + Shift + G` | Open the Tagged Agenda View                            |     |
| `Ctrl + Shift + C` | Open the Calendar View                                 |     |
| `Ctrl + Shift + E` | Export all active (non-DONE) tasks to CurrentTasks.org |     |
| `Ctrl + Alt + D`   | Insert visual separator line                           |     |
| `Alt + Shift + T`  | Open visual table builder                              |     |
| `Ctrl + Alt + M`   | Show popup message (GitHub link)                       | --- |

Additional Year-in-Review commands are palette-only:

- `Org Mode: Export Yearly Summary` – saves JSON + CSV.
- `Org Mode: Generate Executive Report` – saves Markdown + HTML.
- `Org Mode: Open Year-In-Review Dashboard` – opens the visualization webview and regenerates every artifact.

## 📦 Install

### Option 1: Marketplace Install

Search for `org-vscode` in the Extensions Marketplace inside VSCode.

### Option 2: Manual Install

Download the latest `.vsix` from [Releases](https://github.com/realDestroyer/org-vscode/releases)
Then: Extensions Panel → More Actions (⋯) → *Install from VSIX...*

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/install-vsix.png?raw=true" width="700" height="400" />

---

## ⚙️ Configuration Highlights

- `Org-vscode.adjustHeadingIndentation` (default `true`): When enabled, `Alt+Left/Right` both rotate the Unicode task symbol *and* shift indentation by two spaces so hierarchy is obvious. Set it to `false` if you want the symbols to change without moving the outline depth.

---

## 🎬 Demo

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/fullDemo.gif?raw=true" width="700" height="400" />

---

## Snippets Cheat Sheet

| Snippet      | Description               |
| ------------ | ------------------------- |
| `/header`    | Insert header block       |
| `/todo`      | New scheduled TODO        |
| `/tagged`    | TODO with tags            |
| `/meeting`   | Meeting notes structure   |
| `/checklist` | Create checklist block    |
| `/template`  | Full task block w/ fields |
| `/table2`    | 2x2 Org table             |
| `/table3`    | 3x3 Org table             |

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
