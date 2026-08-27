import * as vscode from "vscode";

import {
  activateWorkspace,
  type ClaudeWorkspacesApi
} from "./activation";
import { ConfigurationStore } from "./config/configurationStore";
import {
  SetupController,
  type WorkspaceSetupPicker,
  type WorkspaceSetupRoot
} from "./config/setupController";
import { WorkspaceModel } from "./workspace/workspaceModel";

export async function activate(
  context: vscode.ExtensionContext
): Promise<ClaudeWorkspacesApi> {
  const currentWorkspace = (): WorkspaceModel =>
    WorkspaceModel.from(
      vscode.workspace.workspaceFile,
      vscode.workspace.workspaceFolders
    );
  const workspace = currentWorkspace();
  const setup = new SetupController(
    new ConfigurationStore(context.workspaceState, (message) => console.error(message)),
    createWorkspaceSetupPicker()
  );

  const result = await activateWorkspace(workspace, {
    setContext: (key, value) =>
      vscode.commands.executeCommand("setContext", key, value),
    registerCommand: (commandId, handler) =>
      vscode.commands.registerCommand(commandId, handler),
    onDidChangeWorkspaceFolders: (listener) =>
      vscode.workspace.onDidChangeWorkspaceFolders(() => listener())
  }, {
    setup,
    currentWorkspace,
    reportSetupError: (error) =>
      console.error("Claude Workspaces setup failed.", error)
  });

  context.subscriptions.push(...result.disposables);
  return result.api;
}

export function deactivate(): void {}

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
