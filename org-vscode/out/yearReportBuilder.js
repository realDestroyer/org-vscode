const path = require("path");
const moment = require("moment");
const { html, SafeHtml, escapeText } = require("./htmlUtils");
const { toDateKey } = require("./yearDateUtils");

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

  const metrics = parsed.metrics || {};
  const rankedWins = Array.isArray(metrics.rankedWins) ? metrics.rankedWins : [];
  const highlightLimit = Number(parsed.settings?.highlightLimit) > 0 ? Number(parsed.settings.highlightLimit) : 5;

  return {
    year: parsed.year,
    sourceName: path.basename(sourcePath),
    generatedAt: new Date(),
    availableYears: parsed.availableYears || [],
    yearComparison: parsed.yearComparison || [],
    metrics,
    totals: {
      total: totalTasks,
      done: doneCount,
      completionRate: totalTasks ? ((doneCount / totalTasks) * 100).toFixed(1) : "0.0",
      activeTags: Object.keys(perTag).filter(Boolean).length,
      activeMonths: Object.keys(perMonth).filter(key => key !== "unscheduled").length,
      hoursTracked: metrics.clock?.totalHours || 0,
      onTimeRate: metrics.deadlines?.onTimeRate || 0,
      avgCycleDays: metrics.cycleTimes?.scheduledToClosed?.averageDays || 0,
      carryoverChains: metrics.carryover?.uniqueChains || 0
    },
    statusBreakdown: rankMap(perStatus),
    topTags: rankMap(perTag, 10),
    timeline: buildTimeline(perMonth),
    wins: rankedWins.length
      ? rankedWins.slice(0, highlightLimit).map(win => ({ date: win.date, title: sanitizeText(win.title), tags: win.tags || [], status: win.status }))
      : collectTasks(parsed.days, task => stampsClosedKeywords.includes(task.status) && (task.tags || []).length, highlightLimit),
    carryover: collectTasks(parsed.days, task => forwardKeywords.includes(task.status), highlightLimit),
    inProgress: collectTasks(parsed.days, task => inProgressKeywords.includes(task.status), highlightLimit)
  };
}

function buildDashboardModel(sourcePath, parsed, options = {}) {
  const base = buildReportModel(sourcePath, parsed);
  const tasks = flattenTasks(parsed.days);
  const monthOrder = buildMonthOrder(parsed.year, tasks);
  const monthlyStatus = buildMonthlyStatusSeries(tasks, monthOrder);
  const tagLimit = typeof options.tagLimit === "number" ? options.tagLimit : undefined;
  const tagMatrix = buildTagMatrix(tasks, monthOrder, tagLimit);
  const feedLimit = typeof options.feedLimit === "number" ? options.feedLimit : undefined;
  const taskFeed = buildTaskFeed(tasks, feedLimit);

  const statusTotals = tasks.reduce((acc, task) => {
    acc[task.status] = (acc[task.status] || 0) + 1;
    return acc;
  }, {});

  return {
    ...base,
    generatedAtIso: base.generatedAt instanceof Date ? base.generatedAt.toISOString() : null,
    insightSections: buildInsightSections(base),
    monthOrder,
    monthlyStatus,
    tagMatrix,
    taskFeed,
    statusTotals
  };
}

/** Insight sections shared by the Markdown and HTML executive reports. */
function buildInsightSections(model) {
  const metrics = model.metrics || {};
  const sections = [];

  const deadlines = metrics.deadlines;
  if (deadlines && deadlines.tracked) {
    sections.push({
      title: "Delivery Health",
      stats: [
        { label: "Deadlines tracked", value: deadlines.tracked },
        { label: "On-time rate", value: `${deadlines.onTimeRate}%` },
        { label: "Late completions", value: deadlines.late },
        { label: "Average days late", value: deadlines.averageDaysLate },
        { label: "Still overdue", value: deadlines.overdueOpen }
      ],
      list: (deadlines.worstMisses || []).slice(0, 5).map(item => ({
        label: item.title,
        detail: `${item.daysLate} days late (due ${item.deadline})`,
        lineNumber: item.lineNumber
      }))
    });
  }

  const cycle = metrics.cycleTimes;
  if (cycle && cycle.scheduledToClosed && cycle.scheduledToClosed.count) {
    sections.push({
      title: "Cycle Time",
      stats: [
        { label: "Measured tasks", value: cycle.scheduledToClosed.count },
        { label: "Average days", value: cycle.scheduledToClosed.averageDays },
        { label: "Median days", value: cycle.scheduledToClosed.medianDays },
        { label: "90th percentile", value: cycle.scheduledToClosed.p90Days }
      ],
      list: (cycle.longest || []).slice(0, 5).map(item => ({
        label: item.title,
        detail: `${item.days} days (${item.scheduled} → ${item.closed})`,
        lineNumber: item.lineNumber
      }))
    });
  }

  const clock = metrics.clock;
  if (clock && clock.trackedTasks) {
    sections.push({
      title: "Tracked Time",
      stats: [
        { label: "Total hours", value: clock.totalHours },
        { label: "Tasks with clocks", value: clock.trackedTasks }
      ],
      list: (clock.perTag || []).slice(0, 5).map(item => ({
        label: item.key,
        detail: `${item.hours}h`
      }))
    });
  }

  const quarters = metrics.quarters || [];
  if (quarters.some(q => q.total)) {
    sections.push({
      title: "Quarterly Rollup",
      stats: quarters.map(q => ({ label: q.quarter, value: `${q.done}/${q.total} (${q.completionRate}%)` })),
      list: []
    });
  }

  const consistency = metrics.consistency;
  if (consistency && consistency.activeDays) {
    const stats = [
      { label: "Active days", value: consistency.activeDays },
      { label: "Longest streak", value: `${consistency.longestStreakDays} days` },
      { label: "Longest gap", value: `${consistency.longestGapDays} days` },
      { label: "Abandoned rate", value: `${consistency.abandonedRate}%` }
    ];
    if (consistency.busiestWeek) {
      stats.push({ label: "Busiest week", value: `${consistency.busiestWeek.week} (${consistency.busiestWeek.count})` });
    }
    sections.push({ title: "Consistency", stats, list: [] });
  }

  const carryover = metrics.carryover;
  if (carryover && carryover.forwardedTasks) {
    sections.push({
      title: "Carryover Chains",
      stats: [
        { label: "Forwarded entries", value: carryover.forwardedTasks },
        { label: "Unique chains", value: carryover.uniqueChains },
        { label: "Chains later completed", value: carryover.resolvedChains }
      ],
      list: (carryover.topChains || []).slice(0, 5).map(item => ({
        label: item.title,
        detail: `forwarded ${item.forwards}× (${item.firstSeen} → ${item.lastSeen})${item.resolved ? ", completed" : ""}`,
        lineNumber: item.lineNumber
      }))
    });
  }

  const projects = metrics.projects || [];
  if (projects.length) {
    sections.push({
      title: "Project Rollups",
      stats: [],
      list: projects.slice(0, 8).map(item => ({
        label: item.title,
        detail: `${item.done}/${item.total} subtasks (${item.percent}%)`,
        lineNumber: item.lineNumber
      }))
    });
  }

  const pairs = metrics.tagPairs || [];
  if (pairs.length) {
    sections.push({
      title: "Tag Pairings",
      stats: [],
      list: pairs.slice(0, 8).map(item => ({
        label: `${item.a} + ${item.b}`,
        detail: `${item.count} tasks`
      }))
    });
  }

  const hygiene = metrics.hygiene;
  if (hygiene && (hygiene.undatedCount || hygiene.neverClosedCount || hygiene.staleInProgressCount)) {
    sections.push({
      title: "File Hygiene",
      stats: [
        { label: "Undated tasks", value: hygiene.undatedCount },
        { label: "Past-due and open", value: hygiene.neverClosedCount },
        { label: "Stale in-progress", value: hygiene.staleInProgressCount },
        { label: "Untagged tasks", value: hygiene.untaggedCount }
      ],
      list: (hygiene.staleInProgress || []).slice(0, 5).map(item => ({
        label: item.title,
        detail: `${item.status} since ${item.date || "unknown"}`,
        lineNumber: item.lineNumber
      }))
    });
  }

  const comparison = model.yearComparison || [];
  if (comparison.length > 1) {
    sections.push({
      title: "Year Over Year",
      stats: [],
      list: comparison.map(item => ({
        label: String(item.year),
        detail: `${item.done}/${item.total} done (${item.completionRate}%), ${item.activeTags} tags`
      }))
    });
  }

  return sections;
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
  if (model.totals.hoursTracked) {
    lines.push(`- Hours tracked: ${model.totals.hoursTracked}`);
  }
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

  buildInsightSections(model).forEach(section => {
    lines.push(`## ${section.title}`);
    section.stats.forEach(stat => lines.push(`- ${stat.label}: ${stat.value}`));
    section.list.forEach(item => lines.push(`- ${item.label} — ${item.detail}`));
    lines.push("");
  });

  const bullets = (model.metrics && model.metrics.resumeBullets) || [];
  if (bullets.length) {
    lines.push("## Review Bullets");
    bullets.forEach(bullet => lines.push(`- ${bullet.text}`));
    lines.push("");
  }

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
    <li>Hours tracked: ${model.totals.hoursTracked || 0}</li>
  </ul>

  ${renderStatusHtml(model.statusBreakdown)}
  ${renderTagHtml(model.topTags)}
  ${renderTimelineHtml(model.timeline)}
  ${renderTaskSectionHtml("Notable Wins", model.wins)}
  ${renderTaskSectionHtml("Carryover Watch", model.carryover)}
  ${renderTaskSectionHtml("In-Progress Focus", model.inProgress)}
  ${renderInsightSectionsHtml(model)}
  ${renderBulletsHtml(model)}
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
  .metric-grid { display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 0.5rem 0 0.75rem; padding: 0; list-style: none; }
  .metric-grid li { border: 1px solid #d0d7de; border-radius: 6px; padding: 0.4rem 0.7rem; background: #f6f8fa; }
  .metric-grid strong { display: block; font-size: 1.1rem; }
  @media print {
    body { margin: 0.5in; color: #000; }
    h2 { break-after: avoid; }
    ul, table { break-inside: avoid; }
    .metric-grid li { background: none; }
  }
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

function renderInsightSectionsHtml(model) {
  const sections = buildInsightSections(model);
  if (!sections.length) {
    return html``;
  }

  const blocks = sections.map(section => {
    const stats = section.stats.length
      ? html`<ul class="metric-grid">${section.stats.map(stat => html`<li><strong>${stat.value}</strong>${stat.label}</li>`)}</ul>`
      : html``;
    const list = section.list.length
      ? html`<ul>${section.list.map(item => html`<li><strong>${item.label}</strong> — ${item.detail}</li>`)}</ul>`
      : html``;
    return html`<h2>${section.title}</h2>${stats}${list}`;
  });

  return html`<>${blocks}</>`;
}

function renderBulletsHtml(model) {
  const bullets = (model.metrics && model.metrics.resumeBullets) || [];
  if (!bullets.length) {
    return html``;
  }
  return html`<h2>Review Bullets</h2><ul>${bullets.map(bullet => html`<li>${bullet.text}</li>`)}</ul>`;
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
      const dayKey = toDateKey(day.date);
      const monthKey = toDateKey(task.scheduled) || dayKey;
      const monthMoment = monthKey ? moment(monthKey, "YYYY-MM-DD", true) : null;
      const dayMoment = dayKey ? moment(dayKey, "YYYY-MM-DD", true) : null;
      tasks.push({
        id: id++,
        date: day.date,
        weekday: day.weekday,
        title: sanitizeText(task.title),
        status: task.status,
        tags: task.tags || [],
        scheduled: task.scheduled,
        completed: task.completed,
        deadline: task.deadline,
        priority: task.priority || null,
        subtasks: task.childCount || 0,
        hours: Number(task.clockMinutes) ? Number((Number(task.clockMinutes) / 60).toFixed(2)) : 0,
        notes: task.notes || [],
        lineNumber: task.lineNumber || null,
        monthKey: monthMoment ? monthMoment.format("YYYY-MM") : "unscheduled",
        monthLabel: monthMoment ? monthMoment.format("MMM") : "Unscheduled",
        timestamp: dayMoment ? dayMoment.valueOf() : 0
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

  const rankedAll = Object.values(map)
    .sort((a, b) => b.total - a.total);

  const ranked = typeof limit === "number" && limit > 0
    ? rankedAll.slice(0, limit)
    : rankedAll;

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
    priority: task.priority,
    subtasks: task.subtasks,
    hours: task.hours,
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
  buildInsightSections,
  renderMarkdown,
  renderHtml
};
