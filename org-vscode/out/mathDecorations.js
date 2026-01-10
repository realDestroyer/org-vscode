"use strict";

const vscode = require("vscode");

const DEFAULT_COMMAND_MAP = {
  // Greek
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\delta": "δ",
  "\\epsilon": "ε",
  "\\varepsilon": "ϵ",
  "\\zeta": "ζ",
  "\\eta": "η",
  "\\theta": "θ",
  "\\vartheta": "ϑ",
  "\\iota": "ι",
  "\\kappa": "κ",
  "\\lambda": "λ",
  "\\mu": "μ",
  "\\nu": "ν",
  "\\xi": "ξ",
  "\\pi": "π",
  "\\rho": "ρ",
  "\\sigma": "σ",
  "\\tau": "τ",
  "\\upsilon": "υ",
  "\\phi": "φ",
  "\\varphi": "ϕ",
  "\\chi": "χ",
  "\\psi": "ψ",
  "\\omega": "ω",

  // Uppercase Greek (common ones)
  "\\Gamma": "Γ",
  "\\Delta": "Δ",
  "\\Theta": "Θ",
  "\\Lambda": "Λ",
  "\\Xi": "Ξ",
  "\\Pi": "Π",
  "\\Sigma": "Σ",
  "\\Upsilon": "Υ",
  "\\Phi": "Φ",
  "\\Psi": "Ψ",
  "\\Omega": "Ω",

  // Operators / relations
  "\\times": "×",
  "\\cdot": "·",
  "\\pm": "±",
  "\\mp": "∓",
  "\\le": "≤",
  "\\leq": "≤",
  "\\ge": "≥",
  "\\geq": "≥",
  "\\neq": "≠",
  "\\approx": "≈",
  "\\equiv": "≡",
  "\\infty": "∞",
  "\\partial": "∂",
  "\\nabla": "∇",

  // Set / logic
  "\\in": "∈",
  "\\notin": "∉",
  "\\subset": "⊂",
  "\\subseteq": "⊆",
  "\\supset": "⊃",
  "\\supseteq": "⊇",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\forall": "∀",
  "\\exists": "∃",
  "\\neg": "¬",
  "\\wedge": "∧",
  "\\vee": "∨",

  // Arrows
  "\\to": "→",
  "\\rightarrow": "→",
  "\\leftarrow": "←",
  "\\Rightarrow": "⇒",
  "\\Leftarrow": "⇐",
  "\\leftrightarrow": "↔",
  "\\Leftrightarrow": "⇔",

  // Big operators
  "\\sum": "∑",
  "\\prod": "∏",
  "\\int": "∫",
  "\\iint": "∬",
  "\\iiint": "∭"
};

function shouldDecorate(editor) {
  if (!editor || !editor.document) return false;
  const lang = editor.document.languageId;
  if (!['vso', 'org', 'org-vscode', 'vsorg'].includes(lang)) return false;
  const config = vscode.workspace.getConfiguration('Org-vscode');
  return Boolean(config.get('decorateMath', true));
}

function isMathFenceLine(text) {
  return /^\s*\$\$\s*$/.test(text);
}

function findInlineMathSpans(text) {
  const spans = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }

    if (ch !== '$') {
      i++;
      continue;
    }

    // Ignore $$ (block fence). Inline is a single $ not adjacent to another $.
    const prev = i > 0 ? text[i - 1] : '';
    const next = i + 1 < text.length ? text[i + 1] : '';
    if (next === '$' || prev === '$') {
      i++;
      continue;
    }

    const start = i;
    i++;
    let end = -1;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === '$') {
        const n2 = i + 1 < text.length ? text[i + 1] : '';
        const p2 = i > 0 ? text[i - 1] : '';
        if (n2 !== '$' && p2 !== '$') {
          end = i;
          break;
        }
      }
      i++;
    }

    if (end !== -1 && end > start) {
      // inner content is (start+1 .. end)
      spans.push({ start: start + 1, end });
      i = end + 1;
      continue;
    }

    // Unclosed.
    i = start + 1;
  }
  return spans;
}

function inSpan(index, spans) {
  for (const s of spans) {
    if (s.start <= index && index < s.end) return true;
  }
  return false;
}

function computeDecorationsForEditor(editor) {
  const document = editor.document;
  const visible = (editor.visibleRanges && editor.visibleRanges.length)
    ? editor.visibleRanges
    : [new vscode.Range(new vscode.Position(0, 0), new vscode.Position(Math.max(0, document.lineCount - 1), 0))];

  // Heuristic: determine math block state by scanning a bounded number of lines above the first visible line.
  const firstVisibleLine = Math.max(0, visible[0].start.line);
  const scanBack = Math.max(0, firstVisibleLine - 200);
  let inBlockMath = false;
  for (let ln = scanBack; ln < firstVisibleLine; ln++) {
    const t = document.lineAt(ln).text;
    if (isMathFenceLine(t)) inBlockMath = !inBlockMath;
  }

  const decorations = [];
  const commandRegex = /\\[A-Za-z]+/g;

  for (const visibleRange of visible) {
    const startLine = Math.max(0, visibleRange.start.line);
    const endLine = Math.min(document.lineCount - 1, visibleRange.end.line + 2);

    for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
      const text = document.lineAt(lineNumber).text;

      if (isMathFenceLine(text)) {
        inBlockMath = !inBlockMath;
        continue;
      }

      const inlineSpans = findInlineMathSpans(text);

      commandRegex.lastIndex = 0;
      let match;
      while ((match = commandRegex.exec(text)) != null) {
        const command = match[0];
        const symbol = DEFAULT_COMMAND_MAP[command];
        if (!symbol) continue;

        const startChar = match.index;
        const endChar = startChar + command.length;

        const insideMath = inBlockMath || inSpan(startChar, inlineSpans);
        if (!insideMath) continue;

        decorations.push({
          range: new vscode.Range(lineNumber, startChar, lineNumber, endChar),
          renderOptions: {
            before: {
              contentText: symbol,
              margin: '0 0.1em 0 0'
            }
          }
        });
      }
    }
  }

  return decorations;
}

function registerMathDecorations(ctx) {
  if (!vscode.window || typeof vscode.window.createTextEditorDecorationType !== 'function') {
    return;
  }

  // NOTE: Avoid hiding the underlying LaTeX command text here.
  // Some CSS approaches (e.g. font-size: 0 / transparent) can also hide the
  // inserted `before` content, making decorations appear to "not work".
  const mathSymbolType = vscode.window.createTextEditorDecorationType({
    textDecoration: 'none;'
  });

  ctx.subscriptions.push(mathSymbolType);

  let pendingTimer = null;

  function clear(editor) {
    if (!editor) return;
    editor.setDecorations(mathSymbolType, []);
  }

  function apply(editor) {
    if (!editor) return;

    if (!shouldDecorate(editor)) {
      clear(editor);
      return;
    }

    const decorations = computeDecorationsForEditor(editor);
    editor.setDecorations(mathSymbolType, decorations);
  }

  function scheduleApply(editor) {
    if (pendingTimer) clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      apply(editor || vscode.window.activeTextEditor);
    }, 75);
  }

  scheduleApply(vscode.window.activeTextEditor);

  ctx.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => scheduleApply(editor)),
    vscode.window.onDidChangeTextEditorSelection((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) scheduleApply(event.textEditor);
    }),
    vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
      if (event.textEditor === vscode.window.activeTextEditor) scheduleApply(event.textEditor);
    }),
    vscode.workspace.onDidChangeTextDocument((event) => {
      const active = vscode.window.activeTextEditor;
      if (active && event.document.uri.toString() === active.document.uri.toString()) scheduleApply(active);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('Org-vscode.decorateMath')) scheduleApply(vscode.window.activeTextEditor);
    })
  );
}

module.exports = {
  registerMathDecorations
};
