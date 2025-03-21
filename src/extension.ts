import * as vscode from "vscode";
import { viewAgenda } from "./agenda/agenda";
import { scheduleTask } from "./scheduling";
import { toggleKeywordRight } from "./keywordRight";
import { toggleKeywordLeft } from "./keywordLeft";
import { openCalendarView } from "./calendar";
import { moveBlockUp } from "./moveUp";
import { moveBlockDown } from "./moveDown";
import { incrementHeading } from "./incrementHeadings";
import { decrementHeading } from "./decrementHeadings";
import { changeDirectory } from "./changeDirectory";
import { createVsoFile } from "./newFile";
import { getTags } from "./tags";
import { getTitles } from "./titles";
import { updateDates } from "./updateDate";

const GO_MODE: vscode.DocumentFilter = { language: "vso", scheme: "file" };

class GoOnTypingFormatter implements vscode.OnTypeFormattingEditProvider {
    public provideOnTypeFormattingEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        ch: string,
        options: vscode.FormattingOptions,
        token: vscode.CancellationToken
    ): Thenable<vscode.TextEdit[]> {
        return new Promise((resolve) => {
            const { activeTextEditor } = vscode.window;
            if (activeTextEditor && activeTextEditor.document.languageId === "vso") {
                const { document } = activeTextEditor;
                let currentLine = document.lineAt(position);
                if (!/[⊙⊘⊖]/.test(currentLine.text) && currentLine.text.includes("*")) {
                    let numOfAsterisk = (currentLine.text.match(/\*/g) || []).length;
                    resolve([vscode.TextEdit.insert(position, " ".repeat(numOfAsterisk) + setUnicodeChar(numOfAsterisk))]);
                }
            }
        });
    }
}

function setUnicodeChar(asterisks: number): string {
    let characters = ["⊖ ", "⊙ ", "⊘ "];
    for (let i = 0; i < asterisks; i++) {
        characters.push(characters.shift()!);
    }
    return characters[0];
}

export function activate(ctx: vscode.ExtensionContext): void {
    vscode.commands.registerCommand("extension.viewAgenda", viewAgenda);
    vscode.commands.registerCommand("extension.scheduling", scheduleTask);
    vscode.commands.registerCommand("extension.toggleStatusRight", toggleKeywordRight);
    vscode.commands.registerCommand("extension.toggleStatusLeft", toggleKeywordLeft);
    vscode.commands.registerCommand("extension.openCalendarView", openCalendarView);
    vscode.commands.registerCommand("extension.moveBlockUp", moveBlockUp);
    vscode.commands.registerCommand("extension.moveBlockDown", moveBlockDown);
    vscode.commands.registerCommand("extension.increment", incrementHeading);
    vscode.commands.registerCommand("extension.decrement", decrementHeading);
    vscode.commands.registerCommand("extension.setFolderPath", changeDirectory);
    vscode.commands.registerCommand("extension.createVsoFile", createVsoFile);
    vscode.commands.registerCommand("extension.getTags", getTags);
    vscode.commands.registerCommand("extension.getTitles", getTitles);
    vscode.commands.registerCommand("extension.updateDates", updateDates);

    vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration("Org-vscode.dateFormat")) {
            vscode.commands.executeCommand("extension.updateDates");
        }
    });

    ctx.subscriptions.push(
        vscode.languages.registerOnTypeFormattingEditProvider(GO_MODE, new GoOnTypingFormatter(), " ")
    );
}
