const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { pickOrgFile, parseOrgContent, exportYearSummaryForFile } = require("./yearSummary");
const { generateExecutiveReportForFile } = require("./yearExecutiveReport");
const { buildDashboardModel } = require("./yearReportBuilder");

const dashboardScriptPath = path.join(__dirname, "..", "media", "yearDashboardView.js");
const htmlUtilsScriptPath = path.join(__dirname, "..", "media", "htmlUtils.browser.js");
const htmScriptPath = path.join(__dirname, "..", "media", "htm.js");
let cachedDashboardScript = null;
let cachedHtmlUtilsScript = null;
let cachedHtmScript = null;

let dashboardPanel = null;
let dashboardState = null;

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function openYearInReview() {
  try {
    const orgUri = await pickOrgFile();
    if (!orgUri) {
      return;
    }

    await prepareDashboardForFile(orgUri.fsPath);
  } catch (error) {
    vscode.window.showErrorMessage(`Year-in-Review dashboard failed: ${error.message}`);
  }
}

async function prepareDashboardForFile(orgPath) {
  const raw = fs.readFileSync(orgPath, "utf-8");
  const parsed = parseOrgContent(raw);
  if (!parsed.days.length) {
    vscode.window.showWarningMessage("No day headings or tasks were detected in that Org file.");
    return;
  }

  const [summaryArtifacts, execArtifacts] = await Promise.all([
    exportYearSummaryForFile(orgPath, parsed),
    generateExecutiveReportForFile(orgPath, parsed)
  ]);

  const dashboardModel = buildDashboardModel(orgPath, parsed);
  const normalizedModel = {
    ...dashboardModel,
    generatedAtIso: dashboardModel.generatedAtIso || (dashboardModel.generatedAt instanceof Date
      ? dashboardModel.generatedAt.toISOString()
      : dashboardModel.generatedAt)
  };

  let csvText = "";
  try {
    csvText = fs.readFileSync(summaryArtifacts.csvPath, "utf-8");
  } catch (error) {
    console.error("org-vscode: unable to read CSV for dashboard", error);
  }

  dashboardState = {
    orgPath,
    model: normalizedModel,
    artifacts: {
      csv: summaryArtifacts.csvPath,
      json: summaryArtifacts.jsonPath,
      markdown: execArtifacts.markdownPath,
      html: execArtifacts.htmlPath,
      folder: summaryArtifacts.reportDir
    },
    csvText
  };

  const panel = ensureDashboardPanel();
  panel.title = `Year in Review (${normalizedModel.year})`;
  pushDashboardData(panel);
}

function ensureDashboardPanel() {
  if (dashboardPanel) {
    dashboardPanel.reveal(vscode.ViewColumn.Beside);
    return dashboardPanel;
  }

  dashboardPanel = vscode.window.createWebviewPanel(
    "yearInReview",
    "Year in Review",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const { webview } = dashboardPanel;
  const nonce = getNonce();
  webview.html = getDashboardHtml(webview, nonce);

  webview.onDidReceiveMessage((message) => {
    switch (message.command) {
      case "requestData":
        pushDashboardData();
        break;
      case "openArtifact":
        openArtifact(message.artifact);
        break;
      case "openSource":
        openSourceFile();
        break;
      case "openTask":
        openTaskLocation(message.lineNumber);
        break;
      case "revealFolder":
        revealReportFolder();
        break;
      default:
        break;
    }
  });

  dashboardPanel.onDidDispose(() => {
    dashboardPanel = null;
    dashboardState = null;
  });

  return dashboardPanel;
}

function pushDashboardData(targetPanel) {
  if (!dashboardState) {
    return;
  }
  const payload = {
    model: dashboardState.model,
    artifacts: dashboardState.artifacts,
    csv: dashboardState.csvText || ""
  };
  const panel = targetPanel || dashboardPanel;
  if (panel) {
    panel.webview.postMessage({ command: "dashboardData", payload });
  }
}

async function openArtifact(kind) {
  if (!dashboardState || !dashboardState.artifacts) {
    vscode.window.showWarningMessage("Dashboard artifacts are not ready yet.");
    return;
  }
  const target = dashboardState.artifacts[kind];
  if (!target) {
    vscode.window.showWarningMessage("Artifact not available for this report.");
    return;
  }
  const uri = vscode.Uri.file(target);
  if (kind === "folder") {
    vscode.commands.executeCommand("revealFileInOS", uri);
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(document, { preview: true });
  } catch (error) {
    vscode.window.showErrorMessage(`Unable to open artifact: ${error.message}`);
  }
}

async function openSourceFile() {
  if (!dashboardState?.orgPath) {
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(dashboardState.orgPath));
    await vscode.window.showTextDocument(document, { preview: false });
  } catch (error) {
    vscode.window.showErrorMessage(`Unable to open Org file: ${error.message}`);
  }
}

async function openTaskLocation(lineNumber) {
  if (!dashboardState?.orgPath || typeof lineNumber !== "number") {
    return;
  }
  try {
    const document = await vscode.workspace.openTextDocument(vscode.Uri.file(dashboardState.orgPath));
    const editor = await vscode.window.showTextDocument(document, { preview: false });
    const targetLine = Math.max(lineNumber - 1, 0);
    const position = new vscode.Position(targetLine, 0);
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
  } catch (error) {
    vscode.window.showErrorMessage(`Unable to navigate to task: ${error.message}`);
  }
}

function revealReportFolder() {
  if (!dashboardState?.artifacts?.folder) {
    return;
  }
  const uri = vscode.Uri.file(dashboardState.artifacts.folder);
  vscode.commands.executeCommand("revealFileInOS", uri);
}

function getDashboardHtml(webview, nonce) {
  const csp = `default-src 'none'; img-src ${webview.cspSource} https: data:; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src ${webview.cspSource} 'nonce-${nonce}'; font-src ${webview.cspSource} https: data:`;
  const scriptSource = loadDashboardScript();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Year in Review</title>
  <style nonce="${nonce}">
    :root {
      color-scheme: light dark;
      --bg: #050b16;
      --panel: rgba(10, 17, 31, 0.82);
      --panel-border: rgba(147, 197, 253, 0.18);
      --text: #e6edf8;
      --muted: rgba(191, 209, 236, 0.72);
      --accent: #38bdf8;
      --accent-2: #22d3ee;
      --accent-3: #f59e0b;
      --shell-max: clamp(1280px, 94vw, 3000px);
      font-family: "Space Grotesk", "Fira Sans", "Segoe UI", sans-serif;
    }
    body {
      margin: 0;
      padding: clamp(12px, 2.2vw, 32px);
      background:
        radial-gradient(circle at 12% 18%, rgba(56,189,248,0.18), transparent 34%),
        radial-gradient(circle at 84% 10%, rgba(34,211,238,0.12), transparent 28%),
        radial-gradient(circle at 50% 80%, rgba(14,165,233,0.08), transparent 35%),
        var(--bg);
      color: var(--text);
      min-height: 100vh;
      box-sizing: border-box;
    }
    .shell {
      width: min(var(--shell-max), 100%);
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .hero {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 16px;
      padding: 18px 20px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 14px;
      box-shadow: 0 18px 44px rgba(1,6,20,0.45);
      backdrop-filter: blur(8px);
    }
    .hero h1 {
      margin: 2px 0;
      font-size: clamp(1.45rem, 2.2vw, 2.05rem);
      letter-spacing: -0.02em;
    }
    .hero p {
      margin: 0;
      color: var(--muted);
    }
    .tabs {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      background: rgba(8, 14, 27, 0.82);
      border: 1px solid var(--panel-border);
      border-radius: 999px;
      padding: 4px;
      width: fit-content;
    }
    .tabs .tab {
      border: none;
      background: transparent;
      color: var(--muted);
      padding: 8px 16px;
      border-radius: 999px;
      font-weight: 600;
      letter-spacing: 0.12rem;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 120ms ease, color 120ms ease, box-shadow 120ms ease;
      box-shadow: none;
    }
    .tabs .tab.active {
      background: linear-gradient(120deg, var(--accent), var(--accent-2));
      color: #04111f;
      box-shadow: 0 10px 24px rgba(56,189,248,0.35);
    }
    .tabs .tab:not(.active):hover {
      color: var(--text);
    }
    .view.hidden {
      display: none;
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.34rem;
      font-size: 0.68rem;
      color: var(--accent-3);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }
    button {
      border-radius: 999px;
      border: 1px solid transparent;
      background: linear-gradient(120deg, var(--accent), var(--accent-2));
      color: #04111f;
      padding: 9px 16px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    button:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(56,189,248,0.35);
    }
    button.ghost {
      background: transparent;
      color: var(--text);
      border-color: var(--panel-border);
    }
    button:disabled {
      opacity: 0.4;
      cursor: not-allowed;
      box-shadow: none;
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
    }
    .stat {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 14px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-height: 108px;
    }
    .stat-label {
      font-size: 0.85rem;
      text-transform: uppercase;
      letter-spacing: 0.1rem;
      color: var(--muted);
    }
    .stat-value {
      font-size: clamp(1.35rem, 2.3vw, 2rem);
      font-weight: 600;
    }
    .panels {
      display: grid;
      grid-template-columns: minmax(280px, 1fr) minmax(560px, 1.5fr);
      gap: 12px;
      align-items: stretch;
    }
    .panel {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 14px;
      padding: 14px;
      position: relative;
      overflow: hidden;
      min-height: 0;
    }
    .panel h2 {
      margin: 0 0 12px;
      font-size: 0.92rem;
      text-transform: uppercase;
      letter-spacing: 0.16rem;
      color: var(--accent);
    }
    canvas {
      width: 100%;
      height: 220px;
      border-radius: 12px;
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
    }
    .heatmap {
      display: flex;
      flex-direction: column;
      gap: 0;
      min-width: max-content;
    }
    .heatmap-panel {
      display: grid;
      grid-column: 2;
      grid-row: 1 / span 2;
      min-height: 540px;
    }
    .timeline-panel {
      grid-column: 1;
      grid-row: 1;
    }
    .storyboard-panel {
      grid-column: 1;
      grid-row: 2;
    }
    .heatmap-shell {
      border: 1px solid rgba(148, 163, 184, 0.2);
      border-radius: 12px;
      background: rgba(2, 8, 22, 0.72);
      overflow: auto;
      max-height: calc(100vh - 360px);
      min-height: 360px;
    }
    .heatmap-meta {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }
    .heatmap-meta p {
      margin: 0;
      color: var(--muted);
      font-size: 0.82rem;
      letter-spacing: 0.04rem;
      text-transform: uppercase;
    }
    .heatmap-controls {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
    }
    .heatmap-controls input,
    .heatmap-controls select {
      min-width: 130px;
      border-radius: 10px;
      padding: 7px 10px;
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.06rem;
    }
    .heatmap-controls input[type="search"] {
      min-width: 190px;
    }
    .heatmap-row {
      display: grid;
      grid-template-columns: 190px repeat(var(--month-count, 12), minmax(44px, 44px));
      gap: 2px;
      align-items: center;
      font-size: 0.78rem;
      min-width: max-content;
    }
    .heatmap-row span.tag {
      position: sticky;
      left: 0;
      z-index: 2;
      background: rgba(7, 14, 30, 0.96);
      padding: 6px 10px;
      border-right: 1px solid rgba(148, 163, 184, 0.18);
      border-bottom: 1px solid rgba(148, 163, 184, 0.12);
      text-transform: uppercase;
      letter-spacing: 0.08rem;
      color: #d6e4ff;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .heat-cell {
      border-radius: 5px;
      text-align: center;
      padding: 5px 0;
      min-height: 22px;
      background: linear-gradient(180deg, rgba(56,189,248, calc(var(--intensity, 0) * 0.95)), rgba(14,165,233, calc(var(--intensity, 0) * 0.6)));
      color: rgba(255,255,255,0.9);
      cursor: pointer;
      transition: opacity 100ms ease;
      border: 1px solid rgba(148,163,184,0.12);
      font-weight: 600;
      font-size: 0.7rem;
    }
    .heat-cell:hover {
      opacity: 0.88;
      border-color: rgba(103, 232, 249, 0.5);
    }
    .heatmap-header {
      display: grid;
      position: sticky;
      top: 0;
      z-index: 3;
      grid-template-columns: 190px repeat(var(--month-count, 12), minmax(44px, 44px));
      gap: 2px;
      font-size: 0.66rem;
      text-transform: uppercase;
      letter-spacing: 0.09rem;
      color: var(--muted);
      min-width: max-content;
    }
    .heatmap-header span {
      text-align: center;
      background: rgba(6, 12, 25, 0.98);
      border-bottom: 1px solid rgba(148, 163, 184, 0.2);
      padding: 6px 4px;
    }
    .heatmap-header span:first-child {
      position: sticky;
      left: 0;
      z-index: 4;
      text-align: left;
      padding-left: 10px;
      border-right: 1px solid rgba(148, 163, 184, 0.2);
    }
    .panel.full {
      grid-column: 1 / -1;
    }
    .raw-panel {
      background: var(--panel);
      border: 1px solid var(--panel-border);
      border-radius: 20px;
      padding: 24px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.35);
    }
    .raw-header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      flex-wrap: wrap;
      margin-bottom: 18px;
      align-items: flex-start;
    }
    .table-shell {
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 18px;
      overflow: hidden;
    }
    .table-scroll {
      max-height: 520px;
      overflow: auto;
    }
    .raw-table {
      width: max(100%, var(--csv-table-width, 100%));
      border-collapse: collapse;
      min-width: 600px;
      font-size: 0.85rem;
      table-layout: fixed;
    }
    .raw-table th,
    .raw-table td {
      padding: 12px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      border-right: 1px solid rgba(255,255,255,0.02);
      text-align: left;
      color: var(--text);
      background: rgba(255,255,255,0.01);
    }
    .raw-table th {
      position: sticky;
      top: 0;
      background: rgba(7,11,18,0.95);
      text-transform: uppercase;
      letter-spacing: 0.18rem;
      font-size: 0.7rem;
      color: var(--muted);
      z-index: 2;
      padding: 0;
    }
    .raw-table th button.header-button {
      width: 100%;
      padding: 10px 18px 10px 12px;
      background: transparent;
      border: none;
      color: inherit;
      font: inherit;
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      text-transform: inherit;
      letter-spacing: inherit;
    }
    .raw-table th button.header-button:hover {
      color: var(--text);
    }
    .raw-table .sort-indicator {
      font-size: 0.85rem;
      opacity: 0.8;
    }
    .raw-table .filter-row th {
      position: sticky;
      top: 36px;
      padding: 8px 10px;
      background: rgba(5,9,20,0.95);
    }
    .raw-table .filter-row input {
      width: 100%;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 6px 8px;
      color: var(--text);
      font-size: 0.75rem;
    }
    .raw-table td.empty {
      text-align: center;
      font-style: italic;
      color: var(--muted);
    }
    .raw-table th .column-resizer {
      position: absolute;
      top: 0;
      right: 0;
      width: 6px;
      height: 100%;
      cursor: col-resize;
      user-select: none;
      touch-action: none;
      z-index: 4;
    }
    .raw-table th .column-resizer::after {
      content: "";
      position: absolute;
      top: 25%;
      bottom: 25%;
      right: 2px;
      width: 2px;
      background: rgba(239,246,255,0.2);
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 14px;
      align-items: center;
    }
    select, input[type="search"] {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 999px;
      color: var(--text);
      padding: 8px 16px;
      font-size: 0.9rem;
      min-width: 160px;
    }
    .task-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 360px;
      overflow-y: auto;
      padding-right: 6px;
    }
    .task-item {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.05);
      border-radius: 14px;
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      text-align: left;
      color: var(--text);
      cursor: pointer;
    }
    .task-title {
      font-weight: 600;
      font-size: 1rem;
    }
    .task-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 0.8rem;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.1rem;
    }
    .tag-chip {
      display: inline-flex;
      align-items: center;
      background: rgba(56,189,248,0.15);
      color: var(--accent);
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
    }
    .empty-state {
      color: var(--muted);
      font-style: italic;
      padding: 24px;
      text-align: center;
    }
    .active-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      font-size: 0.8rem;
    }
    .filter-chip {
      background: rgba(248,113,113,0.2);
      border-radius: 999px;
      padding: 4px 10px;
      display: inline-flex;
      gap: 6px;
      align-items: center;
      cursor: pointer;
    }
    .filter-chip svg {
      width: 10px;
      height: 10px;
    }
    @media (max-width: 900px) {
      body {
        padding: 12px;
      }
      .hero {
        flex-direction: column;
      }
      .tabs {
        flex-wrap: wrap;
        width: 100%;
      }
      .panels {
        grid-template-columns: 1fr;
      }
      .timeline-panel,
      .heatmap-panel,
      .storyboard-panel {
        grid-column: 1;
        grid-row: auto;
      }
      .heatmap-panel {
        min-height: 440px;
      }
      canvas {
        height: 180px;
      }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="hero">
      <div>
        <p class="eyebrow">Year-in-Review</p>
        <h1 id="source-name">Loading summary…</h1>
        <p id="generated-at">Preparing data…</p>
        <p id="folder-note" class="muted"></p>
      </div>
      <div class="actions">
        <button id="open-source">Open Org File</button>
        <button id="reveal-folder" class="ghost">Reveal Report Folder</button>
        <button id="download-csv" class="ghost">CSV</button>
        <button id="download-md" class="ghost">Markdown</button>
        <button id="download-html" class="ghost">HTML</button>
      </div>
    </header>

    <nav class="tabs" id="view-tabs">
      <button class="tab active" data-tab="insights">Insights</button>
      <button class="tab" data-tab="raw">Raw Tasks</button>
    </nav>

    <section class="view" data-view="insights" id="view-insights">
      <section class="stats" id="stat-grid"></section>

      <section class="panels">
        <article class="panel timeline-panel">
          <h2>Timeline Pulse</h2>
          <div class="filters">
            <select id="status-filter">
              <option value="ALL">All statuses</option>
            </select>
          </div>
          <canvas id="timeline" width="900" height="260"></canvas>
        </article>
        <article class="panel heatmap-panel">
          <h2>Tag Heatmap</h2>
          <div class="heatmap-meta">
            <p id="heatmap-summary">Loading tags…</p>
            <div class="heatmap-controls">
              <input type="search" id="heatmap-search" placeholder="Filter tags" aria-label="Filter heatmap tags" />
              <select id="heatmap-limit" aria-label="Heatmap row count">
                <option value="25">Top 25</option>
                <option value="50" selected>Top 50</option>
                <option value="100">Top 100</option>
                <option value="0">All tags</option>
              </select>
            </div>
          </div>
          <div class="heatmap-shell" id="heatmap-shell">
            <div class="heatmap-header" id="heatmap-header"></div>
            <div class="heatmap" id="heatmap"></div>
          </div>
        </article>
        <article class="panel storyboard-panel">
          <h2>Task Storyboard</h2>
          <div class="filters">
            <input type="search" id="search-input" placeholder="Search accomplishments" />
            <button id="clear-filters" class="ghost">Reset filters</button>
          </div>
          <div class="active-filters" id="active-filters"></div>
          <div class="task-list" id="task-list"></div>
        </article>
      </section>
    </section>

    <section class="view hidden" data-view="raw" id="view-raw">
      <article class="raw-panel">
        <div class="raw-header">
          <div>
            <p class="eyebrow">Raw Tasks</p>
            <h2>Full CSV Export</h2>
            <p class="muted" id="csv-note">Loading CSV…</p>
          </div>
          <button id="open-csv-file" class="ghost">Open CSV Artifact</button>
        </div>
        <div class="table-shell">
          <div class="table-scroll">
            <table class="raw-table">
              <colgroup id="csv-colgroup"></colgroup>
              <thead id="csv-head"></thead>
              <tbody id="csv-body"></tbody>
            </table>
          </div>
        </div>
      </article>
    </section>
  </div>

  <script nonce="${nonce}">${loadHtmScript()}</script>
  <script nonce="${nonce}">${loadHtmlUtilsScript()}</script>
  <script nonce="${nonce}">${scriptSource}</script>
</body>
</html>`;
}

function loadHtmScript() {
  if (cachedHtmScript !== null) {
    return cachedHtmScript;
  }

  try {
    cachedHtmScript = fs.readFileSync(htmScriptPath, "utf-8");
  } catch (error) {
    console.error("org-vscode: unable to load htm.js", error);
    cachedHtmScript = "";
  }

  return cachedHtmScript;
}

function loadHtmlUtilsScript() {
  if (cachedHtmlUtilsScript !== null) {
    return cachedHtmlUtilsScript;
  }

  try {
    cachedHtmlUtilsScript = fs.readFileSync(htmlUtilsScriptPath, "utf-8");
  } catch (error) {
    console.error("org-vscode: unable to load htmlUtils.browser.js", error);
    cachedHtmlUtilsScript = "";
  }

  return cachedHtmlUtilsScript;
}

function loadDashboardScript() {
  if (cachedDashboardScript !== null) {
    return cachedDashboardScript;
  }

  try {
    cachedDashboardScript = fs.readFileSync(dashboardScriptPath, "utf-8");
  } catch (error) {
    console.error("org-vscode: unable to load Year-in-Review webview script", error);
    cachedDashboardScript = `window.addEventListener('load', () => {
      const shell = document.querySelector('.shell');
      if (!shell) {
        return;
      }
      const errP = document.createElement('p');
      errP.style.cssText = 'color:#f87171;font-family:Segoe UI,sans-serif';
      errP.textContent = 'Year-in-Review assets were missing when the extension activated. Please reinstall org-vscode or run the build so that media/yearDashboardView.js is included.';
      shell.replaceChildren(errP);
    });`;
  }

  return cachedDashboardScript;
}

module.exports = {
  openYearInReview
};
