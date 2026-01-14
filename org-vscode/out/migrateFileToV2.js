"use strict";

const vscode = require("vscode");
const { normalizeBodyIndentation } = require("./indentUtils");
const {
  getAllTagsFromLine,
  normalizeTagsAfterPlanning,
  setEndOfLineTags,
  isPlanningLine,
  parsePlanningFromText,
  PLANNING_STRIP_RE
} = require("./orgTagUtils");

const SUPPORTED_LANGUAGE_IDS = new Set(["vso", "org", "vsorg", "org-vscode"]);

function extractPlanningFromLine(text) {
  // Reuse parsePlanningFromText which does the same thing
  return parsePlanningFromText(text);
}

function mergePlanning(a, b) {
  const left = a || {};
  const right = b || {};

  // Prefer "right" when present (usually the canonical next-line planning).
  const completed = right.completed || left.completed || null;
  const closed = right.closed || left.closed || null;

  return {
    scheduled: right.scheduled || left.scheduled || null,
    deadline: right.deadline || left.deadline || null,
    closed: closed || completed || null,
    completed
  };
}

function buildPlanningLine(indent, planning, bodyIndent) {
  const p = planning || {};
  const segs = [];
  if (p.scheduled) segs.push(`SCHEDULED: [${p.scheduled}]`);
  if (p.deadline) segs.push(`DEADLINE: [${p.deadline}]`);
  if (p.closed) segs.push(`CLOSED: [${p.closed}]`);
  if (!segs.length) return null;
  const leading = String(indent || "");
  const body = (typeof bodyIndent === "string") ? bodyIndent : "  ";
  const normalizedIndent = leading.length >= body.length ? leading : `${leading}${body}`;
  return `${normalizedIndent}${segs.join("  ")}`;
}

function removeInlinePlanningFromHeadingLine(line) {
  let out = String(line || "");
  // Remove planning tokens on the same line as the heading.
  out = out.replace(new RegExp(PLANNING_STRIP_RE.source, "g"), "");
  return out.replace(/\s+$/g, "");
}

function isHeadingLine(line) {
  const t = String(line || "");
  // Headings are either asterisk-based or asterisk-based with optional unicode symbol prefix.
  // We keep this permissive since users can have either "* TODO" or "⊙ TODO" styles.
  return /^\s*(?:[⊙⊘⊜⊖⊗]\s*)?\*+\s+/.test(t);
}

function migrateTextToV2(fileText, options) {
  const text = String(fileText || "");
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);

  const bodyIndent = (options && typeof options.bodyIndent === "string") ? options.bodyIndent : "  ";

  const stats = {
    convertedLegacyTags: 0,
    movedInlinePlanning: 0,
    normalizedPlanningLines: 0,
    convertedCompletedToClosed: 0
  };

  for (let i = 0; i < lines.length; i++) {
    const originalLine = lines[i];

    // 1) Convert legacy COMPLETED -> CLOSED on planning lines anywhere.
    if (/\bCOMPLETED:\s*\[/.test(originalLine)) {
      const replaced = originalLine.replace(/\bCOMPLETED:(\s*)\[/g, "CLOSED:$1[");
      if (replaced !== originalLine) {
        lines[i] = replaced;
        stats.convertedCompletedToClosed++;
      }
    }

    // 2) Headline migrations: legacy inline tags and inline planning.
    if (!isHeadingLine(lines[i])) {
      continue;
    }

    const currentLine = lines[i];
    const normalizedForParsing = normalizeTagsAfterPlanning(currentLine);

    const tags = getAllTagsFromLine(normalizedForParsing);
    const hadLegacyTagBlock = /\[\+TAG:/i.test(normalizedForParsing);

    const planningFromHeadline = extractPlanningFromLine(normalizedForParsing);
    const hadInlinePlanning = /\b(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\s*\[/.test(normalizedForParsing);

    let updatedHeadline = removeInlinePlanningFromHeadingLine(normalizedForParsing);
    updatedHeadline = setEndOfLineTags(updatedHeadline, tags);

    if (updatedHeadline !== currentLine) {
      lines[i] = updatedHeadline;
    }

    if (hadLegacyTagBlock) {
      stats.convertedLegacyTags++;
    }

    // Planning: merge headline planning into the next line (planning line) or create one.
    const nextIndex = i + 1;
    if (nextIndex >= lines.length) {
      // Heading is the last line in file; still migrate inline planning by appending a planning line.
      if (hadInlinePlanning) {
        const headIndent = (String(lines[i]).match(/^\s*/)?.[0] || "");
        const planningIndent = `${headIndent}${bodyIndent}`;
        const mergedAtEof = mergePlanning(planningFromHeadline, null);
        const newPlanningLineAtEof = buildPlanningLine(planningIndent, mergedAtEof, bodyIndent);
        if (newPlanningLineAtEof) {
          lines.push(newPlanningLineAtEof);
          stats.movedInlinePlanning++;
          i++; // skip over the inserted planning line
        }
      }
      continue;
    }

    const nextLine = lines[nextIndex];
    const nextLooksLikePlanning = isPlanningLine(nextLine) || /^\s*(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\s*\[/.test(String(nextLine || ""));

    const planningFromNext = nextLooksLikePlanning ? parsePlanningFromText(nextLine) : null;

    const merged = mergePlanning(planningFromHeadline, planningFromNext);

    // If we found planning inline on the headline, move it to the planning line.
    const shouldEnsurePlanningLine = hadInlinePlanning || (nextLooksLikePlanning && /\bCOMPLETED:\s*\[/.test(nextLine));

    if (!shouldEnsurePlanningLine) {
      continue;
    }

    // Compute indent: inherit heading indentation, plus two spaces.
    const headIndent = (String(lines[i]).match(/^\s*/)?.[0] || "");
    const planningIndent = `${headIndent}${bodyIndent}`;

    const newPlanningLine = buildPlanningLine(planningIndent, merged, bodyIndent);

    if (newPlanningLine) {
      if (nextLooksLikePlanning) {
        if (newPlanningLine !== nextLine) {
          lines[nextIndex] = newPlanningLine;
          stats.normalizedPlanningLines++;
        }
      } else {
        lines.splice(nextIndex, 0, newPlanningLine);
        stats.movedInlinePlanning++;
        i++; // skip over the inserted planning line
      }
    } else if (nextLooksLikePlanning) {
      // No planning remains after merge; if the next line is only planning content, remove it.
      const stripped = String(nextLine || "").trim();
      const onlyPlanning = /^(?:(?:SCHEDULED|DEADLINE|CLOSED|COMPLETED):\s*\[[^\]]*\]\s*)+$/.test(stripped);
      if (onlyPlanning) {
        lines.splice(nextIndex, 1);
        stats.normalizedPlanningLines++;
      }
    }
  }

  const outText = lines.join(eol);
  return { text: outText, stats };
}

async function migrateFileToV2() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor detected.");
    return;
  }

  const doc = editor.document;
  if (!SUPPORTED_LANGUAGE_IDS.has(doc.languageId)) {
    vscode.window.showErrorMessage(`Unsupported file type for migration: ${doc.languageId}`);
    return;
  }

  const originalText = doc.getText();
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);
  const { text: newText, stats } = migrateTextToV2(originalText, { bodyIndent });

  if (newText === originalText) {
    vscode.window.showInformationMessage("No legacy v1 constructs found to migrate.");
    return;
  }

  await editor.edit((editBuilder) => {
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(originalText.length));
    editBuilder.replace(fullRange, newText);
  });

  const changedSummary = [
    stats.convertedLegacyTags ? `${stats.convertedLegacyTags} tag block(s)` : null,
    stats.movedInlinePlanning ? `${stats.movedInlinePlanning} planning line(s) inserted` : null,
    stats.normalizedPlanningLines ? `${stats.normalizedPlanningLines} planning line(s) normalized` : null,
    stats.convertedCompletedToClosed ? `${stats.convertedCompletedToClosed} COMPLETED→CLOSED` : null
  ].filter(Boolean).join(", ");

  vscode.window.showInformationMessage(
    changedSummary
      ? `Migrated file to v2 format (${changedSummary}).`
      : "Migrated file to v2 format."
  );
}

module.exports = {
  migrateTextToV2,
  migrateFileToV2
};
