"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeDirectory = changeDirectory;
const vscode = require("vscode");
const path = require("path");
function changeDirectory() {
    vscode.window
        .showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        canSelectMany: false,
        openLabel: "Set As Org-vscode Folder"
    })
        .then((response) => {
        if (!response || response.length === 0)
            return;
        const folderPath = path.normalize(response[0].fsPath);
        vscode.workspace
            .getConfiguration("vsorg")
            .update("folderPath", folderPath, vscode.ConfigurationTarget.Global)
            .then(() => {
            vscode.window.showInformationMessage(`Org-vscode: ${folderPath} set as directory`);
        });
    });
}
//# sourceMappingURL=changeDirectory.js.map