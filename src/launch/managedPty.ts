import type * as vscode from "vscode";

import type { LaunchSpec } from "./launchPlanner";

/** A PTY owned by one Claude session and safe for session lifecycle control. */
export interface ManagedPty extends vscode.Disposable {
  readonly onData: vscode.Event<string>;
  readonly onExit: vscode.Event<{ exitCode: number; signal?: number }>;
  write(data: string): void;
  resize(columns: number, rows: number): void;
  terminate(): Promise<void>;
}

/** Starts and owns PTYs created from immutable Claude launch specifications. */
export interface ManagedPtyFactory {
  spawn(spec: LaunchSpec): Promise<ManagedPty>;
}
