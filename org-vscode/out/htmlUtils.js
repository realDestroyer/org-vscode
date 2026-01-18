"use strict";

const htm = require("htm");

// Wrapper for HTML strings that should not be escaped
class SafeHtml extends String {
  constructor(s) { super(s); }
}

// HTML entities that must be escaped in text content
const TEXT_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;"
};

// HTML entities that must be escaped in attribute values
const ATTR_ESCAPE_MAP = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
};

function escapeText(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>]/g, c => TEXT_ESCAPE_MAP[c]);
}

function escapeAttr(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, c => ATTR_ESCAPE_MAP[c]);
}

// Void elements that don't have closing tags
const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr"
]);

// Attributes that are boolean (presence = true, absence = false)
const BOOLEAN_ATTRS = new Set([
  "allowfullscreen", "async", "autofocus", "autoplay", "checked",
  "controls", "default", "defer", "disabled", "formnovalidate",
  "hidden", "ismap", "itemscope", "loop", "multiple", "muted",
  "nomodule", "novalidate", "open", "playsinline", "readonly",
  "required", "reversed", "selected", "truespeed"
]);

/**
 * Hyperscript function that produces HTML strings.
 * Used with htm for JSX-like syntax. Returns SafeHtml so nested
 * elements don't get double-escaped.
 *
 * @param {string} tag - Element tag name
 * @param {object|null} props - Element attributes/properties
 * @param {...any} children - Child elements or text
 * @returns {SafeHtml} HTML string wrapper
 */
function h(tag, props, ...children) {
  // Handle fragments (tag is null or undefined)
  if (!tag) {
    const result = children.flat(Infinity).map(c => {
      if (c == null) return "";
      if (c instanceof SafeHtml) return String(c);
      return escapeText(c);
    }).join("");
    return new SafeHtml(result);
  }

  // Build opening tag with attributes
  let html = `<${tag}`;

  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key === "children") continue; // handled separately
      if (key === "dangerouslySetInnerHTML") continue; // handled in children

      // Skip null/undefined/false values
      if (value == null || value === false) continue;

      // Boolean attributes: just output the attribute name if true
      if (BOOLEAN_ATTRS.has(key.toLowerCase())) {
        if (value === true) {
          html += ` ${key}`;
        }
        continue;
      }

      // Regular attributes
      if (value === true) {
        html += ` ${key}`;
      } else {
        html += ` ${key}="${escapeAttr(value)}"`;
      }
    }
  }

  // Void elements: self-closing, no children
  if (VOID_ELEMENTS.has(tag.toLowerCase())) {
    return new SafeHtml(html + ">");
  }

  html += ">";

  // Handle dangerouslySetInnerHTML (escape hatch for raw HTML)
  if (props && props.dangerouslySetInnerHTML && props.dangerouslySetInnerHTML.__html) {
    html += props.dangerouslySetInnerHTML.__html;
  } else {
    // Process children - escape text, but not nested h() output
    const flatChildren = children.flat(Infinity);
    for (const child of flatChildren) {
      if (child == null || child === false) continue;
      if (child instanceof SafeHtml) {
        html += String(child);
      } else {
        html += escapeText(child);
      }
    }
  }

  html += `</${tag}>`;
  return new SafeHtml(html);
}

/**
 * Tagged template literal for HTML.
 * Automatically escapes interpolated values to prevent JavaScript injection.
 * Nested elements work correctly.
 *
 * Usage:
 *   const html = require('./htmlUtils').html;
 *   const output = html`<div class=${className}>${userContent}</div>`;
 */
const html = htm.bind(h);

module.exports = {
  html,
  h,
  escapeText,
  escapeAttr
};
