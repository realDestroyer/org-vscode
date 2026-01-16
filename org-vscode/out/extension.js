"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;

// ─────────────────────────────────────────────────────────────
// Module Imports
// ─────────────────────────────────────────────────────────────
const vscode = require("vscode");
const { WindowMessage } = require("./showMessage");
const fs = require("fs");
const path = require("path");
const moment = require("moment");

// Local extension modules
const newFile = require("./newFile");
const changeDirectory = require("./changeDirectory");
const keywordRight = require("./keywordRight");
const keywordLeft = require("./keywordLeft");
const setTodoState = require("./setTodoState");
const moveUp = require("./moveUp");
const moveDown = require("./moveDown");
const getTags = require("./tags");
const titles = require("./titles");
const increment = require("./incrementHeadings");
const decrement = require("./decrementHeadings");
const scheduling = require("./scheduling");
const deadline = require("./deadline");
const agenda = require("./agenda/agenda");
const { moveDateForward, moveDateBackward } = require("./rescheduleTask");
const { smartDateForward, smartDateBackward } = require("./smartDateAdjust");
const { deadlineDateForward, deadlineDateBackward } = require("./deadlineDateAdjust");
const { alignSchedules } = require("./alignSchedules");
const { insertDateStamp } = require("./insertDateStamp");
const { incrementDateForward } = require("./incrementDate");
const { decrementDateBackward } = require("./decrementDate");
const addTagToTask = require("./addTag");
const addFileTag = require("./addFileTag");
const taggedAgenda = require("./taggedAgenda");
const addSeparator = require("./addSeparator");
const insertTable = require("./insertTable");
const updateDates = require("./updateDate");
const { convertDatesInActiveFile } = require("./convertDates");
const { openCalendarView } = require("./calendar");
const exportCurrentTasks = require("./exportCurrentTasks");
const { exportYearSummary } = require("./yearSummary");
const { generateExecutiveReport } = require("./yearExecutiveReport");
const { openYearInReview } = require("./yearDashboard");
const { openSyntaxColorCustomizer } = require("./syntaxColorCustomizer");
const { openKeybindingCustomizer } = require("./keybindingCustomizer");
const { registerUnicodeHeadingDecorations } = require("./unicodeHeadingDecorations");
const { registerTodoLineDecorations } = require("./todoLineDecorations");
const { registerCheckboxAutoDone } = require("./checkboxAutoDone");
const { registerCheckboxStatsDecorations } = require("./checkboxStatsDecorations");
const { registerMarkupCommands } = require("./markupCommands");
const { registerOrgEmphasisDecorations } = require("./orgEmphasisDecorations");
const { registerMathDecorations } = require("./mathDecorations");
const { registerOrgLinkProvider } = require("./orgLinkProvider");
const { registerOrgSymbolProvider } = require("./orgSymbolProvider");
const { registerOrgCompletionProvider } = require("./orgCompletionProvider");
const { registerOrgPreview } = require("./orgPreview");
const { migrateFileToV2 } = require("./migrateFileToV2");
const { insertCheckboxItem } = require("./insertCheckboxItem");
const { toggleCheckboxCookie } = require("./toggleCheckboxCookie");
const { toggleCheckboxItemAtCursor } = require("./toggleCheckboxItem");
const { insertNewElement } = require("./smartInsertNewElement");
const { registerPropertyCommands } = require("./propertyCommands");
const { computeDesiredIndentForNewLine } = require("./indentUtils");
const setRepeater = require("./setRepeater");

// Startup log for debugging
console.log("📌 agenda.js has been loaded in extension.js");

// ─────────────────────────────────────────────────────────────
// Inline Formatter for Org Headings
// ─────────────────────────────────────────────────────────────
const GO_MODE = { language: "vso", scheme: "file" };

// Auto-add ⊙/⊘/⊖ based on asterisk heading level when user types space
class GoOnTypingFormatter {
  provideOnTypeFormattingEdits(document, position, ch, options, token) {
    // Only respond to space key in vso docs
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "vso" || (ch !== " " && ch !== "\n")) {
      return [];
    }

    const config = vscode.workspace.getConfiguration("Org-vscode");
    const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
    const autoIndentNonHeaderText = config.get("autoIndentNonHeaderText", false);
    const bodyIndentationRaw = config.get("bodyIndentation", 2);
    const bodyIndentation = Math.max(0, Math.floor(Number(bodyIndentationRaw) || 0));
    const bodyIndent = " ".repeat(bodyIndentation);

    // Auto-indent non-heading lines when pressing Enter, if enabled.
    if (ch === "\n") {
      if (!autoIndentNonHeaderText) return [];

      const line = document.lineAt(position.line);
      const existingIndent = (line.text.match(/^\s*/)?.[0] || "");
      const desiredIndent = computeDesiredIndentForNewLine(
        (idx) => document.lineAt(idx).text,
        position.line,
        { bodyIndent }
      );

      // Only adjust indentation if the current line is empty/whitespace.
      if (line.text.trim().length !== 0) return [];
      if (desiredIndent === existingIndent) return [];

      const start = new vscode.Position(position.line, 0);
      const end = new vscode.Position(position.line, existingIndent.length);
      return [vscode.TextEdit.replace(new vscode.Range(start, end), desiredIndent)];
    }

    // Space-triggered unicode heading conversion
    if (headingMarkerStyle !== "unicode") return [];

    const line = document.lineAt(position.line).text;
    // Guard: don't re-insert if the line already begins with a status symbol
    if (/^[\s]*[⊙⊘⊖⊜⊗]/.test(line)) {
      return [];
    }

    // Only trigger when typing a space immediately after leading asterisks at line start
    const prefix = line.slice(0, position.character);
    const starMatch = prefix.match(/^\s*(\*+)\s$/);
    if (!starMatch) {
      return [];
    }

    const asterisks = starMatch[1].length;
    const spacesPerLevelRaw = config.get("adjustHeadingIndentation", 2);
    const spacesPerLevel = typeof spacesPerLevelRaw === "boolean"
      ? (spacesPerLevelRaw ? 2 : 0)
      : Math.max(0, Math.floor(Number(spacesPerLevelRaw) || 0));
    const padCount = Math.max(0, asterisks - 1) * spacesPerLevel;
    const insertText = " ".repeat(padCount) + setUnicodeChar(asterisks);

    // Replace from start-of-line through the just-typed space (removes the asterisks)
    const start = new vscode.Position(position.line, 0);
    const range = new vscode.Range(start, position);
    return [vscode.TextEdit.replace(range, insertText)];
  }
}

// Picks a unicode symbol based on asterisk level
function setUnicodeChar(asterisks) {
  let characters = ["⊖ ", "⊙ ", "⊘ "];
  for (let i = 0; i < asterisks; i++) {
    characters.push(characters.shift());
  }
  return characters[0];
}

// Returns a compound text edit to delete line + insert formatted line
function textEdit(char, position, document, spaces) {
  // Deprecated by non-destructive formatter above; keep for backward compatibility if needed
  const getRange = document.lineAt(position).range;
  let removeText = vscode.TextEdit.delete(getRange);
  let insertText = vscode.TextEdit.insert(position, spaces + char);
  return [removeText, insertText];
}

// Returns the number of spaces to pad based on heading level
function numOfSpaces(asterisk) {
  let spacesArray = [];
  for (let i = 1; i < asterisk; i++) {
    spacesArray.push(" ");
  }
  return spacesArray.join("");
}

// ─────────────────────────────────────────────────────────────
// Extension Activation
// ─────────────────────────────────────────────────────────────
function activate(ctx) {
  // Org-like navigation primitives
  registerOrgLinkProvider(ctx);
  registerOrgSymbolProvider(ctx);
  registerOrgCompletionProvider(ctx);

  // Visual-only unicode headings for org-style '*' files (no file rewrites)
  registerUnicodeHeadingDecorations(ctx);

  // Whole-line task state highlighting (uses the user's token color customizations for background colors)
  registerTodoLineDecorations(ctx);

  // Automatically mark tasks DONE when all checkboxes are checked
  registerCheckboxAutoDone(ctx);

  // Visual checkbox stats like [2/3] without rewriting file content
  registerCheckboxStatsDecorations(ctx);

  // Simple org emphasis helpers: wrap/toggle * / _ around selections
  registerMarkupCommands(ctx);

  // Emacs-style emphasis rendering (bold/italic/underline) + hide markers when not editing them
  registerOrgEmphasisDecorations(ctx);

  // Render common LaTeX commands inside math as Unicode glyphs (decorations only)
  registerMathDecorations(ctx);

  // Live preview webview (MVP) + editor -> preview scroll sync
  registerOrgPreview(ctx);

  // Emacs-like property drawer commands (set/get/delete)
  registerPropertyCommands(ctx);

  // Date format changes are not auto-applied to existing files because swapping
  // MM-DD and DD-MM can be ambiguous (e.g. 04-05-2026). Provide an explicit command instead.
  vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("Org-vscode.dateFormat")) {
      vscode.window.showInformationMessage(
        "Org-vscode dateFormat changed. Run 'Org-vscode: Convert Dates in Current File' to rewrite existing dates."
      );
    }
  });

  // Register all commands
  const showMessageCommand = vscode.commands.registerCommand("extension.showMessageTest", () => {
    let msg = new WindowMessage(
      "information",
      "Welcome to Org Mode for VSCode!",
      true,
      true,
      "realDestroyer's GitHub Repository",
      "https://github.com/realDestroyer/org-vscode"
    );
    msg.showMessage();
  });

  ctx.subscriptions.push(showMessageCommand);
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.viewAgenda", agenda));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.migrateFileToV2", migrateFileToV2));
  // Back-compat: keep existing command id, but steer users to the explicit converter.
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.updateDates", convertDatesInActiveFile));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.convertDatesInActiveFile", convertDatesInActiveFile));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.rescheduleTaskForward", moveDateForward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.rescheduleTaskBackward", moveDateBackward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.smartDateForward", smartDateForward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.smartDateBackward", smartDateBackward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.deadlineDateForward", deadlineDateForward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.deadlineDateBackward", deadlineDateBackward));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.setRepeater", setRepeater));
  // Back-compat-style id for keybindings if needed.
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.setRepeater", setRepeater));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.alignSchedules", alignSchedules));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.insertDateStamp", insertDateStamp));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.incrementDate", incrementDateForward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.decrementDate", decrementDateBackward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.addSeparator", addSeparator));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.exportCurrentTasks", exportCurrentTasks));
  // Keep legacy keybinding command, but also register the contributed command id.
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.exportCurrentTasks", exportCurrentTasks));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.addTagToTask", addTagToTask));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.addFileTag", addFileTag));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.setFolderPath", changeDirectory));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.createVsoFile", newFile));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.getTags", getTags));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.getTitles", titles));
  ctx.subscriptions.push(vscode.commands.registerCommand("orgMode.exportYearSummary", exportYearSummary));
  ctx.subscriptions.push(vscode.commands.registerCommand("orgMode.generateExecutiveReport", generateExecutiveReport));
  ctx.subscriptions.push(vscode.commands.registerCommand("orgMode.openYearInReview", openYearInReview));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.toggleStatusRight", keywordRight));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.toggleStatusLeft", keywordLeft));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.setTodoState", setTodoState));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.scheduling", scheduling));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.deadline", deadline));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.moveBlockUp", moveUp));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.moveBlockDown", moveDown));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.increment", increment));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.decrement", decrement));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.viewTaggedAgenda", taggedAgenda));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.openCalendarView", openCalendarView));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.openSyntaxColorCustomizer", openSyntaxColorCustomizer));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.openKeybindingCustomizer", openKeybindingCustomizer));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.insertCheckboxItem", insertCheckboxItem));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.toggleCheckboxCookie", toggleCheckboxCookie));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.toggleCheckboxItem", toggleCheckboxItemAtCursor));
  ctx.subscriptions.push(vscode.commands.registerCommand("org-vscode.insertNewElement", insertNewElement));

  // org-vscode.insertTable is registered inside insertTable.activate()
  insertTable.activate(ctx);

  // Register real-time formatter for " " after typing an asterisk heading
  ctx.subscriptions.push(
    vscode.languages.registerOnTypeFormattingEditProvider(GO_MODE, new GoOnTypingFormatter(), " ", "\n")
  );
}

module.exports = {
  activate
};
