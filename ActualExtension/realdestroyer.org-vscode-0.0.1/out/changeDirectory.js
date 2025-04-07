"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");
const path = require("path");
module.exports = function () {
    vscode.window
        .showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Set As Org-vscode Folder"
    })
        .then((response) => {
        vscode.workspace
            .getConfiguration("Org-vscode")
            .update("folderPath", path.normalize(response[0].fsPath), true)
            .then(() => {
            vscode.window.showInformationMessage("Org-vscode: " + response[0].fsPath + " set as directory");
        });
    });
};
//# sourceMappingURL=changeDirectory.js.map