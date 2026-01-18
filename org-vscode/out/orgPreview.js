"use strict";

const vscode = require("vscode");
const { html, h, SafeHtml, escapeText, escapeAttr } = require("./htmlUtils");

function getNonce() {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function isOrgDoc(editor) {
  if (!editor || !editor.document) return false;
  return ["vso", "org", "org-vscode", "vsorg"].includes(editor.document.languageId);
}

function renderOrgToHtml(documentText) {
  // Minimal Org→HTML renderer (MVP): headings, lists, checkboxes, code blocks, tables, and export html blocks.
  // This is intentionally conservative; we can replace it later with a full Org parser.
  const lines = documentText.split(/\r?\n/);
  const out = [];

  let inSrc = false;
  let srcLang = "";
  let inExportHtml = false;
  let listStack = []; // array of "ul" or "ol"
  let inTable = false;

  function closeLists() {
    while (listStack.length) {
      out.push(`</${listStack.pop()}>`);
    }
  }

  function closeTable() {
    if (inTable) {
      out.push("</tbody></table>");
      inTable = false;
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNo = i + 1;
    const trimmed = line.trim();

    // Always include a marker at each line so scroll sync is deterministic.
    const marker = html`<span class="line-marker" data-line=${lineNo}></span>`;

    // Export HTML block: include raw HTML
    if (!inSrc && !inExportHtml && /^\s*#\+BEGIN_EXPORT\s+html\s*$/i.test(line)) {
      closeLists();
      closeTable();
      inExportHtml = true;
      out.push(`<div class="org-export-html">${marker}`);
      continue;
    }
    if (inExportHtml) {
      if (/^\s*#\+END_EXPORT\s*$/i.test(line)) {
        out.push(`${marker}</div>`);
        inExportHtml = false;
      } else {
        out.push(marker + line); // Raw HTML intentionally unescaped
      }
      continue;
    }

    // Src blocks
    const beginSrc = line.match(/^\s*#\+BEGIN_SRC\s*(\S+)?\s*$/i);
    if (!inSrc && beginSrc) {
      closeLists();
      closeTable();
      inSrc = true;
      srcLang = (beginSrc[1] || "").toLowerCase();
      out.push(`<pre class="org-src"><code data-lang="${escapeAttr(srcLang)}">${marker}`);
      continue;
    }
    if (inSrc) {
      if (/^\s*#\+END_SRC\s*$/i.test(line)) {
        out.push(`${marker}</code></pre>`);
        inSrc = false;
        srcLang = "";
      } else {
        out.push(marker + escapeText(line) + "\n");
      }
      continue;
    }

    // Tables (very minimal)
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeLists();
      if (!inTable) {
        out.push(`<table class="org-table"><tbody>`);
        inTable = true;
      }
      const cells = line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|");
      const cellsHtml = cells.map((c) => html`<td>${c.trim()}</td>`);
      out.push(html`<tr>${marker}${cellsHtml}</tr>`);
      continue;
    } else {
      closeTable();
    }

    // Headings
    const heading = line.match(/^\s*(\*+)\s+(.*)$/);
    if (heading) {
      closeLists();
      const level = Math.min(6, heading[1].length);
      const title = heading[2];
      out.push(h("h" + level, { class: "org-heading" }, marker, title));
      continue;
    }

    // Lists (simple; no nesting by indentation yet)
    const ordered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    const unordered = line.match(/^\s*([-+])\s+(.*)$/);
    if (ordered || unordered) {
      closeTable();
      const type = ordered ? "ol" : "ul";
      const body = ordered ? ordered[2] : unordered[2];
      const checkbox = body.match(/^\[( |x|X)\]\s+(.*)$/);

      if (!listStack.length || listStack[listStack.length - 1] !== type) {
        closeLists();
        listStack.push(type);
        out.push(`<${type} class="org-list">`);
      }

      if (checkbox) {
        const checked = /x/i.test(checkbox[1]);
        out.push(html`<li>${marker}<input type="checkbox" disabled checked=${checked} /> ${checkbox[2]}</li>`);
      } else {
        out.push(html`<li>${marker}${body}</li>`);
      }
      continue;
    }

    // Blank line
    if (trimmed.length === 0) {
      closeLists();
      closeTable();
      out.push(html`<div class="org-blank">${marker}</div>`);
      continue;
    }

    // Paragraph
    closeLists();
    closeTable();
    out.push(html`<p class="org-paragraph">${marker}${line}</p>`);
  }

  closeLists();
  closeTable();

  return new SafeHtml(out.join("\n"));
}

function getPreviewHtml(webview, nonce, bodyHtml) {
  const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource} https: data:`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Org Preview</title>
  <style>
    body{padding:16px; color:var(--vscode-editor-foreground); background:var(--vscode-editor-background); font-family:var(--vscode-font-family); font-size:var(--vscode-font-size); line-height:1.5;}
    .org-heading{margin:1.2em 0 .4em 0;}
    .org-paragraph{margin:.3em 0; white-space:pre-wrap;}
    .org-list{margin:.3em 0 .6em 1.2em; padding:0;}
    .org-list li{margin:.15em 0;}
    .org-src{background:var(--vscode-textCodeBlock-background); padding:10px; overflow:auto; border-radius:2px;}
    .org-table{border-collapse:collapse; margin:.4em 0;}
    .org-table td{border:1px solid var(--vscode-editorWidget-border); padding:2px 6px;}
    .line-marker{display:inline-block; width:0; height:0;}
    .org-export-html{margin:.4em 0;}
  </style>
</head>
<body>
  <div id="root">${bodyHtml}</div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    function scrollToLine(line){
      const marker = document.querySelector('.line-marker[data-line="' + String(line) + '"]');
      if (!marker) return;
      marker.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (!msg || !msg.type) return;
      if (msg.type === 'scrollToLine') {
        scrollToLine(msg.line);
      }
    });
  </script>
</body>
</html>`;
}

class OrgPreviewManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.panel = null;
    this.targetUri = null;
    this.pendingTimer = null;
  }

  open(viewColumn) {
    const editor = vscode.window.activeTextEditor;
    if (!isOrgDoc(editor)) {
      vscode.window.showInformationMessage("Org-vscode: Open an Org file to preview.");
      return;
    }

    const doc = editor.document;
    this.targetUri = doc.uri;

    if (this.panel) {
      this.panel.reveal(viewColumn);
      this.refreshNow();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      "org-vscode.preview",
      "Org Preview",
      viewColumn,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.onDidDispose(() => {
      this.panel = null;
      this.targetUri = null;
    });

    this.refreshNow();
  }

  refreshNow() {
    if (!this.panel || !this.targetUri) return;

    const doc = vscode.workspace.textDocuments.find((d) => d.uri.toString() === this.targetUri.toString());
    if (!doc) return;

    const body = renderOrgToHtml(doc.getText());
    const nonce = getNonce();
    this.panel.webview.html = getPreviewHtml(this.panel.webview, nonce, body);
  }

  scheduleRefresh() {
    if (!this.panel) return;
    if (this.pendingTimer) clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      this.refreshNow();
    }, 150);
  }

  postScrollToLine(line) {
    if (!this.panel) return;
    this.panel.webview.postMessage({ type: "scrollToLine", line: line + 1 });
  }
}

function registerOrgPreview(ctx) {
  const manager = new OrgPreviewManager(ctx);

  ctx.subscriptions.push(
    vscode.commands.registerCommand("org-vscode.openPreview", () => manager.open(vscode.ViewColumn.One)),
    vscode.commands.registerCommand("org-vscode.openPreviewToSide", () => manager.open(vscode.ViewColumn.Beside))
  );

  if (vscode.workspace && typeof vscode.workspace.onDidChangeTextDocument === "function") {
    ctx.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!manager.panel || !manager.targetUri) return;
        if (event.document.uri.toString() !== manager.targetUri.toString()) return;
        manager.scheduleRefresh();
      })
    );
  }

  if (vscode.window && typeof vscode.window.onDidChangeActiveTextEditor === "function") {
    ctx.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!manager.panel || !manager.targetUri) return;
        if (!editor || !editor.document) return;
        if (editor.document.uri.toString() !== manager.targetUri.toString()) return;
        manager.scheduleRefresh();
      })
    );
  }

  if (vscode.window && typeof vscode.window.onDidChangeTextEditorVisibleRanges === "function") {
    ctx.subscriptions.push(
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        if (!manager.panel || !manager.targetUri) return;
        if (!event.textEditor || !event.textEditor.document) return;
        if (event.textEditor.document.uri.toString() !== manager.targetUri.toString()) return;
        const vr = event.visibleRanges && event.visibleRanges[0];
        if (!vr) return;
        manager.postScrollToLine(vr.start.line);
      })
    );
  }
}

module.exports = {
  registerOrgPreview
};
