"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
const moment = require("moment");
const path = require("path");
module.exports = function () {
    vscode.commands.executeCommand("workbench.action.files.save").then(() => {
        let config = vscode.workspace.getConfiguration("org");
        let folderPath = config.get("folderPath");
        let dateFormat = config.get("dateFormat");
        let folder;
        let taskText;
        let taskTextGetTodo = "";
        let getDateFromTaskText;
        let convertedDateArray = [];
        let unsortedObject = {};
        let sortedObject = {};
        var itemInSortedObject = "";
        //call the function
        readFiles();
        function readFiles() {
            //read the directory
            fs.readdir(setMainDir(), (err, items) => {
                //loop through all of the files in the directory
                for (let i = 0; i < items.length; i++) {
                    //make sure its a org file
                    if (items[i].includes(".org")) {
                        //read the file and puth the text in an array
                        let fileText;
                        if (os.platform() === "darwin" || os.platform() === "linux") {
                            fileText = fs
                                .readFileSync(setMainDir() + "/" + items[i])
                                .toString()
                                .split(/\r?\n/);
                        }
                        else {
                            fileText = fs
                                .readFileSync(setMainDir() + "\\" + items[i])
                                .toString()
                                .split(/\r?\n/);
                        }
                        fileText.forEach(element => {
                            // for each element check for scheduled and not done
                            if (element.includes("SCHEDULED") && !element.includes("DONE")) {
                                //get everything before scheduled
                                taskText = element.trim().match(/.*(?=.*SCHEDULED)/g);
                                //get todo
                                taskTextGetTodo = element.match(/\bTODO\b/);
                                //remove keywords and unicode chars
                                taskText = taskText[0].replace("⊙", "");
                                taskText = taskText.replace("TODO", "");
                                taskText = taskText.replace("DONE", "");
                                taskText = taskText.replace("IN_PROGRESS", "");
                                taskText = taskText.replace("CONTINUED", "");
                                taskText = taskText.replace("ABANDONED", "");
                                taskText = taskText.replace("⊘", "");
                                taskText = taskText.replace("⊖", "");
                                taskText = taskText.trim();
                                //get the date
                                getDateFromTaskText = element.match(/\[(.*)\]/);
                                //if there is a TODO
                                if (taskTextGetTodo !== null) {
                                    taskText =
                                        '<span class="filename">' +
                                            items[i] +
                                            ":</span> " +
                                            '<span class="todo" data-filename="' +
                                            items[i] +
                                            '" data-text= "' +
                                            taskText +
                                            '" ' +
                                            '" data-date= "' +
                                            getDateFromTaskText[0] +
                                            '"> ' +
                                            taskTextGetTodo +
                                            "</span>" +
                                            '<span class="taskText">' +
                                            taskText +
                                            "</span>" +
                                            '<span class="scheduled">SCHEDULED</span>';
                                }
                                else {
                                    taskText =
                                        '<span class="filename">' +
                                            items[i] +
                                            ":</span> " +
                                            '<span class="taskText">' +
                                            taskText +
                                            "</span>" +
                                            '<span class="scheduled">SCHEDULED</span>';
                                }
                                //get the day of the week for items scheduled in the future
                                let d = moment(getDateFromTaskText[1], dateFormat).day();
                                let nameOfDay;
                                if (d === 0) {
                                    nameOfDay = "Sunday";
                                }
                                else if (d === 1) {
                                    nameOfDay = "Monday";
                                }
                                else if (d === 2) {
                                    nameOfDay = "Tuesday";
                                }
                                else if (d === 3) {
                                    nameOfDay = "Wednesday";
                                }
                                else if (d === 4) {
                                    nameOfDay = "Thursday";
                                }
                                else if (d === 5) {
                                    nameOfDay = "Friday";
                                }
                                else if (d === 6) {
                                    nameOfDay = "Saturday";
                                }
                                convertedDateArray = [];
                                if (moment(getDateFromTaskText[1], dateFormat) >= moment(new Date(), dateFormat)) {
                                    if (nameOfDay !== undefined) {
                                        convertedDateArray.push({
                                            date: '<div class="heading' +
                                                nameOfDay +
                                                " " +
                                                getDateFromTaskText[0] +
                                                '"><h4 class="' +
                                                getDateFromTaskText[0] +
                                                '">' +
                                                getDateFromTaskText[0] +
                                                ", " +
                                                nameOfDay.toUpperCase() +
                                                "</h4></div>",
                                            text: '<div class="panel ' + getDateFromTaskText[0] + '">' + taskText + "</div>"
                                        });
                                    }
                                }
                                else {
                                    //todays date for incomplete items in the past
                                    var today = new Date();
                                    var dd = today.getDate();
                                    var mm = today.getMonth() + 1;
                                    var yyyy = today.getFullYear();
                                    var getDayOverdue = today.getDay();
                                    var overdue;
                                    if (dd < 10) {
                                        dd = "0" + dd;
                                    }
                                    if (mm < 10) {
                                        mm = "0" + mm;
                                    }
                                    if (dateFormat === "MM-DD-YYYY") {
                                        today = mm + "-" + dd + "-" + yyyy;
                                    }
                                    else {
                                        today = dd + "-" + mm + "-" + yyyy;
                                    }
                                    if (getDayOverdue === 0) {
                                        overdue = "Sunday";
                                    }
                                    else if (getDayOverdue === 1) {
                                        overdue = "Monday";
                                    }
                                    else if (getDayOverdue === 2) {
                                        overdue = "Tuesday";
                                    }
                                    else if (getDayOverdue === 3) {
                                        overdue = "Wednesday";
                                    }
                                    else if (getDayOverdue === 4) {
                                        overdue = "Thursday";
                                    }
                                    else if (getDayOverdue === 5) {
                                        overdue = "Friday";
                                    }
                                    else if (getDayOverdue === 6) {
                                        overdue = "Saturday";
                                    }
                                    //if date is a day in the past
                                    if (moment(getDateFromTaskText[1], dateFormat) < moment(new Date().getDate(), dateFormat)) {
                                        convertedDateArray.push({
                                            date: '<div class="heading' +
                                                overdue +
                                                " " +
                                                "[" +
                                                today +
                                                "]" +
                                                '"><h4 class="' +
                                                "[" +
                                                today +
                                                "]" +
                                                '">' +
                                                "[" +
                                                today +
                                                "]" +
                                                ", " +
                                                overdue.toUpperCase() +
                                                "</h4></div>",
                                            text: '<div class="panel ' +
                                                "[" +
                                                today +
                                                "]" +
                                                '">' +
                                                taskText +
                                                '<span class="late">LATE: ' +
                                                getDateFromTaskText[1] +
                                                "</span></div>"
                                        });
                                    }
                                }
                                //converted array to object with date as keys
                                convertedDateArray.forEach((element) => {
                                    if (!unsortedObject[element.date]) {
                                        unsortedObject[element.date] = "  " + element.text;
                                    }
                                    else {
                                        unsortedObject[element.date] += "  " + element.text;
                                    }
                                });
                            }
                        });
                        //sort the object by date
                        Object.keys(unsortedObject).forEach(function (key) {
                            sortedObject[key] = unsortedObject[key];
                        });
                    }
                }
                Object.keys(sortedObject)
                    .sort(function (a, b) {
                    let first = moment(a.match(/\[(.*)\]/), dateFormat).toDate();
                    let second = moment(b.match(/\[(.*)\]/), dateFormat).toDate();
                    return first - second;
                })
                    .forEach(function (property) {
                    itemInSortedObject += property + sortedObject[property] + "</br>";
                });
                createWebview();
            });
        }
        /**
         * Get the Main Directory
         */
        function setMainDir() {
            if (folderPath === "") {
                let homeDir = os.homedir();
                if (os.platform() === "darwin" || os.platform() === "linux") {
                    folder = homeDir + "/VSOrgFiles";
                }
                else {
                    folder = homeDir + "\\VSOrgFiles";
                }
            }
            else {
                folder = folderPath;
            }
            return folder;
        }
        function createWebview() {
            let reload = false;
            let fullAgendaView = vscode.window.createWebviewPanel("fullAgenda", "Full Agenda View", vscode.ViewColumn.Beside, {
                // Enable scripts in the webview
                enableScripts: true
            });
            // Set The HTML content
            fullAgendaView.webview.html = getWebviewContent(sortedObject);
            //reload on save
            vscode.workspace.onDidSaveTextDocument((document) => {
                reload = true;
                fullAgendaView.dispose();
            });
            fullAgendaView.onDidDispose(() => {
                if (reload === true) {
                    reload = false;
                    vscode.commands.executeCommand("extension.viewAgenda");
                }
            });
            // Handle messages from the webview
            fullAgendaView.webview.onDidReceiveMessage(message => {
                switch (message.command) {
                    case "open":
                        let fullPath = path.join(setMainDir(), message.text);
                        vscode.workspace.openTextDocument(vscode.Uri.file(fullPath)).then(doc => {
                            vscode.window.showTextDocument(doc, vscode.ViewColumn.One, false);
                        });
                        return;
            
                    case "changeStatus":
                        let [newStatus, fileName, taskText, date, completedText] = message.text.split(",");
                        let filePath = path.join(setMainDir(), fileName);
                        let fileContents = fs.readFileSync(filePath, "utf-8");
                        let fileLines = fileContents.split(/\r?\n/);
            
                        for (let i = 0; i < fileLines.length; i++) {
                            if (fileLines[i].includes(taskText) && fileLines[i].includes(date)) {
                                let currentStatus = fileLines[i].match(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/);
                                
                                if (currentStatus) {
                                    fileLines[i] = fileLines[i].replace(currentStatus[0], newStatus);
            
                                    // If changing to DONE, add COMPLETED line
                                    if (newStatus === "DONE" && completedText) {
                                        fileLines.splice(i + 1, 0, "   " + completedText);
                                    }
            
                                    fs.writeFileSync(filePath, fileLines.join("\n"), "utf-8");
                                    vscode.window.showInformationMessage(`Updated: ${taskText} -> ${newStatus}`);
                                }
                                break;
                            }
                        }
                        return;
                }
            });                        
        }
        function getWebviewContent(task) {
            return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Cat Coding</title>
            <link href="https://fonts.googleapis.com/css?family=Roboto+Mono:400,700|Roboto:400,700" rel="stylesheet">
        </head>
        <style>
        body{
          font-family: 'Roboto', sans-serif;
        }
        .headingSunday {
          background-color: #2f6999;
          color: #ffffff;
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;          
        }
        .headingMonday {
          background-color: #2f996e;
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;
          color: #ffffff;
        }
        .headingTuesday {
          background-color: #802f99;

          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;
          color: #ffffff;
        }
        .headingWednesday {
          background-color: #992f2f;
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;
          color: #ffffff;
        }
        .headingThursday {
          background-color: #992f67;
        
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;
          color: #ffffff;
        }
        .headingFriday {
          background-color: #44992f;
          color: #ffffff;
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;

        }
        .headingSaturday {
          background-color: #3c2e96;
          color: #ffffff;
          cursor: pointer;
          padding: 1px;
          padding-left: 10px;
          border: none;
          text-align: left;
          outline: none;
        }
        .active, .accordion:hover {
            background-color: #ccc; 
        }
        .panel {
          padding-right: 10px;
          padding-bottom: 10px;    
          padding-bottom: 10px;
          background-color: white;
          overflow: hidden;
          color: #000000;
          border-bottom: 1px solid black;
          box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
          display: none;
        }
        .todo{ 
          color: #d12323;
          padding-left: 10px;
          font-weight: 700;
          float: left;
          padding-top: 13px;
          padding-bottom: -10px;
          height: 67%;
          transition: all .5s ease;
          cursor: pointer;
        }
        .done{
        color: #4286f4;
        padding-left: 10px;
        font-weight: 700;
        float: left;
        padding-top: 13px;
        padding-bottom: -10px;
        height: 67%;
        transition: all .5s ease;
        cursor: pointer;
        }
        .in_progress{ 
          color:rgb(4, 255, 0);
          padding-left: 10px;
          font-weight: 700;
          float: left;
          padding-top: 13px;
          padding-bottom: -10px;
          height: 67%;
          transition: all .5s ease;
          cursor: pointer;
        }
        .continued{
        color:rgb(2, 202, 242);
        padding-left: 10px;
        font-weight: 700;
        float: left;
        padding-top: 13px;
        padding-bottom: -10px;
        height: 67%;
        transition: all .5s ease;
        cursor: pointer;
        }
        .abandoned{
        color:rgb(162, 2, 255);
        padding-left: 10px;
        font-weight: 700;
        float: left;
        padding-top: 13px;
        padding-bottom: -10px;
        height: 67%;
        transition: all .5s ease;
        cursor: pointer;
        }

        .filename{
          font-size: 15px;
          font-weight: 700;
          float: left;
          margin-left: 10px;
          margin-top: 10px;
          cursor: pointer;
        }

        .filename:hover{
          color: #095fea;
        }
        .scheduled{
          background-color: #76E6E6;
          padding-left: 10px;
          padding-right: 10px;
          padding-top: 5px;
          color: #5d5d5d;
          font-weight: 700;
          border-radius: 27px;
          font-size: 9px;
          /* margin-left: auto; */
          height: 15px;
          float: right;
          margin-left: 10px;
          margin-top: 10px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
        }

        .textDiv{
          width: 100%;
          margin: 0;
          height: 40px;
        }

        .taskText{
          font-size: 15px;
          float: left;
          margin-left: 10px;
          margin-top: 10px;
          width: 50%;
          font-family: 'Roboto Mono', sans-serif;
          font-weight: 400;
        }
        .late{
          background-color: #DF9930;

          padding-left: 10px;
          padding-right: 10px;
          padding-top: 5px;
          color: #ffffff;
          font-weight: 700;
          border-radius: 27px;
          font-size: 9px;
          /* margin-left: auto; */
          height: 15px;
          float: right;
          margin-left: 10px;
          margin-top: 10px;
          box-shadow: 0 3px 6px rgba(0,0,0,0.16), 0 3px 6px rgba(0,0,0,0.23);
        }
        </style>
        <body>

        <h1>Agenda View</h1>
        <div id="display-agenda">
        ${itemInSortedObject}
        </div>
          

        <script>
        const vscode = acquireVsCodeApi();
        document.addEventListener('click', function(event) {
        
        let class0 = event.srcElement.classList[0];
        let class1 = event.srcElement.classList[1];
        let panels = document.getElementsByClassName('panel');

        // Show or hide panels
        if (!event.srcElement.classList.contains('panel')) {
            for (let i = 0; i < panels.length; i++) {
            if (panels[i].classList.contains(class0) || panels[i].classList.contains(class1)) {
                panels[i].style.display = panels[i].style.display === 'block' ? 'none' : 'block';
            }
            }
        }
        
        // Send filename to open file
        if (event.srcElement.classList.contains('filename')) {
            vscode.postMessage({
            command: 'open',
            text: event.target.innerText.replace(':', "")
            });
        }

        // Cycle through statuses while maintaining proper placement and styling
        const statuses = ["TODO", "IN_PROGRESS", "CONTINUED", "DONE", "ABANDONED"];
        let currentStatus = event.target.innerText.trim();
        let currentIndex = statuses.indexOf(currentStatus);
        
        if (currentIndex !== -1) {
            let nextStatus = statuses[(currentIndex + 1) % statuses.length];
            event.target.innerText = nextStatus;
            event.srcElement.classList.remove(currentStatus.toLowerCase());
            event.srcElement.classList.add(nextStatus.toLowerCase());

            // Ensure proper styling by keeping the class structure consistent
            event.srcElement.classList.remove("todo", "in_progress", "continued", "done", "abandoned");
            event.srcElement.classList.add(nextStatus.toLowerCase());
            
            let messageText = nextStatus + "," + event.target.dataset.filename + "," + event.target.dataset.text + "," + event.target.dataset.date;
            
            if (nextStatus === "DONE") {
            let completedDate = new Date();
            let formattedDate = completedDate.toISOString().split('T')[0]; // Formats as YYYY-MM-DD
            messageText += ",COMPLETED:[" + formattedDate + "]";
            }

            if (currentStatus === "DONE") {
            messageText += ",REMOVE_COMPLETED"; // Signal to remove COMPLETED line when moving away from DONE
            }
            
            vscode.postMessage({
            command: 'changeStatus',
            text: messageText
            });
        }
        });
        </script>
        </body>
</html>`;
        }
    });
};
//# sourceMappingURL=agenda.js.map