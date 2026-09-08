import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Uri } from "vscode";

import {
  NodePtyFactory,
  type NativePty,
  type NodePtyModule
} from "../../src/launch/nodePtyAdapter";
import type { LaunchSpec } from "../../src/launch/launchPlanner";
import { WindowsCommandScriptArgumentError } from "../../src/launch/windowsCommandScriptInvocation";

interface Disposable {
  dispose(): void;
}

const execFileAsync = promisify(execFile);

class StubNativePty implements NativePty {
  readonly dataListeners: Array<(data: string) => void> = [];
  readonly exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  readonly writes: string[] = [];
  readonly resizes: Array<{ columns: number; rows: number }> = [];
  kills = 0;
  killFailure: Error | undefined;

  readonly onData = (listener: (data: string) => void): Disposable => {
    this.dataListeners.push(listener);
    return { dispose: () => this.remove(this.dataListeners, listener) };
  };

  readonly onExit = (listener: (event: { exitCode: number; signal?: number }) => void): Disposable => {
    this.exitListeners.push(listener);
    return { dispose: () => this.remove(this.exitListeners, listener) };
  };

  write(data: string): void {
    this.writes.push(data);
  }

  resize(columns: number, rows: number): void {
    this.resizes.push({ columns, rows });
  }

  kill(): void {
    this.kills += 1;
    if (this.killFailure !== undefined) {
      const failure = this.killFailure;
      this.killFailure = undefined;
      throw failure;
    }
  }

  emitData(data: string): void {
    this.dataListeners.forEach((listener) => listener(data));
  }

  emitExit(event: { exitCode: number; signal?: number }): void {
    this.exitListeners.forEach((listener) => listener(event));
  }

  private remove<T>(listeners: T[], listener: T): void {
    const index = listeners.indexOf(listener);
    if (index >= 0) {
      listeners.splice(index, 1);
    }
  }
}

class StubNodePty implements NodePtyModule {
  readonly spawned: Array<{
    executable: string;
    args: string[] | string;
    options: { cwd: string; env: Record<string, string | undefined> };
  }> = [];
  readonly nativePty = new StubNativePty();
  failure: Error | undefined;

  spawn(
    executable: string,
    args: string[] | string,
    options: { cwd: string; env: Record<string, string | undefined> }
  ): NativePty {
    if (this.failure !== undefined) {
      throw this.failure;
    }
    this.spawned.push({ executable, args, options });
    return this.nativePty;
  }
}

const spec: LaunchSpec = {
  executable: "C:\\Program Files\\Claude\\claude.exe",
  args: ["--add-dir", "C:\\work\\client portal"],
  cwd: "C:\\work\\alpha",
  env: { PATH: "C:\\bin", KEEP: "yes" },
  root: {
    id: "alpha",
    label: "alpha",
    uri: { fsPath: "C:\\work\\alpha" } as Uri
  },
  importedRoots: [],
  skippedImportIds: []
};

describe("NodePtyAdapter", () => {
  it("loads node-pty only when an uninjected factory spawns", async () => {
    // An adapter that imports node-pty during module evaluation or construction must fail.
    const nodePty = new StubNodePty();
    let loads = 0;
    const factory = new NodePtyFactory(undefined, async () => {
      loads += 1;
      return nodePty;
    });

    assert.equal(loads, 0);
    await factory.spawn(spec);

    assert.equal(loads, 1);
    assert.equal(nodePty.spawned.length, 1);
  });

  it("rejects spawn when lazy loading node-pty fails", async () => {
    // An adapter that loads the native dependency before spawn cannot surface this recoverably.
    const loadFailure = new Error("native module unavailable");
    const factory = new NodePtyFactory(undefined, async () => {
      throw loadFailure;
    });

    await assert.rejects(factory.spawn(spec), loadFailure);
  });

  it("bypasses the lazy loader when a node-pty module is injected", async () => {
    // An adapter that loads the native binary despite injection must fail this test.
    const nodePty = new StubNodePty();
    let loads = 0;
    const factory = new NodePtyFactory(nodePty, async () => {
      loads += 1;
      throw new Error("loader should not run");
    });

    await factory.spawn(spec);

    assert.equal(loads, 0);
    assert.equal(nodePty.spawned.length, 1);
  });

  it("spawns the exact structured launch specification without a shell", async () => {
    // An adapter that joins args, changes cwd, or drops inherited env must fail.
    const nodePty = new StubNodePty();
    const factory = new NodePtyFactory(nodePty);

    await factory.spawn(spec);

    assert.deepEqual(nodePty.spawned, [
      {
        executable: "C:\\Program Files\\Claude\\claude.exe",
        args: ["--add-dir", "C:\\work\\client portal"],
        options: {
          cwd: "C:\\work\\alpha",
          env: {
            PATH: "C:\\bin",
            KEEP: "yes",
            TERM: "xterm-256color",
            COLORTERM: "truecolor"
          }
        }
      }
    ]);
  });

  it("resolves a bare Windows executable from Path before spawning", async () => {
    // Forwarding the bare command to node-pty reproduces its Windows "File not found" failure.
    const nodePty = new StubNodePty();
    const bareSpec: LaunchSpec = {
      ...spec,
      executable: "claude",
      env: {
        Path: "C:\\missing;C:\\Users\\test\\.local\\bin",
        PATHEXT: ".COM;.EXE;.CMD"
      }
    };
    const factory = new NodePtyFactory(nodePty, undefined, {
      platform: "win32",
      fileExists: (candidate) => candidate === "C:\\Users\\test\\.local\\bin\\claude.EXE"
    });

    await factory.spawn(bareSpec);

    assert.equal(
      nodePty.spawned[0]?.executable,
      "C:\\Users\\test\\.local\\bin\\claude.EXE"
    );
    assert.deepEqual(nodePty.spawned[0]?.args, ["--add-dir", "C:\\work\\client portal"]);
  });

  it("skips an earlier Windows executable directory when resolving the default PTY command", async () => {
    // existsSync accepts the shadow directory and prevents the later executable from launching.
    if (process.platform !== "win32") {
      return;
    }
    const parentDirectory = await mkdtemp(path.join(tmpdir(), "claude pty resolution "));
    const shadowDirectory = path.join(parentDirectory, "shadow");
    const executableDirectory = path.join(parentDirectory, "executable");
    const executableName = "review-fix-claude.EXE";
    const executablePath = path.join(executableDirectory, executableName);
    await mkdir(path.join(shadowDirectory, executableName), { recursive: true });
    await mkdir(executableDirectory);
    await writeFile(executablePath, "", "utf8");

    try {
      const nodePty = new StubNodePty();
      const factory = new NodePtyFactory(nodePty, undefined, { platform: "win32" });

      await factory.spawn({
        ...spec,
        executable: "review-fix-claude",
        env: { Path: `${shadowDirectory};${executableDirectory}`, PATHEXT: ".EXE" }
      });

      assert.equal(nodePty.spawned[0]?.executable, executablePath);
    } finally {
      await rm(parentDirectory, { recursive: true, force: true });
    }
  });

  it("launches a Windows command wrapper with opaque paths and arguments through a real PTY", async function () {
    // Passing a resolved .cmd file directly to node-pty fails before the wrapper can receive its arguments.
    if (process.platform !== "win32") {
      return;
    }
    this.timeout(15_000);
    const harnessPath = path.join(
      __dirname,
      "..",
      "support",
      "windowsCommandScriptPtyChild.js"
    );
    const { stdout, stderr } = await execFileAsync(process.execPath, [harnessPath], {
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true
    });
    const result = JSON.parse(stdout) as {
      readonly exitEvent: { readonly exitCode: number; readonly signal?: number };
      readonly output: string;
      readonly parentDirectory: string;
    };

    assert.equal(stderr, "");
    assert.deepEqual(result.exitEvent, { exitCode: 0 }, result.output);
    assert.match(result.output, /ARG_1="--add-dir"/);
    assert.ok(result.output.includes(
      "ARG_2=\"C:\\workspace with spaces\\%TEMP% & bang ! caret ^ (left) right\""
    ));
    assert.match(result.output, /ARG_3="--session-id"/);
    assert.ok(result.output.includes(
      "ARG_4=\"value with spaces %USERPROFILE% & bang ! caret ^ (session)\""
    ));
    await assert.rejects(access(result.parentDirectory), { code: "ENOENT" });
  });

  it("keeps Windows command-script values out of node-pty's raw command line", async () => {
    // Serializing the /c payload as ordinary argv removes cmd.exe's protective quote boundary.
    const nodePty = new StubNodePty();
    const commandScript = "C:\\scripts %TEMP% & bang ! caret ^ (left)\\claude.CMD";
    const forwardedArguments = [
      "--add-dir",
      "C:\\workspace %USERPROFILE% & bang ! caret ^ (right)"
    ];
    const factory = new NodePtyFactory(nodePty, undefined, {
      platform: "win32",
      fileExists: (candidate) => candidate === commandScript
    });

    await factory.spawn({
      ...spec,
      executable: "claude",
      args: forwardedArguments,
      env: {
        Path: "C:\\scripts %TEMP% & bang ! caret ^ (left)",
        PATHEXT: ".CMD",
        ComSpec: "C:\\Windows\\System32\\cmd.exe",
        CLAUDE_WORKSPACES_COMMAND_SCRIPT: "occupied script zero",
        claude_workspaces_command_script_1: "occupied script one",
        CLAUDE_WORKSPACES_COMMAND_ARG_0: "occupied argument zero",
        claude_workspaces_command_arg_0_1: "occupied argument one"
      }
    });

    const spawned = nodePty.spawned[0];
    assert.equal(spawned?.executable, "C:\\Windows\\System32\\cmd.exe");
    assert.equal(
      spawned?.args,
      "/d /s /v:off /c \"\"%CLAUDE_WORKSPACES_COMMAND_SCRIPT_2%\" " +
        "\"%CLAUDE_WORKSPACES_COMMAND_ARG_0_2%\" " +
        "\"%CLAUDE_WORKSPACES_COMMAND_ARG_1%\"\""
    );
    assert.equal(spawned?.options.env.CLAUDE_WORKSPACES_COMMAND_SCRIPT_2, commandScript);
    assert.equal(spawned?.options.env.CLAUDE_WORKSPACES_COMMAND_ARG_0_2, forwardedArguments[0]);
    assert.equal(spawned?.options.env.CLAUDE_WORKSPACES_COMMAND_ARG_1, forwardedArguments[1]);
    assert.ok(!String(spawned?.args).includes(commandScript));
    assert.ok(!String(spawned?.args).includes(forwardedArguments[1] ?? ""));
  });

  it("rejects a quoted Windows command-script argument before spawning", async () => {
    // Expanding a quote into cmd.exe's command line lets later metacharacters alter argv boundaries.
    const nodePty = new StubNodePty();
    const factory = new NodePtyFactory(nodePty, undefined, {
      platform: "win32",
      fileExists: (candidate) => candidate === "C:\\bin\\claude.CMD"
    });

    await assert.rejects(
      factory.spawn({
        ...spec,
        executable: "claude",
        args: ["safe\" & echo INJECTED & rem \""],
        env: { Path: "C:\\bin", PATHEXT: ".CMD" }
      }),
      (error: unknown) => {
        assert.ok(error instanceof WindowsCommandScriptArgumentError);
        assert.equal(error.argumentIndex, 0);
        assert.match(error.message, /argument 0/i);
        return true;
      }
    );
    assert.equal(nodePty.spawned.length, 0);
  });

  it("rejects Windows command-script arguments containing CR or LF before spawning", async () => {
    // A line break expanded into cmd.exe's command text can introduce another command line.
    for (const argument of ["line one\rline two", "line one\nline two"]) {
      const nodePty = new StubNodePty();
      const factory = new NodePtyFactory(nodePty, undefined, {
        platform: "win32",
        fileExists: (candidate) => candidate === "C:\\bin\\claude.CMD"
      });

      await assert.rejects(
        factory.spawn({
          ...spec,
          executable: "claude",
          args: [argument],
          env: { Path: "C:\\bin", PATHEXT: ".CMD" }
        }),
        (error: unknown) => {
          assert.ok(error instanceof WindowsCommandScriptArgumentError);
          assert.equal(error.argumentIndex, 0);
          assert.match(error.message, /argument 0/i);
          return true;
        }
      );
      assert.equal(nodePty.spawned.length, 0);
    }
  });

  it("rejects a quoted Windows command-script executable before spawning", async () => {
    // Although Windows paths cannot contain quotes, an explicit configured command must fail safely too.
    const nodePty = new StubNodePty();
    const factory = new NodePtyFactory(nodePty, undefined, { platform: "win32" });

    await assert.rejects(
      factory.spawn({
        ...spec,
        executable: "C:\\bad\" & echo INJECTED & rem \"\\claude.cmd"
      }),
      (error: unknown) => {
        assert.ok(error instanceof WindowsCommandScriptArgumentError);
        assert.equal(error.valueKind, "executable");
        assert.equal(error.argumentIndex, undefined);
        return true;
      }
    );
    assert.equal(nodePty.spawned.length, 0);
  });

  it("keeps non-Windows commands and explicit executable paths unchanged", async () => {
    const cases: Array<{ executable: string; platform: NodeJS.Platform }> = [
      { executable: "claude", platform: "linux" },
      { executable: "C:\\Program Files\\Claude\\claude.exe", platform: "win32" },
      { executable: "tools/claude", platform: "win32" },
      { executable: "tools\\claude", platform: "win32" }
    ];

    for (const testCase of cases) {
      const nodePty = new StubNodePty();
      const factory = new NodePtyFactory(nodePty, undefined, {
        platform: testCase.platform,
        fileExists: () => true
      });

      await factory.spawn({ ...spec, executable: testCase.executable });

      assert.equal(nodePty.spawned[0]?.executable, testCase.executable);
    }
  });

  it("keeps a bare Windows command when Path is missing or has no matching candidate", async () => {
    for (const env of [{ PATHEXT: ".EXE" }, { Path: "C:\\missing", PATHEXT: ".EXE" }]) {
      const nodePty = new StubNodePty();
      const factory = new NodePtyFactory(nodePty, undefined, {
        platform: "win32",
        fileExists: () => false
      });

      await factory.spawn({ ...spec, executable: "claude", env });

      assert.equal(nodePty.spawned[0]?.executable, "claude");
    }
  });

  it("uses the default Windows extensions and unquotes Path entries", async () => {
    const nodePty = new StubNodePty();
    const candidates: string[] = [];
    const factory = new NodePtyFactory(nodePty, undefined, {
      platform: "win32",
      fileExists: (candidate) => {
        candidates.push(candidate);
        return candidate === "C:\\Program Files\\Claude\\claude.CMD";
      }
    });

    await factory.spawn({
      ...spec,
      executable: "claude",
      env: { Path: "; \"C:\\Program Files\\Claude\" " }
    });

    assert.equal(nodePty.spawned[0]?.executable, "cmd.exe");
    assert.equal(
      nodePty.spawned[0]?.options.env.CLAUDE_WORKSPACES_COMMAND_SCRIPT,
      "C:\\Program Files\\Claude\\claude.CMD"
    );
    assert.deepEqual(candidates, [
      "C:\\Program Files\\Claude\\claude.COM",
      "C:\\Program Files\\Claude\\claude.EXE",
      "C:\\Program Files\\Claude\\claude.BAT",
      "C:\\Program Files\\Claude\\claude.CMD"
    ]);
  });

  it("trims PATHEXT entries before resolving Windows executable candidates", async () => {
    // Keeping surrounding whitespace produces invalid candidate filenames and misses the real executable.
    const nodePty = new StubNodePty();
    const candidates: string[] = [];
    const factory = new NodePtyFactory(nodePty, undefined, {
      platform: "win32",
      fileExists: (candidate) => {
        candidates.push(candidate);
        return candidate === "C:\\bin\\claude.CMD";
      }
    });

    await factory.spawn({
      ...spec,
      executable: "claude",
      env: { Path: "C:\\bin", PATHEXT: " .EXE ; ; .CMD " }
    });

    assert.deepEqual(candidates, [
      "C:\\bin\\claude.EXE",
      "C:\\bin\\claude.CMD"
    ]);
    assert.equal(
      nodePty.spawned[0]?.options.env.CLAUDE_WORKSPACES_COMMAND_SCRIPT,
      "C:\\bin\\claude.CMD"
    );
  });

  it("does not append PATHEXT when a Windows command already has an extension", async () => {
    const nodePty = new StubNodePty();
    const candidates: string[] = [];
    const factory = new NodePtyFactory(nodePty, undefined, {
      platform: "win32",
      fileExists: (candidate) => {
        candidates.push(candidate);
        return true;
      }
    });

    await factory.spawn({
      ...spec,
      executable: "claude.cmd",
      env: { Path: "C:\\bin", PATHEXT: ".EXE;.CMD" }
    });

    assert.equal(nodePty.spawned[0]?.executable, "cmd.exe");
    assert.equal(
      nodePty.spawned[0]?.options.env.CLAUDE_WORKSPACES_COMMAND_SCRIPT,
      "C:\\bin\\claude.cmd"
    );
    assert.deepEqual(candidates, ["C:\\bin\\claude.cmd"]);
  });

  it("supplies terminal capabilities without inheriting NO_COLOR", async () => {
    // Forwarding a dumb or no-color host environment makes Claude suppress ANSI output.
    const nodePty = new StubNodePty();
    const noColorSpec: LaunchSpec = {
      ...spec,
      env: {
        PATH: "C:\\bin",
        KEEP: "yes",
        TERM: "dumb",
        COLORTERM: "",
        NO_COLOR: "1"
      }
    };

    await new NodePtyFactory(nodePty).spawn(noColorSpec);

    assert.deepEqual(nodePty.spawned[0]?.options.env, {
      PATH: "C:\\bin",
      KEEP: "yes",
      TERM: "xterm-256color",
      COLORTERM: "truecolor"
    });
  });

  it("forwards PTY data, exit, input, and resize events", async () => {
    // An adapter that only spawns but loses terminal event or control wiring must fail.
    const nodePty = new StubNodePty();
    const pty = await new NodePtyFactory(nodePty).spawn(spec);
    const receivedData: string[] = [];
    const exits: Array<{ exitCode: number; signal?: number }> = [];

    pty.onData((data) => receivedData.push(data));
    pty.onExit((event) => exits.push(event));
    pty.write("yes\r");
    pty.resize(120, 40);
    nodePty.nativePty.emitData("Claude ready");
    nodePty.nativePty.emitExit({ exitCode: 0 });

    assert.deepEqual(receivedData, ["Claude ready"]);
    assert.deepEqual(exits, [{ exitCode: 0 }]);
    assert.deepEqual(nodePty.nativePty.writes, ["yes\r"]);
    assert.deepEqual(nodePty.nativePty.resizes, [{ columns: 120, rows: 40 }]);
  });

  it("replays one native exit received before a managed subscriber attaches", async () => {
    // An adapter that starts observing exit only after a consumer subscribes loses immediate exits.
    const nodePty = new StubNodePty();
    const pty = await new NodePtyFactory(nodePty).spawn(spec);
    const exits: Array<{ exitCode: number; signal?: number }> = [];

    nodePty.nativePty.emitExit({ exitCode: 17, signal: 9 });
    pty.onExit((event) => exits.push(event));

    assert.deepEqual(exits, [{ exitCode: 17, signal: 9 }]);
  });

  it("isolates failing exit listeners while delivering the exit to later listeners", async () => {
    // Removing listener isolation lets one extension callback prevent later lifecycle observers.
    const nodePty = new StubNodePty();
    const pty = await new NodePtyFactory(nodePty).spawn(spec);
    const exits: Array<{ exitCode: number; signal?: number }> = [];

    pty.onExit(() => {
      throw new Error("listener failed");
    });
    pty.onExit((event) => exits.push(event));

    assert.doesNotThrow(() => nodePty.nativePty.emitExit({ exitCode: 23 }));
    assert.deepEqual(exits, [{ exitCode: 23 }]);
  });

  it("clears managed exit listeners during disposal", async () => {
    // Retaining managed callbacks after disposal leaks objects that subscribed to process lifetime.
    const nodePty = new StubNodePty();
    const pty = await new NodePtyFactory(nodePty).spawn(spec);
    const managedPty = pty as unknown as {
      exitListeners: Set<(event: { exitCode: number; signal?: number }) => void>;
    };

    pty.onExit(() => undefined);
    assert.equal(managedPty.exitListeners.size, 1);

    pty.dispose();

    assert.equal(managedPty.exitListeners.size, 0);
  });

  it("delivers only the first of two native exit events", async () => {
    // Re-emitting a native process exit can cause duplicate session cleanup or notifications.
    const nodePty = new StubNodePty();
    const pty = await new NodePtyFactory(nodePty).spawn(spec);
    const exits: Array<{ exitCode: number; signal?: number }> = [];

    pty.onExit((event) => exits.push(event));
    nodePty.nativePty.emitExit({ exitCode: 17, signal: 9 });
    nodePty.nativePty.emitExit({ exitCode: 23 });

    assert.deepEqual(exits, [{ exitCode: 17, signal: 9 }]);
  });

  it("releases native exit ownership on natural exit without issuing a second kill during disposal", async () => {
    // Retaining the native exit listener after process exit leaks adapter state; disposal must not kill again.
    const nodePty = new StubNodePty();
    const pty = await new NodePtyFactory(nodePty).spawn(spec);

    nodePty.nativePty.emitExit({ exitCode: 0 });
    assert.equal(nodePty.nativePty.exitListeners.length, 0);
    pty.dispose();

    assert.equal(nodePty.nativePty.kills, 0);
  });

  it("forwards termination exactly once for an owned process", async () => {
    // An adapter that kills more than its owned PTY or repeats termination must fail.
    const nodePty = new StubNodePty();
    const pty = await new NodePtyFactory(nodePty).spawn(spec);

    await Promise.all([pty.terminate(), pty.terminate()]);
    pty.dispose();

    assert.equal(nodePty.nativePty.kills, 1);
  });

  it("allows a failed native termination to be retried", async () => {
    // An adapter that marks termination complete before kill succeeds must fail this test.
    const nodePty = new StubNodePty();
    nodePty.nativePty.killFailure = new Error("kill failed");
    const pty = await new NodePtyFactory(nodePty).spawn(spec);

    await assert.rejects(pty.terminate(), /kill failed/);
    await pty.terminate();

    assert.equal(nodePty.nativePty.kills, 2);
  });

  it("handles a disposal-time termination failure without an unhandled rejection", async () => {
    // An adapter that discards a rejected terminate promise must fail this test.
    const nodePty = new StubNodePty();
    nodePty.nativePty.killFailure = new Error("kill failed");
    const pty = await new NodePtyFactory(nodePty).spawn(spec);
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (reason: unknown): void => {
      unhandledRejections.push(reason);
    };
    process.on("unhandledRejection", onUnhandledRejection);

    try {
      pty.dispose();
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(unhandledRejections, []);
    } finally {
      process.off("unhandledRejection", onUnhandledRejection);
    }
  });

  it("surfaces a node-pty spawn failure to the caller", async () => {
    // An adapter that reports a live PTY after node-pty rejects startup must fail.
    const nodePty = new StubNodePty();
    nodePty.failure = new Error("pty unavailable");

    await assert.rejects(new NodePtyFactory(nodePty).spawn(spec), /pty unavailable/);
  });
});
