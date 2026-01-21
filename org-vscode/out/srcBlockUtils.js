"use strict";

function isBeginSrcLine(line) {
  return /^\s*#\+BEGIN_SRC\b/i.test(String(line || ""));
}

function isEndSrcLine(line) {
  return /^\s*#\+END_SRC\b/i.test(String(line || ""));
}

function parseLanguageFromBeginLine(line) {
  const text = String(line || "");
  const match = text.match(/^\s*#\+BEGIN_SRC\b(.*)$/i);
  if (!match) return "";
  const rest = String(match[1] || "").trim();
  if (!rest) return "";
  // first token only (ignore header args for now)
  const lang = rest.split(/\s+/)[0];
  return String(lang || "").trim();
}

function normalizeLanguage(language) {
  const l = String(language || "").trim().toLowerCase();
  if (l === "py") return "python";
  if (l === "ps") return "powershell";
  if (l === "ps1") return "powershell";
  if (l === "js") return "javascript";
  if (l === "node") return "javascript";
  if (l === "sh") return "bash";
  if (l === "c++") return "cpp";
  return l;
}

/**
 * Finds the src block that encloses the given line index.
 * Returns null if the cursor is not inside a src block.
 */
function findSrcBlockAtLine(lines, lineIndex) {
  const idx = Number(lineIndex);
  if (!Array.isArray(lines) || !Number.isFinite(idx) || idx < 0 || idx >= lines.length) return null;

  let beginLine = -1;
  for (let i = idx; i >= 0; i--) {
    if (isBeginSrcLine(lines[i])) {
      beginLine = i;
      break;
    }
  }
  if (beginLine < 0) return null;

  let endLine = -1;
  for (let i = beginLine + 1; i < lines.length; i++) {
    if (isEndSrcLine(lines[i])) {
      endLine = i;
      break;
    }
  }
  if (endLine < 0) return null;

  if (idx < beginLine || idx > endLine) return null;

  const language = normalizeLanguage(parseLanguageFromBeginLine(lines[beginLine]));
  const codeLines = lines.slice(beginLine + 1, endLine);

  return {
    beginLine,
    endLine,
    language,
    code: codeLines.join("\n")
  };
}

function formatResultsAsOrgLines(resultText) {
  const raw = String(resultText == null ? "" : resultText);
  const split = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  // Trim trailing empty lines to avoid growing the file forever.
  while (split.length && split[split.length - 1] === "") split.pop();

  if (!split.length) {
    return ["#+RESULTS:", ": (no output)"];
  }

  return ["#+RESULTS:", ...split.map((l) => `: ${l}`)];
}

function isResultsHeaderLine(line) {
  return /^\s*#\+RESULTS:\s*$/i.test(String(line || ""));
}

function isResultsContentLine(line) {
  const t = String(line || "");
  return /^\s*:(?:\s|$)/.test(t) || /^\s*$/.test(t);
}

function findExistingResultsBlockRange(lines, insertionLine) {
  const start = Number(insertionLine);
  if (!Array.isArray(lines) || !Number.isFinite(start) || start < 0 || start >= lines.length) return null;

  if (!isResultsHeaderLine(lines[start])) return null;

  let endExclusive = start + 1;
  while (endExclusive < lines.length && isResultsContentLine(lines[endExclusive])) {
    endExclusive++;
  }

  return { startLine: start, endLineExclusive: endExclusive };
}

/**
 * Inserts/replaces a #+RESULTS block immediately after the given END_SRC line.
 */
function applyResultsAfterEndSrc(lines, endSrcLine, resultText) {
  const endLine = Number(endSrcLine);
  if (!Array.isArray(lines) || !Number.isFinite(endLine) || endLine < 0 || endLine >= lines.length) {
    throw new Error("Invalid endSrcLine");
  }

  const insertionLine = endLine + 1;
  const replacementLines = formatResultsAsOrgLines(resultText);

  const existing = findExistingResultsBlockRange(lines, insertionLine);
  const nextLines = lines.slice();

  if (existing) {
    nextLines.splice(existing.startLine, existing.endLineExclusive - existing.startLine, ...replacementLines);
    return {
      startLine: existing.startLine,
      endLineExclusive: existing.endLineExclusive,
      replacementLines,
      updatedLines: nextLines
    };
  }

  nextLines.splice(insertionLine, 0, ...replacementLines);
  return {
    startLine: insertionLine,
    endLineExclusive: insertionLine,
    replacementLines,
    updatedLines: nextLines
  };
}

module.exports = {
  findSrcBlockAtLine,
  formatResultsAsOrgLines,
  findExistingResultsBlockRange,
  applyResultsAfterEndSrc,
  normalizeLanguage
};
