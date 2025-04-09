"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");
module.exports = function () {
    let config = vscode.workspace.getConfiguration("vsorg");
    let folderPath = config.get("folderPath");
    let folder;
    let titles = [];
    let listObject = {};
    let splitTitle;
    readFiles();
    function readFiles() {
        fs.readdir(setMainDir(), (err, items) => {
            for (let i = 0; i < items.length; i++) {
                if (items[i].includes(".vsorg")) {
                    let fileText;
                    if (os.platform() === 'darwin') {
                        fileText = fs.readFileSync(setMainDir() + "/" + items[i], "utf8");
                    }
                    else {
                        fileText = fs.readFileSync(setMainDir() + "\\" + items[i], "utf8");
                    }
                    if (fileText.includes("#+TITLE:") && fileText.match(/\#\+TITLE.*/gi) !== null) {
                        let fileName = items[i];
                        let getTitle = fileText.match(/\#\+TITLE.*/gi);
                        splitTitle = getTitle
                            .join("")
                            .split("#+TITLE:")
                            .join("")
                            .trim();
                        titles.push(splitTitle);
                        for (let j = 0; j < titles.length; j++) {
                            if (listObject[titles[j]] === undefined) {
                                listObject[titles[j]] = "";
                            }
                            if (listObject[titles[j]] === "") {
                                listObject[titles[j]] = fileName;
                            }
                        }
                    }
                }
                setQuickPick();
            }
        });
    }
    function setQuickPick() {
        vscode.window.showQuickPick(titles).then((title) => {
            if (title in listObject) {
                let fullpath = path.join(setMainDir(), listObject[title]);
                vscode.workspace.openTextDocument(vscode.Uri.file(fullpath)).then(doc => {
                    vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
                });
            }
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
};
//# sourceMappingURL=titles.js.map