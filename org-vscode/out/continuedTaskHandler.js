// Handles auto-forwarding of forward-trigger tasks (default: CONTINUED) to the next day
const moment = require("moment");
const taskKeywordManager = require("./taskKeywordManager");
const { normalizeBodyIndentation } = require("./indentUtils");
const {
  isPlanningLine,
  parsePlanningFromText,
  normalizeTagsAfterPlanning,
  getAcceptedDateFormats,
  DAY_HEADING_REGEX,
  SCHEDULED_REGEX,
  CLOSED_STRIP_RE,
  PLANNING_STRIP_RE
} = require("./orgTagUtils");

function getImmediatePlanningLine(lines, headingIndex) {
  const idx = headingIndex + 1;
  if (idx >= 0 && idx < lines.length && isPlanningLine(lines[idx])) {
    return { index: idx, text: lines[idx] };
  }
  return { index: -1, text: "" };
}

function stripInlinePlanning(text) {
  return String(text || "")
    .replace(new RegExp(PLANNING_STRIP_RE.source, 'g'), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildPlanningBody(planning) {
  const parts = [];
  // In Emacs: SCHEDULED/DEADLINE use active <...> (appear in agenda), CLOSED uses inactive [...]
  if (planning?.scheduled) parts.push(`SCHEDULED: <${planning.scheduled}>`);
  if (planning?.deadline) parts.push(`DEADLINE: <${planning.deadline}>`);
  if (planning?.closed) parts.push(`CLOSED: [${planning.closed}]`);
  return parts.join("  ");
}

/**
 * Find the day heading that contains a given line number
 * DAY_HEADING_REGEX groups: (1) indent, (2) marker, (3) open-bracket, (4) date, (5) dayname,
 *   (6) time-start, (7) time-end, (8) repeater, (9) warning, (10) close-bracket, (11) rest
 */
function findContainingDayHeading(lines, lineNumber) {
  for (let i = lineNumber; i >= 0; i--) {
    const match = lines[i].match(DAY_HEADING_REGEX);
    if (match) {
      return {
        lineIndex: i,
        indent: match[1] || "",
        marker: match[2],
        openBracket: match[3],
        date: match[4],
        weekday: match[5],
        timeStart: match[6],
        timeEnd: match[7],
        repeater: match[8],
        warning: match[9],
        closeBracket: match[10],
        suffix: match[11] || ""
      };
    }
  }
  return null;
}

/**
 * Find the next day heading after a given line
 * DAY_HEADING_REGEX groups: (1) indent, (2) marker, (3) open-bracket, (4) date, (5) dayname,
 *   (6) time-start, (7) time-end, (8) repeater, (9) warning, (10) close-bracket, (11) rest
 */
function findNextDayHeading(lines, afterLineIndex) {
  for (let i = afterLineIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(DAY_HEADING_REGEX);
    if (match) {
      return {
        lineIndex: i,
        indent: match[1] || "",
        marker: match[2],
        openBracket: match[3],
        date: match[4],
        weekday: match[5],
        timeStart: match[6],
        timeEnd: match[7],
        repeater: match[8],
        warning: match[9],
        closeBracket: match[10],
        suffix: match[11] || ""
      };
    }
  }
  return null;
}

/**
 * Find the last task line under a day heading (before the next heading or EOF)
 */
function findLastTaskLineUnderHeading(lines, headingLineIndex) {
  let lastTaskLine = headingLineIndex;
  for (let i = headingLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop if we hit another day heading
    if (DAY_HEADING_REGEX.test(line)) {
      break;
    }
    // Track if this line has content (task or note)
    if (line.trim()) {
      lastTaskLine = i;
    }
  }
  return lastTaskLine;
}

function parseOrgDate(dateStr) {
  const vscode = require("vscode");
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const configuredFormat = config.get("dateFormat", "YYYY-MM-DD");
  const formatsToTry = getAcceptedDateFormats(configuredFormat);
  for (const fmt of formatsToTry) {
    const parsed = moment(dateStr, fmt, true);
    if (parsed.isValid()) {
      return { parsed, format: fmt };
    }
  }
  return null;
}

function datesMatch(a, b) {
  const parsedA = parseOrgDate(a)?.parsed;
  const parsedB = parseOrgDate(b)?.parsed;
  if (!parsedA || !parsedB) {
    return false;
  }
  return parsedA.isSame(parsedB, "day");
}

/**
 * Calculate the next calendar day from a date string.
 * Preserves the detected date format from the source string.
 */
function getNextDay(dateStr) {
  const parsedInfo = parseOrgDate(dateStr);
  if (!parsedInfo) {
    return null;
  }
  const next = parsedInfo.parsed.clone().add(1, "day");
  return {
    date: next.format(parsedInfo.format),
    weekday: next.format("ddd")
  };
}

/**
 * Build a day heading line
 * @param {string} openBracket - Opening bracket (< or [), defaults to [ for backwards compatibility
 * @param {string} closeBracket - Closing bracket (> or ]), defaults to match openBracket
 */
function buildDayHeading(date, weekday, suffix = "", indent = "", marker = "⊘", openBracket = "[", closeBracket = null) {
  const separator = " -------------------------------------------------------------------------------------------------------------------------------";
  const close = closeBracket || (openBracket === "<" ? ">" : "]");
  return `${indent}${marker} ${openBracket}${date} ${weekday}${close}${suffix || separator}`;
}

/**
 * Build a forwarded task line (as TODO with updated schedule)
 */
function buildForwardedTask(originalLine, newDate, indent = "  ") {
  const vscode = require("vscode");
  // Clean the task and rebuild as the first configured workflow keyword
  const originalCleaned = taskKeywordManager.cleanTaskText(normalizeTagsAfterPlanning(originalLine));

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
  const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);
  const starPrefixMatch = originalLine.match(/^\s*(\*+)/);
  const starPrefix = starPrefixMatch ? starPrefixMatch[1] : "*";

  // Prefer writing planning as a child line. Preserve DEADLINE/CLOSED if present.
  const planningFromHeadline = parsePlanningFromText(originalLine);
  const hasInlinePlanning = Boolean(planningFromHeadline.scheduled || planningFromHeadline.deadline || planningFromHeadline.closed);

  const cleanedHeadlineText = stripInlinePlanning(originalCleaned);
  const resetKeyword = taskKeywordManager.getDefaultKeyword();
  const headline = taskKeywordManager.buildTaskLine(indent, resetKeyword, cleanedHeadlineText, { headingMarkerStyle, starPrefix });

  // Only update scheduling when the original task had a scheduled stamp.
  if (!hasInlinePlanning || !planningFromHeadline.scheduled) {
    return headline;
  }

  const updatedPlanning = {
    ...planningFromHeadline,
    scheduled: newDate
  };
  const planningIndent = `${indent}${bodyIndent}`;
  const body = buildPlanningBody(updatedPlanning);
  return body ? `${headline}\n${planningIndent}${body}` : headline;
}

/**
 * Extract a normalized task identifier for matching (title + tags, no dates/status)
 */
function getTaskIdentifier(lineText) {
  const cleaned = taskKeywordManager.cleanTaskText(normalizeTagsAfterPlanning(lineText));
  return cleaned
    .replace(new RegExp(SCHEDULED_REGEX.source, 'g'), "")
    .replace(new RegExp(CLOSED_STRIP_RE.source, 'g'), "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Find a matching forwarded task in the next day's section
 */
function findForwardedTask(lines, nextDayHeadingIndex, taskIdentifier) {
  for (let i = nextDayHeadingIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop if we hit another day heading
    if (DAY_HEADING_REGEX.test(line)) {
      break;
    }
    if (isPlanningLine(line)) {
      continue;
    }
    // Check if this line matches our task
    if (getTaskIdentifier(line) === taskIdentifier) {
      return i;
    }
  }
  return -1;
}

/**
 * Handle transitioning TO CONTINUED status
 * Returns the edits needed to forward the task to the next day
 */
function handleContinuedTransition(document, taskLineNumber) {
  const vscode = require("vscode");
  const lines = document.getText().split(/\r?\n/);
  const taskLine = lines[taskLineNumber];
  const planningLine = getImmediatePlanningLine(lines, taskLineNumber);

  // Find which day this task belongs to
  const currentDay = findContainingDayHeading(lines, taskLineNumber);
  if (!currentDay) {
    return null; // Can't find day heading, skip forwarding
  }

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
  const fallbackMarker = headingMarkerStyle === "asterisks" ? "*" : "⊘";
  
  // Calculate next day
  const nextDayInfo = getNextDay(currentDay.date);
  if (!nextDayInfo) {
    return null;
  }
  
  // Check if next day heading exists
  const nextDayHeading = findNextDayHeading(lines, currentDay.lineIndex);
  const taskIdentifier = getTaskIdentifier(taskLine);
  
  // Determine task indentation from original
  const originalIndent = taskLine.match(/^(\s*)/)?.[1] || "  ";
  
  // Build the forwarded task
  // If we have a planning line, include its stamps during forwarding.
  const combinedForForwarding = planningLine.index !== -1 ? `${taskLine}\n${planningLine.text}` : taskLine;
  const forwardedTask = buildForwardedTask(combinedForForwarding, nextDayInfo.date, originalIndent);
  
  if (nextDayHeading && datesMatch(nextDayHeading.date, nextDayInfo.date)) {
    // Next day exists - check if task is already forwarded
    const existingForward = findForwardedTask(lines, nextDayHeading.lineIndex, taskIdentifier);
    if (existingForward !== -1) {
      // Already forwarded, no action needed
      return null;
    }
    
    // Use the existing heading's date string to keep file formatting consistent.
    const forwardedTaskForExistingHeading = buildForwardedTask(combinedForForwarding, nextDayHeading.date, originalIndent);

    // Insert after the day heading
    return {
      type: "insert",
      position: new vscode.Position(nextDayHeading.lineIndex + 1, 0),
      text: forwardedTaskForExistingHeading + "\n"
    };
  } else {
    // Need to create the next day heading
    const insertAfterLine = nextDayHeading 
      ? nextDayHeading.lineIndex - 1 
      : findLastTaskLineUnderHeading(lines, currentDay.lineIndex);
    
    const newDayHeading = buildDayHeading(
      nextDayInfo.date,
      nextDayInfo.weekday,
      "",
      currentDay.indent || "",
      currentDay.marker || fallbackMarker,
      currentDay.openBracket || "[",
      currentDay.closeBracket || "]"
    );
    const insertText = `\n${newDayHeading}\n${forwardedTask}`;
    
    return {
      type: "insert",
      position: new vscode.Position(insertAfterLine + 1, 0),
      text: insertText + "\n"
    };
  }
}

/**
 * Handle transitioning FROM CONTINUED status
 * Returns the edits needed to remove the forwarded task from the next day
 */
function handleContinuedRemoval(document, taskLineNumber) {
  const vscode = require("vscode");
  const lines = document.getText().split(/\r?\n/);
  const taskLine = lines[taskLineNumber];
  
  // Find which day this task belongs to
  const currentDay = findContainingDayHeading(lines, taskLineNumber);
  if (!currentDay) {
    return null;
  }
  
  // Calculate next day
  const nextDayInfo = getNextDay(currentDay.date);
  if (!nextDayInfo) {
    return null;
  }
  
  // Find next day heading
  const nextDayHeading = findNextDayHeading(lines, currentDay.lineIndex);
  if (!nextDayHeading || nextDayHeading.date !== nextDayInfo.date) {
    return null; // No matching next day
  }
  
  // Find the forwarded task
  const taskIdentifier = getTaskIdentifier(taskLine);
  const forwardedLineIndex = findForwardedTask(lines, nextDayHeading.lineIndex, taskIdentifier);
  
  if (forwardedLineIndex === -1) {
    return null; // No forwarded task found
  }
  
  // Return deletion edit
  const lineToDelete = document.lineAt(forwardedLineIndex);
  const nextLineToDelete = (forwardedLineIndex + 1 < document.lineCount) ? document.lineAt(forwardedLineIndex + 1) : null;
  const deleteEnd = (nextLineToDelete && isPlanningLine(nextLineToDelete.text))
    ? new vscode.Position(forwardedLineIndex + 2, 0)
    : new vscode.Position(forwardedLineIndex + 1, 0);
  return {
    type: "delete",
    range: new vscode.Range(
      lineToDelete.range.start,
      deleteEnd
    )
  };
}

module.exports = {
  handleContinuedTransition,
  handleContinuedRemoval,
  findContainingDayHeading,
  findNextDayHeading,
  findLastTaskLineUnderHeading,
  findForwardedTask,
  getTaskIdentifier,
  getImmediatePlanningLine,
  buildDayHeading,
  stripInlinePlanning,
  DAY_HEADING_REGEX
};
