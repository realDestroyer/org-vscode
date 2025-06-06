"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const showMessage_1 = require("./showMessage");
const vscode = require("vscode");
const fs = require("fs");
const os = require("os");
module.exports = function () {
    let config = vscode.workspace.getConfiguration("vsorg");
    let folderPath = config.get("folderPath");
    let folder;
    let getDateFromTaskText;
    let dateSplit;
    let newText;
    fs.readdir(setMainDir(), (err, items) => {
        for (let i = 0; i < items.length; i++) {
            //make sure its a vsorg file
            if (items[i].includes(".vsorg")) {
                let fileText;
                if (os.platform() === "darwin" || os.platform() === "linux") {
                    fileText = fs
                        .readFileSync(setMainDir() + "/" + items[i])
                        .toString()
                        .split(/\r?\n/);
                }
                else {
                    fileText = fs
                        .readFileSync(setMainDir() + "\\" + items[i])
                        .toString()
                        .split(/\r?\n/);
                }
                for (let i = 0; i < fileText.length; i++) {
                    if (fileText[i].includes("SCHEDULED")) {
                        getDateFromTaskText = fileText[i].match(/\[(.*)\]/);
                        dateSplit = getDateFromTaskText[1].split('-');
                        var b = dateSplit[1];
                        dateSplit[1] = dateSplit[0];
                        dateSplit[0] = b;
                        dateSplit.splice(1, 0, "-");
                        dateSplit.splice(3, 0, "-");
                        newText = fileText[i].replace(/\[(.*)\]/, "[" + dateSplit.join("") + "]");
                        fileText[i] = fileText[i].replace(fileText[i], newText);
                    }
                }
                let fileTextNew = fileText.join('\r\n');
                if (os.platform() === "darwin" || os.platform() === "linux") {
                    fs.writeFile(setMainDir() + "/" + items[i], fileTextNew, function (err) {
                        if (err) {
                            return console.log(err);
                        }
                        console.log("The file was saved!");
                    });
                }
                else {
                    fs.writeFileSync(setMainDir() + "\\" + items[i], fileTextNew);
                }
            }
        }
        new showMessage_1.WindowMessage("information", "All SCHEDULED dates have been updated to the new date format.", false, false).showMessage();
    });
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
//# sourceMappingURL=updateDate.js.map