"use strict";

const vscode = require("vscode");

function isSupportedOrgDocument(document) {
  if (!document) return false;
  return ["vso", "org", "org-vscode", "vsorg"].includes(document.languageId);
}

function toggleWrapSelectionsWithMarker(editor, marker) {
  if (!editor || !isSupportedOrgDocument(editor.document)) return;

  const document = editor.document;
  const originalSelections = editor.selections.slice();

  // Apply edits from bottom -> top so offsets remain stable for earlier selections.
  const indexed = originalSelections
    .map((sel, idx) => ({ sel, idx }))
    .sort((a, b) => {
      const ao = document.offsetAt(a.sel.start);
      const bo = document.offsetAt(b.sel.start);
      return bo - ao;
    });

  const replacements = [];
  const newSelections = new Array(originalSelections.length);

  for (const { sel, idx } of indexed) {
    if (sel.isEmpty) {
      const insertPos = sel.active;
      replacements.push({ range: new vscode.Range(insertPos, insertPos), text: marker + marker });
      const anchor = insertPos.translate(0, marker.length);
      newSelections[idx] = new vscode.Selection(anchor, anchor);
      continue;
    }

    const range = new vscode.Range(sel.start, sel.end);
    const text = document.getText(range);

    if (
      text.length >= marker.length * 2 &&
      text.startsWith(marker) &&
      text.endsWith(marker)
    ) {
      // Unwrap
      const unwrapped = text.substring(marker.length, text.length - marker.length);
      replacements.push({ range, text: unwrapped });
      const start = sel.start;
      const end = start.translate(0, unwrapped.length);
      newSelections[idx] = new vscode.Selection(start, end);
    } else {
      // Wrap
      replacements.push({ range, text: marker + text + marker });
      const start = sel.start.translate(0, marker.length);
      const end = sel.end.translate(0, marker.length);
      newSelections[idx] = new vscode.Selection(start, end);
    }
  }

  editor.edit((editBuilder) => {
    for (const rep of replacements) {
      editBuilder.replace(rep.range, rep.text);
    }
  }).then((applied) => {
    if (!applied) return;
    editor.selections = newSelections;
  });
}

function registerMarkupCommands(ctx) {
  if (!vscode || !vscode.commands) return;

  ctx.subscriptions.push(
    vscode.commands.registerCommand("extension.toggleBoldMarkup", () => {
      toggleWrapSelectionsWithMarker(vscode.window.activeTextEditor, "*");
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("extension.toggleItalicMarkup", () => {
      toggleWrapSelectionsWithMarker(vscode.window.activeTextEditor, "/");
    })
  );

  ctx.subscriptions.push(
    vscode.commands.registerCommand("extension.toggleUnderlineMarkup", () => {
      toggleWrapSelectionsWithMarker(vscode.window.activeTextEditor, "_");
    })
  );
}

module.exports = {
  registerMarkupCommands
};
