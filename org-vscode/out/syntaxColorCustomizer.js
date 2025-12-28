"use strict";
/**
 * Syntax Color Customizer
 * 
 * Provides a webview UI for users to customize the syntax highlighting
 * colors for org-vscode task states and elements.
 */

const vscode = require("vscode");

// Default color definitions matching the extension's configurationDefaults.
// Note: "Body / Notes Text" uses theme default unless the user explicitly saves a value.
const DEFAULT_COLORS = {
  "Body / Notes Text": {
    scope: "source.vso",
    foreground: "#cccccc",
    fontStyle: ""
  },
  "TODO Symbol": {
    scope: "constant.character.todo.vso",
    foreground: "#5CFF5C",
    fontStyle: "bold"
  },
  "TODO Keyword": {
    scope: "keyword.control.todo.vso",
    foreground: "#24FF02",
    fontStyle: "bold"
  },
  "TODO Task Text": {
    scope: "string.task.todo.vso",
    foreground: "#C0FCCC",
    fontStyle: ""
  },
  "IN_PROGRESS Symbol": {
    scope: "constant.character.in_progress.vso",
    foreground: "#0062ff",
    fontStyle: "bold"
  },
  "IN_PROGRESS Keyword": {
    scope: ["keyword.control.in_progress.vso", "support.constant.in_progress.vso"],
    foreground: "#33BFFF",
    fontStyle: "italic"
  },
  "IN_PROGRESS Task Text": {
    scope: "string.task.in_progress.vso",
    foreground: "#C0E9FF",
    fontStyle: ""
  },
  "CONTINUED Symbol": {
    scope: "constant.character.continued.vso",
    foreground: "#AAAAAA",
    fontStyle: "bold"
  },
  "CONTINUED Keyword": {
    scope: ["keyword.control.continued.vso", "markup.quote.continued.vso"],
    foreground: "#888888",
    fontStyle: "italic"
  },
  "CONTINUED Task Text": {
    scope: "string.task.continued.vso",
    foreground: "#CCCCCC",
    fontStyle: ""
  },
  "DONE Symbol": {
    scope: "constant.character.done.vso",
    foreground: "#9AFF8A",
    fontStyle: "bold"
  },
  "DONE Keyword": {
    scope: ["keyword.control.done.vso", "entity.name.function.vso"],
    foreground: "#3AF605",
    fontStyle: "bold"
  },
  "DONE Task Text": {
    scope: "string.task.done.vso",
    foreground: "#B3FFB3",
    fontStyle: ""
  },
  "ABANDONED Symbol": {
    scope: "constant.character.abandoned.vso",
    foreground: "#FF5A5A",
    fontStyle: "bold"
  },
  "ABANDONED Keyword": {
    scope: "keyword.control.abandoned.vso",
    foreground: "#FF3B3B",
    fontStyle: "bold"
  },
  "ABANDONED Task Text": {
    scope: "string.task.abandoned.vso",
    foreground: "#FFC0C0",
    fontStyle: ""
  },
  "SCHEDULED Stamp": {
    scope: "keyword.scheduled.vso",
    foreground: "#d1e800",
    fontStyle: "bold"
  },
  "DEADLINE Stamp": {
    scope: ["keyword.deadline.vso", "markup.deleted.deadline.vso"],
    foreground: "#ff6b35",
    fontStyle: "bold"
  },
  "CLOSED Stamp": {
    scope: "keyword.closed.vso",
    foreground: "#6c757d",
    fontStyle: "italic"
  },
  "Timestamp": {
    scope: "constant.other.timestamp.vso",
    foreground: "#9d9d9d",
    fontStyle: ""
  },
  "Tags": {
    scope: "entity.other.attribute-name.tag.vso",
    foreground: "#C984F7",
    fontStyle: "bold"
  },
  "Agenda Date": {
    scope: "constant.numeric.date.vso",
    foreground: "#F7CA18",
    fontStyle: "italic"
  },
  "Day Header Date": {
    scope: "constant.numeric.date.header.vso",
    foreground: "#F7CA18",
    fontStyle: "bold"
  },
  "Org Directive": {
    scope: "meta.directive.vso",
    foreground: "#569cd6",
    fontStyle: ""
  },
  "Property Key": {
    scope: "variable.other.property-key.vso",
    foreground: "#b5cea8",
    fontStyle: ""
  },
  "Heading Level 1": {
    scope: "markup.heading.vso",
    foreground: "#dcdcaa",
    fontStyle: "bold"
  },
  "Heading Level 2": {
    scope: "keyword.other.vso",
    foreground: "#dcdcaa",
    fontStyle: "bold"
  },
  "Heading Level 3": {
    scope: "keyword.operator.vso",
    foreground: "#dcdcaa",
    fontStyle: "bold"
  }
};

// Group definitions for better UI organization
const SCOPE_GROUPS = {
  "General": ["Body / Notes Text"],
  "TODO Tasks": ["TODO Symbol", "TODO Keyword", "TODO Task Text"],
  "IN_PROGRESS Tasks": ["IN_PROGRESS Symbol", "IN_PROGRESS Keyword", "IN_PROGRESS Task Text"],
  "CONTINUED Tasks": ["CONTINUED Symbol", "CONTINUED Keyword", "CONTINUED Task Text"],
  "DONE Tasks": ["DONE Symbol", "DONE Keyword", "DONE Task Text"],
  "ABANDONED Tasks": ["ABANDONED Symbol", "ABANDONED Keyword", "ABANDONED Task Text"],
  "Dates & Stamps": [
    "SCHEDULED Stamp",
    "DEADLINE Stamp",
    "CLOSED Stamp",
    "Timestamp",
    "Agenda Date",
    "Day Header Date",
    "Tags"
  ],
  "Structure": [
    "Heading Level 1",
    "Heading Level 2",
    "Heading Level 3",
    "Org Directive",
    "Property Key"
  ]
};

let customizerPanel = null;

/**
 * Opens the Syntax Color Customizer webview panel
 */
function openSyntaxColorCustomizer() {
  if (customizerPanel) {
    customizerPanel.reveal(vscode.ViewColumn.One);
    return;
  }

  customizerPanel = vscode.window.createWebviewPanel(
    "syntaxColorCustomizer",
    "Syntax Color Customizer",
    vscode.ViewColumn.One,
    {
      enableScripts: true,
      retainContextWhenHidden: true
    }
  );

  const nonce = getNonce();
  
  // Load current user settings
  const currentColors = getCurrentColors();
  
  customizerPanel.webview.html = getWebviewContent(nonce, currentColors);

  customizerPanel.webview.onDidReceiveMessage(async (message) => {
    try {
      switch (message.command) {
        case "saveColors":
          await saveColors(message.colors);
          vscode.window.showInformationMessage("Syntax colors saved successfully!");
          break;
        case "resetToDefaults":
          await resetToDefaults();
          // Send updated colors back to webview
          customizerPanel.webview.postMessage({
            command: "colorsUpdated",
            colors: DEFAULT_COLORS
          });
          vscode.window.showInformationMessage("Colors reset to defaults!");
          break;
        case "openKeyboardShortcuts":
          vscode.commands.executeCommand("workbench.action.openGlobalKeybindings", "org-vscode");
          break;
        case "webviewError":
          vscode.window.showErrorMessage(`Syntax Color Customizer error: ${message?.error || "Unknown error"}`);
          break;
      }
    } catch (err) {
      const msg = err && err.message ? err.message : String(err);
      vscode.window.showErrorMessage(`Syntax Color Customizer failed: ${msg}`);
    }
  });

  customizerPanel.onDidDispose(() => {
    customizerPanel = null;
  });
}

/**
 * Gets the current color settings from user configuration
 */
function getCurrentColors() {
  const config = vscode.workspace.getConfiguration("editor");
  const tokenColors = config.get("tokenColorCustomizations") || {};
  const textMateRules = tokenColors.textMateRules || [];

  // Start with defaults, overlay user customizations
  const colors = JSON.parse(JSON.stringify(DEFAULT_COLORS));

  const normalizeScopes = (value) => {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  };

  for (const rule of textMateRules) {
    const ruleScopes = normalizeScopes(rule.scope);
    // Find which default this rule matches
    for (const [name, def] of Object.entries(colors)) {
      const defScopes = normalizeScopes(def.scope);
      const matches = defScopes.some(s => ruleScopes.includes(s));
      if (matches) {
        colors[name]._isUserCustomized = true;
        if (rule.settings) {
          if (rule.settings.foreground) {
            colors[name].foreground = rule.settings.foreground;
          }
          if (rule.settings.fontStyle !== undefined) {
            colors[name].fontStyle = rule.settings.fontStyle;
          }
        }
        break;
      }
    }
  }

  return colors;
}

/**
 * Saves color settings to user configuration
 */
async function saveColors(colors) {
  const config = vscode.workspace.getConfiguration("editor");

  if (!colors || typeof colors !== "object") {
    throw new Error("No color payload received from webview");
  }
  
  // Build textMateRules array
  const textMateRules = Object.entries(colors)
    .filter(([_, settings]) => settings && settings.scope)
    .map(([name, settings]) => ({
      name: name,
      scope: settings.scope,
      settings: {
        foreground: settings.foreground,
        ...(settings.fontStyle ? { fontStyle: settings.fontStyle } : {})
      }
    }));

  if (textMateRules.length === 0) {
    throw new Error("No valid TextMate rules generated (unexpected)");
  }

  // Get existing tokenColorCustomizations and preserve non-vso rules
  const existing = config.get("tokenColorCustomizations") || {};
  const existingRules = existing.textMateRules || [];
  
  // Filter out vso-related rules (we'll replace them)
  const otherRules = existingRules.filter(rule => {
    const scope = Array.isArray(rule.scope) ? rule.scope.join(" ") : (rule.scope || "");
    return !scope.includes(".vso");
  });

  // Merge: keep other rules, add our new vso rules
  const mergedRules = [...otherRules, ...textMateRules];

  await config.update(
    "tokenColorCustomizations",
    { ...existing, textMateRules: mergedRules },
    vscode.ConfigurationTarget.Global
  );
}

/**
 * Resets colors to extension defaults
 */
async function resetToDefaults() {
  const config = vscode.workspace.getConfiguration("editor");
  const existing = config.get("tokenColorCustomizations") || {};
  const existingRules = existing.textMateRules || [];
  
  // Remove all vso-related rules
  const otherRules = existingRules.filter(rule => {
    const scope = Array.isArray(rule.scope) ? rule.scope.join(" ") : (rule.scope || "");
    return !scope.includes(".vso");
  });

  if (otherRules.length > 0) {
    await config.update(
      "tokenColorCustomizations",
      { ...existing, textMateRules: otherRules },
      vscode.ConfigurationTarget.Global
    );
  } else {
    // If no other rules remain, clean up the entire object
    const { textMateRules, ...rest } = existing;
    if (Object.keys(rest).length > 0) {
      await config.update("tokenColorCustomizations", rest, vscode.ConfigurationTarget.Global);
    } else {
      await config.update("tokenColorCustomizations", undefined, vscode.ConfigurationTarget.Global);
    }
  }
}

/**
 * Generates a nonce for CSP
 */
function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Generates the webview HTML content
 */
function getWebviewContent(nonce, currentColors) {
  const groupsHtml = Object.entries(SCOPE_GROUPS).map(([groupName, scopeNames]) => {
    const scopesHtml = scopeNames.map(name => {
      const settings = currentColors[name];
      const technicalScope = Array.isArray(settings.scope) ? settings.scope.join(", ") : settings.scope;
      const previewStyle = `color: ${settings.foreground}; ${settings.fontStyle ? `font-style: ${settings.fontStyle.includes('italic') ? 'italic' : 'normal'}; font-weight: ${settings.fontStyle.includes('bold') ? 'bold' : 'normal'};` : ''}`;
      
      return `
        <div class="scope-row" data-scope="${name}">
          <div class="scope-info">
            <span class="scope-name">${name}</span>
            <span class="scope-technical">${technicalScope}</span>
          </div>
          <div class="scope-controls">
            <div class="color-picker-wrapper">
              <input type="color" 
                     class="color-picker" 
                     data-scope="${name}" 
                     value="${settings.foreground}"
                     title="Pick color">
              <input type="text" 
                     class="color-text" 
                     data-scope="${name}" 
                     value="${settings.foreground}"
                     pattern="^#[0-9A-Fa-f]{6}$"
                     title="Hex color code">
            </div>
            <div class="font-style-wrapper">
              <label class="checkbox-label">
                <input type="checkbox" 
                       class="font-bold" 
                       data-scope="${name}"
                       ${settings.fontStyle && settings.fontStyle.includes('bold') ? 'checked' : ''}>
                <span>Bold</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox" 
                       class="font-italic" 
                       data-scope="${name}"
                       ${settings.fontStyle && settings.fontStyle.includes('italic') ? 'checked' : ''}>
                <span>Italic</span>
              </label>
            </div>
            <div class="preview" style="${previewStyle}" data-scope="${name}">
              ${getPreviewText(name)}
            </div>
          </div>
        </div>
      `;
    }).join("");

    return `
      <div class="scope-group">
        <h3 class="group-header">${groupName}</h3>
        ${scopesHtml}
      </div>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Syntax Color Customizer</title>
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

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

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

    .header-actions {
      display: flex;
      gap: 12px;
    }

    button {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .btn-primary {
      background: var(--accent);
      color: white;
    }

    .btn-primary:hover {
      background: var(--accent-hover);
    }

    .btn-secondary {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
    }

    .btn-secondary:hover {
      background: var(--border);
    }

    .btn-link {
      background: transparent;
      color: var(--accent-hover);
      text-decoration: underline;
      padding: 8px 0;
    }

    .btn-link:hover {
      color: var(--success);
    }

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

    .scope-row:last-child {
      border-bottom: none;
    }

    .scope-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 200px;
    }

    .scope-name {
      font-weight: 500;
      color: var(--text-primary);
    }

    .scope-technical {
      font-size: 11px;
      color: var(--text-secondary);
      font-family: 'Consolas', 'Courier New', monospace;
    }

    .scope-controls {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .color-picker-wrapper {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .color-picker {
      width: 36px;
      height: 36px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      padding: 0;
      background: transparent;
    }

    .color-picker::-webkit-color-swatch-wrapper {
      padding: 2px;
    }

    .color-picker::-webkit-color-swatch {
      border-radius: 4px;
      border: 1px solid var(--border);
    }

    .color-text {
      width: 80px;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
    }

    .color-text:focus {
      outline: none;
      border-color: var(--accent);
    }

    .font-style-wrapper {
      display: flex;
      gap: 12px;
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 12px;
      color: var(--text-secondary);
    }

    .checkbox-label input[type="checkbox"] {
      cursor: pointer;
      width: 14px;
      height: 14px;
    }

    .preview {
      min-width: 180px;
      padding: 8px 12px;
      background: var(--bg-primary);
      border-radius: 4px;
      font-family: 'Consolas', 'Fira Code', 'Courier New', monospace;
      font-size: 13px;
      text-align: center;
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

    .unsaved-indicator.visible {
      display: inline;
    }

    @media (max-width: 900px) {
      .scope-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }

      .scope-controls {
        flex-wrap: wrap;
      }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>🎨 Syntax Color Customizer</h1>
      <span class="unsaved-indicator" id="unsaved">● Unsaved changes</span>
    </div>
    <div class="header-actions">
      <button class="btn-secondary" id="reset-btn">Reset to Defaults</button>
      <button class="btn-primary" id="save-btn">💾 Save Colors</button>
    </div>
  </div>

  <p class="description">
    Customize the syntax highlighting colors for your org-vscode files. Changes will be saved to your 
    VS Code user settings. Pick colors using the color picker or enter hex codes directly. 
    Toggle bold and italic styles as desired.
  </p>

  <div id="scope-groups">
    ${groupsHtml}
  </div>

  <div class="keyboard-section">
    <h2>⌨️ Keyboard Shortcuts</h2>
    <p>
      To customize keyboard shortcuts for org-vscode commands, use VS Code's built-in Keyboard Shortcuts editor.
    </p>
    <button class="btn-link" id="open-keybindings">Open Keyboard Shortcuts (filtered to org-vscode)</button>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      let hasUnsavedChanges = false;
      
      // Store current colors state
      const colors = ${JSON.stringify(currentColors)};

      const BODY_NOTES_KEY = 'Body / Notes Text';

      function normalizeHex(hex) {
        if (!hex) return '';
        return String(hex).trim().toLowerCase();
      }

      function rgbToHex(rgb) {
        const nums = String(rgb).match(/[0-9]+/g);
        if (!nums || nums.length < 3) return null;
        const toHex = (n) => {
          const h = Number(n).toString(16);
          return h.length === 1 ? '0' + h : h;
        };
        return '#' + toHex(nums[0]) + toHex(nums[1]) + toHex(nums[2]);
      }

      function getThemeForegroundHex() {
        const raw = getComputedStyle(document.documentElement).getPropertyValue('--vscode-editor-foreground').trim();
        if (!raw) return null;
        if (raw.startsWith('#')) return raw;
        const asHex = rgbToHex(raw);
        return asHex;
      }

      function syncBodyNotesControls(foreground) {
        if (!colors[BODY_NOTES_KEY]) return;
        colors[BODY_NOTES_KEY].foreground = foreground;

        const picker = document.querySelector('.color-picker[data-scope="' + BODY_NOTES_KEY + '"]');
        const textInput = document.querySelector('.color-text[data-scope="' + BODY_NOTES_KEY + '"]');
        if (picker) picker.value = foreground;
        if (textInput) textInput.value = foreground;

        updatePreview(BODY_NOTES_KEY);
      }

      function isBodyNotesUserCustomized() {
        return !!(colors[BODY_NOTES_KEY] && colors[BODY_NOTES_KEY]._isUserCustomized);
      }

      // Initialize body/notes default to the current theme foreground unless the user already customized it.
      const themeForeground = getThemeForegroundHex();
      if (themeForeground && !isBodyNotesUserCustomized()) {
        syncBodyNotesControls(themeForeground);
      }
      
      // Mark as having unsaved changes
      function markUnsaved() {
        hasUnsavedChanges = true;
        document.getElementById('unsaved').classList.add('visible');
      }

      // Update preview for a specific scope
      function updatePreview(scopeName) {
        const settings = colors[scopeName];
        const preview = document.querySelector('.preview[data-scope="' + scopeName + '"]');
        if (preview) {
          let style = 'color: ' + settings.foreground + ';';
          if (settings.fontStyle) {
            if (settings.fontStyle.includes('italic')) style += ' font-style: italic;';
            if (settings.fontStyle.includes('bold')) style += ' font-weight: bold;';
          } else {
            style += ' font-style: normal; font-weight: normal;';
          }
          preview.setAttribute('style', style);
        }
      }

      // Color picker change handler
      document.querySelectorAll('.color-picker').forEach(picker => {
        picker.addEventListener('input', function() {
          const scope = this.dataset.scope;
          const color = this.value;
          colors[scope].foreground = color;
          
          // Sync text input
          const textInput = document.querySelector('.color-text[data-scope="' + scope + '"]');
          if (textInput) textInput.value = color;
          
          updatePreview(scope);
          markUnsaved();
        });
      });

      // Color text input change handler
      document.querySelectorAll('.color-text').forEach(input => {
        input.addEventListener('input', function() {
          const scope = this.dataset.scope;
          let color = this.value.trim();
          
          // Auto-add # if missing
          if (color && !color.startsWith('#')) {
            color = '#' + color;
          }
          
          // Validate hex color
          if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
            colors[scope].foreground = color;
            
            // Sync color picker
            const picker = document.querySelector('.color-picker[data-scope="' + scope + '"]');
            if (picker) picker.value = color;
            
            updatePreview(scope);
            markUnsaved();
          }
        });
      });

      // Bold checkbox handler
      document.querySelectorAll('.font-bold').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
          const scope = this.dataset.scope;
          const italic = document.querySelector('.font-italic[data-scope="' + scope + '"]');
          const isItalic = italic && italic.checked;
          
          let fontStyle = '';
          if (this.checked && isItalic) fontStyle = 'bold italic';
          else if (this.checked) fontStyle = 'bold';
          else if (isItalic) fontStyle = 'italic';
          
          colors[scope].fontStyle = fontStyle;
          updatePreview(scope);
          markUnsaved();
        });
      });

      // Italic checkbox handler
      document.querySelectorAll('.font-italic').forEach(checkbox => {
        checkbox.addEventListener('change', function() {
          const scope = this.dataset.scope;
          const bold = document.querySelector('.font-bold[data-scope="' + scope + '"]');
          const isBold = bold && bold.checked;
          
          let fontStyle = '';
          if (isBold && this.checked) fontStyle = 'bold italic';
          else if (isBold) fontStyle = 'bold';
          else if (this.checked) fontStyle = 'italic';
          
          colors[scope].fontStyle = fontStyle;
          updatePreview(scope);
          markUnsaved();
        });
      });

      // Save button
      document.getElementById('save-btn').addEventListener('click', function() {
        try {
          const colorsToSave = JSON.parse(JSON.stringify(colors));

          // Avoid freezing base text color unless the user explicitly changed it.
          if (colorsToSave[BODY_NOTES_KEY] && themeForeground && !isBodyNotesUserCustomized()) {
            const current = normalizeHex(colorsToSave[BODY_NOTES_KEY].foreground);
            const baseline = normalizeHex(themeForeground);
            const style = (colorsToSave[BODY_NOTES_KEY].fontStyle || '').trim();
            if (current === baseline && style === '') {
              delete colorsToSave[BODY_NOTES_KEY];
            }
          }

          vscode.postMessage({ command: 'saveColors', colors: colorsToSave });
          hasUnsavedChanges = false;
          document.getElementById('unsaved').classList.remove('visible');
        } catch (err) {
          const msg = (err && err.message) ? err.message : String(err);
          vscode.postMessage({ command: 'webviewError', error: msg });
        }
      });

      // Surface any unexpected runtime errors back to the extension.
      window.addEventListener('error', function(event) {
        try {
          const msg = event && event.message ? event.message : 'Unknown webview error';
          vscode.postMessage({ command: 'webviewError', error: msg });
        } catch (_) {
          // ignore
        }
      });

      // Reset button
      document.getElementById('reset-btn').addEventListener('click', function() {
        if (confirm('Reset all colors to defaults? This will overwrite your current settings.')) {
          vscode.postMessage({ command: 'resetToDefaults' });
        }
      });

      // Open keyboard shortcuts
      document.getElementById('open-keybindings').addEventListener('click', function() {
        vscode.postMessage({ command: 'openKeyboardShortcuts' });
      });

      // Handle messages from extension
      window.addEventListener('message', function(event) {
        const message = event.data;
        if (message.command === 'colorsUpdated') {
          // Update all controls with new colors
          Object.entries(message.colors).forEach(([name, settings]) => {
            colors[name] = settings;
            
            const picker = document.querySelector('.color-picker[data-scope="' + name + '"]');
            const textInput = document.querySelector('.color-text[data-scope="' + name + '"]');
            const boldBox = document.querySelector('.font-bold[data-scope="' + name + '"]');
            const italicBox = document.querySelector('.font-italic[data-scope="' + name + '"]');
            
            if (picker) picker.value = settings.foreground;
            if (textInput) textInput.value = settings.foreground;
            if (boldBox) boldBox.checked = settings.fontStyle && settings.fontStyle.includes('bold');
            if (italicBox) italicBox.checked = settings.fontStyle && settings.fontStyle.includes('italic');
            
            updatePreview(name);
          });

          if (themeForeground && !isBodyNotesUserCustomized()) {
            syncBodyNotesControls(themeForeground);
          }
          
          hasUnsavedChanges = false;
          document.getElementById('unsaved').classList.remove('visible');
        }
      });
    })();
  </script>
</body>
</html>`;
}

/**
 * Gets appropriate preview text for each scope type
 */
function getPreviewText(scopeName) {
  const previews = {
    "Body / Notes Text": "Notes / description text",
    "TODO Symbol": "⊙",
    "TODO Keyword": "TODO",
    "TODO Task Text": "Buy groceries",
    "IN_PROGRESS Symbol": "⊘",
    "IN_PROGRESS Keyword": "IN_PROGRESS",
    "IN_PROGRESS Task Text": "Working on it",
    "CONTINUED Symbol": "⊜",
    "CONTINUED Keyword": "CONTINUED",
    "CONTINUED Task Text": "From yesterday",
    "DONE Symbol": "⊖",
    "DONE Keyword": "DONE",
    "DONE Task Text": "Completed task",
    "ABANDONED Symbol": "⊗",
    "ABANDONED Keyword": "ABANDONED",
    "ABANDONED Task Text": "No longer needed",
    "SCHEDULED Stamp": "SCHEDULED: [12-11-2025]",
    "DEADLINE Stamp": "DEADLINE: [12-15-2025]",
    "CLOSED Stamp": "CLOSED: [12-11-2025 09:00]",
    "Timestamp": "<2025-12-11 Thu 09:00>",
    "Tags": ":WORK:PROJECT:",
    "Agenda Date": "[12-11-2025]",
    "Day Header Date": "[12-11-2025 Thu]",
    "Org Directive": "#+TITLE: Work",
    "Property Key": ":OWNER: Doug",
    "Heading Level 1": "* Heading",
    "Heading Level 2": "** Subheading",
    "Heading Level 3": "*** Detail"
  };
  return previews[scopeName] || scopeName;
}

module.exports = {
  openSyntaxColorCustomizer
};
