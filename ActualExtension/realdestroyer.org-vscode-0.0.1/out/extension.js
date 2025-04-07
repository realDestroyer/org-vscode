"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
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
const agenda = require("./agenda/agenda"); // Your agenda module
const { moveDateForward, moveDateBackward } = require("./rescheduleTask");
const { alignSchedules } = require("./alignSchedules");
const { insertDateStamp } = require("./insertDateStamp");
const { incrementDateForward } = require("./incrementDate");
const { decrementDateBackward } = require("./decrementDate");
const addTagToTask = require("./addTag");
const taggedAgenda = require("./taggedAgenda");
const addSeparator = require('./addSeparator');
const insertTable = require('./insertTable');

console.log("📌 agenda.js has been loaded in extension.js");

const updateDates = require("./updateDate");
const fs = require("fs");
const path = require("path");
const moment = require("moment");


const GO_MODE = { language: "vso", scheme: "file" };
class GoOnTypingFormatter {
    provideOnTypeFormattingEdits(document, position, ch, options, token) {
        return new Promise((resolve, reject) => {
            const { activeTextEditor } = vscode.window;
            if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
                const { document } = activeTextEditor;
                let currentLine = document.lineAt(position);
                if (currentLine.text.indexOf("⊙") === -1 && currentLine.text.indexOf("⊘") === -1 && currentLine.text.indexOf("⊖") === -1) {
                    console.log(currentLine.text.indexOf("⊙"));
                    if (currentLine.text.indexOf("*") > -1) {
                        let numOfAsterisk = currentLine.text.split("*").length - 1;
                        for (var i = 0; i < currentLine.text.length; i++) {
                            // TODO clean this up
                            resolve(textEdit(setUnicodeChar(numOfAsterisk), position, document, numOfSpaces(numOfAsterisk)));
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

function refreshCalendarView() {
    if (calendarPanel) {
        sendTasksToCalendar(calendarPanel);
    }
}

// This function will send the tasks to the calendar
function sendTasksToCalendar(panel) {
    let tasks = [];
    let dirPath = setMainDir();

    fs.readdir(dirPath, (err, files) => {
        if (err) {
            vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
            return;
        }

        files.forEach(file => {
            if (file.endsWith(".org")) {
                let filePath = path.join(dirPath, file);
                let content = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);

                content.forEach(line => {
                    let match = line.match(/\bSCHEDULED:\s*\[(\d{2}-\d{2}-\d{4})\]/);
                    if (match) {
                        tasks.push({
                            text: line.replace(/SCHEDULED:.*/, "").trim(),
                            date: moment(match[1], "MM-DD-YYYY").format("YYYY-MM-DD"),
                            file: file
                        });
                    }
                });
            }
        });

        if (panel) {
            panel.webview.postMessage({ tasks });
        }
    });
}


// text edit function
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

function setMainDir() {
    const config = vscode.workspace.getConfiguration("Org-vscode");
    const folderPath = config.get("folderPath");
    return folderPath && folderPath.trim() !== "" ? folderPath : path.join(require("os").homedir(), "OrgFiles");
}

let calendarPanel = null; // Store active calendar panel

function openCalendarView() {
    if (calendarPanel) {
        calendarPanel.reveal(vscode.ViewColumn.Beside);
        return;
    }

    calendarPanel = vscode.window.createWebviewPanel(
        "calendarView",
        "Calendar View",
        vscode.ViewColumn.Beside,
        { enableScripts: true }
    );

    calendarPanel.webview.html = getCalendarWebviewContent();

    calendarPanel.onDidDispose(() => {
        calendarPanel = null;
    });

    calendarPanel.webview.onDidReceiveMessage(message => {
        if (message.command === "requestTasks") {
            sendTasksToCalendar(calendarPanel);
        } else if (message.command === "openFile") {
            let filePath = path.join(setMainDir(), message.file);
            vscode.workspace.openTextDocument(vscode.Uri.file(filePath)).then(doc => {
                vscode.window.showTextDocument(doc);
            });
        } else if (message.command === "rescheduleTask") {
            rescheduleTask(message.file, message.oldDate, message.newDate, message.text);
        }
    });
}


function rescheduleTask(file, oldDate, newDate, taskText) {
    let filePath = path.join(setMainDir(), file);
    let fileContents = fs.readFileSync(filePath, "utf-8");
    let fileLines = fileContents.split(/\r?\n/);

    // Ensure the newDate is parsed properly
    let parsedNewDate = moment(newDate, ["YYYY-MM-DD", "MM-DD-YYYY"], true);
    if (!parsedNewDate.isValid()) {
        console.error(`❌ Error: Unable to parse new date ${newDate}`);
        vscode.window.showErrorMessage(`Failed to reschedule task: Invalid date format.`);
        return;
    }

    let formattedOldDate = moment(oldDate, "YYYY-MM-DD").format("MM-DD-YYYY");
    let formattedNewDate = parsedNewDate.format("MM-DD-YYYY");
    let scheduledRegex = new RegExp(`SCHEDULED:\\s*\\[${formattedOldDate}\\]`);

    console.log(`🔎 Debugging Reschedule Task`);
    console.log(`File: ${file}`);
    console.log(`Task: ${taskText}`);
    console.log(`Old Date: ${oldDate} (formatted: ${formattedOldDate})`);
    console.log(`New Date: ${newDate} (parsed: ${formattedNewDate})`);
    console.log(`Regex: ${scheduledRegex}`);

    let updated = false;
    let updatedLines = fileLines.map(line => {
        if (line.includes(taskText) && scheduledRegex.test(line)) {
            updated = true;
            console.log(`✅ Found Matching Line: ${line}`);
            return line.replace(scheduledRegex, `SCHEDULED: [${formattedNewDate}]`);
        }
        return line;
    });

    if (updated) {
        fs.writeFileSync(filePath, updatedLines.join("\n"), "utf-8");
        vscode.window.showInformationMessage(`Task rescheduled to ${formattedNewDate} in ${file}`);
        refreshCalendarView();
    } else {
        console.error(`❌ Could not find scheduled task to update.`);
        vscode.window.showErrorMessage(`Could not find scheduled task to update.`);
    }
}

function getCalendarWebviewContent() {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Calendar View</title>
    <link href="https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #282c34; color: white; }
        #calendar { max-width: 900px; margin: auto; background: white; color: black; padding: 10px; border-radius: 8px; }
    </style>
</head>
<body>
    <h1>Calendar View</h1>
    <div id="calendar"></div>

    <script>
        const vscode = acquireVsCodeApi();

        document.addEventListener("DOMContentLoaded", function () {
            let calendarEl = document.getElementById("calendar");
            let calendar = new FullCalendar.Calendar(calendarEl, {
                initialView: "dayGridMonth",
                headerToolbar: {
                    left: "prev,next today",
                    center: "title",
                    right: "dayGridMonth,timeGridWeek,timeGridDay"
                },
                editable: true, // Enables drag-and-drop
                events: [],
                eventClick: function (info) {
                    vscode.postMessage({ command: "openFile", file: info.event.extendedProps.file });
                },
                eventDrop: function (info) {
                    let newDate = moment(info.event.start).format("MM-DD-YYYY");
                    vscode.postMessage({ 
                        command: "rescheduleTask", 
                        file: info.event.extendedProps.file, 
                        oldDate: info.event.extendedProps.originalDate, 
                        newDate: newDate,
                        text: info.event.title
                    });
                }
            });

            calendar.render();

            // Listen for VSCode messages to populate calendar
            window.addEventListener("message", (event) => {
                const tasks = event.data.tasks;
                let events = tasks.map(task => ({
                    title: task.text,
                    start: task.date,
                    file: task.file,
                    originalDate: task.date // Store original date for rescheduling
                }));
                calendar.removeAllEvents();
                calendar.addEventSource(events);
            });

            vscode.postMessage({ command: "requestTasks" });
        });
    </script>
</body>
</html>`;
}



//activate function, format on space bar press
function activate(ctx) {
    vscode.commands.registerCommand("extension.viewAgenda", agenda);
    vscode.commands.registerCommand("extension.updateDates", updateDates);
    
    vscode.workspace.onDidChangeConfiguration((event) => {
        let settingChanged = event.affectsConfiguration("Org-vscode.dateFormat");
        if (settingChanged) { 
            vscode.commands.executeCommand('extension.updateDates');
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
    // Register the new addSeparator command
    let addSeparatorCommand = vscode.commands.registerCommand('extension.addSeparator', addSeparator);
    ctx.subscriptions.push(addSeparatorCommand);
    insertTable.activate(ctx);
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

    // Add the Calendar View Command
    vscode.commands.registerCommand("extension.openCalendarView", openCalendarView);

    ctx.subscriptions.push(vscode.languages.registerOnTypeFormattingEditProvider(GO_MODE, new GoOnTypingFormatter(), " "));
}
module.exports = {
    activate
};
//# sourceMappingURL=extension.js.map