import * as vscode from "vscode";
import * as path from 'path';
import * as os from 'os';
const fs = require('fs-extra');
import { WindowMessage } from "./showMessage";
module.exports = function () {

  //get the name of the new file
  let config = vscode.workspace.getConfiguration("Org-vscode");
  let folderPath = config.get<string>("folderPath") || "";
  let extension = ".org";
  let folder: any;

  let createFileError = new WindowMessage("error", "Could not create new file, make sure you have your directory set. Org-vscode: Change Org-vscode Directory.", false, false);

  vscode.window
    .showInputBox({
      placeHolder: "Enter in File Name.",
      prompt: "This file will be saved in your Documents folder."
    })
    .then((setName: any) => {
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
  function createFile(folderPath: any, fileName: any) {
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
    } else {
      folder = folderPath;
    }
    return folder;
  }

};
