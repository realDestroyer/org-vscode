"use strict";

const vscode = require("vscode");
const path = require("path");

function parseBracketLink(text) {
  // Supports: [[link][desc]] and [[link]]
  const m = String(text || "").match(/^\[\[([^\]\n]+)\](?:\[([^\]\n]*)\])?\]$/);
  if (!m) return null;
  return { link: m[1], description: m[2] };
}

function buildCommandUri(command, args) {
  const encoded = encodeURIComponent(JSON.stringify(args || {}));
  return vscode.Uri.parse(`command:${command}?${encoded}`);
}

function normalizeFileLinkTarget(documentUri, rawTarget) {
  const stripped = String(rawTarget || "").replace(/^file:/, "");
  const withoutSearch = stripped.split("::")[0];
  const decoded = withoutSearch.replace(/^\/+/, "");

  // Absolute paths (Windows drive or UNC) vs relative
  const isWindowsAbs = /^[A-Za-z]:\\/.test(decoded) || /^[A-Za-z]:\//.test(decoded) || /^\\\\/.test(decoded);
  if (isWindowsAbs) {
    return vscode.Uri.file(decoded.replace(/\//g, "\\"));
  }

  const baseDir = path.dirname(documentUri.fsPath);
  const joined = path.resolve(baseDir, decoded);
  return vscode.Uri.file(joined);
}

function getDocumentLinks(document) {
  const links = [];
  const text = document.getText();

  // [[...]] links
  const bracketRe = /\[\[[^\]\n]+\](?:\[[^\]\n]*\])?\]/g;
  for (let match; (match = bracketRe.exec(text)); ) {
    const raw = match[0];
    const parsed = parseBracketLink(raw);
    if (!parsed) continue;

    const start = document.positionAt(match.index);
    const end = document.positionAt(match.index + raw.length);
    const range = new vscode.Range(start, end);

    const linkTarget = parsed.link.trim();
    let target;

    if (/^https?:\/\//i.test(linkTarget) || /^mailto:/i.test(linkTarget)) {
      target = vscode.Uri.parse(linkTarget);
    } else if (/^file:/i.test(linkTarget)) {
      target = normalizeFileLinkTarget(document.uri, linkTarget);
    } else if (/^id:/i.test(linkTarget)) {
      target = buildCommandUri("org-vscode.followOrgLink", { type: "id", id: linkTarget.slice(3).trim() });
    } else if (/^\*/.test(linkTarget)) {
      target = buildCommandUri("org-vscode.followOrgLink", { type: "heading", heading: linkTarget.slice(1).trim() });
    } else if (/^#/.test(linkTarget)) {
      target = buildCommandUri("org-vscode.followOrgLink", { type: "anchor", anchor: linkTarget.slice(1).trim() });
    } else {
      // Fallback: treat as a file path
      target = normalizeFileLinkTarget(document.uri, `file:${linkTarget}`);
    }

    const dl = new vscode.DocumentLink(range, target);
    dl.tooltip = parsed.description ? `${parsed.description} (${parsed.link})` : parsed.link;
    links.push(dl);
  }

  // Bare links
  const bareRe = /(https?:\/\/\S+|mailto:[^\s>]+)/g;
  for (let match; (match = bareRe.exec(text)); ) {
    const raw = match[0];
    const start = document.positionAt(match.index);
    const end = document.positionAt(match.index + raw.length);
    links.push(new vscode.DocumentLink(new vscode.Range(start, end), vscode.Uri.parse(raw)));
  }

  return links;
}

async function followOrgLink(args) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) return;

  const document = editor.document;
  const payload = args || {};

  if (payload.type === "heading" && payload.heading) {
    const target = String(payload.heading).trim();
    for (let i = 0; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;
      const star = text.match(/^\s*\*+\s+(.*)$/);
      if (!star) continue;
      const title = star[1].replace(/\s+:(?:[A-Za-z0-9_@#%\-]+:)+\s*$/g, "").trim();
      if (title === target || title.endsWith(` ${target}`)) {
        const pos = new vscode.Position(i, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        return;
      }
    }
    vscode.window.showInformationMessage(`Heading not found: ${target}`);
    return;
  }

  if (payload.type === "id" && payload.id) {
    const id = String(payload.id).trim();
    const patterns = "**/*.{org,vsorg,vso}";
    const files = await vscode.workspace.findFiles(patterns, "**/node_modules/**");

    for (const uri of files) {
      try {
        const data = await vscode.workspace.fs.readFile(uri);
        const content = Buffer.from(data).toString("utf8");
        if (!content.includes(id)) continue;

        const lines = content.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
          const m = lines[i].match(/^\s*:ID:\s*(\S+)\s*$/);
          if (m && m[1] === id) {
            const doc = await vscode.workspace.openTextDocument(uri);
            const ed = await vscode.window.showTextDocument(doc);
            const pos = new vscode.Position(i, 0);
            ed.selection = new vscode.Selection(pos, pos);
            ed.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    vscode.window.showInformationMessage(`ID not found in workspace: ${id}`);
    return;
  }

  if (payload.type === "anchor" && payload.anchor) {
    const target = String(payload.anchor).trim();
    for (let i = 0; i < document.lineCount; i++) {
      const text = document.lineAt(i).text;

      // Targets like <<my-target>>
      if (new RegExp(`<<\\s*${escapeForRegExp(target)}\\s*>>`).test(text)) {
        const pos = new vscode.Position(i, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        return;
      }

      // Properties like :CUSTOM_ID: my-target
      const m = text.match(/^\s*:CUSTOM_ID:\s*(\S+)\s*$/);
      if (m && m[1] === target) {
        const pos = new vscode.Position(i, 0);
        editor.selection = new vscode.Selection(pos, pos);
        editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        return;
      }
    }

    vscode.window.showInformationMessage(`Target not found: ${target}`);
    return;
  }

  vscode.window.showInformationMessage("Unsupported org link.");
}

function escapeForRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class OrgDocumentLinkProvider {
  provideDocumentLinks(document) {
    try {
      return getDocumentLinks(document);
    } catch (e) {
      console.warn("OrgDocumentLinkProvider failed:", e);
      return [];
    }
  }
}

function registerOrgLinkProvider(ctx) {
  const selector = [{ language: "vso", scheme: "file" }, { language: "org", scheme: "file" }, { language: "vsorg", scheme: "file" }, { language: "org-vscode", scheme: "file" }];
  ctx.subscriptions.push(vscode.languages.registerDocumentLinkProvider(selector, new OrgDocumentLinkProvider()));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.followOrgLink", followOrgLink));
}

module.exports = {
  OrgDocumentLinkProvider,
  registerOrgLinkProvider,
  parseBracketLink,
  getDocumentLinks,
  followOrgLink
};
