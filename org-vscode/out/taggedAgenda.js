const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const moment = require("moment");

module.exports = async function taggedAgenda() {
  const tagInput = await vscode.window.showInputBox({
    prompt: "Enter tags (comma-separated). Use 'any:' for OR logic. Ex: any:client,urgent",
    validateInput: input => input.includes(" ") ? "Tags cannot contain spaces." : null
  });

  if (!tagInput) return;

  const isOrSearch = tagInput.toLowerCase().startsWith("any:");
  const isAndSearch = tagInput.toLowerCase().startsWith("all:");

  const tagString = tagInput.replace(/^any:|^all:/i, "").trim();
  const inputTags = tagString.split(",").map(t => t.trim().toUpperCase());

  const agendaItems = [];
  const orgDir = getOrgFolder();
  const files = fs.readdirSync(orgDir).filter(file => file.endsWith(".org"));

  for (const file of files) {
    const filePath = path.join(orgDir, file);
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

    lines.forEach((line, index) => {
      const tagMatch = line.match(/\[\+TAG:(.*?)\]/);
      if (tagMatch) {
        const taskTags = tagMatch[1].split(",").map(t => t.trim().toUpperCase());

        const match = isOrSearch
          ? inputTags.some(tag => taskTags.includes(tag))
          : inputTags.every(tag => taskTags.includes(tag));

        if (match) {
          agendaItems.push({
            file,
            line,
            lineNumber: index + 1
          });
        }
      }
    });
  }

  showTaggedAgendaView(tagString, agendaItems);
};

function updateTaskStatusInFile(file, taskText, scheduledDate, newStatus, removeCompleted) {
  const orgDir = getOrgFolder();
  const filePath = path.join(orgDir, file);
  const lines = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);

  const dateTag = scheduledDate ? `SCHEDULED: [${scheduledDate}]` : null;
  console.log("🛠 Updating file:", filePath);
  console.log("🔍 Looking for task text:", taskText);
  if (dateTag) console.log("🔍 With scheduled date tag:", dateTag);

  let found = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matchesTask = line.includes(taskText);
    const matchesDate = dateTag ? line.includes(dateTag) : true;

    if (matchesTask && matchesDate) {
        console.log("✅ Found matching line:", line);

        // Swap status
        const symbols = {
          TODO: '⊙ ',
          IN_PROGRESS: '⊘ ',
          CONTINUED: '⊜ ',
          DONE: '⊖ ',
          ABANDONED: '⊗ '
        };

        let indent = line.match(/^\s*/)?.[0] || "";
        let cleaned = line
          .replace(/[⊙⊘⊜⊖⊗]/g, '')
          .replace(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/, '')
          .trim();

        lines[i] = `${indent}${symbols[newStatus]}${newStatus} ${cleaned}`;


      if (newStatus === "DONE" && !lines[i + 1]?.includes("COMPLETED:")) {
        const indent = lines[i].match(/^\s*/)?.[0] || "";
        const formatted = moment().format("Do MMMM YYYY, h:mm:ss a");
        lines.splice(i + 1, 0, `${indent}  COMPLETED:[${formatted}]`);
      }

      if (removeCompleted && lines[i + 1]?.includes("COMPLETED:")) {
        lines.splice(i + 1, 1);
      }

      found = true;
      break;
    }
  }

  if (found) {
    fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
  } else {
    console.error("❌ No matching line found to update.");
  }
}

function getOrgFolder() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const folderPath = config.get("folderPath");
  return folderPath && folderPath.trim() !== "" ? folderPath : path.join(os.homedir(), "OrgFiles");
}

function showTaggedAgendaView(tag, items) {
  const panel = vscode.window.createWebviewPanel(
    "taggedAgendaView",
    `Tagged Agenda: ${tag}`,
    vscode.ViewColumn.Beside,
    { enableScripts: true }
  );

  panel.webview.html = getTaggedWebviewContent(tag, items);

  panel.webview.onDidReceiveMessage(message => {
    console.log("📩 Received message from webview:", message);
    if (message.command === "openFile") {
      const orgDir = getOrgFolder();
      const filePath = path.join(orgDir, message.file);
      vscode.workspace.openTextDocument(vscode.Uri.file(filePath)).then(doc => {
        vscode.window.showTextDocument(doc, { preview: false });
      });
    } else if (message.command === "changeStatus") {
      const parts = message.text.split(",");
      const newStatus = parts[0];
      const file = parts[1];
      const taskText = parts[2].trim();
      const scheduledDate = parts[3];
      const removeCompleted = message.text.includes("REMOVE_COMPLETED");
      console.log("🔄 Changing status:", newStatus, "in file:", file, "for task:", taskText, "with scheduled date:", scheduledDate);

      updateTaskStatusInFile(file, taskText, scheduledDate, newStatus, removeCompleted);
    }
  });
}

function getTaggedWebviewContent(tag, items) {
  const grouped = {};

  for (const item of items) {
    if (!grouped[item.file]) {
      grouped[item.file] = [];
    }
    grouped[item.file].push(item);
  }

  const fileButtons = Object.keys(grouped).map(file =>
    `<button class="file-tab" data-target="${file}">${file}</button>`
  ).join(" ");

  const filePanels = Object.entries(grouped).map(([file, tasks]) => {
    const taskPanels = tasks.map(item => {
      const keywordMatch = item.line.match(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/);
      const keyword = keywordMatch ? keywordMatch[0] : "TODO";
      const keywordClass = keyword.toLowerCase();

      const scheduledMatch = item.line.match(/\[([0-9]{2}-[0-9]{2}-[0-9]{4})\]/);
      const scheduledDate = scheduledMatch ? scheduledMatch[1] : "";

      const tagsMatch = item.line.match(/\[\+TAG:([^\]]+)\]/);
      const tagBubbles = tagsMatch
        ? tagsMatch[1].split(",").map(t =>
            `<span class="tag-badge">${t.trim()}</span>`
          ).join("")
        : "";

      const taskText = item.line
        .replace(/.*?\] -/, "")
        .replace(/\s+SCHEDULED:.*/, "")
        .replace(/\[\+TAG:.*?\]/, "")
        .replace(/[⊙⊖⊘⊜⊗]/g, "")  // Unicode cleanup
        .trim();

      const lateLabel = scheduledDate && moment(scheduledDate, "MM-DD-YYYY").isBefore(moment())
        ? `<span class="late">LATE: ${scheduledDate}</span>` : "";

      return `
        <div class="panel ${file}">
          <div class="textDiv">
            <span class="filename" data-file="${file}">${file}:</span>
            <span class="${keywordClass}" data-filename="${file}" data-text="${taskText}" data-date="${scheduledDate}">${keyword}</span>
            <span class="taskText">${taskText}</span>
            ${lateLabel}
            <span class="scheduled">SCHEDULED</span>
            ${tagBubbles}
          </div>
        </div>`;
    }).join("");

    return `
        <div class="file-group" id="${file}" style="display: none;">
              <h3>${file}:</h3>
              ${taskPanels}
            </div>`;
  }).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js"></script>
  <meta charset="UTF-8">
  <title>Tagged Agenda: ${tag}</title>
  <link href="https://fonts.googleapis.com/css?family=Roboto+Mono:400,700|Roboto:400,700" rel="stylesheet">
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
        .tag-badge {
          background-color: #c984f7;
          color: white;
          font-weight: 700;
          font-size: 9px;
          padding: 5px 10px;
          border-radius: 27px;
          margin-left: 10px;
          float: right;
          margin-top: 10px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
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
          display: block;
        }
        .file-tab {
          background: #444;
          color: white;
          margin: 5px;
          padding: 4px 10px;
          border-radius: 5px;
          border: none;
          cursor: pointer;
          font-weight: bold;
        }
        .file-tab:hover {
          background-color: #888;
        }
        .file-group { 
          color:rgba(89, 235, 11, 0.86);
          margin-top: 15px; 
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
        .expand-collapse {
          background-color: #555;
          color: white;
          margin: 0 5px 10px 0;
          padding: 5px 12px;
          border-radius: 5px;
          border: none;
          cursor: pointer;
          font-weight: bold;
        }
        .expand-collapse:hover {
          background-color: #888;
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
  </style>
</head>
<body>
  <h1>Tagged Agenda: [+TAG:${tag}]</h1>
  <div style="margin-bottom: 10px;">
  <button class="expand-collapse" id="expand-all">Expand All</button>
  <button class="expand-collapse" id="collapse-all">Collapse All</button>
  </div>
  <div><strong>Files:</strong> ${fileButtons}</div>
  <div id="display-agenda">${filePanels}</div>

  
  <script>
      const vscode = acquireVsCodeApi();

      // Toggle file groups on file-tab click
      document.addEventListener('click', function(event) {
          if (event.target.classList.contains("file-tab")) {
              let targetId = event.target.dataset.target;
              let groups = document.getElementsByClassName("file-group");
              for (let i = 0; i < groups.length; i++) {
                  groups[i].style.display = groups[i].id === targetId ? "block" : "none";
              }
          }
          // Expand All / Collapse All
          if (event.target.id === "expand-all") {
              let groups = document.getElementsByClassName("file-group");
              for (let i = 0; i < groups.length; i++) {
                  groups[i].style.display = "block";
              }
          }

          if (event.target.id === "collapse-all") {
              let groups = document.getElementsByClassName("file-group");
              for (let i = 0; i < groups.length; i++) {
                  groups[i].style.display = "none";
              }
          }

          if (event.target.classList.contains("filename")) {
              vscode.postMessage({
                  command: 'openFile',
                  file: event.target.dataset.file
              });
          }

          const statuses = ["TODO", "IN_PROGRESS", "CONTINUED", "DONE", "ABANDONED"];
          let currentStatus = event.target.innerText.trim();
          let currentIndex = statuses.indexOf(currentStatus);

          if (currentIndex !== -1) {
              let nextStatus = statuses[(currentIndex + 1) % statuses.length];
              event.target.innerText = nextStatus;
              event.srcElement.classList.remove(...statuses.map(s => s.toLowerCase()));
              event.srcElement.classList.add(nextStatus.toLowerCase());

              let safeText = event.target.dataset.text.replaceAll(",", "&#44;");
              let safeDate = event.target.dataset.date.replaceAll(",", "&#44;");
              let messageText = nextStatus + "," + event.target.dataset.filename + "," + safeText + "," + safeDate;

              if (nextStatus === "DONE") {
                  let completedDate = moment();
                  let formattedDate = completedDate.format("Do MMMM YYYY, h:mm:ss a");
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
  </script>

</body>
</html>`;
}