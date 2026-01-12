"use strict";

const vscode = require("vscode");
const crypto = require("crypto");
const {
  findNearestHeadingLine,
  setPropertyInLines,
  deletePropertyInLines,
  getPropertyFromLines,
  getPropertyFromLinesWithInheritance,
  getAllPropertyKeysWithInheritance,
  ensureIdInLines,
  parsePropertyDrawer,
  normalizePropertyKey
} = require("./orgProperties");

function isOrgLikeDocument(document) {
  const id = document?.languageId;
  return id === "vso" || id === "org" || id === "vsorg" || id === "org-vscode";
}

function getDocumentTextLines(document) {
  return document.getText().split(/\r?\n/);
}

function getDocumentEol(document) {
  return document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
}

function replaceWholeDocument(document, newText) {
  const lastLine = Math.max(0, document.lineCount - 1);
  const lastChar = document.lineAt(lastLine).text.length;
  const fullRange = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(lastLine, lastChar));

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, fullRange, newText);
  return vscode.workspace.applyEdit(edit);
}

function generateUuid() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = crypto.randomBytes(16);
  // v4
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function setPropertyCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isOrgLikeDocument(editor.document)) return;

  const document = editor.document;
  const lines = getDocumentTextLines(document);

  const headingLineIndex = findNearestHeadingLine(lines, editor.selection.active.line);
  if (headingLineIndex == null) {
    vscode.window.showWarningMessage("Org-vscode: No heading found above cursor.");
    return;
  }

  const parsed = parsePropertyDrawer(lines, headingLineIndex);
  const existingKeys = Array.from(parsed.properties.keys()).sort();

  const keyInput = await vscode.window.showInputBox({
    prompt: "Org-vscode: Property name (e.g. CUSTOM_ID, ID, CATEGORY)",
    placeHolder: existingKeys.length ? `Existing: ${existingKeys.slice(0, 6).join(", ")}${existingKeys.length > 6 ? ", ..." : ""}` : "CUSTOM_ID"
  });

  if (keyInput == null) return;
  const key = normalizePropertyKey(keyInput);
  if (!key) {
    vscode.window.showWarningMessage("Org-vscode: Property name is required.");
    return;
  }

  const currentValue = getPropertyFromLines(lines, headingLineIndex, key);
  const value = await vscode.window.showInputBox({
    prompt: `Org-vscode: Value for ${key} (leave empty to set blank)`,
    value: currentValue ?? "",
    placeHolder: "Example: my-heading-anchor"
  });

  if (value == null) return;

  const result = setPropertyInLines(lines, headingLineIndex, key, value);
  if (!result.changed) return;

  const eol = getDocumentEol(document);
  const hadFinalNewline = document.getText().endsWith("\n");
  let newText = result.lines.join(eol);
  if (hadFinalNewline && !newText.endsWith(eol)) newText += eol;

  await replaceWholeDocument(document, newText);
}

async function deletePropertyCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isOrgLikeDocument(editor.document)) return;

  const document = editor.document;
  const lines = getDocumentTextLines(document);

  const headingLineIndex = findNearestHeadingLine(lines, editor.selection.active.line);
  if (headingLineIndex == null) {
    vscode.window.showWarningMessage("Org-vscode: No heading found above cursor.");
    return;
  }

  const parsed = parsePropertyDrawer(lines, headingLineIndex);
  const existingKeys = Array.from(parsed.properties.keys()).sort();
  if (!parsed.range) {
    vscode.window.showWarningMessage("Org-vscode: No property drawer found for this heading.");
    return;
  }

  const pick = existingKeys.length
    ? await vscode.window.showQuickPick(existingKeys, { placeHolder: "Select a property to delete" })
    : await vscode.window.showInputBox({ prompt: "Org-vscode: Property name to delete" });

  if (pick == null) return;
  const key = normalizePropertyKey(pick);
  if (!key) return;

  const result = deletePropertyInLines(lines, headingLineIndex, key);
  if (!result.changed) {
    vscode.window.showInformationMessage(`Org-vscode: Property ${key} not found.`);
    return;
  }

  const eol = getDocumentEol(document);
  const hadFinalNewline = document.getText().endsWith("\n");
  let newText = result.lines.join(eol);
  if (hadFinalNewline && !newText.endsWith(eol)) newText += eol;

  await replaceWholeDocument(document, newText);
}

async function getPropertyCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isOrgLikeDocument(editor.document)) return;

  const document = editor.document;
  const lines = getDocumentTextLines(document);

  const headingLineIndex = findNearestHeadingLine(lines, editor.selection.active.line);
  if (headingLineIndex == null) {
    vscode.window.showWarningMessage("Org-vscode: No heading found above cursor.");
    return;
  }

  const existingKeys = getAllPropertyKeysWithInheritance(lines, headingLineIndex).sort();

  const keyInput = existingKeys.length
    ? await vscode.window.showQuickPick(existingKeys, { placeHolder: "Select a property" })
    : await vscode.window.showInputBox({ prompt: "Org-vscode: Property name" });

  if (keyInput == null) return;
  const key = normalizePropertyKey(keyInput);
  if (!key) return;

  const value = getPropertyFromLinesWithInheritance(lines, headingLineIndex, key);
  if (value == null) {
    vscode.window.showInformationMessage(`Org-vscode: ${key} is not set.`);
    return;
  }

  await vscode.env.clipboard.writeText(String(value));
  vscode.window.showInformationMessage(`Org-vscode: ${key} = ${value} (copied to clipboard)`);
}

async function setIdCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isOrgLikeDocument(editor.document)) return;

  const document = editor.document;
  const lines = getDocumentTextLines(document);

  const headingLineIndex = findNearestHeadingLine(lines, editor.selection.active.line);
  if (headingLineIndex == null) {
    vscode.window.showWarningMessage("Org-vscode: No heading found above cursor.");
    return;
  }

  const localId = getPropertyFromLines(lines, headingLineIndex, "ID");
  const inheritedId = getPropertyFromLinesWithInheritance(lines, headingLineIndex, "ID");

  const idInput = await vscode.window.showInputBox({
    prompt: "Org-vscode: Set ID for this heading (empty = generate new UUID)",
    value: localId ?? "",
    placeHolder: inheritedId ? `Inherited/Current: ${inheritedId}` : "e.g. 550e8400-e29b-41d4-a716-446655440000"
  });

  if (idInput == null) return;

  const id = String(idInput).trim() ? String(idInput).trim() : generateUuid();
  const result = setPropertyInLines(lines, headingLineIndex, "ID", id);
  if (!result.changed) {
    await vscode.env.clipboard.writeText(String(id));
    vscode.window.showInformationMessage(`Org-vscode: ID unchanged (${id}) (copied to clipboard)`);
    return;
  }

  const eol = getDocumentEol(document);
  const hadFinalNewline = document.getText().endsWith("\n");
  let newText = result.lines.join(eol);
  if (hadFinalNewline && !newText.endsWith(eol)) newText += eol;

  await replaceWholeDocument(document, newText);
  await vscode.env.clipboard.writeText(String(id));
  vscode.window.showInformationMessage(`Org-vscode: Set ID = ${id} (copied to clipboard)`);
}

async function getOrCreateIdCommand() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isOrgLikeDocument(editor.document)) return;

  const document = editor.document;
  const lines = getDocumentTextLines(document);

  const headingLineIndex = findNearestHeadingLine(lines, editor.selection.active.line);
  if (headingLineIndex == null) {
    vscode.window.showWarningMessage("Org-vscode: No heading found above cursor.");
    return;
  }

  const ensured = ensureIdInLines(lines, headingLineIndex, generateUuid);
  if (!ensured.id) {
    vscode.window.showErrorMessage("Org-vscode: Failed to generate an ID.");
    return;
  }

  if (ensured.changed) {
    const eol = getDocumentEol(document);
    const hadFinalNewline = document.getText().endsWith("\n");
    let newText = ensured.lines.join(eol);
    if (hadFinalNewline && !newText.endsWith(eol)) newText += eol;
    await replaceWholeDocument(document, newText);
  }

  await vscode.env.clipboard.writeText(String(ensured.id));
  vscode.window.showInformationMessage(
    ensured.changed
      ? `Org-vscode: Created ID = ${ensured.id} (copied to clipboard)`
      : `Org-vscode: ID = ${ensured.id} (copied to clipboard)`
  );
}

function registerPropertyCommands(ctx) {
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.setProperty", setPropertyCommand));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.deleteProperty", deletePropertyCommand));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.getProperty", getPropertyCommand));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.setId", setIdCommand));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.getOrCreateId", getOrCreateIdCommand));
}

module.exports = {
  registerPropertyCommands
};
