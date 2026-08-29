"use strict";

const vscode = require("vscode");
const { getDocumentLinks } = require("./orgLinkProvider");
const { insertNewElement } = require("./smartInsertNewElement");
const { classifyContext, commandForContext } = require("./contextActionUtils");
const taskKeywordManager = require("./taskKeywordManager");
const moment = require("moment");
const { getAcceptedDateFormats } = require("./orgTagUtils");

const TIMESTAMP_AT_CURSOR_RE = /([<[])(\d{2,4}-\d{2}-\d{2,4})([^>\]]*)([>\]])/g;

async function advanceTimestampAtCursor(editor) {
  const position = editor.selection.active;
  const line = editor.document.lineAt(position.line);
  TIMESTAMP_AT_CURSOR_RE.lastIndex = 0;
  let target = null;
  for (let match; (match = TIMESTAMP_AT_CURSOR_RE.exec(line.text)); ) {
    if (position.character >= match.index && position.character < match.index + match[0].length) {
      target = match;
      break;
    }
  }
  if (!target) return false;

  const dateFormat = vscode.workspace.getConfiguration("Org-vscode").get("dateFormat", "YYYY-MM-DD");
  const parsed = moment(target[2], getAcceptedDateFormats(dateFormat), true);
  if (!parsed.isValid()) return false;
  const nextDate = parsed.add(1, "day").format(dateFormat);
  const suffix = target[3].replace(/^(\s+)[A-Za-z]{3}\b/, `$1${parsed.format("ddd")}`);
  const replacement = `${target[1]}${nextDate}${suffix}${target[4]}`;
  const range = new vscode.Range(
    new vscode.Position(position.line, target.index),
    new vscode.Position(position.line, target.index + target[0].length)
  );
  return editor.edit((editBuilder) => editBuilder.replace(range, replacement));
}

async function followLinkAtCursor(editor) {
  const position = editor.selection.active;
  const link = getDocumentLinks(editor.document).find((candidate) => candidate.range.contains(position));
  if (!link?.target) return false;
  if (link.target.scheme === "command") {
    if (link.target.path !== "org-vscode.followOrgLink") return false;
    try {
      const args = link.target.query ? JSON.parse(decodeURIComponent(link.target.query)) : undefined;
      await vscode.commands.executeCommand(link.target.path, args);
      return true;
    } catch {
      return false;
    }
  }
  await vscode.commands.executeCommand("vscode.open", link.target);
  return true;
}

async function executeContextAction() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !["vso", "org", "vsorg", "org-vscode"].includes(editor.document.languageId)) return null;

  const position = editor.selection.active;
  const markers = taskKeywordManager.getWorkflowRegistry().states.map((state) => state.marker).filter(Boolean);
  const context = classifyContext(editor.document.lineAt(position.line).text, position.character, markers);
  if (context === "link") {
    const followed = await followLinkAtCursor(editor);
    return followed ? context : null;
  }
  if (context === "timestamp") {
    const updated = await advanceTimestampAtCursor(editor);
    return updated ? context : null;
  }

  const command = commandForContext(context);
  if (!command) {
    vscode.window.showInformationMessage("Org-vscode: No context action is available here.");
    return null;
  }
  await vscode.commands.executeCommand(command);
  return context;
}

function registerContextActions(ctx) {
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.contextAction", executeContextAction));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.insertStructureAtEnd", insertNewElement));
}

module.exports = {
  advanceTimestampAtCursor,
  classifyContext,
  commandForContext,
  executeContextAction,
  followLinkAtCursor,
  registerContextActions
};