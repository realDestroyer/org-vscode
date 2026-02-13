const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const os = require("os");
const moment = require("moment");
const taskKeywordManager = require("./taskKeywordManager");
const { applyAutoMoveDoneWithResult } = require("./doneTaskAutoMove");
const continuedTaskHandler = require("./continuedTaskHandler");
const { normalizeBodyIndentation } = require("./indentUtils");
const { stripAllTagSyntax, parseFileTagsFromText, parseTagGroupsFromText, createInheritanceTracker, matchesTagMatchString, normalizeTagMatchInput, getPlanningForHeading, isPlanningLine, parsePlanningFromText, normalizeTagsAfterPlanning, getAcceptedDateFormats, stripInlinePlanning, momentFromTimestampContent, extractPlainTimestamps } = require("./orgTagUtils");
const { applyRepeatersOnCompletion } = require("./repeatedTasks");
const { computeLogbookInsertion, formatStateChangeEntry } = require("./orgLogbook");
const { computeCheckboxStatsByHeadingLine, formatCheckboxStats, findCheckboxCookie } = require("./checkboxStats");
const { computeCheckboxToggleEdits } = require("./checkboxToggle");
const { html, escapeText, escapeAttr } = require("./htmlUtils");

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildHeadingStartRegex(registry) {
  const markers = (registry?.states || [])
    .map((s) => s.marker)
    .filter((m) => typeof m === "string" && m.length > 0);
  const uniqueMarkers = Array.from(new Set(markers));
  const markerAlt = uniqueMarkers.map(escapeRegExp).join("|");
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

module.exports = async function taggedAgenda() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);
  const includeContinuedInTaggedAgenda = config.get("includeContinuedInTaggedAgenda", false);
  const taggedAgendaIncludeAllStatuses = config.get("taggedAgendaIncludeAllStatuses", true);
  const registry = taskKeywordManager.getWorkflowRegistry();
  const headingStartRegex = buildHeadingStartRegex(registry);

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
  const skippedFiles = [];
  const orgDir = getOrgFolder();
  let files;
  try {
    files = fs.readdirSync(orgDir).filter(file => file.endsWith(".org") && !file.startsWith(".") && file !== "CurrentTasks.org");
  } catch (dirErr) {
    vscode.window.showErrorMessage(`Error reading org directory: ${dirErr.message}`);
    return;
  }

  for (const file of files) {
    const filePath = path.join(orgDir, file);
    let fileText;
    try {
      fileText = fs.readFileSync(filePath, "utf8");
    } catch (fileErr) {
      skippedFiles.push({ file, reason: fileErr.message });
      continue;
    }
    const lines = fileText.split(/\r?\n/);
    const checkboxStatsByLine = computeCheckboxStatsByHeadingLine(lines);
    const tracker = createInheritanceTracker(parseFileTagsFromText(fileText));
    const groups = parseTagGroupsFromText(fileText);
    const dateFormat = config.get("dateFormat", "YYYY-MM-DD");

    // Track current heading for plain timestamps in body text
    let currentHeadingText = null;
    let currentHeadingLine = 0;
    let currentHeadingTags = [];
    let seenFirstHeading = false;

    lines.forEach((line, index) => {
      const tagState = tracker.handleLine(line);
      const status = taskKeywordManager.findTaskKeyword(line);
      const startsWithSymbol = headingStartRegex.test(line);

      // Track current heading for plain timestamp display
      if (tagState.isHeading && startsWithSymbol) {
        seenFirstHeading = true;
        currentHeadingText = line;
        currentHeadingLine = index + 1;
        currentHeadingTags = tagState.inheritedTags;
      }

      // Check for plain timestamps in all lines (after first heading)
      if (seenFirstHeading) {
        const plainTimestamps = extractPlainTimestamps(line);
        for (const ts of plainTimestamps) {
          // Only active timestamps <...> appear in agenda
          if (ts.bracket !== '<') continue;

          const parsedDate = moment(ts.date, getAcceptedDateFormats(dateFormat), true);
          if (!parsedDate.isValid()) continue;

          // Use parent heading's tags for body lines
          const effectiveTags = tagState.isHeading ? tagState.inheritedTags : currentHeadingTags;
          if (effectiveTags.length === 0) continue;
          if (!matchesTagMatchString(matchExpr, effectiveTags, { groups })) continue;

          agendaItems.push({
            file,
            line: currentHeadingText || line,  // Display heading
            lineNumber: index + 1,              // Timestamp line for jumping
            tags: effectiveTags,
            scheduledDate: ts.date,
            deadlineDate: "",
            checkboxChecked: 0,
            checkboxTotal: 0,
            children: [],
            isPlainTimestamp: true
          });
        }
      }

      if (!tagState.isHeading || !status || !startsWithSymbol) {
        return;
      }

      // Default: hide states marked as hidden from tagged agenda.
      // Optionally include *all* statuses for reporting/analytics.
      if (!taggedAgendaIncludeAllStatuses) {
        const state = (registry.states || []).find((s) => s.keyword === status);
        const taggedVis = state && state.taggedAgendaVisibility ? state.taggedAgendaVisibility : "show";
        if (taggedVis === "hide" && !includeContinuedInTaggedAgenda) {
          return;
        }
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
          let deadlineFromChildren = null;
          for (let k = index + 1; k < lines.length; k++) {
            const nextLine = lines[k];
            const nextIndent = nextLine.match(/^\s*/)?.[0] || "";
            if (nextIndent.length > baseIndent.length) {
              children.push({ text: nextLine, lineNumber: k + 1 });

              // Back-compat: allow DEADLINE to live on a child planning line.
              if (!deadlineFromChildren) {
                const p = parsePlanningFromText(nextLine);
                if (p && p.deadline) deadlineFromChildren = p.deadline;
              }
            } else {
              break;
            }
          }

          const deadlineDate = (planning && planning.deadline) ? planning.deadline : (deadlineFromChildren || "");

          agendaItems.push({
            file,
            line,
            lineNumber: index + 1,
            tags: taskTags,
            scheduledDate: planning && planning.scheduled ? planning.scheduled : "",
            deadlineDate,
            checkboxChecked: cb.checked,
            checkboxTotal: cb.total,
            children
          });
        }
      }
    });
  }

  showTaggedAgendaView(matchExpr, agendaItems, skippedFiles);
};

async function updateTaskStatusInFile(file, taskText, scheduledDate, newStatus, removeCompleted, requestedLineNumber) {
  try {
    const registry = taskKeywordManager.getWorkflowRegistry();
    const headingStartRegex = buildHeadingStartRegex(registry);
    const orgDir = getOrgFolder();
    const filePath = path.join(orgDir, file);
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);

    const config = vscode.workspace.getConfiguration("Org-vscode");
    const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);
    const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
    const dateFormat = config.get("dateFormat", "YYYY-MM-DD");

    const logIntoDrawer = config.get("logIntoDrawer", false);
    const logDrawerName = config.get("logDrawerName", "LOGBOOK");

    const dateTag = scheduledDate ? `SCHEDULED: <${scheduledDate}>` : null;
    console.log("🛠 Updating file:", filePath);
    console.log("🔍 Looking for task text:", taskText);
    if (dateTag) console.log("🔍 With scheduled date tag:", dateTag);

  function normalizeTaskTextFromHeadline(headline) {
    const normalized = stripAllTagSyntax(headline)
      .replace(/.*?\] -/, "")
      .replace(/\s+SCHEDULED:.*/, "");
    return taskKeywordManager.cleanTaskText(normalized).trim();
  }

    let taskLineNumber = -1;
    const docLines = document.getText().split(/\r?\n/);

    const requestedIdx = Number.isFinite(requestedLineNumber) ? (requestedLineNumber - 1) : -1;
    if (requestedIdx >= 0 && requestedIdx < document.lineCount) {
      const lineText = document.lineAt(requestedIdx).text;
      const keyword = taskKeywordManager.findTaskKeyword(lineText);
      const startsWithSymbol = headingStartRegex.test(lineText);
      if (keyword && startsWithSymbol) {
        const normalizedHeadlineText = normalizeTaskTextFromHeadline(lineText);
        const matchesTask = normalizedHeadlineText === String(taskText || "").trim();
        let matchesDate = true;
        if (dateTag) {
          const planning = getPlanningForHeading(docLines, requestedIdx);
          matchesDate = planning && planning.scheduled ? (`SCHEDULED: <${planning.scheduled}>` === dateTag) : false;
        }
        if (matchesTask && matchesDate) {
          taskLineNumber = requestedIdx;
        }
      }
    }

    if (taskLineNumber === -1) {
    for (let i = 0; i < document.lineCount; i++) {
      const lineText = document.lineAt(i).text;
      const keyword = taskKeywordManager.findTaskKeyword(lineText);
      const startsWithSymbol = headingStartRegex.test(lineText);
      if (!keyword || !startsWithSymbol) {
        continue;
      }

      const normalizedHeadlineText = normalizeTaskTextFromHeadline(lineText);
      const matchesTask = normalizedHeadlineText === String(taskText || "").trim();
      if (!matchesTask) {
        continue;
      }

      if (dateTag) {
        const planning = getPlanningForHeading(docLines, i);
        const matchesDate = planning && planning.scheduled ? (`SCHEDULED: <${planning.scheduled}>` === dateTag) : false;
        if (!matchesDate) {
          continue;
        }
      }

      taskLineNumber = i;
      break;
    }
    }

    if (taskLineNumber === -1) {
      console.error("❌ No matching line found to update.");
      vscode.window.showErrorMessage(`Unable to find task to update: ${taskText}`);
      return;
    }

    const oldLineNumber1Based = (requestedIdx >= 0) ? (requestedIdx + 1) : (taskLineNumber + 1);

    const workspaceEdit = new vscode.WorkspaceEdit();
    const currentLine = document.lineAt(taskLineNumber);
    const nextLine = taskLineNumber + 1 < document.lineCount ? document.lineAt(taskLineNumber + 1) : null;
    const nextNextLine = taskLineNumber + 2 < document.lineCount ? document.lineAt(taskLineNumber + 2) : null;
    const currentStatus = taskKeywordManager.findTaskKeyword(currentLine.text);

    const starPrefixMatch = currentLine.text.match(/^\s*(\*+)/);
    const starPrefix = starPrefixMatch ? starPrefixMatch[1] : "*";

    const indent = currentLine.text.match(/^\s*/)?.[0] || "";
    const planningIndent = `${indent}${bodyIndent}`;
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
    if (registry.stampsClosed(newStatus)) {
      mergedPlanning.closed = moment().format(`${dateFormat} ddd HH:mm`);
    } else if (currentStatus && registry.stampsClosed(currentStatus) && removeCompleted) {
      mergedPlanning.closed = null;
    }

    // Apply repeater semantics on completion transitions.
    let effectiveStatus = newStatus;
    const completionTransition = registry.isDoneLike(newStatus) && !registry.isDoneLike(currentStatus);
    if (completionTransition) {
      if (logIntoDrawer && registry.stampsClosed(newStatus)) {
        const completionTimestamp = mergedPlanning.closed || moment().format(`${dateFormat} ddd HH:mm`);
        const entry = formatStateChangeEntry({
          fromKeyword: currentStatus,
          toKeyword: newStatus,
          timestamp: completionTimestamp
        });
        if (entry) {
          const ins = computeLogbookInsertion(docLines, taskLineNumber, {
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
        lines: docLines,
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
    const parts = [];
    // In Emacs: SCHEDULED/DEADLINE use active <...> (appear in agenda), CLOSED uses inactive [...]
    if (p.scheduled) parts.push(`SCHEDULED: <${p.scheduled}>`);
    if (p.deadline) parts.push(`DEADLINE: <${p.deadline}>`);
    if (p.closed) parts.push(`CLOSED: [${p.closed}]`);
    return parts.join("  ");
  }

    const planningBody = buildPlanningBody(mergedPlanning);

  // Handle forward-trigger transitions (CONTINUED-like)
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
    if (!applied) {
      vscode.window.showErrorMessage("Unable to apply task update.");
      return { oldLineNumber: oldLineNumber1Based, newLineNumber: null };
    }
    await document.save();

    // Auto-move newly completed tasks under the last done-like sibling.
    const becameDoneLike = (!registry.isDoneLike(currentStatus) && registry.isDoneLike(effectiveStatus));
    if (becameDoneLike) {
      const moveRes = await applyAutoMoveDoneWithResult(document, taskLineNumber, newHeadlineOnly);
      await document.save();

      if (moveRes && moveRes.applied && Number.isFinite(moveRes.newLineNumber) && moveRes.newLineNumber > 0) {
        return { oldLineNumber: oldLineNumber1Based, newLineNumber: moveRes.newLineNumber };
      }
    }

    return { oldLineNumber: oldLineNumber1Based, newLineNumber: oldLineNumber1Based };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error("❌ TaggedAgenda changeStatus failed:", err);
    vscode.window.showErrorMessage(`Tagged Agenda: failed to update task: ${msg}`);
    return { oldLineNumber: null, newLineNumber: null };
  }
}

function getOrgFolder() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const folderPath = config.get("folderPath");
  return folderPath && folderPath.trim() !== "" ? folderPath : path.join(os.homedir(), "VSOrgFiles");
}

function showTaggedAgendaView(tag, items, skippedFiles) {
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

  panel.webview.html = getTaggedWebviewContent(panel.webview, nonce, String(localMoment), tag, items, skippedFiles);

  panel.webview.onDidReceiveMessage(async (message) => {
    console.log("📩 Received message from webview:", message);
    if (message.command === "openFile") {
      const fileName = String(message.file || "");
      if (!fileName) {
        return;
      }

      const orgDir = getOrgFolder();
      const filePath = path.join(orgDir, fileName);
      const uri = vscode.Uri.file(filePath);

      const existing = vscode.window.visibleTextEditors
        .find(e => e && e.document && e.document.uri && e.document.uri.fsPath === uri.fsPath);

      if (existing) {
        vscode.window.showTextDocument(existing.document, existing.viewColumn, false);
        return;
      }

      vscode.workspace.openTextDocument(uri).then(doc => {
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

      const orgDir = getOrgFolder();
      const filePath = path.join(orgDir, fileName);
      const uri = vscode.Uri.file(filePath);

      const revealInEditor = (doc, editor) => {
        if (!editor) return;
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
          return scheduled === dateOnly || deadline === dateOnly;
        }

        let resolvedLine = null;
        const requestedIdx = Number.isFinite(lineNumber) ? (lineNumber - 1) : -1;
        if (requestedIdx >= 0 && requestedIdx < doc.lineCount) {
          const candidateText = doc.lineAt(requestedIdx).text;
          const candidateKeyword = taskKeywordManager.findTaskKeyword(candidateText);
          const candidateIsHeading = buildHeadingStartRegex(taskKeywordManager.getWorkflowRegistry()).test(candidateText);
          const candidateNorm = normalizeHeadlineToTitle(candidateText);
          if (candidateKeyword && candidateIsHeading && (!taskTextForReveal || candidateNorm === taskTextForReveal) && matchesDateAtHeading(requestedIdx)) {
            resolvedLine = requestedIdx;
          }
        }

        if (resolvedLine === null && taskTextForReveal) {
          const headingStartRegex = buildHeadingStartRegex(taskKeywordManager.getWorkflowRegistry());
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
        const pos = new vscode.Position(targetLine, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
      };

      const existing = vscode.window.visibleTextEditors
        .find(e => e && e.document && e.document.uri && e.document.uri.fsPath === uri.fsPath);

      if (existing) {
        vscode.window.showTextDocument(existing.document, existing.viewColumn, false)
          .then(editor => revealInEditor(existing.document, editor));
        return;
      }

      vscode.workspace.openTextDocument(uri).then(doc => {
        vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false)
          .then(editor => revealInEditor(doc, editor));
      });
    } else if (message.command === "changeStatus") {
      const parts = message.text.split(",");
      const newStatus = parts[0];
      const file = parts[1];
      const taskText = (parts[2] || "").replaceAll("&#44;", ",").trim();
      const scheduledDate = parts[3];
      const lineNumber = Number(parts[4]);
      const removeCompleted = message.text.includes("REMOVE_CLOSED") || message.text.includes("REMOVE_COMPLETED");
      console.log("🔄 Changing status:", newStatus, "in file:", file, "for task:", taskText, "with scheduled date:", scheduledDate, "line:", lineNumber);

      const res = await updateTaskStatusInFile(file, taskText, scheduledDate, newStatus, removeCompleted, Number.isFinite(lineNumber) ? lineNumber : null);
      if (res && Number.isFinite(res.oldLineNumber) && Number.isFinite(res.newLineNumber) && res.oldLineNumber > 0 && res.newLineNumber > 0 && res.oldLineNumber !== res.newLineNumber) {
        try {
          panel.webview.postMessage({
            command: 'updateLineNumber',
            file,
            oldLineNumber: res.oldLineNumber,
            newLineNumber: res.newLineNumber
          });
        } catch {
          // best-effort
        }
      }
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

function getTaggedWebviewContent(webview, nonce, localMomentJs, tag, items, skippedFiles) {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const acceptedDateFormats = getAcceptedDateFormats(dateFormat);
  const registry = taskKeywordManager.getWorkflowRegistry();
  const cycleKeywords = registry.getCycleKeywords();
  const keywordToBucket = Object.fromEntries(cycleKeywords.map((k) => [k, getKeywordBucket(k, registry)]));
  const bucketClasses = ["todo", "in_progress", "continued", "done", "abandoned"];
  const stampsClosedKeywords = cycleKeywords.filter((k) => registry.stampsClosed(k));
  const errorBannerContent = (skippedFiles && skippedFiles.length > 0)
    ? escapeText(skippedFiles.map(s => `${s.file} (${s.reason})`).join("; "))
    : "";
  const errorBannerClass = errorBannerContent ? "visible" : "";
  const grouped = {};

  for (const item of items) {
    if (!grouped[item.file]) {
      grouped[item.file] = [];
    }
    grouped[item.file].push(item);
  }

  const fileButtons = Object.keys(grouped).map(file =>
    html`<button class="file-tab" data-target=${file}>${file}</button>`
  ).join(" ");

  const filePanels = Object.entries(grouped).map(([file, tasks]) => {
    const datedTasks = [];
    const undatedTasks = [];
    for (const t of tasks) {
      if (t && (t.scheduledDate || t.deadlineDate)) datedTasks.push(t);
      else undatedTasks.push(t);
    }

    const renderTaskPanel = (item) => {
      const keyword = taskKeywordManager.findTaskKeyword(item.line) || (cycleKeywords[0] || "TODO");
      const keywordClass = getKeywordBucket(keyword, registry);

      const scheduledDate = item.scheduledDate || "";
      const deadlineDate = item.deadlineDate || "";

      let datePillClass = "scheduled scheduledTag";
      let datePillText = "";
      if (scheduledDate) {
        datePillClass = "scheduled scheduledTag";
        datePillText = `SCHEDULED ${scheduledDate}`;
      } else if (deadlineDate) {
        datePillClass = "scheduled deadlineTag";
        datePillText = `DEADLINE ${deadlineDate}`;
      } else {
        datePillClass = "scheduled undatedTag";
        datePillText = "UNDATED";
      }

      const taskTags = (item.tags && item.tags.length) ? item.tags : getAllTagsFromLine(item.line);
      const tagBubbles = taskTags.length
        ? taskTags.map(t => html`<span class="tag-badge">${t}</span>`).join("")
        : "";

      const taskText = stripAllTagSyntax(item.line)
        .replace(/.*?\] -/, "")
        .replace(/\s+SCHEDULED:.*/, "")
        .trim();

      const cleanedTaskText = taskKeywordManager.cleanTaskText(taskText).trim();

      const cookie = findCheckboxCookie(item.line);
      const checkboxLabel = cookie
        ? html`<span class="checkbox-stats">${formatCheckboxStats({ checked: item.checkboxChecked, total: item.checkboxTotal }, cookie.mode)}</span>`
        : "";

      function localEscapeLeadingSpaces(s) {
        const str = String(s || "");
        const m = str.match(/^(\s*)/);
        const lead = m ? m[1] : "";
        const rest = str.slice(lead.length);
        const leadEsc = lead.replace(/ /g, "\u00A0").replace(/\t/g, "\u00A0\u00A0");
        return leadEsc + rest;
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
            const indentSpan = indent ? html`<span class="subtask-indent">${localEscapeLeadingSpaces(indent)}</span>` : "";
            const keywordSpan = html`<span class=${bucket} data-filename=${fileName} data-text=${childTaskText} data-date="" data-line=${safeLine}>${keyword}</span>`;
            const taskTextSpan = html`<span class="taskText agenda-task-link" data-file=${fileName} data-line=${safeLine} data-text=${childTaskText} data-date="">${childTaskText}</span>`;
            return html`<div class="detail-line subtask-line">${indentSpan}${keywordSpan}${taskTextSpan}</div>`;
          }

          const m = text.match(/^(\s*)([-+*]|\d+[.)])\s+\[( |x|X|-)\]\s+(.*)$/);
          if (!m) {
            return html`<div class="detail-line">${localEscapeLeadingSpaces(text)}</div>`;
          }
          const indentLen = (m[1] || "").length;
          const bullet = localEscapeLeadingSpaces((m[1] || "") + (m[2] || "-"));
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

      const childrenBlock = renderChildrenBlock(item.children, file, item.lineNumber);

      const lateLabel = scheduledDate && momentFromTimestampContent(scheduledDate, acceptedDateFormats, true).isBefore(moment(), "day")
        ? html`<span class="late">LATE: ${scheduledDate}</span>` : "";

      let deadlineBadge = "";
      if (deadlineDate) {
        const deadlineMoment = momentFromTimestampContent(deadlineDate, acceptedDateFormats, true);
        if (deadlineMoment.isValid()) {
          const today = moment().startOf("day");
          const daysUntil = deadlineMoment.diff(today, "days");
          if (daysUntil < 0) {
            deadlineBadge = html`<span class="deadline deadline-overdue">⚠ OVERDUE: ${deadlineMoment.format("MMM Do")}</span>`;
          } else if (daysUntil === 0) {
            deadlineBadge = html`<span class="deadline deadline-today">⚠ DUE TODAY</span>`;
          } else if (daysUntil <= 3) {
            deadlineBadge = html`<span class="deadline deadline-soon">⏰ Due in ${daysUntil} day${daysUntil > 1 ? 's' : ''}</span>`;
          } else {
            deadlineBadge = html`<span class="deadline deadline-future">📅 Due: ${deadlineMoment.format("MMM Do")}</span>`;
          }
        }
      }

      // Build individual elements with proper escaping
      const dateForReveal = scheduledDate || deadlineDate || "";
      const filenameSpan = html`<span class="filename" data-file=${file} data-line=${String(item.lineNumber)} data-text=${cleanedTaskText} data-date=${scheduledDate} data-reveal-date=${dateForReveal}>${file}:</span>`;
      // Keep data-date on the status span as scheduled-only for back-compat with changeStatus message parsing.
      const keywordSpan = html`<span class=${keywordClass} data-filename=${file} data-text=${cleanedTaskText} data-date=${scheduledDate} data-line=${String(item.lineNumber)}>${keyword}</span>`;
      const taskTextSpan = html`<span class="taskText agenda-task-link" data-file=${file} data-line=${String(item.lineNumber)} data-text=${cleanedTaskText} data-date=${scheduledDate} data-reveal-date=${dateForReveal}>${cleanedTaskText}</span>`;

      // Assemble using plain template literals since all parts are pre-built HTML
      return `
        <div class="${escapeAttr("panel " + file)}">
          <div class="textDiv">
            ${filenameSpan}
            ${keywordSpan}
            ${taskTextSpan}
            ${checkboxLabel}
            ${lateLabel}
            ${deadlineBadge}
            <span class="${escapeAttr(datePillClass)}">${escapeText(datePillText)}</span>
            ${tagBubbles}
          </div>
          ${childrenBlock}
        </div>`;
    };

    const datedPanels = datedTasks.map(renderTaskPanel).join("");
    const undatedPanels = undatedTasks.map(renderTaskPanel).join("");
    const undatedHeader = undatedPanels ? `<div class="section-header">UNDATED</div>` : "";
    const taskPanels = `${datedPanels}${undatedHeader}${undatedPanels}`;

    const fileHeading = html`<h3>${file}:</h3>`;
    return `
        <div class="file-group" id="${escapeAttr(file)}" style="display: none;">
              ${fileHeading}
              ${taskPanels}
            </div>`;
  }).join("");

  // Defense-in-depth: don't allow arbitrary https scripts. Only allow cdnjs (moment fallback) + local webview.
  const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'nonce-${nonce}' https:; script-src ${webview.cspSource} 'nonce-${nonce}' https://cdnjs.cloudflare.com`;
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

        .scheduled.deadlineTag{
          background-color: #ffb3b3;
        }

        .scheduled.undatedTag{
          background-color: #d1d1d1;
        }

        .section-header{
          margin: 12px 0 6px;
          font-weight: 700;
          opacity: 0.85;
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
        .detail-line.subtask-line {
          display: block;
          padding: 2px 0;
        }

        .detail-line.subtask-line .taskText {
          margin-left: 6px;
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
</head>
<body>
  <h1>Tagged Agenda: ${tag}</h1>
  <div id="error-banner" class="${errorBannerClass}">${errorBannerContent}</div>
  <div style="margin-bottom: 10px;">
  <button class="expand-collapse" id="expand-all">Expand All</button>
  <button class="expand-collapse" id="collapse-all">Collapse All</button>
  </div>
  <div><strong>Files:</strong> ${fileButtons}</div>
  <div id="display-agenda">${filePanels}</div>

  
  <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const dateFormat = "${dateFormat}";
      const revealTaskOnClick = ${config.get("agendaRevealTaskOnClick", true) ? "true" : "false"};
      const highlightTaskOnClick = ${config.get("agendaHighlightTaskOnClick", true) ? "true" : "false"};

      const LS_GROUP_STATE_KEY = 'org-vscode.taggedAgenda.groupState:' + ${JSON.stringify(tag)};
      const LS_OPEN_DETAILS_KEY = 'org-vscode.taggedAgenda.openDetails:' + ${JSON.stringify(tag)};

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

      function getVisibleGroupIds() {
        const groups = Array.from(document.getElementsByClassName('file-group'));
        return groups.filter(g => g && g.style && g.style.display === 'block').map(g => g.id);
      }

      function restoreGroupVisibility() {
        const state = loadJsonFromLocalStorage(LS_GROUP_STATE_KEY, null);
        const groups = Array.from(document.getElementsByClassName('file-group'));
        if (!groups.length) return;

        if (state && state.mode === 'all') {
          groups.forEach(g => { g.style.display = 'block'; });
          return;
        }
        if (state && state.mode === 'single' && typeof state.id === 'string' && state.id) {
          groups.forEach(g => { g.style.display = (g.id === state.id) ? 'block' : 'none'; });
          return;
        }
        // Default: keep existing (usually none visible).
      }

      function persistGroupVisibility() {
        const visible = getVisibleGroupIds();
        if (visible.length === 0) {
          saveJsonToLocalStorage(LS_GROUP_STATE_KEY, { mode: 'none' });
        } else if (visible.length === 1) {
          saveJsonToLocalStorage(LS_GROUP_STATE_KEY, { mode: 'single', id: visible[0] });
        } else {
          saveJsonToLocalStorage(LS_GROUP_STATE_KEY, { mode: 'all' });
        }
      }

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

        const els = Array.from(panel.querySelectorAll('[data-line]'));
        for (const el of els) {
          const lineRaw = el.getAttribute('data-line');
          const lineNum = lineRaw ? parseInt(lineRaw, 10) : NaN;
          if (!Number.isFinite(lineNum)) continue;
          const next = lineNum + delta;
          if (next > 0) el.setAttribute('data-line', String(next));
        }

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

    // Initialize indeterminate display for partial checkboxes.
    Array.from(document.querySelectorAll('input.org-checkbox[data-state="partial"]'))
      .forEach(i => { try { i.indeterminate = true; } catch (e) {} });

      restoreGroupVisibility();
      restoreOpenDetails();
      Array.from(document.querySelectorAll('details.children-block[data-details-key]')).forEach(d => {
        d.addEventListener('toggle', () => { persistOpenDetails(); });
      });

      // Toggle file groups on file-tab click
      document.addEventListener('click', function(event) {
          const revealEl = (event.target && event.target.closest)
          ? event.target.closest('.agenda-task-link[data-file][data-line], .filename[data-file][data-line]')
          : null;

          if (revealEl && revealTaskOnClick) {
            const file = revealEl.getAttribute('data-file');
            const lineRaw = revealEl.getAttribute('data-line');
            const lineNumber = lineRaw ? parseInt(lineRaw, 10) : NaN;
            const taskText = String(revealEl.getAttribute('data-text') || '').trim();
            const date = String(revealEl.getAttribute('data-reveal-date') || revealEl.getAttribute('data-date') || '').trim();
            if (file && Number.isFinite(lineNumber)) {
              vscode.postMessage({ command: 'revealTask', file, lineNumber, taskText, date });
              if (highlightTaskOnClick) {
                document.querySelectorAll('.panel.agenda-selected').forEach(p => p.classList.remove('agenda-selected'));
                const panel = revealEl.closest('.panel');
                if (panel) panel.classList.add('agenda-selected');
              }
              return;
            }
          }

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
              persistGroupVisibility();
          }
          // Expand All / Collapse All
          if (event.target.id === "expand-all") {
              let groups = document.getElementsByClassName("file-group");
              for (let i = 0; i < groups.length; i++) {
                  groups[i].style.display = "block";
              }
              persistGroupVisibility();
          }

          if (event.target.id === "collapse-all") {
              let groups = document.getElementsByClassName("file-group");
              for (let i = 0; i < groups.length; i++) {
                  groups[i].style.display = "none";
              }
              persistGroupVisibility();
          }

          if (event.target.classList.contains("filename")) {
              vscode.postMessage({
                  command: 'openFile',
                  file: event.target.dataset.file
              });
          }

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

              let safeText = event.target.dataset.text.replaceAll(",", "&#44;");
              let safeDate = event.target.dataset.date.replaceAll(",", "&#44;");
              const safeLine = String(event.target.dataset.line || "").replaceAll(",", "&#44;");
              let messageText = nextStatus + "," + event.target.dataset.filename + "," + safeText + "," + safeDate + "," + safeLine;

                if (stampsClosed.includes(nextStatus)) {
                  let completedDate = moment();
                  let formattedDate = completedDate.format(dateFormat + " ddd HH:mm");
                  messageText += ",CLOSED:[" + formattedDate + "]";
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
  </script>

</body>
</html>`;
}
