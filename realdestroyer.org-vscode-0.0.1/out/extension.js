"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const moment = require("moment");

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

console.log("📌 agenda.js has been loaded in extension.js");

const GO_MODE = { language: "vso", scheme: "file" };
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
/**
 * Get the number of asterisks that are on the line and return
 * the corrisponding unicode character
 *
 * @param asterisks Get the number of asterisks
 *
 * @returns {array} the first item in the characters array
 */
function setUnicodeChar(asterisks) {
  let characters = ["⊖ ", "⊙ ", "⊘ "];
  for (let i = 0; i < asterisks; i++) {
    characters.push(characters.shift());
  }
  return characters[0];
}

function textEdit(char, position, document, spaces) {
  const getRange = document.lineAt(position).range;
  let removeText = vscode.TextEdit.delete(getRange);
  let insertText = vscode.TextEdit.insert(position, spaces + char);
  return [removeText, insertText];
}
// number of spaces to add function
function numOfSpaces(asterisk) {
  let spacesArray = [];
  for (let i = 1; i < asterisk; i++) {
    spacesArray.push(" ");
  }
  return spacesArray.join("");
}

function activate(ctx) {
  vscode.commands.registerCommand("extension.viewAgenda", agenda);
  vscode.commands.registerCommand("extension.updateDates", updateDates);

  vscode.workspace.onDidChangeConfiguration((event) => {
    let settingChanged = event.affectsConfiguration("Org-vscode.dateFormat");
    if (settingChanged) {
      vscode.commands.executeCommand("extension.updateDates");
    }
  });

  let forwardCommand = vscode.commands.registerCommand("extension.rescheduleTaskForward", moveDateForward);
  let backwardCommand = vscode.commands.registerCommand("extension.rescheduleTaskBackward", moveDateBackward);
  ctx.subscriptions.push(forwardCommand);
  ctx.subscriptions.push(backwardCommand);

  let alignCommand = vscode.commands.registerCommand("extension.alignSchedules", alignSchedules);
  ctx.subscriptions.push(alignCommand);

  let dateStampCommand = vscode.commands.registerCommand("extension.insertDateStamp", insertDateStamp);
  ctx.subscriptions.push(dateStampCommand);

  let incrementCommand = vscode.commands.registerCommand("extension.incrementDate", incrementDateForward);
  ctx.subscriptions.push(incrementCommand);

  let decrementCommand = vscode.commands.registerCommand("extension.decrementDate", decrementDateBackward);
  ctx.subscriptions.push(decrementCommand);

  let addSeparatorCommand = vscode.commands.registerCommand("extension.addSeparator", addSeparator);
  ctx.subscriptions.push(addSeparatorCommand);

  insertTable.activate(ctx);

  
  vscode.commands.registerCommand("extension.exportCurrentTasks", exportCurrentTasks);
  vscode.commands.registerCommand("extension.addTagToTask", addTagToTask);
  vscode.commands.registerCommand("extension.setFolderPath", changeDirectory);
  vscode.commands.registerCommand("extension.createVsoFile", newFile);
  vscode.commands.registerCommand("extension.getTags", getTags);
  vscode.commands.registerCommand("extension.getTitles", titles);
  vscode.commands.registerCommand("extension.toggleStatusRight", keywordRight);
  vscode.commands.registerCommand("extension.toggleStatusLeft", keywordLeft);
  vscode.commands.registerCommand("extension.scheduling", scheduling);
  vscode.commands.registerCommand("extension.moveBlockUp", moveUp);
  vscode.commands.registerCommand("extension.moveBlockDown", moveDown);
  vscode.commands.registerCommand("extension.increment", increment);
  vscode.commands.registerCommand("extension.decrement", decrement);
  vscode.commands.registerCommand("extension.viewTaggedAgenda", taggedAgenda);
  vscode.commands.registerCommand("extension.openCalendarView", openCalendarView);

  ctx.subscriptions.push(
    vscode.languages.registerOnTypeFormattingEditProvider(GO_MODE, new GoOnTypingFormatter(), " ")
  );
}

module.exports = {
  activate
};
