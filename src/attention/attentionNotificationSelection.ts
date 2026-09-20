export interface SelectableSession {
  readonly id: string;
  readonly displayName: string;
}

export interface AttentionNotificationSelectionOptions {
  readonly sessions: () => readonly SelectableSession[];
  readonly isPanelAvailable: () => boolean;
  readonly revealPanel: () => PromiseLike<unknown>;
  readonly activateSession: (sessionId: string) => void;
  readonly showWarning: (message: string) => PromiseLike<unknown>;
}

/** Routes a native-notification click back to the matching live session. */
export function createAttentionNotificationSelectionHandler(
  options: AttentionNotificationSelectionOptions
): (sessionId: string) => Promise<void> {
  return async (sessionId) => {
    const session = options.sessions().find((candidate) => candidate.id === sessionId);
    if (session === undefined) {
      return;
    }
    if (!options.isPanelAvailable()) {
      await options.showWarning(
        `${session.displayName} is waiting for input, but the Sessions view is unavailable ` +
        "in this window. Open a saved workspace to view it."
      );
      return;
    }
    await options.revealPanel();
    options.activateSession(sessionId);
  };
}
