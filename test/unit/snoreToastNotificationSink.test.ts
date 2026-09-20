import assert from "node:assert/strict";

import {
  createSnoreToastNotificationSink,
  type SnoreToastProcess
} from "../../src/attention/snoreToastNotificationSink";

class FakeSnoreToastProcess implements SnoreToastProcess {
  private errorListener?: (error: Error) => void;
  private exitListener?: (code: number | null, signal: NodeJS.Signals | null) => void;

  once(event: "error", listener: (error: Error) => void): this;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): this;
  once(
    event: "error" | "exit",
    listener:
      | ((error: Error) => void)
      | ((code: number | null, signal: NodeJS.Signals | null) => void)
  ): this {
    if (event === "error") {
      this.errorListener = listener as (error: Error) => void;
    } else {
      this.exitListener = listener as (
        code: number | null,
        signal: NodeJS.Signals | null
      ) => void;
    }
    return this;
  }

  unref(): void {}

  emitError(error: Error): void {
    this.errorListener?.(error);
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.exitListener?.(code, signal);
  }
}

describe("SnoreToast notification sink", () => {
  it("launches a branded toast with workspace and session identity", () => {
    // Omitting either identity would make concurrent background sessions indistinguishable.
    const launches: Array<{
      readonly executablePath: string;
      readonly args: readonly string[];
    }> = [];
    const child = new FakeSnoreToastProcess();
    const sink = createSnoreToastNotificationSink({
      executablePath: "C:\\extension\\media\\attention\\snoretoast\\SnoreToast.exe",
      processId: 321,
      appId: "Microsoft.VisualStudioCode",
      launch: (executablePath, args) => {
        launches.push({ executablePath, args });
        return child;
      }
    });

    sink.notify({
      sessionId: "managed-session-1",
      workspaceLabel: "API",
      sessionName: "Fix the build"
    });

    assert.deepEqual(launches, [{
      executablePath: "C:\\extension\\media\\attention\\snoretoast\\SnoreToast.exe",
      args: [
        "-t",
        "Claude Workspaces — API",
        "-m",
        "Fix the build is waiting for input.",
        "-pid",
        "321",
        "-appID",
        "Microsoft.VisualStudioCode"
      ]
    }]);
  });

  it("reports an asynchronous process launch failure", () => {
    // Spawn failures arrive after notify returns and would otherwise disappear silently.
    const failure = new Error("executable blocked");
    const failures: unknown[] = [];
    const child = new FakeSnoreToastProcess();
    const sink = createSnoreToastNotificationSink({
      executablePath: "SnoreToast.exe",
      processId: 321,
      appId: "Microsoft.VisualStudioCode",
      onError: (error) => failures.push(error),
      launch: () => child
    });

    sink.notify({
      sessionId: "managed-session-1",
      workspaceLabel: "API",
      sessionName: "Fix the build"
    });
    child.emitError(failure);

    assert.deepEqual(failures, [failure]);
  });

  it("reports SnoreToast's failed exit status", () => {
    // Node exposes SnoreToast's native -1 status as an unsigned Windows exit code.
    const failures: unknown[] = [];
    const child = new FakeSnoreToastProcess();
    const sink = createSnoreToastNotificationSink({
      executablePath: "SnoreToast.exe",
      processId: 321,
      appId: "Microsoft.VisualStudioCode",
      onError: (error) => failures.push(error),
      launch: () => child
    });

    sink.notify({
      sessionId: "managed-session-1",
      workspaceLabel: "API",
      sessionName: "Fix the build"
    });
    child.emitExit(0xffffffff, null);

    assert.equal(failures.length, 1);
    assert.match(String(failures[0]), /failure status/i);
  });

  it("reports signal termination", () => {
    const failures: unknown[] = [];
    const child = new FakeSnoreToastProcess();
    const sink = createSnoreToastNotificationSink({
      executablePath: "SnoreToast.exe",
      processId: 321,
      appId: "Microsoft.VisualStudioCode",
      onError: (error) => failures.push(error),
      launch: () => child
    });

    sink.notify({
      sessionId: "managed-session-1",
      workspaceLabel: "API",
      sessionName: "Fix the build"
    });
    child.emitExit(null, "SIGTERM");

    assert.equal(failures.length, 1);
    assert.match(String(failures[0]), /signal SIGTERM/i);
  });

  it("accepts every documented non-failure SnoreToast status", () => {
    const failures: unknown[] = [];

    for (const status of [0, 1, 2, 3, 4, 5]) {
      const child = new FakeSnoreToastProcess();
      const sink = createSnoreToastNotificationSink({
        executablePath: "SnoreToast.exe",
        processId: 321,
        appId: "Microsoft.VisualStudioCode",
        onError: (error) => failures.push(error),
        launch: () => child
      });

      sink.notify({
        sessionId: `managed-session-${status}`,
        workspaceLabel: "API",
        sessionName: "Fix the build"
      });
      child.emitExit(status, null);
    }

    assert.deepEqual(failures, []);
  });

  it("reports at most one failure for a process", () => {
    const launchFailure = new Error("executable blocked");
    const failures: unknown[] = [];
    const child = new FakeSnoreToastProcess();
    const sink = createSnoreToastNotificationSink({
      executablePath: "SnoreToast.exe",
      processId: 321,
      appId: "Microsoft.VisualStudioCode",
      onError: (error) => failures.push(error),
      launch: () => child
    });

    sink.notify({
      sessionId: "managed-session-1",
      workspaceLabel: "API",
      sessionName: "Fix the build"
    });
    child.emitError(launchFailure);
    child.emitExit(0xffffffff, null);

    assert.deepEqual(failures, [launchFailure]);
  });
});
