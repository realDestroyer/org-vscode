import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as moment from "moment";
import * as path from "path";

export function viewAgenda(): void {
    vscode.commands.executeCommand("workbench.action.files.save").then(() => {
      const config = vscode.workspace.getConfiguration("org");
      let dateFormat = config.get<string>("dateFormat") || "MM-DD-YYYY";
        if (Array.isArray(dateFormat)) {
            dateFormat = dateFormat[0];
        }

        if (typeof dateFormat !== "string") {
            vscode.window.showErrorMessage(`Invalid dateFormat configuration: ${dateFormat}`);
            return;
        }

        const agendaData = readAgendaFiles(dateFormat);
        createWebview(agendaData);
    });
}

function readAgendaFiles(dateFormat: string): Record<string, string> {
  const agendaEntries: Record<string, string> = {};
  const orgDir = getMainDirectory();
  
  if (!fs.existsSync(orgDir)) {
      vscode.window.showErrorMessage(`Agenda directory does not exist: ${orgDir}`);
      return {};
  }
  
  const files = fs.readdirSync(orgDir).filter(file => file.endsWith(".org"));
  
  files.forEach(file => {
      const filePath = path.join(orgDir, file);
      const fileContent = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);
      
      fileContent.forEach(line => {
          if (line.includes("SCHEDULED") && !line.includes("DONE")) {
              const taskTextMatch = line.match(/(.*?)(?=SCHEDULED)/);
              const dateMatch = line.match(/\[(.*?)\]/);
              if (taskTextMatch && dateMatch) {
                  const taskText = taskTextMatch[1].trim();
                  const formattedDate = dateMatch[1];
                  const dayOfWeek = moment(formattedDate, dateFormat).format("dddd");
                  
                  const entry = `<span class="filename">${file}:</span> <span class="taskText">${taskText}</span> <span class="scheduled">SCHEDULED</span>`;
                  if (!agendaEntries[formattedDate]) {
                      agendaEntries[formattedDate] = `<div class="heading${dayOfWeek}"><h4>[${formattedDate}], ${dayOfWeek.toUpperCase()}</h4></div>${entry}`;
                  } else {
                      agendaEntries[formattedDate] += entry;
                  }
              }
          }
      });
  });
  
  return Object.fromEntries(
      Object.entries(agendaEntries).sort(([a], [b]) => moment(a, dateFormat).toDate().getTime() - moment(b, dateFormat).toDate().getTime())
  );
}

function getMainDirectory(): string {
    const config = vscode.workspace.getConfiguration("Org-vscode");
    const folderPath = config.get<string>("folderPath");
    
    if (folderPath && folderPath.trim() !== "") {
        return folderPath;
    }
    
    return path.join(os.homedir(), "OrgFiles");
}

function createWebview(agendaData: Record<string, string>): void {
    const panel = vscode.window.createWebviewPanel("fullAgenda", "Full Agenda View", vscode.ViewColumn.Beside, {
        enableScripts: true
    });
    
    panel.webview.html = getWebviewContent(agendaData);
}

function getWebviewContent(agendaEntries: Record<string, string>): string {
          const itemInSortedObject = Object.values(agendaEntries).join("<br>");          
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
//# sourceMappingURL=agenda.js.map