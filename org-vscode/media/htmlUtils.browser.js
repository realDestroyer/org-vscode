/**
 * Browser-compatible HTML utilities using htm for safe HTML generation.
 * This file prevents JavaScript injection by escaping untrusted content in HTML.
 *
 * Uses the actual htm library (https://github.com/developit/htm) for template parsing,
 * with a custom hyperscript function that generates escaped HTML strings.
 *
 * Requires htm.js to be loaded before this script (provides window.htm).
 */
(function(global) {
  "use strict";

  // htm is loaded as a UMD module before this script
  const htm = global.htm;

  const TEXT_ESCAPE_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;"
  };

  const ATTR_ESCAPE_MAP = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  };

  // Wrapper for HTML strings that should not be escaped.
  // Using a boxed string lets us detect nested element output and avoid
  // double-escaping when htm composes trees.
  class SafeHtml extends String {
    constructor(s) { super(s); }
  }

  function escapeText(str) {
    if (str == null) return "";
    return String(str).replace(/[&<>]/g, c => TEXT_ESCAPE_MAP[c]);
  }

  function escapeAttr(str) {
    if (str == null) return "";
    return String(str).replace(/[&<>"']/g, c => ATTR_ESCAPE_MAP[c]);
  }

  const VOID_ELEMENTS = new Set([
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr"
  ]);

  const BOOLEAN_ATTRS = new Set([
    "allowfullscreen", "async", "autofocus", "autoplay", "checked",
    "controls", "default", "defer", "disabled", "formnovalidate",
    "hidden", "ismap", "itemscope", "loop", "multiple", "muted",
    "nomodule", "novalidate", "open", "playsinline", "readonly",
    "required", "reversed", "selected", "truespeed"
  ]);

  function h(tag, props, ...children) {
    if (!tag) {
      return children.flat(Infinity).map(c => {
        if (c == null) return "";
        if (c instanceof SafeHtml) return String(c);
        if (typeof c === "object" && c.__raw) return c.toString();
        return escapeText(String(c));
      }).join("");
    }

    let htmlStr = "<" + tag;

    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (key === "children" || key === "dangerouslySetInnerHTML") continue;
        if (value == null || value === false) continue;

        if (BOOLEAN_ATTRS.has(key.toLowerCase())) {
          if (value === true) htmlStr += ` ${key}`;
          continue;
        }

        if (value === true) {
          htmlStr += ` ${key}`;
        } else {
          htmlStr += ` ${key}="${escapeAttr(value)}"`;
        }
      }
    }

    if (VOID_ELEMENTS.has(tag.toLowerCase())) {
      return new SafeHtml(htmlStr + ">");
    }

    htmlStr += ">";

    if (props?.dangerouslySetInnerHTML?.__html) {
      htmlStr += props.dangerouslySetInnerHTML.__html;
    } else {
      for (const child of children.flat(Infinity)) {
        if (child == null || child === false) continue;
        if (child instanceof SafeHtml) {
          htmlStr += String(child);
          continue;
        }
        if (typeof child === "object" && child.__raw) {
          htmlStr += child.toString();
        } else {
          htmlStr += escapeText(String(child));
        }
      }
    }

    return new SafeHtml(htmlStr + `</${tag}>`);
  }

  function raw(htmlString) {
    return { toString: () => (htmlString == null ? "" : String(htmlString)), __raw: true };
  }

  const html = htm.bind(h);

  global.htmlUtils = { html, raw };

})(typeof window !== "undefined" ? window : this);
