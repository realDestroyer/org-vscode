const vscode = require("vscode");
const { isPlanningLine, parsePlanningFromText, normalizeTagsAfterPlanning } = require("./orgTagUtils");
const taskKeywordManager = require("./taskKeywordManager");
const { normalizeBodyIndentation } = require("./indentUtils");

/**
 * This command aligns all SCHEDULED: timestamps to a fixed column width.
 * It improves readability by right-aligning the timestamps in `.org` files.
 * Also preserves DEADLINE: timestamps that may follow SCHEDULED.
 */
async function alignSchedules() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        vscode.window.showErrorMessage("No active editor detected.");
        return;
    }

    const document = editor.document;
    const config = vscode.workspace.getConfiguration("Org-vscode");
    const bodyIndent = normalizeBodyIndentation(config.get("bodyIndentation", 2), 2);
    const alignInlineScheduled = config.get("alignSchedulesAlignInlineScheduled", true);
    const alignTags = config.get("alignSchedulesAlignTags", true);
    const normalizePlanningLines = config.get("alignSchedulesNormalizePlanningLines", true);
    const totalLines = document.lineCount;
    let maxTaskLength = 0;
    let linesWithScheduled = [];
    let tagAlignmentCandidates = [];
    let maxHeadingBaseLength = 0;
    let normalizedHeadlineEdits = [];
    let planningNormalizedCount = 0;

    // Collect one final replacement per line to avoid overlapping edit ranges.
    const lineReplacements = new Map();

    // Only align end-of-line tags on headings/tasks, never on drawers like :PROPERTIES:.
    function isHeadingOrTaskLine(text) {
        const t = String(text || "");
        return /^\s*(?:\*+\s+|[⊙⊘⊜⊖⊗]\s+)/.test(t);
    }

    // 🔍 Step 1: Find legacy inline "SCHEDULED:" on *headline* lines (for column alignment)
    // and normalize Emacs-style planning lines below headlines.
    for (let i = 0; i < totalLines; i++) {
        let lineText = document.lineAt(i).text;

        const eligibleHeadline = isHeadingOrTaskLine(lineText) && (alignInlineScheduled || alignTags || normalizePlanningLines);

        // Normalize "tags before planning" on headlines so later alignment is consistent.
        // (We will apply it later via lineReplacements to avoid double-edits.)
        if (eligibleHeadline) {
            const normalizedHeadline = normalizeTagsAfterPlanning(lineText);
            if (normalizedHeadline !== lineText) {
                normalizedHeadlineEdits.push({ lineNumber: i, newText: normalizedHeadline });
                lineText = normalizedHeadline;
            }
        }

        // Capture optional indentation, task text, and the "SCHEDULED:" keyword.
        // IMPORTANT: do NOT treat planning lines (indented SCHEDULED/DEADLINE/CLOSED lines)
        // as legacy inline "SCHEDULED" headlines; doing so drops CLOSED and can create
        // overlapping edits.
        if (alignInlineScheduled && !isPlanningLine(lineText) && taskKeywordManager.findTaskKeyword(lineText)) {
            let match = lineText.match(/^(\s*)(.*?)(\s+SCHEDULED:)/);

            if (match) {
                // Use a consistent measurement with what we later write back.
                // (Trailing spaces before SCHEDULED: shouldn't affect alignment.)
                let taskLength = String(match[2] || "").trimEnd().length;
                maxTaskLength = Math.max(maxTaskLength, taskLength);

                // Store only the headline lines we want to modify later
                linesWithScheduled.push({ lineNumber: i, indentation: match[1] });
            }
        }

        // Track headlines with end-of-line tags so we can align them (Emacs-style).
        // Example: "* TODO Title :WORK:URGENT:"
        const tagMatch = alignTags ? lineText.match(/^(\s*.*?)(\s+:(?:[A-Za-z0-9_@#%\-]+:)+)\s*$/) : null;
        if (tagMatch && isHeadingOrTaskLine(lineText)) {
            const base = tagMatch[1].replace(/\s+$/g, "");
            const tags = tagMatch[2].trim();
            maxHeadingBaseLength = Math.max(maxHeadingBaseLength, base.length);
            tagAlignmentCandidates.push({ lineNumber: i, base, tags });
        }

        // Emacs-style: if this is a task headline, normalize the immediate planning line.
        if (normalizePlanningLines && taskKeywordManager.findTaskKeyword(lineText) && i + 1 < totalLines) {
            const nextLine = document.lineAt(i + 1).text;
            if (isPlanningLine(nextLine) && (nextLine.includes("SCHEDULED:") || nextLine.includes("DEADLINE:") || nextLine.includes("CLOSED:") || nextLine.includes("COMPLETED"))) {
                const headlineIndent = lineText.match(/^\s*/)?.[0] || "";
                const planningIndent = `${headlineIndent}${bodyIndent}`;
                const planning = parsePlanningFromText(nextLine);
                const parts = [];
                if (planning.scheduled) parts.push(`SCHEDULED: [${planning.scheduled}]`);
                if (planning.deadline) parts.push(`DEADLINE: [${planning.deadline}]`);
                if (planning.closed) parts.push(`CLOSED: [${planning.closed}]`);
                const normalized = parts.join("  ");
                if (normalized) {
                    const desired = `${planningIndent}${normalized}`;
                    if (desired !== nextLine) {
                        lineReplacements.set(i + 1, desired);
                        planningNormalizedCount++;
                    }
                }
            }
        }
    }

    const hasLegacyInlinePlanning = linesWithScheduled.length > 0;
    const hasTagCandidates = tagAlignmentCandidates.length > 0;
    const hasPlanningEdits = planningNormalizedCount > 0;
    const hasHeadlineNormalizations = normalizedHeadlineEdits.length > 0;

    // ✅ Nothing to align/normalize if no entries found
    if (!hasLegacyInlinePlanning && !hasPlanningEdits && !hasHeadlineNormalizations && !hasTagCandidates) {
        vscode.window.showWarningMessage("No schedules or tags found to align.");
        return;
    }

    // 📏 Step 2: Determine the column to align all *inline* SCHEDULED: timestamps to
    const scheduledColumn = maxTaskLength + 4;

    // 📏 Tag alignment column (when using v2-style end-of-line tags)
    // Keep this bounded so we don't create huge lines.
    const tagColumn = Math.min(maxHeadingBaseLength + 2, 80);

    // Step 3a: Compute final per-line replacements.
    // Lowest precedence: headline normalizations
    for (const { lineNumber, newText } of normalizedHeadlineEdits) {
        lineReplacements.set(lineNumber, newText);
    }

    // Apply legacy inline SCHEDULED alignment (overrides headline normalization on those lines)
    for (const { lineNumber, indentation } of linesWithScheduled) {
        const baseLine = lineReplacements.has(lineNumber)
            ? lineReplacements.get(lineNumber)
            : document.lineAt(lineNumber).text;

        let match = String(baseLine || "").match(/^(\s*)(.*?)(\s+SCHEDULED:\s*\[\d{2,4}-\d{2}-\d{2,4}(?:\s+\w{3})?(?:\s+\d{1,2}:\d{2})?\])(\s+DEADLINE:\s*\[\d{2,4}-\d{2}-\d{2,4}(?:\s+\w{3})?(?:\s+\d{1,2}:\d{2})?\])?/);
        if (!match) continue;

        const taskText = match[2].trimEnd();
        const scheduledText = match[3].trim();
        const deadlineText = match[4] ? match[4].trim() : "";

        let adjustedLine = indentation + taskText.padEnd(scheduledColumn, " ") + scheduledText;
        if (deadlineText) {
            adjustedLine += "    " + deadlineText;
        }

        lineReplacements.set(lineNumber, adjustedLine);
    }

    // Apply tag alignment only when there is no legacy inline SCHEDULED alignment to perform.
    if (!hasLegacyInlinePlanning && hasTagCandidates) {
        for (const { lineNumber, base, tags } of tagAlignmentCandidates) {
            const pad = Math.max(1, tagColumn - base.length);
            const adjusted = `${base}${" ".repeat(pad)}${tags}`;
            lineReplacements.set(lineNumber, adjusted);
        }
    }

    // Step 3b: Apply edits (return a promise so tests/UI can await completion)
    await editor.edit(editBuilder => {
        for (const [lineNumber, newText] of lineReplacements.entries()) {
            const oldText = document.lineAt(lineNumber).text;
            if (newText === oldText) continue;
            const fullRange = new vscode.Range(lineNumber, 0, lineNumber, oldText.length);
            editBuilder.replace(fullRange, newText);
        }
    });

    const normalizedCount = planningNormalizedCount;
    const headlineFixCount = normalizedHeadlineEdits.length;
    const alignedCount = linesWithScheduled.length;
    const tagAlignedCount = (!hasLegacyInlinePlanning && hasTagCandidates) ? tagAlignmentCandidates.length : 0;

    console.log(`✅ Updated alignment: ${alignedCount} inline schedules aligned, ${normalizedCount} planning lines normalized, ${tagAlignedCount} tag lines aligned, ${headlineFixCount} headlines normalized.`);
    vscode.window.showInformationMessage(
        `Updated alignment: ${alignedCount} schedules aligned, ${normalizedCount} planning lines normalized, ${tagAlignedCount} tag lines aligned.`
    );
}

// Export the command to be used in extension.js
module.exports = {
    alignSchedules
};
