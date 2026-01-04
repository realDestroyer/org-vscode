const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const moment = require("moment");
const taskKeywordManager = require("./taskKeywordManager");
const continuedTaskHandler = require("./continuedTaskHandler");
const { stripAllTagSyntax, parseFileTagsFromText, parseTagGroupsFromText, createInheritanceTracker, matchesTagMatchString, normalizeTagMatchInput, getPlanningForHeading, isPlanningLine, parsePlanningFromText, normalizeTagsAfterPlanning } = require("./orgTagUtils");
const { computeCheckboxStatsByHeadingLine, formatCheckboxStats, findCheckboxCookie } = require("./checkboxStats");
const { computeCheckboxToggleEdits } = require("./checkboxToggle");

module.exports = async function taggedAgenda() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const includeContinuedInTaggedAgenda = config.get("includeContinuedInTaggedAgenda", false);

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
    const checkboxStatsByLine = computeCheckboxStatsByHeadingLine(lines);
    const tracker = createInheritanceTracker(parseFileTagsFromText(fileText));
    const groups = parseTagGroupsFromText(fileText);

    lines.forEach((line, index) => {
      const tagState = tracker.handleLine(line);
      const keywordMatch = line.match(/\b(TODO|IN_PROGRESS|DONE|CONTINUED|ABANDONED)\b/);
      const status = keywordMatch ? keywordMatch[1] : null;
      const startsWithSymbol = /^\s*([⊙⊖⊘⊜⊗]|\*+)/.test(line);
      if (!tagState.isHeading || !keywordMatch || !startsWithSymbol) {
        return;
      }

      // CONTINUED is primarily a historical breadcrumb; by default Tagged Agenda omits it.
      if (status === "CONTINUED" && !includeContinuedInTaggedAgenda) {
        return;
      }

      const taskTags = tagState.inheritedTags;
      if (taskTags.length > 0) {

        const match = matchesTagMatchString(matchExpr, taskTags, { groups });

        if (match) {
          const planning = getPlanningForHeading(lines, index);
          const cb = checkboxStatsByLine.get(index) || { checked: 0, total: 0 };

          // Capture indented child lines for details rendering.
          const baseIndent = line.match(/^\s*/)?.[0] || "";
          const children = [];
          for (let k = index + 1; k < lines.length; k++) {
            const nextLine = lines[k];
            const nextIndent = nextLine.match(/^\s*/)?.[0] || "";
            if (nextIndent.length > baseIndent.length) {
              children.push({ text: nextLine, lineNumber: k + 1 });
            } else {
              break;
            }
          }

          agendaItems.push({
            file,
            line,
            lineNumber: index + 1,
            tags: taskTags,
            scheduledDate: planning && planning.scheduled ? planning.scheduled : "",
            checkboxChecked: cb.checked,
            checkboxTotal: cb.total,
            children
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
    } else if (message.command === "toggleCheckbox") {
      const file = String(message.file || "");
      const lineNumber = Number(message.lineNumber);
      if (!file || !Number.isFinite(lineNumber)) {
        return;
      }

      const orgDir = getOrgFolder();
      const filePath = path.join(orgDir, file);
      const uri = vscode.Uri.file(filePath);

      vscode.workspace.openTextDocument(uri).then(document => {
        const lines = document.getText().split(/\r?\n/);
        const edits = computeCheckboxToggleEdits(lines, lineNumber - 1);
        if (!edits.length) {
          return;
        }

        const workspaceEdit = new vscode.WorkspaceEdit();
        for (const e of edits) {
          if (e.lineIndex < 0 || e.lineIndex >= document.lineCount) continue;
          const line = document.lineAt(e.lineIndex);
          workspaceEdit.replace(uri, line.range, e.newText);
        }

        vscode.workspace.applyEdit(workspaceEdit).then(applied => {
          if (!applied) {
            vscode.window.showErrorMessage("Unable to toggle checkbox.");
            return;
          }
          document.save();
        });
      });
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

      const cookie = findCheckboxCookie(item.line);
      const checkboxLabel = cookie
        ? `<span class="checkbox-stats">${formatCheckboxStats({ checked: item.checkboxChecked, total: item.checkboxTotal }, cookie.mode)}</span>`
        : "";

      function escapeHtml(s) {
        return String(s || "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }

      function escapeLeadingSpaces(s) {
        const str = String(s || "");
        const m = str.match(/^(\s*)/);
        const lead = m ? m[1] : "";
        const rest = str.slice(lead.length);
        const leadEsc = lead.replace(/ /g, "&nbsp;").replace(/\t/g, "&nbsp;&nbsp;");
        return leadEsc + escapeHtml(rest);
      }

      function renderChildrenBlock(children, fileName) {
        const arr = Array.isArray(children) ? children : [];
        if (!arr.length) return "";
        const linesHtml = arr.map((c) => {
          const text = c && typeof c === 'object' ? String(c.text || '') : String(c || '');
          const lineNumber = c && typeof c === 'object' ? Number(c.lineNumber) : NaN;
          const m = text.match(/^(\s*)([-+*]|\d+[.)])\s+\[( |x|X|-)\]\s+(.*)$/);
          if (!m) {
            return `<div class=\"detail-line\">${escapeLeadingSpaces(text)}</div>`;
          }
          const indentLen = (m[1] || "").length;
          const bullet = escapeLeadingSpaces((m[1] || "") + (m[2] || "-"));
          const state = String(m[3] || " ");
          const rest = escapeHtml(m[4] || "");
          const isChecked = state.toLowerCase() === "x";
          const isPartial = state === "-";
          const checkedAttr = isChecked ? "checked" : "";
          const partialAttr = isPartial ? "data-state=\\\"partial\\\"" : "";
          const safeFile = escapeHtml(fileName);
          const safeLine = Number.isFinite(lineNumber) ? String(lineNumber) : "";
          return (
            `<div class=\"detail-line checkbox-line\">${bullet} ` +
            `<input class=\"org-checkbox\" type=\"checkbox\" data-file=\"${safeFile}\" data-line=\"${safeLine}\" data-indent=\"${indentLen}\" ${partialAttr} ${checkedAttr}/> ` +
            `<span class=\"checkbox-text\">${rest}</span></div>`
          );
        }).join("");
        return `<details class=\"children-block\"><summary>Show Details</summary><div class=\"children-lines\">${linesHtml}</div></details>`;
      }

      const childrenBlock = renderChildrenBlock(item.children, file);

      const lateLabel = scheduledDate && moment(scheduledDate, acceptedDateFormats, true).isBefore(moment(), "day")
        ? `<span class="late">LATE: ${scheduledDate}</span>` : "";

      return `
        <div class="panel ${file}">
          <div class="textDiv">
            <span class="filename" data-file="${file}">${file}:</span>
            <span class="${keywordClass}" data-filename="${file}" data-text="${taskText}" data-date="${scheduledDate}">${keyword}</span>
            <span class="taskText">${taskText}</span>
            ${checkboxLabel}
            ${lateLabel}
            <span class="scheduled">SCHEDULED</span>
            ${tagBubbles}
          </div>
          ${childrenBlock}
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
        .checkbox-stats {
          float: left;
          margin-left: 10px;
          margin-top: 10px;
          font-weight: 700;
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

        .children-block {
          margin-top: 8px;
          font-family: monospace;
          background-color: #f9f9f9;
          padding: 8px;
          border-radius: 6px;
          display: block;
          width: 100%;
          box-sizing: border-box;
          clear: both;
        }
        .children-block summary {
          cursor: pointer;
          font-weight: bold;
          color: #444;
          text-align: left;
        }
        .children-lines {
          margin: 6px 0 0 0;
          font-size: 13px;
          color: #000;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
          max-width: 100%;
          box-sizing: border-box;
        }
        .detail-line {
          font-family: monospace;
          white-space: pre-wrap;
        }
        .org-checkbox {
          vertical-align: middle;
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

    // Initialize indeterminate display for partial checkboxes.
    Array.from(document.querySelectorAll('input.org-checkbox[data-state="partial"]'))
      .forEach(i => { try { i.indeterminate = true; } catch (e) {} });

      // Toggle file groups on file-tab click
      document.addEventListener('click', function(event) {
          if (event.target && event.target.classList && event.target.classList.contains('org-checkbox')) {
              event.stopPropagation();
              const input = event.target;
              const panel = input.closest('.panel');
              if (!panel) return;

              const inputs = Array.from(panel.querySelectorAll('input.org-checkbox'));
              const idx = inputs.indexOf(input);
              if (idx === -1) return;

              function getIndent(el) {
                return Number(el.dataset.indent || 0) || 0;
              }

              function subtreeEndIndex(startIndex) {
                const baseIndent = getIndent(inputs[startIndex]);
                for (let i = startIndex + 1; i < inputs.length; i++) {
                  if (getIndent(inputs[i]) <= baseIndent) return i;
                }
                return inputs.length;
              }

              const baseIndent = getIndent(input);
              const end = subtreeEndIndex(idx);
              let hasDesc = false;
              for (let i = idx + 1; i < end; i++) {
                if (getIndent(inputs[i]) > baseIndent) { hasDesc = true; break; }
              }

              const desiredChecked = !!input.checked;

              const applyState = (el, checked, partial) => {
                el.checked = !!checked;
                el.indeterminate = !!partial;
                if (partial) el.dataset.state = 'partial';
                else delete el.dataset.state;
              };

              if (hasDesc) {
                for (let i = idx; i < end; i++) {
                  if (i !== idx && getIndent(inputs[i]) <= baseIndent) continue;
                  applyState(inputs[i], desiredChecked, false);
                }
              } else {
                applyState(input, desiredChecked, false);
              }

              for (let i = inputs.length - 1; i >= 0; i--) {
                const indent = getIndent(inputs[i]);
                const endI = subtreeEndIndex(i);
                let hasChild = false;
                let allChecked = true;
                let anyChecked = false;
                for (let j = i + 1; j < endI; j++) {
                  if (getIndent(inputs[j]) <= indent) break;
                  hasChild = true;
                  if (inputs[j].checked) anyChecked = true;
                  else allChecked = false;
                }
                if (!hasChild) continue;
                if (!anyChecked) applyState(inputs[i], false, false);
                else if (allChecked) applyState(inputs[i], true, false);
                else applyState(inputs[i], false, true);
              }

              const badge = panel.querySelector('.checkbox-stats');
              if (badge) {
                const mode = (badge.textContent || '').includes('%') ? 'percent' : 'fraction';
                const indents = inputs.map(getIndent);
                const minIndent = indents.length ? Math.min(...indents) : 0;
                const top = inputs
                  .map((el, i) => ({ el, i }))
                  .filter(x => getIndent(x.el) === minIndent);
                let checkedCount = 0;
                for (let t = 0; t < top.length; t++) {
                  const i0 = top[t].i;
                  const endT = (t + 1 < top.length) ? top[t + 1].i : inputs.length;
                  if (inputs[i0].checked) { checkedCount++; continue; }
                  let hasDesc2 = false;
                  let allDesc = true;
                  for (let j = i0 + 1; j < endT; j++) {
                    if (getIndent(inputs[j]) <= minIndent) break;
                    hasDesc2 = true;
                    if (!inputs[j].checked) { allDesc = false; break; }
                  }
                  if (hasDesc2 && allDesc) checkedCount++;
                }
                const total = top.length;
                if (mode === 'percent') {
                  const pct = total > 0 ? Math.floor((checkedCount / total) * 100) : 0;
                  badge.textContent = '[' + pct + '%]';
                } else {
                  badge.textContent = '[' + checkedCount + '/' + total + ']';
                }
              }

              vscode.postMessage({
                  command: 'toggleCheckbox',
                  file: input.dataset.file,
                  lineNumber: Number(input.dataset.line)
              });
              return;
          }

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