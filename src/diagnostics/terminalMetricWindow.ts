/** Numeric boundaries observed independently in each process; no terminal contents. */
const METRICS = [
  "keyToInputMs", "inputRoundTripMs", "inputQueueMs", "ptyWriteMs", "outputHandlingMs",
  "outputRoundTripMs", "outputParseMs", "hostEventLoopGapMs",
  "inputCharacters", "outputCharacters", "replayCharacters",
  "renderMs", "fitMs", "renderCount", "fitCount",
  "pendingWrites", "pendingMessages", "sessionUpdated", "savedSessionsUpdated",
  "sampledOut", "expired", "dropped", "inputActionMs", "keyDispatchMs", "frontendEventLoopGapMs",
  "userInputCharacters", "terminalReplyCharacters", "frontendSampledOut", "frontendExpired", "frontendDropped",
  "rendererAvailable", "webglActive", "frontendDrainTimeout"
] as const;
export type TerminalDiagnosticMetric = typeof METRICS[number];
const METRIC_SET: ReadonlySet<string> = new Set(METRICS);
const BUCKET_LIMITS = [1, 5, 16, 50, 100, 1_000, 10_000, Infinity];
const MAX_SESSIONS = 16;
const FRONTEND_METRICS: ReadonlySet<string> = new Set([
  "keyToInputMs", "keyDispatchMs", "inputRoundTripMs", "outputParseMs", "frontendEventLoopGapMs",
  "userInputCharacters", "terminalReplyCharacters", "replayCharacters", "renderMs", "fitMs",
  "renderCount", "fitCount", "pendingWrites", "sessionUpdated", "savedSessionsUpdated",
  "frontendSampledOut", "frontendExpired", "frontendDropped", "rendererAvailable", "webglActive"
]);

export interface TerminalDiagnosticAggregate {
  readonly metric: TerminalDiagnosticMetric;
  readonly count: number;
  readonly total: number;
  readonly maximum: number;
  readonly buckets: readonly number[];
}

export interface TerminalMetricFrame {
  readonly sessions: readonly {
    readonly sessionId: string | null;
    readonly metrics: readonly TerminalDiagnosticAggregate[];
  }[];
  readonly omittedSamples: number;
}

/** Rejects arbitrary metric names and values before allocation or clock reads. */
export function isTerminalMetricSample(metric: unknown, value: unknown): value is number {
  return typeof metric === "string" && METRIC_SET.has(metric) && typeof value === "number" &&
    Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
}

/** Closed, bounded frames are validated atomically before any numeric merge. */
export function isTerminalMetricFrame(value: unknown, frontendOnly = false): value is TerminalMetricFrame {
  if (!exact(value, ["sessions", "omittedSamples"]) || !safeCount(value.omittedSamples) ||
    !denseArray(value.sessions, 17)) { return false; }
  const ids = new Set<string | null>();
  let namedSessions = 0;
  for (const session of value.sessions) {
    if (!exact(session, ["sessionId", "metrics"]) ||
      !(session.sessionId === null || (typeof session.sessionId === "string" && session.sessionId.length > 0 && session.sessionId.length <= 128)) ||
      ids.has(session.sessionId) || !denseArray(session.metrics, METRICS.length)) { return false; }
    ids.add(session.sessionId);
    if (session.sessionId !== null && ++namedSessions > MAX_SESSIONS) { return false; }
    const metrics = new Set<string>();
    for (const aggregate of session.metrics) {
      if (!exact(aggregate, ["metric", "count", "total", "maximum", "buckets"]) ||
        typeof aggregate.metric !== "string" || !METRIC_SET.has(aggregate.metric) || metrics.has(aggregate.metric) ||
        (frontendOnly && !FRONTEND_METRICS.has(aggregate.metric)) ||
        !safeCount(aggregate.count) || aggregate.count === 0 ||
        !isTerminalMetricSample(aggregate.metric, aggregate.total) ||
        !isTerminalMetricSample(aggregate.metric, aggregate.maximum) || aggregate.maximum > aggregate.total ||
        (aggregate.metric.endsWith("Ms") && aggregate.maximum > 300_000) ||
        !denseArray(aggregate.buckets, 8) || aggregate.buckets.length !== 8 || !aggregate.buckets.every(safeCount) ||
        aggregate.buckets.reduce((sum: number, count) => sum + (count as number), 0) !== aggregate.count) { return false; }
      metrics.add(aggregate.metric);
    }
  }
  return true;
}

function exact(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function safeCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function denseArray(value: unknown, maximum: number): value is unknown[] {
  if (!Array.isArray(value) || value.length > maximum) { return false; }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) { return false; }
  }
  return true;
}

/** Process-free, bounded numeric aggregation. Host capture fingerprints identities before logging. */
export function createTerminalMetricWindow(activeSessionId?: () => string | undefined): {
  readonly hasData: boolean;
  record(metric: TerminalDiagnosticMetric, value: number, sessionId?: string): void;
  merge(frame: unknown): void;
  forgetSession(sessionId: string): void;
  drain(): TerminalMetricFrame;
  clear(): void;
} {
  let omittedSamples = 0;
  const sessions = new Map<string | undefined, Map<TerminalDiagnosticMetric, {
    count: number; total: number; maximum: number; buckets: number[];
  }>>();
  const admit = (sessionId: string | undefined, weight: number) => {
    let session = sessions.get(sessionId);
    if (session !== undefined) { return session; }
    const sessionCount = sessions.size - (sessions.has(undefined) ? 1 : 0);
    if (sessionId !== undefined && sessionCount >= MAX_SESSIONS) {
      if (sessionId !== activeSessionId?.()) {
        omittedSamples = boundedSum(omittedSamples, weight);
        return undefined;
      }
      const evicted = [...sessions.keys()].find((id) => id !== undefined);
      if (evicted !== undefined) {
        for (const aggregate of sessions.get(evicted)!.values()) { omittedSamples = boundedSum(omittedSamples, aggregate.count); }
        sessions.delete(evicted);
      }
    }
    session = new Map();
    sessions.set(sessionId, session);
    return session;
  };
  return {
    get hasData() { return sessions.size > 0 || omittedSamples > 0; },
    record: (metric, value, sessionId) => {
      if (!isTerminalMetricSample(metric, value)) { return; }
      const session = admit(sessionId, 1);
      if (session === undefined) { return; }
      let aggregate = session.get(metric);
      if (aggregate === undefined) {
        aggregate = { count: 0, total: 0, maximum: 0, buckets: BUCKET_LIMITS.map(() => 0) };
        session.set(metric, aggregate);
      }
      aggregate.count = boundedSum(aggregate.count, 1);
      aggregate.total = boundedSum(aggregate.total, value);
      aggregate.maximum = Math.max(aggregate.maximum, value);
      const bucket = BUCKET_LIMITS.findIndex((limit) => value <= limit);
      aggregate.buckets[bucket] = boundedSum(aggregate.buckets[bucket]!, 1);
    },
    merge: (frame) => {
      if (!isTerminalMetricFrame(frame)) { return; }
      omittedSamples = boundedSum(omittedSamples, frame.omittedSamples);
      for (const entry of frame.sessions) {
        const session = admit(entry.sessionId ?? undefined, entry.metrics.reduce((sum, metric) => boundedSum(sum, metric.count), 0));
        if (session === undefined) { continue; }
        for (const metric of entry.metrics) {
          const previous = session.get(metric.metric);
          session.set(metric.metric, previous === undefined
            ? { count: metric.count, total: metric.total, maximum: metric.maximum, buckets: [...metric.buckets] }
            : { count: boundedSum(previous.count, metric.count), total: boundedSum(previous.total, metric.total),
              maximum: Math.max(previous.maximum, metric.maximum),
              buckets: previous.buckets.map((count, index) => boundedSum(count, metric.buckets[index]!)) });
        }
      }
    },
    forgetSession: (sessionId) => {
      for (const metric of sessions.get(sessionId)?.values() ?? []) { omittedSamples = boundedSum(omittedSamples, metric.count); }
      sessions.delete(sessionId);
    },
    drain: () => {
      const frame: TerminalMetricFrame = {
        sessions: [...sessions].map(([sessionId, metrics]) => ({
          sessionId: sessionId ?? null,
          metrics: [...metrics].map(([metric, aggregate]) => ({ metric, ...aggregate, buckets: [...aggregate.buckets] }))
        })),
        omittedSamples
      };
      sessions.clear();
      omittedSamples = 0;
      return frame;
    },
    clear: () => { sessions.clear(); omittedSamples = 0; }
  };
}

/** Saturates counters and sums instead of exporting Infinity or unsafe integers. */
function boundedSum(left: number, right: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, left + right);
}
