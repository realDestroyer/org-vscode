const fs = require("fs");
const path = require("path");

function copyDirRecursive(sourceDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, destPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destPath);
    }
  }
}

function main() {
  const repoRoot = path.join(__dirname, "..");
  const mediaSourceDir = path.join(repoRoot, "org-vscode", "media");
  const mediaDestDir = path.join(repoRoot, "media");

  // Copy htm library from node_modules
  const htmSource = path.join(repoRoot, "node_modules", "htm", "dist", "htm.umd.js");
  const htmDest = path.join(mediaDestDir, "htm.js");
  fs.mkdirSync(mediaDestDir, { recursive: true });
  if (fs.existsSync(htmSource)) {
    fs.copyFileSync(htmSource, htmDest);
    console.log(`[copy-media] Copied htm.js to: ${htmDest}`);
  } else {
    console.warn(`[copy-media] htm not found: ${htmSource}`);
  }

  if (!fs.existsSync(mediaSourceDir)) {
    console.warn(`[copy-media] Source media folder not found: ${mediaSourceDir}`);
    console.warn("[copy-media] Skipping media copy.");
  } else {
    copyDirRecursive(mediaSourceDir, mediaDestDir);
    console.log(`[copy-media] Copied media assets to: ${mediaDestDir}`);
  }

  const snippetsSourceDir = path.join(repoRoot, "org-vscode", "snippets");
  const snippetsDestDir = path.join(repoRoot, "snippets");

  if (!fs.existsSync(snippetsSourceDir)) {
    console.warn(`[copy-media] Source snippets folder not found: ${snippetsSourceDir}`);
    console.warn("[copy-media] Skipping snippets copy.");
  } else {
    copyDirRecursive(snippetsSourceDir, snippetsDestDir);
    console.log(`[copy-media] Copied snippets to: ${snippetsDestDir}`);
  }
}

main();
