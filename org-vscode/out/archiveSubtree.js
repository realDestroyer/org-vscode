"use strict";

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { findNearestHeadingStart, findSubtreeEndExclusive } = require("./moveBlockUtils");

function getLineDeleteRange(document, startLine, endExclusive) {
  const start = new vscode.Position(startLine, 0);
  if (endExclusive < document.lineCount) {
    const end = new vscode.Position(endExclusive, 0);
    return new vscode.Range(start, end);
  }

  const lastLine = document.lineAt(document.lineCount - 1);
  return new vscode.Range(start, lastLine.range.end);
}

module.exports = async function archiveSubtree() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("Open an Org file and place your cursor on a heading to archive it.");
    return;
  }

  const document = editor.document;
  const filePath = document.uri.fsPath;
  const fileNameLower = path.basename(filePath).toLowerCase();
  if (!(fileNameLower.endsWith(".org") || fileNameLower.endsWith(".org_archive"))) {
    vscode.window.showWarningMessage("Archive Subtree works only in .org or .org_archive files.");
    return;
  }

  const lines = document.getText().split(/\r?\n/);
  if (!lines.length) {
    vscode.window.showInformationMessage("Nothing to archive in this file.");
    return;
  }

  const heading = findNearestHeadingStart(lines, editor.selection.active.line);
  if (!heading) {
    vscode.window.showWarningMessage("No heading found at or above cursor.");
    return;
  }

  if (heading.info && heading.info.isDayHeading) {
    vscode.window.showWarningMessage("Day headings are not archivable as subtrees. Select a task heading.");
    return;
  }

  const startLine = heading.startLine;
  const endExclusive = findSubtreeEndExclusive(lines, startLine, heading.info);
  if (endExclusive <= startLine) {
    vscode.window.showWarningMessage("Could not determine subtree range to archive.");
    return;
  }

  const subtreeLines = lines.slice(startLine, endExclusive);
  const subtreeText = subtreeLines.join("\n").trimEnd();
  if (!subtreeText.trim()) {
    vscode.window.showWarningMessage("Selected subtree is empty.");
    return;
  }

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const archiveFolderName = config.get("archiveFolderName", "Archived");
  const sourceBaseName = path.basename(filePath, path.extname(filePath));
  const archiveDir = path.join(path.dirname(filePath), archiveFolderName);
  const archivePath = path.join(archiveDir, `${sourceBaseName}.org_archive`);

  const headingPreview = (subtreeLines[0] || "").trim().slice(0, 120);
  const answer = await vscode.window.showWarningMessage(
    `Archive this subtree to ${path.basename(archivePath)}?`,
    { modal: true, detail: headingPreview || "Subtree" },
    "Archive"
  );
  if (answer !== "Archive") {
    return;
  }

  try {
    fs.mkdirSync(archiveDir, { recursive: true });
    const existing = fs.existsSync(archivePath) ? fs.readFileSync(archivePath, "utf8").trimEnd() : "";
    const archiveBody = existing ? `${existing}\n\n${subtreeText}\n` : `${subtreeText}\n`;
    fs.writeFileSync(archivePath, archiveBody, "utf8");
  } catch (err) {
    vscode.window.showErrorMessage(`Failed writing archive file: ${err.message}`);
    return;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.delete(document.uri, getLineDeleteRange(document, startLine, endExclusive));
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    vscode.window.showErrorMessage("Failed to remove subtree from source file after archiving.");
    return;
  }

  try {
    await document.save();
  } catch (_) {
    // Best effort only.
  }

  vscode.window.showInformationMessage(`Archived subtree to ${archivePath}`);
};
