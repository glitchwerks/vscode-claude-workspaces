import assert from "node:assert/strict";
import type { Uri } from "vscode";

import { NodePtyFactory } from "../../src/launch/nodePtyAdapter";
import type { LaunchSpec } from "../../src/launch/launchPlanner";

interface Disposable {
  dispose(): void;
}

interface NativePty {
  readonly onData: (listener: (data: string) => void) => Disposable;
  readonly onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => Disposable;
  write(data: string): void;
  resize(columns: number, rows: number): void;
  kill(): void;
}

interface NodePtyModule {
  spawn(
    executable: string,
    args: string[],
    options: { cwd: string; env: Record<string, string | undefined> }
  ): NativePty;
}

class StubNativePty implements NativePty {
  readonly dataListeners: Array<(data: string) => void> = [];
  readonly exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  readonly writes: string[] = [];
  readonly resizes: Array<{ columns: number; rows: number }> = [];
  kills = 0;

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

  it("forwards termination exactly once for an owned process", async () => {
    // An adapter that kills more than its owned PTY or repeats termination must fail.
    const nodePty = new StubNodePty();
    const pty = await new NodePtyFactory(nodePty).spawn(spec);

    await pty.terminate();
    await pty.terminate();
    pty.dispose();

    assert.equal(nodePty.nativePty.kills, 1);
  });

  it("surfaces a node-pty spawn failure to the caller", async () => {
    // An adapter that reports a live PTY after node-pty rejects startup must fail.
    const nodePty = new StubNodePty();
    nodePty.failure = new Error("pty unavailable");

    await assert.rejects(new NodePtyFactory(nodePty).spawn(spec), /pty unavailable/);
  });
});
