const fs = require("fs");
const path = require("path");
const os = require("os");
const vscode = require("vscode");
const taskKeywordManager = require("./taskKeywordManager");

module.exports = function () {
    const config = vscode.workspace.getConfiguration("Org-vscode");
    const configPath = config.get("folderPath");
    const folderPath = configPath && configPath.trim() !== "" ? configPath : path.join(os.homedir(), "VSOrgFiles");
    const outputFilePath = path.join(folderPath, "CurrentTasks.org");

    const registry = taskKeywordManager.getWorkflowRegistry();
    const orgFiles = fs.readdirSync(folderPath).filter(f => f.endsWith(".org") && !f.startsWith(".") && f !== "CurrentTasks.org");

    let exportLines = [];

    for (const file of orgFiles) {
        const lines = fs.readFileSync(path.join(folderPath, file), "utf8").split(/\r?\n/);
        let fileHasExportedTasks = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const keyword = taskKeywordManager.findTaskKeyword(line);
            if (keyword && !registry.stampsClosed(keyword)) {
                // Add file header once per file
                if (!fileHasExportedTasks) {
                    exportLines.push(`##### Source: ${file} #####`);
                    fileHasExportedTasks = true;
                }

                const indentLevel = line.search(/\S/); // Number of leading spaces or tabs
                exportLines.push(line);

                // Add all child lines more indented
                let j = i + 1;
                while (j < lines.length && lines[j].search(/\S/) > indentLevel) {
                    exportLines.push(lines[j]);
                    j++;
                }

                exportLines.push(""); // Blank line between task blocks
                i = j - 1;
            }
        }
    }

    fs.writeFileSync(outputFilePath, exportLines.join("\n"), "utf8");

    vscode.window.showInformationMessage(`CurrentTasks.org created with ${exportLines.length} lines.`);
};
