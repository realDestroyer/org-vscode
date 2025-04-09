// calendar.js - Extracted calendar view logic from extension.js
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const moment = require("moment");

let calendarPanel = null;

function setMainDir() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const folderPath = config.get("folderPath");
  return folderPath && folderPath.trim() !== "" ? folderPath : path.join(require("os").homedir(), "OrgFiles");
}

function refreshCalendarView() {
  if (calendarPanel) {
    sendTasksToCalendar(calendarPanel);
  }
}

function sendTasksToCalendar(panel) {
  let tasks = [];
  let dirPath = setMainDir();

  fs.readdir(dirPath, (err, files) => {
    if (err) {
      vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
      return;
    }

    files.forEach(file => {
      if (file.endsWith(".org")) {
        let filePath = path.join(dirPath, file);
        let content = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);

        content.forEach(line => {
          let match = line.match(/\bSCHEDULED:\s*\[(\d{2}-\d{2}-\d{4})\]/);
          if (match) {
            tasks.push({
              text: line.replace(/SCHEDULED:.*/, "").trim(),
              date: moment(match[1], "MM-DD-YYYY").format("YYYY-MM-DD"),
              file: file
            });
          }
        });
      }
    });

    if (panel) {
      panel.webview.postMessage({ tasks });
    }
  });
}

function rescheduleTask(file, oldDate, newDate, taskText) {
  let filePath = path.join(setMainDir(), file);
  let fileContents = fs.readFileSync(filePath, "utf-8");
  let fileLines = fileContents.split(/\r?\n/);

  let parsedNewDate = moment(newDate, ["YYYY-MM-DD", "MM-DD-YYYY"], true);
  if (!parsedNewDate.isValid()) {
    vscode.window.showErrorMessage(`Failed to reschedule task: Invalid date format.`);
    return;
  }

  let formattedOldDate = moment(oldDate, "YYYY-MM-DD").format("MM-DD-YYYY");
  let formattedNewDate = parsedNewDate.format("MM-DD-YYYY");
  let scheduledRegex = new RegExp(`SCHEDULED:\\s*\\[${formattedOldDate}\\]`);

  let updated = false;
  let updatedLines = fileLines.map(line => {
    if (line.includes(taskText) && scheduledRegex.test(line)) {
      updated = true;
      return line.replace(scheduledRegex, `SCHEDULED: [${formattedNewDate}]`);
    }
    return line;
  });

  if (updated) {
    fs.writeFileSync(filePath, updatedLines.join("\n"), "utf-8");
    vscode.window.showInformationMessage(`Task rescheduled to ${formattedNewDate} in ${file}`);
    refreshCalendarView();
  } else {
    vscode.window.showErrorMessage(`Could not find scheduled task to update.`);
  }
}

function openCalendarView() {
  if (calendarPanel) {
    calendarPanel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  calendarPanel = vscode.window.createWebviewPanel(
    "calendarView",
    "Calendar View",
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  calendarPanel.webview.html = getCalendarWebviewContent();

  calendarPanel.onDidDispose(() => {
    calendarPanel = null;
  });

  calendarPanel.webview.onDidReceiveMessage(message => {
    if (message.command === "requestTasks") {
      sendTasksToCalendar(calendarPanel);
    } else if (message.command === "openFile") {
      let filePath = path.join(setMainDir(), message.file);
      vscode.workspace.openTextDocument(vscode.Uri.file(filePath)).then(doc => {
        vscode.window.showTextDocument(doc);
      });
    } else if (message.command === "rescheduleTask") {
      rescheduleTask(message.file, message.oldDate, message.newDate, message.text);
    }
  });
}

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
  </style>
</head>
<body>
  <h1>Calendar View</h1>
  <div id="calendar"></div>

  <script>
    const vscode = acquireVsCodeApi();

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
            text: info.event.title
          });
        }
      });

      calendar.render();

      window.addEventListener("message", (event) => {
        const tasks = event.data.tasks;
        let events = tasks.map(task => ({
          title: task.text,
          start: task.date,
          file: task.file,
          originalDate: task.date
        }));
        calendar.removeAllEvents();
        calendar.addEventSource(events);
      });

      vscode.postMessage({ command: "requestTasks" });
    });
  </script>
</body>
</html>`;
}

module.exports = {
  openCalendarView
};
