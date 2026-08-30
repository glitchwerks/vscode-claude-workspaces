import { existsSync } from "node:fs";
import path from "node:path";

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

type NodePtyLoader = () => Promise<NodePtyModule>;
type FileExists = (candidate: string) => boolean;

interface NodePtyFactoryOptions {
  readonly platform?: NodeJS.Platform;
  readonly fileExists?: FileExists;
}

const loadNodePty: NodePtyLoader = async () => import("node-pty");

/** Creates PTYs that own only the process spawned from a Claude launch specification. */
export class NodePtyFactory implements ManagedPtyFactory {
  constructor(
    private readonly nodePtyModule?: NodePtyModule,
    private readonly nodePtyLoader: NodePtyLoader = loadNodePty,
    private readonly options: NodePtyFactoryOptions = {}
  ) {}

  async spawn(spec: LaunchSpec): Promise<ManagedPty> {
    const nodePtyModule = this.nodePtyModule ?? await this.nodePtyLoader();
    const executable = resolveWindowsExecutable(
      spec.executable,
      spec.env,
      this.options.platform ?? process.platform,
      this.options.fileExists ?? existsSync
    );
    const pty = nodePtyModule.spawn(executable, [...spec.args], {
      cwd: spec.cwd,
      env: { ...spec.env }
    });
    return new NodeManagedPty(pty);
  }
}

function resolveWindowsExecutable(
  executable: string,
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform,
  fileExists: FileExists
): string {
  if (
    platform !== "win32" ||
    path.win32.isAbsolute(executable) ||
    executable.includes("/") ||
    executable.includes("\\")
  ) {
    return executable;
  }
  const searchPath = environmentValue(environment, "PATH");
  if (searchPath === undefined) {
    return executable;
  }
  const extensions = path.win32.extname(executable) === ""
    ? (environmentValue(environment, "PATHEXT") ?? ".COM;.EXE;.BAT;.CMD")
      .split(";")
      .filter((extension) => extension !== "")
    : [""];
  for (const directoryValue of searchPath.split(";")) {
    const directory = directoryValue.trim().replace(/^"(.*)"$/, "$1");
    if (directory === "") {
      continue;
    }
    for (const extension of extensions) {
      const candidate = path.win32.join(directory, `${executable}${extension}`);
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }
  return executable;
}

function environmentValue(
  environment: Readonly<Record<string, string | undefined>>,
  name: string
): string | undefined {
  const key = Object.keys(environment).find((candidate) => candidate.toUpperCase() === name);
  return key === undefined ? undefined : environment[key];
}

class NodeManagedPty implements ManagedPty {
  readonly onData: vscode.Event<string>;
  readonly onExit: vscode.Event<{ exitCode: number; signal?: number }>;
  private terminated = false;
  private termination: Promise<void> | undefined;
  private readonly exitListeners = new Set<(event: { exitCode: number; signal?: number }) => void>();
  private readonly nativeExitSubscription: vscode.Disposable;
  private terminalExit: { exitCode: number; signal?: number } | undefined;

  constructor(private readonly pty: NativePty) {
    this.onData = this.toEvent(pty.onData);
    this.nativeExitSubscription = pty.onExit((event) => this.handleExit(event));
    this.onExit = this.createExitEvent();
  }

  write(data: string): void {
    this.pty.write(data);
  }

  resize(columns: number, rows: number): void {
    this.pty.resize(columns, rows);
  }

  terminate(): Promise<void> {
    if (this.terminated) {
      return Promise.resolve();
    }
    if (this.termination !== undefined) {
      return this.termination;
    }
    this.termination = Promise.resolve()
      .then(() => this.pty.kill())
      .then(() => {
        this.terminated = true;
      })
      .finally(() => {
        this.termination = undefined;
      });
    return this.termination;
  }

  dispose(): void {
    this.nativeExitSubscription.dispose();
    this.exitListeners.clear();
    void this.terminate().catch(() => undefined);
  }

  private handleExit(event: { exitCode: number; signal?: number }): void {
    if (this.terminalExit !== undefined) {
      return;
    }
    this.terminalExit = event;
    this.terminated = true;
    this.nativeExitSubscription.dispose();
    const listeners = [...this.exitListeners];
    this.exitListeners.clear();
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // Exit listeners belong to extension consumers and must not escape into node-pty.
      }
    }
  }

  private createExitEvent(): vscode.Event<{ exitCode: number; signal?: number }> {
    return (listener, thisArgs, disposables) => {
      const boundListener = (event: { exitCode: number; signal?: number }): void => {
        listener.call(thisArgs, event);
      };
      const subscription: vscode.Disposable = {
        dispose: () => this.exitListeners.delete(boundListener)
      };
      if (this.terminalExit === undefined) {
        this.exitListeners.add(boundListener);
      } else {
        boundListener(this.terminalExit);
      }
      disposables?.push(subscription);
      return subscription;
    };
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
