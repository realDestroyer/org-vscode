/*
  Minimal unit test runner (no mocha/jest) so we can catch command-registration regressions
  without needing the VS Code extension host.
*/

const path = require('path');

const tests = [
  require(path.join(__dirname, 'command-registration.test.js')),
  require(path.join(__dirname, 'workflow-states.test.js')),
  require(path.join(__dirname, 'checkbox-stats.test.js')),
  require(path.join(__dirname, 'checkbox-cookie-toggle.test.js')),
  require(path.join(__dirname, 'checkbox-auto-done.test.js')),
  require(path.join(__dirname, 'checkbox-toggle.test.js')),
  require(path.join(__dirname, 'move-block.test.js')),
  require(path.join(__dirname, 'org-properties.test.js')),
  require(path.join(__dirname, 'smart-insert-new-element.test.js')),
  require(path.join(__dirname, 'math-decorations-map.test.js')),
  require(path.join(__dirname, 'date-parsing.test.js')),
  require(path.join(__dirname, 'calendar-reschedule.test.js'))
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
