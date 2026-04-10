"use strict";

const vscode = require("vscode");
const { parseHeadingInfo, findNearestHeadingStart } = require("./moveBlockUtils");
const { isPlanningLine, getAcceptedDateFormats } = require("./orgTagUtils");
const {
  closeClockLine,
  computeClockTableRows,
  findOpenClockLineInSubtree,
  formatDuration,
  formatOrgClockTimestamp
} = require("./clockUtils");
const { normalizeBodyIndentation } = require("./indentUtils");

function findDrawerEnd(lines, beginLineIndex) {
  for (let i = beginLineIndex + 1; i < lines.length; i++) {
    if (/^\s*:END:\s*$/i.test(String(lines[i] || ""))) return i;
  }
  return -1;
}

function locateClockInsertPoint(lines, headingLineIndex, bodyIndent, drawerName) {
  const headingIndent = (String(lines[headingLineIndex] || "").match(/^(\s*)/) || ["", ""])[1];
  const drawerIndent = `${headingIndent}${bodyIndent}`;
  const drawerBeginRe = new RegExp(`^\\s*:${String(drawerName || "LOGBOOK").replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}:\\s*$`, "i");

  let i = headingLineIndex + 1;
  while (i < lines.length && isPlanningLine(lines[i])) i++;
  while (i < lines.length && !String(lines[i] || "").trim()) i++;

  if (i < lines.length && /^\s*:PROPERTIES:\s*$/i.test(String(lines[i] || ""))) {
    const end = findDrawerEnd(lines, i);
    if (end !== -1) {
      i = end + 1;
      while (i < lines.length && !String(lines[i] || "").trim()) i++;
    }
  }

  if (i < lines.length && drawerBeginRe.test(String(lines[i] || ""))) {
    const end = findDrawerEnd(lines, i);
    if (end !== -1) {
      return {
        insertLine: end,
        text: `${drawerIndent}CLOCK: `
      };
    }
  }

  return {
    insertLine: i,
    text: `${drawerIndent}:${drawerName}:\n${drawerIndent}CLOCK: \n${drawerIndent}:END:\n`
  };
}

function findClocktableBounds(lines, cursorLine) {
  let begin = -1;
  let end = -1;

  for (let i = cursorLine; i >= 0; i--) {
    if (/^\s*#\+BEGIN_CLOCKTABLE\b/i.test(String(lines[i] || ""))) {
      begin = i;
      break;
    }
    if (/^\s*#\+END_CLOCKTABLE\b/i.test(String(lines[i] || ""))) break;
  }

  if (begin === -1) return null;

  for (let i = begin + 1; i < lines.length; i++) {
    if (/^\s*#\+END_CLOCKTABLE\b/i.test(String(lines[i] || ""))) {
      end = i;
      break;
    }
  }

  if (end === -1) return null;
  return { begin, end };
}

async function clockIn() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "vso") return;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const drawerName = config.get("logDrawerName", "LOGBOOK");

  const document = editor.document;
  const lines = document.getText().split(/\r?\n/);
  const heading = findNearestHeadingStart(lines, editor.selection.active.line);
  if (!heading || (heading.info && heading.info.isDayHeading)) {
    vscode.window.showWarningMessage("Place cursor on a task heading to clock in.");
    return;
  }

  const openClockLine = findOpenClockLineInSubtree(lines, heading.startLine);
  if (openClockLine !== -1) {
    vscode.window.showWarningMessage("This task already has an open CLOCK entry.");
    return;
  }

  const now = formatOrgClockTimestamp(new Date(), dateFormat);
  const insertion = locateClockInsertPoint(lines, heading.startLine, bodyIndent, drawerName);
  const edit = new vscode.WorkspaceEdit();

  if (insertion.text.includes("CLOCK: \n")) {
    const text = insertion.text.replace("CLOCK: \n", `CLOCK: [${now}]\n`);
    edit.insert(document.uri, new vscode.Position(insertion.insertLine, 0), text);
  } else {
    edit.insert(document.uri, new vscode.Position(insertion.insertLine, 0), `${insertion.text}[${now}]\n`);
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    vscode.window.showErrorMessage("Clock In failed to apply changes.");
    return;
  }

  await document.save();
  vscode.window.showInformationMessage("Clocked in.");
}

async function clockOut() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "vso") return;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const document = editor.document;
  const lines = document.getText().split(/\r?\n/);

  const heading = findNearestHeadingStart(lines, editor.selection.active.line);
  if (!heading || (heading.info && heading.info.isDayHeading)) {
    vscode.window.showWarningMessage("Place cursor on a task heading to clock out.");
    return;
  }

  const openClockLine = findOpenClockLineInSubtree(lines, heading.startLine);
  if (openClockLine === -1) {
    vscode.window.showWarningMessage("No open CLOCK entry found for this task.");
    return;
  }

  const endTs = formatOrgClockTimestamp(new Date(), dateFormat);
  const closed = closeClockLine(lines[openClockLine], endTs);
  if (!closed.changed) {
    vscode.window.showWarningMessage("Could not close CLOCK entry.");
    return;
  }

  const docLine = document.lineAt(openClockLine);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, docLine.range, closed.line);

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    vscode.window.showErrorMessage("Clock Out failed to apply changes.");
    return;
  }

  await document.save();
  vscode.window.showInformationMessage("Clocked out.");
}

async function updateClockTable() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "vso") return;

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "YYYY-MM-DD");
  const accepted = getAcceptedDateFormats(dateFormat);
  const document = editor.document;
  const lines = document.getText().split(/\r?\n/);
  const bounds = findClocktableBounds(lines, editor.selection.active.line);

  const summary = computeClockTableRows(lines, accepted);
  const tableLines = [
    "| Heading | Time |",
    "| --- | ---: |",
    ...summary.rows.map((r) => `| ${r.heading.replace(/\|/g, "\\|")} | ${formatDuration(r.minutes)} |`),
    `| *Total* | *${formatDuration(summary.totalMinutes)}* |`
  ];
  const tableBody = tableLines.join("\n");

  const edit = new vscode.WorkspaceEdit();
  if (!bounds) {
    const insertAt = editor.selection.active.line + 1;
    const block = `#+BEGIN_CLOCKTABLE\n${tableBody}\n#+END_CLOCKTABLE\n`;
    edit.insert(document.uri, new vscode.Position(insertAt, 0), block);
  } else {
    const start = new vscode.Position(bounds.begin + 1, 0);
    const end = new vscode.Position(bounds.end, 0);
    edit.replace(document.uri, new vscode.Range(start, end), `${tableBody}\n`);
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    vscode.window.showErrorMessage("Update Clock Table failed to apply changes.");
    return;
  }

  await document.save();
  vscode.window.showInformationMessage("Clock table updated.");
}

module.exports = {
  clockIn,
  clockOut,
  updateClockTable
};
