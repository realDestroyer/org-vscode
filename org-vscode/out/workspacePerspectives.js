"use strict";

const vscode = require("vscode");
const { validatePerspectives } = require("./orgQuery");

function getPerspectives(service) {
  const configured = vscode.workspace.getConfiguration("Org-vscode").get("workspaceIndex.perspectives", []);
  return validatePerspectives(configured, {
    maxResults: vscode.workspace.getConfiguration("Org-vscode").get("workspaceIndex.resultLimit", 100)
  }).perspectives;
}

function registerWorkspacePerspectives(ctx, service) {
  let provider = null;

  const updateWelcomeContext = () => {
    const hasPerspectives = getPerspectives(service).length > 0;
    vscode.commands.executeCommand("setContext", "org-vscode.hasPerspectives", hasPerspectives);
  };
  updateWelcomeContext();

  ctx.subscriptions.push(
    vscode.commands.registerCommand("org-vscode.rebuildWorkspaceIndex", () => service.rebuild()),
    vscode.commands.registerCommand("org-vscode.refreshPerspectives", () => provider && provider.refresh()),
    vscode.commands.registerCommand("org-vscode.openIndexedHeading", async (record) => {
      const uri = service.resolveRecordUri(record);
      if (!uri || !record || !Number.isInteger(record.line) || record.line < 0) {
        vscode.window.showErrorMessage("Org-vscode: Refusing to open an invalid or non-workspace index result.");
        return;
      }
      const document = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(document, { preview: true });
      const line = Math.min(record.line, Math.max(0, document.lineCount - 1));
      const position = new vscode.Position(line, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    })
  );

  if (!vscode.window.registerTreeDataProvider || !vscode.EventEmitter || !vscode.TreeItem) return null;

  class PerspectivesProvider {
    constructor() {
      this.emitter = new vscode.EventEmitter();
      this.onDidChangeTreeData = this.emitter.event;
      this.indexListener = service.onDidChange(() => this.refresh());
    }

    refresh() {
      this.emitter.fire(undefined);
    }

    getTreeItem(item) {
      return item;
    }

    getChildren(item) {
      if (!service.enabled) return [];
      if (!item) {
        return getPerspectives(service).map((perspective) => {
          const treeItem = new vscode.TreeItem(perspective.name, vscode.TreeItemCollapsibleState.Collapsed);
          treeItem.contextValue = "orgPerspective";
          treeItem.perspective = perspective;
          return treeItem;
        });
      }
      if (!item.perspective) return [];
      const response = service.query(item.perspective.query);
      return response.results.map((record) => {
        const label = record.status ? `${record.status} ${record.title}` : record.title;
        const treeItem = new vscode.TreeItem(label || "(heading)", vscode.TreeItemCollapsibleState.None);
        treeItem.description = `${record.path}:${record.line + 1}`;
        treeItem.tooltip = `${treeItem.description}${record.tags.length ? `  :${record.tags.join(":")}:` : ""}`;
        treeItem.command = { command: "org-vscode.openIndexedHeading", title: "Open Heading", arguments: [record] };
        treeItem.contextValue = "orgIndexedHeading";
        return treeItem;
      });
    }

    dispose() {
      this.indexListener.dispose();
      this.emitter.dispose();
    }
  }

  provider = new PerspectivesProvider();
  const configListener = vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration("Org-vscode.workspaceIndex.perspectives")) {
      updateWelcomeContext();
      provider.refresh();
    }
  });
  ctx.subscriptions.push(provider, configListener, vscode.window.registerTreeDataProvider("org-vscode.perspectives", provider));
  return provider;
}

module.exports = { registerWorkspacePerspectives, getPerspectives };