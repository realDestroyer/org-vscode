"use strict";

const vscode = require("vscode");
const { insertStructureAtEnd } = require("./smartInsertNewElement");
const { alignOrgTableLines, classifyContext, commandForContext, renumberOrderedListLines } = require("./contextActionUtils");
const taskKeywordManager = require("./taskKeywordManager");
const moment = require("moment");
const { getAcceptedDateFormats } = require("./orgTagUtils");

const TIMESTAMP_AT_CURSOR_RE = /([<[])(\d{2,4}-\d{2}-\d{2,4})([^>\]]*)([>\]])/g;

async function fixTimestampDayAtCursor(editor) {
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
  const weekday = parsed.format("ddd");
  const suffix = /^[ ]+[A-Za-z]{3}\b/.test(target[3])
    ? target[3].replace(/^([ ]+)[A-Za-z]{3}\b/, `$1${weekday}`)
    : ` ${weekday}${target[3]}`;
  const replacement = `${target[1]}${target[2]}${suffix}${target[4]}`;
  const range = new vscode.Range(
    new vscode.Position(position.line, target.index),
    new vscode.Position(position.line, target.index + target[0].length)
  );
  return editor.edit((editBuilder) => editBuilder.replace(range, replacement));
}

async function alignTableAtCursor(editor) {
  const line = editor.selection.active.line;
  let start = line;
  let end = line;
  while (start > 0 && /^\s*\|/.test(editor.document.lineAt(start - 1).text)) start -= 1;
  while (end + 1 < editor.document.lineCount && /^\s*\|/.test(editor.document.lineAt(end + 1).text)) end += 1;
  const source = [];
  for (let index = start; index <= end; index++) source.push(editor.document.lineAt(index).text);
  const replacement = alignOrgTableLines(source).join("\n");
  const range = new vscode.Range(new vscode.Position(start, 0), editor.document.lineAt(end).range.end);
  return editor.edit((editBuilder) => editBuilder.replace(range, replacement));
}

async function renumberOrderedListAtCursor(editor) {
  const line = editor.selection.active.line;
  const source = [];
  for (let index = 0; index < editor.document.lineCount; index++) source.push(editor.document.lineAt(index).text);
  const updated = renumberOrderedListLines(source, line);
  const edits = [];
  for (let index = 0; index < source.length; index++) {
    if (source[index] !== updated[index]) edits.push({ index, text: updated[index] });
  }
  if (!edits.length) return true;
  return editor.edit((editBuilder) => {
    for (const edit of edits) editBuilder.replace(editor.document.lineAt(edit.index).range, edit.text);
  });
}

async function executeContextAction() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !["vso", "org", "vsorg", "org-vscode"].includes(editor.document.languageId)) return null;

  const position = editor.selection.active;
  const markers = taskKeywordManager.getWorkflowRegistry().states.map((state) => state.marker).filter(Boolean);
  const context = classifyContext(editor.document.lineAt(position.line).text, position.character, markers);
  if (context === "timestamp") {
    const updated = await fixTimestampDayAtCursor(editor);
    return updated ? context : null;
  }
  if (context === "table") return await alignTableAtCursor(editor) ? context : null;
  if (context === "ordered-list") return await renumberOrderedListAtCursor(editor) ? context : null;

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
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.insertStructureAtEnd", insertStructureAtEnd));
}

module.exports = {
  alignTableAtCursor,
  classifyContext,
  commandForContext,
  executeContextAction,
  fixTimestampDayAtCursor,
  renumberOrderedListAtCursor,
  registerContextActions
};