import * as vscode from "vscode";

import { WorkspaceModel } from "./workspace/workspaceModel";

const SAVED_WORKSPACE_CONTEXT = "claudeWorkspaces.savedWorkspace";

const COMMAND_IDS = [
  "claudeWorkspaces.newSession",
  "claudeWorkspaces.newInFolder",
  "claudeWorkspaces.closeSession",
  "claudeWorkspaces.restartFresh",
  "claudeWorkspaces.previousSession",
  "claudeWorkspaces.nextSession",
  "claudeWorkspaces.configureWorkspace"
] as const;

export interface ClaudeWorkspacesApi {
  readonly savedWorkspace: boolean;
}

export async function activate(
  context: vscode.ExtensionContext
): Promise<ClaudeWorkspacesApi> {
  const workspace = WorkspaceModel.from(
    vscode.workspace.workspaceFile,
    vscode.workspace.workspaceFolders
  );

  await vscode.commands.executeCommand(
    "setContext",
    SAVED_WORKSPACE_CONTEXT,
    workspace.isEligible
  );

  for (const commandId of COMMAND_IDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(commandId, () => undefined)
    );
  }

  return { savedWorkspace: workspace.isEligible };
}

export function deactivate(): void {}
