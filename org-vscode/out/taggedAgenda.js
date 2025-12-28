const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const moment = require("moment");
const taskKeywordManager = require("./taskKeywordManager");
const continuedTaskHandler = require("./continuedTaskHandler");
const { stripAllTagSyntax, parseFileTagsFromText, parseTagGroupsFromText, createInheritanceTracker, matchesTagMatchString, normalizeTagMatchInput, getPlanningForHeading, isPlanningLine, parsePlanningFromText, normalizeTagsAfterPlanning } = require("./orgTagUtils");

module.exports = async function taggedAgenda() {
  const tagInput = await vscode.window.showInputBox({
    prompt: "Enter tag match string (Emacs style). Examples: +WORK+URGENT, WORK|HOME, +A-B. (Compat: any:a,b / all:a,b / a,b)",
    validateInput: input => {
      const s = String(input || "").trim();
      return s.length ? null : "Enter at least one tag.";
    }
  });

  if (!tagInput) return;

  const matchExpr = normalizeTagMatchInput(tagInput);

  const agendaItems = [];
  const orgDir = getOrgFolder();
  const files = fs.readdirSync(orgDir).filter(file => file.endsWith(".org") && !file.startsWith("."));

  for (const file of files) {
    const filePath = path.join(orgDir, file);
    const fileText = fs.readFileSync(filePath, "utf8");
    const lines = fileText.split(/\r?\n/);
    const tracker = createInheritanceTracker(parseFileTagsFromText(fileText));
    const groups = parseTagGroupsFromText(fileText);

    lines.forEach((line, index) => {
      const tagState = tracker.handleLine(line);
      const keywordMatch = line.match(/\b(TODO|IN_PROGRESS|DONE|CONTINUED|ABANDONED)\b/);
      const startsWithSymbol = /^\s*([⊙⊖⊘⊜⊗]|\*+)/.test(line);
      if (!tagState.isHeading || !keywordMatch || !startsWithSymbol) {
        return;
      }

      const taskTags = tagState.inheritedTags;
      if (taskTags.length > 0) {

        const match = matchesTagMatchString(matchExpr, taskTags, { groups });

        if (match) {
          const planning = getPlanningForHeading(lines, index);
          agendaItems.push({
            file,
            line,
            lineNumber: index + 1,
            tags: taskTags,
            scheduledDate: planning && planning.scheduled ? planning.scheduled : ""
          });
        }
      }
    });
  }

  showTaggedAgendaView(matchExpr, agendaItems);
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

  function normalizeTaskTextFromHeadline(headline) {
    return stripAllTagSyntax(headline)
      .replace(/.*?\] -/, "")
      .replace(/\s+SCHEDULED:.*/, "")
      .replace(/[⊙⊖⊘⊜⊗]/g, "")
      .replace(/^\s*\*+\s+/, "")
      .replace(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b\s*/g, "")
      .trim();
  }

  let taskLineNumber = -1;
  for (let i = 0; i < document.lineCount; i++) {
    const lineText = document.lineAt(i).text;
    const keywordMatch = lineText.match(/\b(TODO|IN_PROGRESS|DONE|CONTINUED|ABANDONED)\b/);
    const startsWithSymbol = /^\s*([⊙⊖⊘⊜⊗]|\*+)/.test(lineText);
    if (!keywordMatch || !startsWithSymbol) {
      continue;
    }

    const normalizedHeadlineText = normalizeTaskTextFromHeadline(lineText);
    const matchesTask = normalizedHeadlineText === String(taskText || "").trim();
    if (!matchesTask) {
      continue;
    }

    if (dateTag) {
      const planning = getPlanningForHeading(document.getText().split(/\r?\n/), i);
      const matchesDate = planning && planning.scheduled ? (`SCHEDULED: [${planning.scheduled}]` === dateTag) : false;
      if (!matchesDate) {
        continue;
      }
    }

    taskLineNumber = i;
    break;
  }

  if (taskLineNumber === -1) {
    console.error("❌ No matching line found to update.");
    return;
  }

  const workspaceEdit = new vscode.WorkspaceEdit();
  const currentLine = document.lineAt(taskLineNumber);
  const nextLine = taskLineNumber + 1 < document.lineCount ? document.lineAt(taskLineNumber + 1) : null;
  const nextNextLine = taskLineNumber + 2 < document.lineCount ? document.lineAt(taskLineNumber + 2) : null;
  const currentStatusMatch = currentLine.text.match(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/);
  const currentStatus = currentStatusMatch ? currentStatusMatch[1] : null;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const starPrefixMatch = currentLine.text.match(/^\s*(\*+)/);
  const starPrefix = starPrefixMatch ? starPrefixMatch[1] : "*";

  const indent = currentLine.text.match(/^\s*/)?.[0] || "";
  const cleanedHeadline = taskKeywordManager.cleanTaskText(
    normalizeTagsAfterPlanning(currentLine.text)
      .replace(/\s*(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\s*\[[^\]]*\]/g, "")
      .replace(/\s*(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\[[^\]]*\]/g, "")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
  let newLine = taskKeywordManager.buildTaskLine(indent, newStatus, cleanedHeadline, { headingMarkerStyle, starPrefix });

  const planningIndent = `${indent}  `;
  const planningLines = document.getText().split(/\r?\n/);
  const planningFromHead = parsePlanningFromText(currentLine.text);
  const planningFromNext = (nextLine && isPlanningLine(nextLine.text)) ? parsePlanningFromText(nextLine.text) : {};
  const planningFromNextNext = (nextNextLine && isPlanningLine(nextNextLine.text)) ? parsePlanningFromText(nextNextLine.text) : {};

  // Merge any adjacent planning lines into a single planning state.
  const mergedPlanning = {
    scheduled: planningFromNext.scheduled || planningFromHead.scheduled || null,
    deadline: planningFromNext.deadline || planningFromHead.deadline || null,
    // Prefer CLOSED; legacy COMPLETED is mapped to closed by the parser.
    closed: planningFromNext.closed || planningFromHead.closed || planningFromNextNext.closed || null
  };

  // Add/remove CLOSED in the planning line (preferred: single planning line directly under heading).
  if (newStatus === "DONE") {
    mergedPlanning.closed = moment().format(`${dateFormat} ddd HH:mm`);
  } else if (currentStatus === "DONE" && removeCompleted) {
    mergedPlanning.closed = null;
  }

  function buildPlanningBody(p) {
    const parts = [];
    if (p.scheduled) parts.push(`SCHEDULED: [${p.scheduled}]`);
    if (p.deadline) parts.push(`DEADLINE: [${p.deadline}]`);
    if (p.closed) parts.push(`CLOSED: [${p.closed}]`);
    return parts.join("  ");
  }

  const planningBody = buildPlanningBody(mergedPlanning);

  // Remove any inline planning that might still exist on the headline.
  const newHeadlineOnly = newLine;

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

  workspaceEdit.replace(uri, currentLine.range, newHeadlineOnly);

  // Ensure planning line is immediate next line (merge and normalize), and remove any extra adjacent planning line.
  if (planningBody) {
    if (nextLine && isPlanningLine(nextLine.text)) {
      workspaceEdit.replace(uri, nextLine.range, `${planningIndent}${planningBody}`);
      if (nextNextLine && isPlanningLine(nextNextLine.text)) {
        workspaceEdit.delete(uri, nextNextLine.rangeIncludingLineBreak);
      }
    } else {
      // If the second line was a planning line (rare), delete it and insert the merged one as immediate next line.
      if (nextNextLine && isPlanningLine(nextNextLine.text)) {
        workspaceEdit.delete(uri, nextNextLine.rangeIncludingLineBreak);
      }
      workspaceEdit.insert(uri, currentLine.range.end, `\n${planningIndent}${planningBody}`);
    }
  } else {
    // No planning left: delete immediate planning line, or a stray second planning line.
    if (nextLine && isPlanningLine(nextLine.text)) {
      workspaceEdit.delete(uri, nextLine.rangeIncludingLineBreak);
    } else if (nextNextLine && isPlanningLine(nextNextLine.text) && (nextNextLine.text.includes("CLOSED") || nextNextLine.text.includes("COMPLETED"))) {
      workspaceEdit.delete(uri, nextNextLine.rangeIncludingLineBreak);
    }
  }

  const applied = await vscode.workspace.applyEdit(workspaceEdit);
  if (applied) {
    await document.save();
  }
}

function getOrgFolder() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const folderPath = config.get("folderPath");
  return folderPath && folderPath.trim() !== "" ? folderPath : path.join(os.homedir(), "VSOrgFiles");
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
      const taskText = (parts[2] || "").replaceAll("&#44;", ",").trim();
      const scheduledDate = parts[3];
      const removeCompleted = message.text.includes("REMOVE_CLOSED") || message.text.includes("REMOVE_COMPLETED");
      console.log("🔄 Changing status:", newStatus, "in file:", file, "for task:", taskText, "with scheduled date:", scheduledDate);

      updateTaskStatusInFile(file, taskText, scheduledDate, newStatus, removeCompleted);
    }
  });
}

function getTaggedWebviewContent(webview, nonce, localMomentJs, tag, items) {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const acceptedDateFormats = [dateFormat, "MM-DD-YYYY", "DD-MM-YYYY", "YYYY-MM-DD"];
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

      const scheduledDate = item.scheduledDate || "";

      const taskTags = (item.tags && item.tags.length) ? item.tags : getAllTagsFromLine(item.line);
      const tagBubbles = taskTags.length
        ? taskTags.map(t => `<span class="tag-badge">${t}</span>`).join("")
        : "";

      const taskText = stripAllTagSyntax(item.line)
        .replace(/.*?\] -/, "")
        .replace(/\s+SCHEDULED:.*/, "")
        .replace(/[⊙⊖⊘⊜⊗]/g, "")  // Unicode cleanup
        .replace(/^\s*\*+\s+/, "") // Org headline cleanup
        .replace(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b\s*/g, "") // Keyword cleanup (stable matching)
        .trim();

      const lateLabel = scheduledDate && moment(scheduledDate, acceptedDateFormats, true).isBefore(moment(), "day")
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
  <h1>Tagged Agenda: ${tag}</h1>
  <div style="margin-bottom: 10px;">
  <button class="expand-collapse" id="expand-all">Expand All</button>
  <button class="expand-collapse" id="collapse-all">Collapse All</button>
  </div>
  <div><strong>Files:</strong> ${fileButtons}</div>
  <div id="display-agenda">${filePanels}</div>

  
  <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const dateFormat = "${dateFormat}";

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
                  let formattedDate = completedDate.format(dateFormat + " ddd HH:mm");
                  messageText += ",CLOSED:[" + formattedDate + "]";
                }

                if (currentStatus === "DONE") {
                  messageText += ",REMOVE_CLOSED";
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