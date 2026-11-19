"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const taskKeywordManager = require("./taskKeywordManager");
const {
  stripAllTagSyntax,
  getPlanningForHeading,
  normalizeTagsAfterPlanning,
  stripInlinePlanning,
  getAllTagsFromLine
} = require("./orgTagUtils");
const {
  getAllPropertyKeysWithInheritance,
  getPropertyFromLinesWithInheritance
} = require("./orgProperties");
const { shouldIncludeOrgFileInViews } = require("./orgFileFilters");

const HEADING_RE = /^\s*(?:[⊙⊘⊜⊖⊗]\s*)?(\*+)\s+/;
const COLUMN_VIEW_LAYOUT_KEY = "orgVscode.columnView.layout";

const BASE_COLUMNS = [
  { key: "file", label: "File", visibleByDefault: true },
  { key: "line", label: "Line", visibleByDefault: true },
  { key: "level", label: "Lvl", visibleByDefault: true },
  { key: "status", label: "Status", visibleByDefault: true },
  { key: "title", label: "Heading", visibleByDefault: true },
  { key: "scheduled", label: "Scheduled", visibleByDefault: true },
  { key: "deadline", label: "Deadline", visibleByDefault: true },
  { key: "closed", label: "Closed", visibleByDefault: false },
  { key: "tags", label: "Tags", visibleByDefault: true }
];

const DEFAULT_LAYOUT = {
  visibleColumnKeys: BASE_COLUMNS.filter((c) => c.visibleByDefault).map((c) => c.key),
  sortKey: "line",
  sortDir: "asc",
  scopeMode: "global"
};

let columnViewPanel = null;
let saveDisposable = null;
let _vscode = null;
let _extensionContext = null;
let _currentScopeMode = DEFAULT_LAYOUT.scopeMode;

function getVscode() {
  if (!_vscode) {
    _vscode = require("vscode");
  }
  return _vscode;
}

function getMainDir(config) {
  const folderPath = config.get("folderPath");
  return (folderPath && String(folderPath).trim() !== "")
    ? folderPath
    : path.join(os.homedir(), "VSOrgFiles");
}

function normalizeTitle(line) {
  const withoutInlinePlanning = stripInlinePlanning(normalizeTagsAfterPlanning(line));
  const withoutTags = stripAllTagSyntax(withoutInlinePlanning);
  return taskKeywordManager.cleanTaskText(withoutTags).trim();
}

function normalizeScopeMode(value) {
  return value === "file" || value === "subtree" ? value : "global";
}

function readPersistedLayout() {
  if (!_extensionContext || !_extensionContext.workspaceState) {
    return { ...DEFAULT_LAYOUT };
  }

  const raw = _extensionContext.workspaceState.get(COLUMN_VIEW_LAYOUT_KEY);
  if (!raw || typeof raw !== "object") return { ...DEFAULT_LAYOUT };

  const visibleColumnKeys = Array.isArray(raw.visibleColumnKeys)
    ? raw.visibleColumnKeys.filter((v) => typeof v === "string")
    : DEFAULT_LAYOUT.visibleColumnKeys;

  const sortKey = (typeof raw.sortKey === "string" && raw.sortKey.trim() !== "")
    ? raw.sortKey
    : DEFAULT_LAYOUT.sortKey;

  const sortDir = raw.sortDir === "desc" ? "desc" : "asc";
  const scopeMode = normalizeScopeMode(raw.scopeMode);

  return {
    visibleColumnKeys: visibleColumnKeys.length ? visibleColumnKeys : DEFAULT_LAYOUT.visibleColumnKeys,
    sortKey,
    sortDir,
    scopeMode
  };
}

async function persistLayout(update) {
  if (!_extensionContext || !_extensionContext.workspaceState) return;
  const merged = {
    ...readPersistedLayout(),
    ...(update && typeof update === "object" ? update : {})
  };
  merged.scopeMode = normalizeScopeMode(merged.scopeMode);
  if (!Array.isArray(merged.visibleColumnKeys) || !merged.visibleColumnKeys.length) {
    merged.visibleColumnKeys = DEFAULT_LAYOUT.visibleColumnKeys;
  }
  merged.sortDir = merged.sortDir === "desc" ? "desc" : "asc";
  if (typeof merged.sortKey !== "string" || merged.sortKey.trim() === "") {
    merged.sortKey = DEFAULT_LAYOUT.sortKey;
  }
  await _extensionContext.workspaceState.update(COLUMN_VIEW_LAYOUT_KEY, merged);
}

function findHeadingAtOrAbove(lines, fromLine) {
  const start = Math.max(0, Math.min(lines.length - 1, fromLine));
  for (let i = start; i >= 0; i--) {
    const match = String(lines[i] || "").match(HEADING_RE);
    if (match) {
      return { headingLine: i, level: match[1].length };
    }
  }
  return null;
}

function findSubtreeEnd(lines, headingLine, level) {
  for (let i = headingLine + 1; i < lines.length; i++) {
    const match = String(lines[i] || "").match(HEADING_RE);
    if (match && match[1].length <= level) {
      return i - 1;
    }
  }
  return Math.max(0, lines.length - 1);
}

function collectColumnRowsFromLines(lines, fileName, options = {}) {
  const safeLines = Array.isArray(lines) ? lines : [];
  const rows = [];
  const propertyKeySet = new Set();

  const startIndex = Number.isInteger(options.startIndex) ? Math.max(0, options.startIndex) : 0;
  const endIndex = Number.isInteger(options.endIndex)
    ? Math.min(safeLines.length - 1, options.endIndex)
    : Math.max(0, safeLines.length - 1);
  const filePath = options.filePath ? String(options.filePath) : "";

  if (!safeLines.length || endIndex < startIndex) {
    return { rows, propertyKeys: [] };
  }

  for (let i = startIndex; i <= endIndex; i++) {
    const text = String(safeLines[i] || "");
    const headingMatch = text.match(HEADING_RE);
    if (!headingMatch) continue;

    const status = taskKeywordManager.findTaskKeyword(text) || "";
    const title = normalizeTitle(text);
    const level = headingMatch[1].length;
    const planning = getPlanningForHeading(safeLines, i);
    const tags = getAllTagsFromLine(text);

    const inheritedKeys = getAllPropertyKeysWithInheritance(safeLines, i);
    const properties = {};
    for (const key of inheritedKeys) {
      const value = getPropertyFromLinesWithInheritance(safeLines, i, key);
      if (value != null && String(value).trim() !== "") {
        properties[key] = String(value);
        propertyKeySet.add(key);
      }
    }

    rows.push({
      file: fileName,
      filePath,
      line: i + 1,
      level,
      status,
      title,
      tags: tags.join(":"),
      scheduled: planning && planning.scheduled ? planning.scheduled : "",
      deadline: planning && planning.deadline ? planning.deadline : "",
      closed: planning && planning.closed ? planning.closed : "",
      properties
    });
  }

  return {
    rows,
    propertyKeys: Array.from(propertyKeySet).sort((a, b) => a.localeCompare(b))
  };
}

function collectGlobalData(config) {
  const dirPath = getMainDir(config);
  const out = {
    rows: [],
    propertyKeys: [],
    skippedFiles: [],
    baseDir: dirPath,
    warning: ""
  };

  let items = [];
  try {
    items = fs.readdirSync(dirPath);
  } catch (err) {
    out.skippedFiles.push({ file: "(directory)", reason: err && err.message ? err.message : String(err) });
    return out;
  }

  const propertyKeySet = new Set();

  for (const fileName of items) {
    const fullPath = path.join(dirPath, fileName);
    if (!shouldIncludeOrgFileInViews(fileName, fullPath, config)) continue;

    let lines = [];
    try {
      lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/);
    } catch (err) {
      out.skippedFiles.push({ file: fileName, reason: err && err.message ? err.message : String(err) });
      continue;
    }

    const parsed = collectColumnRowsFromLines(lines, fileName);
    for (const row of parsed.rows) {
      row.filePath = fullPath;
      out.rows.push(row);
    }
    for (const key of parsed.propertyKeys) propertyKeySet.add(key);
  }

  out.propertyKeys = Array.from(propertyKeySet).sort((a, b) => a.localeCompare(b));
  return out;
}

function collectActiveEditorData(vscode, scopeMode) {
  const out = {
    rows: [],
    propertyKeys: [],
    skippedFiles: [],
    baseDir: "",
    warning: ""
  };

  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document) {
    out.warning = "No active editor is available for this scope.";
    return out;
  }

  const doc = editor.document;
  const lines = doc.getText().split(/\r?\n/);
  const fileName = path.basename(doc.fileName || "untitled");
  const filePath = doc.uri && doc.uri.fsPath ? doc.uri.fsPath : "";

  if (scopeMode === "subtree") {
    const anchor = editor.selection ? editor.selection.active.line : 0;
    const heading = findHeadingAtOrAbove(lines, anchor);
    if (!heading) {
      out.warning = "No heading found above the cursor for subtree scope.";
      return out;
    }
    const end = findSubtreeEnd(lines, heading.headingLine, heading.level);
    const parsed = collectColumnRowsFromLines(lines, fileName, {
      filePath,
      startIndex: heading.headingLine,
      endIndex: end
    });
    out.rows = parsed.rows;
    out.propertyKeys = parsed.propertyKeys;
    return out;
  }

  const parsed = collectColumnRowsFromLines(lines, fileName, { filePath });
  out.rows = parsed.rows;
  out.propertyKeys = parsed.propertyKeys;
  return out;
}

function collectColumnViewData(vscode, config, scopeMode) {
  const normalizedScope = normalizeScopeMode(scopeMode);
  if (normalizedScope === "global") {
    return collectGlobalData(config);
  }
  return collectActiveEditorData(vscode, normalizedScope);
}

function buildColumns(data) {
  return [
    ...BASE_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
    ...data.propertyKeys.map((k) => ({ key: `prop:${k}`, label: k }))
  ];
}

function getWebviewHtml(panel, data, layout, scopeMode) {
  const nonce = (() => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let out = "";
    for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  })();

  const columns = buildColumns(data);
  const safeLayout = layout && typeof layout === "object" ? layout : DEFAULT_LAYOUT;
  const safeScope = normalizeScopeMode(scopeMode);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Column View</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-panel-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --accent: var(--vscode-button-background);
      --accent-fg: var(--vscode-button-foreground);
      --hover: var(--vscode-list-hoverBackground);
      --active: var(--vscode-list-activeSelectionBackground);
    }
    body {
      margin: 0;
      padding: 12px;
      color: var(--fg);
      background: var(--bg);
      font-family: var(--vscode-font-family);
      font-size: 13px;
    }
    .topbar {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 10px;
      flex-wrap: wrap;
    }
    .title {
      font-weight: 700;
      margin-right: 10px;
    }
    .controls {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
    }
    .meta {
      color: var(--muted);
      font-size: 12px;
    }
    select {
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 8px;
    }
    input[type="search"] {
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 6px 8px;
      min-width: 280px;
    }
    button {
      background: var(--accent);
      color: var(--accent-fg);
      border: 0;
      border-radius: 6px;
      padding: 6px 10px;
      cursor: pointer;
    }
    .table-wrap {
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: auto;
      max-height: calc(100vh - 110px);
    }
    .column-picker {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 8px;
      margin-bottom: 8px;
      display: none;
      background: color-mix(in srgb, var(--bg) 90%, var(--fg) 10%);
    }
    .column-picker.visible {
      display: block;
    }
    .column-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 6px 10px;
    }
    .warning {
      color: var(--muted);
      margin: 6px 0;
    }
    table {
      border-collapse: collapse;
      width: max-content;
      min-width: 100%;
    }
    th, td {
      border-bottom: 1px solid var(--border);
      padding: 6px 8px;
      white-space: nowrap;
      text-align: left;
      vertical-align: top;
    }
    th {
      position: sticky;
      top: 0;
      background: var(--bg);
      z-index: 1;
      cursor: pointer;
      user-select: none;
      font-weight: 700;
    }
    th.sort::after {
      content: attr(data-sort);
      margin-left: 6px;
      color: var(--muted);
      font-size: 11px;
    }
    tr:hover {
      background: var(--hover);
    }
    tr.selected {
      background: var(--active);
    }
    td.heading {
      max-width: 700px;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .empty {
      color: var(--muted);
      padding: 14px;
    }
  </style>
</head>
<body>
  <div class="topbar">
    <span class="title">Column View</span>
    <div class="controls">
      <label for="scope">Scope</label>
      <select id="scope">
        <option value="global">All Org Files</option>
        <option value="file">Active File</option>
        <option value="subtree">Current Subtree</option>
      </select>
      <input id="filter" type="search" placeholder="Filter rows (heading, status, tags, properties...)" />
      <button id="toggleColumns">Columns</button>
      <button id="refresh">Refresh</button>
    </div>
    <span class="meta" id="meta"></span>
  </div>
  <div id="warning" class="warning"></div>
  <div id="columnPicker" class="column-picker">
    <div class="column-grid" id="columnGrid"></div>
  </div>
  <div class="table-wrap">
    <table>
      <thead><tr id="head"></tr></thead>
      <tbody id="body"></tbody>
    </table>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const columns = ${JSON.stringify(columns)};
    const allRows = ${JSON.stringify(data.rows)};
    const skipped = ${JSON.stringify(data.skippedFiles)};
    const warning = ${JSON.stringify(data.warning || "")};
    const initialLayout = ${JSON.stringify(safeLayout)};
    const initialScopeMode = ${JSON.stringify(safeScope)};

    let filterText = "";
    let sortKey = initialLayout.sortKey || "line";
    let sortDir = initialLayout.sortDir === "desc" ? "desc" : "asc";
    const visibleColumnKeys = new Set(Array.isArray(initialLayout.visibleColumnKeys) ? initialLayout.visibleColumnKeys : []);

    const headEl = document.getElementById("head");
    const bodyEl = document.getElementById("body");
    const metaEl = document.getElementById("meta");
    const scopeEl = document.getElementById("scope");
    const warningEl = document.getElementById("warning");
    const pickerEl = document.getElementById("columnPicker");
    const gridEl = document.getElementById("columnGrid");

    if (!Array.from(visibleColumnKeys).length) {
      for (const c of columns) {
        if (c.key === "file" || c.key === "line" || c.key === "status" || c.key === "title") {
          visibleColumnKeys.add(c.key);
        }
      }
    }

    function persistLayout() {
      vscode.postMessage({
        command: "saveLayout",
        layout: {
          visibleColumnKeys: Array.from(visibleColumnKeys),
          sortKey,
          sortDir,
          scopeMode: scopeEl.value
        }
      });
    }

    function visibleColumns() {
      const out = columns.filter((c) => visibleColumnKeys.has(c.key));
      return out.length ? out : [columns[0]];
    }

    function renderColumnPicker() {
      gridEl.innerHTML = "";
      for (const c of columns) {
        const wrap = document.createElement("label");
        wrap.style.display = "flex";
        wrap.style.gap = "6px";
        wrap.style.alignItems = "center";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = visibleColumnKeys.has(c.key);
        cb.addEventListener("change", () => {
          if (cb.checked) {
            visibleColumnKeys.add(c.key);
          } else if (visibleColumnKeys.size > 1) {
            visibleColumnKeys.delete(c.key);
          } else {
            cb.checked = true;
          }
          persistLayout();
          render();
        });

        const text = document.createElement("span");
        text.textContent = c.label;
        wrap.appendChild(cb);
        wrap.appendChild(text);
        gridEl.appendChild(wrap);
      }
    }

    function cellValue(row, key) {
      if (key.startsWith("prop:")) {
        const propKey = key.slice(5);
        return (row.properties && row.properties[propKey]) ? row.properties[propKey] : "";
      }
      return row[key] == null ? "" : String(row[key]);
    }

    function normalize(v) { return String(v || "").toLowerCase(); }

    function buildRowSearchText(row) {
      const propVals = Object.values(row.properties || {}).join(" ");
      return normalize([row.file, row.line, row.level, row.status, row.title, row.scheduled, row.deadline, row.closed, row.tags, propVals].join(" "));
    }

    function compareRows(a, b) {
      const av = cellValue(a, sortKey);
      const bv = cellValue(b, sortKey);
      const aNum = Number(av);
      const bNum = Number(bv);
      let base = 0;
      if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && av !== "" && bv !== "") {
        base = aNum - bNum;
      } else {
        base = String(av).localeCompare(String(bv));
      }
      return sortDir === "asc" ? base : -base;
    }

    function render() {
      const shownColumns = visibleColumns();
      headEl.innerHTML = "";
      for (const c of shownColumns) {
        const th = document.createElement("th");
        th.textContent = c.label;
        th.className = "sort";
        th.dataset.sort = sortKey === c.key ? (sortDir === "asc" ? "↑" : "↓") : "";
        th.addEventListener("click", () => {
          if (sortKey === c.key) {
            sortDir = sortDir === "asc" ? "desc" : "asc";
          } else {
            sortKey = c.key;
            sortDir = "asc";
          }
          persistLayout();
          render();
        });
        headEl.appendChild(th);
      }

      const filtered = allRows
        .filter((r) => !filterText || buildRowSearchText(r).includes(filterText))
        .sort(compareRows);

      bodyEl.innerHTML = "";
      for (const row of filtered) {
        const tr = document.createElement("tr");
        tr.addEventListener("click", () => {
          document.querySelectorAll("tr.selected").forEach((el) => el.classList.remove("selected"));
          tr.classList.add("selected");
          vscode.postMessage({ command: "revealTask", filePath: row.filePath, lineNumber: row.line });
        });

        for (const c of shownColumns) {
          const td = document.createElement("td");
          td.textContent = cellValue(row, c.key);
          if (c.key === "title") td.className = "heading";
          tr.appendChild(td);
        }

        bodyEl.appendChild(tr);
      }

      if (!filtered.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = String(shownColumns.length);
        td.className = "empty";
        td.textContent = "No rows match the current filter.";
        tr.appendChild(td);
        bodyEl.appendChild(tr);
      }

      const skippedText = skipped.length ? (" | skipped files: " + skipped.length) : "";
      metaEl.textContent = String(filtered.length) + " / " + String(allRows.length) + " rows" + skippedText;
      warningEl.textContent = warning || "";
    }

    document.getElementById("filter").addEventListener("input", (e) => {
      filterText = normalize(e.target.value);
      render();
    });

    document.getElementById("refresh").addEventListener("click", () => {
      vscode.postMessage({ command: "refresh" });
    });

    document.getElementById("toggleColumns").addEventListener("click", () => {
      pickerEl.classList.toggle("visible");
    });

    scopeEl.value = initialScopeMode;
    scopeEl.addEventListener("change", () => {
      persistLayout();
      vscode.postMessage({ command: "changeScope", scopeMode: scopeEl.value });
    });

    renderColumnPicker();
    render();
  </script>
</body>
</html>`;
}

function renderPanel(vscode) {
  if (!columnViewPanel) return;
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const layout = readPersistedLayout();
  _currentScopeMode = normalizeScopeMode(layout.scopeMode);
  const data = collectColumnViewData(vscode, config, _currentScopeMode);
  columnViewPanel.webview.html = getWebviewHtml(columnViewPanel, data, layout, _currentScopeMode);
}

function showColumnView(context) {
  const vscode = getVscode();
  _extensionContext = context || _extensionContext;

  const layout = readPersistedLayout();
  _currentScopeMode = normalizeScopeMode(layout.scopeMode);

  if (!columnViewPanel) {
    columnViewPanel = vscode.window.createWebviewPanel(
      "orgColumnView",
      "Column View",
      vscode.ViewColumn.Beside,
      { enableScripts: true }
    );

    columnViewPanel.onDidDispose(() => {
      columnViewPanel = null;
      if (saveDisposable) {
        saveDisposable.dispose();
        saveDisposable = null;
      }
    });

    columnViewPanel.webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message !== "object") return;
      if (message.command === "refresh") {
        renderPanel(vscode);
        return;
      }

      if (message.command === "saveLayout") {
        const layoutUpdate = message.layout && typeof message.layout === "object" ? message.layout : {};
        await persistLayout(layoutUpdate);
        _currentScopeMode = normalizeScopeMode(layoutUpdate.scopeMode || _currentScopeMode);
        return;
      }

      if (message.command === "changeScope") {
        const nextMode = normalizeScopeMode(message.scopeMode);
        _currentScopeMode = nextMode;
        await persistLayout({ scopeMode: nextMode });
        renderPanel(vscode);
        return;
      }

      if (message.command === "revealTask") {
        const filePath = String(message.filePath || "");
        const lineNumber = Number(message.lineNumber || 1);
        if (!filePath) return;

        const uri = vscode.Uri.file(filePath);
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false);
          const targetLine = Math.max(0, Math.min(doc.lineCount - 1, lineNumber - 1));
          const pos = new vscode.Position(targetLine, 0);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
        } catch (err) {
          const msg = err && err.message ? err.message : String(err);
          vscode.window.showErrorMessage(`Column View: failed to open task location (${msg}).`);
        }
      }
    });

    saveDisposable = vscode.workspace.onDidSaveTextDocument(() => {
      if (!columnViewPanel) return;
      renderPanel(vscode);
    });
  } else {
    columnViewPanel.reveal(columnViewPanel.viewColumn);
  }

  renderPanel(vscode);
}

module.exports = {
  showColumnView,
  _test: {
    collectColumnRowsFromLines,
    findHeadingAtOrAbove,
    findSubtreeEnd
  }
};
