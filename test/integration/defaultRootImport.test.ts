import assert from "node:assert/strict";
import * as vscode from "vscode";

import { ConfigurationStore } from "../../src/config/configurationStore";
import { SetupController } from "../../src/config/setupController";
import { activateWithDependencies, createWorkspaceSetupPicker, deactivate, type WorkspaceSetupQuickInputApi } from "../../src/extension";
import { OutputLogger } from "../../src/logging/outputLogger";
import { FakeManagedPtyFactory } from "../support/fakeManagedPty";
import { MemoryMemento } from "../support/memoryMemento";

describe("default-root import integration", () => {
  for (const enabled of [true, false]) {
    it(`preselects and accepts the ${enabled ? "enabled" : "disabled"} workspace import option`, async () => {
      type QuickPick = ReturnType<WorkspaceSetupQuickInputApi["createQuickPick"]>;
      const accept = new vscode.EventEmitter<void>();
      const hide = new vscode.EventEmitter<void>();
      const state = {
        items: [] as QuickPick["items"], activeItems: [] as QuickPick["activeItems"],
        selectedItems: [] as QuickPick["selectedItems"], placeholder: undefined,
        onDidAccept: accept.event, onDidHide: hide.event,
        show: () => undefined, hide: () => hide.fire(),
        dispose: () => { accept.dispose(); hide.dispose(); }
      };
      const picker = createWorkspaceSetupPicker({
        createQuickPick: () => state as unknown as QuickPick,
        showQuickPick: async () => []
      });
      const selection = picker.chooseDefaultRootImport(enabled);
      assert.equal(state.activeItems[0]?.autoDefaultRootImport, enabled);
      state.selectedItems = state.items.filter(item => item.autoDefaultRootImport === !enabled);
      accept.fire();
      assert.equal(await selection, !enabled, "accepting disabled must return false, not cancellation");
    });
  }

  for (const scenario of ["new", "disabled", "self", "duplicate", "migrated"] as const) {
    it(`delivers ${scenario} default-root imports through activation and managed launch`, async () => {
      const folders = ["alpha", "beta", "gamma"].map((name, index) => ({
        name, index, uri: vscode.Uri.file(`C:/work/${name}`)
      }));
      const rootIds = folders.map(root => root.uri.toString(true));
      const alpha = rootIds[0]!;
      const beta = rootIds[1]!;
      const gamma = rootIds[2]!;
      const state = new MemoryMemento();
      if (scenario !== "new") {
        await state.update("claudeWorkspaces.config", {
          schemaVersion: scenario === "migrated" ? 1 : 2,
          ...(scenario === "migrated" ? {} : { autoDefaultRootImport: scenario !== "disabled" }),
          configuredRoots: rootIds,
          importsByRoot: { [alpha]: [], [beta]: scenario === "duplicate" ? [alpha, gamma] : scenario === "migrated" ? [gamma] : [], [gamma]: [] }
        });
      }
      const setup = new SetupController(new ConfigurationStore(state, () => assert.fail("valid state must not be reset")), {
        chooseDefaultRoot: async () => null,
        chooseDefaultRootImport: async initial => initial,
        chooseImports: async (_source, _targets, initial) => initial
      });
      const handlers = new Map<string, () => unknown | PromiseLike<unknown>>();
      const ptys = new FakeManagedPtyFactory();
      const context = { subscriptions: [], workspaceState: state,
        extensionUri: vscode.Uri.file("C:/extensions/claude-workspaces") } as unknown as vscode.ExtensionContext;
      try {
        await activateWithDependencies(context, {
          commands: { executeCommand: async () => undefined,
            registerCommand: (name, handler) => { handlers.set(name, handler); return { dispose: () => handlers.delete(name) }; } },
          workspace: { workspaceFile: vscode.Uri.file("C:/work/group.code-workspace"), workspaceFolders: folders,
            onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined }) },
          views: { registerWebviewViewProvider: () => ({ dispose: () => undefined }) },
          setup, ptyFactory: ptys, selectRoot: async () => scenario === "self" ? alpha : beta,
          availability: { timeoutMs: 100, maxConcurrency: 3, maxOutstandingProbes: 3, totalTimeoutMs: 500,
            isAvailable: async () => true },
          logger: new OutputLogger({ appendLine: () => undefined, show: () => undefined, dispose: () => undefined } as unknown as vscode.OutputChannel),
          claudeCapabilities: { get: async () => ({ sessionPersistence: false, settingsFile: false }) },
          attentionHost: { platform: "linux", processId: 1 },
          lifecycle: { onTerminationSignal: () => ({ dispose: () => undefined }),
            schedule: () => ({ dispose: () => undefined }), reemit: () => undefined }
        });
        await handlers.get("claudeWorkspaces.newInFolder")?.();
        const expected = scenario === "new" ? [folders[0]!.uri.fsPath]
          : scenario === "duplicate" ? [folders[0]!.uri.fsPath, folders[2]!.uri.fsPath]
          : scenario === "migrated" ? [folders[2]!.uri.fsPath] : [];
        assert.equal(ptys.spawnedSpecs.length, 1);
        assert.deepEqual(ptys.spawnedSpecs[0]!.args, expected.flatMap(root => ["--add-dir", root]));
        assert.deepEqual(state.get("claudeWorkspaces.config"), {
          schemaVersion: 2, autoDefaultRootImport: scenario === "new" || scenario === "self" || scenario === "duplicate",
          configuredRoots: rootIds,
          importsByRoot: { [alpha]: [], [beta]: scenario === "duplicate" ? [alpha, gamma] : scenario === "migrated" ? [gamma] : [], [gamma]: [] }
        });
      } finally {
        await deactivate();
        context.subscriptions.forEach(subscription => subscription.dispose());
      }
    });
  }
});
