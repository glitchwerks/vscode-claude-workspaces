import type * as vscode from "vscode";

import type { LaunchSpec } from "../launch/launchPlanner";
import type { RootId } from "../workspace/workspaceModel";

/** Writes structured Claude Workspaces diagnostics to one VS Code output channel. */
export class OutputLogger implements vscode.Disposable {
  constructor(private readonly channel: vscode.OutputChannel) {}

  configurationReset(error: unknown): void {
    this.write({ event: "configuration-reset", message: errorMessage(error) });
  }

  launchPlan(spec: LaunchSpec): void {
    this.write({
      event: "launch-plan",
      executable: spec.executable,
      args: spec.args,
      rootId: spec.root.id,
      importedRootIds: spec.importedRoots.map(({ id }) => id),
      skippedImportIds: spec.skippedImportIds
    });
  }

  skippedImports(rootId: RootId, skippedRootIds: readonly RootId[]): void {
    this.write({ event: "skipped-imports", rootId, skippedRootIds });
  }

  startupError(error: unknown): void {
    this.write({ event: "startup-error", message: errorMessage(error) });
  }

  processExit(sessionId: string, exitCode: number, signal?: number): void {
    this.write({ event: "process-exit", sessionId, exitCode, ...(signal === undefined ? {} : { signal }) });
  }

  shutdown(sessionIds: readonly string[]): void {
    this.write({ event: "shutdown", sessionIds });
  }

  dispose(): void {
    this.channel.dispose();
  }

  private write(event: Record<string, unknown>): void {
    this.channel.appendLine(JSON.stringify(event));
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
