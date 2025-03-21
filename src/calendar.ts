import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as moment from "moment";

let calendarPanel: vscode.WebviewPanel | null = null;

export function openCalendarView(): void {
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
    calendarPanel.webview.onDidReceiveMessage(handleWebviewMessage);

    calendarPanel.onDidDispose(() => {
        calendarPanel = null;
    });
}

function handleWebviewMessage(message: any): void {
    if (!calendarPanel) return;

    if (message.command === "requestTasks") {
        sendTasksToCalendar(calendarPanel);
    } else if (message.command === "openFile") {
        openTaskFile(message.file);
    } else if (message.command === "rescheduleTask") {
        rescheduleTask(message.file, message.oldDate, message.newDate, message.text);
    }
}

function sendTasksToCalendar(panel: vscode.WebviewPanel): void {
    let tasks: { text: string; date: string; file: string }[] = [];
    let dirPath = vscode.workspace.getConfiguration("Org-vscode").get<string>("folderPath") || path.join(require("os").homedir(), "OrgFiles");

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

        panel.webview.postMessage({ tasks });
    });
}

function rescheduleTask(file: string, oldDate: string, newDate: string, taskText: string): void {
    let filePath = path.join(vscode.workspace.getConfiguration("Org-vscode").get<string>("folderPath") || path.join(require("os").homedir(), "OrgFiles"), file);
    let fileContents = fs.readFileSync(filePath, "utf-8");
    let fileLines = fileContents.split(/\r?\n/);
    
    let formattedOldDate = moment(oldDate, "YYYY-MM-DD").format("MM-DD-YYYY");
    let formattedNewDate = moment(newDate, ["YYYY-MM-DD", "MM-DD-YYYY"], true).format("MM-DD-YYYY");
    let scheduledRegex = new RegExp(`SCHEDULED:\\s*\\[${formattedOldDate}\\]`);
    
    let updated = false;
    let updatedLines = fileLines.map(line => {
        if (line.includes(taskText) && scheduledRegex.test(line)) {
            updated = true;
            return line.replace(scheduledRegex, `SCHEDULED: [${formattedNewDate}]`);
        }
        return line;
    });
    
    if (updated) {
        fs.writeFileSync(filePath, updatedLines.join("\n"), "utf-8");
        vscode.window.showInformationMessage(`Task rescheduled to ${formattedNewDate} in ${file}`);
        sendTasksToCalendar(calendarPanel!);
    } else {
        vscode.window.showErrorMessage(`Could not find scheduled task to update.`);
    }
}

function openTaskFile(file: string): void {
    let filePath = path.join(vscode.workspace.getConfiguration("Org-vscode").get<string>("folderPath") || path.join(require("os").homedir(), "OrgFiles"), file);
    vscode.workspace.openTextDocument(vscode.Uri.file(filePath)).then(doc => {
        vscode.window.showTextDocument(doc);
    });
}

function getCalendarWebviewContent(): string {
    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Calendar View</title>
    <link href="https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.css" rel="stylesheet">
    <script src="https://cdn.jsdelivr.net/npm/fullcalendar@5.11.3/main.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.4/moment.min.js"></script>
</head>
<body>
    <h1>Calendar View</h1>
    <div id="calendar"></div>
</body>
<script>
    const vscode = acquireVsCodeApi();
    document.addEventListener("DOMContentLoaded", function () {
        let calendarEl = document.getElementById("calendar");
        let calendar = new FullCalendar.Calendar(calendarEl, { initialView: "dayGridMonth", editable: true, events: [] });
        calendar.render();
        window.addEventListener("message", event => calendar.addEventSource(event.data.tasks));
        vscode.postMessage({ command: "requestTasks" });
    });
</script>
</html>`;
}
