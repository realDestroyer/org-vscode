import * as vscode from 'vscode';
import * as path from 'path';

module.exports = function() {
  vscode.window
    .showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: "Set As Org-vscode Folder"
    })
    .then((response: any) => {
      vscode.workspace
        .getConfiguration("vsorg")
        .update("folderPath", path.normalize(response[0].fsPath), true)
        .then(() => {
          vscode.window.showInformationMessage("Org-vscode: " + response[0].fsPath + " set as directory");
        });
    });
};
