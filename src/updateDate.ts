import { WindowMessage } from "./showMessage";
import * as vscode from "vscode";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export function updateDates(): void {
    let config = vscode.workspace.getConfiguration("vsorg");
    let folderPath = config.get<string>("folderPath") || "";

    fs.readdir(setMainDir(), (err, items) => {
        if (err) return;
        items.forEach((file) => {
            if (file.endsWith(".vsorg")) {
                let filePath = path.join(setMainDir(), file);
                let fileText = fs.readFileSync(filePath, "utf-8").split(/\r?\n/);

                let updatedLines = fileText.map(line => {
                    if (line.includes("SCHEDULED")) {
                        let getDateFromTaskText = line.match(/\[(.*)\]/);
                        if (getDateFromTaskText) {
                            let dateSplit = getDateFromTaskText[1].split("-");
                            [dateSplit[0], dateSplit[1]] = [dateSplit[1], dateSplit[0]];
                            let newText = line.replace(/\[(.*)\]/, "[" + dateSplit.join("-") + "]");
                            return newText;
                        }
                    }
                    return line;
                });

                fs.writeFileSync(filePath, updatedLines.join("\r\n"));
            }
        });

        new WindowMessage("information", "All SCHEDULED dates have been updated to the new date format.", false, false).showMessage();
    });

    function setMainDir(): string {
        return folderPath.trim() !== "" ? folderPath : path.join(os.homedir(), "VSOrgFiles");
    }
}
