import assert from "node:assert/strict";

import * as vscode from "vscode";
import type { Uri, WorkspaceFolder } from "vscode";

import {
  activateWorkspace,
  type ActivationHost,
  type DisposableLike
} from "../../src/activation";
import { WorkspaceModel } from "../../src/workspace/workspaceModel";

interface ClaudeWorkspacesApi {
  readonly savedWorkspace: boolean;
}

const COMMAND_IDS = [
  "claudeWorkspaces.newSession",
  "claudeWorkspaces.newInFolder",
  "claudeWorkspaces.closeSession",
  "claudeWorkspaces.restartFresh",
  "claudeWorkspaces.previousSession",
  "claudeWorkspaces.nextSession",
  "claudeWorkspaces.configureWorkspace"
] as const;

class SetupRecordingHost implements ActivationHost {
  private folderChangeListener: (() => Promise<void>) | undefined;
  readonly handlers = new Map<string, () => unknown | PromiseLike<unknown>>();

  async setContext(): Promise<void> {}

  registerCommand(
    commandId: string,
    handler: () => unknown | PromiseLike<unknown>
  ): DisposableLike {
    this.handlers.set(commandId, handler);
    return { dispose: () => undefined };
  }

  onDidChangeWorkspaceFolders(listener: () => Promise<void>): DisposableLike {
    this.folderChangeListener = listener;
    return { dispose: () => undefined };
  }

  async fireFolderChange(): Promise<void> {
    await this.folderChangeListener?.();
  }
}

function uri(value: string): Uri {
  return {
    scheme: "file",
    toString: () => value
  } as Uri;
}

function folder(name: string, value: string, index: number): WorkspaceFolder {
  return { index, name, uri: uri(value) };
}

describe("activation boundary", () => {
  it("reports eligibility for the current window", async () => {
    const extension = vscode.extensions.getExtension<ClaudeWorkspacesApi>(
      "glitchwerks.vscode-claude-workspaces"
    );

    assert.ok(extension, "Claude Workspaces extension was not discovered");

    const api = await extension.activate();
    const expected = vscode.workspace.workspaceFile?.scheme === "file";

    assert.equal(extension.isActive, true);
    assert.equal(api.savedWorkspace, expected);
  });

  it("contributes the approved command identifiers", async () => {
    const commands = await vscode.commands.getCommands(true);

    for (const commandId of COMMAND_IDS) {
      assert.ok(commands.includes(commandId), `${commandId} was not contributed`);
    }
  });

  it("invokes injected setup on first load and after roots change", async () => {
    const host = new SetupRecordingHost();
    const configuredRootSets: string[][] = [];
    let currentWorkspace = WorkspaceModel.from(
      uri("file:///projects/group.code-workspace"),
      [folder("alpha", "file:///projects/alpha", 0)]
    );

    await activateWorkspace(currentWorkspace, host, {
      setup: {
        ensureConfigured: async (roots) => {
          configuredRootSets.push(roots.map(({ id }) => id));
        },
        configure: async () => undefined
      },
      currentWorkspace: () => currentWorkspace
    });

    currentWorkspace = WorkspaceModel.from(
      uri("file:///projects/group.code-workspace"),
      [
        folder("alpha", "file:///projects/alpha", 0),
        folder("beta", "file:///projects/beta", 1)
      ]
    );
    await host.fireFolderChange();

    assert.deepEqual(configuredRootSets, [
      ["file:///projects/alpha"],
      ["file:///projects/alpha", "file:///projects/beta"]
    ]);
  });

  it("does not configure an ineligible folder window from its command", async () => {
    const host = new SetupRecordingHost();
    let configureCalls = 0;
    const folderWorkspace = WorkspaceModel.from(undefined, [
      folder("alpha", "file:///projects/alpha", 0)
    ]);

    await activateWorkspace(folderWorkspace, host, {
      setup: {
        ensureConfigured: async () => undefined,
        configure: async () => {
          configureCalls += 1;
        }
      },
      currentWorkspace: () => folderWorkspace
    });

    const configureCommand = host.handlers.get(
      "claudeWorkspaces.configureWorkspace"
    );
    assert.ok(configureCommand, "Configure Workspace command was not registered");
    await configureCommand();

    assert.equal(configureCalls, 0);
  });
});
