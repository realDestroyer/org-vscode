import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

export function getTitles(): void {
    let config = vscode.workspace.getConfiguration("vsorg");
    let folderPath = config.get<string>("folderPath") || "";
    let titles: string[] = [];
    let listObject: Record<string, string> = {};

    readFiles();

    function readFiles() {
        fs.readdir(setMainDir(), (err, items) => {
            if (err) return;
            items.forEach((file) => {
                if (file.endsWith(".vsorg")) {
                    let fileText = fs.readFileSync(path.join(setMainDir(), file), "utf-8");

                    if (fileText.includes("#+TITLE:")) {
                        let getTitle = fileText.match(/\#\+TITLE.*/gi);
                        if (getTitle) {
                            let splitTitle = getTitle[0].replace("#+TITLE:", "").trim();
                            titles.push(splitTitle);
                            listObject[splitTitle] = file;
                        }
                    }
                }
            });

            setQuickPick();
        });
    }

    function setQuickPick() {
        vscode.window.showQuickPick(titles).then((title) => {
            if (title && listObject[title]) {
                let fullpath = path.join(setMainDir(), listObject[title]);
                vscode.workspace.openTextDocument(vscode.Uri.file(fullpath)).then(doc => {
                    vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
                });
            }
        });
    }

    function setMainDir(): string {
        return folderPath.trim() !== "" ? folderPath : path.join(os.homedir(), "VSOrgFiles");
    }
}
