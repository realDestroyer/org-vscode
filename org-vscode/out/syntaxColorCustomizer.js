"use strict";
/**
 * Syntax Color Customizer
 * 
 * Provides a webview UI for users to customize the syntax highlighting
 * colors for org-vscode task states and elements.
 */

const vscode = require("vscode");
const workflowStates = require("./workflowStates");
const { html, escapeText } = require("./htmlUtils");

// Default color definitions matching the extension's configurationDefaults.
// Note: "Body / Notes Text" uses theme default unless the user explicitly saves a value.
const DEFAULT_COLORS = {
  "Body / Notes Text": {
    scope: "source.vso",
    foreground: "#cccccc",
    background: "",
    fontStyle: ""
  },
  "TODO Symbol": {
    scope: "constant.character.todo.vso",
    foreground: "#5CFF5C",
    background: "",
    fontStyle: "bold"
  },
  "TODO Keyword": {
    scope: "keyword.control.todo.vso",
    foreground: "#24FF02",
    background: "",
    fontStyle: "bold"
  },
  "TODO Task Text": {
    scope: "string.task.todo.vso",
    foreground: "#C0FCCC",
    background: "",
    fontStyle: ""
  },
  "IN_PROGRESS Symbol": {
    scope: "constant.character.in_progress.vso",
    foreground: "#0062ff",
    background: "",
    fontStyle: "bold"
  },
  "IN_PROGRESS Keyword": {
    scope: ["keyword.control.in_progress.vso", "support.constant.in_progress.vso"],
    foreground: "#33BFFF",
    background: "",
    fontStyle: "italic"
  },
  "IN_PROGRESS Task Text": {
    scope: "string.task.in_progress.vso",
    foreground: "#C0E9FF",
    background: "",
    fontStyle: ""
  },
  "CONTINUED Symbol": {
    scope: "constant.character.continued.vso",
    foreground: "#AAAAAA",
    background: "",
    fontStyle: "bold"
  },
  "CONTINUED Keyword": {
    scope: ["keyword.control.continued.vso", "markup.quote.continued.vso"],
    foreground: "#888888",
    background: "",
    fontStyle: "italic"
  },
  "CONTINUED Task Text": {
    scope: "string.task.continued.vso",
    foreground: "#CCCCCC",
    background: "",
    fontStyle: ""
  },
  "DONE Symbol": {
    scope: "constant.character.done.vso",
    foreground: "#9AFF8A",
    background: "",
    fontStyle: "bold"
  },
  "DONE Keyword": {
    scope: ["keyword.control.done.vso", "entity.name.function.vso"],
    foreground: "#3AF605",
    background: "",
    fontStyle: "bold"
  },
  "DONE Task Text": {
    scope: "string.task.done.vso",
    foreground: "#B3FFB3",
    background: "",
    fontStyle: ""
  },
  "ABANDONED Symbol": {
    scope: "constant.character.abandoned.vso",
    foreground: "#FF5A5A",
    background: "",
    fontStyle: "bold"
  },
  "ABANDONED Keyword": {
    scope: "keyword.control.abandoned.vso",
    foreground: "#FF3B3B",
    background: "",
    fontStyle: "bold"
  },
  "ABANDONED Task Text": {
    scope: "string.task.abandoned.vso",
    foreground: "#FFC0C0",
    background: "",
    fontStyle: ""
  },
  "SCHEDULED Stamp": {
    scope: "keyword.scheduled.vso",
    foreground: "#d1e800",
    background: "",
    fontStyle: "bold"
  },
  "DEADLINE Stamp": {
    scope: ["keyword.deadline.vso", "markup.deleted.deadline.vso"],
    foreground: "#ff6b35",
    background: "",
    fontStyle: "bold"
  },
  "CLOSED Stamp": {
    scope: "keyword.closed.vso",
    foreground: "#6c757d",
    background: "",
    fontStyle: "italic"
  },
  "Timestamp": {
    scope: "constant.other.timestamp.vso",
    foreground: "#9d9d9d",
    background: "",
    fontStyle: ""
  },
  "Tags": {
    scope: "entity.other.attribute-name.tag.vso",
    foreground: "#C984F7",
    background: "",
    fontStyle: "bold"
  },
  "Agenda Date": {
    scope: "constant.numeric.date.vso",
    foreground: "#F7CA18",
    background: "",
    fontStyle: "italic"
  },
  "Day Header Date": {
    scope: "constant.numeric.date.header.vso",
    foreground: "#F7CA18",
    background: "",
    fontStyle: "bold"
  },
  "Org Directive": {
    scope: "meta.directive.vso",
    foreground: "#569cd6",
    background: "",
    fontStyle: ""
  },
  "Property Drawer": {
    scope: "meta.block.property.vso",
    foreground: "#cccccc",
    background: "",
    fontStyle: ""
  },
  "Property Key": {
    scope: "variable.other.property-key.vso",
    foreground: "#b5cea8",
    background: "",
    fontStyle: ""
  },
  "LOGBOOK Drawer": {
    scope: "meta.drawer.logbook.content.vso",
    foreground: "#9d9d9d",
    background: "",
    fontStyle: ""
  },
  "LOGBOOK Drawer Markers": {
    scope: ["keyword.other.drawer.logbook.vso", "keyword.other.drawer.end.vso"],
    foreground: "#6A9955",
    background: "",
    fontStyle: "bold"
  },
  "Heading Level 1": {
    scope: "markup.heading.vso",
    foreground: "#dcdcaa",
    background: "",
    fontStyle: "bold"
  },
  "Heading Level 2": {
    scope: "keyword.other.vso",
    foreground: "#dcdcaa",
    background: "",
    fontStyle: "bold"
  },
  "Heading Level 3": {
    scope: "keyword.operator.vso",
    foreground: "#dcdcaa",
    background: "",
    fontStyle: "bold"
  },

  "Link": {
    scope: "markup.underline.link.vso",
    foreground: "#4fc1ff",
    background: "",
    fontStyle: "underline"
  },
  "Inline Code / Verbatim": {
    scope: "markup.inline.raw.vso",
    foreground: "#ce9178",
    background: "",
    fontStyle: ""
  },
  "Priority Cookie": {
    scope: "constant.other.priority.vso",
    foreground: "#d7ba7d",
    background: "",
    fontStyle: "bold"
  },
  "Checkbox": {
    scope: "constant.character.checkbox.vso",
    foreground: "#4ec9b0",
    background: "",
    fontStyle: "bold"
  },
  "List Bullet": {
    scope: "punctuation.definition.list.vso",
    foreground: "#d4d4d4",
    background: "",
    fontStyle: ""
  },
  "Ordered List Number": {
    scope: "constant.numeric.list.vso",
    foreground: "#b5cea8",
    background: "",
    fontStyle: ""
  },
  "Table": {
    scope: "meta.table.vso",
    foreground: "#d4d4d4",
    background: "",
    fontStyle: ""
  },
  "Comment": {
    scope: ["comment.line.number-sign.vso", "comment.vso"],
    foreground: "#6a9955",
    background: "",
    fontStyle: "italic"
  },
  "Block Begin": {
    scope: "keyword.control.block.begin.vso",
    foreground: "#569cd6",
    background: "",
    fontStyle: ""
  },
  "Block End": {
    scope: "keyword.control.block.end.vso",
    foreground: "#569cd6",
    background: "",
    fontStyle: ""
  },
  "Source Block": {
    scope: "meta.block.src.vso",
    foreground: "#d4d4d4",
    background: "",
    fontStyle: ""
  },
  "Quote Block": {
    scope: "meta.block.quote.vso",
    foreground: "#d4d4d4",
    background: "",
    fontStyle: ""
  },
  "Example Block": {
    scope: "meta.block.example.vso",
    foreground: "#d4d4d4",
    background: "",
    fontStyle: ""
  },
  "Math (inline)": {
    scope: "string.other.math.inline.vso",
    foreground: "#dcdcaa",
    background: "",
    fontStyle: ""
  },
  "Math (block)": {
    scope: "meta.block.math.vso",
    foreground: "#dcdcaa",
    background: "",
    fontStyle: ""
  },
  "Emphasis Bold": {
    scope: "markup.bold.vso",
    foreground: "#d4d4d4",
    background: "",
    fontStyle: "bold"
  },
  "Emphasis Italic": {
    scope: "markup.italic.vso",
    foreground: "#d4d4d4",
    background: "",
    fontStyle: "italic"
  },
  "Emphasis Underline": {
    scope: "markup.underline.vso",
    foreground: "#d4d4d4",
    background: "",
    fontStyle: "underline"
  },
  "Emphasis Strike": {
    scope: "markup.strike.vso",
    foreground: "#d4d4d4",
    background: "",
    fontStyle: ""
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
    "Property Drawer",
    "Property Key",
    "LOGBOOK Drawer",
    "LOGBOOK Drawer Markers"
  ],
  "Org Syntax": [
    "Link",
    "Inline Code / Verbatim",
    "Priority Cookie",
    "Checkbox",
    "List Bullet",
    "Ordered List Number",
    "Table",
    "Comment",
    "Block Begin",
    "Block End",
    "Source Block",
    "Quote Block",
    "Example Block",
    "Math (inline)",
    "Math (block)",
    "Emphasis Bold",
    "Emphasis Italic",
    "Emphasis Underline",
    "Emphasis Strike"
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
  const currentWorkflowStates = getCurrentWorkflowStates();
  
  customizerPanel.webview.html = getWebviewContent(nonce, currentColors, currentWorkflowStates);

  customizerPanel.webview.onDidReceiveMessage(async (message) => {
    try {
      switch (message.command) {
        case "saveColors":
          await saveColors(message.colors);
          vscode.window.showInformationMessage("Syntax colors saved successfully!");
          break;
        case "saveWorkflowStates":
          await saveWorkflowStates(message.states);
          customizerPanel.webview.postMessage({
            command: "workflowStatesUpdated",
            payload: getCurrentWorkflowStates()
          });
          vscode.window.showInformationMessage("Workflow states saved successfully!");
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
        case "resetWorkflowStatesToDefaults":
          await resetWorkflowStatesToDefaults();
          customizerPanel.webview.postMessage({
            command: "workflowStatesUpdated",
            payload: getCurrentWorkflowStates()
          });
          vscode.window.showInformationMessage("Workflow states reset to defaults!");
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
          if (rule.settings.background !== undefined) {
            colors[name].background = rule.settings.background;
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
 * Gets the current workflow state settings (validated + normalized) from user configuration.
 */
function getCurrentWorkflowStates() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const raw = config.get("workflowStates");
  const result = workflowStates.validateAndNormalizeWorkflowStates(raw);
  return {
    usingDefaults: raw === undefined || raw === null,
    ok: result.ok,
    errors: result.errors,
    states: result.value,
    defaults: workflowStates.getDefaultWorkflowStates()
  };
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
        ...(settings.background ? { background: settings.background } : {}),
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
 * Saves workflow state settings to user configuration.
 */
async function saveWorkflowStates(states) {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const result = workflowStates.validateAndNormalizeWorkflowStates(states);
  if (!result.ok) {
    throw new Error(result.errors.join("; ") || "Invalid workflow states");
  }

  await config.update(
    "workflowStates",
    result.value,
    vscode.ConfigurationTarget.Global
  );
}

/**
 * Resets workflow states by clearing the user setting so defaults apply.
 */
async function resetWorkflowStatesToDefaults() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  await config.update(
    "workflowStates",
    undefined,
    vscode.ConfigurationTarget.Global
  );
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
function getWebviewContent(nonce, currentColors, currentWorkflowStates) {
  function escapeCssAttrValue(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/\"/g, "\\\"");
  }

  let previewCss = "";

  const groupsHtml = Object.entries(SCOPE_GROUPS).map(([groupName, scopeNames]) => {
    const scopesHtml = scopeNames.map(name => {
      const settings = currentColors[name];
      const technicalScope = Array.isArray(settings.scope) ? settings.scope.join(", ") : settings.scope;
      const supportsBackground = /\bKeyword\b/.test(name) || name === "Property Drawer";

      const previewSelector = `.preview[data-scope="${escapeCssAttrValue(name)}"]`;
      const previewRule = [
        `color: ${settings.foreground};`,
        supportsBackground && settings.background ? `background-color: ${settings.background};` : "",
        settings.fontStyle ? `font-style: ${settings.fontStyle.includes('italic') ? 'italic' : 'normal'};` : "",
        settings.fontStyle ? `font-weight: ${settings.fontStyle.includes('bold') ? 'bold' : 'normal'};` : ""
      ].filter(Boolean).join(" ");

      previewCss += `${previewSelector} { ${previewRule} }\n`;

      const isBold = settings.fontStyle && settings.fontStyle.includes('bold');
      const isItalic = settings.fontStyle && settings.fontStyle.includes('italic');

      return html`
        <div class="scope-row" data-scope=${name}>
          <div class="scope-info">
            <span class="scope-name">${name}</span>
            <span class="scope-technical">${technicalScope}</span>
          </div>
          <div class="scope-controls">
            <div class="color-picker-wrapper">
            <span class="control-heading">Foreground</span>
              <input type="color"
                     class="color-picker"
                     data-scope=${name}
                     value=${settings.foreground}
                     title="Pick color" />
              <input type="text"
                     class="color-text"
                     data-scope=${name}
                     value=${settings.foreground}
                     pattern="^#[0-9A-Fa-f]{6}$"
                     title="Hex color code" />
            </div>
            ${supportsBackground ? html`
            <div class="color-picker-wrapper" title="Keyword background">
            <span class="control-heading">Background</span>
              <input type="color"
              class="color-picker bg-color-picker"
                     data-scope=${name}
                     value=${settings.background || '#000000'}
                     title="Pick background" />
              <input type="text"
              class="color-text bg-color-text"
                     data-scope=${name}
                     value=${settings.background || ''}
                     placeholder="(none)"
              pattern="^(#[0-9A-Fa-f]{6})?$"
                     title="Hex background color (leave blank for none)" />
            </div>
            ` : ''}
            <div class="font-style-wrapper">
              <label class="checkbox-label">
                <input type="checkbox"
                       class="font-bold"
                       data-scope=${name}
                       checked=${isBold} />
                <span>Bold</span>
              </label>
              <label class="checkbox-label">
                <input type="checkbox"
                       class="font-italic"
                       data-scope=${name}
                       checked=${isItalic} />
                <span>Italic</span>
              </label>
            </div>
            <div class="preview" data-scope=${name}>
              ${getPreviewText(name)}
            </div>
          </div>
        </div>
      `;
    }).join("");

    const groupHeader = html`<h3 class="group-header">${groupName}</h3>`;
    return `
      <div class="scope-group">
        ${groupHeader}
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
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background, var(--vscode-editor-background));
      --bg-tertiary: var(--vscode-input-background);
      --text-primary: var(--vscode-editor-foreground);
      --text-secondary: var(--vscode-descriptionForeground);
      --accent: var(--vscode-button-background);
      --accent-hover: var(--vscode-button-hoverBackground);
      --border: var(--vscode-panel-border, var(--vscode-widget-border));
      --success: var(--vscode-terminal-ansiGreen);
      --warning: var(--vscode-editorWarning-foreground);
    }

    ${previewCss}

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

    .control-heading {
      width: 78px;
      text-align: right;
      font-size: 12px;
      color: var(--text-secondary);
      user-select: none;
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

    .tabs {
      display: flex;
      gap: 8px;
      margin: 16px 0 20px;
      border-bottom: 1px solid var(--border);
    }

    .tab-button {
      border: none;
      background: transparent;
      color: var(--text-secondary);
      padding: 10px 12px;
      border-bottom: 2px solid transparent;
      cursor: pointer;
      font-weight: 600;
    }

    .tab-button.active {
      color: var(--text-primary);
      border-bottom-color: var(--accent);
    }

    .tab-content {
      display: none;
    }

    .tab-content.active {
      display: block;
    }

    .panel {
      background: var(--bg-secondary);
      border-radius: 8px;
      border: 1px solid var(--border);
      padding: 16px;
    }

    .banner {
      display: none;
      background: rgba(255, 166, 0, 0.12);
      border: 1px solid var(--warning);
      color: var(--text-primary);
      padding: 10px 12px;
      border-radius: 6px;
      margin-bottom: 12px;
      font-size: 13px;
    }

    .banner.visible {
      display: block;
    }

    .workflow-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 12px;
      align-items: center;
    }

    .workflow-meta {
      color: var(--text-secondary);
      font-size: 12px;
    }

    table.workflow {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    table.workflow th,
    table.workflow td {
      border-bottom: 1px solid var(--border);
      padding: 8px;
      vertical-align: middle;
      text-align: left;
    }

    table.workflow th {
      color: var(--text-secondary);
      font-weight: 600;
      background: var(--bg-tertiary);
      position: sticky;
      top: 0;
      z-index: 1;
    }

    .workflow input[type="text"],
    .workflow select {
      width: 100%;
      padding: 6px 8px;
      border: 1px solid var(--border);
      border-radius: 4px;
      background: var(--bg-tertiary);
      color: var(--text-primary);
      font-family: 'Consolas', 'Courier New', monospace;
      font-size: 12px;
    }

    .workflow .cell-small {
      width: 90px;
    }

    .workflow .cell-medium {
      width: 140px;
    }

    .workflow .cell-actions {
      width: 170px;
      white-space: nowrap;
    }

    .mini-btn {
      padding: 6px 10px;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: var(--bg-tertiary);
      color: var(--text-primary);
      cursor: pointer;
      font-size: 12px;
      margin-right: 6px;
    }

    .mini-btn:hover {
      background: var(--border);
    }

    .danger {
      border-color: rgba(255,0,0,0.35);
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
    <div class="header-actions" id="actions-colors">
      <button class="btn-secondary" id="reset-btn">Reset Colors</button>
      <button class="btn-primary" id="save-btn">💾 Save Colors</button>
    </div>
    <div class="header-actions" id="actions-workflow" style="display:none;">
      <button class="btn-secondary" id="reset-workflow-btn">Reset Workflow</button>
      <button class="btn-primary" id="save-workflow-btn">💾 Save Workflow</button>
    </div>
  </div>

  <div class="tabs" role="tablist" aria-label="Customizer Tabs">
    <button class="tab-button active" data-tab="colors" role="tab" aria-selected="true">Syntax Colors</button>
    <button class="tab-button" data-tab="workflow" role="tab" aria-selected="false">Workflow States</button>
  </div>

  <div class="tab-content active" id="tab-colors" role="tabpanel">
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
  </div>

  <div class="tab-content" id="tab-workflow" role="tabpanel">
    <p class="description">
      Edit your Org workflow states (TODO keywords) in a friendly table. This updates the 
      <strong>Org-vscode.workflowStates</strong> setting.
    </p>

    <div class="panel">
      <div class="banner" id="workflow-banner"></div>
      <div class="workflow-actions">
        <button class="mini-btn" id="add-workflow-row">+ Add State</button>
        <span class="workflow-meta" id="workflow-meta"></span>
      </div>

      <div style="overflow:auto; max-height: 55vh;">
        <table class="workflow" aria-label="Workflow States">
          <thead>
            <tr>
              <th class="cell-medium">Keyword</th>
              <th class="cell-small">Marker</th>
              <th class="cell-small">Done-like</th>
              <th class="cell-small">Stamps CLOSED</th>
              <th class="cell-small">Triggers Forward</th>
              <th class="cell-small">Agenda</th>
              <th class="cell-small">Tagged Agenda</th>
              <th class="cell-actions">Actions</th>
            </tr>
          </thead>
          <tbody id="workflow-tbody"></tbody>
        </table>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    (function() {
      const vscode = acquireVsCodeApi();
      let hasUnsavedChanges = false;
      let hasUnsavedWorkflowChanges = false;
      let activeTab = 'colors';
      
      // Store current colors state
      const colors = ${JSON.stringify(currentColors)};

      // Store current workflow states payload
      let workflowPayload = ${JSON.stringify(currentWorkflowStates)};

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

        const picker = document.querySelector('.color-picker:not(.bg-color-picker)[data-scope="' + BODY_NOTES_KEY + '"]');
        const textInput = document.querySelector('.color-text:not(.bg-color-text)[data-scope="' + BODY_NOTES_KEY + '"]');
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
        updateUnsavedIndicator();
      }

      function markWorkflowUnsaved() {
        hasUnsavedWorkflowChanges = true;
        updateUnsavedIndicator();
      }

      function updateUnsavedIndicator() {
        const el = document.getElementById('unsaved');
        const shouldShow = (activeTab === 'colors' && hasUnsavedChanges) || (activeTab === 'workflow' && hasUnsavedWorkflowChanges);
        if (shouldShow) {
          el.classList.add('visible');
        } else {
          el.classList.remove('visible');
        }
      }

      function setActiveTab(tab) {
        activeTab = tab;
        document.querySelectorAll('.tab-button').forEach(btn => {
          const isActive = btn.getAttribute('data-tab') === tab;
          btn.classList.toggle('active', isActive);
          btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        const colorsPanel = document.getElementById('tab-colors');
        const workflowPanel = document.getElementById('tab-workflow');
        if (colorsPanel) colorsPanel.classList.toggle('active', tab === 'colors');
        if (workflowPanel) workflowPanel.classList.toggle('active', tab === 'workflow');

        const actionsColors = document.getElementById('actions-colors');
        const actionsWorkflow = document.getElementById('actions-workflow');
        if (actionsColors) actionsColors.style.display = tab === 'colors' ? 'flex' : 'none';
        if (actionsWorkflow) actionsWorkflow.style.display = tab === 'workflow' ? 'flex' : 'none';

        updateUnsavedIndicator();
      }

      document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
          const tab = btn.getAttribute('data-tab');
          setActiveTab(tab);
        });
      });

      // Update preview for a specific scope
      function updatePreview(scopeName) {
        const settings = colors[scopeName];
        const preview = document.querySelector('.preview[data-scope="' + scopeName + '"]');
        if (preview) {
          let style = 'color: ' + settings.foreground + ';';
          if (/\\bKeyword\\b/.test(scopeName) && settings.background) {
            style += ' background-color: ' + settings.background + ';';
          }
          if (settings.fontStyle) {
            if (settings.fontStyle.includes('italic')) style += ' font-style: italic;';
            if (settings.fontStyle.includes('bold')) style += ' font-weight: bold;';
          } else {
            style += ' font-style: normal; font-weight: normal;';
          }
          preview.setAttribute('style', style);
        }
      }

      function setWorkflowBanner(text, visible) {
        const banner = document.getElementById('workflow-banner');
        if (!banner) return;
        banner.textContent = text || '';
        banner.classList.toggle('visible', !!visible);
      }

      function updateWorkflowMeta() {
        const meta = document.getElementById('workflow-meta');
        if (!meta) return;
        const suffix = workflowPayload.usingDefaults ? 'Using defaults (no user override set)' : 'Using custom workflowStates setting';
        const validity = workflowPayload.ok ? '' : ' — invalid config detected, showing defaults';
        meta.textContent = suffix + validity;
      }

      function createCheckbox(checked) {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = !!checked;
        input.addEventListener('change', () => {
          markWorkflowUnsaved();
        });
        return input;
      }

      function createSelect(value) {
        const sel = document.createElement('select');
        const optShow = document.createElement('option');
        optShow.value = 'show';
        optShow.textContent = 'show';
        const optHide = document.createElement('option');
        optHide.value = 'hide';
        optHide.textContent = 'hide';
        sel.appendChild(optShow);
        sel.appendChild(optHide);
        sel.value = value === 'hide' ? 'hide' : 'show';
        sel.addEventListener('change', () => {
          markWorkflowUnsaved();
        });
        return sel;
      }

      function createTextInput(value, { placeholder = '', upper = false } = {}) {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.placeholder = placeholder;
        input.addEventListener('input', () => {
          markWorkflowUnsaved();
        });
        input.addEventListener('blur', () => {
          if (upper) {
            input.value = String(input.value || '').trim().toUpperCase();
          } else {
            input.value = String(input.value || '').trim();
          }
        });
        return input;
      }

      function renderWorkflowTable() {
        const tbody = document.getElementById('workflow-tbody');
        if (!tbody) return;
        tbody.replaceChildren();

        updateWorkflowMeta();

        if (!workflowPayload.ok && Array.isArray(workflowPayload.errors) && workflowPayload.errors.length > 0) {
          setWorkflowBanner('Your workflowStates setting has errors; defaults are being used: ' + workflowPayload.errors.join(' | '), true);
        } else {
          setWorkflowBanner('', false);
        }

        const states = Array.isArray(workflowPayload.states) ? workflowPayload.states : [];

        states.forEach((state, idx) => {
          const tr = document.createElement('tr');

          const tdKeyword = document.createElement('td');
          const keywordInput = createTextInput(state.keyword, { placeholder: 'TODO', upper: true });
          keywordInput.classList.add('wf-keyword');
          tdKeyword.appendChild(keywordInput);

          const tdMarker = document.createElement('td');
          const markerInput = createTextInput(state.marker || '', { placeholder: '(none)' });
          markerInput.classList.add('wf-marker');
          tdMarker.appendChild(markerInput);

          const tdDone = document.createElement('td');
          const doneInput = createCheckbox(!!state.isDoneLike);
          doneInput.classList.add('wf-isDoneLike');
          tdDone.appendChild(doneInput);

          const tdClosed = document.createElement('td');
          const closedInput = createCheckbox(!!state.stampsClosed);
          closedInput.classList.add('wf-stampsClosed');
          tdClosed.appendChild(closedInput);

          const tdForward = document.createElement('td');
          const forwardInput = createCheckbox(!!state.triggersForward);
          forwardInput.classList.add('wf-triggersForward');
          tdForward.appendChild(forwardInput);

          const tdAgenda = document.createElement('td');
          const agendaSel = createSelect(state.agendaVisibility);
          agendaSel.classList.add('wf-agendaVisibility');
          tdAgenda.appendChild(agendaSel);

          const tdTagged = document.createElement('td');
          const taggedSel = createSelect(state.taggedAgendaVisibility);
          taggedSel.classList.add('wf-taggedAgendaVisibility');
          tdTagged.appendChild(taggedSel);

          const tdActions = document.createElement('td');
          tdActions.classList.add('cell-actions');

          const upBtn = document.createElement('button');
          upBtn.className = 'mini-btn';
          upBtn.textContent = '↑';
          upBtn.title = 'Move up';
          upBtn.disabled = idx === 0;
          upBtn.addEventListener('click', () => {
            const s = workflowPayload.states.slice();
            const tmp = s[idx - 1];
            s[idx - 1] = s[idx];
            s[idx] = tmp;
            workflowPayload.states = s;
            markWorkflowUnsaved();
            renderWorkflowTable();
          });

          const downBtn = document.createElement('button');
          downBtn.className = 'mini-btn';
          downBtn.textContent = '↓';
          downBtn.title = 'Move down';
          downBtn.disabled = idx === states.length - 1;
          downBtn.addEventListener('click', () => {
            const s = workflowPayload.states.slice();
            const tmp = s[idx + 1];
            s[idx + 1] = s[idx];
            s[idx] = tmp;
            workflowPayload.states = s;
            markWorkflowUnsaved();
            renderWorkflowTable();
          });

          const delBtn = document.createElement('button');
          delBtn.className = 'mini-btn danger';
          delBtn.textContent = 'Delete';
          delBtn.title = 'Delete state';
          delBtn.addEventListener('click', () => {
            const s = workflowPayload.states.slice();
            s.splice(idx, 1);
            workflowPayload.states = s;
            markWorkflowUnsaved();
            renderWorkflowTable();
          });

          tdActions.appendChild(upBtn);
          tdActions.appendChild(downBtn);
          tdActions.appendChild(delBtn);

          tr.appendChild(tdKeyword);
          tr.appendChild(tdMarker);
          tr.appendChild(tdDone);
          tr.appendChild(tdClosed);
          tr.appendChild(tdForward);
          tr.appendChild(tdAgenda);
          tr.appendChild(tdTagged);
          tr.appendChild(tdActions);

          tbody.appendChild(tr);
        });

        if (states.length === 0) {
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = 8;
          td.textContent = 'No workflow states configured.';
          td.style.color = 'var(--text-secondary)';
          td.style.padding = '12px 8px';
          tr.appendChild(td);
          tbody.appendChild(tr);
        }
      }

      function collectWorkflowStatesFromTable() {
        const rows = Array.from(document.querySelectorAll('#workflow-tbody tr'));
        const states = [];
        for (const row of rows) {
          const keywordEl = row.querySelector('.wf-keyword');
          if (!keywordEl) continue;
          const keyword = String(keywordEl.value || '').trim();
          const marker = String(row.querySelector('.wf-marker')?.value || '').trim();
          states.push({
            keyword,
            marker: marker,
            isDoneLike: !!row.querySelector('.wf-isDoneLike')?.checked,
            stampsClosed: !!row.querySelector('.wf-stampsClosed')?.checked,
            triggersForward: !!row.querySelector('.wf-triggersForward')?.checked,
            agendaVisibility: row.querySelector('.wf-agendaVisibility')?.value || 'show',
            taggedAgendaVisibility: row.querySelector('.wf-taggedAgendaVisibility')?.value || 'show'
          });
        }
        return states;
      }

      // Initial render
      renderWorkflowTable();
      setActiveTab('colors');

      // Background picker handlers (keyword entries only)
      document.querySelectorAll('.bg-color-picker').forEach(picker => {
        picker.addEventListener('input', function() {
          const scope = this.dataset.scope;
          const color = this.value;
          if (!colors[scope]) return;
          colors[scope].background = color;

          const textInput = document.querySelector('.bg-color-text[data-scope="' + scope + '"]');
          if (textInput) textInput.value = color;

          updatePreview(scope);
          markUnsaved();
        });
      });

      document.querySelectorAll('.bg-color-text').forEach(input => {
        input.addEventListener('input', function() {
          const scope = this.dataset.scope;
          if (!colors[scope]) return;
          let color = this.value.trim();

          if (!color) {
            colors[scope].background = '';
            updatePreview(scope);
            markUnsaved();
            return;
          }

          if (color && !color.startsWith('#')) {
            color = '#' + color;
          }

          if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
            colors[scope].background = color;

            const picker = document.querySelector('.bg-color-picker[data-scope="' + scope + '"]');
            if (picker) picker.value = color;

            updatePreview(scope);
            markUnsaved();
          }
        });
      });

      // Color picker change handler
      document.querySelectorAll('.color-picker:not(.bg-color-picker)').forEach(picker => {
        picker.addEventListener('input', function() {
          const scope = this.dataset.scope;
          const color = this.value;
          colors[scope].foreground = color;
          
          // Sync text input
          const textInput = document.querySelector('.color-text:not(.bg-color-text)[data-scope="' + scope + '"]');
          if (textInput) textInput.value = color;
          
          updatePreview(scope);
          markUnsaved();
        });
      });

      // Color text input change handler
      document.querySelectorAll('.color-text:not(.bg-color-text)').forEach(input => {
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
            const picker = document.querySelector('.color-picker:not(.bg-color-picker)[data-scope="' + scope + '"]');
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
          updateUnsavedIndicator();
        } catch (err) {
          const msg = (err && err.message) ? err.message : String(err);
          vscode.postMessage({ command: 'webviewError', error: msg });
        }
      });

      // Workflow: add row
      const addWorkflowBtn = document.getElementById('add-workflow-row');
      if (addWorkflowBtn) {
        addWorkflowBtn.addEventListener('click', function() {
          const current = Array.isArray(workflowPayload.states) ? workflowPayload.states.slice() : [];
          current.push({
            keyword: '',
            marker: '',
            isDoneLike: false,
            stampsClosed: false,
            triggersForward: false,
            agendaVisibility: 'show',
            taggedAgendaVisibility: 'show'
          });
          workflowPayload.states = current;
          markWorkflowUnsaved();
          renderWorkflowTable();
        });
      }

      // Workflow: save
      const saveWorkflowBtn = document.getElementById('save-workflow-btn');
      if (saveWorkflowBtn) {
        saveWorkflowBtn.addEventListener('click', function() {
          try {
            const states = collectWorkflowStatesFromTable();
            vscode.postMessage({ command: 'saveWorkflowStates', states });
            hasUnsavedWorkflowChanges = false;
            updateUnsavedIndicator();
          } catch (err) {
            const msg = (err && err.message) ? err.message : String(err);
            vscode.postMessage({ command: 'webviewError', error: msg });
          }
        });
      }

      // Workflow: reset
      const resetWorkflowBtn = document.getElementById('reset-workflow-btn');
      if (resetWorkflowBtn) {
        resetWorkflowBtn.addEventListener('click', function() {
          if (confirm('Reset workflow states to defaults? This clears your Org-vscode.workflowStates setting.')) {
            vscode.postMessage({ command: 'resetWorkflowStatesToDefaults' });
          }
        });
      }

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
            
            const picker = document.querySelector('.color-picker:not(.bg-color-picker)[data-scope="' + name + '"]');
            const textInput = document.querySelector('.color-text:not(.bg-color-text)[data-scope="' + name + '"]');
            const bgPicker = document.querySelector('.bg-color-picker[data-scope="' + name + '"]');
            const bgTextInput = document.querySelector('.bg-color-text[data-scope="' + name + '"]');
            const boldBox = document.querySelector('.font-bold[data-scope="' + name + '"]');
            const italicBox = document.querySelector('.font-italic[data-scope="' + name + '"]');
            
            if (picker) picker.value = settings.foreground;
            if (textInput) textInput.value = settings.foreground;
            if (bgPicker) bgPicker.value = settings.background || '#000000';
            if (bgTextInput) bgTextInput.value = settings.background || '';
            if (boldBox) boldBox.checked = settings.fontStyle && settings.fontStyle.includes('bold');
            if (italicBox) italicBox.checked = settings.fontStyle && settings.fontStyle.includes('italic');
            
            updatePreview(name);
          });

          if (themeForeground && !isBodyNotesUserCustomized()) {
            syncBodyNotesControls(themeForeground);
          }
          
          hasUnsavedChanges = false;
          updateUnsavedIndicator();
        }

        if (message.command === 'workflowStatesUpdated') {
          workflowPayload = message.payload;
          hasUnsavedWorkflowChanges = false;
          renderWorkflowTable();
          updateUnsavedIndicator();
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
    "SCHEDULED Stamp": "SCHEDULED: <12-11-2025>",
    "DEADLINE Stamp": "DEADLINE: <12-15-2025>",
    "CLOSED Stamp": "CLOSED: [12-11-2025 09:00]",
    "Timestamp": "<2025-12-11 Thu 09:00>",
    "Tags": ":WORK:PROJECT:",
    "Agenda Date": "[12-11-2025]",
    "Day Header Date": "[12-11-2025 Thu]",
    "Org Directive": "#+TITLE: Work",
    "Property Drawer": ":PROPERTIES: ... :END:",
    "Property Key": ":OWNER: Doug",
    "LOGBOOK Drawer": "- State \"DONE\" from \"TODO\" [2026-01-17 Sat 19:09]",
    "LOGBOOK Drawer Markers": ":LOGBOOK: ... :END:",
    "Heading Level 1": "* Heading",
    "Heading Level 2": "** Subheading",
    "Heading Level 3": "*** Detail",
    "Link": "[[https://example.com][Example link]]",
    "Inline Code / Verbatim": "=inline code=",
    "Priority Cookie": "[#A]",
    "Checkbox": "[X]",
    "List Bullet": "-",
    "Ordered List Number": "1.",
    "Table": "| a | b |",
    "Comment": "# comment",
    "Block Begin": "#+BEGIN_SRC js",
    "Block End": "#+END_SRC",
    "Source Block": "console.log('hi')",
    "Quote Block": "quoted text",
    "Example Block": "example text",
    "Math (inline)": "$a^2 + b^2 = c^2$",
    "Math (block)": "$$\\int_0^1 x^2 dx$$",
    "Emphasis Bold": "*bold*",
    "Emphasis Italic": "/italic/",
    "Emphasis Underline": "_underline_",
    "Emphasis Strike": "+strike+"
  };
  return previews[scopeName] || scopeName;
}

module.exports = {
  openSyntaxColorCustomizer
};
