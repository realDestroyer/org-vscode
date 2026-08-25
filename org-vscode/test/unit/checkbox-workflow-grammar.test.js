const assert = require('assert');
const fs = require('fs');
const path = require('path');

function loadGrammar(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertCheckboxWorkflowScopes(grammar) {
  const listPatterns = grammar.repository.org_lists.patterns;
  for (const listPattern of listPatterns) {
    const includes = listPattern.patterns.map((pattern) => pattern.include);
    assert.ok(includes.includes('#org_list_keyword'));
    assert.ok(includes.includes('#org_list_task_text'));
  }

  const keywordScopes = grammar.repository.org_list_keyword.patterns.map((pattern) => pattern.name);
  assert.ok(keywordScopes.includes('keyword.control.in_progress.vso'));

  const taskTextIncludes = grammar.repository.org_list_task_text.patterns.map((pattern) => pattern.include);
  assert.ok(taskTextIncludes.includes('#task_text_in_progress'));
}

module.exports = {
  name: 'unit/checkbox-workflow-grammar',
  run() {
    const extensionRoot = path.resolve(__dirname, '..', '..', '..');
    assertCheckboxWorkflowScopes(loadGrammar(path.join(extensionRoot, 'vso.tmLanguage.json')));
    assertCheckboxWorkflowScopes(loadGrammar(path.join(extensionRoot, 'org-vscode', 'vso.tmLanguage.json')));
  }
};