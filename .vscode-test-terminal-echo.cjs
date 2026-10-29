const path = require("node:path");
const { defineConfig } = require("@vscode/test-cli");

module.exports = defineConfig({
  label: "terminalEcho",
  version: "1.136.1",
  files: "out/test/manual/terminalEcho.test.js",
  workspaceFolder: path.join(__dirname, "test/fixtures/saved-workspace/workspace.code-workspace"),
  launchArgs: ["--disable-extensions", "--disable-workspace-trust"],
  mocha: { ui: "bdd", timeout: 120000 }
});
