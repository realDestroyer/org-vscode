"use strict";
const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");

module.exports = function () {
    let config = vscode.workspace.getConfiguration("Org-vscode");
    let folderPath = config.get("folderPath");
    let folder;
    let tagMap = {};
    let tagList = [];

    readFiles();

    function readFiles() {
        fs.readdir(setMainDir(), (err, items) => {
            if (err) return vscode.window.showErrorMessage("Failed to read Org directory.");

            items.filter(file => file.endsWith(".org") || file.endsWith(".vsorg")).forEach(file => {
                const filePath = path.join(setMainDir(), file);
                const fileText = fs.readFileSync(filePath, "utf-8");

                const match = fileText.match(/^\#\+TAGS:(.*)$/m);
                if (match) {
                    const rawTags = match[1].split(",").map(tag => tag.trim().toUpperCase()).filter(Boolean);
                    rawTags.forEach(tag => {
                        if (!tagList.includes(tag)) tagList.push(tag);
                        if (!tagMap[tag]) tagMap[tag] = [];
                        if (!tagMap[tag].includes(file)) tagMap[tag].push(file);
                    });
                }
            });

            setQuickPick();
        });
    }

    function setQuickPick() {
        vscode.window.showQuickPick(tagList.sort()).then(selectedTag => {
            if (selectedTag && tagMap[selectedTag]) {
                vscode.window.showQuickPick(tagMap[selectedTag]).then(file => {
                    if (file) {
                        const fullPath = path.join(setMainDir(), file);
                        vscode.workspace.openTextDocument(vscode.Uri.file(fullPath)).then(doc => {
                            vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside, true);
                        });
                    }
                });
            }
        });
    }

    function setMainDir() {
        if (!folderPath || folderPath.trim() === "") {
            let home = os.homedir();
            return os.platform() === "win32" ? path.join(home, "VSOrgFiles") : path.join(home, "VSOrgFiles");
        }
        return folderPath;
    }
};
