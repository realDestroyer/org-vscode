const assert = require('assert');
const fs = require('fs');
const path = require('path');

const viewScriptPath = path.join(__dirname, '..', '..', 'media', 'yearDashboardView.js');
const dashboardHostPath = path.join(__dirname, '..', '..', 'out', 'yearDashboard.js');

function collectMatches(source, regex, group) {
  return Array.from(source.matchAll(regex)).map(match => match[group]);
}

module.exports = {
  name: 'unit/year-dashboard-webview',
  run() {
    const view = fs.readFileSync(viewScriptPath, 'utf-8');
    const host = fs.readFileSync(dashboardHostPath, 'utf-8');

    assert.doesNotThrow(() => new Function(view), 'Dashboard webview script must parse');

    // Every element the script reaches for must exist in the host HTML.
    const referencedIds = new Set(collectMatches(view, /getElementById\("([^"]+)"\)/g, 1));
    assert.ok(referencedIds.size > 5, 'Expected the view to reference several element ids');
    const missingIds = Array.from(referencedIds).filter(id => !host.includes(`id="${id}"`));
    assert.deepStrictEqual(missingIds, [], `Webview references ids missing from the dashboard HTML: ${missingIds.join(', ')}`);

    // Every function invoked by render() must be defined; a missing one throws at runtime.
    const renderBody = view.match(/function render\(\)\s*\{([\s\S]*?)\n {2}\}/);
    assert.ok(renderBody, 'Expected a render() function in the webview script');
    const calls = new Set(collectMatches(renderBody[1], /\b([a-zA-Z][\w]*)\(/g, 1));
    const ignored = new Set(['if', 'return', 'Number', 'String', 'Boolean']);
    const undefinedCalls = Array.from(calls)
      .filter(name => !ignored.has(name))
      .filter(name => !new RegExp(`function ${name}\\s*\\(`).test(view));
    assert.deepStrictEqual(undefinedCalls, [], `render() calls undefined functions: ${undefinedCalls.join(', ')}`);

    // Messages the webview posts must be handled by the host.
    const postedCommands = new Set(collectMatches(view, /postMessage\(\{\s*command:\s*"([^"]+)"/g, 1));
    const unhandled = Array.from(postedCommands).filter(command => !host.includes(`case "${command}"`));
    assert.deepStrictEqual(unhandled, [], `Webview posts commands the host ignores: ${unhandled.join(', ')}`);

    // Guard the specific regressions this dashboard has hit before.
    ['year-select', 'analytics-stats', 'analytics-grid'].forEach(id => {
      assert.ok(referencedIds.has(id), `View should wire up #${id}`);
    });
    assert.ok(/function renderAnalytics\(/.test(view), 'Analytics tab needs a renderer');
    assert.ok(/function renderYearPicker\(/.test(view), 'Year picker needs a renderer');
    assert.ok(host.includes('data-tab="analytics"'), 'Analytics tab button must exist');
    assert.ok(host.includes('data-view="analytics"'), 'Analytics view container must exist');
  }
};
