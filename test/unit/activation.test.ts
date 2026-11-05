import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
  it("allows stopping terminal capture after eligibility loss but guards starting", async () => {
    const host = new RecordingHost();
    let workspace = WorkspaceModel.from(uri("file:///projects/group.code-workspace"), []);
    let active = false;
    let calls = 0;
    const toggle = () => { calls += 1; active = !active; };
    const options = {
      currentWorkspace: () => workspace,
      isTerminalDiagnosticCaptureActive: () => active,
      commandHandlers: { "claudeWorkspaces.captureActivityDiagnostics": () => undefined,
        "claudeWorkspaces.captureTerminalDiagnostics": toggle }
    };
    await activateWorkspace(workspace, host, options);
    const capture = host.handlers.get("claudeWorkspaces.captureTerminalDiagnostics");
    assert.ok(capture);
    capture();
    assert.equal(active, true);
    workspace = WorkspaceModel.from(undefined, []);
    capture();
    assert.equal(active, false);
    capture();
    assert.equal(calls, 2);
  });
  it("allows stopping an active diagnostic capture after eligibility loss but guards starting", async () => {
    const host = new RecordingHost();
    let workspace = WorkspaceModel.from(uri("file:///projects/group.code-workspace"), []);
    let active = false;
    let calls = 0;
    const options = {
      currentWorkspace: () => workspace,
      isActivityDiagnosticCaptureActive: () => active,
      commandHandlers: {
        "claudeWorkspaces.captureActivityDiagnostics": () => { calls += 1; active = !active; }
      }
    };
    await activateWorkspace(workspace, host, options);
    const capture = host.handlers.get("claudeWorkspaces.captureActivityDiagnostics");
    assert.ok(capture);
    capture();
    assert.equal(active, true);
    workspace = WorkspaceModel.from(undefined, []);
    capture();
    assert.equal(active, false);
    assert.equal(calls, 2);
    capture();
    assert.equal(active, false);
    assert.equal(calls, 2);
  });
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
      "claudeWorkspaces.show",
      "claudeWorkspaces.newSession",
      "claudeWorkspaces.newInFolder",
      "claudeWorkspaces.closeSession",
      "claudeWorkspaces.restartFresh",
      "claudeWorkspaces.previousSession",
      "claudeWorkspaces.nextSession",
      "claudeWorkspaces.configureWorkspace",
      "claudeWorkspaces.captureActivityDiagnostics",
      "claudeWorkspaces.captureTerminalDiagnostics",
      "claudeWorkspaces.composer.submit",
      "claudeWorkspaces.composer.toggle",
      "claudeWorkspaces.composer.focus",
      "claudeWorkspaces.composer.pickCommand",
      "claudeWorkspaces.composer.find",
      "claudeWorkspaces.composer.replace",
      "claudeWorkspaces.composer.undo",
      "claudeWorkspaces.composer.redo",
      "claudeWorkspaces.composer.configureShortcuts"
    ]);
    assert.equal(result.disposables.length, 19);
  });

  it("declares native customizable composer shortcuts scoped to its view and editor",()=>{
    const manifest=JSON.parse(readFileSync("package.json","utf8")) as {contributes:{commands:{command:string}[];keybindings?:{command:string;key:string;when:string}[]}};
    const bindings=manifest.contributes.keybindings ?? [];
    const submit=bindings.find(binding=>binding.command==="claudeWorkspaces.composer.submit");
    const toggle=bindings.find(binding=>binding.command==="claudeWorkspaces.composer.toggle");
    assert.equal(submit?.key,"ctrl+enter");assert.equal(toggle?.key,"ctrl+g");
    for(const binding of bindings.filter(binding=>binding.command.startsWith("claudeWorkspaces.composer."))){
      assert.match(binding.when,/claudeWorkspaces.viewFocused/);
      assert.doesNotMatch(binding.when,/focusedView ==/);
      assert.match(binding.when,/claudeWorkspaces.savedWorkspace/);
      if(binding!==toggle)assert.match(binding.when,/claudeWorkspaces.composerFocused/);
      assert.ok(manifest.contributes.commands.some(command=>command.command===binding.command));
    }
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
