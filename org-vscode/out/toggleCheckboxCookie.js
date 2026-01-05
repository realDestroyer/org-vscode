"use strict";

const { findCheckboxCookie } = require("./checkboxStats");

const HEADING_LINE_REGEX = /^(\s*)(\*+|[⊙⊘⊜⊖⊗])\s+\S/;
const LIST_ITEM_LINE_REGEX = /^\s*[-+*]\s+/;
// Org headline tags are like: " :WORK:HOME:" (single leading ':' and each tag ends with ':').
const TRAILING_TAGS_REGEX = /\s+:(?:[^:\s]+:)+\s*$/;

function isHeadingLine(text) {
  return HEADING_LINE_REGEX.test(String(text || ""));
}

function isListItemLine(text) {
  return LIST_ITEM_LINE_REGEX.test(String(text || ""));
}

function findNearestHeadingLine(document, fromLine) {
  for (let i = Math.max(0, fromLine); i >= 0; i--) {
    const lineText = document.lineAt(i).text;
    if (isHeadingLine(lineText)) return i;
  }
  return null;
}

function upsertCheckboxCookieInHeadline(lineText, mode) {
  const s = String(lineText || "");
  const cookie = findCheckboxCookie(s);
  const placeholder = String(mode || "fraction").toLowerCase() === "percent" ? "[%]" : "[/]";

  // Respect trailing :TAGS: by inserting before them.
  const tagsMatch = s.match(TRAILING_TAGS_REGEX);
  const tagsStart = tagsMatch && typeof tagsMatch.index === "number" ? tagsMatch.index : null;

  if (cookie) {
    // Replace cookie in place (keeps it before tags if that's where it already is).
    return s.slice(0, cookie.start) + placeholder + s.slice(cookie.end);
  }

  if (tagsStart != null) {
    const beforeTags = s.slice(0, tagsStart).replace(/\s*$/, "");
    const tags = s.slice(tagsStart);
    return `${beforeTags} ${placeholder}${tags}`;
  }

  return `${s.replace(/\s*$/, "")} ${placeholder}`;
}

function removeCheckboxCookieFromHeadline(lineText) {
  const s = String(lineText || "");
  const cookie = findCheckboxCookie(s);
  if (!cookie) return s;

  // Remove cookie and collapse extra spaces.
  return (s.slice(0, cookie.start) + s.slice(cookie.end))
    .replace(/\s{2,}/g, " ")
    .replace(/\s+(:[^:\s]+:)+\s*$/, (m) => m.replace(/^\s+/, " "))
    .trimRight();
}

async function toggleCheckboxCookie() {
  const vscode = require("vscode");
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.document || editor.document.languageId !== "vso") {
    return;
  }

  const doc = editor.document;
  const activeLineNumber = editor.selection.active.line;
  const activeLineText = doc.lineAt(activeLineNumber).text;

  let targetLineNumber = null;
  if (isHeadingLine(activeLineText) || isListItemLine(activeLineText)) {
    targetLineNumber = activeLineNumber;
  } else {
    targetLineNumber = findNearestHeadingLine(doc, activeLineNumber);
  }

  if (targetLineNumber == null) {
    vscode.window.showInformationMessage("No heading found above cursor.");
    return;
  }

  const line = doc.lineAt(targetLineNumber);
  const currentText = line.text;
  const cookie = findCheckboxCookie(currentText);

  /** @type {Array<{label: string, description?: string, action: string, mode?: 'fraction'|'percent'}>} */
  let items;

  if (!cookie) {
    items = [
      { label: "Insert statistics cookie: [/]", description: "Shows fraction stats on this heading", action: "insert", mode: "fraction" },
      { label: "Insert statistics cookie: [%]", description: "Shows percent stats on this heading", action: "insert", mode: "percent" }
    ];
  } else {
    items = [
      { label: "Remove checkbox cookie", description: "Stops showing checkbox stats on this heading", action: "remove" },
      { label: "Switch cookie to [/]", description: "Fraction style", action: "switch", mode: "fraction" },
      { label: "Switch cookie to [%]", description: "Percent style", action: "switch", mode: "percent" }
    ];
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: cookie ? `Checkbox cookie detected (${cookie.raw}). Choose action.` : "No checkbox cookie detected. Choose cookie style to insert."
  });

  if (!picked) return;

  let nextText = currentText;

  if (picked.action === "remove") {
    nextText = removeCheckboxCookieFromHeadline(currentText);
  } else {
    nextText = upsertCheckboxCookieInHeadline(currentText, picked.mode);
  }

  if (nextText === currentText) return;

  await editor.edit((eb) => {
    eb.replace(line.range, nextText);
  });
}

module.exports = {
  toggleCheckboxCookie,
  upsertCheckboxCookieInHeadline,
  removeCheckboxCookieFromHeadline
};
