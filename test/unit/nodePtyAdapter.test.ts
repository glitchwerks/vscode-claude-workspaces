import assert from "node:assert/strict";
import type { Uri } from "vscode";

import {
  NodePtyFactory,
  type NativePty,
  type NodePtyModule
} from "../../src/launch/nodePtyAdapter";
import type { LaunchSpec } from "../../src/launch/launchPlanner";

interface Disposable {
  dispose(): void;
}

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
    args: string[];
    options: { cwd: string; env: Record<string, string | undefined> };
  }> = [];
  readonly nativePty = new StubNativePty();
  failure: Error | undefined;

  spawn(
    executable: string,
    args: string[],
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
        options: { cwd: "C:\\work\\alpha", env: { PATH: "C:\\bin", KEEP: "yes" } }
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
