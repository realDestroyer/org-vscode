const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { parseOrgContent, pickOrgFile, ensureReportDirectory } = require("./yearSummary");
const { buildReportModel, renderMarkdown, renderHtml } = require("./yearReportBuilder");

async function generateExecutiveReport() {
  try {
    const orgUri = await pickOrgFile();
    if (!orgUri) {
      return;
    }

    const result = await generateExecutiveReportForFile(orgUri.fsPath);

    const openOption = "Open Folder";
    vscode.window
      .showInformationMessage(`Executive report exported to ${result.reportDir}`, openOption)
      .then(selection => {
        if (selection === openOption) {
          vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(result.reportDir));
        }
      });
  } catch (error) {
    vscode.window.showErrorMessage(`Executive report failed: ${error.message}`);
  }
}

async function generateExecutiveReportForFile(orgPath, parsedInput) {
  const parsed = parsedInput || parseOrgContent(fs.readFileSync(orgPath, "utf-8"));
  if (!parsed.days.length) {
    throw new Error("No day headings or tasks were detected in that Org file.");
  }

  const model = buildReportModel(orgPath, parsed);
  const reportDir = await ensureReportDirectory(orgPath, model.year);
  const markdown = renderMarkdown(model);
  const html = renderHtml(model);

  const mdPath = path.join(reportDir, "year-executive-report.md");
  const htmlPath = path.join(reportDir, "year-executive-report.html");
  fs.writeFileSync(mdPath, markdown);
  fs.writeFileSync(htmlPath, html);

  return {
    reportDir,
    markdownPath: mdPath,
    htmlPath,
    model
  };
}

module.exports = {
  generateExecutiveReport,
  generateExecutiveReportForFile
};
