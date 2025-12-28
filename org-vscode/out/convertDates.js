const vscode = require("vscode");
const moment = require("moment");

function inferSourceFormatForDate(dateStr) {
  // dateStr is expected to be "DD-MM-YYYY" or "MM-DD-YYYY".
  const parts = dateStr.split("-");
  if (parts.length !== 3) {
    return null;
  }

  const a = Number(parts[0]);
  const b = Number(parts[1]);
  const y = Number(parts[2]);
  if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(y)) {
    return null;
  }

  // If one side can't be a month, infer safely.
  if (a > 12 && b >= 1 && b <= 12) {
    return "DD-MM-YYYY";
  }
  if (b > 12 && a >= 1 && a <= 12) {
    return "MM-DD-YYYY";
  }

  // Ambiguous (e.g. 04-05-2026) or invalid.
  return null;
}

function convertDatesInText({ text, sourceMode, explicitSourceFormat, targetFormat }) {
  let convertedCount = 0;
  let skippedAmbiguousCount = 0;

  const getSourceFormatsForDate = (dateStr) => {
    if (sourceMode === "explicit") {
      return [explicitSourceFormat];
    }

    // auto detect
    const inferred = inferSourceFormatForDate(dateStr);
    if (!inferred) {
      return null;
    }
    return [inferred];
  };

  const acceptedAny = [targetFormat, "MM-DD-YYYY", "DD-MM-YYYY"];

  const replaceBracketedDate = (dateStr, replaceFn) => {
    // Helper to keep conversion logic centralized.
    const srcFormats = getSourceFormatsForDate(dateStr);
    if (!srcFormats) {
      skippedAmbiguousCount++;
      return replaceFn(null, null);
    }

    const parsed = moment(dateStr, srcFormats, true);
    if (!parsed.isValid()) {
      // If parsing fails in explicit mode, don't rewrite.
      return replaceFn(null, null);
    }

    // If it already parses as target format, still rewrite to normalize padding etc.
    convertedCount++;
    return replaceFn(parsed, parsed.format(targetFormat));
  };

  // 1) Day headings: "⊘ [04-29-2026 Wed]" OR "* [04-29-2026 Wed]" (and allow leading indent)
  // Capture groups:
  //  1 indent
  //  2 marker (⊘ or *...)
  //  3 date
  //  4 weekday
  //  5 rest of line (optional)
  text = text.replace(/^(\s*)(?:⊘|\*+)\s*\[(\d{2,4}-\d{2}-\d{2,4})\s+(\w{3})\](.*)$/gm, (full, indent, dateStr, _weekday, rest) => {
    return replaceBracketedDate(dateStr, (parsed, formatted) => {
      if (!parsed || !formatted) {
        return full;
      }
      const weekday = parsed.format("ddd");
      // Preserve original marker from the full match start.
      const markerMatch = full.match(/^(\s*)(⊘|\*+)\s*\[/);
      const marker = markerMatch ? markerMatch[2] : "⊘";
      return `${indent}${marker} [${formatted} ${weekday}]${rest}`;
    });
  });

  // 2) SCHEDULED/DEADLINE tags: preserve optional time inside []
  // e.g. DEADLINE: [04-30-2026 10:00]
  const convertStamp = (stampName) => {
    const re = new RegExp(`${stampName}:\\s*\\[(\\d{2}-\\d{2}-\\d{4})([^\\]]*)\\]`, "g");
    text = text.replace(re, (full, dateStr, tail) => {
      return replaceBracketedDate(dateStr, (_parsed, formatted) => {
        if (!formatted) {
          return full;
        }
        return `${stampName}: [${formatted}${tail}]`;
      });
    });
  };

  convertStamp("SCHEDULED");
  convertStamp("DEADLINE");

  // Note: we intentionally do not touch COMPLETED/CLOSED timestamps since they are long-form.

  return { text, convertedCount, skippedAmbiguousCount, acceptedAny };
}

async function convertDatesInActiveFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor detected.");
    return;
  }

  const doc = editor.document;
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const targetFormat = config.get("dateFormat", "YYYY-MM-DD");

  const sourcePickDefault = targetFormat === "MM-DD-YYYY" ? "DD-MM-YYYY" : "MM-DD-YYYY";

  const pick = await vscode.window.showQuickPick(
    [
      { label: `Convert from ${sourcePickDefault} → ${targetFormat}`, kind: "explicit", source: sourcePickDefault },
      { label: `Convert from MM-DD-YYYY → ${targetFormat}`, kind: "explicit", source: "MM-DD-YYYY" },
      { label: `Convert from DD-MM-YYYY → ${targetFormat}`, kind: "explicit", source: "DD-MM-YYYY" },
      { label: `Auto-detect per date (skips ambiguous like 04-05-2026) → ${targetFormat}`, kind: "auto" }
    ],
    {
      placeHolder: "Choose how to interpret existing dates in this file",
      ignoreFocusOut: true
    }
  );

  if (!pick) {
    return;
  }

  if (pick.kind === "explicit" && pick.source === targetFormat) {
    vscode.window.showInformationMessage(`Already converting from ${pick.source} to ${targetFormat}. No changes needed.`);
    return;
  }

  const sourceMode = pick.kind;
  const explicitSourceFormat = pick.kind === "explicit" ? pick.source : null;

  const originalText = doc.getText();
  const { text: newText, convertedCount, skippedAmbiguousCount } = convertDatesInText({
    text: originalText,
    sourceMode,
    explicitSourceFormat,
    targetFormat
  });

  if (newText === originalText) {
    vscode.window.showInformationMessage("No matching dates found to convert.");
    return;
  }

  await editor.edit((editBuilder) => {
    const fullRange = new vscode.Range(doc.positionAt(0), doc.positionAt(originalText.length));
    editBuilder.replace(fullRange, newText);
  });

  if (sourceMode === "auto" && skippedAmbiguousCount > 0) {
    vscode.window.showWarningMessage(
      `Converted ${convertedCount} date(s). Skipped ${skippedAmbiguousCount} ambiguous date(s) (e.g. 04-05-2026). Use an explicit source format to convert everything.`
    );
  } else {
    vscode.window.showInformationMessage(`Converted ${convertedCount} date(s) to ${targetFormat}.`);
  }
}

module.exports = {
  convertDatesInActiveFile
};
