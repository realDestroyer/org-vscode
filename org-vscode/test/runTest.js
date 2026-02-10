const path = require('path');
const os = require('os');
const fs = require('fs');
const cp = require('child_process');
const { runTests } = require('@vscode/test-electron');

function ensureJunction(linkPath, targetPath) {
  if (fs.existsSync(linkPath)) {
    try {
      cp.execSync(`cmd /c rmdir "${linkPath}"`, { stdio: 'ignore' });
    } catch {
      // ignore
    }
  }

  const parentDir = path.dirname(linkPath);
  const parentRoot = path.parse(parentDir).root;
  if (parentDir !== parentRoot) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
  cp.execSync(`cmd /c mklink /J "${linkPath}" "${targetPath}"`, { stdio: 'ignore' });
}

function ensureEmptyDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

async function main() {
  try {
    // NOTE: @vscode/test-electron uses `shell: true` on Windows, which can break
    // argument parsing when paths contain spaces. This repo lives under
    // `VSCode OrgMode`, so we create a no-space junction and run everything
    // through it.
    const repoRoot = path.resolve(__dirname, '..', '..');
    const driveRoot = path.parse(repoRoot).root;
    const junctionRoot = path.join(driveRoot, '_orgvscode_testlink');
    ensureJunction(junctionRoot, repoRoot);

    const extensionDevelopmentPath = junctionRoot;
    const extensionTestsPath = path.join(junctionRoot, 'org-vscode', 'test', 'suite', 'index.js');
    const workspacePath = junctionRoot;

    const runId = String(Date.now());
    const testBaseDir = path.join(driveRoot, '_orgvscode_vscode_test');
    const userDataDir = path.join(testBaseDir, `user-data-${runId}`);
    const extensionsDir = path.join(testBaseDir, `extensions-${runId}`);
    ensureEmptyDir(userDataDir);
    ensureEmptyDir(extensionsDir);

    await runTests({
      version: '1.108.2',
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        workspacePath,
        '--user-data-dir', userDataDir,
        '--extensions-dir', extensionsDir,
        '--disable-workspace-trust'
      ]
    });
  } catch (err) {
    console.error('Failed to run tests');
    console.error(err);
    process.exit(1);
  }
}

main();
