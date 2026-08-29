"use strict";

const vscode = require("vscode");
const crypto = require("crypto");
const path = require("path");
const { ensureIdInLines } = require("./orgProperties");
const { buildPinyinAliases } = require("./pinyinHeadingSearch");
const {
  ORG_FILE_GLOB,
  ORG_FILE_EXCLUDE_GLOB,
  collectHeadingTargets,
  formatIdLink
} = require("./orgLinkTargets");

function isOrgDocument(document) {
  return ["vso", "org", "vsorg", "org-vscode"].includes(document?.languageId);
}

function getDocumentLines(document) {
  return document.getText().split(/\r?\n/);
}

function getDocumentEol(document) {
  return document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
}

function replaceWholeDocument(document, lines) {
  const lastLine = Math.max(0, document.lineCount - 1);
  const lastChar = document.lineAt(lastLine).text.length;
  const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(lastLine, lastChar));
  const eol = getDocumentEol(document);
  const hadFinalNewline = document.getText().endsWith("\n");
  let text = lines.join(eol);
  if (hadFinalNewline && !text.endsWith(eol)) text += eol;

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, range, text);
  return vscode.workspace.applyEdit(edit);
}

async function collectWorkspaceHeadingTargets() {
  const fileUris = await vscode.workspace.findFiles(ORG_FILE_GLOB, ORG_FILE_EXCLUDE_GLOB, 2000);
  const documentsByUri = new Map();
  const targets = [];

  for (const document of vscode.workspace.textDocuments || []) {
    if (!isOrgDocument(document)) continue;
    documentsByUri.set(document.uri.toString(), document);
    targets.push(...collectHeadingTargets(getDocumentLines(document), document.uri));
  }
  for (const uri of fileUris) {
    const key = uri.toString();
    if (documentsByUri.has(key)) continue;
    try {
      const data = await vscode.workspace.fs.readFile(uri);
      const lines = Buffer.from(data).toString("utf8").split(/\r?\n/);
      targets.push(...collectHeadingTargets(lines, uri));
    } catch {
      // Ignore unreadable workspace files.
    }
  }
  return targets;
}

function createTargetPick(target, pinyinSearchEnabled = false) {
  const relativePath = target.uri.scheme === "file"
    ? vscode.workspace.asRelativePath(target.uri, false)
    : path.basename(target.uri.path || target.uri.toString());
  const pick = {
    label: `$(symbol-namespace) ${target.title}`,
    description: `${relativePath}:${target.line + 1}`,
    detail: target.id ? `Existing ID: ${target.id}` : "An ID will be created",
    target
  };
  if (pinyinSearchEnabled) {
    const aliases = buildPinyinAliases(target.title, { enabled: true });
    if (aliases.length) pick.detail += ` | Pinyin: ${aliases.join(" ")}`;
  }
  return pick;
}

async function chooseHeadingTarget(targetOverride) {
  if (targetOverride?.uri && Number.isInteger(targetOverride.line)) return targetOverride;

  const targets = await collectWorkspaceHeadingTargets();
  if (!targets.length) {
    vscode.window.showInformationMessage("Org-vscode: No workspace headings found.");
    return null;
  }

  const pinyinSearchEnabled = vscode.workspace
    .getConfiguration("Org-vscode")
    .get("enablePinyinHeadingSearch", false);
  const picks = targets
    .map((target) => createTargetPick(target, pinyinSearchEnabled))
    .sort((left, right) => left.label.localeCompare(right.label) || left.description.localeCompare(right.description));
  const picked = await vscode.window.showQuickPick(picks, {
    placeHolder: "Select an Org heading to link",
    matchOnDescription: true,
    matchOnDetail: true
  });
  return picked?.target || null;
}

async function insertHeadingLink(targetOverride) {
  const sourceEditor = vscode.window.activeTextEditor;
  if (!sourceEditor || !isOrgDocument(sourceEditor.document)) {
    vscode.window.showInformationMessage("Org-vscode: Open an Org file to insert a link.");
    return;
  }

  const target = await chooseHeadingTarget(targetOverride);
  if (!target) return;

  const targetDocument = await vscode.workspace.openTextDocument(target.uri);
  const targetWasDirty = targetDocument.isDirty;
  const targetLines = getDocumentLines(targetDocument);
  const currentTarget = collectHeadingTargets(targetLines, targetDocument.uri)
    .find((candidate) => candidate.line === target.line);
  if (!currentTarget) {
    vscode.window.showWarningMessage("Org-vscode: The selected heading no longer exists.");
    return;
  }

  const ensured = ensureIdInLines(targetLines, currentTarget.line, () => crypto.randomUUID());
  if (!ensured.id) {
    vscode.window.showErrorMessage("Org-vscode: Failed to create an ID for the selected heading.");
    return;
  }
  if (ensured.changed && !(await replaceWholeDocument(targetDocument, ensured.lines))) {
    vscode.window.showErrorMessage("Org-vscode: Failed to update the selected heading.");
    return;
  }
  if (
    ensured.changed &&
    !targetWasDirty &&
    targetDocument.uri.scheme === "file" &&
    targetDocument.uri.toString() !== sourceEditor.document.uri.toString() &&
    !(await targetDocument.save())
  ) {
    vscode.window.showErrorMessage("Org-vscode: Failed to save the selected heading ID.");
    return;
  }

  await vscode.window.showTextDocument(sourceEditor.document, sourceEditor.viewColumn);
  const link = formatIdLink(ensured.id, currentTarget.title);
  const inserted = await sourceEditor.edit((editBuilder) => editBuilder.replace(sourceEditor.selection, link));
  if (!inserted) vscode.window.showErrorMessage("Org-vscode: Failed to insert the link.");
}

function registerOrgLinkCommands(ctx) {
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.insertHeadingLink", insertHeadingLink));
}

module.exports = {
  collectWorkspaceHeadingTargets,
  createTargetPick,
  insertHeadingLink,
  registerOrgLinkCommands
};