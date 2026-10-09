import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { renameSync, unlinkSync } from "node:fs";
import { win32 } from "node:path";

import type { AttentionNotificationRequest } from "./attentionNotificationCoordinator";
import type { SnoreToastActivationServer } from "./snoreToastActivationServer";

export type { SnoreToastActivationServer } from "./snoreToastActivationServer";

export interface SnoreToastProcess {
  once(event: "error", listener: (error: Error) => void): this;
  once(
    event: "exit",
    listener: (code: number | null, signal: NodeJS.Signals | null) => void
  ): this;
  kill(): boolean;
  unref(): void;
}

export type SnoreToastLaunch = (
  executablePath: string,
  args: readonly string[]
) => SnoreToastProcess;

export interface SnoreToastNotificationSinkOptions {
  readonly executablePath: string;
  readonly appId: string;
  readonly activationServer?: SnoreToastActivationServer;
  readonly createNotificationId?: () => string;
  readonly onError?: (error: unknown) => void;
  readonly launch?: SnoreToastLaunch;
}

/** Filesystem boundary for committing and cleaning one owned shortcut installation. */
export interface SnoreToastShortcutFileSystem {
  rename(source: string, destination: string): void;
  remove(file: string): void;
}

export interface SnoreToastIdentityOptions {
  readonly executablePath: string;
  readonly appId: string;
  readonly shortcutPath: string;
  readonly appDataPath?: string;
  readonly shortcutFileSystem?: SnoreToastShortcutFileSystem;
  readonly timeoutMs?: number;
  readonly launch?: SnoreToastLaunch;
}

export interface AttentionNotificationSink {
  notify(notification: AttentionNotificationRequest): void;
  onDidSelect?(listener: (sessionId: string) => unknown): { dispose(): void };
}

/** Registers the bundled activator under its own Windows notification identity. */
export function installSnoreToastIdentity(
  options: SnoreToastIdentityOptions
): Promise<void> {
  const launch = options.launch ?? launchSnoreToast;
  return new Promise((resolve, reject) => {
    const fileSystem = options.shortcutFileSystem ?? { rename: renameSync, remove: unlinkSync };
    let shortcutPath: string;
    let stagingPath: string | undefined;
    // Cleanup never touches the shared canonical shortcut, even if another window replaces it.
    const cleanupStaging = (): void => {
      if (stagingPath === undefined) { return; }
      try { fileSystem.remove(stagingPath); }
      catch (error) {
        if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "ENOENT") { throw error; }
      }
    };
    const rejectWithCleanup = (error: unknown): void => {
      try { cleanupStaging(); }
      catch (cleanupError) {
        reject(new AggregateError([error, cleanupError], "SnoreToast identity installation and staging cleanup failed."));
        return;
      }
      reject(error);
    };
    let child: SnoreToastProcess;
    try {
      shortcutPath = options.shortcutPath;
      if (!win32.isAbsolute(shortcutPath)) {
        const appDataPath = options.appDataPath ?? process.env.APPDATA;
        if (!appDataPath || !win32.isAbsolute(appDataPath)) {
          throw new Error("SnoreToast identity registration requires an absolute APPDATA path.");
        }
        // Match the pinned installer's APPDATA-based startmenuPath and replace_extension.
        shortcutPath = win32.join(appDataPath, "Microsoft", "Windows", "Start Menu", "Programs", shortcutPath);
      }
      const parsedPath = win32.parse(shortcutPath);
      shortcutPath = win32.format({ dir: parsedPath.dir, name: parsedPath.name, ext: ".lnk" });
      // A unique sibling forces the pinned installer to refresh callback registration
      // while the previous working shortcut remains available until successful commit.
      stagingPath = win32.join(parsedPath.dir, parsedPath.name + ".install-" + randomUUID() + ".lnk");
      child = launch(options.executablePath, [
        "-install",
        stagingPath,
        options.executablePath,
        options.appId
      ]);
    } catch (error) {
      rejectWithCleanup(error);
      return;
    }

    let settled = false;
    const fail = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      rejectWithCleanup(error);
    };
    const timeout = setTimeout(() => {
      if (settled) {
        return;
      }
      fail(new Error("SnoreToast identity registration timed out."));
      try {
        child.kill();
      } catch {
        // The registration deadline remains authoritative if termination races or fails.
      }
    }, options.timeoutMs ?? 5_000);
    child.once("error", fail);
    child.once("exit", (code, signal) => {
      if (settled) {
        // A timed-out child may have written its staging link before termination finished.
        try { cleanupStaging(); } catch { /* The original rejection remains authoritative. */ }
        return;
      }
      if (signal !== null) {
        fail(new Error(`SnoreToast identity registration terminated by signal ${signal}.`));
        return;
      }
      if (code !== 0) {
        fail(new Error(`SnoreToast identity registration failed with status ${String(code)}.`));
        return;
      }
      try {
        // Node's Windows rename replaces an existing destination atomically.
        fileSystem.rename(stagingPath!, shortcutPath);
      } catch (error) {
        fail(error);
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve();
    });
  });
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
