"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
const vscode = require("vscode");
const agenda_1 = require("./agenda/agenda");
const scheduling_1 = require("./scheduling");
const keywordRight_1 = require("./keywordRight");
const keywordLeft_1 = require("./keywordLeft");
const calendar_1 = require("./calendar");
const moveUp_1 = require("./moveUp");
const moveDown_1 = require("./moveDown");
const incrementHeadings_1 = require("./incrementHeadings");
const decrementHeadings_1 = require("./decrementHeadings");
const changeDirectory_1 = require("./changeDirectory");
const newFile_1 = require("./newFile");
const tags_1 = require("./tags");
const titles_1 = require("./titles");
const updateDate_1 = require("./updateDate");
const GO_MODE = { language: "vso", scheme: "file" };
class GoOnTypingFormatter {
    provideOnTypeFormattingEdits(_document, position, _ch, _options, _token) {
        return new Promise((resolve) => {
            const { activeTextEditor } = vscode.window;
            if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
                const { document } = activeTextEditor;
                let currentLine = document.lineAt(position);
                if (!/[⊙⊘⊖]/.test(currentLine.text) && currentLine.text.includes("*")) {
                    let numOfAsterisk = (currentLine.text.match(/\*/g) || []).length;
                    resolve([vscode.TextEdit.insert(position, " ".repeat(numOfAsterisk) + setUnicodeChar(numOfAsterisk))]);
                }
            }
        });
    }
}
function setUnicodeChar(asterisks) {
    let characters = ["⊖ ", "⊙ ", "⊘ "];
    for (let i = 0; i < asterisks; i++) {
        characters.push(characters.shift());
    }
    return characters[0];
}
function activate(ctx) {
    vscode.commands.registerCommand("extension.viewAgenda", agenda_1.viewAgenda);
    vscode.commands.registerCommand("extension.scheduling", scheduling_1.scheduleTask);
    vscode.commands.registerCommand("extension.toggleStatusRight", keywordRight_1.toggleKeywordRight);
    vscode.commands.registerCommand("extension.toggleStatusLeft", keywordLeft_1.toggleKeywordLeft);
    vscode.commands.registerCommand("extension.openCalendarView", calendar_1.openCalendarView);
    vscode.commands.registerCommand("extension.moveBlockUp", moveUp_1.moveBlockUp);
    vscode.commands.registerCommand("extension.moveBlockDown", moveDown_1.moveBlockDown);
    vscode.commands.registerCommand("extension.increment", incrementHeadings_1.incrementHeading);
    vscode.commands.registerCommand("extension.decrement", decrementHeadings_1.decrementHeading);
    vscode.commands.registerCommand("extension.setFolderPath", changeDirectory_1.changeDirectory);
    vscode.commands.registerCommand("extension.createVsoFile", newFile_1.createVsoFile);
    vscode.commands.registerCommand("extension.getTags", tags_1.getTags);
    vscode.commands.registerCommand("extension.getTitles", titles_1.getTitles);
    vscode.commands.registerCommand("extension.updateDates", updateDate_1.updateDates);
    vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("Org-vscode.dateFormat")) {
            vscode.commands.executeCommand("extension.updateDates");
        }
    });
    ctx.subscriptions.push(vscode.languages.registerOnTypeFormattingEditProvider(GO_MODE, new GoOnTypingFormatter(), " "));
}
//# sourceMappingURL=extension.js.map