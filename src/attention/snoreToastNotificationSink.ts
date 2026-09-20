import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import type { AttentionNotificationRequest } from "./attentionNotificationCoordinator";
import type { SnoreToastActivationServer } from "./snoreToastActivationServer";

export type { SnoreToastActivationServer } from "./snoreToastActivationServer";

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
  readonly activationServer?: SnoreToastActivationServer;
  readonly createNotificationId?: () => string;
  readonly onError?: (error: unknown) => void;
  readonly launch?: SnoreToastLaunch;
}

export interface AttentionNotificationSink {
  notify(notification: AttentionNotificationRequest): void;
  onDidSelect?(listener: (sessionId: string) => unknown): { dispose(): void };
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
    ...(options.activationServer === undefined
      ? {}
      : { onDidSelect: options.activationServer.onDidSelect }),
    notify: (notification) => {
      const callbackArgs: string[] = [];
      let registration: { dispose(): void } | undefined;
      if (options.activationServer !== undefined) {
        const notificationId = (options.createNotificationId ?? randomUUID)();
        registration = options.activationServer.register(notificationId, notification.sessionId);
        callbackArgs.push(
          "-id",
          notificationId,
          "-pipeName",
          options.activationServer.pipeName
        );
      }
      let child: SnoreToastProcess;
      try {
        child = launch(options.executablePath, [
          "-t",
          `Claude Workspaces — ${notification.workspaceLabel}`,
          "-m",
          `${notification.sessionName} is waiting for input.`,
          "-pid",
          String(options.processId),
          "-appID",
          options.appId,
          ...callbackArgs
        ]);
      } catch (error) {
        registration?.dispose();
        throw error;
      }
      let failureReported = false;
      const reportFailureOnce = (error: unknown): void => {
        if (failureReported) {
          return;
        }
        failureReported = true;
        registration?.dispose();
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
