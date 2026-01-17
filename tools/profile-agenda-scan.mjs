import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";

const repoRoot = path.resolve(process.cwd());
const outRoot = path.join(repoRoot, "org-vscode", "out");

// CommonJS requires from ESM
const require = (await import("module")).createRequire(import.meta.url);

const taskKeywordManager = require(path.join(outRoot, "taskKeywordManager.js"));
const { getPlanningForHeading, getAcceptedDateFormats } = require(path.join(outRoot, "orgTagUtils.js"));

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

function buildTaskPrefixCaptureRegexFromRegistry(registry) {
  const states = registry?.states || [];
  const kws = registry?.getCycleKeywords ? registry.getCycleKeywords() : [];
  const keywordAlt = kws.map(escapeRegExp).join("|");

  const markers = states
    .map((s) => s.marker)
    .filter((m) => typeof m === "string" && m.length > 0);
  const markerAlt = Array.from(new Set(markers)).map(escapeRegExp).join("|");
  const markerPart = markerAlt ? `(?:${markerAlt})\\s*` : "";

  return new RegExp(`^(?:\\s*)(?:${markerPart})?(?:\\*+\\s+)?(${keywordAlt})\\b`, "i");
}

function scanCached(lines, headingStartRegex, taskPrefixRe) {
  let scheduledCount = 0;
  let visibleHeadingCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = String(line || "").match(taskPrefixRe);
    if (!m) continue;
    if (!headingStartRegex.test(line)) continue;
    visibleHeadingCount++;

    const next = i + 1 < lines.length ? String(lines[i + 1] || "") : "";
    if (!/\bSCHEDULED:\s*\[/.test(next) && !/\bSCHEDULED:\s*\[/.test(line)) {
      continue;
    }

    const planning = getPlanningForHeading(lines, i);
    if (planning && planning.scheduled) scheduledCount++;
  }
  return { scheduledCount, visibleHeadingCount };
}

function scanBaseline(lines, headingStartRegex) {
  let scheduledCount = 0;
  let visibleHeadingCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const planning = getPlanningForHeading(lines, i);
    const hasScheduled = Boolean(planning && planning.scheduled);

    const status = taskKeywordManager.findTaskKeyword(lines[i]);
    const isHeading = Boolean(status && headingStartRegex.test(lines[i]));

    if (isHeading) visibleHeadingCount++;
    if (hasScheduled && isHeading) scheduledCount++;
  }
  return { scheduledCount, visibleHeadingCount };
}

function scanOptimized(lines, headingStartRegex) {
  let scheduledCount = 0;
  let visibleHeadingCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const status = taskKeywordManager.findTaskKeyword(line);
    if (!status) continue;
    if (!headingStartRegex.test(line)) continue;

    visibleHeadingCount++;

    // Only parse planning when it could matter.
    const next = i + 1 < lines.length ? String(lines[i + 1] || "") : "";
    if (!/\bSCHEDULED:\s*\[/.test(next) && !/\bSCHEDULED:\s*\[/.test(line)) {
      continue;
    }

    const planning = getPlanningForHeading(lines, i);
    if (planning && planning.scheduled) scheduledCount++;
  }
  return { scheduledCount, visibleHeadingCount };
}

function main(targetPath) {
  const abs = path.resolve(targetPath);
  const text = fs.readFileSync(abs, "utf8");
  const lines = text.split(/\r?\n/);

  const registry = taskKeywordManager.getWorkflowRegistry();
  const headingStartRegex = buildHeadingStartRegex(registry);
  const taskPrefixRe = buildTaskPrefixCaptureRegexFromRegistry(registry);

  // Warm up once for JIT.
  scanOptimized(lines, headingStartRegex);
  scanCached(lines, headingStartRegex, taskPrefixRe);

  const t0 = performance.now();
  const a = scanBaseline(lines, headingStartRegex);
  const t1 = performance.now();

  const t2 = performance.now();
  const b = scanOptimized(lines, headingStartRegex);
  const t3 = performance.now();

  const t4 = performance.now();
  const c = scanCached(lines, headingStartRegex, taskPrefixRe);
  const t5 = performance.now();

  const baselineMs = t1 - t0;
  const optimizedMs = t3 - t2;
  const cachedMs = t5 - t4;

  console.log(`File: ${abs}`);
  console.log(`Lines: ${lines.length}`);
  console.log(`Baseline:  ${baselineMs.toFixed(1)} ms  (headings=${a.visibleHeadingCount}, scheduled=${a.scheduledCount})`);
  console.log(`Optimized: ${optimizedMs.toFixed(1)} ms  (headings=${b.visibleHeadingCount}, scheduled=${b.scheduledCount})`);
  console.log(`Cached:    ${cachedMs.toFixed(1)} ms  (headings=${c.visibleHeadingCount}, scheduled=${c.scheduledCount})`);
  console.log(`Speedup (opt):    ${(baselineMs / Math.max(optimizedMs, 0.1)).toFixed(2)}x`);
  console.log(`Speedup (cached): ${(baselineMs / Math.max(cachedMs, 0.1)).toFixed(2)}x`);
}

const target = process.argv[2];
if (!target) {
  console.error("Usage: node tools/profile-agenda-scan.mjs <path-to-org-file>");
  process.exit(2);
}

main(target);
