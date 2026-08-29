"use strict";

const vscode = require("vscode");
const {
  buildGlobalVisibilityPlan,
  buildVisibilityPlan
} = require("./orgFoldingProvider");
const { parseHeadingLine } = require("./orgSymbolProvider");

const localStates = new WeakMap();
const globalStates = new WeakMap();

function isOrgDocument(document) {
  return ["vso", "org", "vsorg", "org-vscode"].includes(document?.languageId);
}

function getDocumentLines(document) {
  return document.getText().split(/\r?\n/);
}

function getLocalStates(editor) {
  let states = localStates.get(editor);
  if (!states) {
    states = new Map();
    localStates.set(editor, states);
  }
  return states;
}

async function foldAtLines(lines) {
  if (!lines.length) return;
  await vscode.commands.executeCommand("editor.fold", {
    levels: 1,
    direction: "down",
    selectionLines: lines
  });
}

async function unfoldAtLine(line) {
  await vscode.commands.executeCommand("editor.unfold", {
    levels: 99,
    direction: "down",
    selectionLines: [line]
  });
}

async function applyLocalPlan(plan) {
  if (plan.state === "folded") {
    await foldAtLines([plan.headingLine]);
    return;
  }

  await unfoldAtLine(plan.headingLine);
  if (plan.state === "children") await foldAtLines(plan.childLines);
}

async function applyGlobalPlan(plan) {
  await vscode.commands.executeCommand("editor.unfoldAll");
  if (plan.state === "folded") await foldAtLines(plan.rootLines);
  if (plan.state === "children") await foldAtLines(plan.childLines);
}

async function cycleVisibility(reverse = false) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isOrgDocument(editor.document)) return null;

  const headingLine = editor.selection.active.line;
  const states = getLocalStates(editor);
  const currentState = states.get(headingLine) || "subtree";
  const plan = buildVisibilityPlan(getDocumentLines(editor.document), headingLine, currentState, reverse);
  if (!plan) return null;

  await applyLocalPlan(plan);
  states.set(headingLine, plan.state);
  return plan.state;
}

async function cycleGlobalVisibility(reverse = false) {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isOrgDocument(editor.document)) return null;

  const lines = getDocumentLines(editor.document);
  if (!buildVisibilityPlan(lines, editor.selection.active.line, "subtree")) return null;

  const currentState = globalStates.get(editor) || "subtree";
  const plan = buildGlobalVisibilityPlan(lines, currentState, reverse);
  if (!plan) return null;

  await applyGlobalPlan(plan);
  globalStates.set(editor, plan.state);
  return plan.state;
}

function clearEditorState(editor) {
  if (!editor) return;
  localStates.delete(editor);
  globalStates.delete(editor);
}

function updateCursorContext(editor = vscode.window.activeTextEditor) {
  const onHeading = Boolean(
    editor &&
    isOrgDocument(editor.document) &&
    parseHeadingLine(editor.document.lineAt(editor.selection.active.line).text)
  );
  return vscode.commands.executeCommand("setContext", "org-vscode.cursorOnHeading", onHeading);
}

function registerVisibilityCommands(ctx) {
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.cycleVisibility", () => cycleVisibility(false)));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.cycleVisibilityBackward", () => cycleVisibility(true)));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.cycleGlobalVisibility", () => cycleGlobalVisibility(false)));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.cycleGlobalVisibilityBackward", () => cycleGlobalVisibility(true)));
  ctx.subscriptions.push(vscode.window.onDidChangeActiveTextEditor((editor) => updateCursorContext(editor)));
  ctx.subscriptions.push(vscode.window.onDidChangeTextEditorSelection((event) => updateCursorContext(event.textEditor)));
  ctx.subscriptions.push(vscode.workspace.onDidChangeTextDocument((event) => {
    const editor = vscode.window.activeTextEditor;
    if (editor?.document === event.document) {
      clearEditorState(editor);
      updateCursorContext(editor);
    }
  }));
  updateCursorContext();
}

module.exports = {
  cycleGlobalVisibility,
  cycleVisibility,
  registerVisibilityCommands,
  updateCursorContext
};