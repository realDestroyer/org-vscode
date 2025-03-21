import * as vscode from "vscode";
import * as path from "path";

export function changeDirectory(): void {
    vscode.window
        .showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: "Set As Org-vscode Folder"
        })
        .then((response) => {
            if (!response || response.length === 0) return;
            const folderPath = path.normalize(response[0].fsPath);

            vscode.workspace
                .getConfiguration("vsorg")
                .update("folderPath", folderPath, vscode.ConfigurationTarget.Global)
                .then(() => {
                    vscode.window.showInformationMessage(`Org-vscode: ${folderPath} set as directory`);
                });
        });
}
