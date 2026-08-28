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

function closeSession(manager: SessionManager, id: string): Promise<void> {
  return (
    (manager as unknown as { close?: (sessionId: string) => Promise<void> }).close?.(id) ??
    Promise.resolve()
  );
}

function restartSession(
  manager: SessionManager,
  id: string,
  getCurrentSpec: () => Promise<LaunchSpec>
): Promise<ManagedSessionSnapshot | undefined> {
  return (
    (manager as unknown as {
      restartFresh?: (
        sessionId: string,
        getSpec: () => Promise<LaunchSpec>
      ) => Promise<ManagedSessionSnapshot | undefined>;
    }).restartFresh?.(id, getCurrentSpec) ?? Promise.resolve(undefined)
  );
}

function activatePreviousSession(manager: SessionManager): void {
  (manager as unknown as { activatePrevious?: () => void }).activatePrevious?.();
}

function activateNextSession(manager: SessionManager): void {
  (manager as unknown as { activateNext?: () => void }).activateNext?.();
}

function terminateAllSessions(manager: SessionManager): Promise<void> {
  return (
    (manager as unknown as { terminateAll?: () => Promise<void> }).terminateAll?.() ?? Promise.resolve()
  );
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

  it("activates the session that moves into an exited active middle session's index", async () => {
    // A manager that falls back to the final session selects session-4 instead of session-3 here.
    const ptyFactory = new FakeManagedPtyFactory();
    const logger = new RecordingLogger();
    const manager = createManager(ptyFactory, logger, new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    (manager as unknown as { currentActiveSessionId: string }).currentActiveSessionId = "session-2";
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
    await closeSession(manager, "session-1");

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
    await closeSession(manager, "session-1");

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
    await closeSession(manager, "session-1");
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
    await closeSession(manager, "session-1");
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
      closeSession(manager, "session-1"),
      closeSession(manager, "session-1")
    ]);
    assert.equal(terminationAttempts, 1);

    pty.terminateError = new Error("retryable");
    await closeSession(manager, "session-1");
    await closeSession(manager, "session-1");

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
    const restart = restartSession(
      manager,
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
    await assert.rejects(restartSession(manager, "session-1", async () => Promise.reject(planningError)), planningError);

    assert.equal(manager.sessions[0]?.state, "running");
    assert.equal(ptyFactory.ptys.length, 1);
    assert.equal(ptyFactory.ptys[0]?.terminated, false);
  });

  it("wraps previous and next activation through launch order", async () => {
    // A non-circular navigator or root-grouped order would select the wrong session at either boundary.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    await manager.launch(betaSpec);
    await manager.launch(alphaSpec);
    activateNextSession(manager);
    assert.equal(manager.activeSessionId, "session-1");

    activatePreviousSession(manager);
    assert.equal(manager.activeSessionId, "session-3");
  });

  it("leaves empty and single-session navigation unchanged", async () => {
    // Navigation that invents an active ID or clears the lone active session would break command no-ops.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    activatePreviousSession(manager);
    activateNextSession(manager);
    assert.equal(manager.activeSessionId, undefined);

    await manager.launch(alphaSpec);
    activatePreviousSession(manager);
    activateNextSession(manager);
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
    activatePreviousSession(manager);
    assert.equal(manager.activeSessionId, "session-1");

    activateNextSession(manager);
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
    await terminateAllSessions(manager);

    assert.deepEqual(logger.shutdowns, [["session-1", "session-2", "session-3"]]);
    assert.deepEqual(attempts.map((getAttempts) => getAttempts()), [1, 1, 1]);
    assert.deepEqual(manager.sessions.map((session) => session.state), ["closing", "closing", "closing"]);
  });

  it("shares terminate-all work across concurrent and later calls", async () => {
    // Re-running shutdown after the aggregate settles must not re-terminate already owned PTYs.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());

    await manager.launch(alphaSpec);
    const getAttempts = countTerminationAttempts(ptyFactory.ptys[0]!);
    await Promise.all([terminateAllSessions(manager), terminateAllSessions(manager)]);
    await terminateAllSessions(manager);

    assert.equal(getAttempts(), 1);
  });

  it("does not touch unregistered PTYs during terminate-all", async () => {
    // A shutdown that discovers processes beyond the registry violates explicit PTY ownership.
    const ptyFactory = new FakeManagedPtyFactory();
    const manager = createManager(ptyFactory, new RecordingLogger(), new RecordingNotifications());
    const unregisteredPty = new FakeManagedPty();

    await manager.launch(alphaSpec);
    await terminateAllSessions(manager);

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
    await terminateAllSessions(manager);

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
    await terminateAllSessions(manager);

    assert.deepEqual(logger.shutdowns, [["session-1"]]);
    assert.deepEqual(logger.terminationErrors, [{ sessionId: "session-1", error: terminationError }]);
  });
});
