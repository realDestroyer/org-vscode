const moment = require("moment");
const { toDateKey } = require("./yearDateUtils");

const ABANDON_FALLBACK_REGEX = /ABANDON|CANCEL|DROP/i;

function normalizeTitleKey(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function daysBetween(fromKey, toKey) {
  const from = moment(fromKey, "YYYY-MM-DD", true);
  const to = moment(toKey, "YYYY-MM-DD", true);
  if (!from.isValid() || !to.isValid()) {
    return null;
  }
  return to.diff(from, "days");
}

function percentile(sorted, fraction) {
  if (!sorted.length) {
    return 0;
  }
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

function summarizeDurations(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    count: sorted.length,
    averageDays: sorted.length ? Number((total / sorted.length).toFixed(1)) : 0,
    medianDays: percentile(sorted, 0.5),
    p90Days: percentile(sorted, 0.9)
  };
}

/** Flatten day buckets into tasks with normalized dates and workflow classification. */
function flattenForMetrics(days, workflow) {
  const doneLike = new Set(workflow.doneLikeKeywords || []);
  const stampsClosed = new Set(workflow.stampsClosedKeywords || []);
  const forward = new Set(workflow.forwardKeywords || []);
  const inProgress = new Set(workflow.inProgressKeywords || []);

  const abandoned = new Set(
    (workflow.doneLikeKeywords || []).filter(keyword => !stampsClosed.has(keyword))
  );

  const tasks = [];
  (days || []).forEach(day => {
    const dayKey = toDateKey(day.date);
    (day.tasks || []).forEach(task => {
      const scheduledKey = toDateKey(task.scheduled);
      const closedKey = toDateKey(task.completed);
      const deadlineKey = toDateKey(task.deadline);
      const status = task.status || "";
      const isAbandoned = abandoned.has(status) || (!abandoned.size && ABANDON_FALLBACK_REGEX.test(status));

      tasks.push({
        ...task,
        dayKey,
        scheduledKey,
        closedKey,
        deadlineKey,
        activityKey: scheduledKey || dayKey || closedKey,
        isDoneLike: doneLike.has(status),
        isCompleted: stampsClosed.has(status) || Boolean(closedKey && doneLike.has(status)),
        isForwarded: forward.has(status),
        isInProgress: inProgress.has(status),
        isAbandoned
      });
    });
  });

  return tasks;
}

function buildDeadlineMetrics(tasks, today) {
  const withDeadline = tasks.filter(task => task.deadlineKey);
  const resolved = [];
  const overdue = [];

  withDeadline.forEach(task => {
    if (task.closedKey) {
      const slip = daysBetween(task.deadlineKey, task.closedKey);
      if (slip === null) {
        return;
      }
      resolved.push({ task, slip });
      return;
    }
    if (!task.isDoneLike && task.deadlineKey < today) {
      overdue.push({
        title: task.title,
        deadline: task.deadlineKey,
        status: task.status,
        daysOverdue: daysBetween(task.deadlineKey, today) || 0,
        lineNumber: task.lineNumber
      });
    }
  });

  const late = resolved.filter(entry => entry.slip > 0);
  const onTime = resolved.filter(entry => entry.slip <= 0);
  const totalLateDays = late.reduce((sum, entry) => sum + entry.slip, 0);

  return {
    tracked: withDeadline.length,
    resolved: resolved.length,
    onTime: onTime.length,
    late: late.length,
    onTimeRate: resolved.length ? Number(((onTime.length / resolved.length) * 100).toFixed(1)) : 0,
    averageDaysLate: late.length ? Number((totalLateDays / late.length).toFixed(1)) : 0,
    overdueOpen: overdue.length,
    worstMisses: late
      .sort((a, b) => b.slip - a.slip)
      .slice(0, 10)
      .map(entry => ({
        title: entry.task.title,
        deadline: entry.task.deadlineKey,
        closed: entry.task.closedKey,
        daysLate: entry.slip,
        tags: entry.task.tags || [],
        lineNumber: entry.task.lineNumber
      })),
    overdueList: overdue.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 25)
  };
}

function buildCycleTimeMetrics(tasks) {
  const planned = [];
  const active = [];
  const longest = [];

  tasks.forEach(task => {
    if (task.scheduledKey && task.closedKey) {
      const span = daysBetween(task.scheduledKey, task.closedKey);
      if (span !== null && span >= 0) {
        planned.push(span);
        longest.push({
          title: task.title,
          days: span,
          scheduled: task.scheduledKey,
          closed: task.closedKey,
          tags: task.tags || [],
          lineNumber: task.lineNumber
        });
      }
    }

    const changes = task.stateChanges || [];
    // Org writes LOGBOOK newest-first, so span from the extremes rather than the ends.
    if (changes.length > 1) {
      const keys = changes.map(change => toDateKey(change?.at)).filter(Boolean).sort();
      const span = keys.length > 1 ? daysBetween(keys[0], keys[keys.length - 1]) : null;
      if (span !== null && span >= 0) {
        active.push(span);
      }
    }
  });

  return {
    scheduledToClosed: summarizeDurations(planned),
    logbookSpan: summarizeDurations(active),
    longest: longest.sort((a, b) => b.days - a.days).slice(0, 10)
  };
}

function buildCarryoverMetrics(tasks) {
  const chains = new Map();

  tasks.forEach(task => {
    if (!task.isForwarded) {
      return;
    }
    const key = normalizeTitleKey(task.title);
    if (!key) {
      return;
    }
    const existing = chains.get(key) || {
      title: task.title,
      forwards: 0,
      tags: task.tags || [],
      firstSeen: task.activityKey || "",
      lastSeen: task.activityKey || "",
      lineNumber: task.lineNumber
    };
    existing.forwards += 1;
    if (task.activityKey) {
      if (!existing.firstSeen || task.activityKey < existing.firstSeen) {
        existing.firstSeen = task.activityKey;
      }
      if (!existing.lastSeen || task.activityKey > existing.lastSeen) {
        existing.lastSeen = task.activityKey;
        existing.lineNumber = task.lineNumber;
      }
    }
    chains.set(key, existing);
  });

  const completedTitles = new Set(
    tasks.filter(task => task.isCompleted).map(task => normalizeTitleKey(task.title))
  );

  const ranked = Array.from(chains.values()).sort((a, b) => b.forwards - a.forwards);

  return {
    forwardedTasks: tasks.filter(task => task.isForwarded).length,
    uniqueChains: ranked.length,
    resolvedChains: ranked.filter(chain => completedTitles.has(normalizeTitleKey(chain.title))).length,
    topChains: ranked.slice(0, 15).map(chain => ({
      ...chain,
      resolved: completedTitles.has(normalizeTitleKey(chain.title))
    }))
  };
}

function buildTagPairs(tasks, limit = 15) {
  const pairs = new Map();

  tasks.forEach(task => {
    const tags = Array.from(new Set((task.tags || []).filter(Boolean))).sort();
    for (let i = 0; i < tags.length; i++) {
      for (let j = i + 1; j < tags.length; j++) {
        const key = `${tags[i]}\u0000${tags[j]}`;
        pairs.set(key, (pairs.get(key) || 0) + 1);
      }
    }
  });

  return Array.from(pairs.entries())
    .map(([key, count]) => {
      const [a, b] = key.split("\u0000");
      return { a, b, count };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, limit);
}

function buildConsistencyMetrics(tasks) {
  const perDay = new Map();
  tasks.forEach(task => {
    if (!task.activityKey) {
      return;
    }
    perDay.set(task.activityKey, (perDay.get(task.activityKey) || 0) + 1);
  });

  const activeDays = Array.from(perDay.keys()).sort();
  let longestStreak = activeDays.length ? 1 : 0;
  let currentStreak = activeDays.length ? 1 : 0;
  let longestGap = 0;
  let gapStart = "";
  let gapEnd = "";

  for (let i = 1; i < activeDays.length; i++) {
    const delta = daysBetween(activeDays[i - 1], activeDays[i]);
    if (delta === 1) {
      currentStreak += 1;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 1;
      if (delta !== null && delta - 1 > longestGap) {
        longestGap = delta - 1;
        gapStart = activeDays[i - 1];
        gapEnd = activeDays[i];
      }
    }
  }

  const perWeek = new Map();
  perDay.forEach((count, key) => {
    const week = moment(key, "YYYY-MM-DD", true);
    if (!week.isValid()) {
      return;
    }
    const weekKey = week.format("GGGG-[W]WW");
    perWeek.set(weekKey, (perWeek.get(weekKey) || 0) + count);
  });

  const busiest = Array.from(perWeek.entries()).sort((a, b) => b[1] - a[1])[0];
  const busiestDay = Array.from(perDay.entries()).sort((a, b) => b[1] - a[1])[0];
  const abandonedCount = tasks.filter(task => task.isAbandoned).length;

  return {
    activeDays: activeDays.length,
    longestStreakDays: longestStreak,
    longestGapDays: longestGap,
    longestGapRange: longestGap ? { from: gapStart, to: gapEnd } : null,
    busiestWeek: busiest ? { week: busiest[0], count: busiest[1] } : null,
    busiestDay: busiestDay ? { date: busiestDay[0], count: busiestDay[1] } : null,
    abandonedCount,
    abandonedRate: tasks.length ? Number(((abandonedCount / tasks.length) * 100).toFixed(1)) : 0
  };
}

function buildClockMetrics(tasks) {
  const perTag = new Map();
  const perMonth = new Map();
  const clocked = [];
  let totalMinutes = 0;

  tasks.forEach(task => {
    const minutes = Number(task.clockMinutes) || 0;
    if (minutes <= 0) {
      return;
    }
    totalMinutes += minutes;
    clocked.push({
      title: task.title,
      minutes,
      hours: Number((minutes / 60).toFixed(2)),
      tags: task.tags || [],
      lineNumber: task.lineNumber
    });

    (task.tags || []).forEach(tag => {
      if (tag) {
        perTag.set(tag, (perTag.get(tag) || 0) + minutes);
      }
    });

    const monthKey = (task.activityKey || "").slice(0, 7);
    if (monthKey) {
      perMonth.set(monthKey, (perMonth.get(monthKey) || 0) + minutes);
    }
  });

  const toHourList = map => Array.from(map.entries())
    .map(([key, minutes]) => ({ key, minutes, hours: Number((minutes / 60).toFixed(2)) }))
    .sort((a, b) => b.minutes - a.minutes);

  return {
    totalMinutes,
    totalHours: Number((totalMinutes / 60).toFixed(1)),
    trackedTasks: clocked.length,
    perTag: toHourList(perTag).slice(0, 20),
    perMonth: toHourList(perMonth).sort((a, b) => a.key.localeCompare(b.key)),
    topTasks: clocked.sort((a, b) => b.minutes - a.minutes).slice(0, 10)
  };
}

function buildHygieneMetrics(tasks, today, staleDays) {
  const staleCutoff = moment(today, "YYYY-MM-DD", true).subtract(staleDays, "days").format("YYYY-MM-DD");

  const undated = tasks.filter(task => !task.scheduledKey && !task.deadlineKey && !task.closedKey);
  const neverClosed = tasks.filter(task => !task.isDoneLike && task.scheduledKey && task.scheduledKey < today);
  const staleInProgress = tasks.filter(task => task.isInProgress && task.scheduledKey && task.scheduledKey < staleCutoff);
  const missingTags = tasks.filter(task => !(task.tags || []).length);

  const shape = list => list.slice(0, 25).map(task => ({
    title: task.title,
    status: task.status,
    date: task.activityKey || "",
    lineNumber: task.lineNumber
  }));

  return {
    undatedCount: undated.length,
    neverClosedCount: neverClosed.length,
    staleInProgressCount: staleInProgress.length,
    untaggedCount: missingTags.length,
    undated: shape(undated),
    neverClosed: shape(neverClosed),
    staleInProgress: shape(staleInProgress)
  };
}

function buildProjectRollups(tasks, limit = 15) {
  const byLine = new Map(tasks.map(task => [task.lineNumber, task]));
  const rollups = new Map();

  tasks.forEach(task => {
    if (!task.parentLine) {
      return;
    }
    const parent = byLine.get(task.parentLine);
    if (!parent) {
      return;
    }
    const entry = rollups.get(parent.lineNumber) || {
      title: parent.title,
      status: parent.status,
      tags: parent.tags || [],
      lineNumber: parent.lineNumber,
      total: 0,
      done: 0
    };
    entry.total += 1;
    if (task.isCompleted) {
      entry.done += 1;
    }
    rollups.set(parent.lineNumber, entry);
  });

  return Array.from(rollups.values())
    .map(entry => ({
      ...entry,
      percent: entry.total ? Math.round((entry.done / entry.total) * 100) : 0
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

function buildQuarterMetrics(tasks) {
  const quarters = [1, 2, 3, 4].map(quarter => ({ quarter: `Q${quarter}`, total: 0, done: 0, hours: 0 }));

  tasks.forEach(task => {
    const key = task.activityKey;
    if (!key) {
      return;
    }
    const month = Number(key.slice(5, 7));
    if (!month) {
      return;
    }
    const bucket = quarters[Math.floor((month - 1) / 3)];
    bucket.total += 1;
    if (task.isCompleted) {
      bucket.done += 1;
    }
    bucket.hours += (Number(task.clockMinutes) || 0) / 60;
  });

  return quarters.map(bucket => ({
    ...bucket,
    hours: Number(bucket.hours.toFixed(1)),
    completionRate: bucket.total ? Number(((bucket.done / bucket.total) * 100).toFixed(1)) : 0
  }));
}

/** Rank completed work by evidence of substance rather than file order. */
function buildRankedWins(tasks, limit = 15) {
  return tasks
    .filter(task => task.isCompleted)
    .map(task => {
      const noteWeight = Math.min((task.notes || []).length, 20) * 0.25;
      const childWeight = (task.childCount || 0) * 2;
      const tagWeight = Math.min((task.tags || []).length, 6);
      const clockWeight = Math.min((Number(task.clockMinutes) || 0) / 60, 20) * 0.5;
      const deadlineWeight = task.deadlineKey && task.closedKey && task.closedKey <= task.deadlineKey ? 2 : 0;
      const priorityWeight = task.priority === "A" ? 3 : task.priority === "B" ? 1.5 : 0;
      const score = noteWeight + childWeight + tagWeight + clockWeight + deadlineWeight + priorityWeight;

      return {
        title: task.title,
        status: task.status,
        tags: task.tags || [],
        date: task.closedKey || task.activityKey || "",
        subtasks: task.childCount || 0,
        hours: Number(((Number(task.clockMinutes) || 0) / 60).toFixed(2)),
        lineNumber: task.lineNumber,
        score: Number(score.toFixed(2))
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Group completed work by tag into review-ready achievement lines. */
function buildResumeBullets(tasks, limit = 12) {
  const byTag = new Map();

  tasks.forEach(task => {
    if (!task.isCompleted) {
      return;
    }
    (task.tags || []).forEach(tag => {
      if (!tag) {
        return;
      }
      const entry = byTag.get(tag) || { tag, count: 0, hours: 0, examples: [] };
      entry.count += 1;
      entry.hours += (Number(task.clockMinutes) || 0) / 60;
      if (entry.examples.length < 3 && task.title) {
        entry.examples.push(task.title);
      }
      byTag.set(tag, entry);
    });
  });

  return Array.from(byTag.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(entry => {
      const hours = Number(entry.hours.toFixed(1));
      const hourText = hours > 0 ? ` (${hours}h tracked)` : "";
      return {
        tag: entry.tag,
        count: entry.count,
        hours,
        examples: entry.examples,
        text: `${entry.tag}: delivered ${entry.count} item${entry.count === 1 ? "" : "s"}${hourText} — e.g. ${entry.examples.join("; ")}`
      };
    });
}

function buildYearMetrics(days, workflowMeta, year, settings = {}) {
  const tasks = flattenForMetrics(days, workflowMeta || {});
  const now = moment();
  const staleDays = Number(settings.staleTaskDays) > 0 ? Number(settings.staleTaskDays) : 30;
  const highlightLimit = Number(settings.highlightLimit) > 0 ? Number(settings.highlightLimit) : 10;
  // For past years, "today" is the end of that year so overdue math stays meaningful.
  const today = Number.isInteger(year) && year < now.year()
    ? `${year}-12-31`
    : now.format("YYYY-MM-DD");

  return {
    deadlines: buildDeadlineMetrics(tasks, today),
    cycleTimes: buildCycleTimeMetrics(tasks),
    carryover: buildCarryoverMetrics(tasks),
    tagPairs: buildTagPairs(tasks),
    consistency: buildConsistencyMetrics(tasks),
    clock: buildClockMetrics(tasks),
    hygiene: buildHygieneMetrics(tasks, today, staleDays),
    projects: buildProjectRollups(tasks),
    quarters: buildQuarterMetrics(tasks),
    rankedWins: buildRankedWins(tasks, Math.max(highlightLimit, 10)),
    resumeBullets: buildResumeBullets(tasks)
  };
}

function buildYearComparison(days, workflowMeta) {
  const tasks = flattenForMetrics(days, workflowMeta || {});
  const byYear = new Map();

  tasks.forEach(task => {
    const key = task.activityKey;
    if (!key) {
      return;
    }
    const year = Number(key.slice(0, 4));
    const entry = byYear.get(year) || { year, total: 0, done: 0, minutes: 0, tags: new Set() };
    entry.total += 1;
    if (task.isCompleted) {
      entry.done += 1;
    }
    entry.minutes += Number(task.clockMinutes) || 0;
    (task.tags || []).forEach(tag => tag && entry.tags.add(tag));
    byYear.set(year, entry);
  });

  return Array.from(byYear.values())
    .map(entry => ({
      year: entry.year,
      total: entry.total,
      done: entry.done,
      completionRate: entry.total ? Number(((entry.done / entry.total) * 100).toFixed(1)) : 0,
      hours: Number((entry.minutes / 60).toFixed(1)),
      activeTags: entry.tags.size
    }))
    .sort((a, b) => a.year - b.year);
}

module.exports = {
  buildYearMetrics,
  buildYearComparison
};
