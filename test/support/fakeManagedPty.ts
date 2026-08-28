import type * as vscode from "vscode";

import type { LaunchSpec } from "../../src/launch/launchPlanner";
import type { ManagedPty, ManagedPtyFactory } from "../../src/launch/managedPty";

/** A controllable managed PTY for session lifecycle tests. */
export class FakeManagedPty implements ManagedPty {
  readonly writes: string[] = [];
  readonly resizes: Array<{ columns: number; rows: number }> = [];
  readonly onData: vscode.Event<string>;
  readonly onExit: vscode.Event<{ exitCode: number; signal?: number }>;
  terminated = false;
  disposed = false;
  terminateError: Error | undefined;
  private readonly dataListeners = new Set<(data: string) => void>();
  private readonly exitListeners = new Set<
    (event: { exitCode: number; signal?: number }) => void
  >();

  constructor() {
    this.onData = this.createEvent(this.dataListeners);
    this.onExit = this.createEvent(this.exitListeners);
  }

  write(data: string): void {
    this.writes.push(data);
  }

  resize(columns: number, rows: number): void {
    this.resizes.push({ columns, rows });
  }

  async terminate(): Promise<void> {
    if (this.terminateError !== undefined) {
      throw this.terminateError;
    }
    this.terminated = true;
  }

  dispose(): void {
    this.disposed = true;
  }

  emitData(data: string): void {
    this.dataListeners.forEach((listener) => listener(data));
  }

  emitExit(event: { exitCode: number; signal?: number }): void {
    this.exitListeners.forEach((listener) => listener(event));
  }

  private createEvent<T>(listeners: Set<(value: T) => void>): vscode.Event<T> {
    return (listener, thisArgs, disposables) => {
      const boundListener = (value: T): void => listener.call(thisArgs, value);
      listeners.add(boundListener);
      const disposable: vscode.Disposable = {
        dispose: () => listeners.delete(boundListener)
      };
      disposables?.push(disposable);
      return disposable;
    };
  }
}

/** Supplies controllable PTYs and deterministic startup failures to later tests. */
export class FakeManagedPtyFactory implements ManagedPtyFactory {
  readonly spawnedSpecs: LaunchSpec[] = [];
  readonly ptys: FakeManagedPty[] = [];
  spawnError: Error | undefined;

  async spawn(spec: LaunchSpec): Promise<ManagedPty> {
    if (this.spawnError !== undefined) {
      throw this.spawnError;
    }
    const pty = new FakeManagedPty();
    this.spawnedSpecs.push(spec);
    this.ptys.push(pty);
    return pty;
  }
}
