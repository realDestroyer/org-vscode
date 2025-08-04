"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const moment = require("moment");
const taskKeywordManager = require("../taskKeywordManager");
const path = require("path");

module.exports = function () {
  vscode.commands.executeCommand("workbench.action.files.save").then(() => {
    let config = vscode.workspace.getConfiguration("org");
    let folderPath = config.get("folderPath");
    let dateFormat = config.get("dateFormat");
    let folder;
    let taskText;
    let taskKeywordMatch = "";
    let getDateFromTaskText;
    let convertedDateArray = [];
    let unsortedObject = {};
    let sortedObject = {};
    let itemInSortedObject = "";

    readFiles();

    // Reads all .org files and builds agenda view HTML blocks grouped by scheduled date
    function readFiles() {
      fs.readdir(setMainDir(), (err, items) => {
        for (let i = 0; i < items.length; i++) {
          if (items[i].includes(".org")) {
            if (items[i] === "CurrentTasks.org") continue; // Skip export file

            // Read the contents of the .org file
            let fileText;
            if (os.platform() === "darwin" || os.platform() === "linux") {
              fileText = fs.readFileSync(setMainDir() + "/" + items[i]).toString().split(/\r?\n/);
            } else {
              fileText = fs.readFileSync(setMainDir() + "\\" + items[i]).toString().split(/\r?\n/);
            }

            // Iterate through lines to find scheduled, non-DONE tasks
            for (let j = 0; j < fileText.length; j++) {
              const element = fileText[j];
              if (element.includes("SCHEDULED") && !element.includes("DONE")) {

                // Capture indented child lines that belong to the current task
                const baseIndent = element.match(/^\s*/)?.[0] || "";
                const children = [];
                for (let k = j + 1; k < fileText.length; k++) {
                  const nextLine = fileText[k];
                  const nextIndent = nextLine.match(/^\s*/)?.[0] || "";
                  if (nextIndent.length > baseIndent.length) {
                    children.push(nextLine);
                  } else {
                    break;
                  }
                }

                // Extract core task text and scheduled date
                const taskTextMatch = element.trim().match(/.*(?=.*SCHEDULED)/g);
                getDateFromTaskText = element.match(/SCHEDULED:\s*\[(.*?)\]/);

                if (taskTextMatch && getDateFromTaskText) {
                  // Match the task keyword (TODO, IN_PROGRESS, etc.)
                  taskKeywordMatch = element.match(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/);

                  // Clean up task line: remove symbols, keyword, tags
                  taskText = taskTextMatch[0]
                    .replace(/[⊙⊖⊘⊜⊗]/g, "")
                    .replace(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/, "")
                    .replace(/: \[\+TAG:.*?\] -/, "")
                    .trim();

                  // Format the task's scheduled date for grouping and display
                  let formattedDate = moment(getDateFromTaskText[1], dateFormat).format("MM-DD-YYYY");
                  let nameOfDay = moment(formattedDate, "MM-DD-YYYY").format("dddd");
                  let cleanDate = `[${formattedDate}]`;

                  // Create collapsible child block (if child lines exist)
                  let childrenBlock = children.length > 0
                    ? `<details class=\"children-block\"><summary>Show Details</summary><pre>${children.join("\n")}</pre></details>`
                    : "";

                  // Build HTML task entry
                  let renderedTask = "";
                  if (taskKeywordMatch !== null) {
                    renderedTask =
                      '<span class="filename" data-file="' + items[i] + '">' + items[i] + ":</span> " +
                      '<span class="' + taskKeywordMatch[0].toLowerCase() + '" data-filename="' + items[i] + '" data-text="' + taskText + '" data-date="' + cleanDate + '">' + taskKeywordMatch[0] + '</span>' +
                      '<span class="taskText">' + taskText + "</span>" +
                      '<span class="scheduled">SCHEDULED</span>';
                  } else {
                    renderedTask =
                      '<span class="filename" data-file="' + items[i] + '">' + items[i] + ":</span> " +
                      '<span class="taskText">' + taskText + "</span>" +
                      '<span class="scheduled">SCHEDULED</span>';
                  }

                  // Clear the current date array and group task appropriately by date
                  convertedDateArray = [];

                  // If task is today or future
                  if (moment(formattedDate, "MM-DD-YYYY") >= moment(new Date(), "MM-DD-YYYY")) {
                    convertedDateArray.push({
                      date: `<div class=\"heading${nameOfDay} ${cleanDate}\"><h4 class=\"${cleanDate}\">${cleanDate}, ${nameOfDay.toUpperCase()}</h4></div>`,
                      text: `<div class=\"panel ${cleanDate}\">${renderedTask}${childrenBlock}</div>`
                    });
                  } else {
                    // If task is overdue
                    let today = moment().format("MM-DD-YYYY");
                    let overdue = moment().format("dddd");

                    if (moment(formattedDate, "MM-DD-YYYY") < moment(today, "MM-DD-YYYY")) {
                      convertedDateArray.push({
                        date: `<div class=\"heading${overdue} [${today}]\"><h4 class=\"[${today}]\">[${today}], ${overdue.toUpperCase()}</h4></div>`,
                        text: `<div class=\"panel [${today}]\">${renderedTask}<span class=\"late\">LATE: ${moment(getDateFromTaskText[1], dateFormat).format("Do MMMM YYYY")}</span>${childrenBlock}</div>`
                      });
                    }
                  }

                  // Add each task block to unsorted object under its date
                  convertedDateArray.forEach(element => {
                    if (!unsortedObject[element.date]) {
                      unsortedObject[element.date] = "  " + element.text;
                    } else {
                      unsortedObject[element.date] += "  " + element.text;
                    }
                  });

                  // Skip past children for outer loop
                  j += children.length;
                }
              }
            }

            // Sort agenda items by date and store in sortedObject for ordered rendering
            Object.keys(unsortedObject)
              .sort((a, b) => {
                let dateA = moment(a.match(/\[(.*)\]/)[1], "MM-DD-YYYY").toDate();
                let dateB = moment(b.match(/\[(.*)\]/)[1], "MM-DD-YYYY").toDate();
                return dateA - dateB;
              })
              .forEach(key => {
                sortedObject[key] = unsortedObject[key];
              });
          }
        }

        // Build final webview string from sorted agenda entries
        Object.keys(sortedObject).forEach(property => {
          itemInSortedObject += property + sortedObject[property] + "</br>";
        });

        createWebview();
      });
    }

    function setMainDir() {
      let config = vscode.workspace.getConfiguration("Org-vscode");
      let folderPath = config.get("folderPath");
      if (!folderPath || folderPath.trim() === "") {
        vscode.window.showErrorMessage("No org directory set. Please configure 'Org-vscode.folderPath' in settings.");
        return null;
      }
      return folderPath;
    }

    function createWebview() {
      let reload = false;
      let fullAgendaView = vscode.window.createWebviewPanel("fullAgenda", "Full Agenda View", vscode.ViewColumn.Beside, { enableScripts: true });
      fullAgendaView.webview.html = getWebviewContent(sortedObject);

      vscode.workspace.onDidSaveTextDocument(() => {
        reload = true;
        fullAgendaView.dispose();
      });

      fullAgendaView.onDidDispose(() => {
        if (reload) vscode.commands.executeCommand("extension.viewAgenda");
      });

      fullAgendaView.webview.onDidReceiveMessage(message => {
        if (message.command === "open") {
          let fullPath = path.join(setMainDir(), message.text);
          vscode.workspace.openTextDocument(vscode.Uri.file(fullPath)).then(doc => {
            vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false);
          });
        } else if (message.command === "changeStatus") {
          let [newStatus, fileName, taskText, date, additionalFlag] = message.text.split(",");
          let filePath = path.join(setMainDir(), fileName);
          let fileContents = fs.readFileSync(filePath, "utf-8");
          let fileLines = fileContents.split(/\r?\n/);

          for (let i = 0; i < fileLines.length; i++) {
            if (fileLines[i].includes(taskText) && fileLines[i].includes(date)) {
              let currentStatus = fileLines[i].match(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/);
              if (currentStatus) {
                let indent = fileLines[i].match(/^\s*/)?.[0] || "";
                let cleaned = taskKeywordManager.cleanTaskText(fileLines[i]);
                fileLines[i] = taskKeywordManager.buildTaskLine(indent, newStatus, cleaned);
                if (newStatus === "DONE") {
                  fileLines.splice(i + 1, 0, taskKeywordManager.buildCompletedStamp(indent));
                }
                if (currentStatus[0] === "DONE" && additionalFlag === "REMOVE_COMPLETED") {
                  if (fileLines[i + 1] && fileLines[i + 1].trim().startsWith("COMPLETED:")) {
                    fileLines.splice(i + 1, 1);
                  }
                }
                fs.writeFileSync(filePath, fileLines.join("\n"), "utf-8");
                vscode.window.showInformationMessage(`Updated: ${taskText} -> ${newStatus}`);
              }
              break;
            }
          }
        }
      });
    }
        function getWebviewContent(task) {
            return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Cat Coding</title>
            <link href="https://fonts.googleapis.com/css?family=Roboto+Mono:400,700|Roboto:400,700" rel="stylesheet">
        </head>
        <style>
        body{
          font-family: 'Roboto', sans-serif;
        }
        .headingSunday {
          background-color: #2f6999;
          color: #ffffff;
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;          
        }
        .headingMonday {
          background-color: #2f996e;
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;
          color: #ffffff;
        }
        .headingTuesday {
          background-color: #802f99;

          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;
          color: #ffffff;
        }
        .headingWednesday {
          background-color: #992f2f;
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;
          color: #ffffff;
        }
        .headingThursday {
          background-color: #992f67;
        
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;
          color: #ffffff;
        }
        .headingFriday {
          background-color: #44992f;
          color: #ffffff;
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;

        }
        .headingSaturday {
          background-color: #3c2e96;
          color: #ffffff;
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;
        }
        .active, .accordion:hover {
            background-color: #ccc; 
        }
        .panel {
          padding-right: 10px;
          padding-bottom: 10px;    
          padding-bottom: 10px;
          background-color: white;
          overflow: hidden;
          color: #000000;
          border-bottom: 1px solid black;
          box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
          display: none;
        }
        .todo{ 
          color: #d12323;
          padding-left: 10px;
          font-weight: 700;
          float: left;
          padding-top: 13px;
          padding-bottom: -10px;
          height: 67%;
          transition: all .5s ease;
          cursor: pointer;
        }
        .done{
        color: #4286f4;
        padding-left: 10px;
        font-weight: 700;
        float: left;
        padding-top: 13px;
        padding-bottom: -10px;
        height: 67%;
        transition: all .5s ease;
        cursor: pointer;
        }
        .in_progress{ 
          color:rgb(4, 255, 0);
          padding-left: 10px;
          font-weight: 700;
          float: left;
          padding-top: 13px;
          padding-bottom: -10px;
          height: 67%;
          transition: all .5s ease;
          cursor: pointer;
        }
        .continued{
        color:rgb(2, 202, 242);
        padding-left: 10px;
        font-weight: 700;
        float: left;
        padding-top: 13px;
        padding-bottom: -10px;
        height: 67%;
        transition: all .5s ease;
        cursor: pointer;
        }
        .abandoned{
        color:rgb(162, 2, 255);
        padding-left: 10px;
        font-weight: 700;
        float: left;
        padding-top: 13px;
        padding-bottom: -10px;
        height: 67%;
        transition: all .5s ease;
        cursor: pointer;
        }

        .filename{
          font-size: 15px;
          font-weight: 700;
          float: left;
          margin-left: 10px;
          margin-top: 10px;
          cursor: pointer;
        }

        .filename:hover{
          color: #095fea;
        }
        .scheduled{
          background-color: #76E6E6;
          padding-left: 10px;
          padding-right: 10px;
          padding-top: 5px;
          color: #5d5d5d;
          font-weight: 700;
          border-radius: 27px;
          font-size: 9px;
          /* margin-left: auto; */
          height: 15px;
          float: right;
          margin-left: 10px;
          margin-top: 10px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
        }

        .textDiv{
          width: 100%;
          margin: 0;
          height: 40px;
        }

        .taskText{
          font-size: 15px;
          float: left;
          margin-left: 10px;
          margin-top: 10px;
          width: 50%;
          font-family: 'Roboto Mono', sans-serif;
          font-weight: 400;
        }
        .late{
          background-color: #DF9930;

          padding-left: 10px;
          padding-right: 10px;
          padding-top: 5px;
          color: #ffffff;
          font-weight: 700;
          border-radius: 27px;
          font-size: 9px;
          /* margin-left: auto; */
          height: 15px;
          float: right;
          margin-left: 10px;
          margin-top: 10px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
        }
       .children-block {
            margin-top: 6px;
            font-family: monospace;
            background-color: #f9f9f9;
            padding: 8px;
            border-radius: 6px;
            white-space: pre-wrap;
        }
        .children-block summary {
            cursor: pointer;
            font-weight: bold;
            color: #444;
        }
        .children-block pre {
            margin: 6px 0 0 0;
            font-size: 13px;
            color: #000;
        }
        </style>
        <body>

        <h1>Agenda View</h1>
        <div id="display-agenda">
        ${itemInSortedObject}
        </div>      
        <script>
        const vscode = acquireVsCodeApi();

        // Load moment via CDN for formatting
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js";
        script.onload = () => {
          document.addEventListener('click', function(event) {
            let class0 = event.srcElement.classList[0];
            let class1 = event.srcElement.classList[1];
            let panels = document.getElementsByClassName('panel');

            // Show or hide panels
            if (!event.srcElement.classList.contains('panel')) {
              for (let i = 0; i < panels.length; i++) {
                if (panels[i].classList.contains(class0) || panels[i].classList.contains(class1)) {
                  panels[i].style.display = panels[i].style.display === 'block' ? 'none' : 'block';
                }
              }
            }

            // Send filename to open file
            if (event.srcElement.classList.contains('filename')) {
              vscode.postMessage({
                command: 'open',
                text: event.target.innerText.replace(':', "")
              });
            }

            // Cycle through statuses while maintaining proper placement and styling
            const statuses = ["TODO", "IN_PROGRESS", "CONTINUED", "DONE", "ABANDONED"];
            let currentStatus = event.target.innerText.trim();
            let currentIndex = statuses.indexOf(currentStatus);

            if (currentIndex !== -1) {
              const symbols = {
                TODO: '⊙ ',
                IN_PROGRESS: '⊘ ',
                CONTINUED: '⊜ ',
                DONE: '⊖ ',
                ABANDONED: '⊗ '
              };
              let nextStatus = statuses[(currentIndex + 1) % statuses.length];
              event.target.innerText = nextStatus;

              event.srcElement.classList.remove(currentStatus.toLowerCase());
              event.srcElement.classList.add(nextStatus.toLowerCase());

              // Ensure proper styling by keeping the class structure consistent
              event.srcElement.classList.remove("todo", "in_progress", "continued", "done", "abandoned");
              event.srcElement.classList.add(nextStatus.toLowerCase());

              let messageText = nextStatus + "," + event.target.dataset.filename + "," + event.target.dataset.text + "," + event.target.dataset.date;

              if (nextStatus === "DONE") {
                let completedDate = moment();
                let formattedDate = completedDate.format("Do MMMM YYYY, h:mm:ss a"); // e.g., 23rd April 2025, 7:36:12 am
                messageText += ",COMPLETED:[" + formattedDate + "]";
              }

              if (currentStatus === "DONE") {
                messageText += ",REMOVE_COMPLETED";
              }

              vscode.postMessage({
                command: 'changeStatus',
                text: messageText
              });
            }
          });
        };
        document.head.appendChild(script);
        </script>
        </body>
</html>`;
        }
    });
};
//# sourceMappingURL=agenda.js.map