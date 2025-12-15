"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vscode = require("vscode");

const SYMBOLS = ["⊖", "⊙", "⊘", "⊜", "⊗"];

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

    if (headingMarkerStyle === "asterisks") {
        const starParsed = parseStarLine(line.text);
        if (!starParsed) {
            return;
        }

        const { indent, stars, gap, rest } = starParsed;
        const nextStars = step > 0 ? `${stars}*` : (stars.length > 1 ? stars.slice(0, -1) : stars);
        const spacer = gap.length ? gap : " ";
        const updatedLine = `${indent}${nextStars}${spacer}${rest}`;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, line.range, updatedLine);
        vscode.workspace.applyEdit(edit);
        return;
    }
    const parsed = parseLine(line.text);
    if (!parsed) {
        return;
    }

    const { indent, symbol, gap, rest } = parsed;
    const index = SYMBOLS.indexOf(symbol);
    if (index === -1) {
        return;
    }

    const nextSymbol = SYMBOLS[(index + step + SYMBOLS.length) % SYMBOLS.length];
    const adjustIndentation = config.get("adjustHeadingIndentation", true);
    const adjustedIndent = adjustIndentation ? adjustIndent(indent, step) : indent;
    const spacer = gap.length ? gap : " ";
    const updatedLine = `${adjustedIndent}${nextSymbol}${spacer}${rest}`;

    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, line.range, updatedLine);
    vscode.workspace.applyEdit(edit);
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

function adjustIndent(indent, step) {
    if (step > 0) {
        return indent + "  ";
    }
    if (step < 0) {
        return indent.length >= 2 ? indent.slice(0, indent.length - 2) : "";
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