import fs from "fs";
import path from "path";

function isDayHeading(line) {
  return /^\*\s*\[[0-9]{2}-[0-9]{2}-[0-9]{4}\s+\w{3}\]/.test(line) || /^\*\s*\[[0-9]{4}-[0-9]{2}-[0-9]{2}\s+\w{3}\]/.test(line);
}

const TASK_KEYWORDS = [
  "TODO",
  "IN_PROGRESS",
  "DONE",
  "CONTINUED",
  "ABANDONED"
];

const taskKeywordAlt = TASK_KEYWORDS.map(k => k.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|");
const taskRe = new RegExp(`^\\s*\\*+\\s*(${taskKeywordAlt})(?:\\s*:?\\s*|:?\\s+)(.*)$`, "i");
const taskInListItemRe = new RegExp(`^(\\s*[-+]\\s+)\\s*\\*+\\s*(${taskKeywordAlt})(?:\\s*:?\\s*|:?\\s+)(.*)$`, "i");
const malformedStarPrefixedTaskRe = new RegExp(`^\\*\\s+\\*+\\s*(${taskKeywordAlt})(?:\\s*:?\\s*|:?\\s+)(.*)$`, "i");

function normalizeTaskLine(line) {
  const m = line.match(taskRe);
  if (!m) return null;

  const keyword = String(m[1] || "").toUpperCase();
  let rest = String(m[2] || "").trimStart();
  if (rest.startsWith(":")) rest = rest.slice(1).trimStart();
  return ` * ${keyword} ${rest}`.replace(/\s+$/, "");
}

function normalizeTaskLineInListItem(line) {
  const m = line.match(taskInListItemRe);
  if (!m) return null;
  const prefix = m[1] || "";
  const keyword = String(m[2] || "").toUpperCase();
  let rest = String(m[3] || "").trimStart();
  rest = rest.replace(/^:+\s*/, "");
  // Collapse accidental double-colons like CONTINUED::
  rest = rest.replace(/^:/, "").trimStart();
  return `${prefix}${keyword} ${rest}`.replace(/\s+$/, "");
}

function normalizeMalformedStarPrefixedTask(line) {
  // Handles lines like: "*    * CONTINUED : Test again"
  const m = line.match(malformedStarPrefixedTaskRe);
  if (!m) return null;
  const keyword = String(m[1] || "").toUpperCase();
  let rest = String(m[2] || "").trimStart();
  rest = rest.replace(/^:+\\s*/, "");
  rest = rest.replace(/^:/, "").trimStart();
  return ` * ${keyword} ${rest}`.replace(/\\s+$/, "");
}

function normalizeStarNoteLine(line) {
  // Lines like: "        ** THANK YOU" or "******** http://..."
  const m = line.match(/^(\s*)\*{2,}\s*(.*)$/);
  if (!m) return null;

  const indent = m[1] || "";
  const body = (m[2] || "").trimStart();

  // If it looks like a URL, make it a bullet.
  if (/^https?:\/\//i.test(body)) {
    return `${indent}- ${body}`;
  }

  // If the line already looks like a list item, just de-star it.
  if (/^[-+]/.test(body)) {
    return `${indent}${body}`;
  }

  // Default: convert to a list item (matches the style in 2026 notes).
  return `${indent}- ${body}`;
}

function normalizeIndentedSingleStarToBullet(line) {
  // Convert accidental indented headings like "        * Remember ..." to bullets.
  // Only applies when the star is indented (not at column 0).
  const m = line.match(/^(\s+)\*\s+(.*)$/);
  if (!m) return null;
  const indent = m[1] || "";
  const body = (m[2] || "").trimStart();
  if (!body) return "";
  // Don't convert if it looks like a task keyword line; those are handled elsewhere.
  if (new RegExp(`^(${taskKeywordAlt})(?:\\s*:?\\s*|:?\\s+)`, "i").test(body)) {
    return null;
  }
  // Preserve plain org list items that already start with '-' or '+'
  if (/^[-+]/.test(body)) return `${indent}${body}`;
  return `${indent}- ${body}`;
}

function normalizeManyStarsNoIndent(line) {
  // Catch cases with no leading spaces: "******** https://..."
  const m = line.match(/^\*{4,}\s*(.*)$/);
  if (!m) return null;
  const body = (m[1] || "").trimStart();
  if (!body) return "";
  if (/^https?:\/\//i.test(body)) return `    - ${body}`;
  return `    ${body}`;
}

function run(inputPath, { backup = true } = {}) {
  const original = fs.readFileSync(inputPath, "utf8");
  const lines = original.split(/\r?\n/);

  const out = lines.map((line) => {
    // Preserve day headings exactly.
    if (isDayHeading(line)) return line;

    const malformedStarTask = normalizeMalformedStarPrefixedTask(line);
    if (malformedStarTask) return malformedStarTask;

    // Normalize task keyword lines that appear inside list items.
    const normalizedTaskInList = normalizeTaskLineInListItem(line);
    if (normalizedTaskInList) return normalizedTaskInList;

    // Normalize obvious task lines (any star-count), except day headings.
    const normalizedTask = normalizeTaskLine(line);
    if (normalizedTask) return normalizedTask;

    // Normalize massively-starred lines (usually accidental headings).
    const manyStars = normalizeManyStarsNoIndent(line);
    if (manyStars !== null) return manyStars;

    // Convert indented "**" note lines into bullets.
    const note = normalizeStarNoteLine(line);
    if (note) return note;

    // Convert indented single-star lines into bullets.
    const singleStarBullet = normalizeIndentedSingleStarToBullet(line);
    if (singleStarBullet !== null) return singleStarBullet;

    return line;
  });

  const updated = out.join("\n");

  if (backup) {
    const backupPath = `${inputPath}.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, original, "utf8");
    }
  }

  fs.writeFileSync(inputPath, updated, "utf8");
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: node tools/normalize-org-todo.mjs <path-to-org-file>");
  process.exit(2);
}

run(path.resolve(target));
