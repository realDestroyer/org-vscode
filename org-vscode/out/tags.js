"use strict";

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Entry point - exposed as the command `extension.getTags`
module.exports = function () {
    let config = vscode.workspace.getConfiguration("Org-vscode");
    let folderPath = config.get("folderPath");

    let tagMap = {};  // Maps each tag to a list of files it's found in
    let tagList = []; // Unique tag names (uppercase) for QuickPick list

    readFiles(); // Begin file scan

    /**
     * Reads all .org/.vsorg files, extracting `#+TAGS:` headers and mapping them to filenames
     */
    function readFiles() {
        fs.readdir(setMainDir(), (err, items) => {
            if (err) return vscode.window.showErrorMessage("Failed to read Org directory.");

            items
              .filter(file => (file.endsWith(".org") || file.endsWith(".vsorg")) && !file.startsWith("."))
              .forEach(file => {
                const filePath = path.join(setMainDir(), file);
                let fileText;
                try {
                    fileText = fs.readFileSync(filePath, "utf-8");
                } catch (err) { // don't die because of one broken symlink
                    console.error(err);
                    return;
                }

                // Look for #+TAGS: or #+FILETAGS:
                const match = fileText.match(/^\#\+(FILE)?TAGS:\s*(.*)$/mi);
                if (match) {
                    const tagString = match[2];
                    // Handle both comma-separated (#+TAGS: a, b) and colon-separated (#+FILETAGS: :a:b:)
                    const rawTags = tagString
                      .split(/[:,]/)
                      .map(tag => tag.trim().toUpperCase())
                      .filter(Boolean);

                    rawTags.forEach(tag => {
                        if (!tagList.includes(tag)) tagList.push(tag); // Keep tag unique
                        if (!tagMap[tag]) tagMap[tag] = [];
                        if (!tagMap[tag].includes(file)) tagMap[tag].push(file);
                    });
                }
            });

            setQuickPick(); // Launch tag selection UI
        });
    }

    /**
     * Prompts user to select a tag, then shows all files that contain that tag
     */
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

    /**
     * Resolves the working folder path from user config or defaults to ~/VSOrgFiles
     */
    function setMainDir() {
        return folderPath && folderPath.trim() !== ""
            ? folderPath
            : path.join(os.homedir(), "VSOrgFiles");
    }
};
