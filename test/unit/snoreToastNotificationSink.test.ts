import assert from "node:assert/strict";

import { createSnoreToastNotificationSink } from "../../src/attention/snoreToastNotificationSink";

describe("SnoreToast notification sink", () => {
  it("launches a branded toast with workspace and session identity", () => {
    // Omitting either identity would make concurrent background sessions indistinguishable.
    const launches: Array<{
      readonly executablePath: string;
      readonly args: readonly string[];
    }> = [];
    const sink = createSnoreToastNotificationSink({
      executablePath: "C:\\extension\\media\\attention\\snoretoast\\SnoreToast.exe",
      processId: 321,
      appId: "Microsoft.VisualStudioCode",
      launch: (executablePath, args) => launches.push({ executablePath, args })
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
    const sink = createSnoreToastNotificationSink({
      executablePath: "SnoreToast.exe",
      processId: 321,
      appId: "Microsoft.VisualStudioCode",
      onError: (error) => failures.push(error),
      launch: (_executablePath, _args, onError) => onError(failure)
    });

    sink.notify({
      sessionId: "managed-session-1",
      workspaceLabel: "API",
      sessionName: "Fix the build"
    });

    assert.deepEqual(failures, [failure]);
  });
});
