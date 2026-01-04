const vscode = require("vscode");
const moment = require("moment");
const { getDateFormat } = require("./dateUtils");

const LANGUAGE_SELECTOR = { language: "vso", scheme: "file" };

function buildTodayString() {
  const config = vscode.workspace.getConfiguration("Org-vscode");
  const dateFormat = getDateFormat(config);
  return moment().format(dateFormat);
}

function createCompletion(prefix, description, buildSnippet) {
  const item = new vscode.CompletionItem(prefix, vscode.CompletionItemKind.Snippet);
  item.detail = "Org-vscode";
  item.documentation = description;
  item.insertText = buildSnippet();
  // Ensure we replace the typed prefix.
  item.filterText = prefix;
  item.sortText = `0_${prefix}`;
  return item;
}

function registerDateSnippets(ctx) {
  const provider = {
    provideCompletionItems(document, position) {
      const line = document.lineAt(position.line).text;

      // Find the current token (from last whitespace to cursor)
      const left = line.slice(0, position.character);
      const match = left.match(/(\S+)$/);
      const token = match ? match[1] : "";
      if (!token.startsWith("/")) {
        return [];
      }

      const startCol = position.character - token.length;
      const range = new vscode.Range(
        new vscode.Position(position.line, startCol),
        new vscode.Position(position.line, position.character)
      );

      const today = buildTodayString();
      const todayDow = moment().format("ddd");

      const items = [];

      const maybePush = (prefix, description, snippetText) => {
        if (!prefix.startsWith(token)) return;
        const item = createCompletion(prefix, description, () => new vscode.SnippetString(snippetText));
        item.range = range;
        items.push(item);
      };

      // These are intentionally implemented as completion snippets (not VS Code snippet JSON)
      // because snippet JSON cannot read extension settings (dateFormat).
      maybePush(
        "/day",
        "New day heading with today's date (uses Org-vscode.dateFormat).",
        `* [${today} ${todayDow}] -------------------------------------------------------------------------------------------------------------------------------\n    $0`
      );

      maybePush(
        "/todo",
        "New TODO task with scheduled date (uses Org-vscode.dateFormat).",
        `* TODO \${1:Task}\n   SCHEDULED: [${today}]`
      );

      maybePush(
        "/tagged",
        "Tagged TODO task with scheduled date (uses Org-vscode.dateFormat).",
        `* TODO \${1:Task} :PROJECT:URGENT:\n   SCHEDULED: [${today}]`
      );

      maybePush(
        "/deadline",
        "Task with scheduled date + deadline (uses Org-vscode.dateFormat).",
        `* TODO \${1:Task}\n   SCHEDULED: [${today}]\n   DEADLINE: [\${2:${today}}]`
      );

      maybePush(
        "/meeting",
        "Meeting notes header (uses Org-vscode.dateFormat).",
        `* ${today} :: \${1:Topic}\n- Attendees: \n- Notes:\n- Action Items:\n$0`
      );

      maybePush(
        "/template",
        "Full task template block (uses Org-vscode.dateFormat).",
        `* TODO \${1:Task Name}\n   SCHEDULED: [${today}]\n   CLOSED: []\n\n- Description:\n- Tags: :TAG:\n\n------------------------\n$0`
      );

      return items;
    }
  };

  ctx.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(LANGUAGE_SELECTOR, provider, "/")
  );
}

module.exports = {
  registerDateSnippets
};
