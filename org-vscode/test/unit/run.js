/*
  Minimal unit test runner (no mocha/jest) so we can catch command-registration regressions
  without needing the VS Code extension host.
*/

const path = require('path');

const tests = [
  require(path.join(__dirname, 'command-registration.test.js')),
  require(path.join(__dirname, 'syntax-color-customizer-webview.test.js')),
  require(path.join(__dirname, 'workflow-states.test.js')),
  require(path.join(__dirname, 'priority-cycle.test.js')),
  require(path.join(__dirname, 'transition-notes.test.js')),
  require(path.join(__dirname, 'indent-utils.test.js')),
  require(path.join(__dirname, 'checkbox-stats.test.js')),
  require(path.join(__dirname, 'checkbox-cookie-toggle.test.js')),
  require(path.join(__dirname, 'checkbox-auto-done.test.js')),
  require(path.join(__dirname, 'checkbox-toggle.test.js')),
  require(path.join(__dirname, 'checkbox-keywords.test.js')),
  require(path.join(__dirname, 'checkbox-workflow-grammar.test.js')),
  require(path.join(__dirname, 'workflow-state-scopes.test.js')),
  require(path.join(__dirname, 'org-symbol-provider.test.js')),
  require(path.join(__dirname, 'heading-folding.test.js')),
  require(path.join(__dirname, 'context-actions.test.js')),
  require(path.join(__dirname, 'heading-codelens.test.js')),
  require(path.join(__dirname, 'move-block.test.js')),
  require(path.join(__dirname, 'subtree-structure.test.js')),
  require(path.join(__dirname, 'org-properties.test.js')),
  require(path.join(__dirname, 'smart-insert-new-element.test.js')),
  require(path.join(__dirname, 'math-decorations-map.test.js')),
  require(path.join(__dirname, 'date-parsing.test.js')),
  require(path.join(__dirname, 'repeated-tasks.test.js')),
  require(path.join(__dirname, 'calendar-reschedule.test.js')),
  require(path.join(__dirname, 'timestamp-regex.test.js')),
  require(path.join(__dirname, 'date-mutations.test.js')),
  require(path.join(__dirname, 'smart-date-multiline.test.js')),
  require(path.join(__dirname, 'timestamp-repeater.test.js')),
  require(path.join(__dirname, 'planning-merge.test.js')),
  require(path.join(__dirname, 'set-todo-state.test.js')),
  require(path.join(__dirname, 'continued-task-handler.test.js')),
  require(path.join(__dirname, 'src-block-utils.test.js')),
  require(path.join(__dirname, 'clock-utils.test.js')),
  require(path.join(__dirname, 'column-view.test.js')),
  require(path.join(__dirname, 'html-utils-browser.test.js')),
  require(path.join(__dirname, 'org-preview-export.test.js')),
  require(path.join(__dirname, 'workspace-index-query.test.js')),
  require(path.join(__dirname, 'workspace-index-service.test.js')),
  require(path.join(__dirname, 'org-link-targets.test.js')),
  require(path.join(__dirname, 'year-executive-report.test.js')),
  require(path.join(__dirname, 'year-summary-tags.test.js')),
  require(path.join(__dirname, 'year-summary-formats.test.js')),
  require(path.join(__dirname, 'year-metrics.test.js')),
  require(path.join(__dirname, 'year-dashboard-webview.test.js')),
  require(path.join(__dirname, 'link-type-registry.test.js')),
  require(path.join(__dirname, 'trust-store.test.js')),
  require(path.join(__dirname, 'capture-todo.test.js')),
  require(path.join(__dirname, 'extension-api.test.js'))
];

async function main() {
  const failures = [];

  for (const t of tests) {
    try {
      const result = t.run();
      if (result && typeof result.then === 'function') await result;
      process.stdout.write(`PASS ${t.name}\n`);
    } catch (err) {
      failures.push({ name: t.name, err });
      process.stderr.write(`FAIL ${t.name}\n`);
      process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
    }
  }

  if (failures.length) {
    process.stderr.write(`\n${failures.length} test(s) failed.\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`\nAll ${tests.length} test(s) passed.\n`);
  }
}

main().catch((err) => {
  process.stderr.write(String(err && err.stack ? err.stack : err) + '\n');
  process.exitCode = 1;
});
