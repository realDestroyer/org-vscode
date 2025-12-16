// Handles auto-forwarding of CONTINUED tasks to the next day
const vscode = require("vscode");
const moment = require("moment");
const taskKeywordManager = require("./taskKeywordManager");

const DAY_HEADING_REGEX = /^(\s*)(⊘|\*+)\s*\[(\d{2}-\d{2}-\d{4})\s+([A-Za-z]{3})\](.*)$/;
const SCHEDULED_REGEX = /SCHEDULED:\s*\[(\d{2}-\d{2}-\d{4})\]/;

/**
 * Find the day heading that contains a given line number
 */
function findContainingDayHeading(lines, lineNumber) {
  for (let i = lineNumber; i >= 0; i--) {
    const match = lines[i].match(DAY_HEADING_REGEX);
    if (match) {
      return {
        lineIndex: i,
        indent: match[1] || "",
        marker: match[2],
        date: match[3],
        weekday: match[4],
        suffix: match[5] || ""
      };
    }
  }
  return null;
}

/**
 * Find the next day heading after a given line
 */
function findNextDayHeading(lines, afterLineIndex) {
  for (let i = afterLineIndex + 1; i < lines.length; i++) {
    const match = lines[i].match(DAY_HEADING_REGEX);
    if (match) {
      return {
        lineIndex: i,
        indent: match[1] || "",
        marker: match[2],
        date: match[3],
        weekday: match[4],
        suffix: match[5] || ""
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

/**
 * Calculate the next calendar day from a date string
 */
function getNextDay(dateStr) {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = config.get("dateFormat", "MM-DD-YYYY");
  const parsed = moment(dateStr, [dateFormat, "MM-DD-YYYY", "DD-MM-YYYY"], true);
  if (!parsed.isValid()) {
    return null;
  }
  const next = parsed.add(1, "day");
  return {
    date: next.format(dateFormat),
    weekday: next.format("ddd")
  };
}

/**
 * Build a day heading line
 */
function buildDayHeading(date, weekday, suffix = "", indent = "", marker = "⊘") {
  const separator = " -------------------------------------------------------------------------------------------------------------------------------";
  return `${indent}${marker} [${date} ${weekday}]${suffix || separator}`;
}

/**
 * Build a forwarded task line (as TODO with updated schedule)
 */
function buildForwardedTask(originalLine, newDate, indent = "  ") {
  // Clean the task and rebuild as TODO
  const cleanedText = taskKeywordManager.cleanTaskText(originalLine);

  const config = vscode.workspace.getConfiguration("Org-vscode");
  const headingMarkerStyle = config.get("headingMarkerStyle", "unicode");
  const starPrefixMatch = originalLine.match(/^\s*(\*+)/);
  const starPrefix = starPrefixMatch ? starPrefixMatch[1] : "*";
  
  // Update the SCHEDULED date if present
  let updatedText = cleanedText;
  if (SCHEDULED_REGEX.test(cleanedText)) {
    updatedText = cleanedText.replace(SCHEDULED_REGEX, `SCHEDULED: [${newDate}]`);
  }
  
  return taskKeywordManager.buildTaskLine(indent, "TODO", updatedText, { headingMarkerStyle, starPrefix });
}

/**
 * Extract a normalized task identifier for matching (title + tags, no dates/status)
 */
function getTaskIdentifier(lineText) {
  return lineText
    .replace(/^\s*\*+\s+/, "")
    .replace(/[⊙⊘⊖⊜⊗]/g, "")
    .replace(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/g, "")
    .replace(/SCHEDULED:\s*\[\d{2}-\d{2}-\d{4}\]/g, "")
    .replace(/COMPLETED:\s*\[.*?\]/g, "")
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
  const lines = document.getText().split(/\r?\n/);
  const taskLine = lines[taskLineNumber];
  
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
  const forwardedTask = buildForwardedTask(taskLine, nextDayInfo.date, originalIndent);
  
  if (nextDayHeading && nextDayHeading.date === nextDayInfo.date) {
    // Next day exists - check if task is already forwarded
    const existingForward = findForwardedTask(lines, nextDayHeading.lineIndex, taskIdentifier);
    if (existingForward !== -1) {
      // Already forwarded, no action needed
      return null;
    }
    
    // Insert after the day heading
    return {
      type: "insert",
      position: new vscode.Position(nextDayHeading.lineIndex + 1, 0),
      text: forwardedTask + "\n"
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
      currentDay.marker || fallbackMarker
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
  return {
    type: "delete",
    range: new vscode.Range(
      lineToDelete.range.start,
      new vscode.Position(forwardedLineIndex + 1, 0)
    )
  };
}

module.exports = {
  handleContinuedTransition,
  handleContinuedRemoval,
  findContainingDayHeading,
  getTaskIdentifier,
  DAY_HEADING_REGEX
};
