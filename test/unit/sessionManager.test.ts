import assert from "node:assert/strict";
import type * as vscode from "vscode";

import type { LaunchSpec } from "../../src/launch/launchPlanner";
import { SessionManager, type SessionManagerDependencies } from "../../src/sessions/sessionManager";
import type {
  ManagedSessionSnapshot,
  SessionDataEvent,
  SessionLifecycleLogger,
  SessionNotification,
  SessionNotificationSink
} from "../../src/sessions/sessionTypes";
import { FakeManagedPtyFactory } from "../support/fakeManagedPty";

const alphaSpec: LaunchSpec = {
  executable: "claude",
  args: ["--add-dir", "C:\\work\\shared"],
  cwd: "C:\\work\\alpha",
  env: { PATH: "C:\\bin" },
  root: { id: "alpha", label: "alpha", uri: { fsPath: "C:\\work\\alpha" } as vscode.Uri },
  importedRoots: [
    { id: "shared", label: "shared", uri: { fsPath: "C:\\work\\shared" } as vscode.Uri }
  ],
  skippedImportIds: []
};

const betaSpec: LaunchSpec = {
  executable: "claude",
  args: [],
  cwd: "C:\\work\\beta",
  env: { PATH: "C:\\bin" },
  root: { id: "beta", label: "beta", uri: { fsPath: "C:\\work\\beta" } as vscode.Uri },
  importedRoots: [],
  skippedImportIds: []
};

class RecordingLogger implements SessionLifecycleLogger {
  readonly startupErrors: unknown[] = [];
  readonly processExits: Array<{ sessionId: string; exitCode: number; signal?: number }> = [];

  startupError(error: unknown): void {
    this.startupErrors.push(error);
  }

  processExit(sessionId: string, exitCode: number, signal?: number): void {
    this.processExits.push({ sessionId, exitCode, ...(signal === undefined ? {} : { signal }) });
  }

  shutdown(): void {}

  terminationDelayed(): void {}

  terminationError(): void {}
}

class RecordingNotifications implements SessionNotificationSink {
  readonly notifications: SessionNotification[] = [];

  notify(notification: SessionNotification): void {
    this.notifications.push(notification);
  }
}

function createManager(
  ptyFactory: FakeManagedPtyFactory,
  logger: RecordingLogger,
  notifications: RecordingNotifications,
  ids: readonly string[] = ["session-1", "session-2", "session-3"]
): SessionManager {
  let idIndex = 0;
  const dependencies: SessionManagerDependencies = {
    ptyFactory,
    createId: () => ids[idIndex++]!,
    now: () => 1000,
    logger,
    notifications
  };
  return new SessionManager(dependencies);
}

describe("SessionManager", () => {
  it("publishes frozen starting and running snapshots without exposing the PTY", async () => {
    // A manager that publishes a mutable snapshot, omits launch context, or retains the PTY publicly must fail.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const notifications = new RecordingNotifications();
    const manager = createManager(ptyFactory, logger, notifications);
    const changes: Array<readonly ManagedSessionSnapshot[]> = [];
    manager.onDidChangeSessions((sessions: readonly ManagedSessionSnapshot[]) => changes.push(sessions));

    const result = await manager.launch(alphaSpec);

    assert.deepEqual(changes, [
      [
        {
          id: "session-1",
          rootId: "alpha",
          displayName: "alpha 1",
          ordinalWithinRoot: 1,
          state: "starting",
          launchedImportIds: ["shared"],
          launchedAt: 1000
        }
      ],
      [
        {
          id: "session-1",
          rootId: "alpha",
          displayName: "alpha 1",
          ordinalWithinRoot: 1,
          state: "running",
          launchedImportIds: ["shared"],
          launchedAt: 1000
        }
      ]
    ]);
    assert.deepEqual(result, {
      id: "session-1",
      rootId: "alpha",
      displayName: "alpha 1",
      ordinalWithinRoot: 1,
      state: "running",
      launchedImportIds: ["shared"],
      launchedAt: 1000
    });
    assert.equal(Object.isFrozen(changes[0]), true);
    assert.equal(Object.isFrozen(changes[0]![0]), true);
    assert.equal(Object.isFrozen(changes[0]![0]!.launchedImportIds), true);
  });

  it("assigns root-local ordinals while retaining launch order", async () => {
    // A manager that numbers globally or groups sessions by root must fail.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    await manager.launch(alphaSpec);

    assert.deepEqual(manager.sessions, [
      {
        id: "session-1",
        rootId: "alpha",
        displayName: "alpha 1",
        ordinalWithinRoot: 1,
        state: "running",
        launchedImportIds: ["shared"],
        launchedAt: 1000
      },
      {
        id: "session-2",
        rootId: "beta",
        displayName: "beta 1",
        ordinalWithinRoot: 1,
        state: "running",
        launchedImportIds: [],
        launchedAt: 1000
      },
      {
        id: "session-3",
        rootId: "alpha",
        displayName: "alpha 2",
        ordinalWithinRoot: 2,
        state: "running",
        launchedImportIds: ["shared"],
        launchedAt: 1000
      }
    ]);
  });

  it("keeps root-local ordinals monotonic after an earlier session exits", async () => {
    // A manager that counts only currently live sessions can reuse an existing root-local name.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    ptyFactory.ptys[0]!.emitExit({ exitCode: 0 });
    await manager.launch(alphaSpec);

    assert.deepEqual(manager.sessions, [
      {
        id: "session-2",
        rootId: "beta",
        displayName: "beta 1",
        ordinalWithinRoot: 1,
        state: "running",
        launchedImportIds: [],
        launchedAt: 1000
      },
      {
        id: "session-3",
        rootId: "alpha",
        displayName: "alpha 2",
        ordinalWithinRoot: 2,
        state: "running",
        launchedImportIds: ["shared"],
        launchedAt: 1000
      }
    ]);
  });

  it("emits starting then running for every launch and activates the newest session", async () => {
    // A manager that skips the provisional publication or leaves an older session active must fail.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const states: string[] = [];
    manager.onDidChangeSessions((sessions: readonly ManagedSessionSnapshot[]) => {
      states.push(sessions.at(-1)?.state ?? "empty");
    });

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);

    assert.deepEqual(states, ["starting", "running", "starting", "running"]);
    assert.equal(manager.activeSessionId, "session-2");
  });

  it("forwards PTY data with the owning session id", async () => {
    // A manager that leaks the PTY or drops its session identity must fail.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const dataEvents: SessionDataEvent[] = [];
    manager.onDidReceiveData((event: SessionDataEvent) => dataEvents.push(event));

    await manager.launch(alphaSpec);
    ptyFactory.ptys[0]!.emitData("Claude ready\\r\\n");

    assert.deepEqual(dataEvents, [{ sessionId: "session-1", data: "Claude ready\\r\\n" }]);
  });

  it("snapshots caller-owned imported roots before asynchronous startup", async () => {
    // A manager that reads importedRoots after startup begins can publish caller mutations.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const importedRoots = [...alphaSpec.importedRoots];
    const mutableSpec: LaunchSpec = {
      ...alphaSpec,
      importedRoots
    };
    const launch = manager.launch(mutableSpec);
    importedRoots.push({
      id: "late-root",
      label: "late root",
      uri: { fsPath: "C:\\work\\late-root" } as vscode.Uri
    });

    await launch;

    assert.deepEqual(manager.sessions[0]?.launchedImportIds, ["shared"]);
  });

  it("removes an exited active session, logs it, and activates the previous final session", async () => {
    // A manager that retains dead sessions, fails to log exits, or leaves a stale active id must fail.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const manager = createManager(ptyFactory, logger, new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    ptyFactory.ptys[1]!.emitExit({ exitCode: 0 });

    assert.deepEqual(logger.processExits, [{ sessionId: "session-2", exitCode: 0 }]);
    assert.deepEqual(manager.sessions, [
      {
        id: "session-1",
        rootId: "alpha",
        displayName: "alpha 1",
        ordinalWithinRoot: 1,
        state: "running",
        launchedImportIds: ["shared"],
        launchedAt: 1000
      }
    ]);
    assert.equal(manager.activeSessionId, "session-1");
  });

  it("removes a rejected provisional launch and emits retry-ready startup failure data", async () => {
    // A manager that leaves a provisional session or loses the exact retry specification must fail.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const notifications = new RecordingNotifications();
    const startupError = new Error("pty unavailable");
    ptyFactory.spawnError = startupError;
    const manager = createManager(ptyFactory, logger, notifications);

    const result = await manager.launch(alphaSpec);

    assert.equal(result, undefined);
    assert.deepEqual(manager.sessions, []);
    assert.deepEqual(logger.startupErrors, [startupError]);
    assert.deepEqual(notifications.notifications, [
      { kind: "startup-failed", spec: alphaSpec, error: startupError }
    ]);
  });

  it("removes a replayed non-zero exit before running and emits the literal immediate-exit data", async () => {
    // A manager that transitions a dead session to running or changes the exit data must fail.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const notifications = new RecordingNotifications();
    const manager = createManager(ptyFactory, logger, notifications);
    const originalSpawn = ptyFactory.spawn.bind(ptyFactory);
    ptyFactory.spawn = async (spec) => {
      const pty = await originalSpawn(spec);
      ptyFactory.ptys[0]!.emitExit({ exitCode: 23, signal: 11 });
      return pty;
    };

    const result = await manager.launch(alphaSpec);

    assert.equal(result, undefined);
    assert.deepEqual(logger.processExits, [{ sessionId: "session-1", exitCode: 23, signal: 11 }]);
    assert.deepEqual(manager.sessions, []);
    assert.deepEqual(notifications.notifications, [
      {
        kind: "immediate-nonzero-exit",
        sessionId: "session-1",
        spec: alphaSpec,
        exitCode: 23,
        signal: 11
      }
    ]);
  });
});
