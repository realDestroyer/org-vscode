"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createVsoFile = createVsoFile;
const vscode = require("vscode");
const path = require("path");
const os = require("os");
const fs = require("fs-extra");
const showMessage_1 = require("./showMessage");
function createVsoFile() {
    let config = vscode.workspace.getConfiguration("Org-vscode");
    let folderPath = config.get("folderPath") || "";
    let extension = ".org";
    let createFileError = new showMessage_1.WindowMessage("error", "Could not create new file, make sure you have your directory set. Org-vscode: Change Org-vscode Directory.", false, false);
    vscode.window
        .showInputBox({
        placeHolder: "Enter in File Name.",
        prompt: "This file will be saved in your configured Org-vscode directory."
    })
        .then(async (setName) => {
        if (!setName)
            return;
        let fileName = setName;
        try {
            const fullPath = await createFile(setMainDir(), fileName);
            vscode.window.showTextDocument(vscode.Uri.file(fullPath), {
                preserveFocus: false,
                preview: false
            });
        }
        catch {
            createFileError.showMessage();
        }
    });
    // Create the given file if it doesn't exist
    async function createFile(folderPath, fileName) {
        let fullPath = path.join(folderPath, fileName + extension);
        await fs.ensureFile(fullPath);
        return fullPath;
    }
    // Check to see if the folder path in settings was changed
    function setMainDir() {
        return folderPath.trim() !== "" ? folderPath : path.join(os.homedir(), "OrgFiles");
    }
}
//# sourceMappingURL=newFile.js.map