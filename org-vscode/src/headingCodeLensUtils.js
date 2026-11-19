"use strict";

const { parseHeadingInfo } = require("./moveBlockUtils");

const ACTIONS = Object.freeze({
  status: { title: "$(sync) TODO", command: "extension.toggleStatusRight" },
  schedule: { title: "$(calendar) Schedule", command: "extension.scheduling" },
  deadline: { title: "$(clock) Deadline", command: "extension.deadline" },
  tags: { title: "$(tag) Tags", command: "extension.addTagToTask" },
  property: { title: "$(symbol-property) Property", command: "org-vscode.setProperty" },
  promote: { title: "$(arrow-left) Promote", command: "org-vscode.promoteSubtree" },
  demote: { title: "$(arrow-right) Demote", command: "org-vscode.demoteSubtree" },
  refile: { title: "$(move) Refile", command: "org-vscode.refileSubtree" }
});

function normalizeHeadingCodeLensActions(actions) {
  if (!Array.isArray(actions)) return [];
  return Array.from(new Set(actions.filter((action) => Object.hasOwn(ACTIONS, action))));
}

function buildHeadingCodeLensPlan(lines, actions, unicodeMarkers, suppressed = false) {
  if (suppressed || !Array.isArray(lines)) return [];
  const enabledActions = normalizeHeadingCodeLensActions(actions);
  if (!enabledActions.length) return [];

  const plan = [];
  for (let line = 0; line < lines.length; line++) {
    const heading = parseHeadingInfo(String(lines[line] || ""), unicodeMarkers);
    if (!heading || heading.isDayHeading) continue;
    for (const action of enabledActions) plan.push({ line, action });
  }
  return plan;
}

module.exports = { ACTIONS, buildHeadingCodeLensPlan, normalizeHeadingCodeLensActions };