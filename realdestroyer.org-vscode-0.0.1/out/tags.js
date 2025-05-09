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
    let listObject = {};
    let splitTags;
    let formatTag = [];
    readFiles();
    //get tags
    function readFiles() {
        fs.readdir(setMainDir(), (err, items) => {
            for (let i = 0; i < items.length; i++) {
                if (items[i].includes(".vsorg")) {
                    //check files for #+ TAGS:'
                    let fileText;
                    if (os.platform() === "darwin" || os.platform() === "linux") {
                        fileText = fs.readFileSync(setMainDir() + "/" + items[i], "utf-8");
                    }
                    else {
                        fileText = fs.readFileSync(setMainDir() + "\\" + items[i], "utf-8");
                    }
                    if (fileText.includes("#+TAGS:") && fileText.match(/\#\+TAGS.*/gi) !== null) {
                        let fileName = items[i];
                        let getTags = fileText.match(/\#\+TAGS.*/gi);
                        splitTags = getTags
                            .join("")
                            .split("#+TAGS:")
                            .join("")
                            .trim()
                            .split(",");
                        splitTags.forEach((element) => {
                            if (!formatTag.includes(element)) {
                                formatTag.push(element);
                            }
                        });
                        splitTags.forEach((element) => {
                            if (listObject[element] === undefined) {
                                listObject[element] = "";
                            }
                            listObject[element] = listObject[element] + fileName + ",";
                        });
                    }
                }
                setQuickPick();
            }
        });
    }
    function setQuickPick() {
        vscode.window.showQuickPick(formatTag).then((tag) => {
            if (tag != null) {
                if (tag in listObject) {
                    let getFileName = listObject[tag].split(",");
                    vscode.window.showQuickPick(getFileName).then((filePath) => {
                        let fullpath = path.join(setMainDir(), filePath);
                        vscode.workspace.openTextDocument(vscode.Uri.file(fullpath)).then(doc => {
                            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
                        });
                    });
                }
                // vscode.window.showQuickPick(listObject)
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
//# sourceMappingURL=tags.js.map