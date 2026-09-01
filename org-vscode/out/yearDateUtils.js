const moment = require("moment");

const VERBOSE_DATE_FORMATS = ["Do MMMM YYYY", "D MMMM YYYY", "MMMM Do YYYY", "MMMM D YYYY"];

/**
 * Normalize any Org date value to YYYY-MM-DD, ignoring weekday/time suffixes
 * (`<2026-01-13 Tue 15:00>`), day-heading order (`01-02-2025`), and prose stamps
 * (`2nd January 2025, 9:42:00 am`). Returns "" when no date can be recovered.
 */
function toDateKey(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const isoMatch = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const parsed = moment(isoMatch[1], "YYYY-MM-DD", true);
    if (parsed.isValid()) {
      return parsed.format("YYYY-MM-DD");
    }
  }

  const usMatch = text.match(/\b(\d{2}-\d{2}-\d{4})\b/);
  if (usMatch) {
    const parsed = moment(usMatch[1], "MM-DD-YYYY", true);
    if (parsed.isValid()) {
      return parsed.format("YYYY-MM-DD");
    }
  }

  const verbose = moment(text.split(",")[0].trim(), VERBOSE_DATE_FORMATS, true);
  return verbose.isValid() ? verbose.format("YYYY-MM-DD") : "";
}

module.exports = { toDateKey };
