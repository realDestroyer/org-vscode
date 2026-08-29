"use strict";

const assert = require("assert");
const path = require("path");
const Module = require("module");

function loadProvider() {
  let workflowStates;
  let configurationReads = 0;
  const vscodeMock = {
    workspace: {
      getConfiguration() {
        return {
          get(key) {
            if (key === "workflowStates") configurationReads += 1;
            return workflowStates;
          }
        };
      }
    }
  };
  const originalRequire = Module.prototype.require;
  const target = require.resolve(path.join(__dirname, "..", "..", "out", "orgSymbolProvider.js"));
  delete require.cache[target];
  Module.prototype.require = function patchedRequire(request) {
    if (request === "vscode") return vscodeMock;
    return originalRequire.apply(this, arguments);
  };

  try {
    const provider = require(target);
    return {
      provider,
      getConfigurationReads: () => configurationReads,
      setWorkflowStates: (value) => { workflowStates = value; },
      dispose: () => {
        Module.prototype.require = originalRequire;
        delete require.cache[target];
      }
    };
  } catch (error) {
    Module.prototype.require = originalRequire;
    delete require.cache[target];
    throw error;
  }
}

module.exports = {
  name: "unit/org-symbol-provider",
  run() {
    const loaded = loadProvider();
    try {
      for (let index = 0; index < 100; index += 1) {
        assert.strictEqual(loaded.provider.parseHeadingLine(`* TODO Heading ${index}`).level, 1);
      }
      assert.strictEqual(loaded.getConfigurationReads(), 1);

      loaded.setWorkflowStates([{ keyword: "CUSTOM", marker: "!" }]);
      assert.strictEqual(loaded.provider.parseHeadingLine("! CUSTOM Heading"), null);
      loaded.provider.invalidateHeadingParserCache();
      assert.strictEqual(loaded.provider.parseHeadingLine("! CUSTOM Heading").title, "Heading");
      assert.strictEqual(loaded.getConfigurationReads(), 2);
    } finally {
      loaded.dispose();
    }
  }
};