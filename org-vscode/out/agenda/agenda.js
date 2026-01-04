"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const moment = require("moment");
const taskKeywordManager = require("../taskKeywordManager");
const continuedTaskHandler = require("../continuedTaskHandler");
const path = require("path");
const { stripAllTagSyntax, getPlanningForHeading, isPlanningLine, parsePlanningFromText, normalizeTagsAfterPlanning } = require("../orgTagUtils");
const { formatCheckboxStats, findCheckboxCookie, computeHierarchicalCheckboxStatsInRange } = require("../checkboxStats");
const { computeCheckboxToggleEdits } = require("../checkboxToggle");

module.exports = function () {
  vscode.commands.executeCommand("workbench.action.files.save").then(() => {
  let config = vscode.workspace.getConfiguration("Org-vscode");
    let folderPath = config.get("folderPath");
    let dateFormat = config.get("dateFormat", "YYYY-MM-DD");
    let acceptedDateFormats = [dateFormat, "MM-DD-YYYY", "DD-MM-YYYY", "YYYY-MM-DD"];
    let folder;
    let taskText;
    let taskKeywordMatch = "";
    let getDateFromTaskText;
    let convertedDateArray = [];
    let unsortedObject = {};
    let sortedObject = {};
    let itemInSortedObject = "";

    readFiles();

    function computeCheckboxStatsFromLines(lines) {
      const arr = Array.isArray(lines) ? lines : [];
      const textLines = arr.map(l => (l && typeof l === 'object' && 'text' in l) ? String(l.text || '') : String(l || ''));
      const stats = computeHierarchicalCheckboxStatsInRange(textLines, 0, textLines.length, -1);
      return { total: stats.total, checked: stats.checked };
    }

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
          return `<div class="detail-line">${escapeLeadingSpaces(text)}</div>`;
        }

        const indentLen = (m[1] || "").length;
        const bullet = escapeLeadingSpaces((m[1] || "") + (m[2] || "-"));
        const state = String(m[3] || " ");
        const rest = escapeHtml(m[4] || "");
        const isChecked = state.toLowerCase() === "x";
        const isPartial = state === "-";
        const checkedAttr = isChecked ? "checked" : "";
        const partialAttr = isPartial ? "data-state=\"partial\"" : "";
        const safeFile = escapeHtml(fileName);
        const safeLine = Number.isFinite(lineNumber) ? String(lineNumber) : "";
        return (
          `<div class="detail-line checkbox-line">${bullet} ` +
          `<input class="org-checkbox" type="checkbox" data-file="${safeFile}" data-line="${safeLine}" data-indent="${indentLen}" ${partialAttr} ${checkedAttr}/> ` +
          `<span class="checkbox-text">${rest}</span></div>`
        );
      }).join("");

      return `<details class="children-block"><summary>Show Details</summary><div class="children-lines">${linesHtml}</div></details>`;
    }

    // Reads all .org files and builds agenda view HTML blocks grouped by scheduled date
    function readFiles() {
      fs.readdir(setMainDir(), (err, items) => {
        function getSortTimestampFromAgendaKey(key) {
          const dateMatch = key.match(/\[(\d{2,4}-\d{2}-\d{2,4})\]/);
          if (!dateMatch) {
            return null;
          }
          const parsed = moment(dateMatch[1], acceptedDateFormats, true);
          return parsed.isValid() ? parsed.valueOf() : null;
        }

        for (let i = 0; i < items.length; i++) {
          if (items[i].includes(".org")) {
            if (items[i] === "CurrentTasks.org") continue; // Skip export file

            // Read the contents of the .org file
            const fullPath = path.join(setMainDir(), items[i]);
            const fileText = fs.readFileSync(fullPath).toString().split(/\r?\n/);

            // Iterate through lines to find scheduled, non-completed tasks (only TODO and IN_PROGRESS)
            for (let j = 0; j < fileText.length; j++) {
              const element = fileText[j];
              // Only show TODO and IN_PROGRESS tasks - exclude DONE, CONTINUED, and ABANDONED
              const planning = getPlanningForHeading(fileText, j);
              const hasScheduled = Boolean(planning && planning.scheduled);
              const isTodoOrInProgress = /\b(TODO|IN_PROGRESS)\b/.test(element);
              
              if (hasScheduled && isTodoOrInProgress) {

                // Capture indented child lines that belong to the current task
                const baseIndent = element.match(/^\s*/)?.[0] || "";
                const children = [];
                let deadlineFromChildren = null;
                for (let k = j + 1; k < fileText.length; k++) {
                  const nextLine = fileText[k];
                  const nextIndent = nextLine.match(/^\s*/)?.[0] || "";
                  if (nextIndent.length > baseIndent.length) {
                    children.push({ text: nextLine, lineNumber: k + 1 });
                    // Check for DEADLINE in child lines
                    const dlMatch = nextLine.match(/DEADLINE:\s*\[([\d-]+(?:\s+[\d:]+)?)\]/);
                    if (dlMatch && !deadlineFromChildren) {
                      deadlineFromChildren = dlMatch[1];
                    }
                  } else {
                    break;
                  }
                }
                
                // Also check for DEADLINE on the task line itself
                const inlineDeadlineMatch = element.match(/DEADLINE:\s*\[([\d-]+(?:\s+[\d:]+)?)\]/);
                const deadlineStr = inlineDeadlineMatch ? inlineDeadlineMatch[1] : deadlineFromChildren;

                // Extract core task text and scheduled date
                const taskTextMatch = element;
                getDateFromTaskText = planning && planning.scheduled ? [null, planning.scheduled] : null;

                if (taskTextMatch && getDateFromTaskText) {
                  // Match the task keyword (TODO, IN_PROGRESS, etc.)
                  taskKeywordMatch = element.match(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/);

                  // Clean up task line: remove symbols, keyword, tags
                  taskText = stripAllTagSyntax(taskTextMatch)
                    .replace(/[⊙⊖⊘⊜⊗]/g, "")
                    .replace(/^\s*\*+\s+/, "")
                    .replace(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/, "")
                    .trim();

                  // Format the task's scheduled date for grouping and display
                  const scheduledMoment = moment(getDateFromTaskText[1], acceptedDateFormats, true);
                  if (!scheduledMoment.isValid()) {
                    continue;
                  }
                  let formattedDate = scheduledMoment.format(dateFormat);
                  let nameOfDay = scheduledMoment.format("dddd");
                  let cleanDate = `[${formattedDate}]`;

                  // Create collapsible child block (if child lines exist)
                  let childrenBlock = renderChildrenBlock(children, items[i]);

                  const checkboxStats = computeCheckboxStatsFromLines(children);
                  const cookie = findCheckboxCookie(element);
                  const checkboxBadge = (cookie && checkboxStats.total >= 0)
                    ? `<span class=\"checkbox-stats\">${formatCheckboxStats({ checked: checkboxStats.checked, total: checkboxStats.total }, cookie.mode)}</span>`
                    : "";

                  // Build deadline warning badge if task has a deadline
                  let deadlineBadge = "";
                  if (deadlineStr) {
                    const deadlineDate = moment(deadlineStr.split(" ")[0], acceptedDateFormats, true);
                    const today = moment().startOf("day");
                    const daysUntil = deadlineDate.diff(today, "days");
                    
                    if (daysUntil < 0) {
                      deadlineBadge = `<span class="deadline deadline-overdue">⚠ OVERDUE: ${deadlineDate.format("MMM Do")}</span>`;
                    } else if (daysUntil === 0) {
                      deadlineBadge = `<span class="deadline deadline-today">⚠ DUE TODAY</span>`;
                    } else if (daysUntil <= 3) {
                      deadlineBadge = `<span class="deadline deadline-soon">⏰ Due in ${daysUntil} day${daysUntil > 1 ? 's' : ''}</span>`;
                    } else {
                      deadlineBadge = `<span class="deadline deadline-future">📅 Due: ${deadlineDate.format("MMM Do")}</span>`;
                    }
                  }

                  // Build HTML task entry
                  let renderedTask = "";
                  if (taskKeywordMatch !== null) {
                    renderedTask =
                      '<span class="filename" data-file="' + items[i] + '">' + items[i] + ":</span> " +
                      '<span class="' + taskKeywordMatch[0].toLowerCase() + '" data-filename="' + items[i] + '" data-text="' + taskText + '" data-date="' + cleanDate + '">' + taskKeywordMatch[0] + '</span>' +
                      '<span class="taskText">' + taskText + "</span>" +
                      checkboxBadge +
                      '<span class="scheduled">SCHEDULED</span>' +
                      deadlineBadge;
                  } else {
                    renderedTask =
                      '<span class="filename" data-file="' + items[i] + '">' + items[i] + ":</span> " +
                      '<span class="taskText">' + taskText + "</span>" +
                      checkboxBadge +
                      '<span class="scheduled">SCHEDULED</span>' +
                      deadlineBadge;
                  }

                  // Clear the current date array and group task appropriately by date
                  convertedDateArray = [];

                  // If task is today or future
                  if (scheduledMoment.isSameOrAfter(moment().startOf("day"), "day")) {
                    convertedDateArray.push({
                      date: `<div class=\"heading${nameOfDay} ${cleanDate}\"><h4 class=\"${cleanDate}\">${cleanDate}, ${nameOfDay.toUpperCase()}</h4></div>`,
                      text: `<div class=\"panel ${cleanDate}\">${renderedTask}${childrenBlock}</div>`
                    });
                  } else {
                    // If task is overdue
                    let today = moment().format(dateFormat);
                    let overdue = moment().format("dddd");

                    if (scheduledMoment.isBefore(moment().startOf("day"), "day")) {
                      convertedDateArray.push({
                        date: `<div class=\"heading${overdue} [${today}]\"><h4 class=\"[${today}]\">[${today}], ${overdue.toUpperCase()}</h4></div>`,
                        text: `<div class=\"panel [${today}]\">${renderedTask}<span class=\"late\">LATE: ${moment(getDateFromTaskText[1], acceptedDateFormats, true).format(dateFormat)}</span>${childrenBlock}</div>`
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

          }
        }

        // Sort agenda items by date and store in sortedObject for ordered rendering.
        // Important: do this once after scanning all files, otherwise overwriting existing
        // keys will not update insertion order and results may appear out of chronological order.
        Object.keys(unsortedObject)
          .sort((a, b) => {
            const tsA = getSortTimestampFromAgendaKey(a);
            const tsB = getSortTimestampFromAgendaKey(b);
            if (tsA == null && tsB == null) {
              return a.localeCompare(b);
            }
            if (tsA == null) {
              return 1;
            }
            if (tsB == null) {
              return -1;
            }
            return tsA - tsB;
          })
          .forEach(key => {
            sortedObject[key] = unsortedObject[key];
          });

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
      let suppressReloadForFsPath = null;
      let fullAgendaView = vscode.window.createWebviewPanel("fullAgenda", "Full Agenda View", vscode.ViewColumn.Beside, { enableScripts: true });
      fullAgendaView.webview.html = getWebviewContent(sortedObject);

      const saveDisposable = vscode.workspace.onDidSaveTextDocument((savedDoc) => {
        if (suppressReloadForFsPath && savedDoc && savedDoc.uri && savedDoc.uri.fsPath === suppressReloadForFsPath) {
          suppressReloadForFsPath = null;
          return;
        }
        reload = true;
        fullAgendaView.dispose();
      });

      fullAgendaView.onDidDispose(() => {
        saveDisposable.dispose();
        if (reload) vscode.commands.executeCommand("extension.viewAgenda");
      });

      fullAgendaView.webview.onDidReceiveMessage(message => {
        if (message.command === "open") {
          let fullPath = path.join(setMainDir(), message.text);
          vscode.workspace.openTextDocument(vscode.Uri.file(fullPath)).then(doc => {
            vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false);
          });
        } else if (message.command === "changeStatus") {
          const parts = String(message.text || "").split(",");
          const newStatus = parts[0];
          const fileName = parts[1];
          const taskText = (parts[2] || "").replaceAll("&#44;", ",");
          const date = (parts[3] || "").replaceAll("&#44;", ",");
          const flags = parts.slice(4);
          const removeClosed = flags.includes("REMOVE_CLOSED") || flags.includes("REMOVE_COMPLETED");
          let filePath = path.join(setMainDir(), fileName);
          const uri = vscode.Uri.file(filePath);

          vscode.workspace.openTextDocument(uri).then(document => {
            const lines = document.getText().split(/\r?\n/);

            function normalizeHeadlineToTitle(headline) {
              return stripAllTagSyntax(normalizeTagsAfterPlanning(headline))
                .replace(/[⊙⊖⊘⊜⊗]/g, "")
                .replace(/^\s*\*+\s+/, "")
                .replace(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/, "")
                .trim();
            }

            const dateOnly = String(date || "").replace(/^\[|\]$/g, "");
            let taskLineNumber = -1;
            for (let i = 0; i < document.lineCount; i++) {
              const lineText = document.lineAt(i).text;
              const keywordMatch = lineText.match(/\b(TODO|IN_PROGRESS|DONE|CONTINUED|ABANDONED)\b/);
              const isHeading = /^\s*\*+\s+/.test(lineText);
              if (!keywordMatch || !isHeading) {
                continue;
              }

              const normalized = normalizeHeadlineToTitle(lineText);
              if (normalized !== String(taskText || "").trim()) {
                continue;
              }

              if (dateOnly) {
                const planning = getPlanningForHeading(lines, i);
                const scheduled = planning && planning.scheduled ? planning.scheduled : null;
                if (!scheduled) {
                  continue;
                }
                const scheduledMoment = moment(scheduled, acceptedDateFormats, true);
                if (!scheduledMoment.isValid()) {
                  continue;
                }
                if (scheduledMoment.format(dateFormat) !== dateOnly) {
                  continue;
                }
              }

              taskLineNumber = i;
              break;
            }

            if (taskLineNumber === -1) {
              vscode.window.showErrorMessage(`Unable to find task to update: ${taskText}`);
              return;
            }

            const workspaceEdit = new vscode.WorkspaceEdit();
            const currentLine = document.lineAt(taskLineNumber);
            const nextLine = taskLineNumber + 1 < document.lineCount ? document.lineAt(taskLineNumber + 1) : null;
            const nextNextLine = taskLineNumber + 2 < document.lineCount ? document.lineAt(taskLineNumber + 2) : null;

            const currentStatusMatch = currentLine.text.match(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/);
            const currentStatus = currentStatusMatch ? currentStatusMatch[1] : null;

            const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
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
            const newHeadlineOnly = taskKeywordManager.buildTaskLine(indent, newStatus, cleanedHeadline, { headingMarkerStyle, starPrefix });

            const planningIndent = `${indent}  `;
            const planningFromHead = parsePlanningFromText(currentLine.text);
            const planningFromNext = (nextLine && isPlanningLine(nextLine.text)) ? parsePlanningFromText(nextLine.text) : {};
            const planningFromNextNext = (nextNextLine && isPlanningLine(nextNextLine.text)) ? parsePlanningFromText(nextNextLine.text) : {};

            const mergedPlanning = {
              scheduled: planningFromNext.scheduled || planningFromHead.scheduled || null,
              deadline: planningFromNext.deadline || planningFromHead.deadline || null,
              closed: planningFromNext.closed || planningFromHead.closed || planningFromNextNext.closed || null
            };

            if (newStatus === "DONE") {
              mergedPlanning.closed = moment().format(`${dateFormat} ddd HH:mm`);
            } else if (currentStatus === "DONE" && removeClosed) {
              mergedPlanning.closed = null;
            }

            function buildPlanningBody(p) {
              const segs = [];
              if (p.scheduled) segs.push(`SCHEDULED: [${p.scheduled}]`);
              if (p.deadline) segs.push(`DEADLINE: [${p.deadline}]`);
              if (p.closed) segs.push(`CLOSED: [${p.closed}]`);
              return segs.join("  ");
            }

            const planningBody = buildPlanningBody(mergedPlanning);

            // Handle CONTINUED transitions (same logic as Ctrl+Left/Right)
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
                if (nextNextLine && isPlanningLine(nextNextLine.text)) {
                  workspaceEdit.delete(uri, nextNextLine.rangeIncludingLineBreak);
                }
                workspaceEdit.insert(uri, currentLine.range.end, `\n${planningIndent}${planningBody}`);
              }
            } else {
              if (nextLine && isPlanningLine(nextLine.text)) {
                workspaceEdit.delete(uri, nextLine.rangeIncludingLineBreak);
              } else if (nextNextLine && isPlanningLine(nextNextLine.text) && (nextNextLine.text.includes("CLOSED") || nextNextLine.text.includes("COMPLETED"))) {
                workspaceEdit.delete(uri, nextNextLine.rangeIncludingLineBreak);
              }
            }

            vscode.workspace.applyEdit(workspaceEdit).then(applied => {
              if (!applied) {
                vscode.window.showErrorMessage("Unable to apply task update.");
                return;
              }
              suppressReloadForFsPath = uri.fsPath;
              document.save().then(() => {
                vscode.window.showInformationMessage(`Updated: ${taskText} -> ${newStatus}`);
              });
            });
          });
        } else if (message.command === "toggleCheckbox") {
          const fileName = String(message.file || "");
          const lineNumber = Number(message.lineNumber);
          if (!fileName || !Number.isFinite(lineNumber)) {
            return;
          }

          const filePath = path.join(setMainDir(), fileName);
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
              suppressReloadForFsPath = uri.fsPath;
              document.save();
            });
          });
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
        .checkbox-stats {
          padding-left: 10px;
          font-weight: 700;
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
        .deadline{
          padding-left: 10px;
          padding-right: 10px;
          padding-top: 5px;
          font-weight: 700;
          border-radius: 27px;
          font-size: 9px;
          height: 15px;
          float: right;
          margin-left: 10px;
          margin-top: 10px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
        }
        .deadline-overdue{
          background-color: #dc3545;
          color: #ffffff;
          animation: pulse 1s infinite;
        }
        .deadline-today{
          background-color: #ff6b35;
          color: #ffffff;
        }
        .deadline-soon{
          background-color: #ffc107;
          color: #333333;
        }
        .deadline-future{
          background-color: #6c757d;
          color: #ffffff;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
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
        .children-block pre {
          margin: 6px 0 0 0;
          font-size: 13px;
          color: #000;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          word-break: break-word;
          max-width: 100%;
          box-sizing: border-box;
          overflow-x: auto;
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

        .detail-line.checkbox-line {
          display: block;
        }

        .org-checkbox {
          vertical-align: middle;
        }

        #file-bubbles {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 8px 0 12px 0;
          border-bottom: 1px solid rgba(0,0,0,0.1);
          margin-bottom: 8px;
        }

        .file-chip {
          display: inline-flex;
          align-items: center;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          user-select: none;
          border: 1px solid rgba(0,0,0,0.15);
          background: #f3f3f3;
          color: #111;
        }

        .file-chip.selected {
          background: #2f6999;
          color: #fff;
          border-color: #2f6999;
        }

        .filtered-out {
          display: none !important;
        }
        </style>
        <body>

        <h1>Agenda View</h1>
        <div id="file-bubbles" aria-label="File filter"></div>
        <div id="display-agenda">
        ${itemInSortedObject}
        </div>      
        <script>
        const vscode = acquireVsCodeApi();
        const dateFormat = "${dateFormat}";

        function getAllFilesFromDom() {
          const els = Array.from(document.querySelectorAll('.filename[data-file]'));
          const files = Array.from(new Set(els.map(e => e.dataset.file).filter(Boolean)));
          files.sort((a, b) => a.localeCompare(b));
          return files;
        }

        function buildFileChips(files) {
          const container = document.getElementById('file-bubbles');
          if (!container) return;

          container.innerHTML = '';

          const state = vscode.getState && vscode.getState();
          const initial = state && typeof state.selectedFile === 'string' ? state.selectedFile : '';

          const makeChip = (label, value) => {
            const chip = document.createElement('div');
            chip.className = 'file-chip';
            chip.textContent = label;
            chip.dataset.file = value;
            chip.addEventListener('click', () => {
              const selected = chip.dataset.file || '';
              applyFileFilter(selected);
              if (vscode.setState) {
                vscode.setState({ selectedFile: selected });
              }
            });
            return chip;
          };

          container.appendChild(makeChip('All files', ''));
          for (const f of files) {
            container.appendChild(makeChip(f, f));
          }

          applyFileFilter(initial);
        }

        function applyFileFilter(selectedFile) {
          const chips = Array.from(document.querySelectorAll('.file-chip'));
          chips.forEach(c => {
            const v = c.dataset.file || '';
            if (v === (selectedFile || '')) c.classList.add('selected');
            else c.classList.remove('selected');
          });

          const panels = Array.from(document.querySelectorAll('.panel'));
          panels.forEach(p => {
            const fileEl = p.querySelector('.filename[data-file]');
            const file = fileEl ? fileEl.dataset.file : '';
            const match = !selectedFile || file === selectedFile;
            if (match) p.classList.remove('filtered-out');
            else p.classList.add('filtered-out');
          });

          // Hide day headings when no visible panels remain for that date.
          const headingDivs = Array.from(document.querySelectorAll('div'))
            .filter(d => Array.from(d.classList).some(c => c && c.startsWith('heading')));

          headingDivs.forEach(h => {
            const classes = Array.from(h.classList);
            const dateClass = classes.find(c => c && c.startsWith('[') && c.endsWith(']'));
            if (!dateClass) return;
            const relatedPanels = panels.filter(p => p.classList.contains(dateClass));
            const anyVisible = relatedPanels.some(p => !p.classList.contains('filtered-out'));
            if (anyVisible) h.classList.remove('filtered-out');
            else h.classList.add('filtered-out');
          });
        }

        // Load moment via CDN for formatting
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js";
        script.onload = () => {
          buildFileChips(getAllFilesFromDom());

          // Initialize indeterminate display for partial checkboxes.
          Array.from(document.querySelectorAll('input.org-checkbox[data-state="partial"]'))
            .forEach(i => { try { i.indeterminate = true; } catch (e) {} });

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

              // Toggle clicked item and its descendant subtree in the DOM.
              const baseIndent = getIndent(input);
              const end = subtreeEndIndex(idx);
              let hasDesc = false;
              for (let i = idx + 1; i < end; i++) {
                if (getIndent(inputs[i]) > baseIndent) { hasDesc = true; break; }
              }

              const currentlyChecked = !!input.checked;
              const desiredChecked = currentlyChecked ? false : true;

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

              // Recompute parent checkbox states bottom-up.
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

              // Update checkbox stats badge in the panel, if present.
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

              // Persist the change back to the source file.
              vscode.postMessage({
                command: 'toggleCheckbox',
                file: input.dataset.file,
                lineNumber: Number(input.dataset.line)
              });

              return;
            }

            let class0 = event.srcElement.classList[0];
            let class1 = event.srcElement.classList[1];
            let panels = document.getElementsByClassName('panel');

            // Show or hide panels
            if (!event.srcElement.classList.contains('panel')) {
              for (let i = 0; i < panels.length; i++) {
                if (panels[i].classList.contains(class0) || panels[i].classList.contains(class1)) {
                  // Respect file filtering
                  if (!panels[i].classList.contains('filtered-out')) {
                    panels[i].style.display = panels[i].style.display === 'block' ? 'none' : 'block';
                  }
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
              let nextStatus = statuses[(currentIndex + 1) % statuses.length];
              event.target.innerText = nextStatus;

              event.srcElement.classList.remove(currentStatus.toLowerCase());
              event.srcElement.classList.add(nextStatus.toLowerCase());

              // Ensure proper styling by keeping the class structure consistent
              event.srcElement.classList.remove("todo", "in_progress", "continued", "done", "abandoned");
              event.srcElement.classList.add(nextStatus.toLowerCase());

              let safeText = (event.target.dataset.text || "").replaceAll(",", "&#44;");
              let safeDate = (event.target.dataset.date || "").replaceAll(",", "&#44;");
              let messageText = nextStatus + "," + event.target.dataset.filename + "," + safeText + "," + safeDate;

              if (nextStatus === "DONE") {
                let completedDate = moment();
                let formattedDate = completedDate.format(dateFormat + " ddd HH:mm");
                messageText += ",CLOSED: [" + formattedDate + "]";
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
        };
        document.head.appendChild(script);
        </script>
        </body>
</html>`;
        }
    });
};
//# sourceMappingURL=agenda.js.map