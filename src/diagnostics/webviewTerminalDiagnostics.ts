import type { HostMessage, WebviewMessage } from "../panel/protocol";
import { isCanonicalUuid } from "../sessions/resumableSessionValidation";
import { createTerminalMetricWindow, type TerminalDiagnosticMetric } from "./terminalMetricWindow";
import { createTerminalProbeTracker, type TerminalProbeTag } from "./terminalProbe";

/** Browser-local bounded timing state. No terminal contents are accepted or retained. */
export function createWebviewTerminalDiagnostics(options: {
  documentId?: string;
  now: () => number;
  activeSessionId: () => string | undefined;
  postMessage: (message: WebviewMessage) => void;
  setInterval: (callback: () => void, milliseconds: number) => number;
  clearInterval: (id: number) => void;
  observe?: () => void;
}) {
  const window = createTerminalMetricWindow(options.activeSessionId);
  let captureId: string | undefined;
  let interval: number | undefined;
  let startedAt = 0;
  let lastTick = 0;
  let windows = 0;
  let lastOutputSequence = 0;
  let disposed = false;
  const pendingOutput = new Map<number, { sessionId: string; startedAt: number }>();
  const input = createTerminalProbeTracker({ now: options.now, activeSessionId: options.activeSessionId,
    onCounter: (metric, count) => window.record(metric === "sampledOut" ? "frontendSampledOut" : metric === "expired" ? "frontendExpired" : "frontendDropped", count) });
  const emit = (message: WebviewMessage): void => { try { options.postMessage(message); } catch { /* Timing is best effort. */ } };
  const stop = (flushCurrent = false): void => {
    if (flushCurrent && captureId !== undefined && options.documentId !== undefined) {
      if (window.hasData && windows < 256) {
        emit({ type: "terminalTimingWindow", documentId: options.documentId, captureId, sequence: ++windows, frame: window.drain() });
      }
      emit({ type: "terminalDiagnosticsStopped", documentId: options.documentId, captureId, sequence: windows });
    }
    captureId = undefined;
    if (interval !== undefined) { options.clearInterval(interval); interval = undefined; }
    input.setCapture(undefined);
    pendingOutput.clear();
    window.clear();
  };
  const record = (metric: TerminalDiagnosticMetric, value: number, sessionId?: string): void => {
    if (captureId !== undefined) { window.record(metric, value, sessionId); }
  };
  return {
    get active() { return captureId !== undefined; },
    get captureId() { return captureId; },
    control: (message: Extract<HostMessage, { type: "terminalDiagnostics" }>): void => {
      if (disposed || options.documentId === undefined || message.documentId !== options.documentId) { return; }
      if (message.captureId === captureId) { return; }
      stop(message.captureId === null);
      if (!isCanonicalUuid(message.captureId)) { return; }
      captureId = message.captureId;
      const id = captureId;
      input.setCapture(id);
      startedAt = lastTick = options.now();
      windows = lastOutputSequence = 0;
      interval = options.setInterval(() => {
        if (captureId !== id) { return; }
        const timestamp = options.now();
        if (timestamp - startedAt >= 300_000) { stop(); return; }
        try { options.observe?.(); } catch { /* Sampling cannot interrupt the terminal. */ }
        input.sweep();
        let expired = 0;
        for (const [sequence, entry] of pendingOutput) {
          if (timestamp - entry.startedAt >= 30_000) { pendingOutput.delete(sequence); expired += 1; }
        }
        if (expired > 0) { window.record("frontendExpired", expired); }
        window.record("frontendEventLoopGapMs", Math.max(0, timestamp - lastTick - 1_000));
        lastTick = timestamp;
        emit({ type: "terminalTimingWindow", documentId: options.documentId!, captureId: id, sequence: ++windows, frame: window.drain() });
        if (windows >= 256) { stop(); }
      }, 1_000);
    },
    input: (sessionId: string, characters: number, user: boolean, keyStartedAt?: number): TerminalProbeTag | undefined => {
      if (captureId === undefined) { return undefined; }
      record(user ? "userInputCharacters" : "terminalReplyCharacters", characters, sessionId);
      if (!user) { return undefined; }
      if (keyStartedAt !== undefined) { record("keyToInputMs", Math.max(0, options.now() - keyStartedAt), sessionId); }
      return input.begin(sessionId);
    },
    inputAck: (message: Extract<HostMessage, { type: "terminalInputAck" }>): void => {
      if (captureId === undefined || message.documentId !== options.documentId) { return; }
      const elapsed = input.complete(message.probe, message.sessionId);
      if (elapsed !== undefined) { record("inputRoundTripMs", elapsed, message.sessionId); }
    },
    output: (sessionId: string, probe: TerminalProbeTag | undefined, pendingWrites: () => number): (() => void) | undefined => {
      if (captureId === undefined || probe?.captureId !== captureId || probe.sequence <= lastOutputSequence) { return undefined; }
      lastOutputSequence = probe.sequence;
      if (pendingOutput.size >= 128) { record("frontendDropped", 1); return undefined; }
      const id = captureId;
      const started = options.now();
      pendingOutput.set(probe.sequence, { sessionId, startedAt: started });
      return () => {
        if (captureId !== id || pendingOutput.get(probe.sequence)?.sessionId !== sessionId) { return; }
        pendingOutput.delete(probe.sequence);
        const parseMs = options.now() - started;
        if (!Number.isFinite(parseMs) || parseMs < 0 || parseMs >= 30_000) { record("frontendExpired", 1); return; }
        const pending = pendingWrites();
        record("outputParseMs", parseMs, sessionId);
        record("pendingWrites", pending, sessionId);
        emit({ type: "terminalOutputAck", documentId: options.documentId!, sessionId, probe, parseMs, pendingWrites: pending });
      };
    },
    record,
    forgetSession: (sessionId: string): void => {
      window.forgetSession(sessionId);
      input.forgetSession(sessionId);
      for (const [sequence, entry] of pendingOutput) { if (entry.sessionId === sessionId) { pendingOutput.delete(sequence); } }
    },
    dispose: (): void => { disposed = true; stop(); }
  };
}
