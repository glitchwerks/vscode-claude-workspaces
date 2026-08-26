import * as vscode from "vscode";

import {
  activateWorkspace,
  type ClaudeWorkspacesApi
} from "./activation";
import { WorkspaceModel } from "./workspace/workspaceModel";

export async function activate(
  context: vscode.ExtensionContext
): Promise<ClaudeWorkspacesApi> {
  const workspace = WorkspaceModel.from(
    vscode.workspace.workspaceFile,
    vscode.workspace.workspaceFolders
  );

  const result = await activateWorkspace(workspace, {
    setContext: (key, value) =>
      vscode.commands.executeCommand("setContext", key, value),
    registerCommand: (commandId, handler) =>
      vscode.commands.registerCommand(commandId, handler)
  });

  context.subscriptions.push(...result.disposables);
  return result.api;
}

export function deactivate(): void {}
