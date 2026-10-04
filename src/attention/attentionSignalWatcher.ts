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
  readonly agentId?: string;
  readonly completionReporterReady?: boolean;
  readonly completionReason?: "answer" | "aborted" | "refusal" | "error";
  readonly isAborted?: boolean;
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
  readonly sessions: readonly Pick<
    ManagedSessionSnapshot,
    "id" | "claudeSessionId" | "activity" | "state" | "hasUnreadResponse"
  >[];
  readonly onDidChangeSessions: (
    listener: (sessions: readonly Pick<ManagedSessionSnapshot, "id">[]) => unknown
  ) => { dispose(): void };
  setAttention(id: string, attention: SessionAttentionState): void;
}

export interface AttentionSignalProcessor {
  process(value: unknown): "applied" | "ignored";
  promptSubmitted(sessionId: string): "applied" | "ignored";
  dispose(): void;
}

/** Correlates validated hook signals and owns per-session waiting-stage state. */
export function createAttentionSignalProcessor(
  manager: AttentionSessionRegistry,
  onStageTransition?: (transition: AttentionStageTransition) => void,
  isSessionViewed: (sessionId: string) => boolean = () => false,
  onReporterUnavailable?: (sessionId: string) => void
): AttentionSignalProcessor {
  return new OwnedAttentionSignalProcessor(manager, onStageTransition, isSessionViewed, onReporterUnavailable);
}

class OwnedAttentionSignalProcessor implements AttentionSignalProcessor {
  private readonly waitingStages = new Map<string, AttentionSignal>();
  private readonly activeAgents = new Map<string, Set<string>>();
  private readonly parentActivities = new Map<string, SessionAttentionState["activity"]>();
  private readonly reportedUnavailable = new Set<string>();
  private readonly sessionSubscription: { dispose(): void };
  private disposed = false;

  constructor(
    private readonly manager: AttentionSessionRegistry,
    private readonly onStageTransition: ((transition: AttentionStageTransition) => void) | undefined,
    private readonly isSessionViewed: (sessionId: string) => boolean,
    private readonly onReporterUnavailable: ((sessionId: string) => void) | undefined
  ) {
    this.sessionSubscription = manager.onDidChangeSessions((sessions) => {
      const liveIds = new Set(sessions.map(({ id }) => id));
      for (const sessionId of this.reportedUnavailable) {
        if (!liveIds.has(sessionId)) {
          this.reportedUnavailable.delete(sessionId);
        }
      }
      for (const sessionId of this.waitingStages.keys()) {
        if (!liveIds.has(sessionId)) {
          this.closeStage(sessionId, "session-removed");
        }
      }
      for (const sessionId of this.parentActivities.keys()) {
        if (!liveIds.has(sessionId)) {
          this.parentActivities.delete(sessionId);
          this.activeAgents.delete(sessionId);
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
      session.state !== "running" ||
      (session.claudeSessionId !== null && session.claudeSessionId !== signal.claudeSessionId)
    ) {
      return "ignored";
    }

    if (signal.hookEventName === "UserPromptSubmit" && signal.completionReporterReady !== true &&
        !this.reportedUnavailable.has(signal.managedSessionId)) {
      this.reportedUnavailable.add(signal.managedSessionId);
      try {
        this.onReporterUnavailable?.(signal.managedSessionId);
      } catch {
        // Availability diagnostics cannot block normal prompt activity.
      }
    }
    // Classic stops run before other hooks decide whether the same agent continues.
    if (signal.hookEventName === "SubagentStop" ||
        (signal.hookEventName === "Stop" && signal.completionReporterReady === true)) {
      return "ignored";
    }
    if (signal.hookEventName === "SubagentStart" ||
        (signal.hookEventName === "TurnComplete" && signal.agentId !== undefined)) {
      if (signal.completionReporterReady !== true) {
        return "ignored";
      }
      const sessionId = signal.managedSessionId;
      const agents = this.activeAgents.get(sessionId) ?? new Set<string>();
      if (signal.hookEventName === "SubagentStart") {
        if (!this.parentActivities.has(sessionId)) {
          this.parentActivities.set(sessionId, session.activity);
        }
        agents.add(signal.agentId!);
        this.activeAgents.set(sessionId, agents);
      } else if (!agents.delete(signal.agentId!)) {
        // Internal or duplicate stop events must not end unrelated work.
        return "ignored";
      }
      this.manager.setAttention(sessionId, {
        activity: this.waitingStages.has(sessionId) ? "waiting"
          : agents.size > 0 ? "working"
          : this.parentActivities.get(sessionId) ?? session.activity,
        hasUnreadResponse: session.hasUnreadResponse
      });
      return "applied";
    }

    const transition = attentionTransition(
      signal,
      this.isSessionViewed(signal.managedSessionId)
    );
    if (transition === undefined) {
      return "ignored";
    }
    this.parentActivities.set(signal.managedSessionId, transition.activity);
    if (signal.hookEventName === "SessionEnd") {
      this.parentActivities.delete(signal.managedSessionId);
      this.activeAgents.delete(signal.managedSessionId);
    }
    if (transition.stage === "waiting") {
      const kind = this.waitingStages.has(signal.managedSessionId) ? "updated" : "opened";
      this.waitingStages.set(signal.managedSessionId, signal);
      this.emit({ kind, sessionId: signal.managedSessionId, signal });
    } else if (transition.stage !== undefined) {
      this.closeStage(signal.managedSessionId, transition.stage);
    }
    this.manager.setAttention(signal.managedSessionId, {
      activity: signal.hookEventName !== "SessionEnd" &&
        !this.waitingStages.has(signal.managedSessionId) &&
        (this.activeAgents.get(signal.managedSessionId)?.size ?? 0) > 0
        ? "working" : transition.activity,
      hasUnreadResponse: transition.hasUnreadResponse
    });
    return "applied";
  }

  promptSubmitted(sessionId: string): "applied" | "ignored" {
    if (this.disposed) {
      return "ignored";
    }
    const session = this.manager.sessions.find(({ id }) => id === sessionId);
    if (session?.state !== "running") {
      return "ignored";
    }
    this.closeStage(sessionId, "user-prompt");
    this.parentActivities.set(sessionId, "working");
    this.manager.setAttention(sessionId, {
      activity: "working",
      hasUnreadResponse: false
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
    this.activeAgents.clear();
    this.parentActivities.clear();
    this.reportedUnavailable.clear();
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
    ((candidate.hookEventName === "SubagentStart" || candidate.hookEventName === "SubagentStop") &&
      !nonEmptyString(candidate.agentId)) ||
    (candidate.agentId !== undefined && !nonEmptyString(candidate.agentId)) ||
    (candidate.completionReporterReady !== undefined && typeof candidate.completionReporterReady !== "boolean") ||
    (candidate.hookEventName === "TurnComplete" &&
      (candidate.completionReporterReady !== true ||
        !["answer", "aborted", "refusal", "error"].includes(String(candidate.completionReason)) ||
        typeof candidate.isAborted !== "boolean")) ||
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
    createdAt: candidate.createdAt,
    ...(candidate.agentId === undefined ? {} : { agentId: candidate.agentId as string }),
    ...(candidate.completionReporterReady === undefined ? {} : {
      completionReporterReady: candidate.completionReporterReady as boolean
    }),
    ...(candidate.hookEventName === "TurnComplete" ? {
      completionReason: candidate.completionReason as AttentionSignal["completionReason"],
      isAborted: candidate.isAborted as boolean
    } : {})
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
  if (signal.hookEventName === "TurnComplete") {
    return { activity: "waiting", hasUnreadResponse: !viewed &&
      signal.completionReason === "answer" && signal.isAborted !== true };
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
