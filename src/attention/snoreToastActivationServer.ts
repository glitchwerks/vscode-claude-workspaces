import { randomUUID } from "node:crypto";
import { createServer, type Server, type Socket } from "node:net";

interface DisposableLike {
  dispose(): void;
}

const DEFAULT_CORRELATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_REGISTRATIONS = 1_024;
const DEFAULT_MAX_PAYLOAD_BYTES = 64 * 1_024;
const DEFAULT_SOCKET_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_CONNECTIONS = 64;

export interface SnoreToastActivation {
  readonly action: string;
  readonly notificationId: string;
}

export interface SnoreToastActivationRegistry extends DisposableLike {
  register(notificationId: string, sessionId: string): DisposableLike;
  onDidSelect(listener: (sessionId: string) => unknown): DisposableLike;
  accept(payload: Buffer): void;
}

export interface SnoreToastActivationServer extends SnoreToastActivationRegistry {
  readonly pipeName: string;
}

export interface SnoreToastActivationServerOptions {
  readonly pipeName?: string;
  readonly onError?: (error: unknown) => void;
  readonly now?: () => number;
  readonly correlationTtlMs?: number;
  readonly maxRegistrations?: number;
  readonly maxPayloadBytes?: number;
  readonly socketTimeoutMs?: number;
  readonly maxConnections?: number;
}

type SnoreToastActivationRegistryOptions = Pick<
  SnoreToastActivationServerOptions,
  "onError" | "now" | "correlationTtlMs" | "maxRegistrations"
>;

/** Decodes the callback format written by SnoreToast's Windows named-pipe client. */
export function parseSnoreToastActivation(payload: Buffer): SnoreToastActivation | undefined {
  const fields = new Map<string, string>();
  const text = payload.toString("utf16le").replace(/\0+$/u, "");
  for (const entry of text.split(";")) {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    fields.set(entry.slice(0, separator), entry.slice(separator + 1));
  }
  const action = fields.get("action");
  const notificationId = fields.get("notificationId");
  return action === undefined || notificationId === undefined
    ? undefined
    : { action, notificationId };
}

/** Correlates each terminal SnoreToast callback with the managed session that raised it. */
export function createSnoreToastActivationRegistry(
  options: SnoreToastActivationRegistryOptions = {}
): SnoreToastActivationRegistry {
  const now = options.now ?? (() => Date.now());
  const correlationTtlMs = Math.max(1, options.correlationTtlMs ?? DEFAULT_CORRELATION_TTL_MS);
  const maxRegistrations = Math.max(1, options.maxRegistrations ?? DEFAULT_MAX_REGISTRATIONS);
  const sessionsByNotification = new Map<
    string,
    { readonly sessionId: string; readonly expiresAt: number }
  >();
  const listeners = new Set<(sessionId: string) => unknown>();
  let disposed = false;
  const reportError = (error: unknown): void => {
    try {
      options.onError?.(error);
    } catch {
      // Diagnostics cannot make callback routing fail recursively.
    }
  };
  const pruneExpired = (): void => {
    const currentTime = now();
    for (const [notificationId, registration] of sessionsByNotification) {
      if (registration.expiresAt <= currentTime) {
        sessionsByNotification.delete(notificationId);
      }
    }
  };

  return {
    register: (notificationId, sessionId) => {
      if (disposed) {
        return { dispose: () => undefined };
      }
      pruneExpired();
      while (sessionsByNotification.size >= maxRegistrations) {
        const oldestNotificationId = sessionsByNotification.keys().next().value as
          string | undefined;
        if (oldestNotificationId === undefined) {
          break;
        }
        sessionsByNotification.delete(oldestNotificationId);
      }
      const registration = { sessionId, expiresAt: now() + correlationTtlMs };
      sessionsByNotification.set(notificationId, registration);
      return {
        dispose: () => {
          if (sessionsByNotification.get(notificationId) === registration) {
            sessionsByNotification.delete(notificationId);
          }
        }
      };
    },
    onDidSelect: (listener) => {
      if (!disposed) {
        listeners.add(listener);
      }
      return { dispose: () => listeners.delete(listener) };
    },
    accept: (payload) => {
      if (disposed) {
        return;
      }
      let activation: SnoreToastActivation | undefined;
      try {
        activation = parseSnoreToastActivation(payload);
      } catch (error) {
        reportError(error);
        return;
      }
      if (activation === undefined) {
        return;
      }
      pruneExpired();
      const registration = sessionsByNotification.get(activation.notificationId);
      if (registration === undefined) {
        return;
      }
      if (activation.action === "timedout") {
        // The banner faded, but Windows keeps the toast selectable in Action Center.
        return;
      }
      if (!["clicked", "hidden", "dismissed", "buttonClicked", "textEntered"]
        .includes(activation.action)) {
        return;
      }
      sessionsByNotification.delete(activation.notificationId);
      if (activation.action !== "clicked") {
        return;
      }
      for (const listener of [...listeners]) {
        try {
          listener(registration.sessionId);
        } catch (error) {
          reportError(error);
        }
      }
    },
    dispose: () => {
      disposed = true;
      sessionsByNotification.clear();
      listeners.clear();
    }
  };
}

/** Opens the per-extension-host named pipe that receives SnoreToast activation callbacks. */
export async function openSnoreToastActivationServer(
  options: SnoreToastActivationServerOptions = {}
): Promise<SnoreToastActivationServer> {
  const pipeName = options.pipeName ??
    `\\\\.\\pipe\\claude-workspaces-${process.pid}-${randomUUID()}`;
  const registry = createSnoreToastActivationRegistry(options);
  const sockets = new Set<Socket>();
  const server = createServer((socket) => collectCallback(
    socket,
    sockets,
    registry,
    options.onError,
    Math.max(1, options.maxPayloadBytes ?? DEFAULT_MAX_PAYLOAD_BYTES),
    Math.max(1, options.socketTimeoutMs ?? DEFAULT_SOCKET_TIMEOUT_MS),
    Math.max(1, options.maxConnections ?? DEFAULT_MAX_CONNECTIONS)
  ));
  await listen(server, pipeName);
  server.on("error", (error) => reportSafely(options.onError, error));
  let disposed = false;

  return {
    pipeName,
    register: registry.register,
    onDidSelect: registry.onDidSelect,
    accept: registry.accept,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      registry.dispose();
      sockets.forEach((socket) => socket.destroy());
      server.close();
    }
  };
}

function collectCallback(
  socket: Socket,
  sockets: Set<Socket>,
  registry: SnoreToastActivationRegistry,
  onError: ((error: unknown) => void) | undefined,
  maxPayloadBytes: number,
  socketTimeoutMs: number,
  maxConnections: number
): void {
  const chunks: Buffer[] = [];
  let payloadBytes = 0;
  let rejected = false;
  if (sockets.size >= maxConnections) {
    reportSafely(onError, new Error("SnoreToast callback connection limit exceeded."));
    socket.destroy();
    return;
  }
  sockets.add(socket);
  socket.setTimeout(socketTimeoutMs, () => {
    reportSafely(onError, new Error("SnoreToast callback connection timed out."));
    socket.destroy();
  });
  socket.on("data", (chunk: Buffer) => {
    if (rejected) {
      return;
    }
    payloadBytes += chunk.length;
    if (payloadBytes > maxPayloadBytes) {
      rejected = true;
      chunks.length = 0;
      reportSafely(onError, new Error("SnoreToast callback payload exceeded the size limit."));
      socket.destroy();
      return;
    }
    chunks.push(Buffer.from(chunk));
  });
  socket.once("end", () => {
    if (!rejected) {
      registry.accept(Buffer.concat(chunks));
    }
  });
  socket.once("close", () => sockets.delete(socket));
  socket.once("error", (error) => reportSafely(onError, error));
}

function listen(server: Server, pipeName: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const resolveOnce = (): void => {
      server.removeListener("error", rejectOnce);
      resolve();
    };
    const rejectOnce = (error: Error): void => {
      server.removeListener("listening", resolveOnce);
      reject(error);
    };
    server.once("error", rejectOnce);
    server.once("listening", resolveOnce);
    server.listen(pipeName);
  });
}

function reportSafely(
  onError: ((error: unknown) => void) | undefined,
  error: unknown
): void {
  try {
    onError?.(error);
  } catch {
    // Diagnostics cannot make callback routing fail recursively.
  }
}
