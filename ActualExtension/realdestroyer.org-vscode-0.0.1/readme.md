# Org-vscode


![Version](https://img.shields.io/badge/version-v0.1.4-blue.svg)

This is a work in progress extension that will, in the end, try to emulate [Emacs Org-Mode](https://orgmode.org/) as much as possible.

> Quickly create todo lists, take notes, plan projects and organize your thoughts. Check out the full demo below.

## Features

Introducing Agenda View! Schedule your tasks with `ctrl+alt+s`, run the `Org-vscode: Agenda View` command and see all of your scheduled tasks in all of your VS-Org files, in one clean interface, organized by date. Watch the Agenda View Demo: </br>

<img src="https://github.com/robaboyd/vs-org/blob/master/Images/openAgenda.gif?raw=true" width="700" height="400" />

Check out the HOW-TO for all of the available featuers:</br>
[How-To](https://github.com/robaboyd/vs-org/blob/master/howto.md)

Check out the recent changes in the [Change Log](https://github.com/robaboyd/vs-org/blob/master/CHANGELOG.md)

For upcoming features view the [Roadmap](https://github.com/robaboyd/vs-org/blob/master/roadmap.md)

FULL DEMO:  
<img src="https://github.com/robaboyd/vs-org/blob/master/Images/fullDemo.gif?raw=true" width="700" height="400" />

## Install

To install Vs-Org, open Visual Studio Code, launch VS Code quick open (Ctrl + p or Cmd + p (mac)) and paste this `ext install BobbyBoyd.vs-org`

## Requirements

Make sure you save your files with the .vsorg extension.

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
| `Ctrl + Alt + D`     | Insert a visual separator                   |
| `Ctrl + Shift + C`   | Open the Calendar View                      |
| `Ctrl + Shift + G`   | Open the Tagged Agenda View                 |
| `Alt + Shift + T`    | Insert an Org Table via Webview             |

## Snippets

| Snippet   | Decription         | Output                  |
| --------- | ------------------ | ----------------------- |
| `/header` | insert page header | #+ TITLE:</br> #+ TAGS: |
|           |                    |                         |

## Known Issues and Bugs

Submit an [Issue](https://github.com/robaboyd/vs-org/issues) if there is a bug you would like to report.

## Release Notes

## [0.1.4] 08-09-24

`Fixed`

- Fixed scheduling bug

`Changed`

- Changed the keybinds for folding to the default vscode keybinds ```Shift + Ctrl + [``` to fold and ```Shift + Ctrl + ]``` to unfold

## Upcoming Features

Check out the [RoadMap](https://github.com/robaboyd/vs-org/blob/master/roadmap.md) for upcoming features.

## Authors

- Forked from the original author: Bobby Boyd
- Current Maintainer - realDestroyer

## License

This project is under the MIT License

---
