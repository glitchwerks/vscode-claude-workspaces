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
import {
  SessionPanelProvider,
  type SessionPanelActions,
  type SessionPanelResumableSource
} from "../../src/panel/sessionPanelProvider";
import type {
  ManagedSessionSnapshot,
  SessionDataEvent
} from "../../src/sessions/sessionTypes";
import { WorkspaceModel } from "../../src/workspace/workspaceModel";
import { MemoryMemento } from "../support/memoryMemento";
import { ResumableSessionStore } from "../../src/sessions/resumableSessionStore";

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

/** Supplies panel tests with an inert persisted-session source. */
function emptyResumableSessions(): SessionPanelResumableSource {
  return {
    sessions: [],
    onDidChangeSessions: () => ({ dispose: () => undefined })
  };
}

describe("activation boundary", () => {
  it("loads and owns the workspace-local resumable session store", async () => {
    const workspaceState = new MemoryMemento();
    const original = new ResumableSessionStore(workspaceState, () => undefined);
    await original.upsert({
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Saved",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00.000Z", lastLaunchedAt: "2026-09-02T10:00:00.000Z"
    });
    const context = {
      subscriptions: [], workspaceState, extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces")
    } as unknown as vscode.ExtensionContext;
    let provider: vscode.WebviewViewProvider | undefined;
    try {
      const api = await activateWithDependencies(context, {
        logger: outputLogger(() => undefined),
        commands: { executeCommand: async () => undefined, registerCommand: () => ({ dispose: () => undefined }) },
        workspace: { workspaceFile: undefined, workspaceFolders: [],
          onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined }) },
        views: { registerWebviewViewProvider: (_id, registered) => {
          provider = registered;
          return { dispose: () => undefined };
        } },
        terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 }
      });
      const store = api.resumableSessions;
      assert.ok(store instanceof ResumableSessionStore, "activation must construct the workspace-local store");
      assert.notEqual(store, original);
      assert.deepEqual(store.sessions, original.sessions);
      assert.ok(context.subscriptions.includes(store));
      assert.ok(provider instanceof SessionPanelProvider);
      const posted: unknown[] = [];
      const harness = resolvedPanelView(posted);
      provider.resolveWebviewView(harness.view);
      harness.receivedMessage.fire({ type: "ready" });
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal((posted[0] as { resumableSessions?: unknown[] }).resumableSessions?.length, 1);
      const resumes: string[] = [];
      api.launchController.resumeSession = async (id) => { resumes.push(id); };
      harness.receivedMessage.fire({ type: "resumeSession", claudeSessionId: original.sessions[0]!.claudeSessionId });
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(resumes, ["11111111-1111-4111-8111-111111111111"]);
    } finally {
      context.subscriptions.forEach((subscription) => subscription.dispose());
      original.dispose();
    }
  });

  it("runs the compatibility suite on VS Code 1.120", () => {
    // A test configuration that silently falls back to the latest host must fail.
    assert.match(vscode.version, /^1\.120\./);
  });

  it("disposes a factory-created logger when activation rejects", async () => {
    // An adapter that leaks its internally owned logger on activation failure must fail.
    let loggerDisposed = false;
    const logger = outputLogger(() => {
      loggerDisposed = true;
    });
    const context = { subscriptions: [], workspaceState: new MemoryMemento() } as unknown as vscode.ExtensionContext;
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
    const context = { subscriptions: [], workspaceState: new MemoryMemento() } as unknown as vscode.ExtensionContext;

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
      "cbeaulieu-gt.vscode-claude-workspaces"
    );

    assert.ok(extension, "Claude Workspaces extension was not discovered");

    const api = await extension.activate();
    const expected = vscode.workspace.workspaceFile?.scheme === "file";

    assert.equal(extension.isActive, true);
    assert.equal(api.savedWorkspace, expected);
  });

  it("keeps the session view unavailable in an ineligible folder window", async () => {
    const extension = vscode.extensions.getExtension<ClaudeWorkspacesApi>(
      "cbeaulieu-gt.vscode-claude-workspaces"
    );

    assert.ok(extension, "Claude Workspaces extension was not discovered");
    const api = await extension.activate();

    if (api.savedWorkspace) {
      return;
    }

    const contributions = extension.packageJSON.contributes as {
      views: Record<string, Array<{ id: string; when?: string }>>;
    };
    const sessionView = contributions.views.claudeWorkspaces?.find(
      ({ id }) => id === "claudeWorkspaces.sessions"
    );

    assert.ok(sessionView, "Session view contribution was not discovered");
    assert.equal(sessionView.when, "claudeWorkspaces.savedWorkspace");
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
    const context = { subscriptions, workspaceState: new MemoryMemento() } as unknown as vscode.ExtensionContext;

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

  it("disposes an injected session panel provider with extension subscriptions", async () => {
    const subscriptions: vscode.Disposable[] = [];
    let disposeCalls = 0;
    const panelProvider: vscode.WebviewViewProvider & vscode.Disposable = {
      resolveWebviewView: () => undefined,
      dispose: () => {
        disposeCalls += 1;
      }
    };
    const context = {
      subscriptions,
      workspaceState: new MemoryMemento(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces")
    } as unknown as vscode.ExtensionContext;

    await activateWithDependencies(context, {
      commands: {
        executeCommand: async () => undefined,
        registerCommand: () => ({ dispose: () => undefined })
      },
      workspace: {
        workspaceFile: undefined,
        workspaceFolders: [],
        onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined })
      },
      views: {
        registerWebviewViewProvider: () => ({ dispose: () => undefined })
      },
      panelProvider,
      logger: outputLogger(() => undefined),
      setup: {
        ensureConfigured: async () => undefined,
        configure: async () => undefined
      }
    });

    assert.ok(subscriptions.includes(panelProvider));
    for (const subscription of subscriptions) {
      subscription.dispose();
    }
    assert.equal(disposeCalls, 1);
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

  it("registers the session view independently of initial workspace eligibility", async () => {
    const registeredViews: Array<{ viewId: string; provider: unknown }> = [];
    const views: RecordingViewRegistry = {
      registerWebviewViewProvider: (viewId, provider) => {
        registeredViews.push({ viewId, provider });
        return { dispose: () => undefined };
      }
    };
    const savedContext = {
      subscriptions: [],
      workspaceState: new MemoryMemento(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces")
    } as unknown as vscode.ExtensionContext;
    const folderContext = {
      subscriptions: [],
      workspaceState: new MemoryMemento(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces")
    } as unknown as vscode.ExtensionContext;
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

    assert.deepEqual(registeredViews.map(({ viewId }) => viewId), [
      "claudeWorkspaces.sessions",
      "claudeWorkspaces.sessions"
    ]);
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

    const csp = webview.html.match(
      /<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src vscode-webview:\/\/test 'unsafe-inline'; script-src 'nonce-([^']+)';">/
    );
    const script = webview.html.match(/<script nonce="([^"]+)" src="[^"\n]+"><\/script>/);

    assert.ok(csp);
    assert.ok(script);
    assert.equal(csp[1], script[1]);
  });
});

describe("session panel provider", () => {
  it("rechecks after late flush and when a hidden view becomes visible", async () => {
    const store = new ResumableSessionStore(new MemoryMemento(), () => undefined);
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Saved",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
    };
    await store.upsert(saved);
    let evidence: "absent" | "present" = "absent";
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const visibility = new vscode.EventEmitter<void>();
    const panel = new SessionPanelProvider({
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: { sessions: [], activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event, onDidReceiveData: receivedData.event },
      resumableSessions: store, actions: panelActions([]),
      checkConversationEligibility: async () => evidence
    });
    try {
      const posted: unknown[] = [];
      const harness = resolvedPanelView(posted);
      Object.assign(harness.view, { visible: true, onDidChangeVisibility: visibility.event });
      panel.resolveWebviewView(harness.view);
      harness.receivedMessage.fire({ type: "ready" });
      await new Promise<void>((resolve) => setImmediate(resolve));
      evidence = "present";
      await new Promise<void>((resolve) => setTimeout(resolve, 1100));
      assert.deepEqual(posted.at(-1), { type: "resumableSessionsChanged", sessions: [saved] });
      evidence = "absent";
      visibility.fire();
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(posted.at(-1), { type: "resumableSessionsChanged", sessions: [] });
      assert.equal(store.sessions.length, 1);
    } finally {
      panel.dispose(); store.dispose(); sessionChanges.dispose(); receivedData.dispose(); visibility.dispose();
    }
  });

  it("checks candidates before hydration and retains unknown records without deleting metadata", async () => {
    const store = new ResumableSessionStore(new MemoryMemento(), () => undefined);
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Saved",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
    };
    await store.upsert(saved);
    let finish: (value: "present" | "absent" | "unknown") => void = () => undefined;
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const panel = new SessionPanelProvider({
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: { sessions: [], activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event, onDidReceiveData: receivedData.event },
      resumableSessions: store, actions: panelActions([]),
      checkConversationEligibility: () => new Promise((resolve) => { finish = resolve; })
    });
    try {
      const posted: unknown[] = [];
      const harness = resolvedPanelView(posted);
      panel.resolveWebviewView(harness.view);
      harness.receivedMessage.fire({ type: "ready" });
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual((posted[0] as { resumableSessions: unknown }).resumableSessions, []);
      finish("absent");
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(store.sessions.length, 1);
      assert.ok(!posted.some((message) => (message as { sessions?: unknown[] }).sessions?.length));
      sessionChanges.fire([]);
      finish("unknown");
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(posted.at(-1), { type: "resumableSessionsChanged", sessions: [saved] });
      sessionChanges.fire([]);
      const stale = finish;
      await store.forget(saved.claudeSessionId);
      stale("present");
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual(posted.at(-1), { type: "resumableSessionsChanged", sessions: [] });
    } finally {
      panel.dispose(); store.dispose(); sessionChanges.dispose(); receivedData.dispose();
    }
  });

  it("does not resurrect live sessions or deliver eligibility results into a replacement view", async () => {
    const store = new ResumableSessionStore(new MemoryMemento(), () => undefined);
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Saved",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
    };
    await store.upsert(saved);
    let finish: (value: "present") => void = () => undefined;
    let probes = 0;
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const panel = new SessionPanelProvider({
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: { sessions: [], activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event, onDidReceiveData: receivedData.event },
      resumableSessions: store, actions: panelActions([]),
      checkConversationEligibility: () => new Promise((resolve) => { probes += 1; finish = resolve; })
    });
    try {
      const first = resolvedPanelView([]);
      panel.resolveWebviewView(first.view);
      const stale = finish;
      const posted: unknown[] = [];
      const replacement = resolvedPanelView(posted);
      panel.resolveWebviewView(replacement.view);
      assert.equal(probes, 1, "overlapping refreshes must coalesce pending filesystem reads");
      replacement.receivedMessage.fire({ type: "ready" });
      stale("present");
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.deepEqual((posted[0] as { resumableSessions: unknown }).resumableSessions, []);
      sessionChanges.fire([{ ...panelSession(), claudeSessionId: saved.claudeSessionId }]);
      finish("present");
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.ok(!posted.some((message) => {
        const update = message as { type: string; sessions?: unknown[] };
        return update.type === "resumableSessionsChanged" && update.sessions?.length;
      }));
    } finally {
      panel.dispose(); store.dispose(); sessionChanges.dispose(); receivedData.dispose();
    }
  });

  it("hydrates persisted sessions, filters every live UUID, and restores closed sessions", async () => {
    const store = new ResumableSessionStore(new MemoryMemento(), () => undefined);
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Saved",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
    };
    await store.upsert(saved);
    const other = { ...saved, claudeSessionId: "22222222-2222-4222-8222-222222222222",
      displayName: "Other", lastLaunchedAt: "2026-09-03T10:00:00Z" };
    await store.upsert(other);
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const live = { ...panelSession(), claudeSessionId: saved.claudeSessionId };
    const dependencies = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: { sessions: [live, { ...panelSession(), id: "legacy" }], activeSessionId: live.id,
        onDidChangeSessions: sessionChanges.event, onDidReceiveData: receivedData.event },
      resumableSessions: store,
      actions: panelActions([])
    };
    const panel = new SessionPanelProvider(dependencies);
    const posted: unknown[] = [];
    const harness = resolvedPanelView(posted);
    panel.resolveWebviewView(harness.view);
    await store.rename(other.claudeSessionId, "Updated before ready");
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    const updated = { ...other, displayName: "Updated before ready" };
    assert.deepEqual((posted[0] as { resumableSessions?: unknown }).resumableSessions, [updated]);
    posted.length = 0;
    sessionChanges.fire([{ ...live, claudeSessionId: other.claudeSessionId }]);
    assert.deepEqual(posted.at(-1), { type: "resumableSessionsChanged", sessions: [saved] });
    sessionChanges.fire([]);
    assert.deepEqual(posted.at(-1), { type: "resumableSessionsChanged", sessions: [updated, saved] });
    await store.forget(other.claudeSessionId);
    assert.deepEqual(posted.at(-1), { type: "resumableSessionsChanged", sessions: [saved] });
    panel.dispose();
    store.dispose();
    sessionChanges.dispose();
    receivedData.dispose();
  });

  it("routes only validated saved-session intents and disposes its persisted-source subscription", async () => {
    const store = new ResumableSessionStore(new MemoryMemento(), () => undefined);
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const calls: string[] = [];
    let disposed = false;
    const dependencies = {
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: { sessions: [], activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event, onDidReceiveData: receivedData.event },
      resumableSessions: { get sessions() { return store.sessions; },
        onDidChangeSessions: ((listener) => {
          const subscription = store.onDidChangeSessions(listener);
          return { dispose: () => { disposed = true; subscription.dispose(); } };
        }) as typeof store.onDidChangeSessions },
      actions: { ...panelActions(calls),
        resumeSession: (id: string) => { calls.push(`resume:${id}`); },
        forgetSession: (id: string) => { calls.push(`forget:${id}`); } }
    };
    const panel = new SessionPanelProvider(dependencies);
    const harness = resolvedPanelView([]);
    panel.resolveWebviewView(harness.view);
    const message = { type: "resumeSession", claudeSessionId: "11111111-1111-4111-8111-111111111111" };
    harness.receivedMessage.fire({ ...message, rootPath: "C:/untrusted" });
    harness.receivedMessage.fire({ ...message, claudeSessionId: "invalid" });
    harness.receivedMessage.fire(message);
    harness.receivedMessage.fire({ type: "forgetSession", claudeSessionId: message.claudeSessionId });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, [
      "resume:11111111-1111-4111-8111-111111111111",
      "forget:11111111-1111-4111-8111-111111111111"
    ]);
    harness.receivedMessage.fire(message);
    panel.dispose();
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(disposed, true);
    assert.equal(calls.length, 2, "queued intent cannot outlive its view");
    store.dispose();
    sessionChanges.dispose();
    receivedData.dispose();
  });

  it("embeds the configured initial session-details visibility in the webview shell", () => {
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessionDetailsInitiallyExpanded: false,
      sessions: {
        sessions: [],
        activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([])
    });
    const harness = resolvedPanelView([]);

    panel.resolveWebviewView(harness.view);

    assert.match(
      harness.view.webview.html,
      /<main id="app" aria-label="Claude sessions" data-session-details-initially-expanded="false"><\/main>/
    );
    panel.dispose();
  });

  it("normalizes a malformed session-details setting before embedding it in HTML", () => {
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const injectedMarkup = `false"><script data-injected="true"></script><main data-extra="`;
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessionDetailsInitiallyExpanded: injectedMarkup as unknown as boolean,
      sessions: {
        sessions: [],
        activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([])
    });
    const harness = resolvedPanelView([]);

    panel.resolveWebviewView(harness.view);

    assert.match(
      harness.view.webview.html,
      /<main id="app" aria-label="Claude sessions" data-session-details-initially-expanded="true"><\/main>/
    );
    assert.equal(harness.view.webview.html.includes(injectedMarkup), false);
    panel.dispose();
  });

  it("hydrates the webview after its ready message", async () => {
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const posted: unknown[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([])
    });
    const harness = resolvedPanelView(posted);

    panel.resolveWebviewView(harness.view);
    const secondSession = { ...session, id: "session-beta", displayName: "beta 1" };
    sessionChanges.fire([session, secondSession]);
    receivedData.fire({ sessionId: session.id, data: "intro\r\n" });
    assert.deepEqual(posted, []);
    harness.receivedMessage.fire({ type: "ready" });
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(posted, [{
      type: "hydrate",
      resumableSessions: [],
      sessions: [session, secondSession],
      activeSessionId: "session-alpha",
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 }
    }, {
      type: "sessionData",
      sessionId: "session-alpha",
      data: "intro\r\n"
    }]);
    panel.dispose();
  });

  it("publishes an update when only the Claude session identity changes", async () => {
    // Ignoring Claude identity in snapshot comparison leaves the renderer with stale resume metadata.
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const posted: unknown[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([])
    });
    const harness = resolvedPanelView(posted);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    posted.length = 0;
    const identifiedSession = {
      ...session,
      claudeSessionId: "123e4567-e89b-42d3-a456-426614174000"
    };
    sessionChanges.fire([identifiedSession]);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(posted, [{ type: "sessionUpdated", session: identifiedSession }]);
    panel.dispose();
  });

  it("replays terminal output received while no webview is available", async () => {
    // Posting only to a resolved view permanently loses output produced while the panel is hidden.
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const posted: unknown[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([])
    });

    receivedData.fire({ sessionId: session.id, data: "hidden output\r\n" });
    const harness = resolvedPanelView(posted);
    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(posted, [
      {
        type: "hydrate",
        resumableSessions: [],
        sessions: [session],
        activeSessionId: "session-alpha",
        terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 }
      },
      { type: "sessionData", sessionId: "session-alpha", data: "hidden output\r\n" }
    ]);
    panel.dispose();
  });

  it("ignores a queued action from an obsolete webview resolution", async () => {
    // A queued callback from an obsolete view must not invoke current session actions.
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [],
        activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls)
    });
    const obsoleteHarness = resolvedPanelView([]);
    const currentHarness = resolvedPanelView([]);

    panel.resolveWebviewView(obsoleteHarness.view);
    obsoleteHarness.receivedMessage.fire({ type: "newSession" });
    panel.resolveWebviewView(currentHarness.view);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(actionCalls, []);
    currentHarness.receivedMessage.fire({ type: "newInFolder" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(actionCalls, ["newInFolder"]);
    panel.dispose();
  });

  it("ignores a queued action after the active webview is disposed", async () => {
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [],
        activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls)
    });
    const harness = resolvedPanelView([]);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "newSession" });
    harness.disposed.fire();
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(actionCalls, []);
    panel.dispose();
  });

  it("trims retained terminal output only after the excess leading line", async () => {
    // Slicing at the byte boundary can replay a partial line or terminal escape sequence.
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const posted: Array<{ type?: string; data?: string }> = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([])
    });

    receivedData.fire({ sessionId: session.id, data: `${"a".repeat(200_000)}\r\n` });
    receivedData.fire({ sessionId: session.id, data: `${"b".repeat(100_000)}\r\n` });
    const harness = resolvedPanelView(posted);
    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(posted[1]?.data, `${"b".repeat(100_000)}\r\n`);
    assert.ok(Buffer.byteLength(posted[1]?.data ?? "", "utf8") <= 256 * 1024);
    panel.dispose();
  });

  it("preserves astral text and ANSI sequences joined across chunks at a replay boundary", async () => {
    // UTF-16 slicing can exceed the byte cap, split a surrogate pair, or retain a partial ANSI prefix.
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const posted: Array<{ type?: string; data?: string }> = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([])
    });

    receivedData.fire({ sessionId: session.id, data: `${"😀".repeat(70_000)}\r\n\x1b[` });
    receivedData.fire({ sessionId: session.id, data: "31mClaude 😀\x1b[0m\r\n" });
    const harness = resolvedPanelView(posted);
    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const replay = posted[1]?.data ?? "";
    assert.equal(replay, "\x1b[31mClaude 😀\x1b[0m\r\n");
    assert.ok(Buffer.byteLength(replay, "utf8") <= 256 * 1024);
    assert.doesNotMatch(replay, /^[\uDC00-\uDFFF]/u);
    assert.doesNotMatch(replay, /^\[[0-9;]*m/u);
    panel.dispose();
  });

  it("drops an oversized retained line when it has no safe newline boundary", async () => {
    // Retaining an arbitrary suffix of one huge line violates both the hard cap and replay safety.
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const posted: Array<{ type?: string; data?: string }> = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([])
    });

    receivedData.fire({ sessionId: session.id, data: "😀".repeat(70_000) });
    const harness = resolvedPanelView(posted);
    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(posted.length, 1);
    panel.dispose();
  });

  it("drops later chunks of an oversized line through its next newline", async () => {
    // Forgetting the dropped-line state can replay a later chunk from the middle of an ANSI sequence.
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const posted: Array<{ type?: string; data?: string }> = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([])
    });

    receivedData.fire({ sessionId: session.id, data: `${"x".repeat(256 * 1024)}\x1b[` });
    receivedData.fire({ sessionId: session.id, data: "31mcontinuation\r\nsafe 😀\r\n" });
    const harness = resolvedPanelView(posted);
    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const replay = posted[1]?.data ?? "";
    assert.equal(replay, "safe 😀\r\n");
    assert.ok(Buffer.byteLength(replay, "utf8") <= 256 * 1024);
    assert.doesNotMatch(replay, /^\[[0-9;]*m/u);
    panel.dispose();
  });

  it("logs rejected messages and forwards decoded intents through injected actions", async () => {
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    const logs: string[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [],
        activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls),
      log: (message) => logs.push(message)
    });
    const harness = resolvedPanelView([]);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "newSession", command: "cmd.exe" });
    harness.receivedMessage.fire({ type: "input", sessionId: "session-alpha", data: "hello" });
    harness.receivedMessage.fire({ type: "newSession" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(actionCalls, ["input:session-alpha:hello", "newSession"]);
    assert.equal(logs.length, 1);
    assert.match(logs[0] ?? "", /^Ignored invalid Claude session panel message:/);
    panel.dispose();
  });

  it("prefills and trims a rename for the requested live session", async () => {
    // Prompting for the active session or forwarding whitespace would rename the wrong tab or leak UI input.
    const alpha = panelSession();
    const beta = { ...alpha, id: "session-beta", displayName: "beta 1" };
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    const prompts: vscode.InputBoxOptions[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [alpha, beta],
        activeSessionId: alpha.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls),
      requestSessionName: async (options) => {
        prompts.push(options);
        return "  Beta migration  ";
      }
    });
    const harness = resolvedPanelView([]);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "requestRenameSession", sessionId: beta.id });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(prompts.length, 1);
    const { validateInput, ...promptOptions } = prompts[0]!;
    assert.deepEqual(promptOptions, {
      title: "Rename Claude Session",
      prompt: "Enter a name for this live session.",
      value: "beta 1",
      valueSelection: [0, 6]
    });
    assert.equal(await validateInput?.(""), "Session name cannot be blank.");
    assert.equal(await validateInput?.("   "), "Session name cannot be blank.");
    assert.equal(await validateInput?.("Beta migration"), undefined);
    assert.deepEqual(actionCalls, ["renameSession:session-beta:Beta migration"]);
    panel.dispose();
  });

  it("ignores cancelled, blank, stale, and unknown session rename prompts", async () => {
    // Invalid or obsolete prompt results must not rename a live session after its context disappears.
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    const results: Array<string | undefined | Promise<string>> = [undefined, "   "];
    let resolveStale: ((name: string) => void) | undefined;
    results.push(new Promise<string>((resolve) => (resolveStale = resolve)));
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls),
      requestSessionName: async () => results.shift()
    });
    const harness = resolvedPanelView([]);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "requestRenameSession", sessionId: session.id });
    await new Promise<void>((resolve) => setImmediate(resolve));
    harness.receivedMessage.fire({ type: "requestRenameSession", sessionId: session.id });
    await new Promise<void>((resolve) => setImmediate(resolve));
    harness.receivedMessage.fire({ type: "requestRenameSession", sessionId: session.id });
    await new Promise<void>((resolve) => setImmediate(resolve));
    sessionChanges.fire([]);
    resolveStale?.("stale name");
    harness.receivedMessage.fire({ type: "requestRenameSession", sessionId: "missing" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(actionCalls, []);
    panel.dispose();
  });

  it("opens only valid HTTP links requested by the current active session", async () => {
    const session = panelSession();
    const inactiveSession = { ...session, id: "session-beta", displayName: "beta 1" };
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const opened: string[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session, inactiveSession],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([]),
      openExternal: async (uri) => {
        opened.push(uri.toString(true));
        return true;
      }
    });
    const harness = resolvedPanelView([]);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({
      type: "openExternal",
      sessionId: inactiveSession.id,
      uri: "https://example.com/inactive"
    });
    harness.receivedMessage.fire({
      type: "openExternal",
      sessionId: session.id,
      uri: "javascript:alert(1)"
    });
    harness.receivedMessage.fire({
      type: "openExternal",
      sessionId: session.id,
      uri: "file:///C:/Windows/System32"
    });
    harness.receivedMessage.fire({
      type: "openExternal",
      sessionId: session.id,
      uri: "not a url"
    });
    harness.receivedMessage.fire({
      type: "openExternal",
      sessionId: session.id,
      uri: "https://example.com/docs?q=claude#links"
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(opened, ["https://example.com/docs?q=claude#links"]);
    panel.dispose();
  });

  it("ignores link requests queued by a replaced webview", async () => {
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const opened: string[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([]),
      openExternal: async (uri) => {
        opened.push(uri.toString(true));
        return true;
      }
    });
    const obsolete = resolvedPanelView([]);
    const current = resolvedPanelView([]);

    panel.resolveWebviewView(obsolete.view);
    obsolete.receivedMessage.fire({
      type: "openExternal",
      sessionId: session.id,
      uri: "https://example.com/stale"
    });
    panel.resolveWebviewView(current.view);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(opened, []);
    panel.dispose();
  });

  it("logs external URI opening failures without leaking them from the listener", async () => {
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const logs: string[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([]),
      openExternal: () => Promise.reject(new Error("external opener unavailable")),
      log: (message) => logs.push(message)
    });
    const harness = resolvedPanelView([]);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({
      type: "openExternal",
      sessionId: session.id,
      uri: "http://example.com"
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(logs, ["Claude session panel action failed: external opener unavailable"]);
    panel.dispose();
  });

  it("reads clipboard text on the host and returns it once to the active terminal", async () => {
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    let clipboardReads = 0;
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls),
      readClipboardText: async () => {
        clipboardReads += 1;
        return "clipboard text";
      }
    });
    const posted: unknown[] = [];
    const harness = resolvedPanelView(posted);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    harness.receivedMessage.fire({ type: "requestPaste", sessionId: session.id });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(clipboardReads, 1);
    assert.deepEqual(actionCalls, []);
    assert.deepEqual(posted[1], {
      type: "paste",
      sessionId: session.id,
      data: "clipboard text"
    });
    panel.dispose();
  });

  it("ignores paste requests for inactive sessions and empty clipboard text", async () => {
    const session = panelSession();
    const inactiveSession = { ...session, id: "session-beta", displayName: "beta 1" };
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    let clipboardReads = 0;
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session, inactiveSession],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls),
      readClipboardText: async () => {
        clipboardReads += 1;
        return "";
      }
    });
    const posted: Array<{ type?: string }> = [];
    const harness = resolvedPanelView(posted);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    harness.receivedMessage.fire({ type: "requestPaste", sessionId: inactiveSession.id });
    harness.receivedMessage.fire({ type: "requestPaste", sessionId: session.id });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(clipboardReads, 1);
    assert.deepEqual(actionCalls, []);
    assert.equal(posted.some(({ type }) => type === "paste"), false);
    panel.dispose();
  });

  it("drops clipboard text when the active session changes during the host read", async () => {
    const session = panelSession();
    const nextSession = { ...session, id: "session-beta", displayName: "beta 1" };
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    let activeSessionId = session.id;
    let resolveClipboard: ((text: string) => void) | undefined;
    const clipboardText = new Promise<string>((resolve) => {
      resolveClipboard = resolve;
    });
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session, nextSession],
        get activeSessionId() { return activeSessionId; },
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls),
      readClipboardText: () => clipboardText
    });
    const posted: Array<{ type?: string }> = [];
    const harness = resolvedPanelView(posted);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    harness.receivedMessage.fire({ type: "requestPaste", sessionId: session.id });
    await new Promise<void>((resolve) => setImmediate(resolve));
    activeSessionId = nextSession.id;
    sessionChanges.fire([session, nextSession]);
    resolveClipboard?.("stale clipboard text");
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(actionCalls, []);
    assert.equal(posted.some(({ type }) => type === "paste"), false);
    panel.dispose();
  });

  it("logs clipboard read failures without sending terminal input", async () => {
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    const logs: string[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls),
      readClipboardText: () => Promise.reject(new Error("clipboard unavailable")),
      log: (message) => logs.push(message)
    });
    const posted: Array<{ type?: string }> = [];
    const harness = resolvedPanelView(posted);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    harness.receivedMessage.fire({ type: "requestPaste", sessionId: session.id });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(actionCalls, []);
    assert.equal(posted.some(({ type }) => type === "paste"), false);
    assert.deepEqual(logs, ["Claude session panel action failed: clipboard unavailable"]);
    panel.dispose();
  });

  it("drops clipboard text when its originating webview is replaced during the read", async () => {
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    let resolveClipboard: ((text: string) => void) | undefined;
    const clipboardText = new Promise<string>((resolve) => {
      resolveClipboard = resolve;
    });
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls),
      readClipboardText: () => clipboardText
    });
    const obsoletePosted: Array<{ type?: string }> = [];
    const currentPosted: Array<{ type?: string }> = [];
    const obsolete = resolvedPanelView(obsoletePosted);
    const current = resolvedPanelView(currentPosted);

    panel.resolveWebviewView(obsolete.view);
    obsolete.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    obsolete.receivedMessage.fire({ type: "requestPaste", sessionId: session.id });
    await new Promise<void>((resolve) => setImmediate(resolve));
    panel.resolveWebviewView(current.view);
    current.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    resolveClipboard?.("stale clipboard text");
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(obsoletePosted.some(({ type }) => type === "paste"), false);
    assert.equal(currentPosted.some(({ type }) => type === "paste"), false);
    assert.deepEqual(actionCalls, []);
    panel.dispose();
  });

  it("serializes clipboard reads so paste requests preserve their order", async () => {
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const clipboardResolvers: Array<(text: string) => void> = [];
    const posted: Array<{ type?: string; data?: string }> = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([]),
      readClipboardText: () => new Promise<string>((resolve) => {
        clipboardResolvers.push(resolve);
      })
    });
    const harness = resolvedPanelView(posted);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    harness.receivedMessage.fire({ type: "requestPaste", sessionId: session.id });
    harness.receivedMessage.fire({ type: "requestPaste", sessionId: session.id });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(clipboardResolvers.length, 1);
    clipboardResolvers[0]?.("first");
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(clipboardResolvers.length, 2);
    clipboardResolvers[1]?.("second");
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(
      posted.filter(({ type }) => type === "paste").map(({ data }) => data),
      ["first", "second"]
    );
    panel.dispose();
  });

  it("continues the paste queue after a clipboard read fails", async () => {
    const session = panelSession();
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const posted: Array<{ type?: string; data?: string }> = [];
    const logs: string[] = [];
    let clipboardReads = 0;
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [session],
        activeSessionId: session.id,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions([]),
      readClipboardText: () => {
        clipboardReads += 1;
        return clipboardReads === 1
          ? Promise.reject(new Error("first read failed"))
          : Promise.resolve("recovered paste");
      },
      log: (message) => logs.push(message)
    });
    const harness = resolvedPanelView(posted);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "ready" });
    await new Promise<void>((resolve) => setImmediate(resolve));
    harness.receivedMessage.fire({ type: "requestPaste", sessionId: session.id });
    harness.receivedMessage.fire({ type: "requestPaste", sessionId: session.id });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(clipboardReads, 2);
    assert.deepEqual(logs, ["Claude session panel action failed: first read failed"]);
    assert.deepEqual(
      posted.filter(({ type }) => type === "paste").map(({ data }) => data),
      ["recovered paste"]
    );
    panel.dispose();
  });

  it("detaches the previous webview message listener when the view re-resolves", async () => {
    // Retaining the old listener lets a disposed webview keep invoking live session actions.
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const actionCalls: string[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [],
        activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: panelActions(actionCalls)
    });
    const oldHarness = resolvedPanelView([]);
    const currentHarness = resolvedPanelView([]);

    panel.resolveWebviewView(oldHarness.view);
    panel.resolveWebviewView(currentHarness.view);
    oldHarness.receivedMessage.fire({ type: "newSession" });
    currentHarness.receivedMessage.fire({ type: "newInFolder" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(actionCalls, ["newInFolder"]);
    panel.dispose();
  });

  it("logs synchronous throws and rejected action promises", async () => {
    const sessionChanges = new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const receivedData = new vscode.EventEmitter<SessionDataEvent>();
    const logs: string[] = [];
    const panel = new SessionPanelProvider({
      resumableSessions: emptyResumableSessions(),
      extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces"),
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      sessions: {
        sessions: [],
        activeSessionId: undefined,
        onDidChangeSessions: sessionChanges.event,
        onDidReceiveData: receivedData.event
      },
      actions: {
        ...panelActions([]),
        input: () => {
          throw new Error("synchronous input failure");
        },
        newSession: () => Promise.reject(new Error("asynchronous launch failure"))
      },
      log: (message) => logs.push(message)
    });
    const harness = resolvedPanelView([]);

    panel.resolveWebviewView(harness.view);
    harness.receivedMessage.fire({ type: "input", sessionId: "session-alpha", data: "hello" });
    harness.receivedMessage.fire({ type: "newSession" });
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(logs, [
      "Claude session panel action failed: synchronous input failure",
      "Claude session panel action failed: asynchronous launch failure"
    ]);
    panel.dispose();
  });
});

/** Creates a complete managed-session fixture without relying on the implementation under test. */
function panelSession(): ManagedSessionSnapshot {
  return {
    id: "session-alpha",
    claudeSessionId: null,
    rootId: "file:///workspace/alpha",
    displayName: "alpha 1",
    ordinalWithinRoot: 1,
    state: "running",
    launchedImportIds: [],
    launchedAddDirPaths: [],
    launchedAt: 1234
  };
}

/** Provides a complete action boundary that records only user-visible intents. */
function panelActions(calls: string[]): SessionPanelActions {
  return {
    input: (sessionId, data) => { calls.push(`input:${sessionId}:${data}`); },
    resize: (sessionId, columns, rows) => { calls.push(`resize:${sessionId}:${columns}:${rows}`); },
    selectSession: (sessionId) => { calls.push(`selectSession:${sessionId}`); },
    renameSession: (sessionId, displayName) => { calls.push(`renameSession:${sessionId}:${displayName}`); },
    newSession: () => { calls.push("newSession"); },
    newInFolder: () => { calls.push("newInFolder"); },
    resumeSession: (id) => { calls.push(`resumeSession:${id}`); },
    forgetSession: (id) => { calls.push(`forgetSession:${id}`); },
    closeSession: (sessionId) => { calls.push(`closeSession:${sessionId}`); },
    restartFresh: (sessionId) => { calls.push(`restartFresh:${sessionId}`); },
    previousSession: () => { calls.push("previousSession"); },
    nextSession: () => { calls.push("nextSession"); },
    configureWorkspace: () => { calls.push("configureWorkspace"); }
  };
}

/** Creates a webview view harness that exposes the provider's actual message subscription. */
function resolvedPanelView(posted: unknown[]): {
  readonly disposed: vscode.EventEmitter<void>;
  readonly receivedMessage: vscode.EventEmitter<unknown>;
  readonly view: vscode.WebviewView;
} {
  const receivedMessage = new vscode.EventEmitter<unknown>();
  const disposed = new vscode.EventEmitter<void>();
  const webview = {
    cspSource: "vscode-webview://test",
    html: "",
    asWebviewUri: (resource: vscode.Uri) => resource,
    onDidReceiveMessage: receivedMessage.event,
    postMessage: async (message: unknown) => {
      posted.push(message);
      return true;
    }
  } as unknown as vscode.Webview;
  return {
    disposed,
    receivedMessage,
    view: {
      webview,
      onDidDispose: disposed.event
    } as unknown as vscode.WebviewView
  };
}
