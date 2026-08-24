import type { WorkspaceModel } from "./workspace/workspaceModel";

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

export interface DisposableLike {
  dispose(): void;
}

export interface ActivationHost {
  setContext(key: string, value: boolean): PromiseLike<unknown>;
  registerCommand(commandId: string, handler: () => void): DisposableLike;
}

export interface ClaudeWorkspacesApi {
  readonly savedWorkspace: boolean;
}

export interface ActivationResult {
  readonly api: ClaudeWorkspacesApi;
  readonly disposables: readonly DisposableLike[];
}

export async function activateWorkspace(
  workspace: WorkspaceModel,
  host: ActivationHost
): Promise<ActivationResult> {
  await host.setContext(SAVED_WORKSPACE_CONTEXT, workspace.isEligible);

  const disposables = COMMAND_IDS.map((commandId) =>
    host.registerCommand(commandId, () => undefined)
  );

  return {
    api: { savedWorkspace: workspace.isEligible },
    disposables
  };
}
