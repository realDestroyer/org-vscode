"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");
module.exports = function () {
    let config = vscode.workspace.getConfiguration("Org-vscode");
    let folderPath = config.get("folderPath");
    let folder;
    let titles = [];
    let listObject = {};
    let splitTitle;
    readFiles();
    function readFiles() {
        const dir = setMainDir();
        fs.readdir(setMainDir(), (err, items) => {
            for (let i = 0; i < items.length; i++) {
                const fullPath = path.join(dir, items[i]);
                if ((items[i].endsWith(".vsorg") || items[i].endsWith(".org")) && !items[i].startsWith(".")) {
                    let fileText;
                    try {
                        fileText = fs.readFileSync(path.join(setMainDir(), items[i]), "utf8");
                    } catch (err) { // don't die because of one broken symlink
                        console.error(err);
                        continue;
                    }
                    const match = fileText.match(/^\#\+TITLE:\s*(.*)$/mi);
                    if (match) {
                        const title = match[1].trim();
                        if (title && !listObject[title]) {
                            titles.push(title);
                            listObject[title] = fullPath;
                        }
                    }
                }
            }
            setQuickPick();
        });
    }
    function setQuickPick() {
        vscode.window.showQuickPick(titles.sort()).then((title) => {
            if (title && listObject[title]) {
                let fullpath = listObject[title];
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
            folder = path.join(homeDir, "VSOrgFiles");
        }
        else {
            folder = folderPath;
        }
        return folder;
    }
};
//# sourceMappingURL=titles.js.map