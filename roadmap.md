# Roadmap

Live version: 1.6.9

These are the features that I have either already implemented, or plan to in the near future.

## Features

| Feature Name              | Description                                                                                | Progress    | Version  | Author        |
| ------------------------- | ------------------------------------------------------------------------------------------ | ----------- | -------- | ------------- |
| TODO Notifications        | Notify users of status outside VSCode (email, sms, etc.)                                   | Not Started |          | realDestroyer |
| Make Titles Unique        | Don't allow duplicate titles                                                               | Not Started |          | realDestroyer |
| Calendar Tag Filtering    | Filter calendar tasks by tag                                                              | Not Started |          | realDestroyer |
| Hide Tags in Calendar     | Display only task content in calendar view (remove visible tag syntax from entry)        | Not Started |          | realDestroyer |
| Calendar Right-Click Menu | Right-click task to create, duplicate, or delete in calendar                              | Not Started |          | realDestroyer |
| Calendar Filtering        | Filter tasks by status, date range, or deadline                                           | Not Started |          | realDestroyer |
| Insert Deadline Support   | Add deadline insertion command (like scheduled)                                           | Not Started |          | realDestroyer |
| Bulleted Lists            | Make an ordered or unordered list                                                          | In Progress |          | realDestroyer |
| TODO Tracking             | Show TODO completion on the up-most level                                                  | In Progress |          | realDestroyer |
| Unicode Overhaul + Message Popup | Updated all status cycling + file syncing for ⊙ ⊘ ⊜ ⊖ ⊗; Ctrl+Alt+M message popup added    | DONE | v1.6.9   | realDestroyer |
| Bug Fixes                   | See CHANGELOG.md for full details                                                          | DONE | v1.6.8   | realDestroyer |
| Smart Tag Insertion         | Adds new tags inline and to #+TAGS header if missing                                       | DONE | v1.6.7   | realDestroyer |
| Comma-safe Message Parsing  | Escapes commas in message.text so complex task strings update correctly                    | DONE | v1.6.6   | realDestroyer |
| Bug Fixes                   | See CHANGELOG.md for full details                                                          | DONE | v1.6.5   | realDestroyer |
| Bug Fixes                   | See CHANGELOG.md for full details                                                          | DONE | v1.6.4   | realDestroyer |
| Agenda View Timestamp Format | Agenda View now adds long-form COMPLETED timestamps when toggling DONE                     | DONE | v1.6.3   | realDestroyer |
| Bug Fixes                   | See CHANGELOG.md for full details                                                          | DONE | v1.6.2   | realDestroyer |
| Export Active Tasks         | Export all active (non-DONE) tasks to CurrentTasks.org with Ctrl + Shift + E               | DONE | v1.6.1   | realDestroyer |
| Expandable Agenda Children| Collapsible child lines for indented task content in Agenda View                          | DONE | v1.5.2 | realDestroyer |
| Export Current Tasks      | Export all non-DONE tasks to CurrentTasks.org, including child lines, and enable syncing with source files via keyword toggles | DONE | v1.5.1 | realDestroyer |
| Tables                    | Insert Tables into doc                                                                     | DONE        | v1.5.0   |               |
| Tagged Agenda View        | View a filtered list of tasks by tag (AND/OR modes supported)                             | DONE        | v1.4.0   | realDestroyer |
| Tagged Task Support       | Add inline tag support using `: [+TAG:tag1,tag2] -` syntax                                 | DONE        | v1.4.0   | realDestroyer |
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