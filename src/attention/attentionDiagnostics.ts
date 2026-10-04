import { createHash } from "node:crypto";
import type { SessionAttentionState } from "../sessions/sessionTypes";

export type AttentionDiagnosticEvent = "UserPromptSubmit" | "Notification" | "Stop" | "SubagentStart" | "SubagentStop" | "TurnComplete" | "SessionEnd" | "terminal-submit" | "other";
export interface AttentionDiagnosticRecord {
  readonly event: AttentionDiagnosticEvent;
  readonly notification: "idle_prompt" | "permission_prompt" | "agent_needs_input" | "elicitation_dialog" | "other" | null;
  readonly managedId: string | null;
  readonly claudeId: string | null;
  readonly expectedClaudeId: string | null;
  readonly agentId: string | null;
  readonly ready: boolean;
  readonly outcome: "applied" | "ignored";
  readonly reason: "applied" | "disposed" | "invalid-signal" | "unknown-session" | "not-running" | "identity-mismatch" | "pre-decision-stop" | "reporter-not-ready" | "unknown-agent" | "unsupported-event";
  readonly activityBefore: SessionAttentionState["activity"] | null;
  readonly activityAfter: SessionAttentionState["activity"] | null;
  readonly unreadBefore: boolean | null;
  readonly unreadAfter: boolean | null;
  readonly activeAgentsBefore: number;
  readonly activeAgentsAfter: number;
  readonly inputWaitBefore: boolean;
  readonly inputWaitAfter: boolean;
}

/** Fingerprints correlation identifiers without retaining their original text. */
export function attentionDiagnosticId(value: string | undefined | null): string | null {
  return value == null ? null : createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export type AttentionCaptureMessage = AttentionDiagnosticRecord | Readonly<{
  capture: "started" | "stopped";
  reason?: "manual" | "limit" | "timeout" | "disposed";
  records?: number;
}>;

/** Default-off, bounded capture; no configuration or transcript storage. */
export function createAttentionDiagnosticCapture(
  output: (message: AttentionCaptureMessage) => void,
  options: Readonly<{ schedule?: (callback: () => void, milliseconds: number) => () => void }> = {}
): { readonly active: boolean; toggle(): void; record(record: AttentionDiagnosticRecord): void; dispose(): void } {
  let active = false;
  let disposed = false;
  let records = 0;
  let cancel: (() => void) | undefined;
  const emit = (message: AttentionCaptureMessage): void => { try { output(message); } catch { /* Capture is best-effort. */ } };
  const stop = (reason: "manual" | "limit" | "timeout" | "disposed"): void => {
    if (!active) { return; }
    active = false;
    cancel?.();
    cancel = undefined;
    emit({ capture: "stopped", reason, records });
  };
  return {
    get active() { return active; },
    toggle: () => {
      if (disposed) { return; }
      if (active) { stop("manual"); return; }
      active = true;
      records = 0;
      emit({ capture: "started" });
      cancel = (options.schedule ?? ((callback, milliseconds) => {
        const timer = setTimeout(callback, milliseconds);
        timer.unref();
        return () => clearTimeout(timer);
      }))(() => stop("timeout"), 300_000);
    },
    record: (record) => {
      if (!active) { return; }
      records += 1;
      emit(record);
      if (records >= 256) { stop("limit"); }
    },
    dispose: () => { stop("disposed"); disposed = true; }
  };
}
