"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const moment = require("moment");
const taskKeywordManager = require("../taskKeywordManager");
const { applyAutoMoveDoneWithResult } = require("../doneTaskAutoMove");
const continuedTaskHandler = require("../continuedTaskHandler");
const path = require("path");
const { stripAllTagSyntax, getPlanningForHeading, isPlanningLine, parsePlanningFromText, normalizeTagsAfterPlanning, getAcceptedDateFormats, DEADLINE_REGEX, stripInlinePlanning, momentFromTimestampContent, extractPlainTimestamps } = require("../orgTagUtils");
const { applyRepeatersOnCompletion } = require("../repeatedTasks");
const { computeLogbookInsertion, formatStateChangeEntry } = require("../orgLogbook");
const { formatCheckboxStats, findCheckboxCookie, computeHierarchicalCheckboxStatsInRange } = require("../checkboxStats");
const { computeCheckboxToggleEdits } = require("../checkboxToggle");
const { normalizeBodyIndentation } = require("../indentUtils");
const { html, escapeText } = require("../htmlUtils");

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHeadingStartRegex(registry) {
  const markers = (registry?.states || [])
    .map((s) => s.marker)
    .filter((m) => typeof m === "string" && m.length > 0);
  const unique = Array.from(new Set(markers));
  const markerAlt = unique.map(escapeRegExp).join("|");
  const parts = ["\\*+"];
  if (markerAlt) parts.push(`(?:${markerAlt})`);
  return new RegExp(`^\\s*(?:${parts.join("|")})`);
}

function getKeywordBucket(keyword, registry) {
  const k = String(keyword || "").trim().toUpperCase();
  if (!k) return "todo";
  if (registry?.isDoneLike && registry.isDoneLike(k)) {
    return registry.stampsClosed && registry.stampsClosed(k) ? "done" : "abandoned";
  }
  if (registry?.triggersForward && registry.triggersForward(k)) return "continued";
  const cycle = registry?.getCycleKeywords ? registry.getCycleKeywords() : [];
  if (cycle.length && k === cycle[0]) return "todo";
  return "in_progress";
}

module.exports = function () {
  vscode.commands.executeCommand("workbench.action.files.save").then(() => {
  let config = vscode.workspace.getConfiguration("Org-vscode");
    let folderPath = config.get("folderPath");
    let dateFormat = config.get("dateFormat", "YYYY-MM-DD");
    const agendaIncludeDeadlines = config.get("agendaIncludeDeadlines", true);
    const agendaIncludeUndated = config.get("agendaIncludeUndated", true);
    let acceptedDateFormats = getAcceptedDateFormats(dateFormat);
    const registry = taskKeywordManager.getWorkflowRegistry();
    const headingStartRegex = buildHeadingStartRegex(registry);
    const cycleKeywords = registry.getCycleKeywords();
    const keywordToBucket = Object.fromEntries(cycleKeywords.map((k) => [k, getKeywordBucket(k, registry)]));
    const bucketClasses = ["todo", "in_progress", "continued", "done", "abandoned"];
    const stampsClosedKeywords = cycleKeywords.filter((k) => registry.stampsClosed(k));
    let folder;
    let taskText;
    let taskKeywordMatch = "";
    let getDateFromTaskText;
    let convertedDateArray = [];
    let unsortedObject = {};
    let sortedObject = {};
    let itemInSortedObject = "";
    let unsortedClosedObject = {};
    let sortedClosedObject = {};
    let itemInClosedSortedObject = "";

    readFiles();

    function computeCheckboxStatsFromLines(lines) {
      const arr = Array.isArray(lines) ? lines : [];
      const textLines = arr.map(l => (l && typeof l === 'object' && 'text' in l) ? String(l.text || '') : String(l || ''));
      const stats = computeHierarchicalCheckboxStatsInRange(textLines, 0, textLines.length, -1);
      return { total: stats.total, checked: stats.checked };
    }

    function escapeLeadingSpaces(s) {
      const str = String(s || "");
      const m = str.match(/^(\s*)/);
      const lead = m ? m[1] : "";
      const rest = str.slice(lead.length);
      // Use actual non-breaking space (U+00A0) instead of &nbsp; entity
      const leadEsc = lead.replace(/ /g, "\u00A0").replace(/\t/g, "\u00A0\u00A0");
      return leadEsc + rest;
    }

    function getLatestCompletionMoment({ planning, childrenText, acceptedDateFormats, workflowRegistry } = {}) {
      const registry = workflowRegistry;
      const formats = Array.isArray(acceptedDateFormats) ? acceptedDateFormats : [];
      const lines = Array.isArray(childrenText) ? childrenText : [];
      let best = null;

      const pushCandidate = (m) => {
        if (!m || !m.isValid || !m.isValid()) return;
        if (!best || m.valueOf() > best.valueOf()) best = m;
      };

      if (planning && planning.closed) {
        pushCandidate(momentFromTimestampContent(planning.closed, formats, true));
      }

      for (const line of lines) {
        const p = parsePlanningFromText(line);
        if (p && p.closed) {
          pushCandidate(momentFromTimestampContent(p.closed, formats, true));
        }
      }

      // Example: - State "DONE" from "TODO" [2026-01-16 Fri 13:00]
      const stateRe = /\bState\s+"([^"]+)"(?:\s+from\s+"[^"]+")?\s+\[([^\]]+)\]/i;
      for (const line of lines) {
        const m = String(line || "").match(stateRe);
        if (!m) continue;
        const toKeyword = String(m[1] || "").trim().toUpperCase();
        const ts = String(m[2] || "").trim();
        if (!toKeyword || !ts) continue;
        if (registry && registry.isDoneLike && !registry.isDoneLike(toKeyword)) continue;
        if (registry && registry.stampsClosed && !registry.stampsClosed(toKeyword)) continue;
        pushCandidate(momentFromTimestampContent(ts, formats, true));
      }

      return best;
    }

    function renderChildrenBlock(children, fileName, headingLineNumber) {
      const arr = Array.isArray(children) ? children : [];
      if (!arr.length) return "";

      const linesHtml = arr.map((c) => {
        const text = c && typeof c === 'object' ? String(c.text || '') : String(c || '');
        const lineNumber = c && typeof c === 'object' ? Number(c.lineNumber) : NaN;

        // Render child task headings as mini task rows.
        const keyword = taskKeywordManager.findTaskKeyword(text);
        const isHeading = /^\s*\*+\s+/.test(text);
        if (keyword && isHeading) {
          const safeLine = Number.isFinite(lineNumber) ? String(lineNumber) : "";
          const normalizedHeadline = stripInlinePlanning(normalizeTagsAfterPlanning(text));
          const childTaskText = taskKeywordManager.cleanTaskText(stripAllTagSyntax(normalizedHeadline)).trim();
          const bucket = getKeywordBucket(keyword, registry);
          const indent = text.match(/^(\s*)/)?.[1] || "";
          const indentSpan = indent ? html`<span class="subtask-indent">${escapeLeadingSpaces(indent)}</span>` : "";
          const keywordSpan = html`<span class=${bucket} data-filename=${fileName} data-text=${childTaskText} data-date="" data-line=${safeLine}>${keyword}</span>`;
          const taskTextSpan = html`<span class="taskText agenda-task-link" data-file=${fileName} data-line=${safeLine} data-text=${childTaskText} data-date="">${childTaskText}</span>`;
          return html`<div class="detail-line subtask-line">${indentSpan}${keywordSpan}${taskTextSpan}</div>`;
        }

        const m = text.match(/^(\s*)([-+*]|\d+[.)])\s+\[( |x|X|-)\]\s+(.*)$/);
        if (!m) {
          return html`<div class="detail-line">${escapeLeadingSpaces(text)}</div>`;
        }

        const indentLen = (m[1] || "").length;
        const bullet = escapeLeadingSpaces((m[1] || "") + (m[2] || "-"));
        const state = String(m[3] || " ");
        const rest = m[4] || "";
        const isChecked = state.toLowerCase() === "x";
        const isPartial = state === "-";
        const safeLine = Number.isFinite(lineNumber) ? String(lineNumber) : "";
        const checkboxInput = html`<input class="org-checkbox" type="checkbox" data-file=${fileName} data-line=${safeLine} data-indent=${String(indentLen)} data-state=${isPartial ? "partial" : null} checked=${isChecked}/>`;
        const restSpan = html`<span class="checkbox-text agenda-task-link" data-file=${fileName} data-line=${safeLine} data-text=${rest} data-date="">${rest}</span>`;
        return html`<div class="detail-line checkbox-line subtask-line">${bullet} ${checkboxInput} ${restSpan}</div>`;
      });

      const keyLine = Number.isFinite(Number(headingLineNumber)) ? String(Number(headingLineNumber)) : "";
      const detailsKey = keyLine ? `${fileName}:${keyLine}` : "";
      return html`<details class="children-block" data-details-key=${detailsKey}><summary>Show Details</summary><div class="children-lines">${linesHtml}</div></details>`;
    }

    // Reads all .org files and builds agenda view HTML blocks grouped by scheduled date
    function readFiles() {
      const dirPath = setMainDir();
      fs.readdir(dirPath, (err, items) => {
        if (err) {
          vscode.window.showErrorMessage(`Error reading org directory: ${err.message}`);
          return;
        }

        function getSortTimestampFromAgendaKey(key) {
          const dateMatch = key.match(/\[(\d{2,4}-\d{2}-\d{2,4})\]/);
          if (!dateMatch) {
            return null;
          }
          const parsed = moment(dateMatch[1], acceptedDateFormats, true);
          return parsed.isValid() ? parsed.valueOf() : null;
        }

        const skippedFiles = [];

        for (let i = 0; i < items.length; i++) {
          if (items[i].endsWith(".org") && !items[i].startsWith(".") && items[i] !== "CurrentTasks.org") {

            // Read the contents of the .org file
            const fullPath = path.join(dirPath, items[i]);
            let fileText;
            try {
              fileText = fs.readFileSync(fullPath).toString().split(/\r?\n/);
            } catch (fileErr) {
              skippedFiles.push({ file: items[i], reason: fileErr.message });
              continue;
            }

            // Iterate through lines to find scheduled, non-completed tasks (only TODO and IN_PROGRESS)
            // Track current heading for plain timestamps in body text
            let currentHeadingText = null;   // For display
            let currentHeadingLine = 0;      // Line number of current heading
            let seenFirstHeading = false;    // Skip timestamps before first heading

            for (let j = 0; j < fileText.length; j++) {
              const element = fileText[j];

              // Track current heading for plain timestamp display
              if (headingStartRegex.test(element)) {
                seenFirstHeading = true;
                const normalizedHeadline = stripInlinePlanning(normalizeTagsAfterPlanning(element));
                currentHeadingText = taskKeywordManager.cleanTaskText(stripAllTagSyntax(normalizedHeadline)).trim();
                currentHeadingLine = j + 1;
              }

              // Only show visible agenda tasks (filtering is per-workflow state)
              const planning = getPlanningForHeading(fileText, j);
              const status = taskKeywordManager.findTaskKeyword(element);
              const state = status ? (registry.states || []).find((s) => s.keyword === status) : null;
              const agendaVis = state && state.agendaVisibility ? state.agendaVisibility : "show";
              const isVisibleAgendaTask = Boolean(status && agendaVis === "show" && headingStartRegex.test(element));
              const isTaskHeading = Boolean(status && headingStartRegex.test(element));

              // Capture indented child lines once; used for both agenda rendering and completion parsing.
              let children = [];
              let deadlineFromChildren = null;
              if (isTaskHeading) {
                const baseIndent = element.match(/^\s*/)?.[0] || "";
                for (let k = j + 1; k < fileText.length; k++) {
                  const nextLine = fileText[k];
                  const nextIndent = nextLine.match(/^\s*/)?.[0] || "";
                  if (nextIndent.length > baseIndent.length) {
                    children.push({ text: nextLine, lineNumber: k + 1 });
                    if (!deadlineFromChildren) {
                      const p = parsePlanningFromText(nextLine);
                      if (p && p.deadline) {
                        deadlineFromChildren = p.deadline;
                      }
                    }
                  } else {
                    break;
                  }
                }
              }

              // Closed view: group tasks by latest completion date.
              if (isTaskHeading) {
                const childrenText = children.map((c) => String(c && typeof c === 'object' ? (c.text || '') : c || ''));
                const closedMoment = getLatestCompletionMoment({
                  planning,
                  childrenText,
                  acceptedDateFormats,
                  workflowRegistry: registry
                });

                if (closedMoment) {
                  const formattedClosedDate = closedMoment.format(dateFormat);
                  const closedDayName = closedMoment.format("dddd");
                  const cleanClosedDate = `[${formattedClosedDate}]`;

                  const normalizedHeadline = stripInlinePlanning(normalizeTagsAfterPlanning(element));
                  const closedTaskText = taskKeywordManager.cleanTaskText(stripAllTagSyntax(normalizedHeadline)).trim();
                  const taskLineNumber = j + 1;

                  const childrenBlock = renderChildrenBlock(children, items[i], taskLineNumber);
                  const checkboxStats = computeCheckboxStatsFromLines(children);
                  const cookie = findCheckboxCookie(element);
                  const checkboxBadge = (cookie && checkboxStats.total >= 0)
                    ? html`<span class="checkbox-stats">${formatCheckboxStats({ checked: checkboxStats.checked, total: checkboxStats.total }, cookie.mode)}</span>`
                    : "";

                  const dateAttrForReveal = cleanClosedDate;
                  const filenameSpan = html`<span class="filename" data-file=${items[i]} data-line=${String(taskLineNumber)} data-text=${closedTaskText} data-date=${dateAttrForReveal}>${items[i]}:</span>`;
                  const taskTextSpan = html`<span class="taskText agenda-task-link" data-file=${items[i]} data-line=${String(taskLineNumber)} data-text=${closedTaskText} data-date=${dateAttrForReveal}>${closedTaskText}</span>`;

                  let renderedTask = "";
                  if (status) {
                    const bucket = getKeywordBucket(status, registry);
                    const keywordSpan = html`<span class=${bucket} data-filename=${items[i]} data-text=${closedTaskText} data-date=${cleanClosedDate} data-line=${String(taskLineNumber)}>${status}</span>`;
                    renderedTask = html`<>${filenameSpan} ${keywordSpan}${taskTextSpan}${checkboxBadge}<span class="closedTag">CLOSED</span></>`;
                  } else {
                    renderedTask = html`<>${filenameSpan} ${taskTextSpan}${checkboxBadge}<span class="closedTag">CLOSED</span></>`;
                  }

                  const dateDiv = html`<div class=${"heading" + closedDayName + " " + cleanClosedDate}><h4 class=${cleanClosedDate}>${cleanClosedDate}, ${closedDayName.toUpperCase()}</h4></div>`;
                  const textDiv = html`<div class=${"panel " + cleanClosedDate} data-item-date=${formattedClosedDate} data-closed-date=${formattedClosedDate} data-scheduled-date="" data-deadline-date="">${renderedTask}${childrenBlock}</div>`;

                  if (!unsortedClosedObject[dateDiv]) {
                    unsortedClosedObject[dateDiv] = "  " + textDiv;
                  } else {
                    unsortedClosedObject[dateDiv] += "  " + textDiv;
                  }
                }
              }
              
              if (isVisibleAgendaTask) {
                
                // Prefer planning-parsed deadline for the task; fallback to deadlines found in child lines.
                const deadlineStr = (planning && planning.deadline) ? planning.deadline : deadlineFromChildren;

                const hasScheduled = Boolean(planning && planning.scheduled);
                const hasDeadline = Boolean(deadlineStr);
                const isUndated = !hasScheduled && !hasDeadline;
                const shouldInclude = hasScheduled || (agendaIncludeDeadlines && hasDeadline) || (agendaIncludeUndated && isUndated);

                // Extract core task text and agenda date (scheduled preferred; else deadline)
                const taskTextMatch = element;
                const agendaDateContent = hasScheduled ? planning.scheduled : (hasDeadline ? deadlineStr : null);
                getDateFromTaskText = agendaDateContent ? [null, agendaDateContent] : null;

                if (shouldInclude && taskTextMatch) {
                  taskKeywordMatch = status;

                  const normalizedHeadline = stripInlinePlanning(normalizeTagsAfterPlanning(taskTextMatch));
                  taskText = taskKeywordManager.cleanTaskText(stripAllTagSyntax(normalizedHeadline)).trim();

                  const undatedClass = "[UNDATED]";
                  let scheduledMoment = null;
                  let formattedDate = "";
                  let nameOfDay = "";
                  let cleanDate = "";
                  if (getDateFromTaskText) {
                    // Format the task's agenda date for grouping and display
                    scheduledMoment = momentFromTimestampContent(getDateFromTaskText[1], acceptedDateFormats, true);
                    if (!scheduledMoment.isValid()) {
                      continue;
                    }
                    formattedDate = scheduledMoment.format(dateFormat);
                    nameOfDay = scheduledMoment.format("dddd");
                    cleanDate = `[${formattedDate}]`;
                  }

                  // Create collapsible child block (if child lines exist)
                  // NOTE: computed after taskLineNumber so we can attach a stable details key.

                  const checkboxStats = computeCheckboxStatsFromLines(children);
                  const cookie = findCheckboxCookie(element);
                  const checkboxBadge = (cookie && checkboxStats.total >= 0)
                    ? html`<span class="checkbox-stats">${formatCheckboxStats({ checked: checkboxStats.checked, total: checkboxStats.total }, cookie.mode)}</span>`
                    : "";

                  // Build deadline warning badge if task has a deadline
                  let deadlineBadge = "";
                  if (deadlineStr) {
                    const deadlineDate = momentFromTimestampContent(deadlineStr, acceptedDateFormats, true);
                    if (!deadlineDate.isValid()) {
                      // Avoid rendering "Invalid date" in the UI.
                      deadlineBadge = "";
                    } else {
                    const today = moment().startOf("day");
                    const daysUntil = deadlineDate.diff(today, "days");

                    if (daysUntil < 0) {
                      deadlineBadge = html`<span class="deadline deadline-overdue">⚠ OVERDUE: ${deadlineDate.format("MMM Do")}</span>`;
                    } else if (daysUntil === 0) {
                      deadlineBadge = html`<span class="deadline deadline-today">⚠ DUE TODAY</span>`;
                    } else if (daysUntil <= 3) {
                      deadlineBadge = html`<span class="deadline deadline-soon">⏰ Due in ${daysUntil} day${daysUntil > 1 ? 's' : ''}</span>`;
                    } else {
                      deadlineBadge = html`<span class="deadline deadline-future">📅 Due: ${deadlineDate.format("MMM Do")}</span>`;
                    }
                    }
                  }

                  // Build HTML task entry
                  let renderedTask = "";
                  const taskLineNumber = j + 1;
                  let childrenBlock = renderChildrenBlock(children, items[i], taskLineNumber);
                  const dateAttrForReveal = getDateFromTaskText ? cleanDate : undatedClass;
                  const filenameSpan = html`<span class="filename" data-file=${items[i]} data-line=${String(taskLineNumber)} data-text=${taskText} data-date=${dateAttrForReveal}>${items[i]}:</span>`;
                  const taskTextSpan = html`<span class="taskText agenda-task-link" data-file=${items[i]} data-line=${String(taskLineNumber)} data-text=${taskText} data-date=${dateAttrForReveal}>${taskText}</span>`;
                  const planningLabelSpan = hasScheduled
                    ? html`<span class="scheduled">SCHEDULED</span>`
                    : (hasDeadline ? html`<span class="deadlineTag">DEADLINE</span>` : html`<span class="undatedTag">UNDATED</span>`);
                  if (taskKeywordMatch) {
                    const bucket = getKeywordBucket(taskKeywordMatch, registry);
                    const dateAttr = getDateFromTaskText ? cleanDate : "";
                    const keywordSpan = html`<span class=${bucket} data-filename=${items[i]} data-text=${taskText} data-date=${dateAttr} data-line=${String(taskLineNumber)}>${taskKeywordMatch}</span>`;
                    renderedTask = html`<>${filenameSpan} ${keywordSpan}${taskTextSpan}${checkboxBadge}${planningLabelSpan}${deadlineBadge}</>`;
                  } else {
                    renderedTask = html`<>${filenameSpan} ${taskTextSpan}${checkboxBadge}${planningLabelSpan}${deadlineBadge}</>`;
                  }

                  // Clear the current date array and group task appropriately by date
                  convertedDateArray = [];

                  if (!getDateFromTaskText) {
                    const dateDiv = html`<div class=${"headingUndated " + undatedClass}><h4 class=${undatedClass}>${undatedClass}, UNDATED</h4></div>`;
                    const textDiv = html`<div class=${"panel " + undatedClass} data-item-date="" data-scheduled-date="" data-deadline-date="">${renderedTask}${childrenBlock}</div>`;
                    convertedDateArray.push({ date: dateDiv, text: textDiv });
                  } else {
                    // If task is today or future
                    if (scheduledMoment.isSameOrAfter(moment().startOf("day"), "day")) {
                      const itemDateOnly = scheduledMoment.format(dateFormat);
                      const scheduledDateOnly = hasScheduled ? scheduledMoment.format(dateFormat) : "";
                      let deadlineDateOnly = "";
                      if (deadlineStr) {
                        const dm = momentFromTimestampContent(deadlineStr, acceptedDateFormats, true);
                        if (dm.isValid()) deadlineDateOnly = dm.format(dateFormat);
                      }
                      const dateDiv = html`<div class=${"heading" + nameOfDay + " " + cleanDate}><h4 class=${cleanDate}>${cleanDate}, ${nameOfDay.toUpperCase()}</h4></div>`;
                      const textDiv = html`<div class=${"panel " + cleanDate} data-item-date=${itemDateOnly} data-scheduled-date=${scheduledDateOnly} data-deadline-date=${deadlineDateOnly}>${renderedTask}${childrenBlock}</div>`;
                      convertedDateArray.push({ date: dateDiv, text: textDiv });
                    } else {
                      // If task is overdue
                      let today = moment().format(dateFormat);
                      let overdue = moment().format("dddd");

                      if (scheduledMoment.isBefore(moment().startOf("day"), "day")) {
                        const todayClass = "[" + today + "]";
                        const lateDate = momentFromTimestampContent(getDateFromTaskText[1], acceptedDateFormats, true).format(dateFormat);
                        const itemDateOnly = lateDate;
                        const scheduledDateOnly = hasScheduled ? lateDate : "";
                        let deadlineDateOnly = "";
                        if (deadlineStr) {
                          const dm = momentFromTimestampContent(deadlineStr, acceptedDateFormats, true);
                          if (dm.isValid()) deadlineDateOnly = dm.format(dateFormat);
                        }
                        const lateBadge = hasScheduled
                          ? html`<span class="late">LATE: ${lateDate}</span>`
                          : html`<span class="late">DEADLINE: ${lateDate}</span>`;
                        const dateDiv = html`<div class=${"heading" + overdue + " " + todayClass}><h4 class=${todayClass}>${todayClass}, ${overdue.toUpperCase()}</h4></div>`;
                        const textDiv = html`<div class=${"panel " + todayClass} data-item-date=${itemDateOnly} data-scheduled-date=${scheduledDateOnly} data-deadline-date=${deadlineDateOnly}>${renderedTask}${lateBadge}${childrenBlock}</div>`;
                        convertedDateArray.push({ date: dateDiv, text: textDiv });
                      }
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

              // Plain timestamps - scan all lines after first heading
              if (seenFirstHeading) {
                const plainTimestamps = extractPlainTimestamps(element);
                for (const ts of plainTimestamps) {
                  // Only active timestamps <...> appear in agenda
                  if (ts.bracket !== '<') continue;

                  const parsedDate = moment(ts.date, acceptedDateFormats, true);
                  if (!parsedDate.isValid()) continue;

                  const timestampLineNumber = j + 1;  // Click jumps to timestamp line
                  const displayText = currentHeadingText || element.trim();
                  const filename = items[i];
                  const formattedDate = parsedDate.format(dateFormat);
                  const nameOfDay = parsedDate.format("dddd");
                  const cleanDate = "[" + formattedDate + "]";

                  const filenameSpan = html`<span class="filename" data-file=${filename} data-line=${String(timestampLineNumber)} data-text=${displayText} data-date=${cleanDate}>${filename}:</span>`;
                  const taskTextSpan = html`<span class="taskText agenda-task-link" data-file=${filename} data-line=${String(timestampLineNumber)} data-text=${displayText} data-date=${cleanDate}>${displayText}</span>`;
                  const renderedTask = html`<>${filenameSpan} ${taskTextSpan}<span class="timestamp-marker"></span></>`;

                  const dateKey = html`<div class=${"heading" + nameOfDay + " " + cleanDate}><h4 class=${cleanDate}>${cleanDate}, ${nameOfDay.toUpperCase()}</h4></div>`;
                  const panelHtml = html`<div class=${"panel " + cleanDate} data-item-date=${formattedDate} data-scheduled-date=${formattedDate} data-deadline-date="">${renderedTask}</div>`;
                  if (!unsortedObject[dateKey]) {
                    unsortedObject[dateKey] = "  " + panelHtml;
                  } else {
                    unsortedObject[dateKey] += "  " + panelHtml;
                  }
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

        // Sort closed items by completion date (most recent first)
        Object.keys(unsortedClosedObject)
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
            return tsB - tsA;
          })
          .forEach(key => {
            sortedClosedObject[key] = unsortedClosedObject[key];
          });

        Object.keys(sortedClosedObject).forEach(property => {
          itemInClosedSortedObject += property + sortedClosedObject[property] + "</br>";
        });

        createWebview(skippedFiles);
      });
    }

    function setMainDir() {
      let config = vscode.workspace.getConfiguration("Org-vscode");
      let folderPath = config.get("folderPath");
      return (folderPath && folderPath.trim() !== "")
        ? folderPath
        : path.join(os.homedir(), "VSOrgFiles");
    }

    function createWebview(skippedFiles) {
      let reload = false;
      let suppressReloadForFsPath = null;
      let fullAgendaView = vscode.window.createWebviewPanel("fullAgenda", "Full Agenda View", vscode.ViewColumn.Beside, { enableScripts: true });
      fullAgendaView.webview.html = getWebviewContent(sortedObject, skippedFiles);

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
        } else if (message.command === "revealTask") {
          const fileName = String(message.file || "");
          const lineNumber = Number(message.lineNumber);
          const taskTextForReveal = String(message.taskText || "").trim();
          const dateForReveal = String(message.date || "").trim();
          if (!fileName || !Number.isFinite(lineNumber) || lineNumber < 1) {
            return;
          }

          const fullPath = path.join(setMainDir(), fileName);
          const uri = vscode.Uri.file(fullPath);
          vscode.workspace.openTextDocument(uri).then(doc => {
            const lines = doc.getText().split(/\r?\n/);

            function normalizeHeadlineToTitle(headline) {
              return taskKeywordManager.cleanTaskText(
                stripAllTagSyntax(normalizeTagsAfterPlanning(headline))
              ).trim();
            }

            function normalizeDateOnly(s) {
              const str = String(s || "");
              const m = str.match(/(\d{4}-\d{2}-\d{2})/);
              return m ? m[1] : "";
            }

            const dateOnly = normalizeDateOnly(dateForReveal);

            function matchesDateAtHeading(idx) {
              if (!dateOnly) return true;
              const planning = getPlanningForHeading(lines, idx);
              const scheduled = planning && planning.scheduled ? normalizeDateOnly(planning.scheduled) : "";
              const deadline = planning && planning.deadline ? normalizeDateOnly(planning.deadline) : "";
              const closed = planning && planning.closed ? normalizeDateOnly(planning.closed) : "";
              return scheduled === dateOnly || deadline === dateOnly || closed === dateOnly;
            }

            let resolvedLine = null;
            const requestedIdx = Number.isFinite(lineNumber) ? (lineNumber - 1) : -1;
            if (requestedIdx >= 0 && requestedIdx < doc.lineCount) {
              const candidateText = doc.lineAt(requestedIdx).text;
              const candidateKeyword = taskKeywordManager.findTaskKeyword(candidateText);
              const candidateIsHeading = headingStartRegex.test(candidateText);
              const candidateNorm = normalizeHeadlineToTitle(candidateText);
              if (candidateKeyword && candidateIsHeading && (!taskTextForReveal || candidateNorm === taskTextForReveal) && matchesDateAtHeading(requestedIdx)) {
                resolvedLine = requestedIdx;
              }
            }

            if (resolvedLine === null && taskTextForReveal) {
              for (let i = 0; i < doc.lineCount; i++) {
                const lineText = doc.lineAt(i).text;
                const keyword = taskKeywordManager.findTaskKeyword(lineText);
                const isHeading = headingStartRegex.test(lineText);
                if (!keyword || !isHeading) continue;
                const norm = normalizeHeadlineToTitle(lineText);
                if (norm !== taskTextForReveal) continue;
                if (!matchesDateAtHeading(i)) continue;
                resolvedLine = i;
                break;
              }
            }

            const targetLine = (resolvedLine !== null)
              ? resolvedLine
              : Math.min(Math.max(0, lineNumber - 1), Math.max(0, doc.lineCount - 1));

            vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false).then(editor => {
              if (!editor) return;
              const pos = new vscode.Position(targetLine, 0);
              editor.selection = new vscode.Selection(pos, pos);
              editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            });
          });
        } else if (message.command === "changeStatus") {
          const parts = String(message.text || "").split(",");
          const newStatus = parts[0];
          const fileName = parts[1];
          const taskText = (parts[2] || "").replaceAll("&#44;", ",");
          const date = (parts[3] || "").replaceAll("&#44;", ",");
          const maybeLine = parts[4];
          const hasLine = typeof maybeLine === "string" && /^\d+$/.test(maybeLine);
          const requestedLineNumber = hasLine ? Number(maybeLine) : null;
          const flags = parts.slice(hasLine ? 5 : 4);
          const removeClosed = flags.includes("REMOVE_CLOSED") || flags.includes("REMOVE_COMPLETED");
          let filePath = path.join(setMainDir(), fileName);
          const uri = vscode.Uri.file(filePath);

          vscode.workspace.openTextDocument(uri).then(document => {
            const lines = document.getText().split(/\r?\n/);

            function normalizeHeadlineToTitle(headline) {
              return taskKeywordManager.cleanTaskText(
                stripAllTagSyntax(normalizeTagsAfterPlanning(headline))
              ).trim();
            }

            const dateOnly = String(date || "").replace(/^\[|\]$/g, "");
            let taskLineNumber = -1;

            // Prefer an exact line match when provided by the webview.
            if (requestedLineNumber && Number.isFinite(requestedLineNumber) && requestedLineNumber > 0) {
              const idx = requestedLineNumber - 1;
              if (idx >= 0 && idx < document.lineCount) {
                const candidateText = document.lineAt(idx).text;
                const candidateKeyword = taskKeywordManager.findTaskKeyword(candidateText);
                const candidateIsHeading = headingStartRegex.test(candidateText);
                const candidateNorm = normalizeHeadlineToTitle(candidateText);
                if (candidateKeyword && candidateIsHeading && candidateNorm === String(taskText || "").trim()) {
                  taskLineNumber = idx;
                }
              }
            }

            if (taskLineNumber === -1) {
            for (let i = 0; i < document.lineCount; i++) {
              const lineText = document.lineAt(i).text;
              const keyword = taskKeywordManager.findTaskKeyword(lineText);
              const isHeading = headingStartRegex.test(lineText);
              if (!keyword || !isHeading) {
                continue;
              }

              const normalized = normalizeHeadlineToTitle(lineText);
              if (normalized !== String(taskText || "").trim()) {
                continue;
              }

              if (dateOnly) {
                const planning = getPlanningForHeading(lines, i);
                const scheduled = planning && planning.scheduled ? planning.scheduled : null;
                let deadline = planning && planning.deadline ? planning.deadline : null;

                // Back-compat: allow DEADLINE to live on a child planning line.
                if (!deadline) {
                  const baseIndent = lineText.match(/^\s*/)?.[0] || "";
                  for (let k = i + 1; k < lines.length; k++) {
                    const nextLine = lines[k];
                    const nextIndent = nextLine.match(/^\s*/)?.[0] || "";
                    if (nextIndent.length > baseIndent.length) {
                      const p = parsePlanningFromText(nextLine);
                      if (p && p.deadline) {
                        deadline = p.deadline;
                        break;
                      }
                    } else {
                      break;
                    }
                  }
                }

                // Prefer matching scheduled date when present; else match deadline.
                if (scheduled) {
                  const scheduledMoment = momentFromTimestampContent(scheduled, acceptedDateFormats, true);
                  if (!scheduledMoment.isValid()) {
                    continue;
                  }
                  if (scheduledMoment.format(dateFormat) !== dateOnly) {
                    continue;
                  }
                } else if (deadline) {
                  const deadlineMoment = momentFromTimestampContent(deadline, acceptedDateFormats, true);
                  if (!deadlineMoment.isValid()) {
                    continue;
                  }
                  if (deadlineMoment.format(dateFormat) !== dateOnly) {
                    continue;
                  }
                } else {
                  continue;
                }
              }

              taskLineNumber = i;
              break;
            }
            }

            if (taskLineNumber === -1) {
              vscode.window.showErrorMessage(`Unable to find task to update: ${taskText}`);
              return;
            }

            const workspaceEdit = new vscode.WorkspaceEdit();
            const currentLine = document.lineAt(taskLineNumber);
            const nextLine = taskLineNumber + 1 < document.lineCount ? document.lineAt(taskLineNumber + 1) : null;
            const nextNextLine = taskLineNumber + 2 < document.lineCount ? document.lineAt(taskLineNumber + 2) : null;

            const currentStatus = taskKeywordManager.findTaskKeyword(currentLine.text);

            const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
            const starPrefixMatch = currentLine.text.match(/^\s*(\*+)/);
            const starPrefix = starPrefixMatch ? starPrefixMatch[1] : "*";

            const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);

            const logIntoDrawer = config.get("logIntoDrawer", false);
            const logDrawerName = config.get("logDrawerName", "LOGBOOK");

            const indent = currentLine.text.match(/^\s*/)?.[0] || "";

            const planningIndent = `${indent}${bodyIndent}`;
            const planningFromHead = parsePlanningFromText(currentLine.text);
            const planningFromNext = (nextLine && isPlanningLine(nextLine.text)) ? parsePlanningFromText(nextLine.text) : {};
            const planningFromNextNext = (nextNextLine && isPlanningLine(nextNextLine.text)) ? parsePlanningFromText(nextNextLine.text) : {};

            const mergedPlanning = {
              scheduled: planningFromNext.scheduled || planningFromHead.scheduled || null,
              deadline: planningFromNext.deadline || planningFromHead.deadline || null,
              closed: planningFromNext.closed || planningFromHead.closed || planningFromNextNext.closed || null
            };

            if (registry.stampsClosed(newStatus)) {
              mergedPlanning.closed = moment().format(`${dateFormat} ddd HH:mm`);
            } else if (currentStatus && registry.stampsClosed(currentStatus) && removeClosed) {
              mergedPlanning.closed = null;
            }

            let effectiveStatus = newStatus;
            const completionTransition = registry.isDoneLike(newStatus) && !registry.isDoneLike(currentStatus);
            if (completionTransition) {
              if (logIntoDrawer && registry.stampsClosed(newStatus)) {
                const completionTimestamp = moment().format(`${dateFormat} ddd HH:mm`);
                const entry = formatStateChangeEntry({
                  fromKeyword: currentStatus,
                  toKeyword: newStatus,
                  timestamp: completionTimestamp
                });
                if (entry) {
                  const ins = computeLogbookInsertion(lines, taskLineNumber, {
                    drawerName: logDrawerName,
                    bodyIndent,
                    entry
                  });
                  if (ins && ins.changed && typeof ins.lineIndex === "number" && typeof ins.text === "string") {
                    workspaceEdit.insert(uri, new vscode.Position(ins.lineIndex, 0), ins.text);
                  }
                }
              }

              const repeated = applyRepeatersOnCompletion({
                lines,
                headingLineIndex: taskLineNumber,
                planning: mergedPlanning,
                workflowRegistry: registry,
                dateFormat,
                now: moment()
              });

              if (repeated && repeated.didRepeat) {
                mergedPlanning.scheduled = repeated.planning.scheduled;
                mergedPlanning.deadline = repeated.planning.deadline;
                if (repeated.repeatToStateKeyword) {
                  effectiveStatus = repeated.repeatToStateKeyword;
                }
              }
            }

            const cleanedHeadline = taskKeywordManager.cleanTaskText(
              stripInlinePlanning(normalizeTagsAfterPlanning(currentLine.text)).trim()
            );
            const newHeadlineOnly = taskKeywordManager.buildTaskLine(indent, effectiveStatus, cleanedHeadline, { headingMarkerStyle, starPrefix });

            function buildPlanningBody(p) {
              const segs = [];
              // In Emacs: SCHEDULED/DEADLINE use active <...> (appear in agenda), CLOSED uses inactive [...]
              if (p.scheduled) segs.push(`SCHEDULED: <${p.scheduled}>`);
              if (p.deadline) segs.push(`DEADLINE: <${p.deadline}>`);
              if (p.closed) segs.push(`CLOSED: [${p.closed}]`);
              return segs.join("  ");
            }

            const planningBody = buildPlanningBody(mergedPlanning);

            // Handle forward-trigger transitions (same logic as Ctrl+Left/Right)
            if (registry.triggersForward(effectiveStatus) && !registry.triggersForward(currentStatus)) {
              const forwardEdit = continuedTaskHandler.handleContinuedTransition(document, taskLineNumber);
              if (forwardEdit && forwardEdit.type === "insert") {
                workspaceEdit.insert(uri, forwardEdit.position, forwardEdit.text);
              }
            } else if (registry.triggersForward(currentStatus) && !registry.triggersForward(effectiveStatus)) {
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

            const becameDoneLike = (!registry.isDoneLike(currentStatus) && registry.isDoneLike(effectiveStatus));

            vscode.workspace.applyEdit(workspaceEdit).then(async (applied) => {
              if (!applied) {
                vscode.window.showErrorMessage("Unable to apply task update.");
                return;
              }
              suppressReloadForFsPath = uri.fsPath;

              await document.save();

              if (becameDoneLike) {
                const oldLineNumber1Based = (requestedLineNumber && Number.isFinite(requestedLineNumber) && requestedLineNumber > 0)
                  ? requestedLineNumber
                  : (taskLineNumber + 1);

                const moveRes = await applyAutoMoveDoneWithResult(document, taskLineNumber, newHeadlineOnly);
                suppressReloadForFsPath = uri.fsPath;
                await document.save();

                if (moveRes && moveRes.applied && Number.isFinite(moveRes.newLineNumber) && moveRes.newLineNumber > 0) {
                  try {
                    fullAgendaView.webview.postMessage({
                      command: 'updateLineNumber',
                      file: fileName,
                      oldLineNumber: oldLineNumber1Based,
                      newLineNumber: moveRes.newLineNumber
                    });
                  } catch {
                    // best-effort
                  }
                }
              }

              vscode.window.showInformationMessage(`Updated: ${taskText} -> ${newStatus}`);
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
        function getWebviewContent(task, skippedFiles) {
            const errorBannerContent = (skippedFiles && skippedFiles.length > 0)
              ? escapeText(skippedFiles.map(s => `${s.file} (${s.reason})`).join("; "))
              : "";
            const errorBannerClass = errorBannerContent ? "visible" : "";
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

        .headingUndated {
          background-color: #5d5d5d;
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

        .closedTag{
          color: #333;
          padding-left: 10px;
          font-weight: 700;
          float: left;
          padding-top: 13px;
          height: 67%;
          opacity: 0.8;
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

        .deadlineTag{
          background-color: #ffb0b0;
          padding-left: 10px;
          padding-right: 10px;
          padding-top: 5px;
          color: #5d5d5d;
          font-weight: 700;
          border-radius: 27px;
          font-size: 9px;
          height: 15px;
          float: right;
          margin-left: 10px;
          margin-top: 10px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
        }

        .undatedTag{
          background-color: #d1d1d1;
          padding-left: 10px;
          padding-right: 10px;
          padding-top: 5px;
          color: #5d5d5d;
          font-weight: 700;
          border-radius: 27px;
          font-size: 9px;
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

        .agenda-task-link{
          cursor: pointer;
        }

        .panel.agenda-selected{
          outline: 2px solid #2f6999;
          outline-offset: 2px;
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

        .detail-line.subtask-line {
          display: block;
          padding: 2px 0;
        }

        .detail-line.subtask-line .taskText {
          margin-left: 6px;
        }

        .org-checkbox {
          vertical-align: middle;
        }

        #view-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 4px 0 8px 0;
        }

        .view-chip {
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

        .view-chip.selected {
          background: #2f6999;
          color: #fff;
          border-color: #2f6999;
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

        .range-filtered-out {
          display: none !important;
        }

        #range-controls {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          padding: 0 0 8px 0;
        }

        #range-controls label {
          font-size: 12px;
          font-weight: 700;
          color: #111;
        }

        #range-select {
          font-size: 12px;
          padding: 6px 10px;
          border-radius: 8px;
          border: 1px solid rgba(0,0,0,0.2);
          background: #fff;
          color: #111;
        }
        #error-banner {
          margin: 0 0 12px;
          padding: 10px 14px;
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 6px;
          font-size: 12px;
          color: #721c24;
          display: none;
          align-items: center;
          gap: 8px;
        }
        #error-banner.visible {
          display: flex;
        }
        #error-banner::before {
          content: "⚠️";
          font-size: 16px;
        }
        </style>
        <body>

        <h1>Agenda View</h1>
        <div id="error-banner" class="${errorBannerClass}">${errorBannerContent}</div>
        <div id="view-tabs" aria-label="Agenda tabs"></div>
        <div id="range-controls" aria-label="Date range">
          <label for="range-select">Range</label>
          <select id="range-select">
            <option value="all">All</option>
            <option value="week">This week</option>
            <option value="month">This month</option>
            <option value="year">This year</option>
          </select>
        </div>
        <div id="file-bubbles" aria-label="File filter"></div>
        <div id="display-agenda" data-view="agenda">
        ${itemInSortedObject}
        </div>
        <div id="display-closed" data-view="closed" style="display:none;">
        ${itemInClosedSortedObject}
        </div>
        <script>
        const vscode = acquireVsCodeApi();
        const dateFormat = "${dateFormat}";
        const acceptedDateFormats = ${JSON.stringify(acceptedDateFormats)};
        const revealTaskOnClick = ${config.get("agendaRevealTaskOnClick", true) ? "true" : "false"};
        const highlightTaskOnClick = ${config.get("agendaHighlightTaskOnClick", true) ? "true" : "false"};

        const LS_EXPANDED_DATES_KEY = 'org-vscode.agenda.expandedDates';
        const LS_EXPANDED_CLOSED_DATES_KEY = 'org-vscode.agendaClosed.expandedDates';
        const LS_OPEN_DETAILS_KEY = 'org-vscode.agenda.openDetails';
        const LS_SELECTED_FILE_KEY = 'org-vscode.agenda.selectedFile';
        const LS_SELECTED_VIEW_KEY = 'org-vscode.agenda.selectedView';
        const LS_SELECTED_RANGE_KEY = 'org-vscode.agenda.selectedRange';

        function getRootForView(view) {
          const v = String(view || '').toLowerCase();
          if (v === 'closed') return document.getElementById('display-closed');
          return document.getElementById('display-agenda');
        }

        function getSelectedView() {
          const state = vscode.getState && vscode.getState();
          const fromState = state && typeof state.selectedView === 'string' ? state.selectedView : '';
          const fromLs = (() => { try { return String(localStorage.getItem(LS_SELECTED_VIEW_KEY) || ''); } catch { return ''; } })();
          const v = (fromState || fromLs || 'agenda').toLowerCase();
          return (v === 'closed') ? 'closed' : 'agenda';
        }

        function getSelectedRange() {
          const state = vscode.getState && vscode.getState();
          const fromState = state && typeof state.selectedRange === 'string' ? state.selectedRange : '';
          const fromLs = (() => { try { return String(localStorage.getItem(LS_SELECTED_RANGE_KEY) || ''); } catch { return ''; } })();
          const v = (fromState || fromLs || 'all').toLowerCase();
          return (v === 'week' || v === 'month' || v === 'year') ? v : 'all';
        }

        function getSelectedFile() {
          const state = vscode.getState && vscode.getState();
          const fromState = state && typeof state.selectedFile === 'string' ? state.selectedFile : '';
          const fromLs = (() => { try { return String(localStorage.getItem(LS_SELECTED_FILE_KEY) || ''); } catch { return ''; } })();
          return String(fromState || fromLs || '');
        }

        function parseDateOnly(raw) {
          const s = String(raw || '').trim();
          if (!s) return null;
          const m = s.match(/(\d{2,4}[-/]\d{2}[-/]\d{2,4})/);
          const dateStr = m ? m[1] : s;
          const parsed = window.moment ? window.moment(dateStr, acceptedDateFormats, true) : null;
          if (!parsed || !parsed.isValid || !parsed.isValid()) return null;
          return parsed;
        }

        function computeRangeBounds(rangeKey) {
          const k = String(rangeKey || 'all').toLowerCase();
          if (!window.moment) return null;
          const now = window.moment();
          if (k === 'week') {
            return { start: now.clone().startOf('isoWeek'), end: now.clone().endOf('isoWeek') };
          }
          if (k === 'month') {
            return { start: now.clone().startOf('month'), end: now.clone().endOf('month') };
          }
          if (k === 'year') {
            return { start: now.clone().startOf('year'), end: now.clone().endOf('year') };
          }
          return null;
        }

        function panelIsHidden(p) {
          return p.classList.contains('filtered-out') || p.classList.contains('range-filtered-out');
        }

        function updateHeadingsVisibility(root) {
          if (!root) return;
          const panels = Array.from(root.querySelectorAll('.panel'));
          const headingDivs = Array.from(root.querySelectorAll('div'))
            .filter(d => Array.from(d.classList).some(c => c && c.startsWith('heading')));

          headingDivs.forEach(h => {
            const classes = Array.from(h.classList);
            const dateClass = classes.find(c => c && c.startsWith('[') && c.endsWith(']'));
            if (!dateClass) return;
            const relatedPanels = panels.filter(p => p.classList.contains(dateClass));
            const anyVisible = relatedPanels.some(p => !panelIsHidden(p));
            if (anyVisible) h.classList.remove('filtered-out');
            else h.classList.add('filtered-out');
          });
        }

        function applyRangeFilter() {
          const range = getSelectedRange();
          const bounds = computeRangeBounds(range);
          const roots = [document.getElementById('display-agenda'), document.getElementById('display-closed')].filter(Boolean);

          for (const root of roots) {
            const isClosedView = root.id === 'display-closed';
            const panels = Array.from(root.querySelectorAll('.panel'));
            for (const p of panels) {
              if (range === 'all' || !bounds) {
                p.classList.remove('range-filtered-out');
                continue;
              }

              if (isClosedView) {
                const d = parseDateOnly(p.dataset.itemDate || p.dataset.closedDate || '');
                if (!d) {
                  p.classList.add('range-filtered-out');
                  continue;
                }
                const ok = d.isBetween(bounds.start, bounds.end, 'day', '[]');
                if (ok) p.classList.remove('range-filtered-out');
                else p.classList.add('range-filtered-out');
              } else {
                const sched = parseDateOnly(p.dataset.scheduledDate || '');
                const dead = parseDateOnly(p.dataset.deadlineDate || '');
                const item = parseDateOnly(p.dataset.itemDate || '');
                const ok = [sched, dead, item].some(x => x && x.isBetween(bounds.start, bounds.end, 'day', '[]'));
                if (ok) p.classList.remove('range-filtered-out');
                else p.classList.add('range-filtered-out');
              }
            }

            updateHeadingsVisibility(root);
          }
        }

        function initRangeControl() {
          const sel = document.getElementById('range-select');
          if (!sel) return;
          sel.value = getSelectedRange();

          sel.addEventListener('change', () => {
            const v = getSelectedRange();
            const next = String(sel.value || 'all').toLowerCase();
            const cur = vscode.getState && vscode.getState();
            if (vscode.setState) {
              vscode.setState({ ...(cur || {}), selectedRange: next });
            }
            try { localStorage.setItem(LS_SELECTED_RANGE_KEY, next); } catch {}
            applyRangeFilter();

            // Ensure headings visibility is recomputed under both filters.
            applyFileFilter(getSelectedFile());
          });
        }

        function restoreExpandedDates(view) {
          const v = (String(view || 'agenda').toLowerCase() === 'closed') ? 'closed' : 'agenda';
          const key = (v === 'closed') ? LS_EXPANDED_CLOSED_DATES_KEY : LS_EXPANDED_DATES_KEY;
          const root = getRootForView(v);
          if (!root) return;

          const expanded = loadJsonFromLocalStorage(key, []);
          if (!Array.isArray(expanded) || !expanded.length) return;
          const set = new Set(expanded.map(String));
          const panels = Array.from(root.querySelectorAll('.panel'));
          for (const p of panels) {
            const dateClass = Array.from(p.classList).find(c => c && c.startsWith('[') && c.endsWith(']'));
            if (dateClass && set.has(dateClass) && !p.classList.contains('filtered-out') && !p.classList.contains('range-filtered-out')) {
              p.style.display = 'block';
            }
          }
        }

        function saveExpandedDates(view) {
          const v = (String(view || getSelectedView()).toLowerCase() === 'closed') ? 'closed' : 'agenda';
          const key = (v === 'closed') ? LS_EXPANDED_CLOSED_DATES_KEY : LS_EXPANDED_DATES_KEY;
          const root = getRootForView(v);
          if (!root) return;
          const panels = Array.from(root.querySelectorAll('.panel'));
          const expanded = new Set();
          for (const p of panels) {
            if (p.style && p.style.display === 'block') {
              const dateClass = Array.from(p.classList).find(c => c && c.startsWith('[') && c.endsWith(']'));
              if (dateClass) expanded.add(dateClass);
            }
          }
          saveJsonToLocalStorage(key, Array.from(expanded));
        }

        function setSelectedView(view) {
          const v = (String(view || 'agenda').toLowerCase() === 'closed') ? 'closed' : 'agenda';
          const agendaRoot = document.getElementById('display-agenda');
          const closedRoot = document.getElementById('display-closed');
          if (agendaRoot) agendaRoot.style.display = (v === 'agenda') ? 'block' : 'none';
          if (closedRoot) closedRoot.style.display = (v === 'closed') ? 'block' : 'none';

          Array.from(document.querySelectorAll('.view-chip')).forEach(c => {
            const vv = (c.dataset.view || '').toLowerCase();
            if (vv === v) c.classList.add('selected');
            else c.classList.remove('selected');
          });

          if (vscode.setState) {
            const cur = vscode.getState && vscode.getState();
            vscode.setState({ ...(cur || {}), selectedView: v });
          }
          try { localStorage.setItem(LS_SELECTED_VIEW_KEY, v); } catch {}

          // Ensure range filtering is applied before restoring expansion.
          applyRangeFilter();
          restoreExpandedDates(v);
          restoreOpenDetails();
        }

        function buildViewTabs() {
          const container = document.getElementById('view-tabs');
          if (!container) return;
          container.replaceChildren();
          const mk = (label, view) => {
            const el = document.createElement('div');
            el.className = 'view-chip';
            el.textContent = label;
            el.dataset.view = view;
            el.addEventListener('click', () => setSelectedView(view));
            return el;
          };
          container.appendChild(mk('Agenda', 'agenda'));
          container.appendChild(mk('Closed', 'closed'));
          setSelectedView(getSelectedView());
        }

        function loadJsonFromLocalStorage(key, fallback) {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            const v = JSON.parse(raw);
            return v === undefined ? fallback : v;
          } catch {
            return fallback;
          }
        }

        function saveJsonToLocalStorage(key, value) {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch {
            // ignore
          }
        }

        // Expanded-date persistence is handled per-view by restoreExpandedDates(view) / saveExpandedDates(view)

        function restoreOpenDetails() {
          const openKeys = loadJsonFromLocalStorage(LS_OPEN_DETAILS_KEY, []);
          if (!Array.isArray(openKeys) || !openKeys.length) return;
          const set = new Set(openKeys.map(String));
          Array.from(document.querySelectorAll('details.children-block[data-details-key]')).forEach(d => {
            const k = String(d.dataset.detailsKey || '');
            if (k && set.has(k)) d.open = true;
          });
        }

        function persistOpenDetails() {
          const open = Array.from(document.querySelectorAll('details.children-block[data-details-key]'))
            .filter(d => !!d.open)
            .map(d => String(d.dataset.detailsKey || ''))
            .filter(Boolean);
          saveJsonToLocalStorage(LS_OPEN_DETAILS_KEY, open);
        }

        function rekeyOpenDetails(oldKey, newKey) {
          if (!oldKey || !newKey || oldKey === newKey) return;
          const arr = loadJsonFromLocalStorage(LS_OPEN_DETAILS_KEY, []);
          if (!Array.isArray(arr) || !arr.length) return;
          let changed = false;
          const next = arr.map(k => {
            if (String(k) === String(oldKey)) { changed = true; return String(newKey); }
            return k;
          });
          if (changed) saveJsonToLocalStorage(LS_OPEN_DETAILS_KEY, next);
        }

        window.addEventListener('message', event => {
          const msg = event && event.data ? event.data : null;
          if (!msg || msg.command !== 'updateLineNumber') return;
          const file = String(msg.file || '');
          const oldLine = Number(msg.oldLineNumber);
          const newLine = Number(msg.newLineNumber);
          if (!file || !Number.isFinite(oldLine) || !Number.isFinite(newLine) || oldLine < 1 || newLine < 1) return;
          const delta = newLine - oldLine;
          if (delta === 0) return;

          const link = document.querySelector('.agenda-task-link[data-file="' + CSS.escape(file) + '"][data-line="' + String(oldLine) + '"]');
          const panel = link ? link.closest('.panel') : null;
          if (!panel) return;

          // Update the task panel's stored line numbers (heading, keyword, checkboxes, etc.).
          const els = Array.from(panel.querySelectorAll('[data-line]'));
          for (const el of els) {
            const lineRaw = el.getAttribute('data-line');
            const lineNum = lineRaw ? parseInt(lineRaw, 10) : NaN;
            if (!Number.isFinite(lineNum)) continue;
            const next = lineNum + delta;
            if (next > 0) el.setAttribute('data-line', String(next));
          }

          // Update details-key and persisted open-details keys.
          const detailsEls = Array.from(panel.querySelectorAll('details.children-block[data-details-key]'));
          for (const d of detailsEls) {
            const oldKey = String(d.dataset.detailsKey || '');
            const m = oldKey.match(/^(.*?):(\d+)$/);
            if (!m) continue;
            const keyFile = m[1];
            const keyLine = parseInt(m[2], 10);
            if (keyFile !== file || !Number.isFinite(keyLine)) continue;
            const newKey = keyFile + ':' + String(keyLine + delta);
            d.dataset.detailsKey = newKey;
            rekeyOpenDetails(oldKey, newKey);
          }
        });

        function getAllFilesFromDom() {
          const els = Array.from(document.querySelectorAll('.filename[data-file]'));
          const files = Array.from(new Set(els.map(e => e.dataset.file).filter(Boolean)));
          files.sort((a, b) => a.localeCompare(b));
          return files;
        }

        function buildFileChips(files) {
          const container = document.getElementById('file-bubbles');
          if (!container) return;

          container.replaceChildren();

          const state = vscode.getState && vscode.getState();
          const fromState = state && typeof state.selectedFile === 'string' ? state.selectedFile : '';
          const fromLs = (() => { try { return String(localStorage.getItem(LS_SELECTED_FILE_KEY) || ''); } catch { return ''; } })();
          const initial = fromState || fromLs || '';

          const makeChip = (label, value) => {
            const chip = document.createElement('div');
            chip.className = 'file-chip';
            chip.textContent = label;
            chip.dataset.file = value;
            chip.addEventListener('click', () => {
              const selected = chip.dataset.file || '';
              applyFileFilter(selected);
              if (vscode.setState) {
                const cur = vscode.getState && vscode.getState();
                vscode.setState({ ...(cur || {}), selectedFile: selected });
              }
              try { localStorage.setItem(LS_SELECTED_FILE_KEY, selected); } catch {}
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

          const roots = [document.getElementById('display-agenda'), document.getElementById('display-closed')].filter(Boolean);
          for (const root of roots) {
            const panels = Array.from(root.querySelectorAll('.panel'));
            panels.forEach(p => {
              const fileEl = p.querySelector('.filename[data-file]');
              const file = fileEl ? fileEl.dataset.file : '';
              const match = !selectedFile || file === selectedFile;
              if (match) p.classList.remove('filtered-out');
              else p.classList.add('filtered-out');
            });

            // Hide day headings when no visible panels remain for that date.
            const headingDivs = Array.from(root.querySelectorAll('div'))
              .filter(d => Array.from(d.classList).some(c => c && c.startsWith('heading')));

            headingDivs.forEach(h => {
              const classes = Array.from(h.classList);
              const dateClass = classes.find(c => c && c.startsWith('[') && c.endsWith(']'));
              if (!dateClass) return;
              const relatedPanels = panels.filter(p => p.classList.contains(dateClass));
              const anyVisible = relatedPanels.some(p => !panelIsHidden(p));
              if (anyVisible) h.classList.remove('filtered-out');
              else h.classList.add('filtered-out');
            });
          }
        }

        // Load moment via CDN for formatting
        const script = document.createElement('script');
        script.src = "https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js";
        script.onload = () => {
          buildViewTabs();
          initRangeControl();
          buildFileChips(getAllFilesFromDom());

          // Apply range after initial chips/filtering so headings are correct.
          applyRangeFilter();

          // Restore expanded day headings and open task details after a refresh.
          restoreExpandedDates(getSelectedView());
          restoreOpenDetails();

          // Track details open/close.
          Array.from(document.querySelectorAll('details.children-block[data-details-key]')).forEach(d => {
            d.addEventListener('toggle', () => { persistOpenDetails(); });
          });

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

            // Reveal the clicked task/filename in the source file.
            const revealEl = (event.target && event.target.closest)
              ? event.target.closest('.agenda-task-link[data-file][data-line], .filename[data-file][data-line]')
              : null;
            if (revealEl && revealTaskOnClick) {
              const file = revealEl.dataset.file;
              const lineNumber = Number(revealEl.dataset.line);
                  const taskText = String(revealEl.dataset.text || '').trim();
                  const date = String(revealEl.dataset.date || '').trim();
              if (file && Number.isFinite(lineNumber) && lineNumber > 0) {
                vscode.postMessage({
                  command: 'revealTask',
                  file,
                      lineNumber,
                      taskText,
                      date
                });

                if (highlightTaskOnClick) {
                  document.querySelectorAll('.panel.agenda-selected').forEach(p => p.classList.remove('agenda-selected'));
                  const panel = revealEl.closest('.panel');
                  if (panel) panel.classList.add('agenda-selected');
                }

                // Avoid also triggering the filename open handler.
                if (revealEl.classList.contains('filename')) {
                  return;
                }
              }
            }

            let class0 = event.srcElement.classList[0];
            let class1 = event.srcElement.classList[1];
            const activeView = getSelectedView();
            const activeRoot = getRootForView(activeView);
            let panels = activeRoot ? activeRoot.getElementsByClassName('panel') : document.getElementsByClassName('panel');

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

              // Persist expanded/collapsed day groups.
              saveExpandedDates(activeView);
            }

            // Send filename to open file
            if (event.srcElement.classList.contains('filename')) {
              vscode.postMessage({
                command: 'open',
                text: event.target.innerText.replace(':', "")
              });
            }

            // Cycle through statuses while maintaining proper placement and styling
            const statuses = ${JSON.stringify(cycleKeywords)};
            const bucketClasses = ${JSON.stringify(bucketClasses)};
            const keywordToBucket = ${JSON.stringify(keywordToBucket)};
            const stampsClosed = ${JSON.stringify(stampsClosedKeywords)};
            let currentStatus = event.target.innerText.trim();
            let currentIndex = statuses.indexOf(currentStatus);

            if (currentIndex !== -1) {
              let nextStatus = statuses[(currentIndex + 1) % statuses.length];
              event.target.innerText = nextStatus;

              const nextBucket = keywordToBucket[nextStatus] || "todo";
              event.srcElement.classList.remove(...bucketClasses);
              event.srcElement.classList.add(nextBucket);

              let safeText = (event.target.dataset.text || "").replaceAll(",", "&#44;");
              let safeDate = (event.target.dataset.date || "").replaceAll(",", "&#44;");
              let safeLine = (event.target.dataset.line || "").replaceAll(",", "");
              let messageText = nextStatus + "," + event.target.dataset.filename + "," + safeText + "," + safeDate + "," + safeLine;

              if (stampsClosed.includes(nextStatus)) {
                let completedDate = moment();
                let formattedDate = completedDate.format(dateFormat + " ddd HH:mm");
                messageText += ",CLOSED: [" + formattedDate + "]";
              }

              if (stampsClosed.includes(currentStatus)) {
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
