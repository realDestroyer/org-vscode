// insertTable.js - Enhanced Org Table Generator with fancy layout and table flip fun
const vscode = require('vscode');

function activate(context) {
  const disposable = vscode.commands.registerCommand('org-vscode.insertTable', () => {
    const panel = vscode.window.createWebviewPanel(
      'insertOrgTable',
      'Insert Org Table',
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    const nonce = (() => {
      let text = '';
      const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      for (let i = 0; i < 32; i++) text += possible.charAt(Math.floor(Math.random() * possible.length));
      return text;
    })();
    panel.webview.html = getWebviewContent(panel.webview, nonce);

    panel.webview.onDidReceiveMessage(
      message => {
        if (message.command === 'insertTable' && Array.isArray(message.rows)) {
          const editor = vscode.window.activeTextEditor;
          if (!editor) return;

          const formatted = formatOrgTable(
            message.rows,
            message.hasHeader,
            message.hasColHeaders,
            message.hasRowNumbers,
            message.align || 'c'
          );

          editor.edit(editBuilder => {
            editBuilder.insert(editor.selection.active, formatted);
          });

          panel.dispose();
        }
      },
      undefined,
      context.subscriptions
    );
  });

  context.subscriptions.push(disposable);
}

function getWebviewContent(webview, nonce) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Insert Org Table</title>
  <style nonce="${nonce}">
    body {
      font-family: monospace;
      background-color: #1e1e1e;
      color: #ffffff;
      padding: 20px;
    }
    h2 {
      color: #76E6E6;
    }
    .form-group {
      display: flex;
      align-items: center;
      margin-bottom: 10px;
    }
    .form-group label {
      width: 140px;
    }
    input[type="number"], select {
      padding: 5px;
      border-radius: 8px;
      border: none;
      width: 80px;
      font-family: inherit;
      margin-right: 10px;
    }
    input[type="checkbox"] {
      margin-left: 10px;
    }
    button {
      background-color: #303030;
      color: #ffffff;
      padding: 6px 12px;
      border: none;
      border-radius: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      cursor: pointer;
      margin: 10px 5px 10px 0;
      transition: background 0.3s ease;
    }
    button:hover {
      background-color: #505050;
    }
    .banner {
      font-size: 24px;
      text-align: left;
      margin-bottom: 20px;
      background-image: linear-gradient(90deg, green, orange, yellow, red, cyan, blue, violet);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      animation: pulse 3s infinite ease-in-out, slide 5s infinite alternate;
    }
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.6; }
      100% { opacity: 1; }
    }
    @keyframes slide {
      0% { transform: translateX(0); }
      100% { transform: translateX(80%); }
    }
  </style>
</head>
<body>
  <div class="banner">(╯°□°)╯︵ ┻━┻</div>
  <h2>Create Org Table</h2>
  <div class="form-group"><label for="rows">Rows:</label><input type="number" id="rows" value="2" min="1"></div>
  <div class="form-group"><label for="cols">Columns:</label><input type="number" id="cols" value="2" min="1"></div>
  <div class="form-group"><label for="header">Header Row:</label><input type="checkbox" id="header"></div>
  <div class="form-group"><label for="colHeaders">Column Labels (A-Z):</label><input type="checkbox" id="colHeaders"></div>
  <div class="form-group"><label for="rowNumbers">Row Numbers:</label><input type="checkbox" id="rowNumbers"></div>
  <div class="form-group"><label for="align">Alignment:</label>
    <select id="align">
      <option value="l">Left</option>
      <option value="c" selected>Center</option>
      <option value="r">Right</option>
    </select>
  </div>
  <button id="generateBtn" type="button">Generate Table</button>
  <button id="insertBtn" type="button">Insert Table</button>
  <div id="tableContainer"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    document.getElementById('generateBtn').addEventListener('click', () => {
      generateTable();
    });

    document.getElementById('insertBtn').addEventListener('click', () => {
      submitTable();
    });

    function generateTable() {
      const rows = parseInt(document.getElementById('rows').value);
      const cols = parseInt(document.getElementById('cols').value);
      const container = document.getElementById('tableContainer');
      container.replaceChildren();
      const table = document.createElement('table');
      for (let r = 0; r < rows; r++) {
        const row = document.createElement('tr');
        for (let c = 0; c < cols; c++) {
          const cell = document.createElement('td');
          const input = document.createElement('input');
          input.type = 'text';
          input.value = '';
          cell.appendChild(input);
          row.appendChild(cell);
        }
        table.appendChild(row);
      }
      container.appendChild(table);
    }

    function submitTable() {
      const table = document.querySelector('#tableContainer table');
      if (!table) return alert("Please generate a table first!");

      const rows = [];
      table.querySelectorAll('tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('td input').forEach(input => {
          row.push(input.value || ' ');
        });
        if (row.length > 0) rows.push(row);
      });

      vscode.postMessage({
        command: 'insertTable',
        rows,
        hasHeader: document.getElementById('header').checked,
        hasColHeaders: document.getElementById('colHeaders').checked,
        hasRowNumbers: document.getElementById('rowNumbers').checked,
        align: document.getElementById('align').value
      });
    }
  </script>
</body>
</html>`;
}

function formatOrgTable(rows, hasHeader, hasColHeaders, hasRowNumbers, align) {
  if (!Array.isArray(rows) || rows.length === 0) return '';
  const colCount = rows[0].length;

  // Build a canonical org-table (pipe) representation so Emacs/org-mode can edit/align it.
  // Example:
  // | A | B |
  // |---+---|
  // |   |   |

  const headerRows = [];
  let bodyRows = rows.slice();

  if (hasColHeaders) {
    const labels = Array.from({ length: colCount }, (_, i) => String.fromCharCode(65 + i));
    headerRows.push(labels);
  }

  if (hasHeader && bodyRows.length) {
    headerRows.push(bodyRows[0]);
    bodyRows = bodyRows.slice(1);
  }

  const combinedRows = [];
  const rowNumberWidth = hasRowNumbers ? Math.max(1, String(bodyRows.length || 1).length) : 0;

  headerRows.forEach((r) => {
    combinedRows.push(hasRowNumbers ? [""] : []);
    combinedRows[combinedRows.length - 1].push(...r);
  });

  bodyRows.forEach((r, idx) => {
    if (hasRowNumbers) {
      combinedRows.push([String(idx + 1).padStart(rowNumberWidth, " "), ...r]);
    } else {
      combinedRows.push(r);
    }
  });

  const effectiveColCount = hasRowNumbers ? colCount + 1 : colCount;
  const widths = Array(effectiveColCount).fill(1);
  combinedRows.forEach((r) => {
    for (let i = 0; i < effectiveColCount; i++) {
      const cell = (r[i] ?? "").toString();
      widths[i] = Math.max(widths[i], cell.length);
    }
  });

  function formatCell(cell, colIndex) {
    const value = (cell ?? "").toString();
    if (align === "r") return value.padStart(widths[colIndex], " ");
    if (align === "c") {
      const pad = widths[colIndex] - value.length;
      const left = Math.floor(pad / 2);
      const right = pad - left;
      return " ".repeat(left) + value + " ".repeat(right);
    }
    return value.padEnd(widths[colIndex], " ");
  }

  function formatRow(row) {
    const cells = [];
    for (let i = 0; i < effectiveColCount; i++) {
      cells.push(` ${formatCell(row[i], i)} `);
    }
    return `|${cells.join("|")}|`;
  }

  function formatHLine() {
    const parts = widths.map((w) => "-".repeat(w + 2));
    return `|${parts.join("+")}|`;
  }

  const lines = [];
  let headerCount = headerRows.length;

  // Emit header rows (if any), then a separator.
  for (let i = 0; i < headerCount; i++) {
    lines.push(formatRow(combinedRows[i]));
  }
  if (headerCount > 0) {
    lines.push(formatHLine());
  }

  // Emit body rows. If no headers at all, still emit a minimal table body.
  if (combinedRows.length === 0) {
    lines.push(formatRow(Array(effectiveColCount).fill("")));
  } else {
    for (let i = headerCount; i < combinedRows.length; i++) {
      lines.push(formatRow(combinedRows[i]));
    }
  }

  return lines.join("\n") + "\n";
}

module.exports = {
  activate
};