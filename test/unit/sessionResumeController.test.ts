import assert from "node:assert/strict";
import type { Uri, WorkspaceFolder } from "vscode";

import { LaunchController } from "../../src/launch/launchController";
import { ClaudeCapabilityProbe } from "../../src/launch/claudeCapabilities";
import { OutputLogger } from "../../src/logging/outputLogger";
import { ResumableSessionStore, type ResumableSessionSnapshot } from "../../src/sessions/resumableSessionStore";
import { SessionManager } from "../../src/sessions/sessionManager";
import { WorkspaceModel } from "../../src/workspace/workspaceModel";
import { FakeManagedPty, FakeManagedPtyFactory } from "../support/fakeManagedPty";
import { MemoryMemento } from "../support/memoryMemento";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const alphaId = "file:///alpha";
const betaId = "file:///beta";
const initialTime = Date.parse("2026-09-06T10:00:00.000Z");

/** Supplies real workspace models with a controllable filesystem URI boundary. */
function workspace(path = "C:/alpha", includeAlpha = true): WorkspaceModel {
  const uri = (id: string, fsPath: string): Uri => ({
    scheme: "file", fsPath, toString: () => id
  }) as Uri;
  const folders: WorkspaceFolder[] = [{ name: "Beta", index: 1, uri: uri(betaId, "C:/beta") }];
  if (includeAlpha) {
    folders.unshift({ name: "Alpha", index: 0, uri: uri(alphaId, path) });
  }
  return WorkspaceModel.from(uri("file:///group.code-workspace", "C:/group.code-workspace"), folders);
}

/** Exercises the real planner, manager, capability probe, store, and controller together. */
function harness(help: "supported" | "unsupported" | "failed" = "supported") {
  const state = new MemoryMemento();
  const logs: string[] = [];
  let logsOpened = 0;
  const logger = new OutputLogger({
    name: "test", append: () => undefined, appendLine: (line) => logs.push(line),
    replace: () => undefined, clear: () => undefined, hide: () => undefined,
    show: () => { logsOpened += 1; }, dispose: () => undefined
  });
  const store = new ResumableSessionStore(state, (message) => logs.push(message));
  const ptys = new FakeManagedPtyFactory();
  const errors: Array<{ message: string; actions: string[] }> = [];
  const executedCommands: Array<{ command: string; args: unknown[] }> = [];
  const controls = {
    workspace: workspace(), imports: [] as string[], executable: "claude", now: initialTime,
    available: true, configured: 0, action: undefined as string | undefined,
    help, probeCalls: [] as string[]
  };
  let id = 0;
  let claudeId = 0;
  const manager = new SessionManager({
    ptyFactory: ptys, createId: () => `session-${++id}`, now: () => controls.now,
    logger, notifications: { notify: (notification) => controller.notify(notification) }
  });
  const dependencies = {
    manager, logger, store, currentWorkspace: () => controls.workspace,
    setup: {
      ensureConfigured: async () => ({
        schemaVersion: 1, configuredRoots: [alphaId, betaId],
        importsByRoot: { [alphaId]: controls.imports, [betaId]: [] }
      }),
      configure: async () => { controls.configured += 1; }
    },
    availability: {
      timeoutMs: 100, maxConcurrency: 2, maxOutstandingProbes: 2, totalTimeoutMs: 1000,
      isAvailable: async () => controls.available
    },
    executable: () => controls.executable, selectRoot: async () => undefined,
    notifications: {
      showWarningMessage: async () => undefined,
      showErrorMessage: async (message: string, ...actions: string[]) => {
        errors.push({ message, actions });
        const action = controls.action;
        controls.action = undefined;
        return action;
      }
    },
    commands: {
      executeCommand: async (command: string, ...args: unknown[]) => {
        executedCommands.push({ command, args });
      },
      registerCommand: () => ({ dispose: () => undefined })
    },
    createClaudeSessionId: () => ++claudeId === 1 ? firstId : secondId,
    claudeCapabilities: new ClaudeCapabilityProbe({ run: async (executable) => {
      controls.probeCalls.push(executable);
      if (controls.help === "failed") { throw new Error("help failed"); }
      return { stdout: controls.help === "supported" ? "--session-id <uuid> --resume <id>" : "--help", stderr: "" };
    } }),
    now: () => controls.now
  };
  const controller = new LaunchController(dependencies);
  return { controller, store, manager, ptys, controls, errors, executedCommands, logs, state,
    logsOpened: () => logsOpened,
    dispose: () => { manager.dispose(); store.dispose(); } };
}

/** Seeds only host-owned metadata, independent of any Claude transcript files. */
async function seed(h: ReturnType<typeof harness>, overrides: Partial<ResumableSessionSnapshot> = {}) {
  await h.store.upsert({
    claudeSessionId: firstId, displayName: "Saved work", rootId: alphaId, rootLabel: "Old alpha",
    rootPath: "C:/alpha", createdAt: "2026-09-01T10:00:00.000Z", lastLaunchedAt: "2026-09-02T10:00:00.000Z",
    ...overrides
  });
}

/** Sends a stored identity through the host controller. */
async function resume(h: ReturnType<typeof harness>, id: string): Promise<void> {
  await h.controller.resumeSession(id);
}

/** Drains notification actions that originate from a synchronous process event. */
async function settle(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

describe("session resume orchestration", () => {
  for (const action of [undefined, "Forget Session", "Open Logs", "Start New"] as const) {
    it(`offers recovery once for a resumed process rejected on a later turn: ${action ?? "dismiss"}`, async () => {
      const h = harness();
      await seed(h, { claudeSessionId: secondId });
      await resume(h, secondId);
      assert.equal(h.manager.sessions[0]?.state, "running");
      const launched = h.store.sessions[0]!;
      assert.equal(launched.createdAt, "2026-09-01T10:00:00.000Z");
      assert.equal(launched.lastLaunchedAt, "2026-09-06T10:00:00.000Z");
      h.controls.now += 60_000;
      h.controls.action = action;
      await new Promise<void>((resolve) => setImmediate(() => {
        h.ptys.ptys[0]!.emitExit({ exitCode: 1 });
        resolve();
      }));
      await settle();
      assert.deepEqual(h.errors.map((error) => error.actions), [["Start New", "Forget Session", "Open Logs"]]);
      assert.ok(h.manager.sessions.every((session) => session.claudeSessionId !== secondId));
      const saved = h.store.sessions.find((session) => session.claudeSessionId === secondId);
      assert.deepEqual(saved, action === "Forget Session" ? undefined : launched);
      const reloaded = new ResumableSessionStore(h.state, () => undefined);
      assert.deepEqual(reloaded.sessions.find((session) => session.claudeSessionId === secondId), saved);
      if (action === "Open Logs") { assert.equal(h.logsOpened(), 1); }
      if (action === "Start New") {
        assert.deepEqual(h.ptys.spawnedSpecs[1]?.args, ["--session-id", firstId]);
        assert.equal(h.manager.sessions[0]?.state, "running");
      }
      reloaded.dispose();
      h.dispose();
    });
  }

  for (const stop of ["close", "shutdown", "dispose"] as const) {
    it(`does not offer resumed-session recovery after intentional ${stop}`, async () => {
      const h = harness();
      await seed(h);
      await resume(h, firstId);
      if (stop === "close") { await h.controller.closeActive(); }
      else if (stop === "shutdown") { await h.manager.terminateAll(); }
      else { h.manager.dispose(); }
      await new Promise<void>((resolve) => setImmediate(() => {
        h.ptys.ptys[0]!.emitExit({ exitCode: 1 });
        resolve();
      }));
      await settle();
      assert.deepEqual(h.errors, []);
      assert.equal(h.store.sessions[0]?.claudeSessionId, firstId);
      h.dispose();
    });
  }

  it("does not offer recovery when an explicitly closed provisional resume exits before running", async () => {
    const h = harness();
    await seed(h);
    let releaseSpawn: ((pty: FakeManagedPty) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((resolve) => { releaseSpawn = resolve; });
    const pending = resume(h, firstId);
    await settle();
    await h.controller.closeActive();
    const pty = new FakeManagedPty();
    pty.emitExit({ exitCode: 1 });
    releaseSpawn!(pty);
    await pending;
    await settle();
    assert.deepEqual(h.errors, []);
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-02T10:00:00.000Z");
    h.dispose();
  });

  it("does not offer recovery when a closed provisional resume later rejects startup", async () => {
    const h = harness();
    await seed(h);
    let rejectSpawn: ((error: Error) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((_resolve, reject) => { rejectSpawn = reject; });
    const pending = resume(h, firstId);
    await settle();
    await h.controller.closeActive();
    rejectSpawn!(new Error("cancelled startup"));
    await pending;
    await settle();
    assert.deepEqual(h.manager.sessions, []);
    assert.deepEqual(h.errors, []);
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-02T10:00:00.000Z");
    h.dispose();
  });

  it("does not offer recovery when a closed provisional resume fails its queued resize", async () => {
    const h = harness();
    await seed(h);
    let releaseSpawn: ((pty: FakeManagedPty) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((resolve) => { releaseSpawn = resolve; });
    const pending = resume(h, firstId);
    await settle();
    h.manager.resize(h.manager.activeSessionId!, 80, 24);
    await h.controller.closeActive();
    const pty = new FakeManagedPty();
    pty.resize = () => { throw new Error("cancelled resize"); };
    releaseSpawn!(pty);
    await pending;
    await settle();
    assert.deepEqual(h.errors, []);
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-02T10:00:00.000Z");
    h.dispose();
  });

  it("keeps ordinary new-session exit behavior unchanged after reaching running", async () => {
    const h = harness();
    await h.controller.launch({ rootMode: "default" });
    await new Promise<void>((resolve) => setImmediate(() => {
      h.ptys.ptys[0]!.emitExit({ exitCode: 1 });
      resolve();
    }));
    await settle();
    assert.deepEqual(h.manager.sessions, []);
    assert.deepEqual(h.errors, []);
    h.dispose();
  });

  it("distinguishes an unexpected later exit from an immediate launch exit", async () => {
    // Reusing the immediate-exit message misstates a failure that occurred after the session was running.
    const h = harness();
    await h.controller.launch({ rootMode: "default" });
    const launchedSpec = h.ptys.spawnedSpecs[0]!;

    h.controller.notify({
      kind: "unexpected-nonzero-exit",
      sessionId: h.manager.sessions[0]!.id,
      spec: launchedSpec,
      exitCode: 1
    });
    await settle();

    assert.deepEqual(h.errors, [{
      message: "Claude session exited unexpectedly.",
      actions: ["Retry", "Open Logs"]
    }]);
    h.dispose();
  });

  it("does not offer recovery for a resumed process that exits successfully on a later turn", async () => {
    const h = harness();
    await seed(h);
    await resume(h, firstId);
    await new Promise<void>((resolve) => setImmediate(() => {
      h.ptys.ptys[0]!.emitExit({ exitCode: 0 });
      resolve();
    }));
    await settle();
    assert.deepEqual(h.manager.sessions, []);
    assert.deepEqual(h.errors, []);
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-06T10:00:00.000Z");
    h.dispose();
  });

  it("does not restore a UUID when resume completes during an in-flight Forget write", async () => {
    const h = harness();
    await seed(h);
    let releaseSpawn: ((pty: FakeManagedPty) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((resolve) => { releaseSpawn = resolve; });
    const pendingResume = resume(h, firstId);
    await settle();
    assert.equal(h.manager.sessions[0]?.state, "starting");

    const update = h.state.update.bind(h.state);
    let releaseForget: (() => void) | undefined;
    let delayNextWrite = true;
    h.state.update = async (key, value) => {
      if (delayNextWrite) {
        delayNextWrite = false;
        await new Promise<void>((resolve) => { releaseForget = resolve; });
      }
      await update(key, value);
    };
    const pendingForget = h.store.forget(firstId);
    await settle();
    assert.ok(releaseForget, "Forget must reach the delayed workspace-state boundary");
    assert.equal(h.store.sessions[0]?.claudeSessionId, firstId);
    releaseSpawn!(new FakeManagedPty());
    await settle();
    assert.equal(h.manager.sessions[0]?.state, "running");
    releaseForget();
    await Promise.all([pendingForget, pendingResume]);

    const reloaded = new ResumableSessionStore(h.state, () => undefined);
    assert.deepEqual({ current: h.store.sessions, reloaded: reloaded.sessions }, { current: [], reloaded: [] });
    reloaded.dispose();
    h.dispose();
  });

  it("does not restore metadata forgotten while a resume process is starting", async () => {
    const h = harness();
    await seed(h);
    let releaseSpawn: ((pty: FakeManagedPty) => void) | undefined;
    h.ptys.spawn = async () => new Promise<FakeManagedPty>((resolve) => { releaseSpawn = resolve; });
    const pending = resume(h, firstId);
    await settle();
    assert.equal(h.manager.sessions[0]?.state, "starting");
    await h.store.forget(firstId);
    releaseSpawn!(new FakeManagedPty());
    await pending;
    assert.equal(h.manager.sessions[0]?.state, "running");
    assert.deepEqual(h.store.sessions, []);
    h.dispose();
  });

  for (const mode of ["new", "resume"] as const) {
    it(`keeps a running ${mode} session usable and logs a rejected workspace-state write`, async () => {
      const h = harness();
      if (mode === "resume") { await seed(h); }
      const before = h.store.sessions;
      h.state.update = async () => { throw new Error("workspace state write rejected"); };
      if (mode === "resume") { await resume(h, firstId); }
      else { await h.controller.launch({ rootMode: "default" }); }
      assert.equal(h.manager.sessions[0]?.state, "running");
      assert.deepEqual(h.store.sessions, before);
      assert.ok(h.logs.some((line) => line.includes("workspace state write rejected")));
      h.dispose();
    });
  }

  it("persists a successful live rename without altering its launch timestamps", async () => {
    const h = harness();
    await seed(h);
    await resume(h, firstId);
    const before = h.store.sessions[0]!;
    await h.controller.renameSession(h.manager.sessions[0]!.id, "  Renamed work  ");
    assert.equal(h.manager.sessions[0]?.displayName, "Renamed work");
    assert.deepEqual(h.store.sessions, [{ ...before, displayName: "Renamed work" }]);
    await h.controller.renameSession("unknown", "Ignored");
    await h.controller.renameSession(h.manager.sessions[0]!.id, "  ");
    assert.equal(h.store.sessions[0]?.displayName, "Renamed work");
    h.dispose();
  });

  it("gives fresh restarts a new persisted UUID using current launch configuration", async () => {
    const h = harness();
    await h.controller.launch({ rootMode: "default" });
    h.controls.imports = [betaId];
    await h.controller.restartFresh(h.manager.sessions[0]!.id);
    assert.equal(h.ptys.ptys[0]?.terminated, true);
    assert.deepEqual(h.ptys.spawnedSpecs[1]?.args, ["--session-id", secondId, "--add-dir", "C:/beta"]);
    assert.deepEqual(h.store.sessions.map((session) => session.claudeSessionId), [firstId, secondId]);
    h.dispose();
  });

  it("does not persist a new launch that fails before returning a running snapshot", async () => {
    const h = harness();
    const spawn = h.ptys.spawn.bind(h.ptys);
    h.ptys.spawn = async (spec) => {
      const pty = await spawn(spec);
      h.ptys.ptys.at(-1)!.emitExit({ exitCode: 1 });
      return pty;
    };
    await h.controller.launch({ rootMode: "default" });
    await settle();
    assert.deepEqual(h.store.sessions, []);
    assert.deepEqual(h.errors[0], {
      message: "Claude session exited immediately.",
      actions: ["Retry", "Open Logs"]
    });
    h.dispose();
  });

  it("rejects a root path changed while current configuration is being read", async () => {
    const h = harness();
    await seed(h);
    const probe = h.controls.probeCalls;
    h.controls.workspace = workspace();
    // Probe yields before planning; mutate the current roots during that asynchronous gap.
    const pending = resume(h, firstId);
    assert.deepEqual(probe, ["claude"]);
    h.controls.workspace = workspace("C:/changed");
    await pending;
    assert.deepEqual(h.manager.sessions, []);
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-02T10:00:00.000Z");
    h.dispose();
  });
  for (const help of ["unsupported", "failed"] as const) {
    it(`launches normally and logs skipped persistence when help is ${help}`, async () => {
      const h = harness(help);
      await h.controller.launch({ rootMode: "default" });
      assert.equal(h.manager.sessions[0]?.state, "running");
      assert.equal(h.manager.sessions[0]?.claudeSessionId, null);
      assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, []);
      assert.deepEqual(h.store.sessions, []);
      assert.ok(h.logs.some((line) => /persistence.*(unsupported|probe)/i.test(line)));
      h.dispose();
    });
  }

  it("resolves only an exact store-owned UUID", async () => {
    const h = harness();
    await seed(h);
    await resume(h, secondId);
    await resume(h, firstId.toUpperCase().replace("1111", "ABCD"));
    assert.deepEqual(h.manager.sessions, []);
    assert.deepEqual(h.controls.probeCalls, []);
    assert.equal(h.store.sessions.length, 1);
    h.dispose();
  });

  it("resumes the stored root and name using current imports and executable", async () => {
    const h = harness();
    await seed(h);
    h.controls.imports = [betaId];
    h.controls.executable = "claude-current";
    await resume(h, firstId);
    assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, ["--resume", firstId, "--add-dir", "C:/beta"]);
    assert.equal(h.ptys.spawnedSpecs[0]?.cwd, "C:/alpha");
    assert.equal(h.ptys.spawnedSpecs[0]?.executable, "claude-current");
    assert.deepEqual(h.controls.probeCalls, ["claude-current"]);
    assert.equal(h.manager.sessions[0]?.displayName, "Saved work");
    assert.equal(h.manager.sessions[0]?.claudeSessionId, firstId);
    assert.equal(h.store.sessions[0]?.createdAt, "2026-09-01T10:00:00.000Z");
    assert.equal(h.store.sessions[0]?.lastLaunchedAt, "2026-09-06T10:00:00.000Z");
    h.dispose();
  });

  it("rejects a second resume of a live UUID, including concurrent requests", async () => {
    const h = harness();
    await seed(h);
    await Promise.all([resume(h, firstId), resume(h, firstId)]);
    await resume(h, firstId);
    assert.equal(h.ptys.ptys.length, 1);
    assert.equal(h.manager.sessions.length, 1);
    h.dispose();
  });

  for (const problem of ["missing", "changed path", "unavailable"] as const) {
    it(`retains metadata and offers root recovery when the root is ${problem}`, async () => {
      const h = harness();
      await seed(h);
      const before = h.store.sessions;
      if (problem === "missing") { h.controls.workspace = workspace("C:/alpha", false); }
      if (problem === "changed path") { h.controls.workspace = workspace("C:/ALPHA"); }
      if (problem === "unavailable") { h.controls.available = false; }
      await resume(h, firstId);
      assert.deepEqual(h.manager.sessions, []);
      assert.deepEqual(h.store.sessions, before);
      assert.ok(h.errors[0]?.actions.includes("Configure Workspace…"));
      assert.ok(h.errors[0]?.actions.includes("Start New"));
      assert.ok(h.errors[0]?.actions.includes("Forget Session"));
      h.dispose();
    });
  }

  for (const help of ["unsupported", "failed"] as const) {
    it(`does not resume when capability help is ${help}`, async () => {
      const h = harness(help);
      await seed(h);
      const before = h.store.sessions;
      await resume(h, firstId);
      assert.deepEqual(h.manager.sessions, []);
      assert.deepEqual(h.store.sessions, before);
      assert.ok(h.errors[0]?.actions.includes("Start New"));
      h.dispose();
    });
  }

  for (const failure of ["spawn", "immediate exit"] as const) {
    it(`retains failed resume metadata and offers process recovery after ${failure}`, async () => {
      const h = harness();
      await seed(h);
      const before = h.store.sessions;
      if (failure === "spawn") { h.ptys.spawnError = new Error("stale session"); }
      else {
        const spawn = h.ptys.spawn.bind(h.ptys);
        h.ptys.spawn = async (spec) => {
          const pty = await spawn(spec);
          h.ptys.ptys.at(-1)!.emitExit({ exitCode: 1 });
          return pty;
        };
      }
      await resume(h, firstId);
      await settle();
      assert.deepEqual(h.manager.sessions, []);
      assert.deepEqual(h.store.sessions, before);
      assert.deepEqual(h.errors[0]?.actions, ["Start New", "Forget Session", "Open Logs"]);
      assert.equal(h.errors.length, 1);
      h.dispose();
    });
  }

  it("offers executable recovery when a resumed executable is missing", async () => {
    const h = harness();
    await seed(h);
    h.ptys.spawnError = Object.assign(new Error("spawn claude ENOENT"), { code: "ENOENT" });
    h.controls.action = "Configure Executable";
    await resume(h, firstId);
    await settle();
    assert.deepEqual(h.manager.sessions, []);
    assert.equal(h.store.sessions[0]?.claudeSessionId, firstId);
    assert.deepEqual(h.errors, [{
      message: "Claude executable was not found.",
      actions: ["Configure Executable", "Open Logs"]
    }]);
    assert.deepEqual(h.executedCommands, [{
      command: "workbench.action.openSettings",
      args: ["claudeWorkspaces.claudeExecutable"]
    }]);
    h.dispose();
  });

  it("forgets only the selected record after resume failure", async () => {
    const h = harness();
    await seed(h);
    await seed(h, { claudeSessionId: secondId });
    h.ptys.spawnError = new Error("stale session");
    h.controls.action = "Forget Session";
    await resume(h, firstId);
    await settle();
    assert.deepEqual(h.store.sessions.map((session) => session.claudeSessionId), [secondId]);
    h.dispose();
  });

  it("starts new through current default planning after a missing resume root", async () => {
    const h = harness();
    await seed(h, { claudeSessionId: secondId });
    h.controls.workspace = workspace("C:/alpha", false);
    h.controls.action = "Start New";
    await resume(h, secondId);
    await settle();
    assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, ["--session-id", firstId]);
    assert.equal(h.ptys.spawnedSpecs[0]?.cwd, "C:/beta");
    assert.equal(h.store.sessions.length, 2);
    h.dispose();
  });

  it("configures current roots on root recovery and opens logs on process recovery", async () => {
    const h = harness();
    await seed(h);
    h.controls.workspace = workspace("C:/changed");
    h.controls.action = "Configure Workspace…";
    await resume(h, firstId);
    await settle();
    assert.equal(h.controls.configured, 1);
    h.controls.workspace = workspace();
    h.ptys.spawnError = new Error("stale session");
    h.controls.action = "Open Logs";
    await resume(h, firstId);
    await settle();
    assert.equal(h.logsOpened(), 1);
    h.dispose();
  });

  it("persists an extension-created UUID only once the new session is running", async () => {
    // Omitting identity wiring or writing before PTY startup must fail.
    const h = harness();
    const startingDocuments: unknown[] = [];
    h.manager.onDidChangeSessions((sessions) => {
      if (sessions.some((session) => session.state === "starting")) {
        startingDocuments.push(h.store.sessions);
      }
    });
    await h.controller.launch({ rootMode: "default" });
    assert.deepEqual(h.ptys.spawnedSpecs[0]?.args, ["--session-id", firstId]);
    assert.equal(h.manager.sessions[0]?.claudeSessionId, firstId);
    assert.deepEqual(startingDocuments, [[]]);
    assert.deepEqual(h.store.sessions, [{
      claudeSessionId: firstId, displayName: "Alpha 1", rootId: alphaId, rootLabel: "Alpha",
      rootPath: "C:/alpha", createdAt: "2026-09-06T10:00:00.000Z", lastLaunchedAt: "2026-09-06T10:00:00.000Z"
    }]);
    h.dispose();
  });
});
