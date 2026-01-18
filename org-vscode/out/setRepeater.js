"use strict";

const vscode = require("vscode");

const { isPlanningLine, normalizeTagsAfterPlanning, DAY_HEADING_REGEX, getTaskPrefixRegex, SCHEDULED_REGEX, DEADLINE_REGEX } = require("./orgTagUtils");

function normalizeRepeaterToken(token) {
  const t = String(token || "").trim();
  if (!t) return null;
  if (!/^\+\+\d+[dwmy]$/.test(t) && !/^\+\d+[dwmy]$/.test(t) && !/^\.\+\d+[dwmy]$/.test(t)) return null;
  return t;
}

function stripExistingRepeaters(rest) {
  const r = String(rest || "").trim();
  if (!r) return "";
  // Remove tokens like +1w, ++2m, .+3d
  const cleaned = r.replace(/(^|\s)(?:\+\+|\+|\.\+)\d+[dwmy](?=\s|$)/g, " ").replace(/\s{2,}/g, " ").trim();
  return cleaned;
}

function setRepeaterInTimestampContent(content, repeaterTokenOrNull) {
  const t = String(content || "").trim();
  // date [day] [time] [rest...]
  const m = t.match(/^(\d{2,4}-\d{2}-\d{2,4})(?:\s+([A-Za-z]{3}))?(?:\s+(\d{1,2}:\d{2})(?:-(\d{1,2}:\d{2}))?)?(?:\s+(.*))?$/);
  if (!m) return t;

  const date = m[1];
  const day = m[2] || null;
  const timeStart = m[3] || null;
  const timeEnd = m[4] || null;
  const time = timeStart ? (timeEnd ? `${timeStart}-${timeEnd}` : timeStart) : null;
  const rest = m[5] || "";

  const base = [date, day, time].filter(Boolean).join(" ");
  const restNoRepeat = stripExistingRepeaters(rest);

  if (!repeaterTokenOrNull) {
    return [base, restNoRepeat].filter((x) => String(x || "").trim().length).join(" ");
  }

  if (!restNoRepeat) return `${base} ${repeaterTokenOrNull}`;
  return `${base} ${restNoRepeat} ${repeaterTokenOrNull}`;
}

function replacePlanningStamp(lineText, which, repeaterTokenOrNull) {
  let text = String(lineText || "");

  function buildExistingFromRegexGroups(date, weekday, timeStart, timeEnd, repeater, warning) {
    const time = timeStart ? (timeEnd ? `${timeStart}-${timeEnd}` : timeStart) : null;
    const restParts = [];
    if (repeater) restParts.push(repeater);
    if (warning) restParts.push(warning);
    return [date, weekday, time, ...restParts].filter(Boolean).join(" ");
  }

  if (which === "SCHEDULED" || which === "BOTH") {
    if (SCHEDULED_REGEX.test(text)) {
      // Regex groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start, (5) time-end, (6) repeater, (7) warning, (8) close-bracket
      text = text.replace(SCHEDULED_REGEX, (full, openBracket, date, weekday, timeStart, timeEnd, repeater, warning) => {
        const existing = buildExistingFromRegexGroups(date, weekday, timeStart, timeEnd, repeater, warning);
        const updated = setRepeaterInTimestampContent(existing, repeaterTokenOrNull);
        // In Emacs: SCHEDULED uses active <...>
        return `SCHEDULED: <${updated}>`;
      });
    }
  }

  if (which === "DEADLINE" || which === "BOTH") {
    if (DEADLINE_REGEX.test(text)) {
      // Regex groups: (1) open-bracket, (2) date, (3) dayname, (4) time-start, (5) time-end, (6) repeater, (7) warning, (8) close-bracket
      text = text.replace(DEADLINE_REGEX, (full, openBracket, date, weekday, timeStart, timeEnd, repeater, warning) => {
        const existing = buildExistingFromRegexGroups(date, weekday, timeStart, timeEnd, repeater, warning);
        const updated = setRepeaterInTimestampContent(existing, repeaterTokenOrNull);
        // In Emacs: DEADLINE uses active <...>
        return `DEADLINE: <${updated}>`;
      });
    }
  }

  return text;
}

async function pickRepeaterToken() {
  const items = [
    { label: "+1d", description: "repeat every day" },
    { label: "+1w", description: "repeat every week" },
    { label: "+1m", description: "repeat every month" },
    { label: "+1y", description: "repeat every year" },
    { label: "++1w", description: "catch up into the future" },
    { label: ".+1m", description: "from today (completion date)" },
    { label: "Custom...", description: "enter +N[dwmy] / ++N[dwmy] / .+N[dwmy]" },
    { label: "Remove repeater", description: "strip any existing repeater token" }
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Choose a repeater"
  });
  if (!picked) return { token: null, cancelled: true, remove: false };

  if (picked.label === "Remove repeater") return { token: null, cancelled: false, remove: true };

  if (picked.label === "Custom...") {
    const entered = await vscode.window.showInputBox({
      prompt: "Enter repeater token",
      placeHolder: "Examples: +1w, ++2m, .+1m"
    });
    if (entered == null) return { token: null, cancelled: true, remove: false };

    const normalized = normalizeRepeaterToken(entered);
    if (!normalized) {
      await vscode.window.showWarningMessage("Invalid repeater. Use +N[dwmy], ++N[dwmy], or .+N[dwmy].");
      return { token: null, cancelled: true, remove: false };
    }

    return { token: normalized, cancelled: false, remove: false };
  }

  return { token: picked.label, cancelled: false, remove: false };
}

async function pickWhichStamp(defaultChoice) {
  const items = [
    { label: "SCHEDULED", description: "apply to SCHEDULED" },
    { label: "DEADLINE", description: "apply to DEADLINE" },
    { label: "BOTH", description: "apply to both" }
  ];

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: "Apply repeater to…"
  });

  if (!picked) return defaultChoice || null;
  return picked.label;
}

module.exports = async function () {
  const { activeTextEditor } = vscode.window;
  if (!activeTextEditor || activeTextEditor.document.languageId !== "vso") return;

  const { document } = activeTextEditor;
  const selections = (activeTextEditor.selections && activeTextEditor.selections.length)
    ? activeTextEditor.selections
    : [activeTextEditor.selection];

  const dayHeadingRegex = DAY_HEADING_REGEX;
  const taskPrefixRegex = getTaskPrefixRegex();

  const targetLines = new Set();
  let hasRangeSelection = false;

  for (const selection of selections) {
    if (selection.isEmpty) {
      targetLines.add(selection.active.line);
      continue;
    }

    hasRangeSelection = true;
    const startLine = Math.min(selection.start.line, selection.end.line);
    let endLine = Math.max(selection.start.line, selection.end.line);
    if (selection.end.character === 0 && endLine > startLine) {
      endLine -= 1;
    }

    for (let line = startLine; line <= endLine; line++) {
      const lineText = document.lineAt(line).text;
      if (taskPrefixRegex.test(lineText) && !dayHeadingRegex.test(lineText)) {
        targetLines.add(line);
      }
    }
  }

  const sortedLines = Array.from(targetLines).sort((a, b) => b - a);
  if (sortedLines.length === 0) {
    vscode.window.showWarningMessage("No task lines found to set a repeater on.");
    return;
  }

  const { token, cancelled, remove } = await pickRepeaterToken();
  if (cancelled) return;

  const repeaterTokenOrNull = remove ? null : token;

  // Default the target based on what's present on the first line.
  const firstLine = document.lineAt(sortedLines[sortedLines.length - 1]).text;
  const firstNext = (sortedLines[sortedLines.length - 1] + 1 < document.lineCount)
    ? document.lineAt(sortedLines[sortedLines.length - 1] + 1).text
    : "";

  const firstHasScheduled = firstLine.includes("SCHEDULED:") || (isPlanningLine(firstNext) && firstNext.includes("SCHEDULED:"));
  const firstHasDeadline = firstLine.includes("DEADLINE:") || (isPlanningLine(firstNext) && firstNext.includes("DEADLINE:"));

  const defaultWhich = firstHasScheduled && !firstHasDeadline
    ? "SCHEDULED"
    : (!firstHasScheduled && firstHasDeadline
      ? "DEADLINE"
      : "BOTH");

  const which = await pickWhichStamp(defaultWhich);
  if (!which) return;

  const edit = new vscode.WorkspaceEdit();
  let touched = 0;

  for (const lineNumber of sortedLines) {
    const line = document.lineAt(lineNumber);
    const nextLine = (lineNumber + 1 < document.lineCount) ? document.lineAt(lineNumber + 1) : null;

    // Skip day headings explicitly.
    if (dayHeadingRegex.test(line.text)) continue;

    // Update whichever line contains the relevant stamps.
    // Prefer planning line (immediate next line) but also support legacy inline planning on the headline.
    const candidateLines = [];
    if (nextLine && isPlanningLine(nextLine.text)) candidateLines.push(nextLine);
    candidateLines.push(line);

    for (const targetLine of candidateLines) {
      const before = targetLine.text;
      const after = replacePlanningStamp(before, which, repeaterTokenOrNull);
      if (after !== before) {
        edit.replace(document.uri, targetLine.range, after);
        touched++;
      }
    }
  }

  if (!touched) {
    vscode.window.showWarningMessage("No matching SCHEDULED/DEADLINE stamps found on the selected task(s).");
    return;
  }

  await vscode.workspace.applyEdit(edit);
  vscode.commands.executeCommand("workbench.action.files.save");
};

// Minimal test hooks
module.exports._test = {
  normalizeRepeaterToken,
  stripExistingRepeaters,
  setRepeaterInTimestampContent,
  replacePlanningStamp
};
