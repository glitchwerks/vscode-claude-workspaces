import { spawn } from "node:child_process";

import type { AttentionNotificationRequest } from "./attentionNotificationCoordinator";

export type SnoreToastLaunch = (
  executablePath: string,
  args: readonly string[],
  onError: (error: unknown) => void
) => void;

export interface SnoreToastNotificationSinkOptions {
  readonly executablePath: string;
  readonly processId: number;
  readonly appId: string;
  readonly onError?: (error: unknown) => void;
  readonly launch?: SnoreToastLaunch;
}

export interface AttentionNotificationSink {
  notify(notification: AttentionNotificationRequest): void;
}

/** Emits native Windows attention notifications through the bundled SnoreToast executable. */
export function createSnoreToastNotificationSink(
  options: SnoreToastNotificationSinkOptions
): AttentionNotificationSink {
  const launch = options.launch ?? launchSnoreToast;
  const reportError = (error: unknown): void => {
    try {
      options.onError?.(error);
    } catch {
      // Diagnostics cannot make native notification delivery fail recursively.
    }
  };

  return {
    notify: (notification) => launch(options.executablePath, [
      "-t",
      `Claude Workspaces — ${notification.workspaceLabel}`,
      "-m",
      `${notification.sessionName} is waiting for input.`,
      "-pid",
      String(options.processId),
      "-appID",
      options.appId
    ], reportError)
  };
}

function launchSnoreToast(
  executablePath: string,
  args: readonly string[],
  onError: (error: unknown) => void
): void {
  const child = spawn(executablePath, args, {
    stdio: "ignore",
    windowsHide: true
  });
  child.once("error", onError);
  child.unref();
}
