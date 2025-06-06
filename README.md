
# Org-vscode


![Version](https://img.shields.io/badge/version-v.1.99.3-blue.svg)

This is a work in progress extension that will, in the end, try to emulate [Emacs Org-Mode](https://orgmode.org/) as much as possible.

> Quickly create todo lists, take notes, plan projects and organize your thoughts. Check out the full demo below.

## Features

Create a new .org file with the built-in 'create new .org file' command: </br>
<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/Create-file-and-headings.gif?raw=true" width="700" height="400" />

Schedule your tasks with `ctrl+alt+s`, run the `Org-vscode: Agenda View` command and see all of your scheduled tasks in all of your org-vscode files, in one clean interface, organized by date. </br>

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/Schedule-task.gif?raw=true" width="700" height="400" />

Introducing Agenda View! Run the `Org-vscode: Agenda View` command and see all of your scheduled tasks in all of your org-vscode files, in one clean interface, organized by date. </br>

Watch the Agenda View Demo: </br>

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/Agenda-View.gif?raw=true" width="700" height="400" />

Check out the HOW-TO for all of the available featuers:</br>
[How-To](https://github.com/realdestroyer/org-vscode/blob/master/howto.md)

Check out the recent changes in the [Change Log](https://github.com/realdestroyer/org-vscode/blob/master/CHANGELOG.md)

For upcoming features view the [Roadmap](https://github.com/realdestroyer/org-vscode/blob/master/roadmap.md)

FULL DEMO:  
<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/fullDemo.gif?raw=true" width="700" height="400" />

## Install

To install org-vscode, open Visual Studio Code, launch VS Code quick open (Ctrl + p or Cmd + p (mac)) and paste this `ext install realdestroyer.org-vscode`

--or--<br>
Download the .vsix file located in the [Releases](https://github.com/realDestroyer/org-vscode/releases/download/beta/org-vscode-0.0.1.vsix)
Then, navigate to the extensions tab in VSCode and select "Install from VSIX"
<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/install-vsix.png?raw=true" width="700" height="400" />

## Requirements

Make sure you save your files with the .org extension.

## 🔑 Keyboard Shortcuts

| Shortcut              | Description                                 |
|----------------------|---------------------------------------------|
| `Ctrl + →`           | Cycle TODO keyword forward                  |
| `Ctrl + ←`           | Cycle TODO keyword backward                 |
| `Shift + Alt + ↑`    | Move task block up                          |
| `Shift + Alt + ↓`    | Move task block down                        |
| `Alt + →`            | Increase heading level                      |
| `Alt + ←`            | Decrease heading level                      |
| `Ctrl + Shift + [`   | Fold section                                |
| `Ctrl + Shift + ]`   | Unfold section                              |
| `Ctrl + Alt + S`     | Schedule a task                             |
| `Alt + Shift + →`    | Reschedule task forward                     |
| `Alt + Shift + ←`    | Reschedule task backward                    |
| `Alt + Shift + A`    | Align scheduled task columns                |
| `Ctrl + Shift + T`   | Insert a timestamp or add tags to task      |
| `Ctrl + Right`       | Increment date stamp                        |
| `Ctrl + Left`        | Decrement date stamp                        |
| `Ctrl + Shift + G`   | Open the Tagged Agenda View                 |
| `Ctrl + Shift + C`   | Open the Calendar View                      |
| `Ctrl + Alt + D`     | Insert a visual separator                   |
| `Alt + Shift + T`     | Insert a table                             |
| `ctrl+shift+e`          | Export all active (non-DONE) tasks to CurrentTasks.org |

## Snippets

| Snippet   | Decription         | Output                  |
| --------- | ------------------ | ----------------------- |
| `/header` | insert page header | #+ TITLE:</br> #+ TAGS: |
|           |                    |                         |

## Known Issues and Bugs

Submit an [Issue](https://github.com/realdestroyer/org-vscode/issues) if there is a bug you would like to report.

## Release Notes

## [0.1.5] 04-16-2025
`Export Current Tasks`
## New Feature: Current Tasks Export

Press `Ctrl + Shift + E` to export all non-DONE tasks (and their indented child lines) from all `.org` files into a single file: `CurrentTasks.org`. Each group of tasks is organized by its original source file for easy review.

Tasks edited inside `CurrentTasks.org` using the left/right keyword toggles will automatically sync back to the source file.

## [0.1.4] 03-20-2025

`Added Agenda View`

- Added Agenda View

`Changed`

- Changed the keybinds for agenda view from `ctrl+alt+a` to `ctrl+alt+v`

## Upcoming Features

Check out the [RoadMap](https://github.com/realdestroyer/org-vscode/blob/master/roadmap.md) for upcoming features.

## Authors
- Current Maintainer - realDestroyer

- Was initially forked from a project started by: Bobby Boyd
    - However, I have made such a significant amount of changes and the original extension is dead - so I have broken the connection to the original.
    - If you want to see what his extension looked like, you can find it here: [Bobby Boyd's Extension](https://github.com/boydvoid/vs-org)

## License

This project is under the MIT License

---
