import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, unlinkSync as fsRemove, renameSync, readFileSync, readdirSync as requireDirectory } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createSnoreToastNotificationSink,
  installSnoreToastIdentity,
  type SnoreToastActivationServer,
  type SnoreToastProcess
} from "../../src/attention/snoreToastNotificationSink";

class FakeSnoreToastProcess implements SnoreToastProcess {
  private errorListener?: (error: Error) => void;
  private exitListener?: (code: number | null, signal: NodeJS.Signals | null) => void;
  killCalls = 0;

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

  kill(): boolean {
    this.killCalls += 1;
    return true;
  }

  emitError(error: Error): void {
    this.errorListener?.(error);
  }

  emitExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.exitListener?.(code, signal);
  }
}

class FakeSnoreToastActivationServer implements SnoreToastActivationServer {
  readonly pipeName = "\\\\.\\pipe\\claude-workspaces-test";
  readonly registrations: Array<{ notificationId: string; sessionId: string }> = [];
  readonly cancelled: string[] = [];

  register(notificationId: string, sessionId: string): { dispose(): void } {
    this.registrations.push({ notificationId, sessionId });
    return { dispose: () => { this.cancelled.push(notificationId); } };
  }

  accept(): void {}

  onDidSelect(): { dispose(): void } {
    return { dispose: () => undefined };
  }

  dispose(): void {}
}

describe("SnoreToast notification sink", () => {
  for (const outcome of ["throw", "error", "nonzero", "signal", "timeout"] as const) {
    it("keeps the prior shortcut when staged installation ends with " + outcome, async () => {
      const directory = mkdtempSync(path.join(tmpdir(), "snoretoast failed refresh "));
      const canonical = path.join(directory, "owned.lnk");
      writeFileSync(canonical, "prior helper");
      const child = new FakeSnoreToastProcess();
      const options = {
        executablePath: "current.exe", appId: "test", shortcutPath: "C:\\controlled\\owned.lnk", timeoutMs: 0,
          shortcutFileSystem: {
          rename: (source: string, target: string) => renameSync(path.join(directory, path.win32.basename(source)), path.join(directory, path.win32.basename(target))),
          remove: (file: string) => fsRemove(path.join(directory, path.win32.basename(file)))
        },
        launch: (_executable: string, args: readonly string[]) => {
          writeFileSync(path.join(directory, path.win32.basename(args[1]!)), "staged helper");
          if (outcome === "throw") { throw new Error("spawn failed"); }
          return child;
        }
      };
      try {
        const registration = installSnoreToastIdentity(options);
        const rejected = assert.rejects(registration);
        if (outcome === "error") { child.emitError(new Error("spawn failed")); }
        if (outcome === "nonzero") { child.emitExit(1, null); }
        if (outcome === "signal") { child.emitExit(null, "SIGTERM"); }
        await rejected;
        assert.equal(readFileSync(canonical, "utf8"), "prior helper");
        assert.deepEqual(requireDirectory(directory), ["owned.lnk"]);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    });
  }

  for (const existing of [false, true]) {
    it("atomically commits a staged " + (existing ? "upgrade" : "fresh identity") + " after success", async () => {
      const directory = mkdtempSync(path.join(tmpdir(), "snoretoast staged success "));
      const canonical = path.join(directory, "owned.lnk");
      if (existing) { writeFileSync(canonical, "prior helper"); }
      const child = new FakeSnoreToastProcess();
      const options = {
        executablePath: "current.exe", appId: "test", shortcutPath: "C:\\controlled\\owned.lnk",
        shortcutFileSystem: {
          rename: (source: string, target: string) => renameSync(path.join(directory, path.win32.basename(source)), path.join(directory, path.win32.basename(target))),
          remove: (file: string) => fsRemove(path.join(directory, path.win32.basename(file)))
        },
        launch: (_executable: string, args: readonly string[]) => {
          assert.notEqual(args[1], "C:\\controlled\\owned.lnk");
          if (existing) { assert.equal(readFileSync(canonical, "utf8"), "prior helper"); }
          writeFileSync(path.join(directory, path.win32.basename(args[1]!)), "current helper");
          return child;
        }
      };
      try {
        const registration = installSnoreToastIdentity(options);
        child.emitExit(0, null);
        await registration;
        assert.equal(readFileSync(canonical, "utf8"), "current helper");
        assert.deepEqual(requireDirectory(directory), ["owned.lnk"]);
      } finally { rmSync(directory, { recursive: true, force: true }); }
    });
  }

  it("preserves another window's canonical replacement on failure", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "snoretoast concurrent refresh "));
    const canonical = path.join(directory, "owned.lnk");
    writeFileSync(canonical, "prior helper");
    const child = new FakeSnoreToastProcess();
    const options = {
      executablePath: "current.exe", appId: "test", shortcutPath: "C:\\controlled\\owned.lnk",
      shortcutFileSystem: {
        rename: (source: string, target: string) => renameSync(path.join(directory, path.win32.basename(source)), path.join(directory, path.win32.basename(target))),
        remove: (file: string) => fsRemove(path.join(directory, path.win32.basename(file)))
      },
      launch: (_executable: string, args: readonly string[]) => {
        writeFileSync(path.join(directory, path.win32.basename(args[1]!)), "staged helper");
        writeFileSync(canonical, "another window helper");
        return child;
      }
    };
    try {
      const registration = installSnoreToastIdentity(options);
      const rejected = assert.rejects(registration);
      child.emitExit(1, null);
      await rejected;
      assert.equal(readFileSync(canonical, "utf8"), "another window helper");
      assert.deepEqual(requireDirectory(directory), ["owned.lnk"]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("preserves the old shortcut when committing a successful installer fails", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "snoretoast rename failure "));
    const canonical = path.join(directory, "owned.lnk");
    writeFileSync(canonical, "prior helper");
    const child = new FakeSnoreToastProcess();
    const options = {
      executablePath: "current.exe", appId: "test", shortcutPath: "C:\\controlled\\owned.lnk",
      shortcutFileSystem: {
        rename: () => { throw new Error("shortcut locked"); },
        remove: (file: string) => fsRemove(path.join(directory, path.win32.basename(file)))
      },
      launch: (_executable: string, args: readonly string[]) => {
        writeFileSync(path.join(directory, path.win32.basename(args[1]!)), "staged helper");
        return child;
      }
    };
    try {
      const registration = installSnoreToastIdentity(options);
      const rejected = assert.rejects(registration, /shortcut locked/);
      child.emitExit(0, null);
      await rejected;
      assert.equal(readFileSync(canonical, "utf8"), "prior helper");
      assert.deepEqual(requireDirectory(directory), ["owned.lnk"]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it("rejects a relative shortcut without APPDATA instead of touching the working directory", async () => {
    let launches = 0;
    const options = {
      executablePath: "SnoreToast.exe", appId: "cbeaulieu-gt.ClaudeWorkspaces",
      shortcutPath: "Claude Workspaces\\Claude Workspaces.lnk", appDataPath: "",
      shortcutFileSystem: { rename: () => { throw new Error("must not commit"); }, remove: () => { throw new Error("must not remove"); } },
      launch: () => { launches += 1; throw new Error("installer must not launch"); }
    };
    await assert.rejects(installSnoreToastIdentity(options), /APPDATA/);
    assert.equal(launches, 0);
  });

  it("registers a dedicated activator identity before notification delivery", async () => {
    // Falling back to VS Code's identity would reopen the application in an empty window.
    const launches: Array<{
      readonly executablePath: string;
      readonly args: readonly string[];
    }> = [];
    const child = new FakeSnoreToastProcess();
    const executablePath = "C:\\extension\\media\\attention\\snoretoast\\SnoreToast.exe";

    const registration = installSnoreToastIdentity({
      executablePath,
      appId: "cbeaulieu-gt.ClaudeWorkspaces",
      shortcutPath: "Claude Workspaces\\Claude Workspaces.lnk",
      appDataPath: "C:\\Users\\test\\AppData\\Roaming",
      shortcutFileSystem: { rename: () => undefined, remove: () => undefined },
      launch: (launchedExecutablePath, args) => {
        launches.push({ executablePath: launchedExecutablePath, args });
        return child;
      }
    });

    assert.equal(launches.length, 1);
    assert.equal(launches[0]!.executablePath, executablePath);
    assert.equal(path.win32.dirname(launches[0]!.args[1]!), "C:\\Users\\test\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Claude Workspaces");
    assert.match(path.win32.basename(launches[0]!.args[1]!), /^Claude Workspaces\.install-[a-f0-9-]+\.lnk$/);
    assert.deepEqual([launches[0]!.args[0], ...launches[0]!.args.slice(2)], ["-install", executablePath, "cbeaulieu-gt.ClaudeWorkspaces"]);
    child.emitExit(0, null);
    await registration;
  });

  it("rejects identity registration when SnoreToast cannot install the activator", async () => {
    const child = new FakeSnoreToastProcess();
    const registration = installSnoreToastIdentity({
      executablePath: "SnoreToast.exe",
      appId: "cbeaulieu-gt.ClaudeWorkspaces",
      shortcutPath: "Claude Workspaces\\Claude Workspaces.lnk",
      appDataPath: "C:\\Users\\test\\AppData\\Roaming",
      shortcutFileSystem: { rename: () => undefined, remove: () => undefined },
      launch: () => child
    });

    child.emitExit(1, null);

    await assert.rejects(registration, /identity registration failed/i);
  });

  it("terminates identity registration when SnoreToast does not settle", async () => {
    const child = new FakeSnoreToastProcess();
    const failures: unknown[] = [];
    const options = {
      executablePath: "SnoreToast.exe",
      appId: "cbeaulieu-gt.ClaudeWorkspaces",
      shortcutPath: "Claude Workspaces\\Claude Workspaces.lnk",
      appDataPath: "C:\\Users\\test\\AppData\\Roaming",
      shortcutFileSystem: { rename: () => undefined, remove: () => undefined },
      timeoutMs: 0,
      launch: () => child
    };
    const registration = installSnoreToastIdentity(options);

    const outcome = await Promise.race([
      registration.then(
        () => "resolved" as const,
        (error) => {
          failures.push(error);
          return "rejected" as const;
        }
      ),
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 25))
    ]);

    assert.equal(outcome, "rejected");
    assert.equal(child.killCalls, 1);
    assert.equal(failures.length, 1);
    assert.match(String(failures[0]), /identity registration timed out/i);
  });

  it("launches a branded toast with workspace and session identity", () => {
    // Omitting either identity would make concurrent background sessions indistinguishable.
    const launches: Array<{
      readonly executablePath: string;
      readonly args: readonly string[];
    }> = [];
    const child = new FakeSnoreToastProcess();
    const activationServer = new FakeSnoreToastActivationServer();
    const sink = createSnoreToastNotificationSink({
      executablePath: "C:\\extension\\media\\attention\\snoretoast\\SnoreToast.exe",
      appId: "cbeaulieu-gt.ClaudeWorkspaces",
      activationServer,
      createNotificationId: () => "toast-1",
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
        "-appID",
        "cbeaulieu-gt.ClaudeWorkspaces",
        "-id",
        "toast-1",
        "-pipeName",
        "\\\\.\\pipe\\claude-workspaces-test"
      ]
    }]);
    assert.deepEqual(activationServer.registrations, [{
      notificationId: "toast-1",
      sessionId: "managed-session-1"
    }]);
  });

  it("reports an asynchronous process launch failure", () => {
    // Spawn failures arrive after notify returns and would otherwise disappear silently.
    const failure = new Error("executable blocked");
    const failures: unknown[] = [];
    const child = new FakeSnoreToastProcess();
    const activationServer = new FakeSnoreToastActivationServer();
    const sink = createSnoreToastNotificationSink({
      executablePath: "SnoreToast.exe",
      appId: "cbeaulieu-gt.ClaudeWorkspaces",
      activationServer,
      createNotificationId: () => "failed-toast",
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
    assert.deepEqual(activationServer.cancelled, ["failed-toast"]);
  });

  it("cancels callback correlation when process creation throws", () => {
    const activationServer = new FakeSnoreToastActivationServer();
    const sink = createSnoreToastNotificationSink({
      executablePath: "SnoreToast.exe",
      appId: "cbeaulieu-gt.ClaudeWorkspaces",
      activationServer,
      createNotificationId: () => "thrown-toast",
      launch: () => { throw new Error("spawn rejected"); }
    });

    assert.throws(() => sink.notify({
      sessionId: "managed-session-1",
      workspaceLabel: "API",
      sessionName: "Fix the build"
    }), /spawn rejected/);
    assert.deepEqual(activationServer.cancelled, ["thrown-toast"]);
  });

  it("reports SnoreToast's failed exit status", () => {
    // Node exposes SnoreToast's native -1 status as an unsigned Windows exit code.
    const failures: unknown[] = [];
    const child = new FakeSnoreToastProcess();
    const sink = createSnoreToastNotificationSink({
      executablePath: "SnoreToast.exe",
      appId: "cbeaulieu-gt.ClaudeWorkspaces",
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
      appId: "cbeaulieu-gt.ClaudeWorkspaces",
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
        appId: "cbeaulieu-gt.ClaudeWorkspaces",
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
      appId: "cbeaulieu-gt.ClaudeWorkspaces",
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
