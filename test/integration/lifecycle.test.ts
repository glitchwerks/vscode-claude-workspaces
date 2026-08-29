import assert from "node:assert/strict";

import * as vscode from "vscode";
import type { Uri, WorkspaceFolder } from "vscode";

import type { ExtensionActivationDependencies } from "../../src/extension";
import { activateWithDependencies, deactivate } from "../../src/extension";
import type { RootAvailability } from "../../src/launch/launchPlanner";
import { OutputLogger } from "../../src/logging/outputLogger";
import { FakeManagedPtyFactory } from "../support/fakeManagedPty";

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

class LifecycleSignals {
  private listener: (() => void) | undefined;

  onWillShutdown(listener: () => void): vscode.Disposable {
    this.listener = listener;
    return { dispose: () => (this.listener = undefined) };
  }

  fire(): void {
    this.listener?.();
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
    } finally {
      externalTerminal.dispose();
      deactivate();
    }
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
      availability: { timeoutMs: 1, maxConcurrency: 1, isAvailable: async () => true },
      executable: () => executable,
      notifications: {
        showWarningMessage: async () => undefined,
        showErrorMessage: async (message: string, ...actions: string[]) => {
          errors.push({ message, actions });
          return undefined;
        }
      }
    });

    ptys.spawnError = Object.assign(new Error("claude missing"), { code: "ENOENT" });
    await commands.run(commandIds.newSession);
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(errors, [{
      message: "Claude executable was not found.",
      actions: ["Configure Executable", "Open Logs"]
    }]);

    ptys.spawnError = undefined;
    await commands.run(commandIds.newSession);
    ptys.ptys[0]?.emitExit({ exitCode: 0 });
    await commands.run(commandIds.newSession);
    executable = "claude-second";
    await commands.run(commandIds.restartFresh);

    assert.equal(ptys.ptys.length, 3);
    assert.equal(ptys.ptys[1]?.terminated, true);
    assert.equal(ptys.spawnedSpecs[2]?.executable, "claude-second");
    deactivate();
  });
});
