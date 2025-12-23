"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");

const SYMBOLS = ["⊖", "⊙", "⊘", "⊜", "⊗"];

const mismatchPrompted = new Set();

module.exports = function incrementHeading() {
    rotateSymbol(1);
};

function rotateSymbol(step) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return;
    }

    const doc = editor.document;
    const docLang = doc.languageId;
    const docPath = (doc.uri && doc.uri.fsPath) ? doc.uri.fsPath : (doc.fileName || "");
    const isOrgVscodeFile = /\.(org|vsorg|vso)$/i.test(docPath);
    const isOrgVscodeLanguage = ["vso", "org", "vsorg", "org-vscode"].includes(docLang);
    if (!isOrgVscodeFile && !isOrgVscodeLanguage) {
        return;
    }

    const selections = (editor.selections && editor.selections.length)
        ? editor.selections
        : [editor.selection];
    const targetLines = new Set();
    for (const selection of selections) {
        if (selection.isEmpty) {
            targetLines.add(selection.active.line);
            continue;
        }
        const startLine = Math.min(selection.start.line, selection.end.line);
        let endLine = Math.max(selection.start.line, selection.end.line);
        if (selection.end.character === 0 && endLine > startLine) {
            endLine -= 1;
        }
        for (let line = startLine; line <= endLine; line++) {
            targetLines.add(line);
        }
    }
    const sortedLines = Array.from(targetLines).sort((a, b) => b - a);

    const config = vscode.workspace.getConfiguration("Org-vscode");
    const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");

    const document = editor.document;

    const edit = new vscode.WorkspaceEdit();
    let touched = false;

    for (const lineNumber of sortedLines) {
        const line = document.lineAt(lineNumber);
        const starParsed = parseStarLine(line.text);
        const unicodeParsed = parseLine(line.text);

        let updatedLine = null;

        if (headingMarkerStyle === "asterisks") {
            if (starParsed) {
                const { indent, stars, gap, rest } = starParsed;
                const nextStars = step > 0 ? `${stars}*` : (stars.length > 1 ? stars.slice(0, -1) : stars);
                const spacer = gap.length ? gap : " ";
                updatedLine = `${indent}${nextStars}${spacer}${rest}`;
            }
            else if (unicodeParsed) {
                maybePromptHeadingMarkerMismatch(document, "unicode", "asterisks");
                updatedLine = rotateUnicodeText(unicodeParsed, step, config);
            }
        }
        else {
            if (unicodeParsed) {
                updatedLine = rotateUnicodeText(unicodeParsed, step, config);
            }
            else if (starParsed) {
                maybePromptHeadingMarkerMismatch(document, "asterisks", "unicode");
                const { indent, stars, gap, rest } = starParsed;
                const nextStars = step > 0 ? `${stars}*` : (stars.length > 1 ? stars.slice(0, -1) : stars);
                const spacer = gap.length ? gap : " ";
                updatedLine = `${indent}${nextStars}${spacer}${rest}`;
            }
        }

        if (updatedLine && updatedLine !== line.text) {
            edit.replace(document.uri, line.range, updatedLine);
            touched = true;
        }
    }

    if (touched) {
        vscode.workspace.applyEdit(edit);
    }
}

function rotateUnicodeText(parsed, step, config) {
    const { indent, symbol, gap, rest } = parsed;
    const index = SYMBOLS.indexOf(symbol);
    if (index === -1) {
        return null;
    }

    const nextSymbol = SYMBOLS[(index + step + SYMBOLS.length) % SYMBOLS.length];
    const spacesPerLevelRaw = config.get("adjustHeadingIndentation", 2);
    const spacesPerLevel = typeof spacesPerLevelRaw === "boolean"
        ? (spacesPerLevelRaw ? 2 : 0)
        : Math.max(0, Math.floor(Number(spacesPerLevelRaw) || 0));
    const adjustedIndent = spacesPerLevel > 0 ? adjustIndent(indent, step, spacesPerLevel) : indent;
    const spacer = gap.length ? gap : " ";
    return `${adjustedIndent}${nextSymbol}${spacer}${rest}`;
}

function maybePromptHeadingMarkerMismatch(document, detectedStyle, settingStyle) {
    const key = `${document.uri.toString()}|${detectedStyle}|${settingStyle}`;
    if (mismatchPrompted.has(key)) {
        return;
    }
    mismatchPrompted.add(key);

    vscode.window
        .showInformationMessage(
        `This file appears to use ${detectedStyle === "asterisks" ? "* headings" : "Unicode headings"}, but Org-vscode.headingMarkerStyle is set to '${settingStyle}'.`,
        "Open Setting"
    )
        .then((choice) => {
        if (choice === "Open Setting") {
            vscode.commands.executeCommand("workbench.action.openSettings", "Org-vscode.headingMarkerStyle");
        }
    });
}

function parseLine(text) {
    const match = text.match(/^(\s*)([⊖⊙⊘⊜⊗])(.*)$/);
    if (!match) {
        return null;
    }

    const indent = match[1];
    const symbol = match[2];
    const remainder = match[3];
    const gapMatch = remainder.match(/^(\s*)(.*)$/);
    const gap = gapMatch ? gapMatch[1] : "";
    const rest = gapMatch ? gapMatch[2] : remainder;
    return { indent, symbol, gap, rest };
}

function adjustIndent(indent, step, spacesPerLevel) {
    const chunk = " ".repeat(spacesPerLevel);
    if (step > 0) {
        return indent + chunk;
    }
    if (step < 0) {
        return indent.length >= spacesPerLevel ? indent.slice(0, indent.length - spacesPerLevel) : "";
    }
    return indent;
}

function parseStarLine(text) {
    const match = text.match(/^(\s*)(\*+)(.*)$/);
    if (!match) {
        return null;
    }

    const indent = match[1];
    const stars = match[2];
    const remainder = match[3];
    const gapMatch = remainder.match(/^(\s*)(.*)$/);
    const gap = gapMatch ? gapMatch[1] : "";
    const rest = gapMatch ? gapMatch[2] : remainder;
    return { indent, stars, gap, rest };
}