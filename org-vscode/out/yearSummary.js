const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const moment = require("moment");
const { getAllTagsFromLine, stripAllTagSyntax, isPlanningLine, parsePlanningFromText, PLANNING_STRIP_RE, normalizeTagsAfterPlanning } = require("./orgTagUtils");
const taskKeywordManager = require("./taskKeywordManager");

const ORG_SYMBOL_REGEX = /\s*[⊙⊖⊘⊜⊗]\s*/g;
const FORMULA_PREFIX_REGEX = /^[=+\-@]/;
const CLOSED_LINE_REGEX = /^(?:CLOSED|COMPLETED):\s*\[(.*?)\](.*)$/i;

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function parseOrgContent(raw) {
  const lines = raw.split(/\r?\n/);
  const dayRegex = /^\s*(?:⊘|\*+)\s*\[(\d{2,4}-\d{2}-\d{2,4})(?:\s+([A-Za-z]{3}))?.*$/;
  const registry = taskKeywordManager.getWorkflowRegistry();
  const headingStartRegex = buildHeadingStartRegex(registry);
  const days = [];
  let currentDay = null;
  let currentTask = null;

  lines.forEach((line, index) => {
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
      return;
    }

    const keyword = taskKeywordManager.findTaskKeyword(line);
    if (keyword && currentDay && headingStartRegex.test(line)) {
      const nextLine = (index + 1 < lines.length) ? lines[index + 1] : "";
      const combined = isPlanningLine(nextLine) ? `${line}\n${nextLine}` : line;
      const metadata = extractMetadata(combined);
      currentTask = {
        line: line.trim(),
        status: keyword,
        title: metadata.title,
        tags: metadata.tags,
        scheduled: metadata.scheduled,
        completed: metadata.completed,
        deadline: metadata.deadline,
        notes: [],
        lineNumber: index + 1
      };
      currentDay.tasks.push(currentTask);
      return;
    }

    const trimmed = line.trim();
    if (currentTask && trimmed) {
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

  const year = deriveYear(days, lines);

  // Mixed-year files are common (e.g. a 2025 file with a few 2024 carryover items).
  // The Year-in-Review dashboard assumes a single year, so we filter parsed content
  // down to the derived year to keep the heatmap/month filters consistent.
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

  return { days: filteredDays, year, aggregates, workflowMeta };
}

function extractMetadata(line) {
  const cleaned = normalizeTagsAfterPlanning(taskKeywordManager.cleanTaskText(line)).trim();

  const tags = getAllTagsFromLine(cleaned);
  const planning = parsePlanningFromText(cleaned);

  const title = stripAllTagSyntax(cleaned)
    .replace(new RegExp(PLANNING_STRIP_RE.source, "g"), "")
    .replace(/:+\s*$/, "")
    .trim();

  return {
    title,
    tags,
    scheduled: planning.scheduled,
    completed: planning.closed,
    deadline: planning.deadline
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
    const dayMoment = moment(day.date, ["MM-DD-YYYY", "YYYY-MM-DD"], true);
    if (!dayMoment.isValid() || dayMoment.year() !== selectedYear) {
      return;
    }

    const filteredTasks = (day.tasks || []).filter(task => {
      const scheduledValue = task?.scheduled ? String(task.scheduled) : "";
      if (scheduledValue) {
        const scheduledMoment = moment(scheduledValue, ["MM-DD-YYYY", "YYYY-MM-DD"], true);
        if (scheduledMoment.isValid()) {
          return scheduledMoment.year() === selectedYear;
        }
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
      const monthKey = moment(task.scheduled || day.date, ["MM-DD-YYYY", "YYYY-MM-DD"], true);
      const bucket = monthKey.isValid() ? monthKey.format("YYYY-MM") : "unscheduled";
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
  const header = ["date", "weekday", "status", "title", "tags", "scheduled", "deadline", "completed", "notes"].join(",");
  const rows = [header];

  days.forEach(day => {
    day.tasks.forEach(task => {
      const row = [
        day.date,
        day.weekday,
        task.status,
        task.title,
        task.tags.join("|"),
        task.scheduled,
        task.deadline,
        task.completed,
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
  buildCsv
};
