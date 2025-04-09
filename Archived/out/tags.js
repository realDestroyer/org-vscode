"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTags = getTags;
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");
function getTags() {
    let config = vscode.workspace.getConfiguration("vsorg");
    let folderPath = config.get("folderPath") || "";
    let listObject = {};
    let formatTag = [];
    readFiles();
    function readFiles() {
        fs.readdir(setMainDir(), (err, items) => {
            if (err)
                return;
            items.forEach((file) => {
                if (file.endsWith(".vsorg")) {
                    let fileText = fs.readFileSync(path.join(setMainDir(), file), "utf-8");
                    if (fileText.includes("#+TAGS:")) {
                        let getTags = fileText.match(/\#\+TAGS.*/gi);
                        if (getTags) {
                            let splitTags = getTags[0].replace("#+TAGS:", "").trim().split(",");
                            splitTags.forEach((tag) => {
                                if (!formatTag.includes(tag)) {
                                    formatTag.push(tag);
                                }
                                listObject[tag] = (listObject[tag] || "") + file + ",";
                            });
                        }
                    }
                }
            });
            setQuickPick();
        });
    }
    function setQuickPick() {
        vscode.window.showQuickPick(formatTag).then((tag) => {
            if (tag && listObject[tag]) {
                let getFileName = listObject[tag].split(",");
                vscode.window.showQuickPick(getFileName).then((filePath) => {
                    if (!filePath)
                        return;
                    let fullpath = path.join(setMainDir(), filePath);
                    vscode.workspace.openTextDocument(vscode.Uri.file(fullpath)).then(doc => {
                        vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
                    });
                });
            }
        });
    }
    function setMainDir() {
        return folderPath.trim() !== "" ? folderPath : path.join(os.homedir(), "VSOrgFiles");
    }
}
//# sourceMappingURL=tags.js.map