import * as vscode from "vscode";

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
import { OutputLogger } from "./logging/outputLogger";
import {
  SessionPanelProvider,
  SESSION_VIEW_ID,
  type SessionPanelActions,
  type SessionPanelSessionSource
} from "./panel/sessionPanelProvider";
import { WorkspaceModel } from "./workspace/workspaceModel";

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

export interface ExtensionActivationDependencies {
  readonly commands?: ExtensionCommandsApi;
  readonly workspace?: ExtensionWorkspaceApi;
  readonly setup?: WorkspaceSetupService;
  readonly logger?: OutputLogger;
  readonly loggerFactory?: () => OutputLogger;
  readonly reportSetupError?: (error: unknown) => void;
  readonly views?: ExtensionViewsApi;
  readonly panelProvider?: vscode.WebviewViewProvider;
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
        console.error("Claude Workspaces setup failed.", error)
    });
  } catch (error) {
    if (ownsLogger) {
      logger.dispose();
    }
    throw error;
  }

  context.subscriptions.push(...result.disposables, logger);
  if (workspace.isEligible) {
    if (dependencies.panelProvider === undefined) {
      const panelProvider = createEmptySessionPanelProvider(context.extensionUri);
      context.subscriptions.push(
        views.registerWebviewViewProvider(SESSION_VIEW_ID, panelProvider),
        panelProvider
      );
    } else {
      context.subscriptions.push(
        views.registerWebviewViewProvider(SESSION_VIEW_ID, dependencies.panelProvider)
      );
    }
  }
  return result.api;
}

export function deactivate(): void {}

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
function createEmptySessionPanelProvider(extensionUri: vscode.Uri): SessionPanelProvider {
  return new SessionPanelProvider({
    extensionUri,
    sessions: emptySessionSource,
    actions: emptyPanelActions,
    log: (message) => console.warn(message)
  });
}

/** Supplies no live sessions while preserving the provider's process-free source boundary. */
const emptySessionSource: SessionPanelSessionSource = {
  sessions: [],
  activeSessionId: undefined,
  onDidChangeSessions: () => ({ dispose: () => undefined }),
  onDidReceiveData: () => ({ dispose: () => undefined })
};

/** Keeps Task 5 action dispatch inert until Task 6 injects launch orchestration. */
const emptyPanelActions: SessionPanelActions = {
  input: () => undefined,
  resize: () => undefined,
  selectSession: () => undefined,
  newSession: () => undefined,
  newInFolder: () => undefined,
  closeSession: () => undefined,
  restartFresh: () => undefined,
  previousSession: () => undefined,
  nextSession: () => undefined,
  configureWorkspace: () => undefined
};

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
