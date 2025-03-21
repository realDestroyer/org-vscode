# Org-vscode


![Version](https://img.shields.io/badge/version-v0.1.4-blue.svg)

This is a work in progress extension that will, in the end, try to emulate [Emacs Org-Mode](https://orgmode.org/) as much as possible.

> Quickly create todo lists, take notes, plan projects and organize your thoughts. Check out the full demo below.

## Features

Create a new .org file with the built-in 'create new .org file' command: </br>
<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/Create-file-and-headings.gif?raw=true" width="1200" height="800" />


Schedule your tasks with `ctrl+alt+s`, run the `Org-vscode: Agenda View` command and see all of your scheduled tasks in all of your org-vscode files, in one clean interface, organized by date. </br>

<img src=https://github.com/realdestroyer/org-vscode/blob/master/Images/Schedule-task.gif?raw=true" width="1200" height="800" />


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

To install org-vscode, open Visual Studio Code, launch VS Code quick open (Ctrl + p or Cmd + p (mac)) and paste this `ext install BobbyBoyd.org-vscode`

## Requirements

Make sure you save your files with the .vsorg extension.

## Keybinds

| Keys                  | Decription                         |
| --------------------- | ---------------------------------- |
| `shift+rightArrow`    | add TODO or DONE Keyword           |
| `shift+leftArrow`     | add DONE or TODO keyword           |
| `shift+alt+UpArrow`   | Move Block of code Up              |
| `shift+alt+downArrow` | Move Block of code down            |
| `alt+rightArrow`      | Increment the level of the heading |
| `alt+leftArrow`       | Decrement the level of the heading |
| `shift + ctrl + [`    | Fold                               |
| `shift + ctrl + ]`    | Unfold                             |
| `ctrl+alt+s`          | Schedule a task                    |

## Snippets

| Snippet   | Decription         | Output                  |
| --------- | ------------------ | ----------------------- |
| `/header` | insert page header | #+ TITLE:</br> #+ TAGS: |
|           |                    |                         |

## Known Issues and Bugs

Submit an [Issue](https://github.com/realdestroyer/org-vscode/issues) if there is a bug you would like to report.

## Release Notes

## [0.1.4] 08-09-24

`Fixed`

- Fixed scheduling bug

`Changed`

- Changed the keybinds for folding to the default vscode keybinds ```Shift + Ctrl + [``` to fold and ```Shift + Ctrl + ]``` to unfold

## Upcoming Features

Check out the [RoadMap](https://github.com/realdestroyer/org-vscode/blob/master/roadmap.md) for upcoming features.

## Authors

- Forked from the original author: Bobby Boyd
- Current Maintainer - realDestroyer

## License

This project is under the MIT License

---
