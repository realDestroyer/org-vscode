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
const moveUp = require("./moveUp");
const moveDown = require("./moveDown");
const getTags = require("./tags");
const titles = require("./titles");
const increment = require("./incrementHeadings");
const decrement = require("./decrementHeadings");
const scheduling = require("./scheduling");
const agenda = require("./agenda/agenda");
const { moveDateForward, moveDateBackward } = require("./rescheduleTask");
const { alignSchedules } = require("./alignSchedules");
const { insertDateStamp } = require("./insertDateStamp");
const { incrementDateForward } = require("./incrementDate");
const { decrementDateBackward } = require("./decrementDate");
const addTagToTask = require("./addTag");
const taggedAgenda = require("./taggedAgenda");
const addSeparator = require("./addSeparator");
const insertTable = require("./insertTable");
const updateDates = require("./updateDate");
const { openCalendarView } = require("./calendar");
const exportCurrentTasks = require("./exportCurrentTasks");

// Startup log for debugging
console.log("📌 agenda.js has been loaded in extension.js");

// ─────────────────────────────────────────────────────────────
// Inline Formatter for Org Headings
// ─────────────────────────────────────────────────────────────
const GO_MODE = { language: "vso", scheme: "file" };

// Auto-add ⊙/⊘/⊖ based on asterisk heading level when user types space
class GoOnTypingFormatter {
  provideOnTypeFormattingEdits(document, position, ch, options, token) {
    return new Promise((resolve, reject) => {
      const { activeTextEditor } = vscode.window;
      if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
        const { document } = activeTextEditor;
        let currentLine = document.lineAt(position);
        if (
          currentLine.text.indexOf("⊙") === -1 &&
          currentLine.text.indexOf("⊘") === -1 &&
          currentLine.text.indexOf("⊖") === -1
        ) {
          if (currentLine.text.indexOf("*") > -1) {
            let numOfAsterisk = currentLine.text.split("*").length - 1;
            for (var i = 0; i < currentLine.text.length; i++) {
              resolve(
                textEdit(
                  setUnicodeChar(numOfAsterisk),
                  position,
                  document,
                  numOfSpaces(numOfAsterisk)
                )
              );
            }
          }
        }
      }
    });
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
  // Auto-refresh when date format setting is changed
  vscode.workspace.onDidChangeConfiguration((event) => {
    let settingChanged = event.affectsConfiguration("Org-vscode.dateFormat");
    if (settingChanged) {
      vscode.commands.executeCommand("extension.updateDates");
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
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.updateDates", updateDates));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.rescheduleTaskForward", moveDateForward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.rescheduleTaskBackward", moveDateBackward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.alignSchedules", alignSchedules));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.insertDateStamp", insertDateStamp));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.incrementDate", incrementDateForward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.decrementDate", decrementDateBackward));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.addSeparator", addSeparator));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.exportCurrentTasks", exportCurrentTasks));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.addTagToTask", addTagToTask));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.setFolderPath", changeDirectory));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.createVsoFile", newFile));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.getTags", getTags));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.getTitles", titles));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.toggleStatusRight", keywordRight));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.toggleStatusLeft", keywordLeft));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.scheduling", scheduling));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.moveBlockUp", moveUp));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.moveBlockDown", moveDown));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.increment", increment));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.decrement", decrement));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.viewTaggedAgenda", taggedAgenda));
  ctx.subscriptions.push(vscode.commands.registerCommand("extension.openCalendarView", openCalendarView));

  // Register real-time formatter for " " after typing an asterisk heading
  ctx.subscriptions.push(
    vscode.languages.registerOnTypeFormattingEditProvider(GO_MODE, new GoOnTypingFormatter(), " ")
  );
}

module.exports = {
  activate
};
