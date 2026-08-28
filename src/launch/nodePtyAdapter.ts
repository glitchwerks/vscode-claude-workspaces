import * as nodePty from "node-pty";
import type * as vscode from "vscode";

import type { ManagedPty, ManagedPtyFactory } from "./managedPty";
import type { LaunchSpec } from "./launchPlanner";

/** The subset of node-pty required to create a managed Claude process. */
export interface NodePtyModule {
  spawn(
    executable: string,
    args: string[],
    options: { cwd: string; env: Record<string, string | undefined> }
  ): NativePty;
}

/** The node-pty process surface wrapped by the managed PTY boundary. */
export interface NativePty {
  readonly onData: (listener: (data: string) => void) => vscode.Disposable;
  readonly onExit: (
    listener: (event: { exitCode: number; signal?: number }) => void
  ) => vscode.Disposable;
  write(data: string): void;
  resize(columns: number, rows: number): void;
  kill(): void;
}

/** Creates PTYs that own only the process spawned from a Claude launch specification. */
export class NodePtyFactory implements ManagedPtyFactory {
  constructor(private readonly nodePtyModule: NodePtyModule = nodePty) {}

  async spawn(spec: LaunchSpec): Promise<ManagedPty> {
    const pty = this.nodePtyModule.spawn(spec.executable, [...spec.args], {
      cwd: spec.cwd,
      env: { ...spec.env }
    });
    return new NodeManagedPty(pty);
  }
}

class NodeManagedPty implements ManagedPty {
  readonly onData: vscode.Event<string>;
  readonly onExit: vscode.Event<{ exitCode: number; signal?: number }>;
  private terminated = false;

  constructor(private readonly pty: NativePty) {
    this.onData = this.toEvent(pty.onData);
    this.onExit = this.toEvent(pty.onExit);
  }

  write(data: string): void {
    this.pty.write(data);
  }

  resize(columns: number, rows: number): void {
    this.pty.resize(columns, rows);
  }

  async terminate(): Promise<void> {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.pty.kill();
  }

  dispose(): void {
    void this.terminate();
  }

  private toEvent<T>(
    subscribe: (listener: (value: T) => void) => vscode.Disposable
  ): vscode.Event<T> {
    return (listener, thisArgs, disposables) => {
      const subscription = subscribe((value) => listener.call(thisArgs, value));
      disposables?.push(subscription);
      return subscription;
    };
  }
}
