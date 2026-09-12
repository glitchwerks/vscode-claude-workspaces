import type * as vscode from "vscode";

import { type EventLogLevel, type LogLevel, shouldLog } from "./logLevel";
import type { LaunchSpec } from "../launch/launchPlanner";
import type { SessionLifecycleLogger } from "../sessions/sessionTypes";
import type { RootId } from "../workspace/workspaceModel";

const REDACTED_VALUE = "[redacted]";

/** Removes sensitive MCP configuration paths while retaining diagnostic flag structure. */
export function redactLaunchArgs(args: readonly string[]): readonly string[] {
  return args.map((argument, index) => {
    if (args[index - 1] === "--mcp-config") {
      return REDACTED_VALUE;
    }

    return argument.startsWith("--mcp-config=") ? `--mcp-config=${REDACTED_VALUE}` : argument;
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

  configurationReset(error: unknown): void {
    this.write("warn", "configuration-reset", { message: redactSensitiveText(errorMessage(error)) });
  }

  launchPlan(spec: LaunchSpec): void {
    this.write("debug", "launch-plan", {
      executable: spec.executable,
      args: redactLaunchArgs(spec.args),
      rootId: spec.root.id,
      importedRootIds: spec.importedRoots.map(({ id }) => id),
      skippedImportIds: spec.skippedImportIds
    });
  }

  skippedImports(rootId: RootId, skippedRootIds: readonly RootId[]): void {
    this.write("warn", "skipped-imports", { rootId, skippedRootIds });
  }

  startupError(error: unknown): void {
    this.write("error", "startup-error", { message: redactSensitiveText(errorMessage(error)) });
  }

  processExit(sessionId: string, exitCode: number, signal?: number): void {
    this.write("info", "process-exit", { sessionId, exitCode, ...(signal === undefined ? {} : { signal }) });
  }

  shutdown(sessionIds: readonly string[]): void {
    this.write("info", "shutdown", { sessionIds });
  }

  terminationDelayed(sessionId: string): void {
    this.write("warn", "termination-delayed", { sessionId });
  }

  terminationError(sessionId: string, error: unknown): void {
    this.write("error", "termination-error", { sessionId, message: redactSensitiveText(errorMessage(error)) });
  }

  dispose(): void {
    this.channel.dispose();
  }

  /** Reveals the extension-owned diagnostics channel on demand. */
  show(): void {
    this.channel.show(true);
  }

  private write(level: EventLogLevel, event: string, context: Readonly<Record<string, unknown>> = {}): void {
    if (!shouldLog(this.level, level)) {
      return;
    }

    const timestamp = this.now().toISOString();
    try {
      this.channel.appendLine(JSON.stringify({ timestamp, level, event, ...context }));
    } catch {
      this.channel.appendLine(JSON.stringify({ timestamp, level: "error", event: "logging-serialization-failed" }));
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/--mcp-config=(?:"[^"]*"|'[^']*'|\S+)/gu, `--mcp-config=${REDACTED_VALUE}`)
    .replace(/--mcp-config\s+(?:"[^"]*"|'[^']*'|\S+)/gu, `--mcp-config ${REDACTED_VALUE}`);
}
