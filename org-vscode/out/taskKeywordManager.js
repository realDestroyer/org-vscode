// Centralized task keyword and symbol management for Org-vscode extension
const moment = require("moment");

const keywords = ['TODO', 'IN_PROGRESS', 'CONTINUED', 'DONE', 'ABANDONED'];
const characterArray = ['⊙ ', '⊘ ', '⊜ ', '⊖ ', '⊗ '];

function getKeywordIndex(keyword) {
  return keywords.indexOf(keyword);
}

function getSymbolForKeyword(keyword) {
  const idx = getKeywordIndex(keyword);
  return idx !== -1 ? characterArray[idx] : '';
}

function rotateKeyword(currentKeyword, direction = 'left') {
  const idx = getKeywordIndex(currentKeyword);
  if (!currentKeyword || idx === -1) {
    // If no keyword found, always start with TODO
    return { keyword: 'TODO', symbol: getSymbolForKeyword('TODO') };
  }
  let nextIdx;
  if (direction === 'left') {
    nextIdx = idx > 0 ? idx - 1 : keywords.length - 1;
  } else {
    nextIdx = idx < keywords.length - 1 ? idx + 1 : 0;
  }
  return { keyword: keywords[nextIdx], symbol: characterArray[nextIdx] };
}

function cleanTaskText(lineText) {
  return lineText
    .replace(/^\s*\*+\s+/, '')
    .replace(/[⊙⊘⊖⊜⊗]/g, '')
    .replace(/\b(TODO|IN_PROGRESS|CONTINUED|DONE|ABANDONED)\b/g, '')
    .trim();
}

function buildTaskLine(leadingSpaces, keyword, cleanedText, options = {}) {
  const headingMarkerStyle = options.headingMarkerStyle || "unicode";
  const starPrefix = (options.starPrefix || "*").trim() || "*";

  if (headingMarkerStyle === "asterisks") {
    const suffix = cleanedText ? ` ${cleanedText}` : "";
    return `${leadingSpaces}${starPrefix} ${keyword}${suffix}`;
  }

  return `${leadingSpaces}${getSymbolForKeyword(keyword)}${keyword} ${cleanedText}`;
}

function buildCompletedStamp(leadingSpaces, dateFormat) {
  const fmt = dateFormat || "MM-DD-YYYY";
  return `${leadingSpaces}  CLOSED:[${moment().format(`${fmt} ddd HH:mm`)}]`;
}

// Back-compat alias: prefer CLOSED, but keep the existing exported name.
function buildClosedStamp(leadingSpaces, dateFormat) {
  return buildCompletedStamp(leadingSpaces, dateFormat);
}

module.exports = {
  keywords,
  characterArray,
  getKeywordIndex,
  getSymbolForKeyword,
  rotateKeyword,
  cleanTaskText,
  buildTaskLine,
  buildCompletedStamp,
  buildClosedStamp
};
