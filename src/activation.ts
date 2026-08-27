import type { WorkspaceModel } from "./workspace/workspaceModel";
import type { WorkspaceSetupRoot } from "./config/setupController";

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
  registerCommand(
    commandId: string,
    handler: () => unknown | PromiseLike<unknown>
  ): DisposableLike;
  onDidChangeWorkspaceFolders?(
    listener: () => unknown | PromiseLike<unknown>
  ): DisposableLike;
}

/** Configuration behavior used by activation without coupling it to VS Code UI. */
export interface WorkspaceSetupService {
  ensureConfigured(roots: readonly WorkspaceSetupRoot[]): PromiseLike<unknown>;
  configure(roots: readonly WorkspaceSetupRoot[]): PromiseLike<unknown>;
}

/** Optional workspace-configuration dependencies for activation. */
export interface ActivationOptions {
  readonly setup?: WorkspaceSetupService;
  readonly currentWorkspace?: () => WorkspaceModel;
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
  host: ActivationHost,
  options: ActivationOptions = {}
): Promise<ActivationResult> {
  await host.setContext(SAVED_WORKSPACE_CONTEXT, workspace.isEligible);

  const currentWorkspace = options.currentWorkspace ?? (() => workspace);
  const setup = options.setup;
  const disposables = COMMAND_IDS.map((commandId) =>
    host.registerCommand(commandId, () => {
      if (commandId !== "claudeWorkspaces.configureWorkspace" || setup === undefined) {
        return undefined;
      }
      return setup.configure(currentWorkspace().roots);
    })
  );

  if (workspace.isEligible && setup !== undefined) {
    void setup.ensureConfigured(workspace.roots);
    const folderChangeDisposable = host.onDidChangeWorkspaceFolders?.(() => {
      const changedWorkspace = currentWorkspace();
      return changedWorkspace.isEligible
        ? setup.ensureConfigured(changedWorkspace.roots)
        : undefined;
    });
    if (folderChangeDisposable !== undefined) {
      disposables.push(folderChangeDisposable);
    }
  }

  return {
    api: { savedWorkspace: workspace.isEligible },
    disposables
  };
}
