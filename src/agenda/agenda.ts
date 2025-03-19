"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
import * as vscode from 'vscode';
const fs = require("fs");
const os = require("os");
import * as moment from 'moment';
import * as path from 'path';
module.exports = function () {
    vscode.commands.executeCommand("workbench.action.files.save").then(() => {
      let config = vscode.workspace.getConfiguration("org");
      let dateFormat = config.get<string>("dateFormat") || "YYYY-MM-DD";
        // Check if dateFormat is an array and extract the first element
        if (Array.isArray(dateFormat)) {
          dateFormat = dateFormat[0];
      }
      if (typeof dateFormat !== 'string') {
          vscode.window.showErrorMessage(`Invalid dateFormat configuration: ${dateFormat}`);
          return;
      }
        //let folder;
        let taskText;
        let taskTextGetTodo = "";
        let getDateFromTaskText;
        let convertedDateArray = [];
        let unsortedObject: Record<string, string> = {};
        let sortedObject: Record<string, string> = {};
        var itemInSortedObject = "";
        //call the function
        readFiles();
        function readFiles() {
            //read the directory
            fs.readdir(setMainDir(), (err: NodeJS.ErrnoException | null, items: string[]) => {
              if (err) {
                vscode.window.showErrorMessage(`Error reading directory: ${err.message}`);
                return;
            }
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
                        fileText.forEach((element: string) => {
                          if (element.includes("SCHEDULED") && !element.includes("DONE")) {
                              taskText = element.trim().match(/.*(?=.*SCHEDULED)/g);
                              const todoMatch = element.match(/\bTODO\b/);
                              taskTextGetTodo = todoMatch ? todoMatch[0] : "";
                              if (taskText && taskText[0]) {
                                  taskText = taskText[0].replace("⊙", "").replace("TODO", "").replace("DONE", "").replace("⊘", "").replace("⊖", "").trim();
                                  getDateFromTaskText = element.match(/\[(.*)\]/);
                                  if (getDateFromTaskText && getDateFromTaskText[1]) {
                                      if (taskTextGetTodo !== null) {
                                          taskText = `<span class="filename">${items[i]}:</span> <span class="todo" data-filename="${items[i]}" data-text="${taskText}" data-date="${getDateFromTaskText[0]}"> ${taskTextGetTodo}</span><span class="taskText">${taskText}</span><span class="scheduled">SCHEDULED</span>`;
                                      } else {
                                          taskText = `<span class="filename">${items[i]}:</span> <span class="taskText">${taskText}</span><span class="scheduled">SCHEDULED</span>`;
                                      }
                                      let d = moment(getDateFromTaskText[1] as string, dateFormat).day();
                                      let nameOfDay = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d];
                                      convertedDateArray = [];
                                      if (moment(getDateFromTaskText[1], dateFormat) >= moment(new Date(), dateFormat)) {
                                          if (nameOfDay !== undefined) {
                                              convertedDateArray.push({
                                                  date: `<div class="heading${nameOfDay} ${getDateFromTaskText[0]}"><h4 class="${getDateFromTaskText[0]}">${getDateFromTaskText[0]}, ${nameOfDay.toUpperCase()}</h4></div>`,
                                                  text: `<div class="panel ${getDateFromTaskText[0]}">${taskText}</div>`
                                              });
                                          }
                                      } else {
                                          let today = moment().format(dateFormat);
                                          let overdue = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][moment().day()];
                                          if (moment(getDateFromTaskText[1], dateFormat) < moment(new Date().getDate(), dateFormat)) {
                                              convertedDateArray.push({
                                                  date: `<div class="heading${overdue} [${today}]"><h4 class="[${today}]">[${today}], ${overdue.toUpperCase()}</h4></div>`,
                                                  text: `<div class="panel [${today}]">${taskText}<span class="late">LATE: ${getDateFromTaskText[1]}</span></div>`
                                              });
                                          }
                                      }
                                      convertedDateArray.forEach(element => {
                                          if (!unsortedObject[element.date]) {
                                              unsortedObject[element.date] = " " + element.text;
                                          } else {
                                              unsortedObject[element.date] += " " + element.text;
                                          }
                                      });
                                  } else {
                                      console.error("getDateFromTaskText is null or undefined for element:", element);
                                  }
                              } else {
                                  console.error("taskText is null or undefined for element:", element);
                              }
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
                    return first.getTime() - second.getTime();
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
        function setMainDir(): string {
          const config = vscode.workspace.getConfiguration("org");
          const folderPath = config.get<string>("folderPath");
      
          if (folderPath && folderPath.trim() !== "") {
              return folderPath;
          } else {
              const homeDir = os.homedir();
              if (os.platform() === "darwin" || os.platform() === "linux") {
                  return path.join(homeDir, "OrgFiles");
              } else {
                  return path.join(homeDir, "OrgFiles");
              }
          }
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
            fullAgendaView.webview.onDidReceiveMessage((message: any) => {
              switch (message.command) {
                case "open":
                  if (message.text !== undefined && message.text.trim() !== "") {
                    let fullPath = path.join(setMainDir(), message.text as string);
                    vscode.workspace.openTextDocument(vscode.Uri.file(fullPath)).then(doc => {
                        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, false);
                      });
                  } else {
                      vscode.window.showErrorMessage("The provided path is invalid or undefined.");
                  }
                  return;         
                  case "changeTodo":
                      if (typeof message.text === 'string') {
                          let textArray = message.text.split(",");
                          if (textArray.length >= 4) {
                              let fileName = path.join(setMainDir(), textArray[1]);
                              let text = textArray[2];
                              let contents = fs.readFileSync(fileName, "utf-8");
                              let x = contents.split(/\r?\n/);
                              for (let i = 0; i < x.length; i++) {
                                  if (x[i].indexOf(text) > -1 && x[i].indexOf(textArray[3]) > -1) {
                                      let removeSchedule = x[i].match(/\bSCHEDULED\b(.*)/g);
                                      if (removeSchedule) {
                                          let date = moment().format('Do MMMM YYYY, h:mm:ss a');
                                          x[i] = x[i].replace(removeSchedule[0], "");
                                          x[i] = x[i].replace(
                                              "TODO " + text,
                                              "DONE " +
                                              text +
                                              "    SCHEDULED: " +
                                              textArray[3] +
                                              "\n   COMPLETED:[" +
                                              date +
                                              "]"
                                          );
                                          contents = x.join("\r\n");
                                          fs.writeFileSync(fileName, contents, "utf-8");
                                      }
                                      return;
                                  }
                              }
                          } else {
                              vscode.window.showErrorMessage("changeTodo message.text has an invalid format.");
                          }
                      } else {
                          vscode.window.showErrorMessage("changeTodo message.text is undefined.");
                      }
                      return;
          
                  case "changeDone":
                      if (typeof message.text === 'string') {
                          let textArrayD = message.text.split(",");
                          if (textArrayD.length >= 4) {
                              let fileNameD = path.join(setMainDir(), textArrayD[1]);
                              let textD = textArrayD[2];
                              let contentsD = fs.readFileSync(fileNameD, "utf-8");
                              let y = contentsD.split(/\r?\n/);
                              for (let i = 0; i < y.length; i++) {
                                  if (y[i].indexOf(textD) > -1 && y[i].indexOf(textArrayD[3]) > -1) {
                                      let removeSchedule = y[i].match(/\bSCHEDULED\b(.*)/g);
                                      if (removeSchedule) {
                                          y[i] = y[i].replace(removeSchedule[0], "");
                                          y[i] = y[i].replace(
                                              "DONE " + textD,
                                              "TODO " + textD + "    SCHEDULED: " + textArrayD[3]
                                          );
                                          y.splice(i + 1, 1);
                                          contentsD = y.join("\r\n");
                                          fs.writeFileSync(fileNameD, contentsD, "utf-8");
                                      }
                                      return;
                                  }
                              }
                          } else {
                              vscode.window.showErrorMessage("changeDone message.text has an invalid format.");
                          }
                      } else {
                          vscode.window.showErrorMessage("changeDone message.text is undefined.");
                      }
                      return;
              }
          });          
        }
        function getWebviewContent(task: Record<string, string>): string {
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

          //show or hide panels
          if (!event.srcElement.classList.contains('panel')) {
            for (let i = 0; i < panels.length; i++) {
              if (panels[i].classList.contains(class0) || panels[i].classList.contains(class1)) {
                if (panels[i].style.display === 'block') {
                  panels[i].style.display = 'none';
                } else {
                  panels[i].style.display = 'block';
                }
              }
            }
          }
          //send filename to open file 
          if (event.srcElement.classList.contains('filename')) {
            //send message to open text file
            vscode.postMessage({
              command: 'open',
              text: event.target.innerText.replace(':', "")
            });
          }
          //change TODO to DONE and vice versa
          if(event.target.innerText === "TODO"){
            event.target.innerText = "DONE";
            event.srcElement.classList.add('done');
            event.srcElement.classList.remove('todo');

            vscode.postMessage({
              command: 'changeTodo',
              text: event.target.innerText + "," + event.target.dataset.filename + "," + event.target.dataset.text + "," + event.target.dataset.date
            })
          } else if(event.target.innerText === "DONE") {
            event.target.innerText = "TODO";
            event.srcElement.classList.add('todo');
            event.srcElement.classList.remove('done');
            vscode.postMessage({
              command: 'changeDone',
              text: event.target.innerText + "," + event.target.dataset.filename + "," + event.target.dataset.text + "," + event.target.dataset.date
            })
          }
        });



</script>
</body>
</html>`;
        }
    });
};
//# sourceMappingURL=agenda.js.map