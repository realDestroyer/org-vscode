<p align="center">
	<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/org-vscode-logo.png?raw=true" alt="org-vscode" width="512" />
</p>  

![Version](https://img.shields.io/badge/version-v2.1.2-blue.svg)

> A fast, keyboard-driven Org Mode–style task manager built for Visual Studio Code.
> Inspired by Emacs Org Mode

---

## Summary

Org-vscode helps you manage tasks, notes, and projects in plain text `.org` files — with a keyboard-first workflow, clickable Agenda/Calendar views, tags, checklists, and multi-line selection editing.

For the full guide (examples + screenshots), see:

- https://github.com/realDestroyer/org-vscode/blob/master/docs/howto.md

## 🔑 Keyboard Shortcuts

Most editing shortcuts support multi-line selection: highlight multiple task lines (or use multi-cursor) and run the command to apply it to every selected line.

| Shortcut             | Description                                            |
| -------------------- | ------------------------------------------------------ |
| `Ctrl + →`           | Cycle TODO keyword forward (selection-aware)           |
| `Ctrl + ←`           | Cycle TODO keyword backward (selection-aware)          |
| `Shift + Alt + ↑`    | Move task block up                                     |
| `Shift + Alt + ↓`    | Move task block down                                   |
| `Alt + →`            | Increase heading level (selection-aware)               |
| `Alt + ←`            | Decrease heading level (selection-aware)               |
| `Ctrl + Shift + [`   | Fold section                                           |
| `Ctrl + Shift + ]`   | Unfold section                                         |
| `Ctrl + Alt + S`     | Schedule a task (selection-aware)                      |
| `Ctrl + Alt + D`     | Add deadline to task (selection-aware)                 |
| `Ctrl + Alt + X`     | Toggle checkbox item on current line                   |
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
| `Ctrl + Shift + E`   | Export all active (non-DONE) tasks to CurrentTasks.org |
| `Ctrl + Alt + M`     | Show popup message (GitHub link)                       |

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

## 🎬 Demo

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/fullDemo.gif?raw=true" width="700" height="400" />

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
