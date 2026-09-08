import type * as vscode from "vscode";

import {
  isCalendarValidRfc3339Timestamp,
  isCanonicalUuid
} from "./resumableSessionValidation";

const SESSION_STORE_KEY = "claudeWorkspaces.resumableSessions";
const INVALID_DOCUMENT_MESSAGE = "Discarded invalid Claude Workspaces resumable sessions.";

/** Immutable metadata needed to offer a previously launched Claude session for resumption. */
export interface ResumableSessionSnapshot {
  readonly claudeSessionId: string;
  readonly displayName: string;
  readonly rootId: string;
  readonly rootLabel: string;
  readonly rootPath: string;
  readonly createdAt: string;
  readonly lastLaunchedAt: string;
}

/** Version-1 workspace-state document for persisted resumable session metadata. */
export interface ResumableSessionDocumentV1 {
  readonly schemaVersion: 1;
  readonly sessions: readonly ResumableSessionSnapshot[];
}

/** Persists validated resumable-session metadata in VS Code workspace state. */
export class ResumableSessionStore implements vscode.Disposable {
  readonly onDidChangeSessions: vscode.Event<readonly ResumableSessionSnapshot[]>;
  private readonly sessionChanges = new ListenerSet<readonly ResumableSessionSnapshot[]>();
  private currentSessions: readonly ResumableSessionSnapshot[];
  private writeChain: Promise<void>;

  /**
   * Creates a store from workspace-local extension state.
   *
   * @param workspaceState - VS Code state storage scoped to the current workspace.
   * @param logError - Receives a diagnostic whenever invalid persisted data is discarded.
   */
  constructor(
    private readonly workspaceState: Pick<vscode.Memento, "get" | "update">,
    private readonly logError: (message: string) => void
  ) {
    this.onDidChangeSessions = this.sessionChanges.event;
    const rawDocument = this.workspaceState.get<unknown>(SESSION_STORE_KEY);
    const document = parseDocument(rawDocument);
    this.currentSessions = document?.sessions ?? emptySessions();
    this.writeChain = Promise.resolve();

    if (rawDocument !== undefined && document === undefined) {
      this.logError(INVALID_DOCUMENT_MESSAGE);
      this.writeChain = Promise.resolve(
        this.workspaceState.update(SESSION_STORE_KEY, createDocument(this.currentSessions))
      ).catch(() => undefined);
    }
  }

  /** Returns the current normalized snapshots in resumption order. */
  get sessions(): readonly ResumableSessionSnapshot[] {
    return this.currentSessions;
  }

  /** Adds or replaces a session snapshot after its workspace-state write succeeds. */
  upsert(session: ResumableSessionSnapshot): Promise<void> {
    return this.enqueue(async () => {
      const normalized = createSnapshot(session);
      const replacement = this.currentSessions.filter(
        (candidate) => candidate.claudeSessionId !== normalized.claudeSessionId
      );
      replacement.push(normalized);
      await this.persist(replacement);
    });
  }

  /** Replaces metadata only if the record still exists when this queued mutation runs. */
  updateExisting(session: ResumableSessionSnapshot): Promise<void> {
    return this.enqueue(async () => {
      const normalized = createSnapshot(session);
      // Earlier Forget writes must finish before deciding whether a resume may update this UUID.
      if (!this.currentSessions.some((candidate) => candidate.claudeSessionId === normalized.claudeSessionId)) {
        return;
      }
      await this.persist(this.currentSessions.map((candidate) =>
        candidate.claudeSessionId === normalized.claudeSessionId ? normalized : candidate
      ));
    });
  }

  /** Renames an existing snapshot, ignoring blank, unchanged, and unknown session ids. */
  rename(claudeSessionId: string, displayName: string): Promise<void> {
    return this.enqueue(async () => {
      const normalizedName = displayName.trim();
      const existing = this.currentSessions.find(
        (session) => session.claudeSessionId === claudeSessionId
      );
      if (
        existing === undefined ||
        normalizedName.length === 0 ||
        normalizedName === existing.displayName
      ) {
        return;
      }
      await this.persist(
        this.currentSessions.map((session) =>
          session.claudeSessionId === claudeSessionId
            ? createSnapshot({ ...session, displayName: normalizedName })
            : session
        )
      );
    });
  }

  /** Removes an existing snapshot, leaving unknown session ids unchanged. */
  forget(claudeSessionId: string): Promise<void> {
    return this.enqueue(async () => {
      const remaining = this.currentSessions.filter(
        (session) => session.claudeSessionId !== claudeSessionId
      );
      if (remaining.length === this.currentSessions.length) {
        return;
      }
      await this.persist(remaining);
    });
  }

  /** Releases all registered change listeners. */
  dispose(): void {
    this.sessionChanges.dispose();
  }

  /** Queues a mutation so each operation reads the result of every preceding write. */
  private enqueue(operation: () => Promise<void>): Promise<void> {
    const operationResult = this.writeChain.then(operation);
    this.writeChain = operationResult.catch(() => undefined);
    return operationResult;
  }

  /** Saves and publishes a normalized snapshot only once workspace state accepts it. */
  private async persist(sessions: readonly ResumableSessionSnapshot[]): Promise<void> {
    const normalized = normalizeSessions(sessions);
    await this.workspaceState.update(SESSION_STORE_KEY, createDocument(normalized));
    this.currentSessions = normalized;
    this.sessionChanges.fire(normalized);
  }
}

/** Parses one recognized document version without accepting partially valid session metadata. */
function parseDocument(rawDocument: unknown): ResumableSessionDocumentV1 | undefined {
  if (!isRecord(rawDocument) || rawDocument.schemaVersion !== 1 || !Array.isArray(rawDocument.sessions)) {
    return undefined;
  }
  try {
    return createDocument(normalizeSessions(rawDocument.sessions));
  } catch {
    return undefined;
  }
}

/** Validates, copies, freezes, and orders snapshots for every persistence boundary. */
function normalizeSessions(sessions: readonly unknown[]): readonly ResumableSessionSnapshot[] {
  const seenSessionIds = new Set<string>();
  const normalized = sessions.map((session) => {
    const snapshot = createSnapshot(session);
    if (seenSessionIds.has(snapshot.claudeSessionId)) {
      throw new TypeError("Resumable session document contains duplicate Claude session ids.");
    }
    seenSessionIds.add(snapshot.claudeSessionId);
    return snapshot;
  });
  normalized.sort(compareSnapshots);
  return Object.freeze(normalized);
}

/** Creates a trusted snapshot from a record at the store's validation boundary. */
function createSnapshot(value: unknown): ResumableSessionSnapshot {
  if (!isRecord(value)) {
    throw new TypeError("Resumable session metadata must be an object.");
  }
  const claudeSessionId = readCanonicalUuid(value.claudeSessionId);
  const displayName = readRequiredString(value.displayName);
  const rootId = readRequiredString(value.rootId);
  const rootLabel = readRequiredString(value.rootLabel);
  const rootPath = readRequiredString(value.rootPath);
  const createdAt = readIsoTimestamp(value.createdAt);
  const lastLaunchedAt = readIsoTimestamp(value.lastLaunchedAt);
  return Object.freeze({
    claudeSessionId,
    displayName,
    rootId,
    rootLabel,
    rootPath,
    createdAt,
    lastLaunchedAt
  });
}

/** Creates the only document shape written by this store. */
function createDocument(
  sessions: readonly ResumableSessionSnapshot[]
): ResumableSessionDocumentV1 {
  return Object.freeze({ schemaVersion: 1, sessions });
}

/** Returns the immutable empty snapshot shared by absent and reset workspace state. */
function emptySessions(): readonly ResumableSessionSnapshot[] {
  return Object.freeze([]);
}

/** Sorts latest launches first and resolves identical times by their stable session identity. */
function compareSnapshots(left: ResumableSessionSnapshot, right: ResumableSessionSnapshot): number {
  const launchDifference = Date.parse(right.lastLaunchedAt) - Date.parse(left.lastLaunchedAt);
  if (launchDifference !== 0) {
    return launchDifference;
  }
  return left.claudeSessionId < right.claudeSessionId
    ? -1
    : left.claudeSessionId > right.claudeSessionId
      ? 1
      : 0;
}

/** Reads one non-empty metadata field while preserving valid path and label content. */
function readRequiredString(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError("Resumable session metadata requires non-empty strings.");
  }
  return value;
}

/** Reads a canonical lower-case RFC 4122 UUID session identity. */
function readCanonicalUuid(value: unknown): string {
  if (!isCanonicalUuid(value)) {
    throw new TypeError("Resumable session metadata requires a canonical UUID.");
  }
  return value;
}

/** Reads a calendar-valid RFC 3339 timestamp. */
function readIsoTimestamp(value: unknown): string {
  if (!isCalendarValidRfc3339Timestamp(value)) {
    throw new TypeError("Resumable session metadata requires parseable ISO timestamps.");
  }
  return value;
}

/** Narrows arbitrary persisted JSON to a plain key-value record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A minimal VS Code-shaped event implementation usable in Node-only unit tests. */
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

  /** Delivers one value while isolating store ownership from presentation listener failures. */
  fire(value: T): void {
    [...this.listeners].forEach((listener) => {
      try {
        listener(value);
      } catch {
        // Presentation listeners cannot compromise workspace-state persistence.
      }
    });
  }

  /** Clears every listener registered with the event. */
  dispose(): void {
    this.listeners.clear();
  }
}
