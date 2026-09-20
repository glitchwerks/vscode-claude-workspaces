import type { AttentionStageTransition } from "./attentionSignalWatcher";
import type { ManagedSessionSnapshot } from "../sessions/sessionTypes";

export interface AttentionNotificationRequest {
  readonly sessionId: string;
  readonly workspaceLabel: string;
  readonly sessionName: string;
}

export interface AttentionNotificationCoordinatorOptions {
  readonly sessions: () => readonly ManagedSessionSnapshot[];
  readonly isWindowFocused: () => boolean;
  readonly isNotificationsEnabled?: () => boolean;
  readonly notify: (notification: AttentionNotificationRequest) => void;
  readonly onError?: (error: unknown) => void;
}

/** Converts a newly opened background waiting stage into one user notification. */
export function createAttentionNotificationCoordinator(
  options: AttentionNotificationCoordinatorOptions
): (transition: AttentionStageTransition) => void {
  return (transition) => {
    if (
      transition.kind !== "opened" ||
      options.isWindowFocused() ||
      !(options.isNotificationsEnabled?.() ?? true)
    ) {
      return;
    }
    const session = options.sessions().find(({ id }) => id === transition.sessionId);
    if (session === undefined) {
      return;
    }
    try {
      options.notify({
        sessionId: session.id,
        workspaceLabel: session.launchedRootLabel,
        sessionName: session.displayName
      });
    } catch (error) {
      try {
        options.onError?.(error);
      } catch {
        // Diagnostics cannot affect attention signal processing.
      }
    }
  };
}
