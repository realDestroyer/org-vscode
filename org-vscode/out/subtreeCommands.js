"use strict";

const vscode = require("vscode");
const path = require("path");
const { collectWorkspaceHeadingTargets } = require("./orgLinkCommands");
const { collectHeadingTargets } = require("./orgLinkTargets");
const taskKeywordManager = require("./taskKeywordManager");
const {
  computeRefilePlan,
  computeSubtreeLevelResult
} = require("./subtreeStructureUtils");

function isOrgDocument(document) {
  return ["vso", "org", "vsorg", "org-vscode"].includes(document?.languageId);
}

function getLines(document) {
  return document.getText().split(/\r?\n/);
}

function getSpacesPerLevel() {
  const raw = vscode.workspace.getConfiguration("Org-vscode").get("adjustHeadingIndentation", 2);
  if (typeof raw === "boolean") return raw ? 2 : 0;
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 2;
}

function getUnicodeMarkers() {
  return taskKeywordManager.getWorkflowRegistry().states
    .map((state) => state.marker)
    .filter((marker) => typeof marker === "string" && marker.length > 0);
}

function getWholeDocumentRange(document) {
  const lastLine = Math.max(0, document.lineCount - 1);
  return new vscode.Range(new vscode.Position(0, 0), document.lineAt(lastLine).range.end);
}

function formatDocumentText(document, lines) {
  const eol = document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
  const hadFinalNewline = document.getText().endsWith("\n");
  let text = lines.join(eol);
  if (hadFinalNewline && !text.endsWith(eol)) text += eol;
  return text;
}

async function changeSubtreeLevel(delta) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isOrgDocument(editor.document)) {
    vscode.window.showWarningMessage("Org-vscode: Open an Org file and place the cursor in a subtree.");
    return false;
  }

  const result = computeSubtreeLevelResult(
    getLines(editor.document),
    editor.selection.active.line,
    delta,
    getSpacesPerLevel(),
    getUnicodeMarkers()
  );
  if (!result) {
    vscode.window.showWarningMessage(delta < 0
      ? "Org-vscode: This subtree cannot be promoted further."
      : "Org-vscode: No movable subtree found at the cursor.");
    return false;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.replace(editor.document.uri, getWholeDocumentRange(editor.document), formatDocumentText(editor.document, result.updatedLines));
  return vscode.workspace.applyEdit(edit);
}

function createRefilePick(target) {
  const relativePath = target.uri.scheme === "file"
    ? vscode.workspace.asRelativePath(target.uri, false)
    : path.basename(target.uri.path || target.uri.toString());
  return {
    label: `$(symbol-namespace) ${target.title}`,
    description: `${relativePath}:${target.line + 1}`,
    target
  };
}

async function chooseRefileTarget(sourceDocument, sourceStartLine, sourceEndExclusive, targetOverride) {
  if (targetOverride?.uri && Number.isInteger(targetOverride.line)) return targetOverride;

  const sourceUri = sourceDocument.uri.toString();
  const targets = (await collectWorkspaceHeadingTargets()).filter((target) => (
    target.uri.toString() !== sourceUri ||
    target.line < sourceStartLine ||
    target.line >= sourceEndExclusive
  ));
  if (!targets.length) {
    vscode.window.showInformationMessage("Org-vscode: No valid refile targets found.");
    return null;
  }

  const picked = await vscode.window.showQuickPick(
    targets.map(createRefilePick).sort((left, right) => (
      left.label.localeCompare(right.label) || left.description.localeCompare(right.description)
    )),
    {
      placeHolder: "Select a heading to receive this subtree",
      matchOnDescription: true
    }
  );
  return picked?.target || null;
}

async function refileSubtree(targetOverride) {
  const sourceEditor = vscode.window.activeTextEditor;
  if (!sourceEditor || !isOrgDocument(sourceEditor.document)) {
    vscode.window.showWarningMessage("Org-vscode: Open an Org file and place the cursor in a subtree.");
    return false;
  }

  const sourceDocument = sourceEditor.document;
  const sourceLines = getLines(sourceDocument);
  const sourceVersion = sourceDocument.version;
  const sourceCursorLine = sourceEditor.selection.active.line;
  const preliminary = computeSubtreeLevelResult(
    sourceLines,
    sourceCursorLine,
    1,
    getSpacesPerLevel(),
    getUnicodeMarkers()
  );
  if (!preliminary) {
    vscode.window.showWarningMessage("Org-vscode: No movable subtree found at the cursor.");
    return false;
  }

  const target = await chooseRefileTarget(
    sourceDocument,
    preliminary.startLine,
    preliminary.endExclusive,
    targetOverride
  );
  if (!target) return false;

  if (sourceDocument.version !== sourceVersion) {
    vscode.window.showWarningMessage("Org-vscode: The source changed while selecting a target. Run Refile Subtree again.");
    return false;
  }

  let targetDocument;
  try {
    targetDocument = await vscode.workspace.openTextDocument(target.uri);
  } catch {
    vscode.window.showWarningMessage("Org-vscode: The selected refile target could not be opened.");
    return false;
  }
  if (!isOrgDocument(targetDocument)) {
    vscode.window.showWarningMessage("Org-vscode: Refile targets must be Org documents.");
    return false;
  }
  const targetLines = getLines(targetDocument);
  const currentTarget = collectHeadingTargets(targetLines, targetDocument.uri)
    .find((candidate) => candidate.line === target.line);
  if (!currentTarget || (target.title && currentTarget.title !== target.title)) {
    vscode.window.showWarningMessage("Org-vscode: The selected refile target no longer exists.");
    return false;
  }

  const sameDocument = sourceDocument.uri.toString() === targetDocument.uri.toString();
  const plan = computeRefilePlan(
    sourceLines,
    sourceCursorLine,
    targetLines,
    currentTarget.line,
    sameDocument,
    getSpacesPerLevel(),
    getUnicodeMarkers()
  );
  if (!plan) {
    vscode.window.showWarningMessage("Org-vscode: A subtree cannot be refiled into itself or one of its descendants.");
    return false;
  }

  const edit = new vscode.WorkspaceEdit();
  if (sameDocument) {
    const removedCount = plan.sourceEndExclusive - plan.sourceStartLine;
    const updatedLines = sourceLines.slice();
    updatedLines.splice(plan.sourceStartLine, removedCount);
    const insertLine = plan.targetInsertLine >= plan.sourceEndExclusive
      ? plan.targetInsertLine - removedCount
      : plan.targetInsertLine;
    updatedLines.splice(insertLine, 0, ...plan.subtreeLines);
    edit.replace(sourceDocument.uri, getWholeDocumentRange(sourceDocument), formatDocumentText(sourceDocument, updatedLines));
  } else {
    const updatedSourceLines = sourceLines.slice();
    updatedSourceLines.splice(plan.sourceStartLine, plan.sourceEndExclusive - plan.sourceStartLine);
    const updatedTargetLines = targetLines.slice();
    updatedTargetLines.splice(plan.targetInsertLine, 0, ...plan.subtreeLines);
    edit.replace(sourceDocument.uri, getWholeDocumentRange(sourceDocument), formatDocumentText(sourceDocument, updatedSourceLines));
    edit.replace(targetDocument.uri, getWholeDocumentRange(targetDocument), formatDocumentText(targetDocument, updatedTargetLines));
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) vscode.window.showErrorMessage("Org-vscode: Failed to refile the subtree.");
  return applied;
}

function registerSubtreeCommands(ctx) {
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.promoteSubtree", () => changeSubtreeLevel(-1)));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.demoteSubtree", () => changeSubtreeLevel(1)));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.refileSubtree", refileSubtree));
}

module.exports = {
  changeSubtreeLevel,
  chooseRefileTarget,
  createRefilePick,
  refileSubtree,
  registerSubtreeCommands
};