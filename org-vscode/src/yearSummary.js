const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const moment = require("moment");
const { getAllTagsFromLine, stripAllTagSyntax, isPlanningLine, parsePlanningFromText, PLANNING_STRIP_RE, normalizeTagsAfterPlanning } = require("./orgTagUtils");
const taskKeywordManager = require("./taskKeywordManager");
const { toDateKey } = require("./yearDateUtils");
const { buildYearMetrics, buildYearComparison } = require("./yearMetrics");

const ORG_SYMBOL_REGEX = /\s*[⊙⊖⊘⊜⊗]\s*/g;
const FORMULA_PREFIX_REGEX = /^[=+\-@]/;
const CLOSED_LINE_REGEX = /^(?:CLOSED|COMPLETED):\s*\[(.*?)\](.*)$/i;
const DRAWER_START_REGEX = /^:([A-Za-z][A-Za-z0-9_-]*):\s*$/;
const DRAWER_END_REGEX = /^:END:\s*$/i;
const LOGBOOK_STATE_REGEX = /^-\s*State\s+"([^"]*)"\s+from\s+"([^"]*)"\s*(?:\[([^\]]+)\])?/i;
const CLOCK_REGEX = /^-?\s*CLOCK:\s*[[<]([^\]>]+)[\]>]\s*(?:--\s*[[<]([^\]>]+)[\]>])?\s*(?:=>\s*(-?\d+):(\d{2}))?/i;
const PRIORITY_REGEX = /\[#([A-Za-z0-9])\]/;
const COOKIE_FRACTION_REGEX = /\[(\d+)\/(\d+)\]/;
const COOKIE_PERCENT_REGEX = /\[(\d+)%\]/;
const CLOCK_STAMP_FORMATS = ["YYYY-MM-DD ddd HH:mm", "YYYY-MM-DD HH:mm", "MM-DD-YYYY ddd HH:mm", "MM-DD-YYYY HH:mm"];

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Heading rank so `**` nests under `*`, and deeper indentation nests under the same star count. */
function headingRank(line) {
  const text = String(line || "");
  const indent = (text.match(/^\s*/) || [""])[0].length;
  const stars = (text.match(/^\s*(\*+)/) || ["", ""])[1].length;
  return {
    level: stars || 1,
    rank: (stars || 1) + Math.min(indent, 60) / 100
  };
}

function parseClockLine(text) {
  const match = String(text || "").match(CLOCK_REGEX);
  if (!match) {
    return null;
  }

  const [, startRaw, endRaw, hours, minutes] = match;
  if (hours !== undefined && minutes !== undefined) {
    const signed = Number(hours) * 60 + (Number(hours) < 0 ? -Number(minutes) : Number(minutes));
    return { start: startRaw, end: endRaw || null, minutes: signed };
  }

  const start = moment(String(startRaw).trim(), CLOCK_STAMP_FORMATS, true);
  const end = endRaw ? moment(String(endRaw).trim(), CLOCK_STAMP_FORMATS, true) : null;
  if (start.isValid() && end && end.isValid()) {
    return { start: startRaw, end: endRaw, minutes: Math.max(end.diff(start, "minutes"), 0) };
  }

  return { start: startRaw, end: endRaw || null, minutes: 0 };
}

/**
 * Files that group work under day headings own their tasks directly. Files that
 * list tasks at the top level get synthetic day buckets derived from each task's
 * own planning stamps so both layouts produce the same shape.
 */
function resolveSyntheticDay(metadata, buckets, days) {
  const dateKey = toDateKey(metadata.scheduled)
    || toDateKey(metadata.completed)
    || toDateKey(metadata.deadline);
  const bucketKey = dateKey || "undated";

  const existing = buckets.get(bucketKey);
  if (existing) {
    return existing;
  }

  const day = {
    line: "",
    date: dateKey,
    weekday: dateKey ? moment(dateKey, "YYYY-MM-DD", true).format("ddd") : "",
    tasks: [],
    synthetic: true,
    undated: !dateKey
  };
  buckets.set(bucketKey, day);
  days.push(day);
  return day;
}

function buildHeadingStartRegex(registry) {
  const markers = (registry?.states || [])
    .map((s) => s.marker)
    .filter((m) => typeof m === "string" && m.length > 0);
  const unique = Array.from(new Set(markers));
  const markerAlt = unique.map(escapeRegExp).join("|");
  const parts = ["\\*+"];
  if (markerAlt) parts.push(`(?:${markerAlt})`);
  return new RegExp(`^\\s*(?:${parts.join("|")})`);
}

async function exportYearSummary() {
  try {
    const orgUri = await pickOrgFile();
    if (!orgUri) {
      return;
    }

    const result = await exportYearSummaryForFile(orgUri.fsPath);
    const openOption = "Open Folder";
    vscode.window
      .showInformationMessage(`Year summary exported to ${result.reportDir}`, openOption)
      .then(selection => {
        if (selection === openOption) {
          vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(result.reportDir));
        }
      });
  } catch (err) {
    vscode.window.showErrorMessage(`Year summary failed: ${err.message}`);
  }
}

async function exportYearSummaryForFile(orgPath, parsedInput) {
  const parsed = parsedInput || parseOrgContent(fs.readFileSync(orgPath, "utf-8"));
  if (!parsed.days.length) {
    throw new Error("No day headings or tasks were detected in that Org file.");
  }

  const year = parsed.year;
  const reportDir = await ensureReportDirectory(orgPath, year);
  const payload = {
    source: orgPath,
    generatedAt: new Date().toISOString(),
    year,
    summary: parsed
  };

  const jsonPath = path.join(reportDir, "year-summary.json");
  const csvPath = path.join(reportDir, "year-summary.csv");
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2));
  fs.writeFileSync(csvPath, buildCsv(parsed.days));

  return { reportDir, year, jsonPath, csvPath, payload };
}

async function pickOrgFile() {
  const dialog = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { "Org Files": ["org", "vsorg", "vso"] }
  });
  return dialog && dialog.length ? dialog[0] : undefined;
}

async function ensureReportDirectory(sourcePath, year) {
  const root = path.dirname(sourcePath);
  const reportsDir = path.join(root, ".vscode-orgmode", "reports", String(year));
  await fs.promises.mkdir(reportsDir, { recursive: true });
  return reportsDir;
}

function readYearReviewSettings() {
  const defaults = { highlightLimit: 10, staleTaskDays: 30, writeReportsOnOpen: false };
  try {
    const config = vscode.workspace.getConfiguration("Org-vscode");
    const read = (key, fallback) => {
      const value = config.get(`yearReview.${key}`);
      return value === undefined || value === null ? fallback : value;
    };
    return {
      highlightLimit: Number(read("highlightLimit", defaults.highlightLimit)) || defaults.highlightLimit,
      staleTaskDays: Number(read("staleTaskDays", defaults.staleTaskDays)) || defaults.staleTaskDays,
      writeReportsOnOpen: Boolean(read("writeReportsOnOpen", defaults.writeReportsOnOpen))
    };
  } catch (error) {
    return defaults;
  }
}

function parseOrgContent(raw, options = {}) {
  const lines = raw.split(/\r?\n/);
  const dayRegex = /^\s*(?:⊘|\*+)\s*\[(\d{2,4}-\d{2}-\d{2,4})(?:\s+([A-Za-z]{3}))?.*$/;
  const registry = taskKeywordManager.getWorkflowRegistry();
  const headingStartRegex = buildHeadingStartRegex(registry);
  const days = [];
  const syntheticDays = new Map();
  const headingStack = [];
  let currentDay = null;
  let currentTask = null;
  let openDrawer = null;

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (openDrawer) {
      if (DRAWER_END_REGEX.test(trimmed)) {
        openDrawer = null;
        return;
      }
      if (currentTask) {
        collectDrawerLine(currentTask, openDrawer, trimmed);
      }
      return;
    }

    const dayMatch = line.match(dayRegex);
    if (dayMatch) {
      const dayDate = dayMatch[1];
      const weekday = dayMatch[2] || "";
      currentDay = {
        line: line.trim(),
        date: dayDate,
        weekday,
        tasks: []
      };
      days.push(currentDay);
      currentTask = null;
      headingStack.length = 0;
      return;
    }

    const keyword = taskKeywordManager.findTaskKeyword(line);
    if (keyword && headingStartRegex.test(line)) {
      const nextLine = (index + 1 < lines.length) ? lines[index + 1] : "";
      const combined = isPlanningLine(nextLine) ? `${line}\n${nextLine}` : line;
      const metadata = extractMetadata(combined);
      const { level, rank } = headingRank(line);

      while (headingStack.length && headingStack[headingStack.length - 1].rank >= rank) {
        headingStack.pop();
      }
      const parent = headingStack.length ? headingStack[headingStack.length - 1].task : null;

      currentTask = {
        line: line.trim(),
        status: keyword,
        title: metadata.title,
        tags: metadata.tags,
        scheduled: metadata.scheduled,
        completed: metadata.completed,
        deadline: metadata.deadline,
        priority: metadata.priority,
        progress: metadata.progress,
        level,
        parentLine: parent ? parent.lineNumber : null,
        childCount: 0,
        stateChanges: [],
        clockEntries: [],
        clockMinutes: 0,
        notes: [],
        lineNumber: index + 1
      };
      if (parent) {
        parent.childCount += 1;
      }
      headingStack.push({ rank, task: currentTask });

      const owner = currentDay || resolveSyntheticDay(metadata, syntheticDays, days);
      owner.tasks.push(currentTask);
      return;
    }

    if (!trimmed) {
      return;
    }

    const drawerMatch = trimmed.match(DRAWER_START_REGEX);
    if (drawerMatch && !DRAWER_END_REGEX.test(trimmed)) {
      openDrawer = drawerMatch[1].toUpperCase();
      return;
    }

    if (currentTask) {
      const clock = parseClockLine(trimmed);
      if (clock) {
        currentTask.clockEntries.push(clock);
        currentTask.clockMinutes += clock.minutes;
        return;
      }

      const completedLineMatch = trimmed.match(CLOSED_LINE_REGEX);
      if (completedLineMatch) {
        if (!currentTask.completed) {
          currentTask.completed = completedLineMatch[1].trim();
        }
        const remainder = (completedLineMatch[2] || "").replace(/^[|:-\s]+/, "").trim();
        if (remainder) {
          currentTask.notes.push(remainder);
        }
        return;
      }

      currentTask.notes.push(trimmed);
    }
  });

  const availableYears = collectAvailableYears(days);
  const settings = readYearReviewSettings();
  const requestedYear = Number(options.year);
  const year = Number.isInteger(requestedYear) ? requestedYear : deriveYear(days, lines);

  // Mixed-year files are common (e.g. a 2025 file with a few 2024 carryover items).
  // The dashboard shows one year at a time; availableYears lets callers switch.
  const filteredDays = filterDaysToYear(days, year);
  const aggregates = buildAggregates(filteredDays, registry);
  const workflowMeta = {
    cycleKeywords: registry.getCycleKeywords(),
    doneLikeKeywords: (registry.states || []).filter((s) => s && s.isDoneLike).map((s) => s.keyword),
    stampsClosedKeywords: (registry.states || []).filter((s) => s && s.stampsClosed).map((s) => s.keyword),
    forwardKeywords: (registry.states || []).filter((s) => s && s.triggersForward).map((s) => s.keyword),
    markers: (registry.states || []).map((s) => s.marker).filter((m) => typeof m === "string" && m.length > 0)
  };
  const cycle = workflowMeta.cycleKeywords || [];
  workflowMeta.inProgressKeywords = (registry.states || [])
    .filter((s) => s && !s.isDoneLike && !s.triggersForward && s.keyword !== cycle[0])
    .map((s) => s.keyword);

  const metrics = buildYearMetrics(filteredDays, workflowMeta, year, settings);
  const yearComparison = buildYearComparison(days, workflowMeta);

  return { days: filteredDays, year, availableYears, aggregates, workflowMeta, metrics, yearComparison, settings };
}

function collectDrawerLine(task, drawerName, trimmed) {
  const clock = parseClockLine(trimmed);
  if (clock) {
    task.clockEntries.push(clock);
    task.clockMinutes += clock.minutes;
    return;
  }

  if (drawerName === "LOGBOOK") {
    const stateMatch = trimmed.match(LOGBOOK_STATE_REGEX);
    if (stateMatch) {
      task.stateChanges.push({
        to: stateMatch[1] || "",
        from: stateMatch[2] || "",
        at: (stateMatch[3] || "").trim()
      });
    }
  }
}

function collectAvailableYears(days) {
  const counts = new Map();
  (days || []).forEach(day => {
    (day.tasks || []).forEach(task => {
      const key = toDateKey(task.scheduled) || toDateKey(day.date) || toDateKey(task.completed);
      if (!key) {
        return;
      }
      const year = Number(key.slice(0, 4));
      counts.set(year, (counts.get(year) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .map(([year, taskCount]) => ({ year, taskCount }))
    .sort((a, b) => b.year - a.year);
}

function extractMetadata(line) {
  const cleaned = normalizeTagsAfterPlanning(taskKeywordManager.cleanTaskText(line)).trim();

  const tags = getAllTagsFromLine(cleaned);
  const planning = parsePlanningFromText(cleaned);

  const priorityMatch = cleaned.match(PRIORITY_REGEX);
  const fractionMatch = cleaned.match(COOKIE_FRACTION_REGEX);
  const percentMatch = cleaned.match(COOKIE_PERCENT_REGEX);

  let progress = null;
  if (fractionMatch) {
    const done = Number(fractionMatch[1]);
    const total = Number(fractionMatch[2]);
    progress = { done, total, percent: total ? Math.round((done / total) * 100) : 0 };
  } else if (percentMatch) {
    progress = { done: null, total: null, percent: Number(percentMatch[1]) };
  }

  const title = stripAllTagSyntax(cleaned)
    .replace(new RegExp(PLANNING_STRIP_RE.source, "g"), "")
    .replace(new RegExp(PRIORITY_REGEX.source, "g"), "")
    .replace(new RegExp(COOKIE_FRACTION_REGEX.source, "g"), "")
    .replace(new RegExp(COOKIE_PERCENT_REGEX.source, "g"), "")
    .replace(/\s{2,}/g, " ")
    .replace(/:+\s*$/, "")
    .trim();

  return {
    title,
    tags,
    scheduled: planning.scheduled,
    completed: planning.closed,
    deadline: planning.deadline,
    priority: priorityMatch ? priorityMatch[1].toUpperCase() : null,
    progress
  };
}

function deriveYear(days, lines) {
  const declared = detectDeclaredYear(lines);
  if (declared) {
    return declared;
  }

  const first = days.find(day => day.date);
  if (!first) {
    return new Date().getFullYear();
  }
  const parsed = moment(first.date, ["MM-DD-YYYY", "YYYY-MM-DD"], true);
  return parsed.isValid() ? parsed.year() : new Date().getFullYear();
}

function detectDeclaredYear(lines) {
  const arr = Array.isArray(lines) ? lines : [];
  const MAX_SCAN = 120;
  const yearRe = /\b(19|20)\d{2}\b/;
  const filetagsYearRe = /:(19|20)\d{2}:/;

  for (let i = 0; i < Math.min(arr.length, MAX_SCAN); i++) {
    const line = String(arr[i] || "").trim();
    if (!line) {
      continue;
    }

    const titleMatch = line.match(/^#\+TITLE:\s*(.*)$/i);
    if (titleMatch) {
      const match = String(titleMatch[1] || "").match(yearRe);
      if (match) {
        const year = Number(match[0]);
        if (!Number.isNaN(year)) {
          return year;
        }
      }
    }

    const fileTagsMatch = line.match(/^#\+FILETAGS:\s*(.*)$/i);
    if (fileTagsMatch) {
      const match = String(fileTagsMatch[1] || "").match(filetagsYearRe) || String(fileTagsMatch[1] || "").match(yearRe);
      if (match) {
        const year = Number(match[0].replace(/:/g, ""));
        if (!Number.isNaN(year)) {
          return year;
        }
      }
    }
  }

  return null;
}

function filterDaysToYear(days, year) {
  const list = Array.isArray(days) ? days : [];
  const selectedYear = typeof year === "number" ? year : new Date().getFullYear();
  const out = [];

  list.forEach(day => {
    const dayKey = toDateKey(day.date);
    if (dayKey) {
      if (Number(dayKey.slice(0, 4)) !== selectedYear) {
        return;
      }
    } else if (!day.undated) {
      // Day headings we cannot date are dropped; undated task buckets are kept.
      return;
    }

    const filteredTasks = (day.tasks || []).filter(task => {
      const scheduledKey = toDateKey(task?.scheduled);
      if (scheduledKey) {
        return Number(scheduledKey.slice(0, 4)) === selectedYear;
      }
      // Unscheduled tasks inherit their day heading's year.
      return true;
    });

    out.push({
      ...day,
      tasks: filteredTasks
    });
  });

  return out;
}

function buildAggregates(days, registry) {
  const aggregates = {
    totalTasks: 0,
    perStatus: {},
    perTag: {},
    perMonth: {},
    doneLikeCount: 0,
    completedCount: 0
  };

  days.forEach(day => {
    day.tasks.forEach(task => {
      aggregates.totalTasks += 1;
      aggregates.perStatus[task.status] = (aggregates.perStatus[task.status] || 0) + 1;
      task.tags.forEach(tag => {
        aggregates.perTag[tag] = (aggregates.perTag[tag] || 0) + 1;
      });
      const monthSource = toDateKey(task.scheduled) || toDateKey(day.date);
      const bucket = monthSource ? monthSource.slice(0, 7) : "unscheduled";
      aggregates.perMonth[bucket] = (aggregates.perMonth[bucket] || 0) + 1;
    });
  });

  if (registry && typeof registry.isDoneLike === "function") {
    aggregates.doneLikeCount = Object.entries(aggregates.perStatus)
      .filter(([status]) => registry.isDoneLike(status))
      .reduce((sum, [, count]) => sum + (count || 0), 0);

    const stampsClosed = Object.entries(aggregates.perStatus)
      .filter(([status]) => registry.stampsClosed && registry.stampsClosed(status))
      .reduce((sum, [, count]) => sum + (count || 0), 0);

    aggregates.completedCount = stampsClosed || aggregates.doneLikeCount;
  } else {
    aggregates.completedCount = aggregates.perStatus.DONE || 0;
    aggregates.doneLikeCount = aggregates.completedCount;
  }

  return aggregates;
}

function buildCsv(days) {
  const header = ["date", "weekday", "status", "priority", "title", "tags", "scheduled", "deadline", "completed", "hours", "subtasks", "notes"].join(",");
  const rows = [header];

  days.forEach(day => {
    day.tasks.forEach(task => {
      const hours = Number(task.clockMinutes) ? (Number(task.clockMinutes) / 60).toFixed(2) : "";
      const row = [
        day.date,
        day.weekday,
        task.status,
        task.priority || "",
        task.title,
        task.tags.join("|"),
        task.scheduled,
        task.deadline,
        task.completed,
        hours,
        task.childCount || "",
        task.notes.join(" | ")
      ].map(value => escapeCsv(sanitizeForCsv(value)));
      rows.push(row.join(","));
    });
  });

  return rows.join("\n");
}

function sanitizeForCsv(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const cleaned = String(value).replace(ORG_SYMBOL_REGEX, " ").trim();
  if (!cleaned) {
    return "";
  }
  return FORMULA_PREFIX_REGEX.test(cleaned) ? `'${cleaned}` : cleaned;
}

function escapeCsv(value) {
  if (value === undefined || value === null) {
    return "";
  }
  const hasComma = /[",\n]/.test(value);
  if (!hasComma) {
    return value;
  }
  return `"${value.replace(/"/g, '""')}"`;
}

module.exports = {
  exportYearSummary,
  exportYearSummaryForFile,
  parseOrgContent,
  pickOrgFile,
  ensureReportDirectory,
  buildCsv,
  toDateKey
};
