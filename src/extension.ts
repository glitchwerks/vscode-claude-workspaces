import * as vscode from "vscode";
import { randomUUID } from "node:crypto";

import {
  activateWorkspace,
  type ClaudeWorkspacesApi,
  type DisposableLike,
  type WorkspaceSetupService,
  type ClaudeWorkspacesCommandId
} from "./activation";
import { ConfigurationStore } from "./config/configurationStore";
import type { WorkspaceConfigV1 } from "./config/workspaceConfig";
import {
  SetupController,
  type WorkspaceSetupPicker,
  type WorkspaceSetupRoot
} from "./config/setupController";
import { OutputLogger } from "./logging/outputLogger";
import { type LaunchRequest, type RootAvailability, planLaunch } from "./launch/launchPlanner";
import { type ManagedPtyFactory } from "./launch/managedPty";
import { NodePtyFactory } from "./launch/nodePtyAdapter";
import {
  SessionPanelProvider,
  SESSION_VIEW_ID
} from "./panel/sessionPanelProvider";
import { WorkspaceModel } from "./workspace/workspaceModel";
import { SessionManager } from "./sessions/sessionManager";
import type { SessionNotification } from "./sessions/sessionTypes";

let activeSessionManager: SessionManager | undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<ClaudeWorkspacesApi> {
  return activateWithDependencies(context);
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
  onDidChangeWorkspaceFolders(
    listener: () => unknown | PromiseLike<unknown>
  ): DisposableLike;
}

/** Registers the session panel through an injectable VS Code view boundary. */
export interface ExtensionViewsApi {
  registerWebviewViewProvider(
    viewId: string,
    provider: vscode.WebviewViewProvider
  ): DisposableLike;
}

/** An injected panel provider whose lifecycle activation adopts with the extension context. */
export interface OwnedPanelProvider extends vscode.WebviewViewProvider, vscode.Disposable {}

export interface ExtensionActivationDependencies {
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
}

/** Presentation boundary for launch feedback. */
export interface ExtensionNotificationsApi {
  showWarningMessage(message: string, ...items: string[]): PromiseLike<string | undefined>;
  showErrorMessage(message: string, ...items: string[]): PromiseLike<string | undefined>;
}

/** Explicit host shutdown signals that initiate owned PTY cleanup before disposal. */
export interface ExtensionLifecycleApi {
  onWillShutdown(listener: () => void): DisposableLike;
}

/** Activates through injectable VS Code boundaries used by extension-host tests. */
export async function activateWithDependencies(
  context: vscode.ExtensionContext,
  dependencies: ExtensionActivationDependencies = {}
): Promise<ClaudeWorkspacesApi> {
  const commands = dependencies.commands ?? createExtensionCommandsApi();
  const workspaceApi = dependencies.workspace ?? createExtensionWorkspaceApi();
  const views = dependencies.views ?? createExtensionViewsApi();
  const ownsLogger = dependencies.logger === undefined;
  const logger = dependencies.logger ?? dependencies.loggerFactory?.() ?? new OutputLogger(
    vscode.window.createOutputChannel("Claude Workspaces")
  );
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
  const manager = new SessionManager({
    ptyFactory: dependencies.ptyFactory ?? new NodePtyFactory(),
    createId: () => randomUUID(),
    now: () => Date.now(),
    logger,
    notifications: { notify: (notification) => controller?.notify(notification) }
  });
  const controller = new LaunchController({
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
    if (ownsLogger) {
      logger.dispose();
    }
    throw error;
  }

  activeSessionManager = manager;
  context.subscriptions.push(...result.disposables, logger, manager);
  const lifecycle = dependencies.lifecycle ?? createExtensionLifecycleApi();
  context.subscriptions.push(lifecycle.onWillShutdown(() => void manager.terminateAll()));
  if (dependencies.panelProvider === undefined) {
    const panelProvider = createSessionPanelProvider(context.extensionUri, manager, controller, logger);
    context.subscriptions.push(
      views.registerWebviewViewProvider(SESSION_VIEW_ID, panelProvider),
      panelProvider
    );
  } else {
    context.subscriptions.push(
      views.registerWebviewViewProvider(SESSION_VIEW_ID, dependencies.panelProvider),
      dependencies.panelProvider
    );
  }
  return result.api;
}

export function deactivate(): void {
  void activeSessionManager?.terminateAll();
  activeSessionManager = undefined;
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
    onDidChangeWorkspaceFolders: (listener) =>
      vscode.workspace.onDidChangeWorkspaceFolders(listener)
  };
}

/** Creates the production adapter that registers VS Code webview-view providers. */
function createExtensionViewsApi(): ExtensionViewsApi {
  return {
    registerWebviewViewProvider: (viewId, provider) =>
      vscode.window.registerWebviewViewProvider(viewId, provider)
  };
}

/** Creates a UI-only provider until launch orchestration injects a live session-backed provider. */
function createSessionPanelProvider(
  extensionUri: vscode.Uri,
  manager: SessionManager,
  controller: LaunchController,
  logger: OutputLogger
): SessionPanelProvider {
  return new SessionPanelProvider({
    extensionUri,
    sessions: manager,
    actions: {
      input: (id, data) => manager.write(id, data),
      resize: (id, columns, rows) => manager.resize(id, columns, rows),
      selectSession: (id) => manager.activate(id),
      newSession: () => controller.launch({ rootMode: "default" }),
      newInFolder: () => controller.newInFolder(),
      closeSession: (id) => manager.close(id),
      restartFresh: (id) => controller.restartFresh(id),
      previousSession: () => manager.activatePrevious(),
      nextSession: () => manager.activateNext(),
      configureWorkspace: () => controller.configureWorkspace()
    },
    log: (message) => logger.startupError(new Error(message))
  });
}

/** Creates the VS Code QuickPick sequence used to configure workspace access. */
function createWorkspaceSetupPicker(): WorkspaceSetupPicker {
  return {
    async chooseDefaultRoot(roots): Promise<string | null | undefined> {
      const defaultItem: SetupQuickPickItem = {
        label: "Use the first workspace folder",
        description: roots[0]?.label,
        useFirstWorkspaceRoot: true
      };
      const rootItems = roots.map(toQuickPickItem);
      const selected = await vscode.window.showQuickPick(
        [defaultItem, ...rootItems],
        {
          placeHolder: "Choose the default root for new Claude sessions"
        }
      );
      if (selected === undefined) {
        return undefined;
      }
      return selected.useFirstWorkspaceRoot ? null : selected.rootId;
    },

    async chooseImports(
      source: WorkspaceSetupRoot,
      targets: readonly WorkspaceSetupRoot[]
    ): Promise<readonly string[] | undefined> {
      const selected = await vscode.window.showQuickPick(targets.map(toQuickPickItem), {
        canPickMany: true,
        placeHolder: `Choose roots that ${source.label} may import`
      });
      return selected?.flatMap(({ rootId }) => (rootId === undefined ? [] : [rootId]));
    }
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

interface LaunchControllerDependencies {
  readonly manager: SessionManager;
  readonly logger: OutputLogger;
  readonly setup: WorkspaceSetupService;
  readonly currentWorkspace: () => WorkspaceModel;
  readonly availability: RootAvailability;
  readonly executable: () => string | undefined;
  readonly selectRoot: (roots: readonly WorkspaceSetupRoot[]) => Promise<string | undefined>;
  readonly notifications: ExtensionNotificationsApi;
  readonly commands: ExtensionCommandsApi;
}

/** Resolves current workspace configuration into owned Claude session launches. */
class LaunchController {
  readonly commandHandlers: Partial<Record<ClaudeWorkspacesCommandId, () => unknown | PromiseLike<unknown>>>;
  private readonly requestsBySpec = new WeakMap<object, LaunchRequest>();

  constructor(private readonly dependencies: LaunchControllerDependencies) {
    this.commandHandlers = {
      "claudeWorkspaces.newSession": () => this.launch({ rootMode: "default" }),
      "claudeWorkspaces.newInFolder": () => this.newInFolder(),
      "claudeWorkspaces.closeSession": () => this.closeActive(),
      "claudeWorkspaces.restartFresh": () => this.restartActive(),
      "claudeWorkspaces.previousSession": () => this.dependencies.manager.activatePrevious(),
      "claudeWorkspaces.nextSession": () => this.dependencies.manager.activateNext(),
      "claudeWorkspaces.configureWorkspace": () => this.configureWorkspace()
    };
  }

  async launch(request: LaunchRequest): Promise<void> {
    const plan = await this.plan(request);
    if (plan === undefined) {
      return;
    }
    this.requestsBySpec.set(plan, request);
    await this.dependencies.manager.launch(plan);
  }

  async newInFolder(): Promise<void> {
    const workspace = this.dependencies.currentWorkspace();
    if (!workspace.isEligible) {
      return;
    }
    const selectedRootId = await this.dependencies.selectRoot(workspace.roots);
    if (selectedRootId !== undefined) {
      await this.launch({ rootMode: "explicit", explicitRoot: selectedRootId });
    }
  }

  async closeActive(): Promise<void> {
    const id = this.dependencies.manager.activeSessionId;
    if (id !== undefined) {
      await this.dependencies.manager.close(id);
    }
  }

  async restartActive(): Promise<void> {
    const id = this.dependencies.manager.activeSessionId;
    if (id !== undefined) {
      await this.restartFresh(id);
    }
  }

  async restartFresh(id: string): Promise<void> {
    const session = this.dependencies.manager.sessions.find((candidate) => candidate.id === id);
    if (session === undefined) {
      return;
    }
    await this.dependencies.manager.restartFresh(id, async () => {
      const spec = await this.plan({ rootMode: "explicit", explicitRoot: session.rootId });
      if (spec === undefined) {
        throw new Error("Unable to plan a fresh Claude session.");
      }
      return spec;
    });
  }

  async configureWorkspace(): Promise<void> {
    const workspace = this.dependencies.currentWorkspace();
    if (workspace.isEligible) {
      await this.dependencies.setup.configure(workspace.roots);
    }
  }

  notify(notification: SessionNotification): void {
    const request = this.requestsBySpec.get(notification.spec);
    if (notification.kind === "startup-failed" && isExecutableMissing(notification.error)) {
      void this.handleAction(
        this.dependencies.notifications.showErrorMessage(
          "Claude executable was not found.",
          "Configure Executable",
          "Open Logs"
        ),
        undefined
      );
      return;
    }
    void this.handleAction(
      this.dependencies.notifications.showErrorMessage(
        notification.kind === "startup-failed"
          ? "Claude session failed to start."
          : "Claude session exited immediately.",
        "Retry",
        "Open Logs"
      ),
      request
    );
  }

  private async plan(request: LaunchRequest) {
    const workspace = this.dependencies.currentWorkspace();
    if (!workspace.isEligible) {
      return undefined;
    }
    const config = await this.dependencies.setup.ensureConfigured(workspace.roots) as WorkspaceConfigV1;
    const executable = this.dependencies.executable()?.trim() || undefined;
    const result = await planLaunch(
      request,
      workspace.roots,
      config,
      executable,
      process.env,
      this.dependencies.availability
    );
    if (result.kind === "error") {
      this.reportPlanError(result.error.kind, request.rootMode === "explicit");
      return undefined;
    }
    result.warnings.forEach((warning) => {
      const message = warning.kind === "default-root-unavailable"
        ? "The configured default root is unavailable; using the first available root."
        : `${warning.skippedRootIds.length} configured import root(s) are unavailable.`;
      void this.dependencies.notifications.showWarningMessage(message);
    });
    this.dependencies.logger.launchPlan(result.spec);
    if (result.spec.skippedImportIds.length > 0) {
      this.dependencies.logger.skippedImports(result.spec.root.id, result.spec.skippedImportIds);
    }
    return result.spec;
  }

  private reportPlanError(kind: string, explicit: boolean): void {
    if (explicit && kind === "root-unavailable") {
      void this.handleAction(
        this.dependencies.notifications.showErrorMessage(
          "The selected workspace root is unavailable.",
          "Configure Workspace"
        ),
        undefined
      );
      return;
    }
    void this.dependencies.notifications.showErrorMessage("No workspace root is available for a Claude session.");
  }

  private async handleAction(
    response: PromiseLike<string | undefined>,
    retryRequest: LaunchRequest | undefined
  ): Promise<void> {
    const action = await response;
    if (action === "Retry" && retryRequest !== undefined) {
      await this.launch(retryRequest);
    } else if (action === "Configure Executable") {
      await this.dependencies.commands.executeCommand(
        "workbench.action.openSettings",
        "claudeWorkspaces.claudeExecutable"
      );
    } else if (action === "Configure Workspace") {
      await this.configureWorkspace();
    } else if (action === "Open Logs") {
      this.dependencies.logger.show();
    }
  }
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
    isAvailable: async (root) => {
      await vscode.workspace.fs.stat(root.uri);
      return true;
    }
  };
}

/** Begins shutdown on process-level extension-host termination signals. */
function createExtensionLifecycleApi(): ExtensionLifecycleApi {
  return {
    onWillShutdown: (listener) => {
      const signalListener = (): void => listener();
      process.once("SIGTERM", signalListener);
      process.once("SIGINT", signalListener);
      return {
        dispose: () => {
          process.removeListener("SIGTERM", signalListener);
          process.removeListener("SIGINT", signalListener);
        }
      };
    }
  };
}

function isExecutableMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "ENOENT";
}
