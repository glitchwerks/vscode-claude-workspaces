const path = require("node:path");
const { defineConfig } = require("@vscode/test-cli");

module.exports = defineConfig([
  {
    label: "savedWorkspace",
    files: "out/test/integration/**/*.test.js",
    workspaceFolder: path.join(
      __dirname,
      "test/fixtures/saved-workspace/workspace.code-workspace"
    ),
    launchArgs: ["--disable-extensions", "--disable-workspace-trust"],
    mocha: {
      ui: "bdd",
      timeout: 20000
    }
  },
  {
    label: "folderWindow",
    files: "out/test/integration/**/*.test.js",
    workspaceFolder: path.join(__dirname, "test/fixtures/empty-window"),
    launchArgs: ["--disable-extensions", "--disable-workspace-trust"],
    mocha: {
      ui: "bdd",
      timeout: 20000
    }
  }
]);
