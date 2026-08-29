const assert = require('assert');
const path = require('path');

const {
  normalizeTransitionNote,
  formatTransitionNoteEntry,
  requestTransitionNote,
  computeTransitionLogbookInsertion,
  applyTransitionLogbookInsertion
} = require(path.join(__dirname, '..', '..', 'out', 'transitionNotes.js'));
const { createWorkflowRegistry } = require(path.join(__dirname, '..', '..', 'out', 'workflowStates.js'));

function createRegistry() {
  return createWorkflowRegistry([
    { keyword: 'TODO' },
    { keyword: 'WAITING', notePrompt: true }
  ]);
}

async function testPromptNormalizationAndCancellation() {
  const registry = createRegistry();
  const prompted = await requestTransitionNote({
    fromKeyword: 'TODO',
    toKeyword: 'WAITING',
    workflowRegistry: registry,
    showInputBox: async () => '  waiting\n for   review  '
  });
  assert.deepStrictEqual(prompted, { prompted: true, cancelled: false, note: 'waiting for review' });

  const cancelled = await requestTransitionNote({
    fromKeyword: 'TODO',
    toKeyword: 'WAITING',
    workflowRegistry: registry,
    showInputBox: async () => undefined
  });
  assert.strictEqual(cancelled.cancelled, true);

  let called = false;
  const suppressed = await requestTransitionNote({
    fromKeyword: 'TODO',
    toKeyword: 'WAITING',
    workflowRegistry: registry,
    suppressNotePrompt: true,
    showInputBox: async () => { called = true; }
  });
  assert.strictEqual(called, false);
  assert.strictEqual(suppressed.prompted, false);
}

function testEntryFormattingAndSingleInsertion() {
  assert.strictEqual(normalizeTransitionNote(' one\r\n two  '), 'one two');
  assert.strictEqual(
    formatTransitionNoteEntry({ fromKeyword: 'TODO', toKeyword: 'WAITING', timestamp: '2026-08-28 Fri 09:30', note: 'Need input' }),
    'State "WAITING" from "TODO" [2026-08-28 Fri 09:30] \\\\ Need input'
  );
  assert.strictEqual(
    formatTransitionNoteEntry({ fromKeyword: 'TODO', toKeyword: 'WAITING', timestamp: '2026-08-28 Fri 09:30', note: '   ' }),
    'State "WAITING" from "TODO" [2026-08-28 Fri 09:30]'
  );

  const insertion = computeTransitionLogbookInsertion(['* TODO Task'], 0, {
    prompted: true,
    completionTransition: true,
    logIntoDrawer: true,
    fromKeyword: 'TODO',
    toKeyword: 'WAITING',
    timestamp: '2026-08-28 Fri 09:30',
    note: 'Need input',
    drawerName: 'HISTORY',
    bodyIndent: '    '
  });
  assert.strictEqual(insertion.lineIndex, 1);
  assert.strictEqual(
    insertion.text,
    '\n    :HISTORY:\n    - State "WAITING" from "TODO" [2026-08-28 Fri 09:30] \\\\ Need input\n    :END:\n'
  );

  const sourceLines = ['* WAITING Task'];
  assert.strictEqual(applyTransitionLogbookInsertion(sourceLines, 0, {
    prompted: true,
    fromKeyword: 'TODO',
    toKeyword: 'WAITING',
    timestamp: '2026-08-28 Fri 09:30',
    note: 'Need input'
  }), true);
  assert.deepStrictEqual(sourceLines, [
    '* WAITING Task',
    '  :LOGBOOK:',
    '  - State "WAITING" from "TODO" [2026-08-28 Fri 09:30] \\\\ Need input',
    '  :END:'
  ]);

  const sourceLinesWithTrailingNewline = ['* WAITING Task', ''];
  applyTransitionLogbookInsertion(sourceLinesWithTrailingNewline, 0, {
    prompted: true,
    fromKeyword: 'TODO',
    toKeyword: 'WAITING',
    timestamp: '2026-08-28 Fri 09:30'
  });
  assert.deepStrictEqual(sourceLinesWithTrailingNewline, [
    '* WAITING Task',
    '  :LOGBOOK:',
    '  - State "WAITING" from "TODO" [2026-08-28 Fri 09:30]',
    '  :END:',
    ''
  ]);
}

function testDocumentLinesAreLoadedOnlyWhenLogging() {
  let loads = 0;
  const provideLines = () => {
    loads += 1;
    return ['* TODO Task'];
  };

  assert.deepStrictEqual(
    computeTransitionLogbookInsertion(provideLines, 0, {
      prompted: false,
      completionTransition: false,
      logIntoDrawer: true
    }),
    { changed: false }
  );
  assert.strictEqual(loads, 0);

  computeTransitionLogbookInsertion(provideLines, 0, {
    prompted: false,
    completionTransition: true,
    logIntoDrawer: true,
    fromKeyword: 'TODO',
    toKeyword: 'DONE',
    timestamp: '2026-08-28 Fri 09:30'
  });
  assert.strictEqual(loads, 1);
}

module.exports = {
  name: 'unit/transition-notes',
  run: async () => {
    await testPromptNormalizationAndCancellation();
    testEntryFormattingAndSingleInsertion();
    testDocumentLinesAreLoadedOnlyWhenLogging();
  }
};