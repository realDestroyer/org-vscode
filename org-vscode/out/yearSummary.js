const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const moment = require("moment");

const ORG_SYMBOL_REGEX = /\s*[⊙⊖⊘⊜⊗]\s*/g;
const FORMULA_PREFIX_REGEX = /^[=+\-@]/;
const COMPLETED_LINE_REGEX = /^COMPLETED:\s*\[(.*?)\](.*)$/i;

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
  const taskRegex = /^(?<indent>\s*)(?:[⊙⊖⊘⊜⊗]|\*+)\s+(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b(.*)$/;
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

    const taskMatch = line.match(taskRegex);
    if (taskMatch && currentDay) {
      const metadata = extractMetadata(line);
      currentTask = {
        line: line.trim(),
        status: taskMatch[2],
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
      const completedLineMatch = trimmed.match(COMPLETED_LINE_REGEX);
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

  const year = deriveYear(days);
  const aggregates = buildAggregates(days);
  return { days, year, aggregates };
}

function extractMetadata(line) {
  const cleaned = line
    .replace(/^[\s]*[⊙⊖⊘⊜⊗]\s+/, "")
    .replace(/^[\s]*\*+\s+/, "")
    .replace(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b\s*:*/, "")
    .trim();

  const tagMatch = cleaned.match(/\[\+TAG:([^\]]+)\]/);
  const tags = tagMatch ? tagMatch[1].split(",").map(tag => tag.trim()) : [];
  const scheduledMatch = cleaned.match(/SCHEDULED:\s*\[(.*?)\]/);
  const completedMatch = cleaned.match(/COMPLETED:\s*\[(.*?)\]/);
  const deadlineMatch = cleaned.match(/DEADLINE:\s*\[(.*?)\]/);

  const title = cleaned
    .replace(/\[\+TAG:[^\]]+\]/, "")
    .replace(/SCHEDULED:.*/, "")
    .replace(/COMPLETED:.*/, "")
    .replace(/DEADLINE:.*/, "")
    .replace(/:+\s*$/, "")
    .trim();

  return {
    title,
    tags,
    scheduled: scheduledMatch ? scheduledMatch[1] : null,
    completed: completedMatch ? completedMatch[1] : null,
    deadline: deadlineMatch ? deadlineMatch[1] : null
  };
}

function deriveYear(days) {
  const first = days.find(day => day.date);
  if (!first) {
    return new Date().getFullYear();
  }
  const parsed = moment(first.date, ["MM-DD-YYYY", "YYYY-MM-DD"], true);
  return parsed.isValid() ? parsed.year() : new Date().getFullYear();
}

function buildAggregates(days) {
  const aggregates = {
    totalTasks: 0,
    perStatus: {},
    perTag: {},
    perMonth: {}
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
