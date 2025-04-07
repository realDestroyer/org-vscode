"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTitles = getTitles;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");
function getTitles() {
    let config = vscode.workspace.getConfiguration("vsorg");
    let folderPath = config.get("folderPath") || "";
    let titles = [];
    let listObject = {};
    readFiles();
    function readFiles() {
        fs.readdir(setMainDir(), (err, items) => {
            if (err)
                return;
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
    function setMainDir() {
        return folderPath.trim() !== "" ? folderPath : path.join(os.homedir(), "VSOrgFiles");
    }
}
//# sourceMappingURL=titles.js.map