// calendar.js - Handles Calendar View for Org Mode (with full Unicode + keyword support)

const vscode = require("vscode");   // VSCode API access
const fs = require("fs");           // File system module to read/write org files
const path = require("path");       // For cross-platform path handling
const moment = require("moment");   // Date formatting library

let calendarPanel = null; // Keeps reference to the Webview panel (singleton instance)

/**
 * Retrieves the directory path where `.org` files are stored.
 * Falls back to ~/OrgFiles if no custom path is set in settings.
 */
function setMainDir() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const folderPath = config.get("folderPath");
  return folderPath && folderPath.trim() !== "" 
    ? folderPath 
    : path.join(require("os").homedir(), "OrgFiles");
}

/**
 * If the calendar view is already open, this forces a refresh by re-sending task data.
 * This is useful after making changes (e.g. keyword updates, reschedules).
 */
function refreshCalendarView() {
  if (calendarPanel) {
    sendTasksToCalendar(calendarPanel); // Resends all task data to the Webview
  }
}
/**
 * Reads all `.org` files and extracts scheduled tasks with valid status keywords.
 * Filters out `CurrentTasks.org`, parses metadata (date, tags, file), and sends task data to the calendar webview.
 */
function sendTasksToCalendar(panel) {
  let tasks = [];
  let dirPath = setMainDir();

  fs.readdir(dirPath, (err, files) => {
    if (err) {
      vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
      return;
    }

    files.forEach(file => {
      // Ignore non-.org files and the special CurrentTasks.org export file
      if (file.endsWith(".org") && file !== "CurrentTasks.org") {
        let filePath = path.join(dirPath, file);
        let content = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);

        content.forEach(line => {
          // Must be a scheduled task with a proper status keyword and start with a task symbol
          const scheduledMatch = line.match(/\bSCHEDULED:\s*\[(\d{2}-\d{2}-\d{4})\]/);
          const keywordMatch = line.match(/\b(TODO|IN_PROGRESS|DONE|CONTINUED|ABANDONED)\b/);
          const startsWithSymbol = /^[⊙⊖⊘⊜⊗]/.test(line.trim());

          if (scheduledMatch && startsWithSymbol && keywordMatch) {
            // Extract inline tags if they exist: [+TAG:foo,bar]
            const tagMatch = line.match(/\[\+TAG:([^\]]+)\]/);
            const tags = tagMatch
              ? tagMatch[1].split(",").map(t => t.trim().toUpperCase())
              : [];

            const fullLine = line.trim();

            const cleanedText = fullLine
              .replace(/\b(TODO|IN_PROGRESS|DONE|CONTINUED|ABANDONED)\b/, '') // Remove keyword
              .replace(/:?\s*\[\+TAG:[^\]]+\]\s*-?/, '')                  // Remove inline tag structure
              .replace(/SCHEDULED:.*/, '')                                     // Strip scheduled portion
              .replace(/[⊙⊖⊘⊜⊗]/g, '')                                         // Remove the leading Unicode symbol
              .trim();

            tasks.push({
              text: cleanedText, // For display in calendar
              fullText: fullLine, // For backend matching (reschedule logic)
              date: moment(scheduledMatch[1], "MM-DD-YYYY").format("YYYY-MM-DD"),
              file: file,
              tags: tags
            });
          }
        });
      }
    });

    // Send task data to calendar webview if the panel is open
    if (panel) {
      panel.webview.postMessage({ tasks });
    }
  });
}
/**
 * Updates a specific task's scheduled date inside the specified .org file.
 * Matches based on original task text and the old scheduled date.
 */
function rescheduleTask(file, oldDate, newDate, taskText) {
  let filePath = path.join(setMainDir(), file);
  let fileContents = fs.readFileSync(filePath, "utf-8");
  let fileLines = fileContents.split(/\r?\n/);

  // Try to parse the new date using known formats (ISO or MM-DD-YYYY)
  let parsedNewDate = moment(newDate, ["YYYY-MM-DD", "MM-DD-YYYY"], true);
  if (!parsedNewDate.isValid()) {
    vscode.window.showErrorMessage(`Failed to reschedule task: Invalid date format.`);
    return;
  }

  // Format both old and new dates into standard [MM-DD-YYYY] org format
  let formattedOldDate = moment(oldDate, "YYYY-MM-DD").format("MM-DD-YYYY");
  let formattedNewDate = parsedNewDate.format("MM-DD-YYYY");

  // Build a regex pattern that matches the original scheduled date
  let scheduledRegex = new RegExp(`SCHEDULED:\\s*\\[${formattedOldDate}\\]`);

  let updated = false;

  // Step through every line and look for a match with the task text and scheduled date
  let updatedLines = fileLines.map(line => {
    const fullLine = line.trim();

    if (fullLine === taskText && scheduledRegex.test(line)) {
      updated = true;
      return line.replace(scheduledRegex, `SCHEDULED: [${formattedNewDate}]`);
    }

    return line;
  });
  if (updated) {
    // If we successfully found and updated the task, write the new content back to disk
    fs.writeFileSync(filePath, updatedLines.join("\n"), "utf-8");

    // Let the user know it succeeded and trigger a refresh of the calendar
    vscode.window.showInformationMessage(`Task rescheduled to ${formattedNewDate} in ${file}`);
    refreshCalendarView();
  } else {
    // If we couldn't find a match, notify the user
    vscode.window.showErrorMessage(`Could not find scheduled task to update.`);
  }
}


/**
 * Opens the Calendar View as a Webview panel in VSCode.
 * If already open, brings the panel into focus.
 * Sets up event listeners for messaging between the webview and extension.
 */
function openCalendarView() {
  // If the panel is already open, just reveal it (focus it)
  if (calendarPanel) {
    calendarPanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  // Create a new Webview Panel beside the editor
  calendarPanel = vscode.window.createWebviewPanel(
    "calendarView",           // Internal ID
    "Calendar View",          // Display title
    vscode.ViewColumn.Beside, // Show beside current editor
    { enableScripts: true }   // Allow scripts to run in the Webview
  );

  // Set the initial HTML content for the calendar (injected from getCalendarWebviewContent)
  calendarPanel.webview.html = getCalendarWebviewContent();

  // When the user closes the panel, release the reference so it can be recreated later
  calendarPanel.onDidDispose(() => {
    calendarPanel = null;
  });

  // Handle messages coming from the calendar webview (i.e., user interactions)
  calendarPanel.webview.onDidReceiveMessage(message => {
    if (message.command === "requestTasks") {
      // Webview is asking for fresh task data
      sendTasksToCalendar(calendarPanel);

    } else if (message.command === "openFile") {
      // Open a specific org file in the editor
      let filePath = path.join(setMainDir(), message.file);
      vscode.workspace.openTextDocument(vscode.Uri.file(filePath)).then(doc => {
        vscode.window.showTextDocument(doc);
      });

    } else if (message.command === "rescheduleTask") {
      // Webview user dragged/dropped a task to a new date
      rescheduleTask(message.file, message.oldDate, message.newDate, message.text);
    }
  });
}

/**
 * Returns the full HTML content for the Calendar View Webview panel.
 * Integrates FullCalendar, styles, and sets up message passing to/from the extension.
 */
function getCalendarWebviewContent() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Calendar View</title>
  <link href="https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.css" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #282c34; color: white; }
    #calendar { max-width: 900px; margin: auto; background: white; color: black; padding: 10px; border-radius: 8px; }
    .tag-badge {
      display: inline-block;
      padding: 5px 10px;
      font-weight: bold;
      font-size: 10px;
      color: white;
      border-radius: 20px;
      margin-right: 5px;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    }
    .tag-badge.selected {
      opacity: 1;
      border: 2px solid white;
      cursor: pointer;
    }
    .tag-badge.inactive {
      opacity: 0.3;
      filter: grayscale(100%);
      cursor: pointer;
    }
    .tag-badge:hover {
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <h1>Calendar View</h1>
  <div id="tag-bubbles" style="margin-bottom: 20px;"></div>
  <div id="calendar"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const tagColorMap = {};
    let allTasks = [];
    let activeTagFilter = [];

    function getColorForTag(tag) {
      if (tagColorMap[tag]) return tagColorMap[tag];
      const hue = Object.keys(tagColorMap).length * 47 % 360;
      const color = 'hsl(' + hue + ', 70%, 60%)';
      tagColorMap[tag] = color;
      return color;
    }

    document.addEventListener("DOMContentLoaded", function () {
      let calendarEl = document.getElementById("calendar");
      let calendar = new FullCalendar.Calendar(calendarEl, {
        initialView: "dayGridMonth",
        headerToolbar: {
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,timeGridWeek,timeGridDay"
        },
        editable: true,
        events: [],
        datesSet: function(info) {
          renderFilteredTasks(info.start, info.end);
        },
        eventClick: function (info) {
          vscode.postMessage({ command: "openFile", file: info.event.extendedProps.file });
        },
        eventDrop: function (info) {
          let newDate = moment(info.event.start).format("MM-DD-YYYY");
          vscode.postMessage({
            command: "rescheduleTask",
            file: info.event.extendedProps.file,
            oldDate: info.event.extendedProps.originalDate,
            newDate: newDate,
            text: info.event.extendedProps.fullText // <--- this must be fullText
          });
        }
      });

      calendar.render();

      window.addEventListener("message", (event) => {
        allTasks = event.data.tasks;
        renderFilteredTasks(calendar.view.activeStart, calendar.view.activeEnd);
      });

      vscode.postMessage({ command: "requestTasks" });

      function renderFilteredTasks(start, end) {
        const visibleTasks = allTasks.filter(task => {
          const taskDate = moment(task.date);
          return taskDate.isSameOrAfter(moment(start)) && taskDate.isBefore(moment(end));
        });

        const filteredByTag = activeTagFilter.length
          ? visibleTasks.filter(task => task.tags.some(tag => activeTagFilter.includes(tag)))
          : visibleTasks;

        const events = filteredByTag.map(task => {
          const color = getColorForTag((task.tags || [])[0] || "");
          return {
            title: task.text,
            start: task.date,
            file: task.file,
            originalDate: task.date,
            backgroundColor: color,
            borderColor: color,
            fullText: task.fullText,
            tags: task.tags
          };
        });

        const visibleTags = new Set();
        visibleTasks.forEach(task => task.tags.forEach(tag => visibleTags.add(tag)));

        let tagBubblesHtml = Array.from(visibleTags).map(tag => {
          const color = getColorForTag(tag);
          let className = 'tag-badge';
          if (activeTagFilter.length > 0) {
            className += activeTagFilter.includes(tag) ? ' selected' : ' inactive';
          }
          return '<span class="' + className + '" data-tag="' + tag + '" style="background-color: ' + color + '">' + tag + '</span>';
        }).join("");

        document.getElementById("tag-bubbles").innerHTML = tagBubblesHtml;

        // Reattach click handlers
        document.querySelectorAll(".tag-badge").forEach(el => {
          el.onclick = e => {
            const tag = el.dataset.tag;
            const ctrlPressed = e.ctrlKey || e.metaKey;

            if (ctrlPressed) {
              if (activeTagFilter.includes(tag)) {
                activeTagFilter = activeTagFilter.filter(t => t !== tag);
              } else {
                activeTagFilter.push(tag);
              }
            } else {
              activeTagFilter = activeTagFilter.includes(tag) ? [] : [tag];
            }

            renderFilteredTasks(start, end); // Rerender with updated filter
          };
        });
        calendar.removeAllEvents();
        calendar.addEventSource(events);
      }
    });
  </script>
</body>
</html>`;
}

module.exports = {
  openCalendarView
};