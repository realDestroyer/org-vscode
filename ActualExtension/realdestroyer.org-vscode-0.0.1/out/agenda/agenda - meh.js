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
          let mainDir = setMainDir();
          console.log(`📂 Reading directory: ${mainDir}`);
      
          if (!fs.existsSync(mainDir)) {
              console.error(`❌ Error: Directory does not exist -> ${mainDir}`);
              vscode.window.showErrorMessage(`Org directory not found: ${mainDir}`);
              return;
          }
      
          fs.readdir(mainDir, (err, items) => {
              if (err) {
                  console.error(`❌ Error reading directory: ${err.message}`);
                  vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
                  return;
              }
      
              console.log(`📋 Found ${items.length} files in directory.`);
              let unsortedObject = {};
              let sortedObject = {};
              let itemInSortedObject = "";
      
              if (items.length === 0) {
                  console.warn("⚠️ No .org files found. Skipping Agenda View creation.");
                  vscode.window.showWarningMessage("No .org files found.");
                  return;
              }
      
              items.forEach(filePath => {
                  console.log(`📖 Processing file: ${filePath}`);
                  let fileText = fs.readFileSync(path.join(mainDir, filePath), "utf-8").split(/\r?\n/);
                  let fileName = path.basename(filePath);
      
                  fileText.forEach(element => {
                      if (element.includes("SCHEDULED") && !element.includes("DONE")) {
                          console.log(`📅 Found scheduled task in: ${fileName}`);
      
                          let taskText = element.trim().match(/.*(?=.*SCHEDULED)/g);
                          let getDateFromTaskText = element.match(/\[(.*)\]/);
      
                          if (!getDateFromTaskText) return;
      
                          let formattedTask =
                              `<span class="filename">${fileName}:</span> ` +
                              `<span class="taskText">${taskText}</span>` +
                              `<span class="scheduled">SCHEDULED</span>`;
      
                          let formattedDate = moment(getDateFromTaskText[1], "MM-DD-YYYY").format("MM-DD-YYYY");
                          let nameOfDay = moment(formattedDate, "MM-DD-YYYY").format("dddd");
      
                          let convertedDateArray = [];
                          convertedDateArray.push({
                              date: `<div class="heading${nameOfDay} ${getDateFromTaskText[0]}">
                                         <h4 class="${getDateFromTaskText[0]}">${getDateFromTaskText[0]}, ${nameOfDay.toUpperCase()}</h4>
                                     </div>`,
                              text: `<div class="panel ${getDateFromTaskText[0]}">${formattedTask}</div>`
                          });
      
                          convertedDateArray.forEach(element => {
                              if (!unsortedObject[element.date]) {
                                  unsortedObject[element.date] = "  " + element.text;
                              } else {
                                  unsortedObject[element.date] += "  " + element.text;
                              }
                          });
                      }
                  });
              });
      
              Object.keys(unsortedObject)
                  .sort((a, b) => {
                      let dateA = moment(a.match(/\[(.*)\]/)[1], "MM-DD-YYYY").toDate();
                      let dateB = moment(b.match(/\[(.*)\]/)[1], "MM-DD-YYYY").toDate();
                      return dateA - dateB;
                  })
                  .forEach(key => {
                      sortedObject[key] = unsortedObject[key];
                  });
      
              Object.keys(sortedObject).forEach(property => {
                  itemInSortedObject += property + sortedObject[property] + "</br>";
              });
      
              console.log(`✅ Final Task Data Length: ${itemInSortedObject.length} characters`);
              
              // ✅ Ensure we only create the webview if there's data
              if (itemInSortedObject.trim() !== "") {
                  createWebview(itemInSortedObject);
              } else {
                  console.warn("⚠️ No valid agenda items to display.");
                  vscode.window.showWarningMessage("No valid scheduled tasks found.");
              }
          });
      }
      
      
        
        
        /**
         * Get the Main Directory
         */
        function setMainDir() {
          console.log("📂 Getting Main Directory...");
      
          // ✅ Explicitly fetch the folderPath from VSCode settings
          let config = vscode.workspace.getConfiguration("Org-vscode");
          let folderPath = config.get("folderPath");
      
          if (!folderPath || folderPath.trim() === "") {
              let homeDir = os.homedir();
              folder = path.join(homeDir, "VSOrgFiles");
              console.log(`⚠️ No folderPath found, using default: ${folder}`);
          } else {
              folder = folderPath;
              console.log(`✅ Using configured folderPath: ${folder}`);
          }
      
          return folder;
      }
      
        
      function createWebview() {
        console.log("🖥️ Creating Agenda Webview...");
        
        if (!sortedObject || Object.keys(sortedObject).length === 0) {
            console.warn("⚠️ No scheduled tasks to display.");
            vscode.window.showWarningMessage("No scheduled tasks found.");
            return;
        }
    
        let reload = false;
        let fullAgendaView = vscode.window.createWebviewPanel("fullAgenda", "Full Agenda View", vscode.ViewColumn.Beside, {
            enableScripts: true
        });
    
        console.log("📋 Injecting HTML into Webview with sortedObject data.");
    
        // ✅ Debugging: Log the full HTML being sent
        let htmlContent = getWebviewContent(sortedObject);
        console.log("📝 Generated Webview HTML:\n", htmlContent);
    
        fullAgendaView.webview.html = htmlContent;
    
        // Reload on save
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
                    let [newStatus, fileName, taskText, date, additionalFlag] = message.text.split(",");
                    let filePath = path.join(setMainDir(), fileName);
                    let fileContents = fs.readFileSync(filePath, "utf-8");
                    let fileLines = fileContents.split(/\r?\n/);
    
                    for (let i = 0; i < fileLines.length; i++) {
                        if (fileLines[i].includes(taskText) && fileLines[i].includes(date)) {
                            let currentStatus = fileLines[i].match(/\b(TODO|DONE|IN_PROGRESS|CONTINUED|ABANDONED)\b/);
    
                            if (currentStatus) {
                                fileLines[i] = fileLines[i].replace(currentStatus[0], newStatus);
    
                                // If changing to DONE, add COMPLETED line
                                if (newStatus === "DONE") {
                                    let completedDate = new Date();
                                    let formattedDate = completedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
                                    fileLines.splice(i + 1, 0, `   COMPLETED: [${formattedDate}]`);
                                }
    
                                // If moving away from DONE, remove COMPLETED line
                                if (currentStatus[0] === "DONE" && additionalFlag === "REMOVE_COMPLETED") {
                                    if (fileLines[i + 1] && fileLines[i + 1].trim().startsWith("COMPLETED:")) {
                                        fileLines.splice(i + 1, 1);
                                    }
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