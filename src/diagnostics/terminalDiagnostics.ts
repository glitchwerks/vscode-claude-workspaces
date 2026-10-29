import { randomUUID } from "node:crypto";
import { attentionDiagnosticId } from "../attention/attentionDiagnostics";
import { createTerminalMetricWindow, isTerminalMetricSample, type TerminalDiagnosticMetric, type TerminalDiagnosticAggregate } from "./terminalMetricWindow";
export type { TerminalDiagnosticMetric, TerminalDiagnosticAggregate } from "./terminalMetricWindow";
const MAX_RECORDS = 256;
const MAX_DURATION_MS = 300_000;

export type TerminalDiagnosticMessage =
  | { readonly capture: "started" }
  | { readonly capture: "stopped"; readonly reason: "manual" | "limit" | "timeout" | "disposed"; readonly records: number }
  | {
      readonly capture: "window";
      readonly elapsedMs: number;
      readonly sessions: readonly { readonly session: string | null; readonly metrics: readonly TerminalDiagnosticAggregate[] }[];
      readonly omittedSamples: number;
    };

export interface TerminalDiagnosticCapture {
  readonly active: boolean;
  readonly captureId: string | undefined;
  toggle(): void;
  record(metric: TerminalDiagnosticMetric, value: number, sessionId?: string): void;
  merge(frame: unknown): void;
  dispose(): void;
}

/** Default-off, bounded one-second summaries; no transcript or raw identifier leaves this capture. */
export function createTerminalDiagnosticCapture(
  output: (message: TerminalDiagnosticMessage) => void,
  options: Readonly<{
    now?: () => number;
    activeSessionId?: () => string | undefined;
    schedule?: (callback: () => void, milliseconds: number) => () => void;
  }> = {}
): TerminalDiagnosticCapture {
  let active = false;
  let disposed = false;
  let captureId: string | undefined;
  let startedAt = 0;
  let lastTick = 0;
  let records = 0;
  let cancelTick: (() => void) | undefined;
  let cancelExpiry: (() => void) | undefined;
  const now = options.now ?? (() => performance.now());
  const schedule = options.schedule ?? ((callback: () => void, milliseconds: number) => {
    const timer = setTimeout(callback, milliseconds);
    timer.unref();
    return () => clearTimeout(timer);
  });
  const window = createTerminalMetricWindow(options.activeSessionId);
  const emit = (message: TerminalDiagnosticMessage): void => { try { output(message); } catch { /* Best effort. */ } };
  const flush = (): void => {
    if (!window.hasData) { return; }
    const frame = window.drain();
    const message: TerminalDiagnosticMessage = {
      capture: "window",
      elapsedMs: Math.max(0, Math.min(MAX_DURATION_MS, now() - startedAt)),
      sessions: frame.sessions.map((session) => ({ session: attentionDiagnosticId(session.sessionId), metrics: session.metrics })),
      omittedSamples: frame.omittedSamples
    };
    records += 1;
    emit(message);
  };
  const stop = (reason: "manual" | "limit" | "timeout" | "disposed"): void => {
    if (!active) { return; }
    active = false;
    captureId = undefined;
    cancelTick?.();
    cancelExpiry?.();
    cancelTick = undefined;
    cancelExpiry = undefined;
    if (records < MAX_RECORDS) { flush(); }
    window.clear();
    emit({ capture: "stopped", reason, records });
  };
  const record = (metric: TerminalDiagnosticMetric, value: number, sessionId?: string): void => {
    if (!active || !isTerminalMetricSample(metric, value)) { return; }
    if (now() - startedAt >= MAX_DURATION_MS) { stop("timeout"); return; }
    window.record(metric, value, sessionId);
  };
  const tick = (id: string): void => {
    if (!active || captureId !== id) { return; }
    if (now() - startedAt >= MAX_DURATION_MS) { stop("timeout"); return; }
    const timestamp = now();
    record("hostEventLoopGapMs", Math.max(0, timestamp - lastTick - 1_000));
    lastTick = timestamp;
    flush();
    if (!active || captureId !== id) { return; }
    if (records >= MAX_RECORDS) { stop("limit"); return; }
    cancelTick = schedule(() => tick(id), 1_000);
  };
  return {
    get active() { return active; },
    get captureId() { return captureId; },
    toggle: () => {
      if (disposed) { return; }
      if (active) { stop("manual"); return; }
      active = true;
      captureId = randomUUID();
      const id = captureId;
      startedAt = lastTick = now();
      records = 0;
      window.clear();
      emit({ capture: "started" });
      if (!active || captureId !== id) { return; }
      cancelTick = schedule(() => tick(id), 1_000);
      cancelExpiry = schedule(() => {
        if (captureId === id) { stop("timeout"); }
      }, MAX_DURATION_MS);
    },
    record,
    merge: (frame) => {
      if (!active) { return; }
      if (now() - startedAt >= MAX_DURATION_MS) { stop("timeout"); return; }
      window.merge(frame);
    },
    dispose: () => {
      disposed = true;
      stop("disposed");
    }
  };
}
