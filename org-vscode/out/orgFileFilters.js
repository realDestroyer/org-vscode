"use strict";

const path = require("path");

function isOrgLikeFile(fileName) {
  const name = String(fileName || "").toLowerCase();
  return name.endsWith(".org") || name.endsWith(".org_archive");
}

function isArchivedOrgFile(fileName, fullPath) {
  const name = String(fileName || "").toLowerCase();
  if (name.endsWith(".org_archive")) return true;
  if (name === "archive.org" || name.endsWith("-archive.org") || name.endsWith("_archive.org")) return true;

  const dir = String(path.dirname(fullPath || "")).toLowerCase();
  const segments = dir.split(/[\\/]+/).filter(Boolean);
  return segments.includes("archived") || segments.includes("archive");
}

function shouldIncludeOrgFileInViews(fileName, fullPath, config) {
  const name = String(fileName || "");
  if (!isOrgLikeFile(name)) return false;
  if (name.startsWith(".")) return false;
  if (name === "CurrentTasks.org") return false;

  const ignoreArchivedFilesInViews = config.get("ignoreArchivedFilesInViews", true);
  if (ignoreArchivedFilesInViews && isArchivedOrgFile(name, fullPath)) {
    return false;
  }

  return true;
}

module.exports = {
  isArchivedOrgFile,
  isOrgLikeFile,
  shouldIncludeOrgFileInViews
};
