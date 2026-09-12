import type * as vscode from "vscode";

import { type EventLogLevel, type LogLevel, shouldLog } from "./logLevel";
import type { LaunchSpec } from "../launch/launchPlanner";
import type { SessionLifecycleLogger } from "../sessions/sessionTypes";
import type { RootId } from "../workspace/workspaceModel";

const REDACTED_VALUE = "[redacted]";

export type PanelFailureReason = "invalid-message" | "action-failed" | "external-open-failed";

/** Removes workspace and MCP configuration paths while retaining diagnostic flag structure. */
export function redactLaunchArgs(args: readonly string[]): readonly string[] {
  return args.map((argument, index) => {
    if (args[index - 1] === "--mcp-config" || args[index - 1] === "--add-dir") {
      return REDACTED_VALUE;
    }

    return argument.replace(/^(--mcp-config|--add-dir)=.*$/su, `$1=${REDACTED_VALUE}`);
  });
}

/** Writes structured Claude Workspaces diagnostics to one VS Code output channel. */
export class OutputLogger implements vscode.Disposable, SessionLifecycleLogger {
  private level: LogLevel;
  private readonly now: () => Date;

  constructor(
    private readonly channel: vscode.OutputChannel,
    options: Readonly<{ level?: LogLevel; now?: () => Date }> = {}
  ) {
    this.level = options.level ?? "info";
    this.now = options.now ?? (() => new Date());
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  configurationSummary(
    rootCount: number,
    savedWorkspace: boolean,
    logLevel: LogLevel,
    customExecutableConfigured: boolean
  ): void {
    this.write("debug", "configuration-summary", () => ({ rootCount, savedWorkspace, logLevel, customExecutableConfigured }));
  }

  capabilityStarted(): void {
    this.write("trace", "capability-started");
  }

  capabilityResult(outcome: "supported" | "unsupported" | "failed"): void {
    this.write("debug", "capability-result", () => ({ outcome }));
  }

  launchRequest(rootMode: "default" | "explicit", resume: boolean): void {
    this.write("trace", "launch-request", () => ({ rootMode, resume }));
  }

  persistenceWrite(
    operation: "create" | "resume" | "rename" | "forget",
    outcome: "success" | "failed",
    sessionId: string
  ): void {
    this.write(outcome === "failed" ? "error" : "debug", "persistence-write", () => ({ operation, outcome, sessionId }));
  }

  resumeRejected(
    reason: "unknown-session" | "already-live" | "root-unavailable" | "unsupported" | "process-failed",
    sessionId?: string
  ): void {
    this.write("debug", "resume-rejected", () => ({ reason, ...(sessionId === undefined ? {} : { sessionId }) }));
  }

  resumeRequested(sessionId?: string): void {
    this.write("trace", "resume-requested", () => sessionId === undefined ? {} : { sessionId });
  }

  panelFailure(reason: PanelFailureReason): void {
    this.write("error", "panel-failure", () => ({ reason }));
  }

  configurationReset(error: unknown): void {
    this.write("warn", "configuration-reset", () => ({ message: redactSensitiveText(errorMessage(error)) }));
  }

  launchPlan(spec: LaunchSpec): void {
    this.write("debug", "launch-plan", () => ({
      executable: spec.executable,
      args: redactLaunchArgs(spec.args),
      rootId: REDACTED_VALUE,
      importedRootCount: spec.importedRoots.length,
      skippedImportCount: spec.skippedImportIds.length
    }));
  }

  skippedImports(_rootId: RootId, skippedRootIds: readonly RootId[]): void {
    this.write("warn", "skipped-imports", () => ({ rootId: REDACTED_VALUE, skippedImportCount: skippedRootIds.length }));
  }

  startupError(error: unknown): void {
    this.write("error", "startup-error", () => ({ message: redactSensitiveText(errorMessage(error)) }));
  }

  sessionStarting(sessionId: string): void {
    this.write("info", "session-starting", () => ({ sessionId }));
  }

  sessionRunning(sessionId: string): void {
    this.write("info", "session-running", () => ({ sessionId }));
  }

  processExit(sessionId: string, exitCode: number, signal?: number): void {
    const level = exitCode === 0 && (signal === undefined || signal === 0) ? "info" : "warn";
    this.write(level, "process-exit", () => ({ sessionId, exitCode, ...(signal === undefined ? {} : { signal }) }));
  }

  shutdown(sessionIds: readonly string[]): void {
    this.write("info", "shutdown", () => ({ sessionIds }));
  }

  terminationDelayed(sessionId: string): void {
    this.write("warn", "termination-delayed", () => ({ sessionId }));
  }

  terminationError(sessionId: string, error: unknown): void {
    this.write("error", "termination-error", () => ({ sessionId, message: redactSensitiveText(errorMessage(error)) }));
  }

  dispose(): void {
    this.channel.dispose();
  }

  /** Reveals the extension-owned diagnostics channel on demand. */
  show(): void {
    this.channel.show(true);
  }

  private write(
    level: EventLogLevel,
    event: string,
    context: () => Readonly<Record<string, unknown>> = () => ({})
  ): void {
    if (!shouldLog(this.level, level)) {
      return;
    }

    let timestamp = "1970-01-01T00:00:00.000Z";
    try {
      timestamp = this.now().toISOString();
      this.channel.appendLine(JSON.stringify({ timestamp, level, event, ...context() }));
    } catch {
      try {
        this.channel.appendLine(JSON.stringify({ timestamp, level: "error", event: "logging-serialization-failed" }));
      } catch {
        // Diagnostics are best-effort, including when the output channel itself is unavailable.
      }
    }
  }
}

function errorMessage(error: unknown): string {
  try {
    return String(error instanceof Error ? error.message : error);
  } catch {
    return "Unknown error";
  }
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/--mcp-config=(?:"[^"]*"|'[^']*'|\S+)/gu, `--mcp-config=${REDACTED_VALUE}`)
    .replace(/--mcp-config\s+(?:"[^"]*"|'[^']*'|\S+)/gu, `--mcp-config ${REDACTED_VALUE}`);
}
