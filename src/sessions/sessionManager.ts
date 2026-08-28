import type * as vscode from "vscode";

import type { LaunchSpec } from "../launch/launchPlanner";
import type { ManagedPty, ManagedPtyFactory } from "../launch/managedPty";
import type {
  ManagedSessionSnapshot,
  SessionDataEvent,
  SessionId,
  SessionLifecycleLogger,
  SessionNotificationSink
} from "./sessionTypes";

/** Dependencies required to create and observe live Claude sessions. */
export interface SessionManagerDependencies {
  readonly ptyFactory: ManagedPtyFactory;
  readonly createId: () => SessionId;
  readonly now: () => number;
  readonly logger: SessionLifecycleLogger;
  readonly notifications: SessionNotificationSink;
  readonly terminationAckWarningMs?: number;
  readonly schedule?: (callback: () => void, delayMs: number) => vscode.Disposable;
}

interface SessionRecord {
  readonly id: SessionId;
  readonly spec: LaunchSpec;
  readonly launchedImportIds: readonly string[];
  snapshot: ManagedSessionSnapshot;
  pty: ManagedPty | undefined;
  dataSubscription: vscode.Disposable | undefined;
  exitSubscription: vscode.Disposable | undefined;
  terminationWarning: vscode.Disposable | undefined;
  closeOperation: Promise<void> | undefined;
  reachedRunning: boolean;
}

/** Owns live PTYs while exposing immutable session state to presentation code. */
export class SessionManager implements vscode.Disposable {
  readonly onDidChangeSessions: vscode.Event<readonly ManagedSessionSnapshot[]>;
  readonly onDidReceiveData: vscode.Event<SessionDataEvent>;
  private readonly sessionChanges = new ListenerSet<readonly ManagedSessionSnapshot[]>();
  private readonly dataReceived = new ListenerSet<SessionDataEvent>();
  private readonly records: SessionRecord[] = [];
  private readonly rootOrdinals = new Map<string, number>();
  private currentActiveSessionId: SessionId | undefined;
  private terminationAllOperation: Promise<void> | undefined;
  private terminal = false;

  constructor(private readonly dependencies: SessionManagerDependencies) {
    this.onDidChangeSessions = this.sessionChanges.event;
    this.onDidReceiveData = this.dataReceived.event;
  }

  get sessions(): readonly ManagedSessionSnapshot[] {
    return this.freezeSessionArray();
  }

  get activeSessionId(): SessionId | undefined {
    return this.currentActiveSessionId;
  }

  /** Publishes a provisional session, starts its PTY, then promotes it to running. */
  async launch(spec: LaunchSpec): Promise<ManagedSessionSnapshot | undefined> {
    if (this.terminal) {
      return undefined;
    }
    const rootId = spec.root.id;
    const launchedImportIds = Object.freeze(spec.importedRoots.map((root) => root.id));
    const ordinalWithinRoot = (this.rootOrdinals.get(rootId) ?? 0) + 1;
    this.rootOrdinals.set(rootId, ordinalWithinRoot);
    const id = this.dependencies.createId();
    const record: SessionRecord = {
      id,
      spec,
      launchedImportIds,
      snapshot: createSnapshot({
        id,
        rootId,
        displayName: `${spec.root.label} ${ordinalWithinRoot}`,
        ordinalWithinRoot,
        state: "starting",
        launchedImportIds,
        launchedAt: this.dependencies.now()
      }),
      pty: undefined,
      dataSubscription: undefined,
      exitSubscription: undefined,
      terminationWarning: undefined,
      closeOperation: undefined,
      reachedRunning: false
    };
    this.records.push(record);
    this.currentActiveSessionId = id;
    this.publishSessions();

    let pty: ManagedPty;
    try {
      pty = await this.dependencies.ptyFactory.spawn(spec);
    } catch (error) {
      if (this.terminal) {
        this.removeRecord(record);
        return undefined;
      }
      this.removeRecord(record);
      this.dependencies.logger.startupError(error);
      this.dependencies.notifications.notify({ kind: "startup-failed", spec, error });
      return undefined;
    }

    if (this.terminal || !this.records.includes(record)) {
      if (this.records.includes(record)) {
        this.removeRecord(record);
      }
      this.abandonPty(record.id, pty);
      return undefined;
    }

    record.pty = pty;
    record.dataSubscription = pty.onData((data) => {
      this.dataReceived.fire(Object.freeze({ sessionId: record.id, data }));
    });
    record.exitSubscription = pty.onExit((event) => this.handleExit(record, event));

    if (this.terminal || !this.records.includes(record)) {
      if (this.terminal) {
        this.abandonPty(record.id, pty);
      }
      return undefined;
    }
    if (record.snapshot.state === "closing") {
      void this.close(record.id);
      return record.snapshot;
    }
    record.reachedRunning = true;
    record.snapshot = createSnapshot({ ...record.snapshot, state: "running" });
    this.publishSessions();
    return record.snapshot;
  }

  /** Marks one owned session for closure and requests termination from its PTY. */
  close(id: SessionId): Promise<void> {
    const record = this.records.find((candidate) => candidate.id === id);
    if (record === undefined) {
      return Promise.resolve();
    }
    this.transitionToClosing([record]);
    return this.terminateRecord(record);
  }

  /** Starts one registry-scoped shutdown operation for every PTY this manager owns. */
  terminateAll(): Promise<void> {
    this.terminal = true;
    if (this.terminationAllOperation !== undefined) {
      return this.terminationAllOperation;
    }
    const records = [...this.records];
    this.dependencies.logger.shutdown(records.map((record) => record.id));
    this.transitionToClosing(records);
    const operation = Promise.allSettled(records.map((record) => this.terminateRecord(record))).then(
      () => undefined
    );
    this.terminationAllOperation = operation;
    return operation;
  }

  /** Begins the manager's idempotent shutdown path without exposing a disposal-time rejection. */
  dispose(): void {
    this.terminal = true;
    void this.terminateAll();
    this.records.forEach((record) => this.disposeRecord(record));
    this.records.splice(0);
    this.currentActiveSessionId = undefined;
    this.sessionChanges.dispose();
    this.dataReceived.dispose();
  }

  /** Runs one owned PTY termination attempt and clears its retry guard once it settles. */
  private terminateRecord(record: SessionRecord): Promise<void> {
    if (record.closeOperation !== undefined) {
      return record.closeOperation;
    }
    const operation = (record.pty?.terminate() ?? Promise.resolve())
      .catch((error: unknown) => this.dependencies.logger.terminationError(record.id, error))
      .then(() => {
        if (record.closeOperation === operation) {
          record.closeOperation = undefined;
        }
      });
    record.closeOperation = operation;
    return operation;
  }

  /** Plans a fresh session before closing the selected owned session and launching its replacement. */
  async restartFresh(
    id: SessionId,
    getCurrentSpec: () => Promise<LaunchSpec>
  ): Promise<ManagedSessionSnapshot | undefined> {
    const spec = await getCurrentSpec();
    if (this.terminal) {
      return undefined;
    }
    await this.close(id);
    if (this.terminal) {
      return undefined;
    }
    return this.launch(spec);
  }

  /** Activates the preceding live session in launch order, wrapping at the first session. */
  activatePrevious(): void {
    this.activateRelativeToCurrent(-1);
  }

  /** Activates the following live session in launch order, wrapping at the final session. */
  activateNext(): void {
    this.activateRelativeToCurrent(1);
  }

  private handleExit(
    record: SessionRecord,
    event: { readonly exitCode: number; readonly signal?: number }
  ): void {
    const index = this.records.indexOf(record);
    if (index < 0) {
      return;
    }
    this.dependencies.logger.processExit(record.id, event.exitCode, event.signal);
    const exitedBeforeRunning = !record.reachedRunning;
    this.removeRecord(record, index);
    if (exitedBeforeRunning && event.exitCode !== 0) {
      this.dependencies.notifications.notify({
        kind: "immediate-nonzero-exit",
        sessionId: record.id,
        spec: record.spec,
        exitCode: event.exitCode,
        ...(event.signal === undefined ? {} : { signal: event.signal })
      });
    }
  }

  private removeRecord(record: SessionRecord, knownIndex?: number): void {
    const index = knownIndex ?? this.records.indexOf(record);
    if (index < 0) {
      return;
    }
    this.records.splice(index, 1);
    this.disposeRecord(record);
    if (this.currentActiveSessionId === record.id) {
      const replacement = this.records[index] ?? this.records[index - 1];
      this.currentActiveSessionId = replacement?.id;
    }
    this.publishSessions();
  }

  /** Releases every resource owned by a record after it has left the live registry. */
  private disposeRecord(record: SessionRecord): void {
    record.dataSubscription?.dispose();
    record.exitSubscription?.dispose();
    record.terminationWarning?.dispose();
    record.dataSubscription = undefined;
    record.exitSubscription = undefined;
    record.terminationWarning = undefined;
    record.pty?.dispose();
    record.pty = undefined;
  }

  /** Immediately tears down a PTY returned after the manager has relinquished its record. */
  private abandonPty(sessionId: SessionId, pty: ManagedPty): void {
    void pty.terminate().catch((error: unknown) =>
      this.dependencies.logger.terminationError(sessionId, error)
    );
    pty.dispose();
  }

  /** Logs a diagnostic if an owned PTY does not acknowledge termination in time. */
  private scheduleTerminationWarning(record: SessionRecord): void {
    if (record.terminationWarning !== undefined) {
      return;
    }
    const schedule = this.dependencies.schedule ?? scheduleTimeout;
    record.terminationWarning = schedule(() => {
      if (this.records.includes(record) && record.snapshot.state === "closing") {
        this.dependencies.logger.terminationDelayed(record.id);
      }
    }, this.dependencies.terminationAckWarningMs ?? 2_000);
  }

  /** Marks a stable snapshot of live records closing before any owned PTY receives termination. */
  private transitionToClosing(records: readonly SessionRecord[]): void {
    let changed = false;
    records.forEach((record) => {
      if (record.snapshot.state !== "closing") {
        record.snapshot = createSnapshot({ ...record.snapshot, state: "closing" });
        changed = true;
      }
      this.scheduleTerminationWarning(record);
    });
    if (changed) {
      this.publishSessions();
    }
  }

  /** Changes active selection by an offset over every record still awaiting its exit acknowledgement. */
  private activateRelativeToCurrent(offset: 1 | -1): void {
    if (this.records.length < 2 || this.currentActiveSessionId === undefined) {
      return;
    }
    const currentIndex = this.records.findIndex(
      (record) => record.id === this.currentActiveSessionId
    );
    if (currentIndex < 0) {
      return;
    }
    const nextIndex = (currentIndex + offset + this.records.length) % this.records.length;
    const nextId = this.records[nextIndex]!.id;
    if (nextId === this.currentActiveSessionId) {
      return;
    }
    this.currentActiveSessionId = nextId;
    this.publishSessions();
  }

  private publishSessions(): void {
    this.sessionChanges.fire(this.freezeSessionArray());
  }

  private freezeSessionArray(): readonly ManagedSessionSnapshot[] {
    return Object.freeze(this.records.map((record) => record.snapshot));
  }
}

/** A minimal VS Code-shaped event implementation for Node-only unit tests. */
class ListenerSet<T> implements vscode.Disposable {
  readonly event: vscode.Event<T> = (listener, thisArgs, disposables) => {
    const boundListener = (value: T): void => listener.call(thisArgs, value);
    this.listeners.add(boundListener);
    const subscription: vscode.Disposable = {
      dispose: () => this.listeners.delete(boundListener)
    };
    disposables?.push(subscription);
    return subscription;
  };
  private readonly listeners = new Set<(value: T) => void>();

  fire(value: T): void {
    [...this.listeners].forEach((listener) => {
      try {
        listener(value);
      } catch {
        // Presentation listeners cannot compromise manager process ownership.
      }
    });
  }

  dispose(): void {
    this.listeners.clear();
  }
}

function createSnapshot(snapshot: ManagedSessionSnapshot): ManagedSessionSnapshot {
  return Object.freeze({
    ...snapshot,
    launchedImportIds: Object.freeze([...snapshot.launchedImportIds])
  });
}

/** Schedules a cancellable diagnostic callback when VS Code does not provide a scheduler. */
function scheduleTimeout(callback: () => void, delayMs: number): vscode.Disposable {
  const timeout = setTimeout(callback, delayMs);
  return { dispose: () => clearTimeout(timeout) };
}
