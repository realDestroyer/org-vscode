# Org-vscode How-To

> Organize your thoughts and tasks into hierarchical lists.
>
> * Create items using `*`. The number of `*` determines the heading level.
> * Mark tasks as `TODO`, `IN_PROGRESS`, `CONTINUED`, `ABANDONED`, or `DONE`.
> * Fold lists with `Tab`.
> * Increment or decrement headings using `Alt + Left/Right`.

---

## 📁 Change the Main Directory

By default, the main directory is set to your home folder.
To change it, use the command:
**`Org-vscode: Change Org-vscode Directory`**

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/changeDir.gif?raw=true" width="700" height="400" />

---

## 📝 Create a New `.org` File

Create a new file inside your main directory using:
**`Org-vscode: Create new .org file`**

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/newFile.gif?raw=true" width="700" height="400" />

---

## 🔖 Create a Header

Use the `/header` snippet to quickly generate a structured header.

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/headerSnippet.gif?raw=true" width="700" height="400" />

## ✨ Org-vscode Snippets

Save time and reduce boilerplate with handy built-in snippets.
Just type the prefix and hit `Tab` to expand the snippet inside a `.org` file.

| Prefix       | Description                     |
| ------------ | ------------------------------- |
| `/header`    | Create a section header block   |
| `/todo`      | New TODO task (scheduled today) |
| `/checklist` | Checklist block with boxes      |
| `/meeting`   | Daily log or meeting notes      |
| `/tagged`    | Tagged task template            |
| `/table2`    | Quick 2x2 org-style table       |
| `/table3`    | Quick 3x3 org-style table       |
| `/section`   | Labeled section block           |
| `/template`  | Full task template with tags    |

### Example Expansions

#### `/todo`

```org
⊙ TODO Task description
   SCHEDULED: [04-21-2025]
```

#### `/checklist`

```org
- [ ] First item
- [ ]
- [ ]
```

#### `/meeting`

```org
* 04-21-2025 :: Weekly Sync
- Attendees:
- Notes:
- Action Items:
```

#### `/template`

```org
⊙ TODO Task Name
   SCHEDULED: [04-21-2025]
   COMPLETED: []

- Description:
- Tags: [+TAG:]

------------------------
```

Snippets make it easy to maintain formatting consistency and move quickly through repetitive structures!

---

## 📂 Open a File by Tags or Titles

You can open a file using either:

* **`Org-vscode: Open By Title`**
* **`Org-vscode: Open By Tag`**

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/openCommands.gif?raw=true" width="700" height="400" />

---

## 📅 Agenda View & Scheduling

* **Schedule an item** → Use `Ctrl + Alt + S`.
* **View all scheduled items** → Use **`Org-vscode: Agenda View`**.

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/openAgenda.gif?raw=true" width="700" height="400" />

---

## 📼 Partial Demo

* **Partial Demo**

  <img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/fullDemo.gif?raw=true" width="700" height="400" />

---

## 🔤 Unicode Headings Based on Asterisk Level

In Org-vscode, heading levels are visually enhanced with custom Unicode symbols to give structure and clarity to your task lists.

| Asterisk Level | Unicode Symbol | Description                    |
| -------------- | -------------- | ------------------------------ |
| `* `           | ⊙              | Top-level task                 |
| `** `          | ⊘              | In-progress subtask            |
| `*** `         | ⊖              | Completed or nested subtask    |
| `**** `        | ⊙ (indented)   | Nested task under ⊖            |
| `***** `       | ⊘ (indented)   | Deeper nested in-progress task |

**Note:**

* The number of asterisks (`*`) at the start of a line determines indentation and task symbol.
* Org-vscode auto-replaces keywords like `TODO` with their visual Unicode counterparts.
* You can still toggle task status by clicking the symbol in Agenda Views or manually updating it.

---

## 🔁 Cycle Task Statuses

Org-vscode supports five task states, each represented with a unique Unicode symbol:

| Status Keyword | Symbol | Description               |
| -------------- | ------ | ------------------------- |
| `TODO`         | ⊙      | New task to be done       |
| `IN_PROGRESS`  | ⊘      | Currently being worked on |
| `CONTINUED`    | ⊜      | Paused or rolling forward |
| `DONE`         | ⊖      | Completed                 |
| `ABANDONED`    | ⊗      | No longer relevant        |

### 💡 Ways to Change Task Status

#### 🔘 In Agenda View or Tagged Agenda View

* Click on the current status (e.g. `TODO`) to cycle through the options.
* The task line is automatically updated in the source file.
* If switching **to `DONE`**, a `COMPLETED:` timestamp is inserted on the next line.
* If switching **from `DONE` to any other state**, the `COMPLETED:` line is removed.

#### ✏️ In the `.org` file directly

You can manually change task keywords:

```org
* ⊙ TODO : [+TAG:PROJECT] - Finish feature documentation
```

Or remove/change the keyword symbol, and the extension will update it accordingly on save.

---

## 🌿 Inline Tags & Tag Filtering

Org-vscode supports **inline tagging** to categorize tasks and enable advanced filtering in the UI.

### 📝 Add Tags to a Task

To tag a task, use the special `[+TAG:...]` syntax directly after the task keyword:

```org
* ⊙ TODO : [+TAG:WORK,URGENT] - Prepare project proposal
```

* Tags are comma-separated
* Placement must be immediately after the status keyword
* No spaces allowed in tag names

---

### 🌿 Add Tags to an Existing Task

Use the command:
**`Org-vscode: Add Tag to Task`**
🔑 **Keybinding:** `Ctrl + Shift + T`

This command prompts you to enter one or more tags (comma-separated), and automatically inserts them into the currently selected task.

---

### 📂 Open Files by Tag

Use the command:
**`Org-vscode: Open By Tag`**
🔑 *(No keybinding — must be run via Command Palette)*

You'll be prompted to pick a tag, and then a file containing that tag. This helps you jump to relevant `.org` files based on tag metadata.

---

### 🧠 Tagged Agenda View

Use the command:
**`Org-vscode: Tagged Agenda View`**
🔑 **Keybinding:** `Ctrl + Shift + G`

This lets you filter tasks across all files by tag(s). Two modes are supported:

* `any:tag1,tag2` → **OR logic** (match *any* tag)
* `all:tag1,tag2` → **AND logic** (must match *all* tags)

#### 📁 Features:

* Groups results by file
* Shows each task with its current status, schedule date, and tags
* Clickable filenames open the source
* Clickable status cycles through keywords
* Use `[Expand All]` / `[Collapse All]` buttons to show/hide groups

#### 🔍 Example:

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

---
## 📆 Calendar View

The **Calendar View** provides a powerful visual way to see your scheduled Org tasks in a monthly or weekly layout — with interactive support for drag-to-reschedule, tag filtering, and click-to-open behavior.

### 🧭 Open the Calendar View

Use the command:
**`Org-vscode: Open Calendar View`**
🔑 **Keybinding:** `Ctrl + Shift + C`

---

### ✨ Features:

#### ✅ Displays Scheduled Tasks

* Tasks with `SCHEDULED: [MM-DD-YYYY]` are shown as calendar events.
* Unicode and Org keyword support: ⊙ TODO, ⊘ IN\_PROGRESS, ⊖ DONE, etc.
* Automatically parses `.org` files in your main directory (excluding `CurrentTasks.org`).

#### 🖱 Click to Open Task

* Clicking an event will open the source `.org` file in your editor.

#### 🔀 Drag to Reschedule

* Drag and drop events to a new date on the calendar.
* The `.org` file will be automatically updated with the new `SCHEDULED:` date.

#### 🏷 Tag Bubbles for Filtering

* If a task contains a `[+TAG:...]` inline tag, those tags appear as clickable colored bubbles.
* Click a tag to filter tasks shown on the calendar.
* Use `Ctrl + Click` to multi-select tags.

#### 🎨 Custom Color Coding

* Each tag is assigned a unique background color using HSL values.
* This makes it easy to visually distinguish different categories of tasks.

---

### 💡 Bonus Behavior

* Supports FullCalendar views: `Month`, `Week`, `Day`.
* Updates automatically if you reschedule or change a task keyword.

Use this view to stay on top of deadlines and visually manage your priorities!
