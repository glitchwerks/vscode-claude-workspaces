import { isCanonicalUuid } from "../sessions/resumableSessionValidation";

/** Ephemeral correlation metadata; never carries terminal data or clock origins. */
export interface TerminalProbeTag {
  readonly captureId: string;
  readonly sequence: number;
}

/** Validates the closed optional tag used by both protocol decoders. */
export function isTerminalProbeTag(value: unknown): value is TerminalProbeTag {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === 2 && Object.keys(value).every((key) => key === "captureId" || key === "sequence") &&
    "captureId" in value && "sequence" in value &&
    isCanonicalUuid(value.captureId) && typeof value.sequence === "number" &&
    Number.isSafeInteger(value.sequence) && value.sequence > 0;
}

/** Process-local probe correlations. No timer or peer clock is needed to compute a round trip. */
export function createTerminalProbeTracker(options: Readonly<{
  now?: () => number;
  activeSessionId?: () => string | undefined;
  onCounter?: (metric: "sampledOut" | "expired" | "dropped", count: number) => void;
}> = {}): {
  readonly pendingCount: number;
  setCapture(captureId: string | undefined): void;
  begin(sessionId: string): TerminalProbeTag | undefined;
  complete(tag: TerminalProbeTag, sessionId: string): number | undefined;
  forgetSession(sessionId: string): void;
  sweep(): void;
} {
  let captureId: string | undefined;
  let sequence = 0;
  let bucket = -1;
  let samples = 0;
  let backgroundSamples = 0;
  const pending = new Map<number, { sessionId: string; startedAt: number }>();
  const now = options.now ?? (() => performance.now());
  const report = (metric: "sampledOut" | "expired" | "dropped", count: number): void => {
    try { options.onCounter?.(metric, count); } catch { /* Diagnostics cannot interrupt terminal traffic. */ }
  };
  const sweep = (): void => {
    if (captureId === undefined) { return; }
    const timestamp = now();
    let expired = 0;
    for (const [id, entry] of pending) {
      if (timestamp - entry.startedAt >= 30_000) {
        pending.delete(id);
        expired += 1;
      }
    }
    if (expired > 0) { report("expired", expired); }
  };
  return {
    get pendingCount() { return pending.size; },
    setCapture: (id) => {
      const next = isCanonicalUuid(id) ? id : undefined;
      if (captureId === next) { return; }
      captureId = next;
      pending.clear();
      sequence = 0;
      bucket = -1;
      samples = 0;
      backgroundSamples = 0;
    },
    begin: (sessionId) => {
      if (captureId === undefined) { return undefined; }
      sweep();
      const timestamp = now();
      const currentBucket = Math.floor(timestamp / 1_000);
      if (bucket !== currentBucket) { bucket = currentBucket; samples = 0; backgroundSamples = 0; }
      const activeSessionId = options.activeSessionId?.();
      const background = activeSessionId !== undefined && activeSessionId !== sessionId;
      if (samples >= 10 || (background && backgroundSamples >= 5)) {
        report("sampledOut", 1);
        return undefined;
      }
      samples += 1;
      if (background) { backgroundSamples += 1; }
      if (sequence >= Number.MAX_SAFE_INTEGER) {
        report("dropped", 1);
        return undefined;
      }
      if (pending.size >= 128) {
        const evicted = sessionId === activeSessionId
          ? [...pending].find(([, entry]) => entry.sessionId !== activeSessionId)?.[0]
          : undefined;
        if (evicted === undefined) { report("dropped", 1); return undefined; }
        pending.delete(evicted);
        report("dropped", 1);
      }
      const id = ++sequence;
      pending.set(id, { sessionId, startedAt: timestamp });
      return { captureId, sequence: id };
    },
    complete: (tag, sessionId) => {
      if (captureId === undefined || !isTerminalProbeTag(tag) || tag.captureId !== captureId) { return undefined; }
      sweep();
      const entry = pending.get(tag.sequence);
      if (entry === undefined || entry.sessionId !== sessionId) { return undefined; }
      pending.delete(tag.sequence);
      const elapsed = now() - entry.startedAt;
      return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000 ? elapsed : undefined;
    },
    forgetSession: (sessionId) => {
      for (const [id, entry] of pending) {
        if (entry.sessionId === sessionId) { pending.delete(id); }
      }
    },
    sweep
  };
}
