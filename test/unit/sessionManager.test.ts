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
import { FakeManagedPty, FakeManagedPtyFactory } from "../support/fakeManagedPty";

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
  readonly delayedTerminations: string[] = [];
  readonly terminationErrors: Array<{ sessionId: string; error: unknown }> = [];
  readonly shutdowns: string[][] = [];

  startupError(error: unknown): void {
    this.startupErrors.push(error);
  }

  processExit(sessionId: string, exitCode: number, signal?: number): void {
    this.processExits.push({ sessionId, exitCode, ...(signal === undefined ? {} : { signal }) });
  }

  shutdown(sessionIds: readonly string[]): void {
    this.shutdowns.push([...sessionIds]);
  }

  terminationDelayed(sessionId: string): void {
    this.delayedTerminations.push(sessionId);
  }

  terminationError(sessionId: string, error: unknown): void {
    this.terminationErrors.push({ sessionId, error });
  }
}

class ThrowingShutdownLogger extends RecordingLogger {
  override shutdown(): void {
    throw new Error("shutdown logger failed");
  }
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
  ids: readonly string[] = ["session-1", "session-2", "session-3", "session-4"],
  options: Pick<SessionManagerDependencies, "schedule" | "terminationAckWarningMs"> = {}
): SessionManager {
  let idIndex = 0;
  const dependencies: SessionManagerDependencies = {
    ptyFactory,
    createId: () => ids[idIndex++]!,
    now: () => 1000,
    logger,
    notifications,
    ...options
  };
  return new SessionManager(dependencies);
}

function countTerminationAttempts(pty: FakeManagedPty): () => number {
  const originalTerminate = pty.terminate.bind(pty);
  let attempts = 0;
  pty.terminate = async () => {
    attempts += 1;
    await originalTerminate();
  };
  return () => attempts;
}

/** Installs a PTY stub whose native exit listener remains directly controllable. */
function installExitCapturingPty(
  ptyFactory: FakeManagedPtyFactory,
  pty: FakeManagedPty
): (event: Parameters<FakeManagedPty["emitExit"]>[0]) => void {
  let exitListener: ((event: Parameters<FakeManagedPty["emitExit"]>[0]) => void) | undefined;
  ptyFactory.spawn = async () => ({
    onData: pty.onData,
    onExit: (listener) => {
      exitListener = listener;
      return { dispose: () => undefined };
    },
    write: (data) => pty.write(data),
    resize: (columns, rows) => pty.resize(columns, rows),
    terminate: () => pty.terminate(),
    dispose: () => pty.dispose()
  });
  return (event) => {
    if (exitListener === undefined) {
      throw new Error("Expected SessionManager to subscribe to the PTY exit event.");
    }
    exitListener(event);
  };
}

class ManualScheduler {
  readonly delays: number[] = [];
  private readonly callbacks: Array<{ callback: () => void; disposed: boolean }> = [];

  schedule = (callback: () => void, delayMs: number): vscode.Disposable => {
    const scheduled = { callback, disposed: false };
    this.callbacks.push(scheduled);
    this.delays.push(delayMs);
    return { dispose: () => (scheduled.disposed = true) };
  };

  runPending(): void {
    this.callbacks.forEach((scheduled) => {
      if (!scheduled.disposed) {
        scheduled.callback();
      }
    });
  }

  get activeCount(): number {
    return this.callbacks.filter((scheduled) => !scheduled.disposed).length;
  }
}

describe("SessionManager", () => {
  it("reports an opted-in unexpected exit only once after running", async () => {
    const ptyFactory = new FakeManagedPtyFactory();
    const pty = new FakeManagedPty();
    const emitExit = installExitCapturingPty(ptyFactory, pty);
    const notifications = new RecordingNotifications();
    const manager = createManager(ptyFactory, new RecordingLogger(), notifications);
    const options = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111",
      notifyOnUnexpectedExit: true
    };
    assert.equal((await manager.launch(alphaSpec, options))?.state, "running");
    await new Promise<void>((resolve) => setImmediate(resolve));
    emitExit({ exitCode: 1, signal: 9 });
    emitExit({ exitCode: 1, signal: 9 });

    assert.deepEqual(manager.sessions, []);
    assert.deepEqual(notifications.notifications, [{
      kind: "unexpected-nonzero-exit", sessionId: "session-1", spec: alphaSpec, exitCode: 1, signal: 9
    }]);
    manager.dispose();
  });

  it("reports a signal-only opted-in unexpected exit once with literal exit data", async () => {
    // Ignoring a non-zero signal when the exit code is zero would skip resumed-session recovery.
    const ptyFactory = new FakeManagedPtyFactory();
    const pty = new FakeManagedPty();
    const emitExit = installExitCapturingPty(ptyFactory, pty);
    const notifications = new RecordingNotifications();
    const manager = createManager(ptyFactory, new RecordingLogger(), notifications);
    const options = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111",
      notifyOnUnexpectedExit: true
    };
    assert.equal((await manager.launch(alphaSpec, options))?.state, "running");
    await new Promise<void>((resolve) => setImmediate(resolve));
    emitExit({ exitCode: 0, signal: 15 });
    emitExit({ exitCode: 0, signal: 15 });

    assert.deepEqual(manager.sessions, []);
    assert.deepEqual(notifications.notifications, [{
      kind: "unexpected-nonzero-exit", sessionId: "session-1", spec: alphaSpec, exitCode: 0, signal: 15
    }]);
    manager.dispose();
  });

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
          claudeSessionId: null,
          rootId: "alpha",
          displayName: "alpha 1",
          ordinalWithinRoot: 1,
          state: "starting",
          launchedImportIds: ["shared"],
          launchedAddDirPaths: ["C:\\work\\shared"],
          launchedRootLabel: "alpha",
          launchedRootPath: "C:\\work\\alpha",
          launchedAt: 1000
        }
      ],
      [
        {
          id: "session-1",
          claudeSessionId: null,
          rootId: "alpha",
          displayName: "alpha 1",
          ordinalWithinRoot: 1,
          state: "running",
          launchedImportIds: ["shared"],
          launchedAddDirPaths: ["C:\\work\\shared"],
          launchedRootLabel: "alpha",
          launchedRootPath: "C:\\work\\alpha",
          launchedAt: 1000
        }
      ]
    ]);
    assert.deepEqual(result, {
      id: "session-1",
      claudeSessionId: null,
      rootId: "alpha",
      displayName: "alpha 1",
      ordinalWithinRoot: 1,
      state: "running",
      launchedImportIds: ["shared"],
      launchedAddDirPaths: ["C:\\work\\shared"],
      launchedRootLabel: "alpha",
      launchedRootPath: "C:\\work\\alpha",
      launchedAt: 1000
    });
    assert.equal(Object.isFrozen(changes[0]), true);
    assert.equal(Object.isFrozen(changes[0]![0]), true);
    assert.equal(Object.isFrozen(changes[0]![0]!.launchedImportIds), true);
    assert.equal(Object.isFrozen(changes[0]![0]!.launchedAddDirPaths), true);
  });

  it("carries a Claude session id and trimmed resumed display name through snapshots", async () => {
    // Dropping either launch option would sever the persisted Claude identity from the live session.
    const manager = createManager(
      new FakeManagedPtyFactory(),
      new RecordingLogger(),
      new RecordingNotifications()
    );
    const changes: Array<readonly ManagedSessionSnapshot[]> = [];
    manager.onDidChangeSessions((sessions) => changes.push(sessions));

    const session = await manager.launch(alphaSpec, {
      claudeSessionId: "123e4567-e89b-42d3-a456-426614174000",
      displayName: "  API migration  "
    });

    assert.equal(session?.claudeSessionId, "123e4567-e89b-42d3-a456-426614174000");
    assert.equal(session?.displayName, "API migration");
    assert.deepEqual(changes.map((snapshots) => ({
      claudeSessionId: snapshots[0]?.claudeSessionId,
      displayName: snapshots[0]?.displayName,
      state: snapshots[0]?.state
    })), [
      {
        claudeSessionId: "123e4567-e89b-42d3-a456-426614174000",
        displayName: "API migration",
        state: "starting"
      },
      {
        claudeSessionId: "123e4567-e89b-42d3-a456-426614174000",
        displayName: "API migration",
        state: "running"
      }
    ]);
  });

  it("uses the generated display name when an injected name is blank", async () => {
    // Blank persisted presentation metadata must not replace the manager's valid generated name.
    const manager = createManager(
      new FakeManagedPtyFactory(),
      new RecordingLogger(),
      new RecordingNotifications()
    );

    const session = await manager.launch(alphaSpec, {
      displayName: "   "
    });

    assert.equal(session?.claudeSessionId, null);
    assert.equal(session?.displayName, "alpha 1");
  });

  it("captures the exact add-dir paths passed in the immutable launch arguments", async () => {
    // The panel must not reconstruct effective paths from mutable workspace configuration or root metadata.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(
      ptyFactory,
      new RecordingLogger(),
      new RecordingNotifications()
    );
    const args = [
      "--model",
      "sonnet",
      "--add-dir",
      "C:\\actual\\shared one",
      "--add-dir",
      "D:\\actual\\shared-two"
    ];
    const spec: LaunchSpec = {
      ...alphaSpec,
      args
    };

    const launch = manager.launch(spec);
    args.splice(0, args.length, "--add-dir", "C:\\later\\mutation");
    const session = await launch;

    assert.deepEqual(session?.launchedAddDirPaths, [
      "C:\\actual\\shared one",
      "D:\\actual\\shared-two"
    ]);
    assert.equal(Object.isFrozen(session?.launchedAddDirPaths), true);
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
        claudeSessionId: null,
        rootId: "alpha",
        displayName: "alpha 1",
        ordinalWithinRoot: 1,
        state: "running",
        launchedImportIds: ["shared"],
        launchedAddDirPaths: ["C:\\work\\shared"],
        launchedRootLabel: "alpha",
        launchedRootPath: "C:\\work\\alpha",
        launchedAt: 1000
      },
      {
        id: "session-2",
        claudeSessionId: null,
        rootId: "beta",
        displayName: "beta 1",
        ordinalWithinRoot: 1,
        state: "running",
        launchedImportIds: [],
        launchedAddDirPaths: [],
        launchedRootLabel: "beta",
        launchedRootPath: "C:\\work\\beta",
        launchedAt: 1000
      },
      {
        id: "session-3",
        claudeSessionId: null,
        rootId: "alpha",
        displayName: "alpha 2",
        ordinalWithinRoot: 2,
        state: "running",
        launchedImportIds: ["shared"],
        launchedAddDirPaths: ["C:\\work\\shared"],
        launchedRootLabel: "alpha",
        launchedRootPath: "C:\\work\\alpha",
        launchedAt: 1000
      }
    ]);
  });

  it("reuses the lowest root-local ordinal after an earlier session exits", async () => {
    // A manager that retains a historical high-water mark leaves reusable root-local names unavailable.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    ptyFactory.ptys[0]!.emitExit({ exitCode: 0 });
    await manager.launch(alphaSpec);

    assert.deepEqual(manager.sessions, [
      {
        id: "session-2",
        claudeSessionId: null,
        rootId: "beta",
        displayName: "beta 1",
        ordinalWithinRoot: 1,
        state: "running",
        launchedImportIds: [],
        launchedAddDirPaths: [],
        launchedRootLabel: "beta",
        launchedRootPath: "C:\\work\\beta",
        launchedAt: 1000
      },
      {
        id: "session-3",
        claudeSessionId: null,
        rootId: "alpha",
        displayName: "alpha 1",
        ordinalWithinRoot: 1,
        state: "running",
        launchedImportIds: ["shared"],
        launchedAddDirPaths: ["C:\\work\\shared"],
        launchedRootLabel: "alpha",
        launchedRootPath: "C:\\work\\alpha",
        launchedAt: 1000
      }
    ]);
  });

  it("fills the first internal root-local ordinal gap without renumbering survivors", async () => {
    // Counting live sessions or retaining a high-water mark can collide with alpha 3 or skip alpha 2.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(alphaSpec);
    await manager.launch(alphaSpec);
    ptyFactory.ptys[1]!.emitExit({ exitCode: 0 });
    await manager.launch(alphaSpec);

    assert.deepEqual(manager.sessions.map((session) => ({
      id: session.id,
      ordinalWithinRoot: session.ordinalWithinRoot
    })), [
      { id: "session-1", ordinalWithinRoot: 1 },
      { id: "session-3", ordinalWithinRoot: 3 },
      { id: "session-4", ordinalWithinRoot: 2 }
    ]);
  });

  it("reserves ordinals for concurrently starting sessions", async () => {
    // An allocator that considers only running sessions gives both provisional sessions the same name.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const pendingSpawns: Array<(pty: FakeManagedPty) => void> = [];
    ptyFactory.spawn = async () => new Promise((resolve) => pendingSpawns.push(resolve));

    const firstLaunch = manager.launch(alphaSpec);
    const secondLaunch = manager.launch(alphaSpec);

    assert.deepEqual(manager.sessions.map((session) => ({
      ordinalWithinRoot: session.ordinalWithinRoot,
      state: session.state
    })), [
      { ordinalWithinRoot: 1, state: "starting" },
      { ordinalWithinRoot: 2, state: "starting" }
    ]);

    pendingSpawns[0]!(new FakeManagedPty());
    pendingSpawns[1]!(new FakeManagedPty());
    await Promise.all([firstLaunch, secondLaunch]);
  });

  it("keeps closing ordinals occupied without renumbering surviving sessions", async () => {
    // Releasing a closing ordinal early creates a duplicate; compacting survivors changes existing names.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(alphaSpec);
    await manager.close("session-1");
    const whileClosing = await manager.launch(alphaSpec);

    assert.equal(whileClosing?.ordinalWithinRoot, 3);
    ptyFactory.ptys[0]!.emitExit({ exitCode: 0 });
    const afterExit = await manager.launch(alphaSpec);

    assert.deepEqual(manager.sessions.map((session) => ({
      id: session.id,
      ordinalWithinRoot: session.ordinalWithinRoot
    })), [
      { id: "session-2", ordinalWithinRoot: 2 },
      { id: "session-3", ordinalWithinRoot: 3 },
      { id: "session-4", ordinalWithinRoot: 1 }
    ]);
    assert.equal(afterExit?.displayName, "alpha 1");
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

  it("applies the latest resize requested while a session is starting", async () => {
    // Dropping a resize before spawn resolves leaves the new PTY at its default geometry.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const pty = new FakeManagedPty();
    let resolveSpawn: ((value: FakeManagedPty) => void) | undefined;
    ptyFactory.spawn = async () => new Promise((resolve) => (resolveSpawn = resolve));

    const launch = manager.launch(alphaSpec);
    manager.resize("session-1", 80, 24);
    manager.resize("session-1", 132, 48);
    resolveSpawn?.(pty);
    await launch;

    assert.deepEqual(pty.resizes, [{ columns: 132, rows: 48 }]);
  });

  it("does not resize a PTY that exited before its pending spawn continuation", async () => {
    // Applying a cached resize before subscribing to replayable exit promotes or mutates a dead PTY.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const pty = new FakeManagedPty();
    let resolveSpawn: ((value: FakeManagedPty) => void) | undefined;
    ptyFactory.spawn = async () => new Promise((resolve) => (resolveSpawn = resolve));

    const launch = manager.launch(alphaSpec);
    manager.resize("session-1", 132, 48);
    pty.emitExit({ exitCode: 0 });
    resolveSpawn?.(pty);

    assert.equal(await launch, undefined);
    assert.deepEqual(pty.resizes, []);
    assert.deepEqual(manager.sessions, []);
  });

  it("cleans up a live provisional PTY when applying its pending resize throws", async () => {
    // Letting resize escape leaves a stale starting record and an owned PTY without deterministic cleanup.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const notifications = new RecordingNotifications();
    const manager = createManager(ptyFactory, logger, notifications);
    const pty = new FakeManagedPty();
    const resizeError = new Error("resize failed");
    pty.resize = () => {
      throw resizeError;
    };
    let resolveSpawn: ((value: FakeManagedPty) => void) | undefined;
    ptyFactory.spawn = async () => new Promise((resolve) => (resolveSpawn = resolve));

    const launch = manager.launch(alphaSpec);
    manager.resize("session-1", 132, 48);
    resolveSpawn?.(pty);

    assert.equal(await launch, undefined);
    assert.deepEqual(manager.sessions, []);
    assert.equal(pty.terminated, true);
    assert.equal(pty.disposed, true);
    assert.deepEqual(logger.startupErrors, [resizeError]);
    assert.deepEqual(notifications.notifications, [
      { kind: "startup-failed", spec: alphaSpec, error: resizeError }
    ]);
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
        claudeSessionId: null,
        rootId: "alpha",
        displayName: "alpha 1",
        ordinalWithinRoot: 1,
        state: "running",
        launchedImportIds: ["shared"],
        launchedAddDirPaths: ["C:\\work\\shared"],
        launchedRootLabel: "alpha",
        launchedRootPath: "C:\\work\\alpha",
        launchedAt: 1000
      }
    ]);
    assert.equal(manager.activeSessionId, "session-1");
  });

  it("activates the session that moves into an exited active middle session's index", async () => {
    // A manager that falls back to the final session selects session-4 instead of session-3 here.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const manager = createManager(ptyFactory, logger, new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    manager.activatePrevious();
    manager.activatePrevious();
    ptyFactory.ptys[1]!.emitExit({ exitCode: 0 });

    assert.deepEqual(logger.processExits, [{ sessionId: "session-2", exitCode: 0 }]);
    assert.equal(manager.activeSessionId, "session-3");
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

    ptyFactory.spawnError = undefined;
    const retry = await manager.launch(alphaSpec);
    assert.equal(retry?.displayName, "alpha 1");
    assert.equal(retry?.ordinalWithinRoot, 1);
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

  it("marks only the requested session closing until its owned PTY acknowledges exit", async () => {
    // Removing a session when terminate resolves, or terminating its sibling, would lose live ownership state.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const changedStates: string[][] = [];
    manager.onDidChangeSessions((sessions) => changedStates.push(sessions.map((session) => session.state)));

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    await manager.close("session-1");

    assert.deepEqual(manager.sessions.map((session) => ({ id: session.id, state: session.state })), [
      { id: "session-1", state: "closing" },
      { id: "session-2", state: "running" }
    ]);
    assert.equal(ptyFactory.ptys[0]?.terminated, true);
    assert.equal(ptyFactory.ptys[1]?.terminated, false);
    assert.deepEqual(changedStates.at(-1), ["closing", "running"]);

    ptyFactory.ptys[0]?.emitExit({ exitCode: 0 });

    assert.deepEqual(manager.sessions.map((session) => session.id), ["session-2"]);
  });

  it("keeps a closing session visible and logs an owned termination rejection", async () => {
    // Swallowing a terminate rejection without state/logging would prevent retry and diagnosis.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const manager = createManager(ptyFactory, logger, new RecordingNotifications());
    const terminationError = new Error("termination failed");

    await manager.launch(alphaSpec);
    ptyFactory.ptys[0]!.terminateError = terminationError;
    await manager.close("session-1");

    assert.equal(manager.sessions[0]?.state, "closing");
    assert.deepEqual(logger.terminationErrors, [{ sessionId: "session-1", error: terminationError }]);
  });

  it("reports one delayed termination acknowledgement without writing or terminating an unrelated PTY", async () => {
    // A timeout that targets another PTY or sends terminal input would violate manager ownership isolation.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const scheduler = new ManualScheduler();
    const manager = createManager(
      ptyFactory,
      logger,
      new RecordingNotifications(),
      undefined,
      { schedule: scheduler.schedule, terminationAckWarningMs: 25 }
    );

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    await manager.close("session-1");
    scheduler.runPending();

    assert.deepEqual(logger.delayedTerminations, ["session-1"]);
    assert.deepEqual(scheduler.delays, [25]);
    assert.deepEqual(ptyFactory.ptys[0]?.writes, []);
    assert.deepEqual(ptyFactory.ptys[1]?.writes, []);
    assert.equal(ptyFactory.ptys[1]?.terminated, false);
  });

  it("cancels a termination acknowledgement warning when the owned PTY exits", async () => {
    // A warning left scheduled after exit can report a terminated session as stalled.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const scheduler = new ManualScheduler();
    const manager = createManager(
      ptyFactory,
      logger,
      new RecordingNotifications(),
      undefined,
      { schedule: scheduler.schedule }
    );

    await manager.launch(alphaSpec);
    await manager.close("session-1");
    ptyFactory.ptys[0]?.emitExit({ exitCode: 0 });
    scheduler.runPending();

    assert.equal(scheduler.activeCount, 0);
    assert.deepEqual(logger.delayedTerminations, []);
  });

  it("shares concurrent close work and permits a retry after an owned termination rejection", async () => {
    // Separate close promises would duplicate termination; a permanently cached rejection would block recovery.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const manager = createManager(ptyFactory, logger, new RecordingNotifications());

    await manager.launch(alphaSpec);
    const pty = ptyFactory.ptys[0]!;
    const originalTerminate = pty.terminate.bind(pty);
    let terminationAttempts = 0;
    pty.terminate = async () => {
      terminationAttempts += 1;
      await originalTerminate();
    };

    await Promise.all([
      manager.close("session-1"),
      manager.close("session-1")
    ]);
    assert.equal(terminationAttempts, 1);

    pty.terminateError = new Error("retryable");
    await manager.close("session-1");
    await manager.close("session-1");

    assert.equal(terminationAttempts, 3);
    assert.equal(logger.terminationErrors.length, 1);
  });

  it("ignores close requests for unknown session IDs", async () => {
    // An unknown id must never affect an owned PTY or publish a phantom lifecycle state.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.close("missing");

    assert.equal(manager.sessions[0]?.state, "running");
    assert.equal(ptyFactory.ptys[0]?.terminated, false);
  });

  it("awaits a fresh specification before closing and replacing an owned session", async () => {
    // Closing before the replacement spec is ready, or reusing the old imports, would make restart destructive.
    const ptyFactory = new FakeManagedPtyFactory();
    const scheduler = new ManualScheduler();
    const manager = createManager(
      ptyFactory,
      new RecordingLogger(),
      new RecordingNotifications(),
      undefined,
      { schedule: scheduler.schedule }
    );
    const freshSpec: LaunchSpec = { ...betaSpec, root: alphaSpec.root, importedRoots: betaSpec.importedRoots };
    let provideSpec: ((spec: LaunchSpec) => void) | undefined;

    await manager.launch(alphaSpec);
    const restart = manager.restartFresh(
      "session-1",
      () => new Promise<LaunchSpec>((resolve) => (provideSpec = resolve))
    );

    assert.equal(manager.sessions[0]?.state, "running");
    assert.equal(ptyFactory.ptys.length, 1);

    provideSpec?.(freshSpec);
    const replacement = await restart;

    assert.equal(ptyFactory.ptys[0]?.terminated, true);
    assert.deepEqual(ptyFactory.spawnedSpecs, [alphaSpec, freshSpec]);
    assert.deepEqual(manager.sessions.map((session) => ({
      id: session.id,
      ordinalWithinRoot: session.ordinalWithinRoot,
      state: session.state,
      launchedImportIds: session.launchedImportIds
    })), [
      { id: "session-1", ordinalWithinRoot: 1, state: "closing", launchedImportIds: ["shared"] },
      { id: "session-2", ordinalWithinRoot: 2, state: "running", launchedImportIds: [] }
    ]);
    assert.equal(replacement?.id, "session-2");
  });

  it("leaves the original session running when fresh restart planning rejects", async () => {
    // Terminating before planning succeeds would destroy a usable session when the replacement cannot launch.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const planningError = new Error("workspace configuration unavailable");

    await manager.launch(alphaSpec);
    await assert.rejects(manager.restartFresh("session-1", async () => Promise.reject(planningError)), planningError);

    assert.equal(manager.sessions[0]?.state, "running");
    assert.equal(ptyFactory.ptys.length, 1);
    assert.equal(ptyFactory.ptys[0]?.terminated, false);
  });

  it("renames only the selected live session without changing its launch identity", async () => {
    // Replacing any field besides displayName, mutating an old snapshot, or renaming a sibling must fail.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const changes: Array<readonly ManagedSessionSnapshot[]> = [];
    manager.onDidChangeSessions((sessions) => changes.push(sessions));

    const alpha = await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    const alphaPty = ptyFactory.ptys[0];

    assert.equal(alpha?.launchedRootLabel, "alpha");
    assert.equal(alpha?.launchedRootPath, "C:\\work\\alpha");
    manager.rename("session-1", "  API migration  ");
    assert.equal(manager.sessions[0]?.launchedRootPath, "C:\\work\\alpha");

    assert.equal(alpha?.displayName, "alpha 1");
    assert.deepEqual(manager.sessions.map((session) => ({
      id: session.id,
      claudeSessionId: session.claudeSessionId,
      rootId: session.rootId,
      displayName: session.displayName,
      ordinalWithinRoot: session.ordinalWithinRoot,
      launchedAt: session.launchedAt
    })), [
      {
        id: "session-1",
        claudeSessionId: null,
        rootId: "alpha",
        displayName: "API migration",
        ordinalWithinRoot: 1,
        launchedAt: 1000
      },
      {
        id: "session-2",
        claudeSessionId: null,
        rootId: "beta",
        displayName: "beta 1",
        ordinalWithinRoot: 1,
        launchedAt: 1000
      }
    ]);
    assert.equal(ptyFactory.ptys[0], alphaPty);
    assert.equal(manager.activeSessionId, "session-2");
    assert.equal(changes.at(-1)?.[0]?.displayName, "API migration");
  });

  it("ignores blank, unchanged, and unknown session renames", async () => {
    // Invalid rename requests must not publish state or alter a valid generated name.
    const manager = createManager(
      new FakeManagedPtyFactory(),
      new RecordingLogger(),
      new RecordingNotifications()
    );
    let changes = 0;
    manager.onDidChangeSessions(() => changes += 1);
    await manager.launch(alphaSpec);
    const changesAfterLaunch = changes;

    manager.rename("session-1", "   ");
    manager.rename("session-1", "alpha 1");
    manager.rename("missing", "renamed");

    assert.equal(manager.sessions[0]?.displayName, "alpha 1");
    assert.equal(changes, changesAfterLaunch);
  });

  it("wraps previous and next activation through launch order", async () => {
    // A non-circular navigator or root-grouped order would select the wrong session at either boundary.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    await manager.launch(alphaSpec);
    manager.activateNext();
    assert.equal(manager.activeSessionId, "session-1");

    manager.activatePrevious();
    assert.equal(manager.activeSessionId, "session-3");
  });

  it("leaves empty and single-session navigation unchanged", async () => {
    // Navigation that invents an active ID or clears the lone active session would break command no-ops.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    manager.activatePrevious();
    manager.activateNext();
    assert.equal(manager.activeSessionId, undefined);

    await manager.launch(alphaSpec);
    manager.activatePrevious();
    manager.activateNext();
    assert.equal(manager.activeSessionId, "session-1");
  });

  it("navigates to starting and closing sessions while they remain live records", async () => {
    // Filtering lifecycle states from navigation would make live starting or closing sessions unreachable.
    const ptyFactory = new FakeManagedPtyFactory();
    const originalSpawn = ptyFactory.spawn.bind(ptyFactory);
    let resolveStartingPty: ((pty: Awaited<ReturnType<typeof originalSpawn>>) => void) | undefined;
    ptyFactory.spawn = async (spec) => {
      if (spec === alphaSpec) {
        return new Promise((resolve) => (resolveStartingPty = resolve));
      }
      return originalSpawn(spec);
    };
    const scheduler = new ManualScheduler();
    const manager = createManager(
      ptyFactory,
      new RecordingLogger(),
      new RecordingNotifications(),
      undefined,
      { schedule: scheduler.schedule }
    );

    const startingLaunch = manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    await manager.close("session-2");
    manager.activatePrevious();
    assert.equal(manager.activeSessionId, "session-1");

    manager.activateNext();
    assert.equal(manager.activeSessionId, "session-2");
    const startingPty = await originalSpawn(alphaSpec);
    resolveStartingPty?.(startingPty);
    await startingLaunch;
  });

  it("terminate-all terminates every owned PTY once and logs their IDs in launch order", async () => {
    // Omitting a live record, changing order, or issuing duplicate terminate calls leaves shutdown nondeterministic.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const scheduler = new ManualScheduler();
    const manager = createManager(
      ptyFactory,
      logger,
      new RecordingNotifications(),
      undefined,
      { schedule: scheduler.schedule }
    );

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    await manager.launch(alphaSpec);
    const attempts = ptyFactory.ptys.map(countTerminationAttempts);
    await manager.terminateAll();

    assert.deepEqual(logger.shutdowns, [["session-1", "session-2", "session-3"]]);
    assert.deepEqual(attempts.map((getAttempts) => getAttempts()), [1, 1, 1]);
    assert.deepEqual(manager.sessions.map((session) => session.state), ["closing", "closing", "closing"]);
  });

  it("terminates every owned PTY once when shutdown logging throws", async () => {
    // A diagnostic failure must not prevent cleanup of any managed child process.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(
      ptyFactory,
      new ThrowingShutdownLogger(),
      new RecordingNotifications()
    );

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    const attempts = ptyFactory.ptys.map(countTerminationAttempts);

    await assert.doesNotReject(manager.terminateAll());

    assert.deepEqual(attempts.map((getAttempts) => getAttempts()), [1, 1]);
  });

  it("shares terminate-all work across concurrent and later calls", async () => {
    // Re-running shutdown after the aggregate settles must not re-terminate already owned PTYs.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    const getAttempts = countTerminationAttempts(ptyFactory.ptys[0]!);
    await Promise.all([manager.terminateAll(), manager.terminateAll()]);
    await manager.terminateAll();

    assert.equal(getAttempts(), 1);
  });

  it("does not touch unregistered PTYs during terminate-all", async () => {
    // A shutdown that discovers processes beyond the registry violates explicit PTY ownership.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const unregisteredPty = new FakeManagedPty();

    await manager.launch(alphaSpec);
    await manager.terminateAll();

    assert.equal(ptyFactory.ptys[0]?.terminated, true);
    assert.equal(unregisteredPty.terminated, false);
  });

  it("continues terminate-all after an owned PTY rejection and logs the failure", async () => {
    // A rejected termination must not short-circuit attempts for other registered PTYs.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const manager = createManager(ptyFactory, logger, new RecordingNotifications());
    const terminationError = new Error("first process refused termination");

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    ptyFactory.ptys[0]!.terminateError = terminationError;
    await manager.terminateAll();

    assert.equal(ptyFactory.ptys[1]?.terminated, true);
    assert.deepEqual(logger.terminationErrors, [{ sessionId: "session-1", error: terminationError }]);
  });

  it("starts the same logged termination path during disposal without rejecting", async () => {
    // Disposing without the aggregate shutdown path can leak an owned PTY or an unhandled rejection.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const manager = createManager(ptyFactory, logger, new RecordingNotifications());
    const terminationError = new Error("dispose termination failure");

    await manager.launch(alphaSpec);
    ptyFactory.ptys[0]!.terminateError = terminationError;
    manager.dispose();
    await manager.terminateAll();

    assert.deepEqual(logger.shutdowns, [["session-1"]]);
    assert.deepEqual(logger.terminationErrors, [{ sessionId: "session-1", error: terminationError }]);
    assert.equal(ptyFactory.ptys[0]?.disposed, true);
  });

  it("immediately terminates and disposes a PTY whose provisional launch resolves after disposal", async () => {
    // A late spawn result that is neither terminated nor disposed leaks a manager-owned child process.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const latePty = new FakeManagedPty();
    let resolveSpawn: ((pty: FakeManagedPty) => void) | undefined;
    ptyFactory.spawn = async () => new Promise((resolve) => (resolveSpawn = resolve));

    const launch = manager.launch(alphaSpec);
    manager.dispose();
    resolveSpawn?.(latePty);
    await launch;

    assert.equal(latePty.terminated, true);
    assert.equal(latePty.disposed, true);
    assert.deepEqual(manager.sessions, []);
  });

  it("refuses direct launches after shutdown or disposal begins", async () => {
    // A terminal manager that accepts a new launch can orphan that PTY after its cached shutdown completes.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.terminateAll();
    assert.equal(await manager.launch(alphaSpec), undefined);
    manager.dispose();
    assert.equal(await manager.launch(betaSpec), undefined);
    assert.deepEqual(ptyFactory.ptys, []);
  });

  it("refuses a restart whose planning resolves after shutdown begins", async () => {
    // A restart resuming after shutdown must not create a replacement PTY outside the shutdown snapshot.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    let resolveSpec: ((spec: LaunchSpec) => void) | undefined;

    await manager.launch(alphaSpec);
    const restart = manager.restartFresh(
      "session-1",
      () => new Promise<LaunchSpec>((resolve) => (resolveSpec = resolve))
    );
    await manager.terminateAll();
    resolveSpec?.(betaSpec);

    assert.equal(await restart, undefined);
    assert.equal(ptyFactory.ptys.length, 1);
    assert.equal(ptyFactory.ptys[0]?.terminated, true);
  });

  it("suppresses startup failure reporting when a pending spawn rejects after disposal", async () => {
    // A post-disposal startup notification is stale and can revive UI state after shutdown.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const notifications = new RecordingNotifications();
    const manager = createManager(ptyFactory, logger, notifications);
    const spawnError = new Error("late spawn failure");
    let rejectSpawn: ((error: Error) => void) | undefined;
    ptyFactory.spawn = async () => new Promise((_, reject) => (rejectSpawn = reject));

    const launch = manager.launch(alphaSpec);
    manager.dispose();
    rejectSpawn?.(spawnError);
    assert.equal(await launch, undefined);

    assert.deepEqual(logger.startupErrors, []);
    assert.deepEqual(notifications.notifications, []);
  });

  it("continues close and shutdown when session listeners throw or unsubscribe", async () => {
    // Presentation listener failures must not block termination of owned PTYs.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    const subscription = manager.onDidChangeSessions(() => subscription.dispose());
    manager.onDidChangeSessions(() => {
      throw new Error("panel failed");
    });

    await manager.close("session-1");
    await manager.terminateAll();

    assert.equal(ptyFactory.ptys[0]?.terminated, true);
    assert.equal(ptyFactory.ptys[1]?.terminated, true);
  });

  it("continues data and exit cleanup when listeners throw", async () => {
    // A terminal/data listener exception must not retain the dead record or escape the PTY callback.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    manager.onDidReceiveData(() => {
      throw new Error("data panel failed");
    });
    manager.onDidChangeSessions(() => {
      throw new Error("session panel failed");
    });
    ptyFactory.ptys[0]?.emitData("ignored");
    ptyFactory.ptys[0]?.emitExit({ exitCode: 0 });

    assert.deepEqual(manager.sessions, []);
    assert.equal(ptyFactory.ptys[0]?.disposed, true);
  });

  it("removes a closing provisional record when its spawn resolves after terminate-all", async () => {
    // A terminal launch that retains its provisional record leaves stale closing UI state forever.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const latePty = new FakeManagedPty();
    let resolveSpawn: ((pty: FakeManagedPty) => void) | undefined;
    ptyFactory.spawn = async () => new Promise((resolve) => (resolveSpawn = resolve));

    const launch = manager.launch(alphaSpec);
    await manager.terminateAll();
    resolveSpawn?.(latePty);
    await launch;

    assert.deepEqual(manager.sessions, []);
    assert.equal(latePty.terminated, true);
    assert.equal(latePty.disposed, true);
  });

  it("removes a closing provisional record when its spawn rejects after terminate-all", async () => {
    // A terminal launch rejection must clear its provisional record without emitting stale startup failure UI.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const notifications = new RecordingNotifications();
    const manager = createManager(ptyFactory, logger, notifications);
    const spawnError = new Error("late shutdown rejection");
    let rejectSpawn: ((error: Error) => void) | undefined;
    ptyFactory.spawn = async () => new Promise((_, reject) => (rejectSpawn = reject));

    const launch = manager.launch(alphaSpec);
    await manager.terminateAll();
    rejectSpawn?.(spawnError);
    await launch;

    assert.deepEqual(manager.sessions, []);
    assert.deepEqual(logger.startupErrors, []);
    assert.deepEqual(notifications.notifications, []);
  });
});
