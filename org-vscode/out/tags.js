"use strict";

const vscode = require("vscode");
const path = require("path");
const fs = require("fs");
const os = require("os");

// Entry point - exposed as the command `extension.getTags`
module.exports = function () {
    let config = vscode.workspace.getConfiguration("Org-vscode");
    let folderPath = config.get("folderPath");

    let tagMap = {};  // Maps each tag to a list of {title, filePath}
    let tagList = []; // Unique tag names (uppercase) for QuickPick list

    readFiles(); // Begin file scan

    /**
     * Reads all .org/.vsorg files, extracting titles and tags, mapping them to {title, filePath}
     */
    function readFiles() {
        const dir = setMainDir();
        let items;
        try {
            items = fs.readdirSync(dir);
        } catch (err) {
            vscode.window.showErrorMessage("Failed to read Org directory.");
            return;
        }

        items
          .filter(file => (file.endsWith(".org") || file.endsWith(".vsorg")) && !file.startsWith("."))
          .forEach(file => {
            const filePath = path.join(dir, file);
            let fileText;
            try {
                fileText = fs.readFileSync(filePath, "utf-8");
            } catch (err) { // don't die because of one broken symlink
                console.error(err);
                return;
            }

            // Get title
            const titleMatch = fileText.match(/^\#\+TITLE:\s*(.*)$/mi);
            const title = titleMatch ? titleMatch[1].trim() : file;

            // Look for file-level tags only. In Org-mode, #+FILETAGS are inherited by all entries in the file.
            // Note: #+TAGS is primarily used to define/configure allowed tags (completion, keys, groups), not to tag the file.
            const match = fileText.match(/^\#\+FILETAGS:\s*(.*)$/mi);
            if (match) {
                const tagString = match[1];
                const rawTags = tagString
                  .split(/[:,]/)
                  .map(tag => tag.trim().toUpperCase())
                  .filter(Boolean);

                rawTags.forEach(tag => {
                    if (!tagList.includes(tag)) tagList.push(tag);
                    if (!tagMap[tag]) tagMap[tag] = [];
                    tagMap[tag].push({ title, filePath });
                });
            }
        });

        setQuickPick();
    }

    /**
     * Prompts user to select a tag, then shows all files with that tag by title
     */
    function setQuickPick() {
        vscode.window.showQuickPick(tagList.sort()).then(selectedTag => {
            if (selectedTag && tagMap[selectedTag]) {
                const items = tagMap[selectedTag].map(f => ({
                    label: f.title,
                    filePath: f.filePath
                }));
                vscode.window.showQuickPick(items).then(selected => {
                    if (selected) {
                        vscode.workspace.openTextDocument(vscode.Uri.file(selected.filePath)).then(doc => {
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
