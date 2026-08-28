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

export interface ExtensionActivationDependencies {
  readonly commands?: ExtensionCommandsApi;
  readonly workspace?: ExtensionWorkspaceApi;
  readonly setup?: WorkspaceSetupService;
  readonly logger?: OutputLogger;
  readonly loggerFactory?: () => OutputLogger;
  readonly reportSetupError?: (error: unknown) => void;
}

/** Activates through injectable VS Code boundaries used by extension-host tests. */
export async function activateWithDependencies(
  context: vscode.ExtensionContext,
  dependencies: ExtensionActivationDependencies = {}
): Promise<ClaudeWorkspacesApi> {
  const commands = dependencies.commands ?? createExtensionCommandsApi();
  const workspaceApi = dependencies.workspace ?? createExtensionWorkspaceApi();
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
