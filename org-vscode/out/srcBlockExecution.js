"use strict";

const vscode = require("vscode");
const path = require("path");
const os = require("os");
const fs = require("fs");
const cp = require("child_process");

const { findSrcBlockAtLine, applyResultsAfterEndSrc } = require("./srcBlockUtils");

function getEolString(document) {
  return document && document.eol === vscode.EndOfLine.CRLF ? "\r\n" : "\n";
}

function splitDocumentLines(document) {
  const text = document.getText();
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function spawnCapture(command, args, options) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    let child;
    try {
      child = cp.spawn(command, args, { ...options, stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      reject(err);
      return;
    }

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => reject(err));
    child.on("close", (code, signal) => {
      resolve({ stdout, stderr, code: typeof code === "number" ? code : 0, signal: signal || null });
    });
  });
}

async function runWithFallback(candidates, args, options) {
  let lastErr = null;
  let missingCount = 0;
  for (const cmd of candidates) {
    try {
      return await spawnCapture(cmd, args, options);
    } catch (err) {
      lastErr = err;
      if (err && err.code === "ENOENT") {
        missingCount++;
        continue;
      }
      throw err;
    }
  }
  if (missingCount === candidates.length) {
    throw new Error(`Missing executable(s) on PATH: ${candidates.join(", ")}`);
  }
  throw lastErr || new Error("Unable to start process");
}

async function runSnippet(language, code, cwd, execCfg) {
  const tmpBase = path.join(os.tmpdir(), "org-vscode-src-");
  const tmpDir = fs.mkdtempSync(tmpBase);

  function cleanup() {
    try {
      if (fs.rmSync) fs.rmSync(tmpDir, { recursive: true, force: true });
      else if (fs.rmdirSync) fs.rmdirSync(tmpDir, { recursive: true });
    } catch {
      // best-effort
    }
  }

  try {
    const lang = String(language || "").trim().toLowerCase();
    const workingDirectory = cwd || tmpDir;
    const cfg = execCfg || {};

    if (lang === "python") {
      const file = path.join(tmpDir, "snippet.py");
      fs.writeFileSync(file, code, "utf8");
      if (cfg.pythonCommand) {
        return await spawnCapture(cfg.pythonCommand, [file], { cwd: workingDirectory });
      }
      return await runWithFallback(["python", "python3"], [file], { cwd: workingDirectory });
    }

    if (lang === "powershell") {
      const file = path.join(tmpDir, "snippet.ps1");
      fs.writeFileSync(file, code, "utf8");
      // pwsh preferred; fallback to Windows PowerShell.
      const psArgs = ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", file];
      if (cfg.powershellCommand) {
        return await spawnCapture(cfg.powershellCommand, psArgs, { cwd: workingDirectory });
      }
      return await runWithFallback(["pwsh", "powershell"], psArgs, { cwd: workingDirectory });
    }

    if (lang === "bash") {
      const file = path.join(tmpDir, "snippet.sh");
      fs.writeFileSync(file, code, "utf8");
      if (cfg.bashCommand) {
        return await spawnCapture(cfg.bashCommand, [file], { cwd: workingDirectory });
      }
      return await runWithFallback(["bash"], [file], { cwd: workingDirectory });
    }

    if (lang === "javascript") {
      const file = path.join(tmpDir, "snippet.js");
      fs.writeFileSync(file, code, "utf8");
      if (cfg.javascriptCommand) {
        return await spawnCapture(cfg.javascriptCommand, [file], { cwd: workingDirectory });
      }
      return await runWithFallback(["node"], [file], { cwd: workingDirectory });
    }

    if (lang === "cpp") {
      const src = path.join(tmpDir, "snippet.cpp");
      const exe = path.join(tmpDir, process.platform === "win32" ? "snippet.exe" : "snippet");
      fs.writeFileSync(src, code, "utf8");

      const compilerOverride = String(cfg.cppCompiler || "").trim();
      const styleSetting = String(cfg.cppCompilerStyle || "auto").trim();
      const inferredStyle = (cmd) => {
        const c = String(cmd || "").toLowerCase();
        if (c === "cl" || c.endsWith("\\cl.exe") || c.endsWith("/cl.exe")) return "msvc";
        return "gcc";
      };
      const style = styleSetting === "auto" ? (compilerOverride ? inferredStyle(compilerOverride) : "auto") : styleSetting;

      const buildGccArgs = (compilerCmd) => [src, "-std=c++17", "-O0", "-o", exe];
      const buildMsvcArgs = () => [
        "/nologo",
        "/EHsc",
        "/std:c++17",
        path.basename(src),
        "/Fe:snippet.exe"
      ];

      if (process.platform === "win32") {
        // Prefer mingw/clang if present, but also support MSVC if available.
        let compile;
        try {
          if (compilerOverride) {
            if (style === "msvc") {
              compile = await spawnCapture(compilerOverride, buildMsvcArgs(), { cwd: tmpDir });
            } else {
              compile = await spawnCapture(compilerOverride, buildGccArgs(compilerOverride), { cwd: workingDirectory });
            }
          } else {
            compile = await runWithFallback(["g++", "clang++"], buildGccArgs(""), { cwd: workingDirectory });
          }
        } catch (err) {
          // If neither g++ nor clang++ is available, attempt cl.exe (Visual Studio Build Tools).
          if (err && String(err.message || "").includes("Missing executable(s)")) {
            compile = await runWithFallback(["cl"], buildMsvcArgs(), { cwd: tmpDir });
          } else {
            throw err;
          }
        }

        if (compile.code !== 0) return compile;
        return await spawnCapture(exe, [], { cwd: tmpDir });
      }

      if (compilerOverride) {
        if (style === "msvc") {
          // Non-windows msvc isn't expected; fall back to running as-is.
          return await spawnCapture(compilerOverride, buildMsvcArgs(), { cwd: tmpDir });
        }
        const compile = await spawnCapture(compilerOverride, buildGccArgs(compilerOverride), { cwd: workingDirectory });
        if (compile.code !== 0) return compile;
        return await spawnCapture(exe, [], { cwd: workingDirectory });
      }

      const compile = await runWithFallback(["g++", "clang++"], buildGccArgs(""), { cwd: workingDirectory });
      if (compile.code !== 0) return compile;

      return await spawnCapture(exe, [], { cwd: workingDirectory });
    }

    throw new Error(`Unsupported src language: ${language || "(none)"}`);
  } finally {
    cleanup();
  }
}

function buildCombinedOutput(runResult) {
  const stdout = String(runResult && runResult.stdout ? runResult.stdout : "");
  const stderr = String(runResult && runResult.stderr ? runResult.stderr : "");
  const code = typeof runResult && runResult.code === "number" ? runResult.code : runResult.code;

  let combined = "";
  if (stdout) combined += stdout;
  if (stderr) {
    if (combined && !combined.endsWith("\n")) combined += "\n";
    combined += stderr;
  }

  const exitCode = typeof runResult.code === "number" ? runResult.code : 0;
  if (exitCode !== 0) {
    const prefix = `[exit ${exitCode}]`;
    combined = combined ? `${prefix}\n${combined}` : prefix;
  }

  if (!combined.trim()) return "(no output)";
  return combined;
}

function getSrcExecConfig() {
  const cfg = vscode.workspace && vscode.workspace.getConfiguration ? vscode.workspace.getConfiguration("Org-vscode") : null;
  const getString = (key) => {
    if (!cfg || typeof cfg.get !== "function") return "";
    const v = cfg.get(key);
    return typeof v === "string" ? v : "";
  };

  const getEnum = (key, allowed, fallback) => {
    const v = String(getString(key) || "").trim();
    if (allowed.includes(v)) return v;
    return fallback;
  };

  return {
    pythonCommand: String(getString("srcExecution.pythonCommand") || "").trim(),
    powershellCommand: String(getString("srcExecution.powershellCommand") || "").trim(),
    bashCommand: String(getString("srcExecution.bashCommand") || "").trim(),
    javascriptCommand: String(getString("srcExecution.javascriptCommand") || "").trim(),
    cppCompiler: String(getString("srcExecution.cppCompiler") || "").trim(),
    cppCompilerStyle: getEnum("srcExecution.cppCompilerStyle", ["auto", "gcc", "msvc"], "auto")
  };
}

async function executeSrcBlock(arg) {
  if (vscode.workspace && vscode.workspace.isTrusted === false) {
    await vscode.window.showErrorMessage("Workspace is not trusted; refusing to execute code.");
    return;
  }

  const requestedUri = arg && arg.uri ? arg.uri : null;
  const requestedLine1Based = arg && Number.isFinite(Number(arg.line)) ? Number(arg.line) : null;

  let editor = vscode.window.activeTextEditor;
  if (requestedUri) {
    editor = await vscode.window.showTextDocument(requestedUri, { preview: false });
  }
  if (!editor) return;

  const doc = editor.document;
  const lines = splitDocumentLines(doc);
  const cursorLine = requestedLine1Based != null ? Math.max(0, requestedLine1Based - 1) : (editor.selection && editor.selection.active ? editor.selection.active.line : 0);

  const block = findSrcBlockAtLine(lines, cursorLine);
  if (!block) {
    await vscode.window.showErrorMessage("Cursor is not inside a #+BEGIN_SRC / #+END_SRC block.");
    return;
  }

  const cwd = doc && doc.uri && doc.uri.fsPath ? path.dirname(doc.uri.fsPath) : undefined;
  const execCfg = getSrcExecConfig();

  let runResult;
  try {
    runResult = await runSnippet(block.language, block.code, cwd, execCfg);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    runResult = { stdout: "", stderr: msg, code: 1, signal: null };
  }

  const resultText = buildCombinedOutput(runResult);
  const { startLine, endLineExclusive, replacementLines } = applyResultsAfterEndSrc(lines, block.endLine, resultText);

  const eol = getEolString(doc);
  const replacementText = replacementLines.join(eol) + eol;

  const startPos = new vscode.Position(startLine, 0);
  const endPos = new vscode.Position(endLineExclusive, 0);
  const range = new vscode.Range(startPos, endPos);

  await editor.edit((editBuilder) => {
    editBuilder.replace(range, replacementText);
  });
}

module.exports = {
  executeSrcBlock
};
