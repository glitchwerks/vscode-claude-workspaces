import { spawn } from "node:child_process";

import type { AttentionNotificationRequest } from "./attentionNotificationCoordinator";

export interface SnoreToastProcess {
  once(event: "error", listener: (error: Error) => void): this;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): this;
  unref(): void;
}

export type SnoreToastLaunch = (
  executablePath: string,
  args: readonly string[]
) => SnoreToastProcess;

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
    notify: (notification) => {
      const child = launch(options.executablePath, [
        "-t",
        `Claude Workspaces — ${notification.workspaceLabel}`,
        "-m",
        `${notification.sessionName} is waiting for input.`,
        "-pid",
        String(options.processId),
        "-appID",
        options.appId
      ]);
      let failureReported = false;
      const reportFailureOnce = (error: unknown): void => {
        if (failureReported) {
          return;
        }
        failureReported = true;
        reportError(error);
      };

      child.once("error", reportFailureOnce);
      child.once("exit", (code, signal) => {
        if (signal !== null) {
          reportFailureOnce(new Error(`SnoreToast terminated by signal ${signal}.`));
        } else if (code === -1 || code === 0xffffffff) {
          reportFailureOnce(new Error("SnoreToast exited with a failure status."));
        }
      });
      child.unref();
    }
  };
}

function launchSnoreToast(
  executablePath: string,
  args: readonly string[]
): SnoreToastProcess {
  return spawn(executablePath, args, {
    stdio: "ignore",
    windowsHide: true
  });
}
