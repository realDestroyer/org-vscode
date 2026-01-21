"use strict";

const vscode = require("vscode");

function isBeginSrcLine(line) {
  return /^\s*#\+BEGIN_SRC\b/i.test(String(line || ""));
}

function registerSrcBlockCodeLens(ctx) {
  const selector = [
    { language: "org", scheme: "file" },
    { language: "vsorg", scheme: "file" },
    { language: "org-vscode", scheme: "file" },
    { language: "vso", scheme: "file" }
  ];

  const provider = {
    provideCodeLenses: function (document) {
      const lenses = [];
      const lineCount = document.lineCount || 0;

      for (let i = 0; i < lineCount; i++) {
        const lineText = document.lineAt(i).text;
        if (!isBeginSrcLine(lineText)) continue;

        const range = new vscode.Range(i, 0, i, 0);
        const args = [{ uri: document.uri, line: i + 1 }];

        lenses.push(
          new vscode.CodeLens(range, {
            title: "$(play) Execute src block",
            command: "org-vscode.executeSrcBlock",
            arguments: args
          })
        );
      }

      return lenses;
    },

    resolveCodeLens: function (codeLens) {
      return codeLens;
    }
  };

  const disposable = vscode.languages.registerCodeLensProvider(selector, provider);
  ctx.subscriptions.push(disposable);
}

module.exports = {
  registerSrcBlockCodeLens
};
