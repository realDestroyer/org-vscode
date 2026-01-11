"use strict";

const vscode = require("vscode");
const { PLANNING_STRIP_RE } = require("./orgTagUtils");

const STATUS_WORDS = new Set(["TODO", "IN_PROGRESS", "CONTINUED", "DONE", "ABANDONED"]);

function parseHeadingLine(text) {
  if (typeof text !== "string") return null;

  // Asterisk headings (Org classic)
  // Example: "*** TODO [#A] My title :tag1:tag2: SCHEDULED: [...]"
  const star = text.match(/^\s*(\*+)\s+(.*)$/);
  if (star) {
    const level = star[1].length;
    const rawRest = star[2];
    const title = extractHeadingTitle(rawRest);
    return { level, title };
  }

  // Unicode headings (v2 unicode marker style)
  // We infer a level from indentation (2 spaces per level by default).
  const uni = text.match(/^(\s*)([⊙⊘⊖⊜⊗])\s+(.*)$/);
  if (uni) {
    const leading = uni[1] || "";
    const level = Math.floor(leading.length / 2) + 1;
    const title = extractHeadingTitle(uni[3]);
    return { level, title };
  }

  return null;
}

function extractHeadingTitle(rest) {
  let out = String(rest || "");

  // Leading TODO keyword
  const maybeStatus = out.match(/^([A-Z_]+)\b\s+(.*)$/);
  if (maybeStatus && STATUS_WORDS.has(maybeStatus[1])) {
    out = maybeStatus[2];
  }

  // Optional priority cookie
  out = out.replace(/^\s*\[#([A-Z0-9])\]\s+/, "");

  // Strip trailing planning stamps on heading line
  out = out.replace(new RegExp(PLANNING_STRIP_RE.source, "g"), "");

  // Strip trailing tags like :tag1:tag2:
  out = out.replace(/\s+:(?:[A-Za-z0-9_@#%\-]+:)+\s*$/g, "");

  return out.trim();
}

function buildSymbolsFromLines(lines, uri) {
  const root = [];
  const stack = []; // { level, symbol }

  for (let i = 0; i < lines.length; i++) {
    const parsed = parseHeadingLine(lines[i]);
    if (!parsed) continue;

    const level = Math.max(1, parsed.level);
    const name = parsed.title || "(heading)";

    const lineRange = new vscode.Range(new vscode.Position(i, 0), new vscode.Position(i, lines[i].length));
    const symbol = new vscode.DocumentSymbol(name, "", vscode.SymbolKind.Namespace, lineRange, lineRange);

    while (stack.length && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length) {
      stack[stack.length - 1].symbol.children.push(symbol);
    } else {
      root.push(symbol);
    }

    stack.push({ level, symbol });
  }

  return root;
}

class OrgDocumentSymbolProvider {
  provideDocumentSymbols(document) {
    try {
      const lines = [];
      for (let i = 0; i < document.lineCount; i++) {
        lines.push(document.lineAt(i).text);
      }
      return buildSymbolsFromLines(lines, document.uri);
    } catch (e) {
      console.warn("OrgDocumentSymbolProvider failed:", e);
      return [];
    }
  }
}

function registerOrgSymbolProvider(ctx) {
  const selector = [{ language: "vso", scheme: "file" }, { language: "org", scheme: "file" }, { language: "vsorg", scheme: "file" }, { language: "org-vscode", scheme: "file" }];
  ctx.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, new OrgDocumentSymbolProvider()));
}

module.exports = {
  OrgDocumentSymbolProvider,
  registerOrgSymbolProvider,
  parseHeadingLine,
  extractHeadingTitle,
  buildSymbolsFromLines
};
