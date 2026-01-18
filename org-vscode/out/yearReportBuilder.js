const path = require("path");
const moment = require("moment");
const { html, SafeHtml, escapeText } = require("./htmlUtils");

const ORG_SYMBOL_REGEX = /\s*[⊙⊖⊘⊜⊗]\s*/g;

function buildReportModel(sourcePath, parsed) {
  const aggregates = parsed.aggregates || {};
  const perStatus = aggregates.perStatus || {};
  const perTag = aggregates.perTag || {};
  const perMonth = aggregates.perMonth || {};
  const totalTasks = aggregates.totalTasks || 0;
  const workflow = parsed.workflowMeta || {};
  const stampsClosedKeywords = Array.isArray(workflow.stampsClosedKeywords) && workflow.stampsClosedKeywords.length
    ? workflow.stampsClosedKeywords
    : ["DONE"];
  const forwardKeywords = Array.isArray(workflow.forwardKeywords) && workflow.forwardKeywords.length
    ? workflow.forwardKeywords
    : ["CONTINUED"];
  const inProgressKeywords = Array.isArray(workflow.inProgressKeywords) && workflow.inProgressKeywords.length
    ? workflow.inProgressKeywords
    : ["IN_PROGRESS"];

  const doneCount = typeof aggregates.completedCount === "number"
    ? aggregates.completedCount
    : stampsClosedKeywords.reduce((sum, k) => sum + (perStatus[k] || 0), 0);

  return {
    year: parsed.year,
    sourceName: path.basename(sourcePath),
    generatedAt: new Date(),
    totals: {
      total: totalTasks,
      done: doneCount,
      completionRate: totalTasks ? ((doneCount / totalTasks) * 100).toFixed(1) : "0.0",
      activeTags: Object.keys(perTag).filter(Boolean).length,
      activeMonths: Object.keys(perMonth).filter(key => key !== "unscheduled").length
    },
    statusBreakdown: rankMap(perStatus),
    topTags: rankMap(perTag, 10),
    timeline: buildTimeline(perMonth),
    wins: collectTasks(parsed.days, task => stampsClosedKeywords.includes(task.status) && (task.tags || []).length, 5),
    carryover: collectTasks(parsed.days, task => forwardKeywords.includes(task.status), 5),
    inProgress: collectTasks(parsed.days, task => inProgressKeywords.includes(task.status), 5)
  };
}

function buildDashboardModel(sourcePath, parsed, options = {}) {
  const base = buildReportModel(sourcePath, parsed);
  const tasks = flattenTasks(parsed.days);
  const monthOrder = buildMonthOrder(parsed.year, tasks);
  const monthlyStatus = buildMonthlyStatusSeries(tasks, monthOrder);
  const tagMatrix = buildTagMatrix(tasks, monthOrder, options.tagLimit || 6);
  const taskFeed = buildTaskFeed(tasks, options.feedLimit || 160);

  const statusTotals = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});

  return {
    ...base,
    generatedAtIso: base.generatedAt instanceof Date ? base.generatedAt.toISOString() : null,
    monthOrder,
    monthlyStatus,
    tagMatrix,
    taskFeed,
    statusTotals
  };
}

function renderMarkdown(model) {
  const lines = [];
  lines.push(`# ${model.year} Year-in-Review`);
  lines.push(`Generated ${model.generatedAt.toLocaleString()} from \`${model.sourceName}\`.`);
  lines.push("");

  lines.push("## Highlights");
  lines.push(`- Total tasks: ${model.totals.total}`);
  lines.push(`- Completed: ${model.totals.done} (${model.totals.completionRate}%)`);
  lines.push(`- Active tags: ${model.totals.activeTags}`);
  lines.push(`- Active months: ${model.totals.activeMonths}`);
  lines.push("");

  lines.push("## Status Breakdown");
  if (!model.statusBreakdown.length) {
    lines.push("_No task statuses recorded._");
  } else {
    model.statusBreakdown.forEach(entry => {
      lines.push(`- **${entry.label}**: ${entry.count}`);
    });
  }
  lines.push("");

  lines.push("## Tag Leaderboard");
  if (!model.topTags.length) {
    lines.push("_No tags were captured in this file._");
  } else {
    model.topTags.forEach(entry => {
      lines.push(`- ${entry.label}: ${entry.count} tasks`);
    });
  }
  lines.push("");

  lines.push("## Monthly Timeline");
  if (!model.timeline.length) {
    lines.push("_No scheduled activity was detected._");
  } else {
    lines.push("| Month | Tasks |");
    lines.push("| --- | ---: |");
    model.timeline.forEach(entry => {
      lines.push(`| ${entry.label} | ${entry.count} |`);
    });
  }
  lines.push("");

  lines.push(...renderTaskListMarkdown("Notable Wins", model.wins, "These tagged DONE items are great resume bullets."));
  lines.push(...renderTaskListMarkdown("Carryover Watch", model.carryover, "CONTINUED items that may need attention."));
  lines.push(...renderTaskListMarkdown("In-Progress Focus", model.inProgress, "IN_PROGRESS items that are still moving."));

  return lines.join("\n");
}

function renderHtml(model) {
  const body = html`<>
  <h1>${model.year} Year-in-Review</h1>
  <p class="lede">Generated ${model.generatedAt.toLocaleString()} from ${model.sourceName}.</p>

  <h2>Highlights</h2>
  <ul>
    <li>Total tasks: ${model.totals.total}</li>
    <li>Completed: ${model.totals.done} (${model.totals.completionRate}%)</li>
    <li>Active tags: ${model.totals.activeTags}</li>
    <li>Active months: ${model.totals.activeMonths}</li>
  </ul>

  ${renderStatusHtml(model.statusBreakdown)}
  ${renderTagHtml(model.topTags)}
  ${renderTimelineHtml(model.timeline)}
  ${renderTaskSectionHtml("Notable Wins", model.wins)}
  ${renderTaskSectionHtml("Carryover Watch", model.carryover)}
  ${renderTaskSectionHtml("In-Progress Focus", model.inProgress)}
</>`;

  return new SafeHtml(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeText(model.year)} Year-in-Review</title>
<style>
  body { font-family: "Fira Sans", "Segoe UI", sans-serif; margin: 32px; color: #1f2328; }
  h1 { font-size: 1.9rem; margin-bottom: 0.2rem; }
  h2 { margin-top: 2rem; font-size: 1.3rem; }
  ul { padding-left: 1.25rem; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
  th, td { border: 1px solid #d0d7de; padding: 0.35rem 0.5rem; }
  th { text-align: left; background: #f6f8fa; }
  td.count { text-align: right; }
  .muted { color: #57606a; font-style: italic; }
  .lede { margin-bottom: 1.5rem; color: #4b5563; }
</style>
</head>
<body>
  ${body}
</body>
</html>`);
}

function rankMap(map = {}, limit = Infinity) {
  return Object.entries(map)
    .filter(([key]) => key && key !== "undefined")
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function buildTimeline(perMonth = {}) {
  const entries = Object.entries(perMonth).map(([key, count]) => {
    if (key === "unscheduled") {
      return { key, label: "Unscheduled", count };
    }
    const bucket = moment(key, "YYYY-MM", true);
    const label = bucket.isValid() ? bucket.format("MMM YYYY") : key;
    return { key, label, count };
  });

  return entries.sort((a, b) => {
    if (a.key === "unscheduled") {
      return 1;
    }
    if (b.key === "unscheduled") {
      return -1;
    }
    return a.key.localeCompare(b.key);
  });
}

function collectTasks(days = [], predicate, limit) {
  const results = [];
  days.forEach(day => {
    (day.tasks || []).forEach(task => {
      if (predicate(task)) {
        results.push({
          date: day.date,
          title: sanitizeText(task.title),
          tags: task.tags || [],
          status: task.status
        });
      }
    });
  });
  return typeof limit === "number" ? results.slice(0, limit) : results;
}

function renderTaskListMarkdown(title, tasks, emptyMessage) {
  const lines = [];
  lines.push(`## ${title}`);
  if (!tasks.length) {
    lines.push(emptyMessage ? `_${emptyMessage}_` : "_No items to show._");
    lines.push("");
    return lines;
  }
  tasks.forEach(task => {
    const tagSuffix = task.tags.length ? ` (tags: ${task.tags.join(", ")})` : "";
    lines.push(`- ${task.date}: ${task.title}${tagSuffix}`);
  });
  lines.push("");
  return lines;
}

function renderStatusHtml(entries) {
  if (!entries.length) {
    return html`<h2>Status Breakdown</h2><p class="muted">No task statuses recorded.</p>`;
  }
  const list = entries.map(entry => html`<li><strong>${entry.label}</strong>: ${entry.count}</li>`);
  return html`<h2>Status Breakdown</h2><ul>${list}</ul>`;
}

function renderTagHtml(entries) {
  if (!entries.length) {
    return html`<h2>Tag Leaderboard</h2><p class="muted">No tags were captured in this file.</p>`;
  }
  const list = entries.map(entry => html`<li>${entry.label}: ${entry.count} tasks</li>`);
  return html`<h2>Tag Leaderboard</h2><ul>${list}</ul>`;
}

function renderTimelineHtml(entries) {
  if (!entries.length) {
    return html`<h2>Monthly Timeline</h2><p class="muted">No scheduled activity was detected.</p>`;
  }
  const rows = entries.map(entry => html`<tr><td>${entry.label}</td><td class="count">${entry.count}</td></tr>`);
  return html`<h2>Monthly Timeline</h2><table><thead><tr><th>Month</th><th>Tasks</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderTaskSectionHtml(title, tasks) {
  if (!tasks.length) {
    return html`<h2>${title}</h2><p class="muted">No items to show.</p>`;
  }
  const items = tasks.map(task => {
    const tagSuffix = task.tags.length ? html` <span class="muted">(tags: ${task.tags.join(", ")})</span>` : "";
    return html`<li><strong>${task.date}</strong>: ${task.title}${tagSuffix}</li>`;
  });
  return html`<h2>${title}</h2><ul>${items}</ul>`;
}

function sanitizeText(value) {
  if (!value) {
    return "";
  }
  return String(value)
    .replace(/^\s*\*+\s+/, " ")
    .replace(ORG_SYMBOL_REGEX, " ")
    .trim();
}

function flattenTasks(days = []) {
  const tasks = [];
  let id = 1;
  days.forEach(day => {
    (day.tasks || []).forEach(task => {
      const scheduledMoment = moment(task.scheduled || day.date, ["MM-DD-YYYY", "YYYY-MM-DD"], true);
      const dayMoment = moment(day.date, ["MM-DD-YYYY", "YYYY-MM-DD"], true);
      tasks.push({
        id: id++,
        date: day.date,
        weekday: day.weekday,
        title: sanitizeText(task.title),
        status: task.status,
        tags: task.tags || [],
        scheduled: task.scheduled,
        completed: task.completed,
        notes: task.notes || [],
        lineNumber: task.lineNumber || null,
        monthKey: scheduledMoment.isValid() ? scheduledMoment.format("YYYY-MM") : "unscheduled",
        monthLabel: scheduledMoment.isValid() ? scheduledMoment.format("MMM") : "Unscheduled",
        timestamp: dayMoment.isValid() ? dayMoment.valueOf() : 0
      });
    });
  });
  return tasks;
}

function buildMonthOrder(year, tasks = []) {
  const months = [];
  for (let i = 0; i < 12; i++) {
    const bucket = moment({ year, month: i, day: 1 });
    months.push({ key: bucket.format("YYYY-MM"), label: bucket.format("MMM") });
  }
  const hasUnscheduled = tasks.some(task => task.monthKey === "unscheduled");
  if (hasUnscheduled) {
    months.push({ key: "unscheduled", label: "Unscheduled" });
  }
  return months;
}

function buildMonthlyStatusSeries(tasks, monthOrder) {
  const map = {};
  tasks.forEach(task => {
    if (!map[task.monthKey]) {
      map[task.monthKey] = { total: 0, perStatus: {} };
    }
    map[task.monthKey].total += 1;
    map[task.monthKey].perStatus[task.status] = (map[task.monthKey].perStatus[task.status] || 0) + 1;
  });

  return monthOrder.map(entry => {
    const bucket = map[entry.key] || { total: 0, perStatus: {} };
    return {
      key: entry.key,
      label: entry.label,
      total: bucket.total,
      perStatus: bucket.perStatus
    };
  });
}

function buildTagMatrix(tasks, monthOrder, limit) {
  const map = {};
  tasks.forEach(task => {
    (task.tags || []).forEach(tag => {
      if (!tag) {
        return;
      }
      if (!map[tag]) {
        map[tag] = { tag, total: 0, months: {} };
      }
      map[tag].total += 1;
      map[tag].months[task.monthKey] = (map[tag].months[task.monthKey] || 0) + 1;
    });
  });

  const ranked = Object.values(map)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return ranked.map(entry => ({
    tag: entry.tag,
    total: entry.total,
    monthly: monthOrder.map(month => ({
      key: month.key,
      label: month.label,
      count: entry.months[month.key] || 0
    }))
  }));
}

function buildTaskFeed(tasks, limit) {
  const sorted = tasks.slice().sort((a, b) => {
    if (b.timestamp === a.timestamp) {
      return b.id - a.id;
    }
    return b.timestamp - a.timestamp;
  });

  return sorted.slice(0, limit).map(task => ({
    id: task.id,
    date: task.date,
    weekday: task.weekday,
    displayDate: formatDisplayDate(task.date, task.weekday),
    title: task.title,
    status: task.status,
    tags: task.tags,
    monthKey: task.monthKey,
    monthLabel: task.monthLabel,
    lineNumber: task.lineNumber
  }));
}

function formatDisplayDate(date, weekday) {
  const parsed = moment(date, ["MM-DD-YYYY", "YYYY-MM-DD"], true);
  if (!parsed.isValid()) {
    return date || "";
  }
  const label = parsed.format("MMM DD");
  return weekday ? `${label} · ${weekday}` : label;
}

module.exports = {
  buildReportModel,
  buildDashboardModel,
  renderMarkdown,
  renderHtml
};
