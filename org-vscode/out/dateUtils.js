const vscode = require("vscode");
const moment = require("moment");

function getOrgConfig() {
  return vscode.workspace.getConfiguration("Org-vscode");
}

function getDateFormat(config) {
  const cfg = config || getOrgConfig();
  return cfg.get("dateFormat", "YYYY-MM-DD");
}

function getAcceptedDateFormats(config) {
  const dateFormat = getDateFormat(config);
  // Always accept the configured format first, but also accept the other supported formats
  // so features can read older files without forcing conversions.
  return Array.from(new Set([dateFormat, "YYYY-MM-DD", "MM-DD-YYYY", "DD-MM-YYYY"]));
}

function parseDateStrict(dateText, config, acceptedFormats) {
  const formats = acceptedFormats || getAcceptedDateFormats(config);
  return moment(dateText, formats, true);
}

module.exports = {
  getDateFormat,
  getAcceptedDateFormats,
  parseDateStrict
};
