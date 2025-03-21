import * as vscode from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs-extra";
import { WindowMessage } from "./showMessage";

export function createVsoFile(): void {
    let config = vscode.workspace.getConfiguration("Org-vscode");
    let folderPath = config.get<string>("folderPath") || "";
    let extension = ".org";

    let createFileError = new WindowMessage(
        "error",
        "Could not create new file, make sure you have your directory set. Org-vscode: Change Org-vscode Directory.",
        false,
        false
    );

    vscode.window
        .showInputBox({
            placeHolder: "Enter in File Name.",
            prompt: "This file will be saved in your configured Org-vscode directory."
        })
        .then(async (setName) => {
            if (!setName) return;

            let fileName = setName;
            try {
                const fullPath = await createFile(setMainDir(), fileName);
                vscode.window.showTextDocument(vscode.Uri.file(fullPath), {
                    preserveFocus: false,
                    preview: false
                });
            } catch {
                createFileError.showMessage();
            }
        });

    // Create the given file if it doesn't exist
    async function createFile(folderPath: string, fileName: string): Promise<string> {
        let fullPath = path.join(folderPath, fileName + extension);
        await fs.ensureFile(fullPath);
        return fullPath;
    }

    // Check to see if the folder path in settings was changed
    function setMainDir(): string {
        return folderPath.trim() !== "" ? folderPath : path.join(os.homedir(), "OrgFiles");
    }
}
