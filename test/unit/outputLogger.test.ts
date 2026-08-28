import assert from "node:assert/strict";
import type { Uri } from "vscode";

import { OutputLogger } from "../../src/logging/outputLogger";

class RecordingOutputChannel {
  readonly lines: string[] = [];
  disposed = false;

  appendLine(value: string): void {
    this.lines.push(value);
  }

  dispose(): void {
    this.disposed = true;
  }
}

describe("OutputLogger", () => {
  it("writes structured lifecycle diagnostics to its single output channel", () => {
    // A logger that emits unstructured text or drops diagnostic fields must fail.
    const channel = new RecordingOutputChannel();
    const logger = new OutputLogger(channel as never);

    logger.configurationReset(new Error("invalid state"));
    logger.launchPlan({
      executable: "claude",
      args: ["--add-dir", "C:\\work\\client portal"],
      cwd: "C:\\work\\alpha",
      env: {},
      root: {
        id: "alpha",
        label: "alpha",
        uri: { fsPath: "C:\\work\\alpha" } as Uri
      },
      importedRoots: [
        {
          id: "beta",
          label: "beta",
          uri: { fsPath: "C:\\work\\client portal" } as Uri
        }
      ],
      skippedImportIds: ["gamma"]
    });
    logger.skippedImports("alpha", ["gamma"]);
    logger.startupError("spawn failed");
    logger.processExit("alpha 1", 1, 9);
    logger.shutdown(["alpha 1", "beta 1"]);

    assert.deepEqual(channel.lines.map((line) => JSON.parse(line)), [
      { event: "configuration-reset", message: "invalid state" },
      {
        event: "launch-plan",
        executable: "claude",
        args: ["--add-dir", "C:\\work\\client portal"],
        rootId: "alpha",
        importedRootIds: ["beta"],
        skippedImportIds: ["gamma"]
      },
      { event: "skipped-imports", rootId: "alpha", skippedRootIds: ["gamma"] },
      { event: "startup-error", message: "spawn failed" },
      { event: "process-exit", sessionId: "alpha 1", exitCode: 1, signal: 9 },
      { event: "shutdown", sessionIds: ["alpha 1", "beta 1"] }
    ]);
  });

  it("disposes the output channel it owns", () => {
    // A logger that leaves its VS Code output resource alive must fail.
    const channel = new RecordingOutputChannel();

    new OutputLogger(channel as never).dispose();

    assert.equal(channel.disposed, true);
  });
});
