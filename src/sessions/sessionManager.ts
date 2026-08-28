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
      reachedRunning: false
    };
    this.records.push(record);
    this.currentActiveSessionId = id;
    this.publishSessions();

    let pty: ManagedPty;
    try {
      pty = await this.dependencies.ptyFactory.spawn(spec);
    } catch (error) {
      this.removeRecord(record);
      this.dependencies.logger.startupError(error);
      this.dependencies.notifications.notify({ kind: "startup-failed", spec, error });
      return undefined;
    }

    record.pty = pty;
    record.dataSubscription = pty.onData((data) => {
      this.dataReceived.fire(Object.freeze({ sessionId: record.id, data }));
    });
    record.exitSubscription = pty.onExit((event) => this.handleExit(record, event));

    if (!this.records.includes(record)) {
      return undefined;
    }
    record.reachedRunning = true;
    record.snapshot = createSnapshot({ ...record.snapshot, state: "running" });
    this.publishSessions();
    return record.snapshot;
  }

  dispose(): void {
    this.records.forEach((record) => this.disposeSubscriptions(record));
    this.records.splice(0);
    this.currentActiveSessionId = undefined;
    this.sessionChanges.dispose();
    this.dataReceived.dispose();
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
    this.disposeSubscriptions(record);
    if (this.currentActiveSessionId === record.id) {
      const replacement = this.records[index] ?? this.records[index - 1];
      this.currentActiveSessionId = replacement?.id;
    }
    this.publishSessions();
  }

  private disposeSubscriptions(record: SessionRecord): void {
    record.dataSubscription?.dispose();
    record.exitSubscription?.dispose();
    record.dataSubscription = undefined;
    record.exitSubscription = undefined;
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
    this.listeners.forEach((listener) => listener(value));
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
