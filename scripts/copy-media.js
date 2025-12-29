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
  const sourceDir = path.join(repoRoot, "org-vscode", "media");
  const destDir = path.join(repoRoot, "media");

  if (!fs.existsSync(sourceDir)) {
    console.warn(`[copy-media] Source media folder not found: ${sourceDir}`);
    console.warn("[copy-media] Skipping copy.");
    return;
  }

  copyDirRecursive(sourceDir, destDir);
  console.log(`[copy-media] Copied media assets to: ${destDir}`);
}

main();
