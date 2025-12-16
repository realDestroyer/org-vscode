const { convertDatesInActiveFile } = require("./convertDates");

// Legacy command entry point.
// Previously this rewrote SCHEDULED dates across .vsorg files and used a hardcoded swap.
// It is now an alias for a safer, explicit conversion on the active file.
module.exports = convertDatesInActiveFile;