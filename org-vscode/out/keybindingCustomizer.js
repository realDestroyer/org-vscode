"use strict";
/**
 * Keybinding Customizer
 *
 * Provides a webview UI for users to customize keybindings for org-vscode commands.
 *
 * Implementation notes:
 * - We read default keybindings from this extension's contributed keybindings.
 * - We write overrides into the user's keybindings.json by:
 *   1) removing the contributed default binding (via a '-' removal entry)
 *   2) adding the user's desired binding.
 * - We only manage entries for commands we list and only for the same `when` as the contributed binding.
 */

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const jsonc = require("jsonc-parser");
const { html, escapeText, escapeAttr } = require("./htmlUtils");

let keybindingCustomizerPanel = null;

function openKeybindingCustomizer() {
  if (keybindingCustomizerPanel) {
    keybindingCustomizerPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  keybindingCustomizerPanel = vscode.window.createWebviewPanel(
    "keybindingCustomizer",
    "Keybinding Customizer",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const nonce = getNonce();
  const model = getKeybindingModel();
  keybindingCustomizerPanel.webview.html = getWebviewContent(nonce, model);

  keybindingCustomizerPanel.webview.onDidReceiveMessage(async (message) => {
    try {
      switch (message.command) {
        case "saveKeybindings":
          await saveKeybindings(message.bindings);
          vscode.window.showInformationMessage("Keybindings saved successfully!");
          break;
        case "resetToDefaults":
          await resetToDefaults();
          keybindingCustomizerPanel.webview.postMessage({
            command: "modelUpdated",
            model: getKeybindingModel()
          });
          vscode.window.showInformationMessage("Keybindings reset to defaults!");
          break;
        case "openKeyboardShortcuts":
          vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", "org-vscode");
          break;
        case "webviewError":
          vscode.window.showErrorMessage(`Keybinding Customizer error: ${message?.error || "Unknown error"}`);
          break;
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      vscode.window.showErrorMessage(`Keybinding Customizer failed: ${msg}`);
    }
  });

  keybindingCustomizerPanel.onDidDispose(() => {
    keybindingCustomizerPanel = null;
  });
}

function getKeybindingModel() {
  const ext = vscode.extensions.getExtension("realDestroyer.org-vscode");
  const pkg = (ext && ext.packageJSON) || {};
  const contributedKeybindings = (pkg.contributes && pkg.contributes.keybindings) || [];
  const contributedCommands = (pkg.contributes && pkg.contributes.commands) || [];

  const ORG_EDITOR_WHEN = "(editorLangId == 'vso' || editorLangId == 'org' || editorLangId == 'vsorg' || editorLangId == 'org-vscode') && editorTextFocus";

  const summaryByCommand = new Map([
    ["extension.viewAgenda", "Open the agenda view."],
    ["extension.viewTaggedAgenda", "Open the tagged agenda view."],
    ["extension.openCalendarView", "Open the calendar view."],
    ["org-vscode.openPreview", "Open the org preview webview."],
    ["org-vscode.openPreviewToSide", "Open the org preview webview to the side."],
    ["extension.openSyntaxColorCustomizer", "Open the syntax color customizer."],
    ["extension.openKeybindingCustomizer", "Open the keybinding customizer."],
    ["orgMode.exportYearSummary", "Export a yearly summary report."],
    ["orgMode.generateExecutiveReport", "Generate the executive report."],
    ["orgMode.openYearInReview", "Open the year-in-review dashboard."],
    ["org-vscode.exportCurrentTasks", "Export the current tasks list."],
    ["extension.exportCurrentTasks", "Export the current tasks list."],
    ["org-vscode.insertNewElement", "Insert a new org element (smart)."],
    ["org-vscode.insertTable", "Insert an org table."],
    ["extension.scheduling", "Add or edit a SCHEDULED stamp."],
    ["extension.deadline", "Add or edit a DEADLINE stamp."],
    ["extension.insertDateStamp", "Insert a date stamp at the cursor."],
    ["extension.incrementDate", "Increment the date stamp."],
    ["extension.decrementDate", "Decrement the date stamp."],
    ["extension.smartDateForward", "Move a day heading/SCHEDULED date forward."],
    ["extension.smartDateBackward", "Move a day heading/SCHEDULED date backward."],
    ["extension.deadlineDateForward", "Move a DEADLINE date forward."],
    ["extension.deadlineDateBackward", "Move a DEADLINE date backward."],
    ["extension.rescheduleTaskForward", "Reschedule the task forward."],
    ["extension.rescheduleTaskBackward", "Reschedule the task backward."],
    ["extension.alignSchedules", "Align SCHEDULED/DEADLINE stamps in the file."],
    ["extension.addTagToTask", "Add a tag to the current task."],
    ["extension.addFileTag", "Add a file-level tag."],
    ["extension.getTags", "Open a file by tag."],
    ["extension.getTitles", "Open a file by title."],
    ["extension.createVsoFile", "Create a new org/vso file."],
    ["extension.migrateFileToV2", "Migrate a file to the v2 format."],
    ["extension.convertDatesInActiveFile", "Convert dates in the current file to your configured format."],
    ["extension.updateDates", "Convert dates in the current file to your configured format."],
    ["extension.setFolderPath", "Change the main Org-vscode folder path."],
    ["extension.toggleBoldMarkup", "Toggle *bold* emphasis for the selection."],
    ["extension.toggleItalicMarkup", "Toggle /italic/ emphasis for the selection."],
    ["extension.toggleUnderlineMarkup", "Toggle _underline_ emphasis for the selection."],
    ["extension.addSeparator", "Insert a separator line."],
    ["extension.insertCheckboxItem", "Insert a checkbox item."],
    ["extension.toggleCheckboxCookie", "Toggle the checkbox cookie ([x/y], [%]) for a task."],
    ["extension.showMessageTest", "Show a welcome/test message."],
    ["extension.toggleStatusRight", "Rotate the task keyword forward (uses Org-vscode.workflowStates order)."],
    ["extension.toggleStatusLeft", "Rotate the task keyword backward (uses Org-vscode.workflowStates order)."],
    ["extension.moveBlockUp", "Move the current heading block up (Emacs-style subtree move)."],
    ["extension.moveBlockDown", "Move the current heading block down (Emacs-style subtree move)."],
    ["extension.increment", "Increase heading level/indentation on the current line or selection (uses Org-vscode.headingMarkerStyle)."],
    ["extension.decrement", "Decrease heading level/indentation on the current line or selection (uses Org-vscode.headingMarkerStyle)."],
    ["extension.toggleCheckboxItem", "Toggle the checkbox state at the cursor line."]
  ]);

  const titleByCommand = new Map();
  for (const c of contributedCommands) {
    if (c && c.command) {
      titleByCommand.set(c.command, c.title || c.command);
    }
  }

  const cleanDisplayTitle = (rawTitle, id) => {
    let t = String(rawTitle || id || "").trim();
    t = t.replace(/^Org-vscode:\s*/i, "");
    t = t.replace(/^org-vscode:\s*/i, "");
    t = t.replace(/^org-vscode\s+/i, "");
    return t || String(id || "");
  };

  const fallbackTitleForCommand = (id) => {
    const contributed = titleByCommand.get(id);
    if (contributed) return cleanDisplayTitle(contributed, id);

    if (typeof id === "string" && id.startsWith("extension.")) {
      const rest = id.slice("extension.".length);
      if (!rest) return id;
      return rest.charAt(0).toUpperCase() + rest.slice(1);
    }

    return id;
  };

  const fallbackSummaryForCommand = (id, title) => {
    const explicit = summaryByCommand.get(id);
    if (explicit) return explicit;

    const t = String(title || "").trim();
    if (!t) return "";

    // Simple title->sentence fallback.
    const sentence = /[.!?]$/.test(t) ? t : `${t}.`;
    // If it's not clearly a verb phrase, prefix with "Run".
    if (/^(open|view|insert|toggle|add|remove|export|generate|create|convert|align|migrate|reschedule|move|change)/i.test(t)) {
      return sentence;
    }
    return `Run ${sentence}`;
  };

  // Filter to our extension's commands only.
  const isOurCommand = (id) => {
    if (!id || typeof id !== "string") return false;
    if (id.startsWith("-")) return false;
    return id.startsWith("org-vscode.") || id.startsWith("extension.") || id.startsWith("orgMode.");
  };

  // Build an index of default keybindings by command.
  const defaultKeybindingByCommand = new Map();
  for (const kb of contributedKeybindings) {
    if (!kb || !isOurCommand(kb.command) || kb.command.startsWith("-") || !kb.key) continue;
    // If multiple defaults exist, keep the first one (one row per command).
    if (!defaultKeybindingByCommand.has(kb.command)) {
      defaultKeybindingByCommand.set(kb.command, {
        key: kb.key,
        when: kb.when || ""
      });
    }
  }

  // One row per contributed command (includes commands with no default keybinding).
  const byCommand = new Map();
  for (const c of contributedCommands) {
    if (!c || !isOurCommand(c.command)) continue;

    const commandId = c.command;
    const displayTitle = fallbackTitleForCommand(commandId);
    const kb = defaultKeybindingByCommand.get(commandId);
    const when = kb?.when || ORG_EDITOR_WHEN;
    const defaultKey = kb?.key || "";

    byCommand.set(commandId, {
      command: commandId,
      title: displayTitle,
      summary: fallbackSummaryForCommand(commandId, displayTitle),
      defaultKey,
      when
    });
  }

  const rows = Array.from(byCommand.values());
  rows.sort((a, b) => a.title.localeCompare(b.title));

  // Overlay user keybindings.json overrides
  const user = loadUserKeybindings();

  for (const row of rows) {
    const desired = getEffectiveKeyForCommand(user, row.command, row.defaultKey, row.when);
    row.currentKey = desired;
    row.isCustomized = normalizeKey(desired) !== normalizeKey(row.defaultKey);
    row.isDisabled = !desired;
  }

  return {
    groups: groupRows(rows)
  };
}

function groupRows(rows) {
  const groups = {
    "Editing": [],
    "Dates": [],
    "Views": [],
    "Export": [],
    "Other": []
  };

  const categorize = (cmd) => {
    if (cmd === "org-vscode.openPreviewToSide" || cmd === "org-vscode.openPreview" || cmd === "extension.openCalendarView" || cmd === "extension.viewAgenda" || cmd === "extension.viewTaggedAgenda") {
      return "Views";
    }
    if (/Date|deadline|scheduling|reschedule|alignSchedules/i.test(cmd) || /insertDateStamp/i.test(cmd)) {
      return "Dates";
    }
    if (/export/i.test(cmd) || cmd === "orgMode.exportYearSummary" || cmd === "extension.exportCurrentTasks") {
      return "Export";
    }
    if (/moveBlock|toggleStatus|insertNewElement|toggleCheckbox|insertTable|increment\b|decrement\b/i.test(cmd)) {
      return "Editing";
    }
    return "Other";
  };

  for (const row of rows) {
    const g = categorize(row.command);
    (groups[g] || groups.Other).push(row);
  }

  // Only return non-empty groups (keeps UI tidy but doesn't add extra features).
  return Object.entries(groups)
    .filter(([_, items]) => items.length > 0)
    .map(([name, items]) => ({ name, items }));
}

function normalizeKey(key) {
  if (!key) return "";
  return String(key).trim().toLowerCase();
}

function getEffectiveKeyForCommand(userKeybindings, commandId, defaultKey, when) {
  const normalizedWhen = String(when || "").trim();
  const defaultRemoval = userKeybindings.find(
    (kb) => kb && kb.command === `-${commandId}` && normalizeKey(kb.key) === normalizeKey(defaultKey) && String(kb.when || "").trim() === normalizedWhen
  );

  const override = userKeybindings.find(
    (kb) => kb && kb.command === commandId && String(kb.when || "").trim() === normalizedWhen
  );

  if (override && override.key) return String(override.key);
  if (defaultRemoval) return "";
  return defaultKey || "";
}

function loadUserKeybindings() {
  const filePath = getUserKeybindingsPath();
  if (!filePath) {
    return [];
  }

  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) return [];

    // keybindings.json supports JSONC.
    const errors = [];
    const parsed = jsonc.parse(trimmed, errors, { allowTrailingComma: true, disallowComments: false });
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function getUserKeybindingsPath() {
  const appName = (vscode.env && vscode.env.appName) ? String(vscode.env.appName) : "";
  const folderName = mapAppNameToUserDataFolder(appName);

  try {
    if (process.platform === "win32") {
      const appData = process.env.APPDATA;
      if (!appData) return null;
      return path.join(appData, folderName, "User", "keybindings.json");
    }

    const home = process.env.HOME || process.env.USERPROFILE;
    if (!home) return null;

    if (process.platform === "darwin") {
      return path.join(home, "Library", "Application Support", folderName, "User", "keybindings.json");
    }

    return path.join(home, ".config", folderName, "User", "keybindings.json");
  } catch (_) {
    return null;
  }
}

function mapAppNameToUserDataFolder(appName) {
  const name = String(appName || "");
  if (/VSCodium/i.test(name)) return "VSCodium";
  if (/Insiders/i.test(name)) return "Code - Insiders";
  if (/OSS/i.test(name)) return "Code - OSS";
  // Default stable VS Code
  return "Code";
}

async function saveKeybindings(bindings) {
  if (!bindings || typeof bindings !== "object") {
    throw new Error("No keybinding payload received from webview");
  }

  const model = getKeybindingModel();
  const rows = model.groups.flatMap(g => g.items);

  const filePath = getUserKeybindingsPath();
  if (!filePath) {
    throw new Error("Unable to locate user keybindings.json on this platform");
  }

  let existingText = "";
  if (fs.existsSync(filePath)) {
    existingText = fs.readFileSync(filePath, "utf8");
  }

  const errors = [];
  const parsed = existingText.trim()
    ? jsonc.parse(existingText, errors, { allowTrailingComma: true, disallowComments: false })
    : [];
  const current = Array.isArray(parsed) ? parsed : [];

  const desiredByCommand = new Map(Object.entries(bindings));

  const normalizeWhen = (w) => String(w || "").trim();

  const isManagedEntry = (entry, row) => {
    if (!entry || typeof entry !== "object") return false;
    const when = normalizeWhen(entry.when);
    const rowWhen = normalizeWhen(row.when);
    if (when !== rowWhen) return false;

    if (entry.command === row.command) return true;
    if (entry.command === `-${row.command}` && normalizeKey(entry.key) === normalizeKey(row.defaultKey)) return true;
    return false;
  };

  // Remove prior managed entries for our rows.
  let next = current.filter((entry) => !rows.some((row) => isManagedEntry(entry, row)));

  // Add new managed entries based on desired keys.
  for (const row of rows) {
    const desired = normalizeKey(desiredByCommand.get(row.command));
    const def = normalizeKey(row.defaultKey);
    const rowWhen = normalizeWhen(row.when);

    // Blank or default => restore defaults (no overrides or removals)
    if (!desired || desired === def) {
      continue;
    }

    // Remove the default binding (so user key replaces it instead of adding a second binding)
    if (row.defaultKey) {
      const removal = {
        key: row.defaultKey,
        command: `-${row.command}`
      };
      if (rowWhen) {
        removal.when = rowWhen;
      }
      next.push(removal);
    }

    // Add the user's override
    const override = {
      key: desiredByCommand.get(row.command),
      command: row.command
    };
    if (rowWhen) {
      override.when = rowWhen;
    }
    next.push(override);
  }

  // Ensure directory exists
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + "\n", "utf8");
}

async function resetToDefaults() {
  const model = getKeybindingModel();
  const rows = model.groups.flatMap(g => g.items);
  const filePath = getUserKeybindingsPath();
  if (!filePath || !fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath, "utf8");
  const errors = [];
  const parsed = raw.trim()
    ? jsonc.parse(raw, errors, { allowTrailingComma: true, disallowComments: false })
    : [];
  const current = Array.isArray(parsed) ? parsed : [];

  const normalizeWhen = (w) => String(w || "").trim();
  const isManaged = (entry, row) => {
    if (!entry || typeof entry !== "object") return false;
    const when = normalizeWhen(entry.when);
    const rowWhen = normalizeWhen(row.when);
    if (when !== rowWhen) return false;
    if (entry.command === row.command) return true;
    if (entry.command === `-${row.command}` && normalizeKey(entry.key) === normalizeKey(row.defaultKey)) return true;
    return false;
  };

  const next = current.filter((entry) => !rows.some((row) => isManaged(entry, row)));
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2) + "\n", "utf8");
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

function getWebviewContent(nonce, model) {
  const groupsHtml = (model.groups || []).map((g) => {
    const rowsHtml = (g.items || []).map((row) => {
      const summary = row.summary || "";
      const defKey = row.defaultKey || "";
      const currentKey = row.currentKey || "";
      const displayKey = currentKey ? currentKey : (defKey ? defKey : "(unbound)");

      return html`
        <div class="scope-row" data-command=${row.command}>
          <div class="scope-info">
            <span class="scope-name">${row.title}</span>
            ${summary ? html`<span class="scope-summary">${summary}</span>` : ""}
            <span class="scope-technical">${row.command}</span>
            <span class="scope-technical">default: ${defKey || "(none)"}</span>
          </div>
          <div class="scope-controls">
            <div class="key-wrapper">
              <span class="control-heading">Key</span>
              <input type="text"
                     class="key-text"
                     data-command=${row.command}
                     value=${currentKey}
                     placeholder="(use default)"
                     spellcheck="false"
                     autocomplete="off" />
            </div>
            <div class="preview" data-command=${row.command}>
              ${displayKey}
            </div>
          </div>
        </div>
      `;
    }).join("");

    const groupHeader = html`<h3 class="group-header">${g.name}</h3>`;
    return `
      <div class="scope-group">
        ${groupHeader}
        ${rowsHtml}
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Keybinding Customizer</title>
  <style nonce="${nonce}">
    :root {
      --bg-primary: #1e1e1e;
      --bg-secondary: #252526;
      --bg-tertiary: #2d2d30;
      --text-primary: #cccccc;
      --text-secondary: #9d9d9d;
      --accent: #0e639c;
      --accent-hover: #1177bb;
      --border: #3c3c3c;
      --success: #4ec9b0;
      --warning: #dcdcaa;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      padding: 20px;
      line-height: 1.5;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
    }

    h1 {
      font-size: 24px;
      font-weight: 600;
      color: var(--text-primary);
    }

    .header-actions { display: flex; gap: 12px; }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .btn-primary { background: var(--accent); color: white; }
    .btn-primary:hover { background: var(--accent-hover); }
    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }
    .btn-secondary:hover { background: var(--border); }
    .btn-link {
      background: transparent;
      color: var(--accent-hover);
      text-decoration: underline;
      padding: 8px 0;
    }
    .btn-link:hover { color: var(--success); }

    .description {
      color: var(--text-secondary);
      font-size: 14px;
      margin-bottom: 24px;
      max-width: 700px;
    }

    .scope-group {
      background: var(--bg-secondary);
      border-radius: 8px;
      margin-bottom: 16px;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .group-header {
      background: var(--bg-tertiary);
      padding: 12px 16px;
      font-size: 14px;
      font-weight: 600;
      color: var(--warning);
      border-bottom: 1px solid var(--border);
    }

    .scope-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
    }
    .scope-row:last-child { border-bottom: none; }

    .scope-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 260px;
      max-width: 520px;
    }

    .scope-name { font-weight: 500; color: var(--text-primary); }
    .scope-summary {
      font-size: 12px;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .scope-technical {
      font-size: 11px;
      color: var(--text-secondary);
      font-family: 'Consolas', 'Courier New', monospace;
      word-break: break-word;
    }

    .scope-controls { display: flex; align-items: center; gap: 20px; }

    .key-wrapper { display: flex; align-items: center; gap: 8px; }

    .control-heading {
      width: 78px;
      text-align: right;
      font-size: 12px;
      color: var(--text-secondary);
      user-select: none;
    }

    .key-text {
      width: 180px;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
    }
    .key-text:focus { outline: none; border-color: var(--accent); }

    .preview {
      min-width: 180px;
      padding: 8px 12px;
      background: var(--bg-primary);
      border-radius: 4px;
      font-family: 'Consolas', 'Fira Code', 'Courier New', monospace;
      font-size: 13px;
      text-align: center;
      color: var(--success);
    }

    .keyboard-section {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid var(--border);
    }

    .keyboard-section h2 {
      font-size: 18px;
      margin-bottom: 12px;
    }

    .keyboard-section p {
      color: var(--text-secondary);
      font-size: 14px;
      margin-bottom: 12px;
    }

    .unsaved-indicator {
      display: none;
      color: var(--warning);
      font-size: 12px;
      margin-left: 12px;
    }

    .unsaved-indicator.visible { display: inline; }

    @media (max-width: 900px) {
      .scope-row { flex-direction: column; align-items: flex-start; gap: 12px; }
      .scope-controls { flex-wrap: wrap; }
      .control-heading { width: 50px; text-align: left; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>⌨️ Keybinding Customizer</h1>
      <span class="unsaved-indicator" id="unsaved">● Unsaved changes</span>
    </div>
    <div class="header-actions">
      <button class="btn-secondary" id="reset-btn">Reset to Defaults</button>
      <button class="btn-primary" id="save-btn">💾 Save Keybindings</button>
    </div>
  </div>

  <p class="description">
    Customize org-vscode command keybindings. Leave a field blank to use the extension defaults.
    Saving will update your user keybindings file and preserve non-org-vscode keybindings.
  </p>

  <div id="groups">
    ${groupsHtml}
  </div>

  <div class="keyboard-section">
    <h2>Keyboard Shortcuts</h2>
    <p>
      For advanced keybinding editing (conditions, chords, etc.), use VS Code's built-in Keyboard Shortcuts editor.
    </p>
    <button class="btn-link" id="open-keybindings">Open Keyboard Shortcuts (filtered to org-vscode)</button>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      let hasUnsavedChanges = false;

      // Flatten model into a command->row map
      const model = ${JSON.stringify(model)};
      const rows = (model.groups || []).flatMap(g => g.items || []);
      const bindings = {};
      rows.forEach(r => { bindings[r.command] = r.currentKey || ''; });

      function markUnsaved() {
        hasUnsavedChanges = true;
        document.getElementById('unsaved').classList.add('visible');
      }

      function updatePreview(commandId) {
        const preview = document.querySelector('.preview[data-command="' + commandId + '"]');
        if (preview) {
          const val = (bindings[commandId] || '').trim();
          preview.textContent = val || '(default)';
        }
      }

      document.querySelectorAll('.key-text').forEach(input => {
        input.addEventListener('input', function() {
          const cmd = this.dataset.command;
          bindings[cmd] = this.value;
          updatePreview(cmd);
          markUnsaved();
        });
      });

      document.getElementById('save-btn').addEventListener('click', function() {
        try {
          vscode.postMessage({ command: 'saveKeybindings', bindings });
          hasUnsavedChanges = false;
          document.getElementById('unsaved').classList.remove('visible');
        } catch (err) {
          const msg = (err && err.message) ? err.message : String(err);
          vscode.postMessage({ command: 'webviewError', error: msg });
        }
      });

      window.addEventListener('error', function(event) {
        try {
          const msg = event && event.message ? event.message : 'Unknown webview error';
          vscode.postMessage({ command: 'webviewError', error: msg });
        } catch (_) {}
      });

      document.getElementById('reset-btn').addEventListener('click', function() {
        if (confirm('Reset all org-vscode keybindings to defaults?')) {
          vscode.postMessage({ command: 'resetToDefaults' });
        }
      });

      document.getElementById('open-keybindings').addEventListener('click', function() {
        vscode.postMessage({ command: 'openKeyboardShortcuts' });
      });

      window.addEventListener('message', function(event) {
        const message = event.data;
        if (message.command === 'modelUpdated') {
          const updated = message.model;
          const updatedRows = (updated.groups || []).flatMap(g => g.items || []);
          updatedRows.forEach(r => {
            bindings[r.command] = r.currentKey || '';
            const input = document.querySelector('.key-text[data-command="' + r.command + '"]');
            if (input) input.value = bindings[r.command];
            updatePreview(r.command);
          });
          hasUnsavedChanges = false;
          document.getElementById('unsaved').classList.remove('visible');
        }
      });
    })();
  </script>
</body>
</html>`;
}

module.exports = {
  openKeybindingCustomizer
};
