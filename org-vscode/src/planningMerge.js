const { isPlanningLine, parsePlanningFromText } = require("./orgTagUtils");

function shouldAssociateNextNextPlanning(nextLineText) {
  // We only treat a next-next planning line as belonging to the current headline
  // if there's a blank line between them. This prevents stealing planning from the
  // next sibling headline (common in real org files).
  return !!(nextLineText !== null && nextLineText !== undefined && String(nextLineText).trim() === "");
}

function mergePlanningFromNearbyLines(headlineText, nextLineText, nextNextLineText) {
  const planningFromHeadline = parsePlanningFromText(headlineText);

  const planningFromNext = (nextLineText && isPlanningLine(nextLineText))
    ? parsePlanningFromText(nextLineText)
    : {};

  const planningFromNextNext =
    (nextNextLineText && isPlanningLine(nextNextLineText) && shouldAssociateNextNextPlanning(nextLineText))
      ? parsePlanningFromText(nextNextLineText)
      : {};

  return {
    scheduled: planningFromNext.scheduled || planningFromHeadline.scheduled || null,
    deadline: planningFromNext.deadline || planningFromHeadline.deadline || null,
    // Prefer CLOSED; accept legacy COMPLETED from any parsed source.
    closed: planningFromNext.closed || planningFromHeadline.closed || planningFromNextNext.closed || null
  };
}

module.exports = {
  mergePlanningFromNearbyLines
};
