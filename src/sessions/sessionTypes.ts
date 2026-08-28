import type { LaunchSpec } from "../launch/launchPlanner";
import type { RootId } from "../workspace/workspaceModel";

export type SessionId = string;
export type SessionState = "starting" | "running" | "closing";

export interface ManagedSessionSnapshot {
  readonly id: SessionId;
  readonly rootId: RootId;
  readonly displayName: string;
  readonly ordinalWithinRoot: number;
  readonly state: SessionState;
  readonly launchedImportIds: readonly RootId[];
  readonly launchedAt: number;
}

export interface SessionDataEvent {
  readonly sessionId: SessionId;
  readonly data: string;
}

export type SessionNotification =
  | {
      readonly kind: "startup-failed";
      readonly spec: LaunchSpec;
      readonly error: unknown;
    }
  | {
      readonly kind: "immediate-nonzero-exit";
      readonly sessionId: SessionId;
      readonly spec: LaunchSpec;
      readonly exitCode: number;
      readonly signal?: number;
    };

export interface SessionNotificationSink {
  notify(notification: SessionNotification): void;
}

export interface SessionLifecycleLogger {
  startupError(error: unknown): void;
  processExit(sessionId: string, exitCode: number, signal?: number): void;
  shutdown(sessionIds: readonly string[]): void;
  terminationDelayed(sessionId: string): void;
  terminationError(sessionId: string, error: unknown): void;
}
