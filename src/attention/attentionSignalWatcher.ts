import { watch, type FSWatcher } from "node:fs";
import { readFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import type {
  ManagedSessionSnapshot,
  SessionAttentionState
} from "../sessions/sessionTypes";

const SIGNAL_FILE_SUFFIX = ".signal.json";
const MAX_SIGNAL_BYTES = 64 * 1024;

export interface AttentionSignal {
  readonly schemaVersion: 1;
  readonly managedSessionId: string;
  readonly claudeSessionId: string;
  readonly hookEventName: string;
  readonly notificationType: string | null;
  readonly createdAt: string;
}

export type AttentionStageTransition =
  | Readonly<{ kind: "opened" | "updated"; sessionId: string; signal: AttentionSignal }>
  | Readonly<{
      kind: "closed";
      sessionId: string;
      reason: "user-prompt" | "session-end" | "session-removed";
    }>;

export interface AttentionSessionRegistry {
  readonly sessions: readonly Pick<ManagedSessionSnapshot, "id" | "claudeSessionId" | "activity">[];
  readonly onDidChangeSessions: (
    listener: (sessions: readonly Pick<ManagedSessionSnapshot, "id">[]) => unknown
  ) => { dispose(): void };
  setAttention(id: string, attention: SessionAttentionState): void;
}

export interface AttentionSignalProcessor {
  process(value: unknown): "applied" | "ignored";
  dispose(): void;
}

/** Correlates validated hook signals and owns per-session waiting-stage state. */
export function createAttentionSignalProcessor(
  manager: AttentionSessionRegistry,
  onStageTransition?: (transition: AttentionStageTransition) => void,
  isSessionViewed: (sessionId: string) => boolean = () => false
): AttentionSignalProcessor {
  return new OwnedAttentionSignalProcessor(manager, onStageTransition, isSessionViewed);
}

class OwnedAttentionSignalProcessor implements AttentionSignalProcessor {
  private readonly waitingStages = new Map<string, AttentionSignal>();
  private readonly sessionSubscription: { dispose(): void };
  private disposed = false;

  constructor(
    private readonly manager: AttentionSessionRegistry,
    private readonly onStageTransition: ((transition: AttentionStageTransition) => void) | undefined,
    private readonly isSessionViewed: (sessionId: string) => boolean
  ) {
    this.sessionSubscription = manager.onDidChangeSessions((sessions) => {
      const liveIds = new Set(sessions.map(({ id }) => id));
      for (const sessionId of this.waitingStages.keys()) {
        if (!liveIds.has(sessionId)) {
          this.closeStage(sessionId, "session-removed");
        }
      }
    });
  }

  process(value: unknown): "applied" | "ignored" {
    if (this.disposed) {
      return "ignored";
    }
    const signal = parseAttentionSignal(value);
    if (signal === undefined) {
      return "ignored";
    }
    const session = this.manager.sessions.find(({ id }) => id === signal.managedSessionId);
    if (
      session === undefined ||
      (session.claudeSessionId !== null && session.claudeSessionId !== signal.claudeSessionId)
    ) {
      return "ignored";
    }

    const transition = attentionTransition(
      signal,
      this.isSessionViewed(signal.managedSessionId)
    );
    if (transition === undefined) {
      return "ignored";
    }
    if (transition.stage === "waiting") {
      const kind = this.waitingStages.has(signal.managedSessionId) ? "updated" : "opened";
      this.waitingStages.set(signal.managedSessionId, signal);
      this.emit({ kind, sessionId: signal.managedSessionId, signal });
    } else if (transition.stage !== undefined) {
      this.closeStage(signal.managedSessionId, transition.stage);
    }
    this.manager.setAttention(signal.managedSessionId, {
      activity: transition.activity,
      hasUnreadResponse: transition.hasUnreadResponse
    });
    return "applied";
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.sessionSubscription.dispose();
    this.waitingStages.clear();
  }

  private closeStage(
    sessionId: string,
    reason: "user-prompt" | "session-end" | "session-removed"
  ): void {
    if (!this.waitingStages.delete(sessionId)) {
      return;
    }
    this.emit({ kind: "closed", sessionId, reason });
  }

  private emit(transition: AttentionStageTransition): void {
    try {
      this.onStageTransition?.(transition);
    } catch {
      // A later notification sink cannot block the activity state machine.
    }
  }
}

/** Reads, validates, applies, and removes every complete signal in one host-owned channel. */
export async function ingestAttentionSignals(
  channelPath: string,
  processor: AttentionSignalProcessor
): Promise<number> {
  const entries = await readdir(channelPath, { withFileTypes: true });
  const queuedSignals: Array<{
    readonly fileName: string;
    readonly signalPath: string;
    readonly value: unknown;
    readonly eventTime: number;
  }> = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(SIGNAL_FILE_SUFFIX)) {
      continue;
    }
    const signalPath = path.join(channelPath, entry.name);
    try {
      const metadata = await stat(signalPath);
      if (metadata.size > MAX_SIGNAL_BYTES) {
        await rm(signalPath, { force: true });
        continue;
      }
      const value = JSON.parse(await readFile(signalPath, "utf8")) as unknown;
      queuedSignals.push({
        fileName: entry.name,
        signalPath,
        value,
        eventTime: attentionSignalEventTime(value)
      });
    } catch {
      await rm(signalPath, { force: true });
    }
  }
  queuedSignals.sort((left, right) =>
    left.eventTime - right.eventTime || left.fileName.localeCompare(right.fileName)
  );
  let applied = 0;
  for (const queued of queuedSignals) {
    try {
      if (processor.process(queued.value) === "applied") {
        applied += 1;
      }
    } catch {
      // A malformed signal or isolated state transition cannot block later files.
    } finally {
      await rm(queued.signalPath, { force: true });
    }
  }
  return applied;
}

/** Starts a serialized filesystem watcher after first consuming signals already on disk. */
export async function startAttentionChannelWatcher(
  channelPath: string,
  processor: AttentionSignalProcessor,
  onError?: () => void
): Promise<{ dispose(): void }> {
  const watcher = new OwnedAttentionChannelWatcher(channelPath, processor, onError);
  await watcher.start();
  return watcher;
}

class OwnedAttentionChannelWatcher {
  private readonly watcher: FSWatcher;
  private pending = Promise.resolve();
  private disposed = false;

  constructor(
    private readonly channelPath: string,
    private readonly processor: AttentionSignalProcessor,
    private readonly onError?: () => void
  ) {
    this.watcher = watch(channelPath, { persistent: false }, (_eventType, fileName) => {
      if (fileName === null || fileName.toString().endsWith(SIGNAL_FILE_SUFFIX)) {
        this.scheduleIngestion();
      }
    });
    this.watcher.on("error", () => this.reportError());
  }

  async start(): Promise<void> {
    this.scheduleIngestion();
    await this.pending;
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.watcher.close();
  }

  private scheduleIngestion(): void {
    this.pending = this.pending.then(async () => {
      if (!this.disposed) {
        await ingestAttentionSignals(this.channelPath, this.processor);
      }
    }).catch(() => this.reportError());
  }

  private reportError(): void {
    try {
      this.onError?.();
    } catch {
      // Diagnostics cannot make the watcher fail recursively.
    }
  }
}

function parseAttentionSignal(value: unknown): AttentionSignal | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    !nonEmptyString(candidate.managedSessionId) ||
    !nonEmptyString(candidate.claudeSessionId) ||
    !nonEmptyString(candidate.hookEventName) ||
    !(candidate.notificationType === null || typeof candidate.notificationType === "string") ||
    !validTimestamp(candidate.createdAt)
  ) {
    return undefined;
  }
  return Object.freeze({
    schemaVersion: 1,
    managedSessionId: candidate.managedSessionId,
    claudeSessionId: candidate.claudeSessionId,
    hookEventName: candidate.hookEventName,
    notificationType: candidate.notificationType,
    createdAt: candidate.createdAt
  });
}

type AttentionTransition = SessionAttentionState & Readonly<{
  stage?: "waiting" | "user-prompt" | "session-end";
}>;

function attentionTransition(
  signal: AttentionSignal,
  viewed: boolean
): AttentionTransition | undefined {
  if (signal.hookEventName === "UserPromptSubmit") {
    return { activity: "working", hasUnreadResponse: false, stage: "user-prompt" };
  }
  if (signal.hookEventName === "Stop") {
    return { activity: "waiting", hasUnreadResponse: !viewed };
  }
  if (signal.hookEventName === "SessionEnd") {
    return { activity: "idle", hasUnreadResponse: false, stage: "session-end" };
  }
  if (signal.hookEventName !== "Notification") {
    return undefined;
  }
  if (["permission_prompt", "agent_needs_input", "elicitation_dialog"].includes(
    signal.notificationType ?? ""
  )) {
    return { activity: "waiting", hasUnreadResponse: false, stage: "waiting" };
  }
  return signal.notificationType === "idle_prompt"
    ? { activity: "idle", hasUnreadResponse: false }
    : undefined;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validTimestamp(value: unknown): value is string {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function attentionSignalEventTime(value: unknown): number {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return Number.POSITIVE_INFINITY;
  }
  const createdAt = (value as Record<string, unknown>).createdAt;
  if (typeof createdAt !== "string") {
    return Number.POSITIVE_INFINITY;
  }
  const eventTime = Date.parse(createdAt);
  return Number.isFinite(eventTime) ? eventTime : Number.POSITIVE_INFINITY;
}
