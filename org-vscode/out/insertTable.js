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
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <title>Insert Org Table</title>
  <style>
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
  <button onclick="generateTable()">Generate Table</button>
  <button onclick="submitTable()">Insert Table</button>
  <div id="tableContainer"></div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    function generateTable() {
      const rows = parseInt(document.getElementById('rows').value);
      const cols = parseInt(document.getElementById('cols').value);
      const container = document.getElementById('tableContainer');
      container.innerHTML = '';
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
  if (rows.length === 0) return '';
  const colCount = rows[0].length;

  const colWidths = Array(colCount).fill(0);
  rows.forEach(row => row.forEach((cell, i) => {
    colWidths[i] = Math.max(colWidths[i], cell.length);
  }));

  const rowLabelWidth = hasRowNumbers ? Math.max(3, String(rows.length).length) : 0;

  const formatCell = (cell, i) => {
    if (align === 'r') return cell.padStart(colWidths[i], ' ');
    if (align === 'c') {
      const pad = colWidths[i] - cell.length;
      const padStart = Math.floor(pad / 2);
      const padEnd = pad - padStart;
      return ' '.repeat(padStart) + cell + ' '.repeat(padEnd);
    }
    return cell.padEnd(colWidths[i], ' ');
  };

  const formatRow = row => row.map((cell, i) => formatCell(cell || '', i)).join(' │ ');

  const borderTop    = '┌' + (hasRowNumbers ? '────┬' : '') + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐\n';
  const borderHeader = '├' + (hasRowNumbers ? '────┼' : '') + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤\n';
  const borderRow    = '├' + (hasRowNumbers ? '────┼' : '') + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤\n';
  const borderBottom = '└' + (hasRowNumbers ? '────┴' : '') + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘\n';

  let output = '(╯°□°)╯︵ ┻━┻\n';
  output += borderTop;

  if (hasColHeaders) {
    const labels = Array.from({ length: colCount }, (_, i) => String.fromCharCode(65 + i));
    output += (hasRowNumbers ? '│    │ ' : '│ ') + formatRow(labels) + ' │\n';
    output += borderHeader;
  }

  if (hasHeader) {
    output += (hasRowNumbers ? '│    │ ' : '│ ') + formatRow(rows[0]) + ' │\n';
    output += borderHeader;
    rows = rows.slice(1);
  }

  rows.forEach((row, i) => {
    const rowNum = hasRowNumbers ? '│ ' + String(i + 1).padStart(2, ' ') + ' │ ' : '│ ';
    output += rowNum + formatRow(row) + ' │\n';
    if (i < rows.length - 1) output += borderRow;
  });

  output += borderBottom;
  return output;
}

module.exports = {
  activate
};