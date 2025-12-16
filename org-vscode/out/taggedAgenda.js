const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const moment = require("moment");
const taskKeywordManager = require("./taskKeywordManager");
const continuedTaskHandler = require("./continuedTaskHandler");

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

async function updateTaskStatusInFile(file, taskText, scheduledDate, newStatus, removeCompleted) {
  const orgDir = getOrgFolder();
  const filePath = path.join(orgDir, file);
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);

  const dateTag = scheduledDate ? `SCHEDULED: [${scheduledDate}]` : null;
  console.log("🛠 Updating file:", filePath);
  console.log("🔍 Looking for task text:", taskText);
  if (dateTag) console.log("🔍 With scheduled date tag:", dateTag);

  let taskLineNumber = -1;
  for (let i = 0; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;
    const matchesTask = lineText.includes(taskText);
    const matchesDate = dateTag ? lineText.includes(dateTag) : true;
    if (matchesTask && matchesDate) {
      taskLineNumber = i;
      break;
    }
  }

  if (taskLineNumber === -1) {
    console.error("❌ No matching line found to update.");
    return;
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  const currentLine = document.lineAt(taskLineNumber);
  const nextLine = taskLineNumber + 1 < document.lineCount ? document.lineAt(taskLineNumber + 1) : null;
  const currentStatusMatch = currentLine.text.match(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/);
  const currentStatus = currentStatusMatch ? currentStatusMatch[1] : null;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
  const starPrefixMatch = currentLine.text.match(/^\s*(\*+)/);
  const starPrefix = starPrefixMatch ? starPrefixMatch[1] : "*";

  const indent = currentLine.text.match(/^\s*/)?.[0] || "";
  const cleaned = taskKeywordManager.cleanTaskText(currentLine.text);
  let newLine = taskKeywordManager.buildTaskLine(indent, newStatus, cleaned, { headingMarkerStyle, starPrefix });

  // Add or remove COMPLETED line
  if (newStatus === "DONE") {
    newLine += `\n${taskKeywordManager.buildCompletedStamp(indent)}`;
  } else if (currentStatus === "DONE" && removeCompleted && nextLine && nextLine.text.includes("COMPLETED")) {
    workspaceEdit.delete(uri, nextLine.range);
  }

  // Handle CONTINUED transitions
  if (newStatus === "CONTINUED" && currentStatus !== "CONTINUED") {
    const forwardEdit = continuedTaskHandler.handleContinuedTransition(document, taskLineNumber);
    if (forwardEdit && forwardEdit.type === "insert") {
      workspaceEdit.insert(uri, forwardEdit.position, forwardEdit.text);
    }
  } else if (currentStatus === "CONTINUED" && newStatus !== "CONTINUED") {
    const removeEdit = continuedTaskHandler.handleContinuedRemoval(document, taskLineNumber);
    if (removeEdit && removeEdit.type === "delete") {
      workspaceEdit.delete(uri, removeEdit.range);
    }
  }

  workspaceEdit.replace(uri, currentLine.range, newLine);
  const applied = await vscode.workspace.applyEdit(workspaceEdit);
  if (applied) {
    await document.save();
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

  const nonce = (() => {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
  })();

  const mediaDir = path.join(__dirname, "..", "media");
  const localMoment = panel.webview.asWebviewUri(vscode.Uri.file(path.join(mediaDir, "moment.min.js")));

  panel.webview.html = getTaggedWebviewContent(panel.webview, nonce, String(localMoment), tag, items);

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

function getTaggedWebviewContent(webview, nonce, localMomentJs, tag, items) {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "MM-DD-YYYY");
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
        .replace(/^\s*\*+\s+/, "") // Org headline cleanup
        .trim();

      const lateLabel = scheduledDate && moment(scheduledDate, dateFormat, true).isBefore(moment(), "day")
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

  const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'nonce-${nonce}' https:; script-src 'nonce-${nonce}' https:`;
  const cdnMomentJs = "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>Tagged Agenda: ${tag}</title>
  <link href="https://fonts.googleapis.com/css?family=Roboto+Mono:400,700|Roboto:400,700" rel="stylesheet">
  <script nonce="${nonce}" src="${localMomentJs}"></script>
  <script nonce="${nonce}">(function(){ if (!window.moment){ var s=document.createElement('script'); s.src='${cdnMomentJs}'; document.head.appendChild(s);} })();</script>
  <style nonce="${nonce}">
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

  
  <script nonce="${nonce}">
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