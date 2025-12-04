# Org-vscode How-To

> Organize your thoughts and tasks into hierarchical lists.
>
> * Create items using `*`. The number of `*` determines the heading level.
> * Mark tasks as `TODO`, `IN_PROGRESS`, `CONTINUED`, `ABANDONED`, or `DONE`.
> * Fold lists with `Tab`.
> * Increment or decrement headings using `Alt + Left/Right`.

---

## 📘 Table of Contents <a id="table-of-contents"></a>

* [📁 Change the Main Directory](#change-the-main-directory)
* [📝 Create a New .org File](#create-a-new-org-file)
* [🔖 Create a Header](#create-a-header)
* [🧩 Org-vscode Snippets](#org-vscode-snippets)
* [📂 Open a File by Tags or Titles](#open-a-file-by-tags-or-titles)
* [📅 Agenda View & Scheduling](#agenda-view--scheduling)
* [📼 Partial Demo](#partial-demo)
* [🔤 Unicode Headings](#unicode-headings-based-on-asterisk-level)
* [🔁 Cycle Task Statuses](#cycle-task-statuses)
* [🏷 Inline Tags & Tag Filtering](#inline-tags--tag-filtering)
* [🧮 Insert Org Table](#insert-org-table)
* [Align Scheduled Task Tags](#align-scheduled-tasks)
* [Tagged Agenda View](#tagged-agenda-view)
* [📆 Calendar View](#calendar-view)
* [📊 Year-In-Review Dashboard](#year-in-review-dashboard)

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
| `/table2`    | Quick 2x2 org-style table       |
| `/table3`    | Quick 3x3 org-style table       |
| `/section`   | Labeled section block           |
| `/template`  | Full task template with tags    |

### Example Expansions <a id="example-expansions"></a>

#### `/todo` <a id="todo"></a>

```org
⊙ TODO Task description
   SCHEDULED: [04-21-2025]
```

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
⊙ TODO Task Name
   SCHEDULED: [04-21-2025]
   COMPLETED: []

- Description:
- Tags: [+TAG:]

------------------------
```

Snippets make it easy to maintain formatting consistency and move quickly through repetitive structures!

---

## 📂 Open a File by Tags or Titles <a id="open-a-file-by-tags-or-titles"></a>

You can open a file using either:

* **`Org-vscode: Open By Title`**
* **`Org-vscode: Open By Tag`**

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/openCommands.gif?raw=true" width="700" height="400" />

---

## 📅 Agenda View & Scheduling <a id="agenda-view-scheduling"></a>

* **Schedule an item** → Use `Ctrl + Alt + S`.
* **View all scheduled items** → Use **`Org-vscode: Agenda View`**.

<img src="https://github.com/realdestroyer/org-vscode/blob/master/Images/openAgenda.gif?raw=true" width="700" height="400" />

---

## 📼 Partial Demo <a id="partial-demo"></a>

* **Partial Demo**

  <img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/fullDemo.gif?raw=true" width="700" height="400" />

---

## 🔤 Unicode Headings Based on Asterisk Level <a id="unicode-headings-based-on-asterisk-level"></a>

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

## 🔁 Cycle Task Statuses <a id="cycle-task-statuses"></a>

Org-vscode supports five task states, each represented with a unique Unicode symbol:

| Status Keyword | Symbol | Description               |
| -------------- | ------ | ------------------------- |
| `TODO`         | ⊙      | New task to be done       |
| `IN_PROGRESS`  | ⊘      | Currently being worked on |
| `CONTINUED`    | ⊜      | Paused or rolling forward |
| `DONE`         | ⊖      | Completed                 |
| `ABANDONED`    | ⊗      | No longer relevant        |

### 💡 Ways to Change Task Status <a id="ways-to-change-task-status"></a>

#### 🔘 In Agenda View or Tagged Agenda View <a id="in-agenda-view-or-tagged-agenda-view"></a>

* Click on the current status (e.g. `TODO`) to cycle through the options.
* The task line is automatically updated in the source file.
* If switching **to `DONE`**, a `COMPLETED:` timestamp is inserted on the next line.
* If switching **from `DONE` to any other state**, the `COMPLETED:` line is removed.

#### ✏️ In the `.org` file directly <a id="in-the-org-file-directly"></a>

You can manually change task keywords:

```org
* ⊙ TODO : [+TAG:PROJECT] - Finish feature documentation
```

Or remove/change the keyword symbol, and the extension will update it accordingly on save.

---

## 🌿 Inline Tags & Tag Filtering <a id="inline-tags-tag-filtering"></a>

Org-vscode supports **inline tagging** to categorize tasks and enable advanced filtering in the UI.

### 📝 Add Tags to a Task <a id="add-tags-to-a-task"></a>

To tag a task, use the special `[+TAG:...]` syntax directly after the task keyword:

```org
* ⊙ TODO : [+TAG:WORK,URGENT] - Prepare project proposal
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

Use this command to visually align all `SCHEDULED:` timestamps in your current `.org` file.
This improves readability by ensuring every scheduled date starts in the same column — even across differently sized task descriptions.

<img src="https://github.com/realDestroyer/org-vscode/blob/master/Images/align-schedules.gif?raw=true" width="700" height="400" />

---

### 🛠 What It Does <a id="what-it-does"></a>

* Scans the file for any line containing `SCHEDULED: [MM-DD-YYYY]`
* Determines the longest task description in the file
* Pads shorter task lines so that all timestamps align to the same column
* Preserves original indentation

---

### 📌 Example <a id="example"></a>

**Before:**

```org
⊙ TODO Review meeting notes           SCHEDULED: [06-21-2025]
⊖ DONE Email client      SCHEDULED: [06-20-2025]
⊘ IN_PROGRESS Fix bug             SCHEDULED: [06-22-2025]
```

**After Running Align:**

```org
⊙ TODO Review meeting notes           SCHEDULED: [06-21-2025]
⊖ DONE Email client                   SCHEDULED: [06-20-2025]
⊘ IN_PROGRESS Fix bug                 SCHEDULED: [06-22-2025]
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
* Shows each task with its current status, schedule date, and tags
* Clickable filenames open the source
* Clickable status cycles through keywords
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

* Tasks with `SCHEDULED: [MM-DD-YYYY]` are shown as calendar events.
* Unicode and Org keyword support: ⊙ TODO, ⊘ IN\_PROGRESS, ⊖ DONE, etc.
* Automatically parses `.org` files in your main directory (excluding `CurrentTasks.org`).

#### 🖱 Click to Open Task <a id="click-to-open-task"></a>

* Clicking an event will open the source `.org` file in your editor.

#### 🔀 Drag to Reschedule <a id="drag-to-reschedule"></a>

* Drag and drop events to a new date on the calendar.
* The `.org` file will be automatically updated with the new `SCHEDULED:` date.

#### 🏷 Tag Bubbles for Filtering <a id="tag-bubbles-for-filtering"></a>

* If a task contains a `[+TAG:...]` inline tag, those tags appear as clickable colored bubbles.
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
