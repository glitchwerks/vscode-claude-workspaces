import assert from "node:assert/strict";
import type { Uri, WorkspaceFolder } from "vscode";

import {
  activateWorkspace,
  type ActivationHost,
  type ActivationOptions,
  type DisposableLike
} from "../../src/activation";
import { WorkspaceModel } from "../../src/workspace/workspaceModel";

class RecordingHost implements ActivationHost {
  readonly contexts: Array<{ key: string; value: boolean }> = [];
  readonly handlers = new Map<string, () => void>();

  async setContext(key: string, value: boolean): Promise<void> {
    this.contexts.push({ key, value });
  }

  registerCommand(commandId: string, handler: () => void): DisposableLike {
    this.handlers.set(commandId, handler);
    return { dispose: () => undefined };
  }
}

function uri(value: string): Uri {
  return {
    scheme: value.slice(0, value.indexOf(":")),
    toString: () => value
  } as Uri;
}

function folder(): WorkspaceFolder {
  return {
    index: 0,
    name: "alpha",
    uri: uri("file:///projects/alpha")
  };
}

describe("activation orchestration", () => {
  it("sets the saved-workspace context to the computed eligibility", async () => {
    const host = new RecordingHost();
    const workspace = WorkspaceModel.from(
      uri("file:///projects/group.code-workspace"),
      [folder()]
    );

    const result = await activateWorkspace(workspace, host);

    assert.deepEqual(host.contexts, [
      { key: "claudeWorkspaces.savedWorkspace", value: true }
    ]);
    assert.deepEqual(result.api, { savedWorkspace: true });
  });

  it("sets the saved-workspace context false for a folder window", async () => {
    const host = new RecordingHost();
    const workspace = WorkspaceModel.from(undefined, [folder()]);

    const result = await activateWorkspace(workspace, host);

    assert.deepEqual(host.contexts, [
      { key: "claudeWorkspaces.savedWorkspace", value: false }
    ]);
    assert.deepEqual(result.api, { savedWorkspace: false });
  });

  it("registers every approved command handler", async () => {
    const host = new RecordingHost();
    const workspace = WorkspaceModel.from(undefined, []);

    const result = await activateWorkspace(workspace, host);

    assert.deepEqual([...host.handlers.keys()], [
      "claudeWorkspaces.newSession",
      "claudeWorkspaces.newInFolder",
      "claudeWorkspaces.closeSession",
      "claudeWorkspaces.restartFresh",
      "claudeWorkspaces.previousSession",
      "claudeWorkspaces.nextSession",
      "claudeWorkspaces.configureWorkspace"
    ]);
    assert.equal(result.disposables.length, 7);
  });

  it("reports a rejected automatic setup task", async () => {
    const host = new RecordingHost();
    const workspace = WorkspaceModel.from(
      uri("file:///projects/group.code-workspace"),
      [folder()]
    );
    const setupError = new Error("workspace state update failed");
    const reportedErrors: unknown[] = [];
    const options = {
      setup: {
        ensureConfigured: async () => {
          throw setupError;
        },
        configure: async () => undefined
      },
      reportSetupError: (error: unknown) => reportedErrors.push(error)
    } as ActivationOptions & {
      reportSetupError(error: unknown): void;
    };

    await activateWorkspace(workspace, host, options);
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(reportedErrors, [setupError]);
  });
});
