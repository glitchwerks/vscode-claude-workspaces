import assert from "node:assert/strict";

import {
  ClaudeCapabilityProbe,
  createNodeClaudeHelpRunner,
  type ClaudeHelpRunner
} from "../../src/launch/claudeCapabilities";

class ControlledHelpRunner implements ClaudeHelpRunner {
  readonly calls: string[] = [];
  private readonly responses = new Map<string, Promise<{ readonly stdout: string; readonly stderr: string }>>();

  setResponse(
    executable: string,
    response: Promise<{ readonly stdout: string; readonly stderr: string }>
  ): void {
    this.responses.set(executable, response);
  }

  run(executable: string): Promise<{ readonly stdout: string; readonly stderr: string }> {
    this.calls.push(executable);
    const response = this.responses.get(executable);
    if (response === undefined) {
      throw new Error(`No help response for ${executable}.`);
    }
    return response;
  }
}

describe("ClaudeCapabilityProbe", () => {
  it("runs the configured executable's help command at the process boundary", async () => {
    // Omitting --help would leave Node waiting for interactive input instead of returning help text.
    const output = await createNodeClaudeHelpRunner().run(process.execPath);

    assert.match(`${output.stdout}\n${output.stderr}`, /Usage: node/);
  });

  it("enables session persistence only when both complete flags appear across help output", async () => {
    // Matching a flag prefix or searching only one stream would enable an unsupported CLI.
    const runner = new ControlledHelpRunner();
    runner.setResponse("claude", Promise.resolve({
      stdout: "Usage: claude [options]\n  --session-id <uuid>",
      stderr: "  --resume [sessionId]"
    }));
    runner.setResponse("legacy-claude", Promise.resolve({
      stdout: "  --session-identifier <uuid>",
      stderr: "  --resume-session <uuid>"
    }));
    runner.setResponse("resume-only-claude", Promise.resolve({
      stdout: "  --resume [sessionId]",
      stderr: ""
    }));
    const probe = new ClaudeCapabilityProbe(runner);

    assert.deepEqual(await probe.get("claude"), { sessionPersistence: true });
    assert.deepEqual(await probe.get("legacy-claude"), { sessionPersistence: false });
    assert.deepEqual(await probe.get("resume-only-claude"), { sessionPersistence: false });
  });

  it("combines both help streams without assigning each flag to a fixed stream", async () => {
    // Searching --session-id only in stdout or --resume only in stderr rejects valid reordered output.
    const runner = new ControlledHelpRunner();
    runner.setResponse("reordered-claude", Promise.resolve({
      stdout: "  --resume [sessionId]",
      stderr: "  --session-id <uuid>"
    }));

    assert.deepEqual(
      await new ClaudeCapabilityProbe(runner).get("reordered-claude"),
      { sessionPersistence: true }
    );
  });

  it("returns unsupported when the help process rejects", async () => {
    // Propagating a probe failure would prevent an ordinary non-resumable launch.
    const runner = new ControlledHelpRunner();
    runner.setResponse("missing-claude", Promise.reject(new Error("ENOENT")));

    assert.deepEqual(
      await new ClaudeCapabilityProbe(runner).get("missing-claude"),
      { sessionPersistence: false }
    );
  });

  it("shares a pending and completed probe for one executable", async () => {
    // Caching only after await would issue simultaneous duplicate help processes.
    const runner = new ControlledHelpRunner();
    let resolveResponse: ((value: { readonly stdout: string; readonly stderr: string }) => void) | undefined;
    runner.setResponse("claude", new Promise((resolve) => {
      resolveResponse = resolve;
    }));
    const probe = new ClaudeCapabilityProbe(runner);

    const first = probe.get("claude");
    const second = probe.get("claude");
    assert.deepEqual(runner.calls, ["claude"]);

    resolveResponse?.({ stdout: "--session-id <uuid>", stderr: "--resume [sessionId]" });
    assert.deepEqual(await Promise.all([first, second]), [
      { sessionPersistence: true },
      { sessionPersistence: true }
    ]);
    assert.deepEqual(await probe.get("claude"), { sessionPersistence: true });
    assert.deepEqual(runner.calls, ["claude"]);
  });

  it("probes distinct executables independently", async () => {
    // Keying the cache globally would apply one configured executable's support to another.
    const runner = new ControlledHelpRunner();
    runner.setResponse("new-claude", Promise.resolve({
      stdout: "--session-id <uuid>",
      stderr: "--resume [sessionId]"
    }));
    runner.setResponse("old-claude", Promise.resolve({ stdout: "--session-id <uuid>", stderr: "" }));
    const probe = new ClaudeCapabilityProbe(runner);

    assert.deepEqual(await probe.get("new-claude"), { sessionPersistence: true });
    assert.deepEqual(await probe.get("old-claude"), { sessionPersistence: false });
    assert.deepEqual(runner.calls, ["new-claude", "old-claude"]);
  });
});
