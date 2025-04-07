const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const moment = require("moment");




module.exports = async function taggedAgenda() {
    const tag = await vscode.window.showInputBox({
        prompt: "Enter the tag you want to view (e.g. TEST)",
        validateInput: input => input.includes(" ") ? "Tag cannot contain spaces." : null
    });

    if (!tag) return;

    const tagRegex = new RegExp(`\\[\\+TAG:${tag}\\]`, "i");
    const agendaItems = [];

    const orgDir = getOrgFolder();
    const files = fs.readdirSync(orgDir).filter(file => file.endsWith(".org"));

    for (const file of files) {
        const filePath = path.join(orgDir, file);
        const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

        lines.forEach((line, index) => {
            if (tagRegex.test(line)) {
                agendaItems.push({
                    file,
                    line,
                    lineNumber: index + 1
                });
            }
        });
    }

    showTaggedAgendaView(tag, agendaItems);
};

function updateTaskStatusInFile(file, taskText, scheduledDate, newStatus, completedLine, removeCompleted) {
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
            lines[i] = line.replace(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/, newStatus);

            // Add COMPLETED line if switching to DONE
            if (newStatus === "DONE" && completedLine && !lines[i + 1]?.includes("COMPLETED:")) {
                lines.splice(i + 1, 0, `   ${completedLine}`);
            }

            // Remove COMPLETED line if leaving DONE
            if (removeCompleted && lines[i + 1]?.includes("COMPLETED:")) {
                lines.splice(i + 1, 1);
            }

            found = true;
            break;
        }
    }

    if (!found) {
        console.error("❌ No matching line found to update.");
    } else {
        fs.writeFileSync(filePath, lines.join("\n"), "utf-8");
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
          const completedLine = parts[4] || null;
          const removeCompleted = message.text.includes("REMOVE_COMPLETED");
          console.log("🧠 Parsed status change:", { newStatus, file, taskText, scheduledDate, completedLine, removeCompleted });

          updateTaskStatusInFile(file, taskText, scheduledDate, newStatus, completedLine, removeCompleted);
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

  const content = Object.entries(grouped).map(([file, tasks]) => {
      const taskPanels = tasks.map(item => {
          const keywordMatch = item.line.match(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/);
          const keyword = keywordMatch ? keywordMatch[0] : "TODO";
          const keywordClass = keyword.toLowerCase();
          const scheduledMatch = item.line.match(/\[([0-9]{2}-[0-9]{2}-[0-9]{4})\]/);
          const scheduledDate = scheduledMatch ? scheduledMatch[1] : "";
          const taskText = item.line.replace(/.*?\] -/, "").replace(/\s+SCHEDULED:.*/, "").trim();
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
                  </div>
              </div>`;
      }).join("");

      return `
          <button class="headingMonday ${file}">${file}</button>
          ${taskPanels}`;
  }).join("");

  return `
<!DOCTYPE html>
<html>
<head>
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
  </style>
</head>
<body>
  <h1>Tagged Agenda: [+TAG:${tag}]</h1>
  <div id="display-agenda">${content}</div>

  <script>
      const vscode = acquireVsCodeApi();

      document.addEventListener('click', function(event) {
          let class0 = event.srcElement.classList[0];
          let class1 = event.srcElement.classList[1];
          let panels = document.getElementsByClassName('panel');

          if (!event.srcElement.classList.contains('panel')) {
              for (let i = 0; i < panels.length; i++) {
                  if (panels[i].classList.contains(class0) || panels[i].classList.contains(class1)) {
                      panels[i].style.display = panels[i].style.display === 'block' ? 'none' : 'block';
                  }
              }
          }

          if (event.srcElement.classList.contains('filename')) {
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

              let messageText = nextStatus + "," + event.target.dataset.filename + "," + event.target.dataset.text + "," + event.target.dataset.date;

              if (nextStatus === "DONE") {
                  let completedDate = new Date();
                  let formattedDate = completedDate.toISOString().split('T')[0];
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




