import assert from "node:assert/strict";

import * as vscode from "vscode";
import type { Uri, WorkspaceFolder } from "vscode";

import {
  activateWorkspace,
  type ActivationHost,
  type DisposableLike
} from "../../src/activation";
import { activateWithDependencies } from "../../src/extension";
import type { ExtensionActivationDependencies } from "../../src/extension";
import { OutputLogger } from "../../src/logging/outputLogger";
import { WorkspaceModel } from "../../src/workspace/workspaceModel";

interface ClaudeWorkspacesApi {
  readonly savedWorkspace: boolean;
}

interface RecordingViewRegistry {
  registerWebviewViewProvider(
    viewId: string,
    provider: unknown
  ): DisposableLike;
}

const COMMAND_IDS = [
  "claudeWorkspaces.newSession",
  "claudeWorkspaces.newInFolder",
  "claudeWorkspaces.closeSession",
  "claudeWorkspaces.restartFresh",
  "claudeWorkspaces.previousSession",
  "claudeWorkspaces.nextSession",
  "claudeWorkspaces.configureWorkspace"
] as const;

class SetupRecordingHost implements ActivationHost {
  private folderChangeListener: (() => Promise<void>) | undefined;
  readonly handlers = new Map<string, () => unknown | PromiseLike<unknown>>();

  async setContext(): Promise<void> {}

  registerCommand(
    commandId: string,
    handler: () => unknown | PromiseLike<unknown>
  ): DisposableLike {
    this.handlers.set(commandId, handler);
    return { dispose: () => undefined };
  }

  onDidChangeWorkspaceFolders(listener: () => Promise<void>): DisposableLike {
    this.folderChangeListener = listener;
    return { dispose: () => undefined };
  }

  async fireFolderChange(): Promise<void> {
    await this.folderChangeListener?.();
  }
}

function uri(value: string): Uri {
  return {
    scheme: "file",
    toString: () => value
  } as Uri;
}

function folder(name: string, value: string, index: number): WorkspaceFolder {
  return { index, name, uri: uri(value) };
}

function outputLogger(onDispose: () => void): OutputLogger {
  const channel: vscode.OutputChannel = {
    name: "test",
    append: () => undefined,
    appendLine: () => undefined,
    replace: () => undefined,
    clear: () => undefined,
    show: () => undefined,
    hide: () => undefined,
    dispose: onDispose
  };
  return new OutputLogger(channel);
}

describe("activation boundary", () => {
  it("disposes a factory-created logger when activation rejects", async () => {
    // An adapter that leaks its internally owned logger on activation failure must fail.
    let loggerDisposed = false;
    const logger = outputLogger(() => {
      loggerDisposed = true;
    });
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    const dependencies: ExtensionActivationDependencies & {
      loggerFactory: () => OutputLogger;
    } = {
      loggerFactory: () => logger,
      commands: {
        executeCommand: async () => {
          throw new Error("setContext failed");
        },
        registerCommand: () => ({ dispose: () => undefined })
      },
      workspace: {
        workspaceFile: undefined,
        workspaceFolders: [],
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      }
    };

    await assert.rejects(
      activateWithDependencies(context, dependencies),
      /setContext failed/
    );

    assert.equal(loggerDisposed, true);
  });

  it("does not dispose an injected logger when activation rejects", async () => {
    // An adapter that disposes resources owned by its caller must fail this test.
    let loggerDisposed = false;
    const logger = outputLogger(() => {
      loggerDisposed = true;
    });
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

    await assert.rejects(
      activateWithDependencies(context, {
        logger,
        commands: {
          executeCommand: async () => {
            throw new Error("setContext failed");
          },
          registerCommand: () => ({ dispose: () => undefined })
        },
        workspace: {
          workspaceFile: undefined,
          workspaceFolders: [],
          onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
        }
      }),
      /setContext failed/
    );

    assert.equal(loggerDisposed, false);
  });

  it("reports eligibility for the current window", async () => {
    const extension = vscode.extensions.getExtension<ClaudeWorkspacesApi>(
      "glitchwerks.vscode-claude-workspaces"
    );

    assert.ok(extension, "Claude Workspaces extension was not discovered");

    const api = await extension.activate();
    const expected = vscode.workspace.workspaceFile?.scheme === "file";

    assert.equal(extension.isActive, true);
    assert.equal(api.savedWorkspace, expected);
  });

  it("contributes the approved command identifiers", async () => {
    const commands = await vscode.commands.getCommands(true);

    for (const commandId of COMMAND_IDS) {
      assert.ok(commands.includes(commandId), `${commandId} was not contributed`);
    }
  });

  it("invokes injected setup on first load and after roots change", async () => {
    const host = new SetupRecordingHost();
    const configuredRootSets: string[][] = [];
    let currentWorkspace = WorkspaceModel.from(
      uri("file:///projects/group.code-workspace"),
      [folder("alpha", "file:///projects/alpha", 0)]
    );

    await activateWorkspace(currentWorkspace, host, {
      setup: {
        ensureConfigured: async (roots) => {
          configuredRootSets.push(roots.map(({ id }) => id));
        },
        configure: async () => undefined
      },
      currentWorkspace: () => currentWorkspace
    });

    currentWorkspace = WorkspaceModel.from(
      uri("file:///projects/group.code-workspace"),
      [
        folder("alpha", "file:///projects/alpha", 0),
        folder("beta", "file:///projects/beta", 1)
      ]
    );
    await host.fireFolderChange();

    assert.deepEqual(configuredRootSets, [
      ["file:///projects/alpha"],
      ["file:///projects/alpha", "file:///projects/beta"]
    ]);
  });

  it("forwards production workspace changes through the extension adapter", async () => {
    const configuredRootSets: string[][] = [];
    const subscriptions: vscode.Disposable[] = [];
    const folderChangeDisposable = { dispose: () => undefined };
    const viewProviderDisposable = { dispose: () => undefined };
    let folderChangeListener: (() => unknown) | undefined;
    let workspaceFolders = [folder("alpha", "file:///projects/alpha", 0)];
    const context = { subscriptions } as vscode.ExtensionContext;

    await activateWithDependencies(context, {
      commands: {
        executeCommand: async () => undefined,
        registerCommand: () => ({ dispose: () => undefined })
      },
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        get workspaceFolders() {
          return workspaceFolders;
        },
        onDidChangeWorkspaceFolders: (listener: () => unknown) => {
          folderChangeListener = listener;
          return folderChangeDisposable;
        }
      },
      views: {
        registerWebviewViewProvider: () => viewProviderDisposable
      },
      setup: {
        ensureConfigured: async (roots) => {
          configuredRootSets.push(roots.map(({ id }) => id));
        },
        configure: async () => undefined
      }
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    workspaceFolders = [
      folder("alpha", "file:///projects/alpha", 0),
      folder("beta", "file:///projects/beta", 1)
    ];
    assert.ok(folderChangeListener, "Folder-change listener was not registered");
    await folderChangeListener();

    assert.deepEqual(configuredRootSets, [
      ["file:///projects/alpha"],
      ["file:///projects/alpha", "file:///projects/beta"]
    ]);
    assert.ok(subscriptions.includes(folderChangeDisposable));
  });

  it("does not configure an ineligible folder window from its command", async () => {
    const host = new SetupRecordingHost();
    let configureCalls = 0;
    const folderWorkspace = WorkspaceModel.from(undefined, [
      folder("alpha", "file:///projects/alpha", 0)
    ]);

    await activateWorkspace(folderWorkspace, host, {
      setup: {
        ensureConfigured: async () => undefined,
        configure: async () => {
          configureCalls += 1;
        }
      },
      currentWorkspace: () => folderWorkspace
    });

    const configureCommand = host.handlers.get(
      "claudeWorkspaces.configureWorkspace"
    );
    assert.ok(configureCommand, "Configure Workspace command was not registered");
    await configureCommand();

    assert.equal(configureCalls, 0);
  });

  it("registers the session view only for a saved workspace", async () => {
    const registeredViews: Array<{ viewId: string; provider: unknown }> = [];
    const views: RecordingViewRegistry = {
      registerWebviewViewProvider: (viewId, provider) => {
        registeredViews.push({ viewId, provider });
        return { dispose: () => undefined };
      }
    };
    const savedContext = {
      subscriptions: [],
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces")
    } as unknown as vscode.ExtensionContext;
    const folderContext = { subscriptions: [] } as unknown as vscode.ExtensionContext;
    const dependencies = {
      commands: {
        executeCommand: async () => undefined,
        registerCommand: () => ({ dispose: () => undefined })
      },
      workspace: {
        workspaceFile: uri("file:///projects/group.code-workspace"),
        workspaceFolders: [folder("alpha", "file:///projects/alpha", 0)],
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views,
      logger: outputLogger(() => undefined),
      setup: {
        ensureConfigured: async () => undefined,
        configure: async () => undefined
      }
    } as unknown as ExtensionActivationDependencies;

    await activateWithDependencies(savedContext, dependencies);
    await activateWithDependencies(folderContext, {
      ...dependencies,
      workspace: {
        workspaceFile: undefined,
        workspaceFolders: [folder("alpha", "file:///projects/alpha", 0)],
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      }
    });

    assert.deepEqual(registeredViews.map(({ viewId }) => viewId), ["claudeWorkspaces.sessions"]);
    const panelProvider = registeredViews[0]?.provider as vscode.WebviewViewProvider;
    const disposed = new vscode.EventEmitter<void>();
    const receivedMessage = new vscode.EventEmitter<unknown>();
    const webview = {
      cspSource: "vscode-webview://test",
      html: "",
      asWebviewUri: (resource: vscode.Uri) => resource,
      onDidReceiveMessage: receivedMessage.event,
      postMessage: async () => true
    } as unknown as vscode.Webview;
    const view = {
      webview,
      onDidDispose: disposed.event
    } as unknown as vscode.WebviewView;

    panelProvider.resolveWebviewView(
      view,
      {} as vscode.WebviewViewResolveContext,
      {} as vscode.CancellationToken
    );

    assert.match(webview.html, /default-src 'none'; style-src vscode-webview:\/\/test; script-src 'nonce-/);
    assert.match(webview.html, /<script nonce="[^"]+" src="[^"\n]+"><\/script>/);
  });
});
