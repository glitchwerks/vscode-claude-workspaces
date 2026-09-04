import assert from "node:assert/strict";

import * as vscode from "vscode";
import type { Uri, WorkspaceFolder } from "vscode";

import type {
  ExtensionActivationDependencies,
  ExtensionLifecycleApi
} from "../../src/extension";
import { activateWithDependencies, deactivate } from "../../src/extension";
import type { RootAvailability } from "../../src/launch/launchPlanner";
import { OutputLogger } from "../../src/logging/outputLogger";
import { FakeManagedPtyFactory } from "../support/fakeManagedPty";
import type { FakeManagedPty } from "../support/fakeManagedPty";

const commandIds = {
  newSession: "claudeWorkspaces.newSession",
  newInFolder: "claudeWorkspaces.newInFolder",
  closeSession: "claudeWorkspaces.closeSession",
  restartFresh: "claudeWorkspaces.restartFresh",
  previousSession: "claudeWorkspaces.previousSession",
  nextSession: "claudeWorkspaces.nextSession",
  configureWorkspace: "claudeWorkspaces.configureWorkspace"
} as const;

class CommandRegistry {
  readonly handlers = new Map<string, () => unknown | PromiseLike<unknown>>();

  async executeCommand(): Promise<void> {}

  registerCommand(
    commandId: string,
    handler: () => unknown | PromiseLike<unknown>
  ): vscode.Disposable {
    this.handlers.set(commandId, handler);
    return { dispose: () => undefined };
  }

  async run(commandId: string): Promise<void> {
    await this.handlers.get(commandId)?.();
  }
}

type TerminationSignal = Parameters<ExtensionLifecycleApi["reemit"]>[0];

class LifecycleSignals implements ExtensionLifecycleApi {
  readonly reemitted: TerminationSignal[] = [];
  private legacyListener: (() => void) | undefined;
  private terminationListener: ((signal: TerminationSignal) => void) | undefined;
  private timeoutCallback: (() => void) | undefined;
  private readonly reemitWaiters = new Set<() => void>();

  onWillShutdown(listener: () => void): vscode.Disposable {
    this.legacyListener = listener;
    return { dispose: () => (this.legacyListener = undefined) };
  }

  onTerminationSignal(listener: (signal: TerminationSignal) => void): vscode.Disposable {
    this.terminationListener = listener;
    return { dispose: () => (this.terminationListener = undefined) };
  }

  schedule(callback: () => void): vscode.Disposable {
    this.timeoutCallback = callback;
    return { dispose: () => (this.timeoutCallback = undefined) };
  }

  reemit(signal: TerminationSignal): void {
    this.reemitted.push(signal);
    this.reemitWaiters.forEach((resolve) => resolve());
    this.reemitWaiters.clear();
  }

  fire(signal: TerminationSignal = "SIGTERM"): void {
    this.terminationListener?.(signal);
    this.legacyListener?.();
  }

  expireTimeout(): void {
    this.timeoutCallback?.();
  }

  waitForReemit(): Promise<void> {
    if (this.reemitted.length > 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.reemitWaiters.add(resolve));
  }
}

function uri(value: string): Uri {
  return {
    fsPath: value.replace("file:///", "C:/"),
    scheme: "file",
    toString: () => value
  } as Uri;
}

function folder(name: string, path: string, index: number): WorkspaceFolder {
  return { index, name, uri: uri(path) };
}

function logger(): OutputLogger {
  return new OutputLogger({
    name: "lifecycle-test",
    append: () => undefined,
    appendLine: () => undefined,
    replace: () => undefined,
    clear: () => undefined,
    show: () => undefined,
    hide: () => undefined,
    dispose: () => undefined
  });
}

describe("managed lifecycle", () => {
  it("launches only owned PTYs through commands and shuts down the remaining owned PTYs", async () => {
    // The current activation uses inert command handlers, so this proves the live SessionManager wiring.
    const commands = new CommandRegistry();
    const ptys = new FakeManagedPtyFactory();
    const lifecycle = new LifecycleSignals();
    const roots = [
      folder("alpha", "file:///projects/alpha", 0),
      folder("beta", "file:///projects/beta", 1)
    ];
    const availability: RootAvailability = {
      timeoutMs: 1,
      maxConcurrency: 2,
      maxOutstandingProbes: 2,
      totalTimeoutMs: 100,
      isAvailable: async () => true
    };
    const context = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined }
    } as unknown as vscode.ExtensionContext;
    const dependencies = {
      commands,
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: roots,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: { registerWebviewViewProvider: () => ({ dispose: () => undefined }) },
      setup: {
        ensureConfigured: async () => ({
          schemaVersion: 1 as const,
          configuredRoots: roots.map(({ uri: rootUri }) => rootUri.toString(true)),
          importsByRoot: Object.fromEntries(roots.map(({ uri: rootUri }) => [rootUri.toString(true), []]))
        }),
        configure: async () => undefined
      },
      logger: logger(),
      ptyFactory: ptys,
      availability,
      selectRoot: async () => roots[1]!.uri.toString(true),
      lifecycle
    } as unknown as ExtensionActivationDependencies;

    await activateWithDependencies(context, dependencies);
    await commands.run(commandIds.newSession);
    await commands.run(commandIds.newInFolder);

    const externalTerminal = vscode.window.createTerminal("unmanaged lifecycle terminal");
    try {
      assert.equal(ptys.ptys.length, 2);
      assert.equal(ptys.ptys[0]?.terminated, false);
      assert.equal(ptys.ptys[1]?.terminated, false);

      await commands.run(commandIds.closeSession);
      assert.equal(ptys.ptys[1]?.terminated, true);
      assert.equal(ptys.ptys[0]?.terminated, false);

      lifecycle.fire();
      assert.equal(ptys.ptys[0]?.terminated, true);
      assert.ok(vscode.window.terminals.includes(externalTerminal));
    } finally {
      externalTerminal.dispose();
      await deactivate();
    }
  });

  it("restarts the active non-default session from the Command Palette with current configuration", async () => {
    const commands = new CommandRegistry();
    const ptys = new FakeManagedPtyFactory();
    const lifecycle = new LifecycleSignals();
    const roots = [
      folder("alpha", "file:///projects/alpha", 0),
      folder("beta", "file:///projects/beta", 1)
    ];
    const alphaId = roots[0]!.uri.toString(true);
    const betaId = roots[1]!.uri.toString(true);
    let betaImports: readonly string[] = [];
    let executable = "claude-first";
    const context = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined }
    } as unknown as vscode.ExtensionContext;

    await activateWithDependencies(context, {
      commands,
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: roots,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: { registerWebviewViewProvider: () => ({ dispose: () => undefined }) },
      setup: {
        ensureConfigured: async () => ({
          schemaVersion: 1 as const,
          configuredRoots: [alphaId, betaId],
          defaultRootOverride: alphaId,
          importsByRoot: { [alphaId]: [], [betaId]: betaImports }
        }),
        configure: async () => undefined
      },
      logger: logger(),
      ptyFactory: ptys,
      availability: {
        timeoutMs: 1,
        maxConcurrency: 2,
        maxOutstandingProbes: 2,
        totalTimeoutMs: 100,
        isAvailable: async () => true
      },
      executable: () => executable,
      selectRoot: async () => betaId,
      lifecycle
    });

    await commands.run(commandIds.newSession);
    await commands.run(commandIds.newInFolder);
    betaImports = [alphaId];
    executable = "claude-current";
    await commands.run(commandIds.restartFresh);

    assert.equal(ptys.ptys.length, 3);
    assert.equal(ptys.ptys[0]?.terminated, false);
    assert.equal(ptys.ptys[1]?.terminated, true);
    assert.equal(ptys.spawnedSpecs[2]?.root.id, betaId);
    assert.deepEqual(ptys.spawnedSpecs[2]?.importedRoots.map(({ id }) => id), [alphaId]);
    assert.equal(ptys.spawnedSpecs[2]?.executable, "claude-current");
    await deactivate();
  });

  it("re-resolves current configuration for restart and reports startup failures once", async () => {
    const commands = new CommandRegistry();
    const ptys = new FakeManagedPtyFactory();
    const roots = [folder("alpha", "file:///projects/alpha", 0)];
    const errors: Array<{ message: string; actions: string[] }> = [];
    let executable = "claude-first";
    const context = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined }
    } as unknown as vscode.ExtensionContext;

    await activateWithDependencies(context, {
      commands,
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: roots,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: { registerWebviewViewProvider: () => ({ dispose: () => undefined }) },
      setup: {
        ensureConfigured: async () => ({
          schemaVersion: 1 as const,
          configuredRoots: [roots[0]!.uri.toString(true)],
          importsByRoot: { [roots[0]!.uri.toString(true)]: [] }
        }),
        configure: async () => undefined
      },
      logger: logger(),
      ptyFactory: ptys,
      availability: {
        timeoutMs: 1,
        maxConcurrency: 1,
        maxOutstandingProbes: 1,
        totalTimeoutMs: 100,
        isAvailable: async () => true
      },
      executable: () => executable,
      notifications: {
        showWarningMessage: async () => undefined,
        showErrorMessage: async (message: string, ...actions: string[]) => {
          errors.push({ message, actions });
          return undefined;
        }
      }
    });

    const missingExecutableErrors = [
      Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" }),
      new Error("File not found: claude")
    ];
    for (const missingExecutableError of missingExecutableErrors) {
      ptys.spawnError = missingExecutableError;
      await commands.run(commandIds.newSession);
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    assert.deepEqual(errors, missingExecutableErrors.map(() => ({
      message: "Claude executable was not found.",
      actions: ["Configure Executable", "Open Logs"]
    })));

    ptys.spawnError = undefined;
    await commands.run(commandIds.newSession);
    ptys.ptys[0]?.emitExit({ exitCode: 0 });
    await commands.run(commandIds.newSession);
    executable = "claude-second";
    await commands.run(commandIds.restartFresh);

    assert.equal(ptys.ptys.length, 3);
    assert.equal(ptys.ptys[1]?.terminated, true);
    assert.equal(ptys.spawnedSpecs[2]?.executable, "claude-second");
    await deactivate();
  });

  it("keeps the current session alive when fresh restart planning reports an unavailable root", async () => {
    // Re-throwing after the planner reports the failure surfaces an expected command rejection.
    const commands = new CommandRegistry();
    const ptys = new FakeManagedPtyFactory();
    const roots = [folder("alpha", "file:///projects/alpha", 0)];
    const errors: string[] = [];
    let available = true;
    const context = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined }
    } as unknown as vscode.ExtensionContext;

    await activateWithDependencies(context, {
      commands,
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: roots,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: { registerWebviewViewProvider: () => ({ dispose: () => undefined }) },
      setup: {
        ensureConfigured: async () => ({
          schemaVersion: 1 as const,
          configuredRoots: [roots[0]!.uri.toString(true)],
          importsByRoot: { [roots[0]!.uri.toString(true)]: [] }
        }),
        configure: async () => undefined
      },
      logger: logger(),
      ptyFactory: ptys,
      availability: {
        timeoutMs: 1,
        maxConcurrency: 1,
        maxOutstandingProbes: 1,
        totalTimeoutMs: 100,
        isAvailable: async () => available
      },
      notifications: {
        showWarningMessage: async () => undefined,
        showErrorMessage: async (message: string) => {
          errors.push(message);
          return undefined;
        }
      }
    });

    await commands.run(commandIds.newSession);
    available = false;
    await assert.doesNotReject(commands.run(commandIds.restartFresh));

    assert.deepEqual(errors, ["The selected workspace root is unavailable."]);
    assert.equal(ptys.ptys[0]?.terminated, false);
    await deactivate();
  });

  it("rejects unexpected fresh restart planning failures without closing the current session", async () => {
    // Swallowing every planning exception hides defects that were not reported as typed plan failures.
    const commands = new CommandRegistry();
    const ptys = new FakeManagedPtyFactory();
    const roots = [folder("alpha", "file:///projects/alpha", 0)];
    const planningError = new Error("configuration read failed");
    let rejectPlanning = false;
    const context = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined }
    } as unknown as vscode.ExtensionContext;

    await activateWithDependencies(context, {
      commands,
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: roots,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: { registerWebviewViewProvider: () => ({ dispose: () => undefined }) },
      setup: {
        ensureConfigured: async () => {
          if (rejectPlanning) {
            throw planningError;
          }
          return {
            schemaVersion: 1 as const,
            configuredRoots: [roots[0]!.uri.toString(true)],
            importsByRoot: { [roots[0]!.uri.toString(true)]: [] }
          };
        },
        configure: async () => undefined
      },
      logger: logger(),
      ptyFactory: ptys,
      availability: {
        timeoutMs: 1,
        maxConcurrency: 1,
        maxOutstandingProbes: 1,
        totalTimeoutMs: 100,
        isAvailable: async () => true
      },
      notifications: {
        showWarningMessage: async () => undefined,
        showErrorMessage: async () => undefined
      }
    });

    await commands.run(commandIds.newSession);
    rejectPlanning = true;

    await assert.rejects(commands.run(commandIds.restartFresh), planningError);
    assert.equal(ptys.ptys[0]?.terminated, false);
    assert.equal(ptys.ptys.length, 1);
    await deactivate();
  });

  it("retries an immediate replacement failure from the selected root using current configuration", async () => {
    const commands = new CommandRegistry();
    const ptys = new FakeManagedPtyFactory();
    const roots = [folder("alpha", "file:///projects/alpha", 0)];
    let executable = "claude-first";
    let failReplacement = false;
    let resolveRetry: ((value: string | undefined) => void) | undefined;
    const spawn = ptys.spawn.bind(ptys);
    ptys.spawn = async (spec) => {
      const pty = await spawn(spec) as FakeManagedPty;
      if (failReplacement) {
        pty.emitExit({ exitCode: 1 });
      }
      return pty;
    };
    const context = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined }
    } as unknown as vscode.ExtensionContext;

    await activateWithDependencies(context, {
      commands,
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: roots,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: { registerWebviewViewProvider: () => ({ dispose: () => undefined }) },
      setup: {
        ensureConfigured: async () => ({
          schemaVersion: 1 as const,
          configuredRoots: [roots[0]!.uri.toString(true)],
          importsByRoot: { [roots[0]!.uri.toString(true)]: [] }
        }),
        configure: async () => undefined
      },
      logger: logger(),
      ptyFactory: ptys,
      availability: {
        timeoutMs: 1,
        maxConcurrency: 1,
        maxOutstandingProbes: 1,
        totalTimeoutMs: 100,
        isAvailable: async () => true
      },
      executable: () => executable,
      notifications: {
        showWarningMessage: async () => undefined,
        showErrorMessage: async () => new Promise<string | undefined>((resolve) => {
          resolveRetry = resolve;
        })
      }
    });

    await commands.run(commandIds.newSession);
    failReplacement = true;
    executable = "claude-replacement";
    await commands.run(commandIds.restartFresh);
    executable = "claude-retry";
    resolveRetry?.("Retry");
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(ptys.ptys.length, 3);
    assert.equal(ptys.spawnedSpecs[2]?.executable, "claude-retry");
    await deactivate();
  });

  it("returns deactivation cleanup so the host can await a live owned PTY termination", async () => {
    const commands = new CommandRegistry();
    const ptys = new FakeManagedPtyFactory();
    const roots = [folder("alpha", "file:///projects/alpha", 0)];
    const context = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined }
    } as unknown as vscode.ExtensionContext;

    await activateWithDependencies(context, {
      commands,
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: roots,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: { registerWebviewViewProvider: () => ({ dispose: () => undefined }) },
      setup: {
        ensureConfigured: async () => ({
          schemaVersion: 1 as const,
          configuredRoots: [roots[0]!.uri.toString(true)],
          importsByRoot: { [roots[0]!.uri.toString(true)]: [] }
        }),
        configure: async () => undefined
      },
      logger: logger(),
      ptyFactory: ptys,
      availability: {
        timeoutMs: 1,
        maxConcurrency: 1,
        maxOutstandingProbes: 1,
        totalTimeoutMs: 100,
        isAvailable: async () => true
      }
    });
    await commands.run(commandIds.newSession);

    let releaseTermination: (() => void) | undefined;
    ptys.ptys[0]!.terminate = () => new Promise<void>((resolve) => {
      releaseTermination = () => {
        ptys.ptys[0]!.terminated = true;
        resolve();
      };
    });
    const cleanup = deactivate();
    assert.ok(cleanup instanceof Promise);
    assert.equal(ptys.ptys[0]?.terminated, false);
    releaseTermination?.();
    await cleanup;

    assert.equal(ptys.ptys[0]?.terminated, true);
  });

  it("removes a naturally exited session from the live panel projection", async () => {
    const commands = new CommandRegistry();
    const ptys = new FakeManagedPtyFactory();
    const roots = [folder("alpha", "file:///projects/alpha", 0)];
    const providers: vscode.WebviewViewProvider[] = [];
    const received = new vscode.EventEmitter<unknown>();
    const disposed = new vscode.EventEmitter<void>();
    const posted: Array<{ type: string }> = [];
    const context = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined }
    } as unknown as vscode.ExtensionContext;

    await activateWithDependencies(context, {
      commands,
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: roots,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: {
        registerWebviewViewProvider: (_viewId, provider) => {
          providers.push(provider);
          return { dispose: () => undefined };
        }
      },
      setup: {
        ensureConfigured: async () => ({
          schemaVersion: 1 as const,
          configuredRoots: [roots[0]!.uri.toString(true)],
          importsByRoot: { [roots[0]!.uri.toString(true)]: [] }
        }),
        configure: async () => undefined
      },
      logger: logger(),
      ptyFactory: ptys,
      availability: {
        timeoutMs: 1,
        maxConcurrency: 1,
        maxOutstandingProbes: 1,
        totalTimeoutMs: 100,
        isAvailable: async () => true
      }
    });
    const provider = providers[0];
    assert.ok(provider);
    provider.resolveWebviewView({
      webview: {
        cspSource: "vscode-webview://test",
        html: "",
        asWebviewUri: (resource: vscode.Uri) => resource,
        onDidReceiveMessage: received.event,
        postMessage: async (message: { type: string }) => {
          posted.push(message);
          return true;
        }
      },
      onDidDispose: disposed.event
    } as unknown as vscode.WebviewView,
    {} as vscode.WebviewViewResolveContext,
    {} as vscode.CancellationToken);
    received.fire({ type: "ready" });
    await commands.run(commandIds.newSession);
    ptys.ptys[0]?.emitExit({ exitCode: 0 });

    assert.ok(posted.some((message) => message.type === "sessionRemoved"));
    await deactivate();
  });

  it("resumes the received host signal after bounded owned-session cleanup", async () => {
    const commands = new CommandRegistry();
    const ptys = new FakeManagedPtyFactory();
    const lifecycle = new LifecycleSignals();
    const roots = [folder("alpha", "file:///projects/alpha", 0)];
    const context = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined }
    } as unknown as vscode.ExtensionContext;
    await activateWithDependencies(context, {
      commands,
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: roots,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: { registerWebviewViewProvider: () => ({ dispose: () => undefined }) },
      setup: {
        ensureConfigured: async () => ({
          schemaVersion: 1 as const,
          configuredRoots: [roots[0]!.uri.toString(true)],
          importsByRoot: { [roots[0]!.uri.toString(true)]: [] }
        }),
        configure: async () => undefined
      },
      logger: logger(),
      ptyFactory: ptys,
      availability: {
        timeoutMs: 1,
        maxConcurrency: 1,
        maxOutstandingProbes: 1,
        totalTimeoutMs: 100,
        isAvailable: async () => true
      },
      lifecycle
    } as unknown as ExtensionActivationDependencies);
    await commands.run(commandIds.newSession);

    let terminationAttempts = 0;
    let releaseTermination: (() => void) | undefined;
    ptys.ptys[0]!.terminate = () => new Promise<void>((resolve) => {
      terminationAttempts += 1;
      releaseTermination = () => {
        ptys.ptys[0]!.terminated = true;
        resolve();
      };
    });
    const reemitted = lifecycle.waitForReemit();
    lifecycle.fire("SIGTERM");
    assert.equal(terminationAttempts, 1);
    assert.equal(ptys.ptys[0]?.terminated, false);
    assert.deepEqual(lifecycle.reemitted, []);
    releaseTermination?.();
    await reemitted;

    assert.equal(ptys.ptys[0]?.terminated, true);
    assert.deepEqual(lifecycle.reemitted, ["SIGTERM"]);
    await deactivate();
  });

  it("re-emits the host signal when bounded cleanup does not settle", async () => {
    const commands = new CommandRegistry();
    const ptys = new FakeManagedPtyFactory();
    const lifecycle = new LifecycleSignals();
    const roots = [folder("alpha", "file:///projects/alpha", 0)];
    const context = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      subscriptions: [],
      workspaceState: { get: () => undefined, update: async () => undefined }
    } as unknown as vscode.ExtensionContext;
    await activateWithDependencies(context, {
      commands,
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: roots,
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: { registerWebviewViewProvider: () => ({ dispose: () => undefined }) },
      setup: {
        ensureConfigured: async () => ({
          schemaVersion: 1 as const,
          configuredRoots: [roots[0]!.uri.toString(true)],
          importsByRoot: { [roots[0]!.uri.toString(true)]: [] }
        }),
        configure: async () => undefined
      },
      logger: logger(),
      ptyFactory: ptys,
      availability: {
        timeoutMs: 1,
        maxConcurrency: 1,
        maxOutstandingProbes: 1,
        totalTimeoutMs: 100,
        isAvailable: async () => true
      },
      lifecycle
    } as unknown as ExtensionActivationDependencies);
    await commands.run(commandIds.newSession);

    ptys.ptys[0]!.terminate = () => new Promise<void>(() => undefined);
    lifecycle.fire("SIGINT");
    lifecycle.expireTimeout();

    assert.deepEqual(lifecycle.reemitted, ["SIGINT"]);
    void deactivate();
  });
});
