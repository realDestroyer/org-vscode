"use strict";

const vscode = require("vscode");
const taskKeywordManager = require("./taskKeywordManager");
const { isSrcExecutionDisabledFor } = require("./srcBlockCodeLens");
const { ACTIONS, buildHeadingCodeLensPlan } = require("./headingCodeLensUtils");

const SELECTOR = ["vso", "org", "vsorg", "org-vscode"].map((language) => ({ language, scheme: "file" }));

function getUnicodeMarkers() {
  return taskKeywordManager.getWorkflowRegistry().states
    .map((state) => state.marker)
    .filter((marker) => typeof marker === "string" && marker.length > 0);
}

async function runHeadingAction(args) {
  const action = ACTIONS[args?.action];
  if (!action || !args?.uri || !Number.isInteger(args.line) || !Number.isInteger(args.version)) return false;
  const document = await vscode.workspace.openTextDocument(args.uri);
  if (!SELECTOR.some((selector) => selector.language === document.languageId)) return false;
  if (isSrcExecutionDisabledFor(document.uri) || document.version !== args.version) return false;
  if (args.line < 0 || args.line >= document.lineCount) return false;
  if (document.lineAt(args.line).text !== args.lineText) return false;
  const editor = await vscode.window.showTextDocument(document);
  const position = new vscode.Position(args.line, 0);
  editor.selection = new vscode.Selection(position, position);
  await vscode.commands.executeCommand(action.command);
  return true;
}

class HeadingCodeLensProvider {
  provideCodeLenses(document) {
    const config = vscode.workspace.getConfiguration("Org-vscode", document.uri);
    if (!config.get("headingCodeLens.enabled", false)) return [];
    const plan = buildHeadingCodeLensPlan(
      document.getText().split(/\r?\n/),
      config.get("headingCodeLens.actions", ["status", "schedule", "deadline"]),
      getUnicodeMarkers(),
      isSrcExecutionDisabledFor(document.uri)
    );
    return plan.map(({ line, action }) => new vscode.CodeLens(
      new vscode.Range(line, 0, line, 0),
      {
        title: ACTIONS[action].title,
        command: "org-vscode.runHeadingAction",
        arguments: [{ uri: document.uri, line, lineText: document.lineAt(line).text, version: document.version, action }]
      }
    ));
  }
}

function registerHeadingCodeLens(ctx) {
  const provider = new HeadingCodeLensProvider();
  ctx.subscriptions.push(vscode.languages.registerCodeLensProvider(SELECTOR, provider));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.runHeadingAction", runHeadingAction));
}

module.exports = { HeadingCodeLensProvider, registerHeadingCodeLens, runHeadingAction };