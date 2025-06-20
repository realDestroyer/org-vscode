"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
const os = require("os");
const fs = require('fs-extra');
const showMessage_1 = require("./showMessage");
module.exports = function () {
    //get the name of the new file
    let config = vscode.workspace.getConfiguration("Org-vscode");
    let folderPath = config.get("folderPath") || "";
    let extension = ".org";
    let folder;
    let createFileError = new showMessage_1.WindowMessage("error", "Could not create new file, make sure you have your directory set. Org-vscode: Change Org-vscode Directory.", false, false);
    vscode.window
        .showInputBox({
        placeHolder: "Enter in File Name.",
        prompt: "This file will be saved in your Documents folder."
    })
        .then((setName) => {
        if (setName == null || !setName) {
            return false;
        }
        let fileName = setName;
        //create new file
        createFile(setMainDir(), fileName)
            .then(path => {
            if (typeof path !== "string") {
                return false;
            }
            vscode.window.showTextDocument(vscode.Uri.file(path), {
                preserveFocus: false,
                preview: false
            });
        })
            .catch(err => {
            createFileError.showMessage();
        });
    });
    // Create the given file if it doesn't exist
    function createFile(folderPath, fileName) {
        return new Promise((resolve, reject) => {
            if (folderPath == null || fileName == null) {
                reject();
            }
            let fullPath = path.join(folderPath, fileName + extension);
            // fs-extra
            fs.ensureFile(fullPath).then(() => {
                resolve(fullPath);
            });
        });
    }
    //check to see if the folder path in settings was changed
    function setMainDir() {
        if (folderPath === "") {
            let homeDir = os.homedir();
            folder = homeDir + "\\OrgFiles";
        }
        else {
            folder = folderPath;
        }
        return folder;
    }
};
//# sourceMappingURL=newFile.js.map