import * as vscode from "vscode";
import { randomUUID } from "node:crypto";

import {
  activateWorkspace,
  type ClaudeWorkspacesApi,
  type DisposableLike,
  type WorkspaceSetupService
} from "./activation";
import { ConfigurationStore } from "./config/configurationStore";
import {
  SetupController,
  type WorkspaceSetupPicker,
  type WorkspaceSetupRoot
} from "./config/setupController";
import {
  showSingleSelectionQuickPick,
  withInitialSelections
} from "./config/setupQuickPick";
import { parseLogLevel } from "./logging/logLevel";
import { OutputLogger } from "./logging/outputLogger";
import type { RootAvailability } from "./launch/launchPlanner";
import { LaunchController } from "./launch/launchController";
import { ClaudeCapabilityProbe, createNodeClaudeHelpRunner } from "./launch/claudeCapabilities";
import { type ManagedPtyFactory } from "./launch/managedPty";
import { NodePtyFactory } from "./launch/nodePtyAdapter";
import {
  SessionPanelProvider,
  SESSION_VIEW_ID
} from "./panel/sessionPanelProvider";
import type { TerminalFontMetrics } from "./panel/protocol";
import { resolveTerminalFontMetrics } from "./panel/terminalFont";
import { WorkspaceModel } from "./workspace/workspaceModel";
import { SessionManager } from "./sessions/sessionManager";
import { ResumableSessionStore } from "./sessions/resumableSessionStore";
import { checkConversationEligibility } from "./sessions/conversationEligibility";

let activeSessionManager: SessionManager | undefined;
const EARLY_SHUTDOWN_TIMEOUT_MS = 2_000;

type HostTerminationSignal = "SIGINT" | "SIGTERM";

export async function activate(
  context: vscode.ExtensionContext
): Promise<ClaudeWorkspacesApi> {
  const runtime = await activateWithDependencies(context);
  return { savedWorkspace: runtime.savedWorkspace };
}

export interface ExtensionCommandsApi {
  executeCommand(commandId: string, ...args: unknown[]): PromiseLike<unknown>;
  registerCommand(
    commandId: string,
    handler: () => unknown | PromiseLike<unknown>
  ): DisposableLike;
}

export interface ExtensionWorkspaceApi {
  readonly workspaceFile: vscode.Uri | undefined;
  readonly workspaceFolders: readonly vscode.WorkspaceFolder[] | undefined;
  getConfiguration?(section: string): Pick<vscode.WorkspaceConfiguration, "get">;
  onDidChangeWorkspaceFolders(
    listener: () => unknown | PromiseLike<unknown>
  ): DisposableLike;
  onDidChangeConfiguration?(
    listener: (event: Pick<vscode.ConfigurationChangeEvent, "affectsConfiguration">) => unknown
  ): DisposableLike;
}

/** Registers the session panel through an injectable VS Code view boundary. */
export interface ExtensionViewsApi {
  registerWebviewViewProvider(
    viewId: string,
    provider: vscode.WebviewViewProvider,
    options?: NonNullable<Parameters<typeof vscode.window.registerWebviewViewProvider>[2]>
  ): DisposableLike;
}

const SESSION_VIEW_REGISTRATION_OPTIONS = {
  webviewOptions: { retainContextWhenHidden: true }
} satisfies NonNullable<Parameters<typeof vscode.window.registerWebviewViewProvider>[2]>;

/** An injected panel provider whose lifecycle activation adopts with the extension context. */
export interface OwnedPanelProvider extends vscode.WebviewViewProvider, vscode.Disposable {}

export interface ExtensionActivationDependencies {
  readonly createClaudeSessionId?: () => string;
  readonly claudeCapabilities?: Pick<ClaudeCapabilityProbe, "get">;
  readonly now?: () => number;
  readonly commands?: ExtensionCommandsApi;
  readonly workspace?: ExtensionWorkspaceApi;
  readonly setup?: WorkspaceSetupService;
  readonly logger?: OutputLogger;
  readonly loggerFactory?: () => OutputLogger;
  readonly reportSetupError?: (error: unknown) => void;
  readonly views?: ExtensionViewsApi;
  readonly panelProvider?: OwnedPanelProvider;
  readonly ptyFactory?: ManagedPtyFactory;
  readonly availability?: RootAvailability;
  readonly selectRoot?: (roots: readonly WorkspaceSetupRoot[]) => Promise<string | undefined>;
  readonly notifications?: ExtensionNotificationsApi;
  readonly lifecycle?: ExtensionLifecycleApi;
  readonly executable?: () => string | undefined;
  readonly terminalFont?: TerminalFontMetrics;
}

/** Host orchestration access for dependency-injected activation; not returned by activate(). */
export interface ExtensionRuntimeApi extends ClaudeWorkspacesApi {
  readonly launchController: LaunchController;
  readonly resumableSessions: ResumableSessionStore;
}

/** Presentation boundary for launch feedback. */
export interface ExtensionNotificationsApi {
  showWarningMessage(message: string, ...items: string[]): PromiseLike<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): PromiseLike<string | undefined>;
}

/** Explicit host shutdown signals that initiate owned PTY cleanup before disposal. */
export interface ExtensionLifecycleApi {
  onTerminationSignal(listener: (signal: HostTerminationSignal) => void): DisposableLike;
  schedule(callback: () => void, delayMs: number): DisposableLike;
  reemit(signal: HostTerminationSignal): void;
}

/** Activates through injectable VS Code boundaries used by extension-host tests. */
export async function activateWithDependencies(
  context: vscode.ExtensionContext,
  dependencies: ExtensionActivationDependencies = {}
): Promise<ExtensionRuntimeApi> {
  const commands = dependencies.commands ?? createExtensionCommandsApi();
  const workspaceApi = dependencies.workspace ?? createExtensionWorkspaceApi();
  const views = dependencies.views ?? createExtensionViewsApi();
  const ownsLogger = dependencies.logger === undefined;
  const logger = dependencies.logger ?? dependencies.loggerFactory?.() ?? new OutputLogger(
    vscode.window.createOutputChannel("Claude Workspaces")
  );
  const updateLoggerLevel = (): void => {
    const value = workspaceApi.getConfiguration?.("claudeWorkspaces").get<unknown>("logLevel");
    logger.setLevel(parseLogLevel(value));
  };
  updateLoggerLevel();
  const currentWorkspace = (): WorkspaceModel =>
    WorkspaceModel.from(
      workspaceApi.workspaceFile,
      workspaceApi.workspaceFolders
    );
  const workspace = currentWorkspace();
  const setup =
    dependencies.setup ??
    new SetupController(
      new ConfigurationStore(context.workspaceState, (message) => {
        logger.configurationReset(new Error(message));
        console.error(message);
      }),
      createWorkspaceSetupPicker()
    );
  const notifications = dependencies.notifications ?? createNotificationsApi();
  const store = new ResumableSessionStore(context.workspaceState, (message) =>
    logger.configurationReset(new Error(message))
  );
  const now = dependencies.now ?? (() => Date.now());
  const manager = new SessionManager({
    ptyFactory: dependencies.ptyFactory ?? new NodePtyFactory(),
    createId: () => randomUUID(),
    now,
    logger,
    notifications: { notify: (notification) => controller?.notify(notification) }
  });
  const controller = new LaunchController({
    store,
    now,
    createClaudeSessionId: dependencies.createClaudeSessionId ?? (() => randomUUID()),
    claudeCapabilities: dependencies.claudeCapabilities ?? new ClaudeCapabilityProbe(createNodeClaudeHelpRunner()),
    manager,
    logger,
    setup,
    currentWorkspace,
    availability: dependencies.availability ?? createRootAvailability(),
    executable: dependencies.executable ?? (() =>
      vscode.workspace.getConfiguration("claudeWorkspaces").get<string>("claudeExecutable")
    ),
    selectRoot: dependencies.selectRoot ?? createRootSelector(),
    notifications,
    commands
  });

  let result;
  try {
    result = await activateWorkspace(workspace, {
      setContext: (key, value) =>
        commands.executeCommand("setContext", key, value),
      registerCommand: (commandId, handler) => commands.registerCommand(commandId, handler),
      onDidChangeWorkspaceFolders: (listener) =>
        workspaceApi.onDidChangeWorkspaceFolders(listener)
    }, {
      setup,
      currentWorkspace,
      reportSetupError: (error) =>
        dependencies.reportSetupError?.(error) ??
        console.error("Claude Workspaces setup failed.", error),
      commandHandlers: controller.commandHandlers
    });
  } catch (error) {
    manager.dispose();
    store.dispose();
    if (ownsLogger) {
      logger.dispose();
    }
    throw error;
  }

  activeSessionManager = manager;
  context.subscriptions.push(...result.disposables, logger, manager, store);
  const configurationListener = workspaceApi.onDidChangeConfiguration?.((event) => {
    if (event.affectsConfiguration("claudeWorkspaces.logLevel")) {
      updateLoggerLevel();
    }
  });
  if (configurationListener !== undefined) {
    context.subscriptions.push(configurationListener);
  }
  const lifecycle = dependencies.lifecycle ?? createExtensionLifecycleApi();
  context.subscriptions.push(registerEarlyShutdown(manager, lifecycle));
  if (dependencies.panelProvider === undefined) {
    const panelProvider = createSessionPanelProvider(
      context.extensionUri,
      manager,
      controller,
      store,
      logger,
      dependencies.terminalFont ?? readTerminalFontMetrics()
    );
    context.subscriptions.push(
      views.registerWebviewViewProvider(
        SESSION_VIEW_ID,
        panelProvider,
        SESSION_VIEW_REGISTRATION_OPTIONS
      ),
      panelProvider
    );
  } else {
    context.subscriptions.push(
      views.registerWebviewViewProvider(
        SESSION_VIEW_ID,
        dependencies.panelProvider,
        SESSION_VIEW_REGISTRATION_OPTIONS
      ),
      dependencies.panelProvider
    );
  }
  return { ...result.api, launchController: controller, resumableSessions: store };
}

export function deactivate(): Promise<void> | undefined {
  const manager = activeSessionManager;
  activeSessionManager = undefined;
  return manager?.terminateAll();
}

function createExtensionCommandsApi(): ExtensionCommandsApi {
  return {
    executeCommand: (commandId, ...args) =>
      vscode.commands.executeCommand(commandId, ...args),
    registerCommand: (commandId, handler) =>
      vscode.commands.registerCommand(commandId, handler)
  };
}

function createExtensionWorkspaceApi(): ExtensionWorkspaceApi {
  return {
    get workspaceFile() {
      return vscode.workspace.workspaceFile;
    },
    get workspaceFolders() {
      return vscode.workspace.workspaceFolders;
    },
    getConfiguration: (section) => vscode.workspace.getConfiguration(section),
    onDidChangeWorkspaceFolders: (listener) =>
      vscode.workspace.onDidChangeWorkspaceFolders(listener),
    onDidChangeConfiguration: (listener) =>
      vscode.workspace.onDidChangeConfiguration(listener)
  };
}

/** Creates the production adapter that registers VS Code webview-view providers. */
function createExtensionViewsApi(): ExtensionViewsApi {
  return {
    registerWebviewViewProvider: (viewId, provider, options) =>
      vscode.window.registerWebviewViewProvider(viewId, provider, options)
  };
}

/** Creates a UI-only provider until launch orchestration injects a live session-backed provider. */
function createSessionPanelProvider(
  extensionUri: vscode.Uri,
  manager: SessionManager,
  controller: LaunchController,
  store: ResumableSessionStore,
  logger: OutputLogger,
  terminalFont: TerminalFontMetrics
): SessionPanelProvider {
  return new SessionPanelProvider({
    extensionUri,
    sessions: manager,
    resumableSessions: store,
    checkConversationEligibility,
    terminalFont,
    sessionDetailsInitiallyExpanded: vscode.workspace
      .getConfiguration("claudeWorkspaces")
      .get<boolean>("sessionDetailsInitiallyExpanded", true),
    actions: {
      input: (id, data) => manager.write(id, data),
      resize: (id, columns, rows) => manager.resize(id, columns, rows),
      selectSession: (id) => manager.activate(id),
      renameSession: (id, displayName) => controller.renameSession(id, displayName),
      newSession: () => controller.launch({ rootMode: "default" }),
      newInFolder: () => controller.newInFolder(),
      resumeSession: (id) => controller.resumeSession(id),
      forgetSession: (id) => controller.forgetSession(id),
      closeSession: (id) => manager.close(id),
      restartFresh: (id) => controller.restartFresh(id),
      previousSession: () => manager.activatePrevious(),
      nextSession: () => manager.activateNext(),
      configureWorkspace: () => controller.configureWorkspace()
    },
    log: (message) => logger.startupError(new Error(message))
  });
}

/** Reads the same font inputs VS Code's integrated terminal uses for xterm cell measurement. */
function readTerminalFontMetrics(): TerminalFontMetrics {
  const terminal = vscode.workspace.getConfiguration("terminal.integrated");
  const editor = vscode.workspace.getConfiguration("editor");
  return resolveTerminalFontMetrics({
    terminalFontFamily: terminal.get<string>("fontFamily"),
    editorFontFamily: editor.get<string>("fontFamily"),
    fontSize: terminal.get<number>("fontSize"),
    letterSpacing: terminal.get<number>("letterSpacing"),
    lineHeight: terminal.get<number>("lineHeight"),
    platform: process.platform
  });
}

/** Minimal VS Code QuickPick boundary used by workspace setup. */
export interface WorkspaceSetupQuickInputApi {
  showQuickPick(
    items: readonly SetupQuickPickItem[],
    options: vscode.QuickPickOptions & { readonly canPickMany: true }
  ): Thenable<readonly SetupQuickPickItem[] | undefined>;
  createQuickPick(): vscode.QuickPick<SetupQuickPickItem>;
}

/** Creates the VS Code QuickPick sequence used to configure workspace access. */
export function createWorkspaceSetupPicker(
  quickInput: WorkspaceSetupQuickInputApi = createWorkspaceSetupQuickInputApi()
): WorkspaceSetupPicker {
  return {
    async chooseDefaultRoot(
      roots,
      initialSelection
    ): Promise<string | null | undefined> {
      const defaultItem: SetupQuickPickItem = {
        label: "Use the first workspace folder",
        description: roots[0]?.label,
        useFirstWorkspaceRoot: true
      };
      const rootItems = roots.map(toQuickPickItem);
      const items = [defaultItem, ...rootItems];
      const initialItem = initialSelection === null
        ? defaultItem
        : rootItems.find(({ rootId }) => rootId === initialSelection);
      const selected = await showSingleSelectionQuickPick(
        quickInput.createQuickPick(),
        items,
        initialItem,
        "Choose the default root for new Claude sessions"
      );
      if (selected === undefined) {
        return undefined;
      }
      return selected.useFirstWorkspaceRoot ? null : selected.rootId;
    },

    async chooseImports(
      source: WorkspaceSetupRoot,
      targets: readonly WorkspaceSetupRoot[],
      initialSelection: readonly string[]
    ): Promise<readonly string[] | undefined> {
      const selected = await quickInput.showQuickPick(
        withInitialSelections(targets.map(toQuickPickItem), initialSelection),
        {
          canPickMany: true,
          placeHolder: `Choose roots that ${source.label} may import`
        }
      );
      return selected?.flatMap(({ rootId }) => (rootId === undefined ? [] : [rootId]));
    }
  };
}

/** Adapts the VS Code window API to the setup picker's narrow input boundary. */
function createWorkspaceSetupQuickInputApi(): WorkspaceSetupQuickInputApi {
  return {
    showQuickPick: (items, options) => vscode.window.showQuickPick(items, options),
    createQuickPick: () => vscode.window.createQuickPick<SetupQuickPickItem>()
  };
}

/** Represents one root or safe-default option displayed by a setup QuickPick. */
interface SetupQuickPickItem extends vscode.QuickPickItem {
  readonly rootId?: string;
  readonly useFirstWorkspaceRoot?: true;
}

/** Converts a workspace root into a labeled setup QuickPick item. */
function toQuickPickItem(root: WorkspaceSetupRoot): SetupQuickPickItem {
  return {
    label: root.label,
    description: root.id,
    rootId: root.id
  };
}


/** Adapts VS Code notification presentation without leaking it into lifecycle code. */
function createNotificationsApi(): ExtensionNotificationsApi {
  return {
    showWarningMessage: (message, ...items) => vscode.window.showWarningMessage(message, ...items),
    showErrorMessage: (message, ...items) => vscode.window.showErrorMessage(message, ...items)
  };
}

/** Picks one current root for an explicit-folder launch. */
function createRootSelector(): (roots: readonly WorkspaceSetupRoot[]) => Promise<string | undefined> {
  return async (roots) => (await vscode.window.showQuickPick(roots.map(toQuickPickItem), {
    placeHolder: "Choose a workspace folder for the Claude session"
  }))?.rootId;
}

/** Checks root availability through the VS Code filesystem boundary. */
function createRootAvailability(): RootAvailability {
  return {
    timeoutMs: 5_000,
    maxConcurrency: 4,
    maxOutstandingProbes: 8,
    totalTimeoutMs: 10_000,
    isAvailable: async (root) => {
      await vscode.workspace.fs.stat(root.uri);
      return true;
    }
  };
}

/** Registers bounded early owned-session cleanup for process termination signals. */
function registerEarlyShutdown(
  manager: SessionManager,
  lifecycle: ExtensionLifecycleApi
): DisposableLike {
  let terminatingSignal: HostTerminationSignal | undefined;
  return lifecycle.onTerminationSignal((signal) => {
    if (terminatingSignal !== undefined) {
      return;
    }
    terminatingSignal = signal;
    let resumed = false;
    const resumeTermination = (): void => {
      if (resumed) {
        return;
      }
      resumed = true;
      timeout.dispose();
      lifecycle.reemit(signal);
    };
    const timeout = lifecycle.schedule(resumeTermination, EARLY_SHUTDOWN_TIMEOUT_MS);
    void manager.terminateAll().then(resumeTermination, resumeTermination);
  });
}

/** Bridges SIGINT/SIGTERM without retaining a handler after cleanup resumes termination. */
function createExtensionLifecycleApi(): ExtensionLifecycleApi {
  return {
    onTerminationSignal: (listener) => {
      const listeners: Array<{ signal: HostTerminationSignal; listener: () => void }> = [];
      for (const signal of ["SIGINT", "SIGTERM"] as const) {
        const signalListener = (): void => listener(signal);
        process.once(signal, signalListener);
        listeners.push({ signal, listener: signalListener });
      }
      return {
        dispose: () => {
          listeners.forEach(({ signal, listener: signalListener }) => {
            process.removeListener(signal, signalListener);
          });
        }
      };
    },
    schedule: (callback, delayMs) => {
      const timeout = setTimeout(callback, delayMs);
      return { dispose: () => clearTimeout(timeout) };
    },
    reemit: (signal) => process.kill(process.pid, signal)
  };
}
