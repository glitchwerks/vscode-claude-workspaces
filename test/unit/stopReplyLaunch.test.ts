import assert from "node:assert/strict";
import { ClaudeCapabilityProbe, type ClaudeHelpRunner } from "../../src/launch/claudeCapabilities";

describe("Stop reply CLI version observation", () => {
  it("reuses the observed version independently of the native module capability result", async () => {
    const commands: string[][] = [];
    const runner: ClaudeHelpRunner = {run: async (_exe, args = ["--help"]) => {
      commands.push([...args]);
      const stdout = args[0] === "--help" ? "--settings <path> --plugin-dir <path>" : "2.1.47 (Claude Code)";
      return {stdout, stderr: ""};
    }};
    const probe = new ClaudeCapabilityProbe(runner);
    assert.deepEqual(await probe.get("claude"), {sessionPersistence: false, settingsFile: true, completionReporter: "unsupported"});
    assert.equal(probe.observedVersion("claude"), "2.1.47");
    await probe.get("claude");
    assert.deepEqual(commands, [["--help"], ["--version"]]);
  });

  it("clears an old observation when a new probe no longer returns a version", async () => {
    let attempt = 0;
    const runner: ClaudeHelpRunner = {run: async (_exe, args = ["--help"]) => {
      let stdout: string;
      if (args[0] === "--help") {
        attempt++;
        stdout = "--settings <path> --plugin-dir <path>";
      } else if (args[0] === "--version") {
        stdout = attempt === 1 ? "2.1.322 (Claude Code)" : "not a valid result";
      } else {
        stdout = "unexpected plugin response";
      }
      return {stdout, stderr: ""};
    }};
    const probe = new ClaudeCapabilityProbe(runner);
    assert.equal((await probe.get("claude")).completionReporter, "failed");
    assert.equal(probe.observedVersion("claude"), "2.1.322");
    assert.equal((await probe.get("claude")).completionReporter, "failed");
    assert.equal(probe.observedVersion("claude"), undefined);
  });
});
