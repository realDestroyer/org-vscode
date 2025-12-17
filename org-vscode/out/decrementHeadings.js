"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");

const SYMBOLS = ["⊖", "⊙", "⊘", "⊜", "⊗"];

const mismatchPrompted = new Set();

module.exports = function decrementHeading() {
    rotateSymbol(-1);
};

function rotateSymbol(step) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== "vso") {
        return;
    }

    const config = vscode.workspace.getConfiguration("Org-vscode");
    const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");

    const document = editor.document;
    const lineNumber = editor.selection.active.line;
    const line = document.lineAt(lineNumber);

    const starParsed = parseStarLine(line.text);
    const unicodeParsed = parseLine(line.text);

    if (headingMarkerStyle === "asterisks") {
        if (starParsed) {
            const { indent, stars, gap, rest } = starParsed;
            const nextStars = step > 0 ? `${stars}*` : (stars.length > 1 ? stars.slice(0, -1) : stars);
            const spacer = gap.length ? gap : " ";
            const updatedLine = `${indent}${nextStars}${spacer}${rest}`;

            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, line.range, updatedLine);
            vscode.workspace.applyEdit(edit);
            return;
        }

        if (unicodeParsed) {
            maybePromptHeadingMarkerMismatch(document, "unicode", "asterisks");
            rotateUnicode(document, line, unicodeParsed, step, config);
        }
        return;
    }

    if (unicodeParsed) {
        rotateUnicode(document, line, unicodeParsed, step, config);
        return;
    }

    if (starParsed) {
        maybePromptHeadingMarkerMismatch(document, "asterisks", "unicode");
        const { indent, stars, gap, rest } = starParsed;
        const nextStars = step > 0 ? `${stars}*` : (stars.length > 1 ? stars.slice(0, -1) : stars);
        const spacer = gap.length ? gap : " ";
        const updatedLine = `${indent}${nextStars}${spacer}${rest}`;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, line.range, updatedLine);
        vscode.workspace.applyEdit(edit);
    }
}

function rotateUnicode(document, line, parsed, step, config) {
    const { indent, symbol, gap, rest } = parsed;
    const index = SYMBOLS.indexOf(symbol);
    if (index === -1) {
        return;
    }

    const nextSymbol = SYMBOLS[(index + step + SYMBOLS.length) % SYMBOLS.length];
    const spacesPerLevelRaw = config.get("adjustHeadingIndentation", 2);
    const spacesPerLevel = typeof spacesPerLevelRaw === "boolean"
        ? (spacesPerLevelRaw ? 2 : 0)
        : Math.max(0, Math.floor(Number(spacesPerLevelRaw) || 0));
    const adjustedIndent = spacesPerLevel > 0 ? adjustIndent(indent, step, spacesPerLevel) : indent;
    const spacer = gap.length ? gap : " ";
    const updatedLine = `${adjustedIndent}${nextSymbol}${spacer}${rest}`;

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, line.range, updatedLine);
    vscode.workspace.applyEdit(edit);
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