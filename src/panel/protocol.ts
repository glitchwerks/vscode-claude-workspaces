import type { ManagedSessionSnapshot, SessionId } from "../sessions/sessionTypes";

const MAX_TERMINAL_DIMENSION = 1000;

/** Messages the webview may send to the extension host. */
export type WebviewMessage =
  | { readonly type: "ready" }
  | { readonly type: "input"; readonly sessionId: SessionId; readonly data: string }
  | {
      readonly type: "resize";
      readonly sessionId: SessionId;
      readonly columns: number;
      readonly rows: number;
    }
  | { readonly type: "selectSession"; readonly sessionId: SessionId }
  | { readonly type: "newSession" }
  | { readonly type: "newInFolder" }
  | { readonly type: "closeSession"; readonly sessionId: SessionId }
  | { readonly type: "restartFresh"; readonly sessionId: SessionId }
  | { readonly type: "previousSession" }
  | { readonly type: "nextSession" }
  | { readonly type: "configureWorkspace" };

/** Messages the extension host may send to the webview. */
export type HostMessage =
  | {
      readonly type: "hydrate";
      readonly sessions: readonly ManagedSessionSnapshot[];
      readonly activeSessionId: SessionId | undefined;
    }
  | { readonly type: "sessionAdded"; readonly session: ManagedSessionSnapshot }
  | { readonly type: "sessionUpdated"; readonly session: ManagedSessionSnapshot }
  | { readonly type: "sessionRemoved"; readonly sessionId: SessionId }
  | { readonly type: "sessionData"; readonly sessionId: SessionId; readonly data: string }
  | {
      readonly type: "activeSessionChanged";
      readonly activeSessionId: SessionId | undefined;
    };

/** Successful or rejected result from a closed-protocol decoder. */
export type DecodeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

/** Decodes and validates an untrusted message delivered from the webview. */
export function decodeWebviewMessage(value: unknown): DecodeResult<WebviewMessage> {
  if (!isRecord(value) || typeof value.type !== "string") {
    return rejected("Message must be an object with a type.");
  }

  switch (value.type) {
    case "ready":
    case "newSession":
    case "newInFolder":
    case "previousSession":
    case "nextSession":
    case "configureWorkspace":
      return hasExactKeys(value, ["type"])
        ? accepted(value as WebviewMessage)
        : rejected("Message contains unsupported fields.");
    case "input":
      return hasExactKeys(value, ["type", "sessionId", "data"]) &&
        isSessionId(value.sessionId) &&
        typeof value.data === "string"
        ? accepted({ type: "input", sessionId: value.sessionId, data: value.data })
        : rejected("Input requires a session id and string data.");
    case "resize":
      return hasExactKeys(value, ["type", "sessionId", "columns", "rows"]) &&
        isSessionId(value.sessionId) &&
        isDimension(value.columns) &&
        isDimension(value.rows)
        ? accepted({
            type: "resize",
            sessionId: value.sessionId,
            columns: value.columns,
            rows: value.rows
          })
        : rejected("Resize requires a session id and positive safe integer dimensions.");
    case "selectSession":
    case "closeSession":
    case "restartFresh":
      return hasExactKeys(value, ["type", "sessionId"]) && isSessionId(value.sessionId)
        ? accepted({ type: value.type, sessionId: value.sessionId })
        : rejected("Session action requires a session id.");
    default:
      return rejected("Message type is not supported.");
  }
}

/** Decodes host messages before they are consumed by the webview renderer. */
export function decodeHostMessage(value: unknown): DecodeResult<HostMessage> {
  if (!isRecord(value) || typeof value.type !== "string") {
    return rejected("Message must be an object with a type.");
  }

  switch (value.type) {
    case "hydrate":
      return hasExactKeys(value, ["type", "sessions", "activeSessionId"]) &&
        isArrayOf(value.sessions, isSession) &&
        isOptionalSessionId(value.activeSessionId)
        ? accepted({
            type: "hydrate",
            sessions: value.sessions,
            activeSessionId: value.activeSessionId
          })
        : rejected("Hydration requires valid sessions and active session id.");
    case "sessionAdded":
    case "sessionUpdated":
      return hasExactKeys(value, ["type", "session"]) && isSession(value.session)
        ? accepted({ type: value.type, session: value.session })
        : rejected("Session updates require a valid session.");
    case "sessionRemoved":
      return hasExactKeys(value, ["type", "sessionId"]) && isSessionId(value.sessionId)
        ? accepted({ type: "sessionRemoved", sessionId: value.sessionId })
        : rejected("Session removal requires a session id.");
    case "sessionData":
      return hasExactKeys(value, ["type", "sessionId", "data"]) &&
        isSessionId(value.sessionId) &&
        typeof value.data === "string"
        ? accepted({ type: "sessionData", sessionId: value.sessionId, data: value.data })
        : rejected("Session data requires a session id and string data.");
    case "activeSessionChanged":
      return hasExactKeys(value, ["type", "activeSessionId"]) && isOptionalSessionId(value.activeSessionId)
        ? accepted({ type: "activeSessionChanged", activeSessionId: value.activeSessionId })
        : rejected("Active session changes require a valid optional session id.");
    default:
      return rejected("Message type is not supported.");
  }
}

/** Identifies JSON-like object records while excluding arrays and null. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Confirms that a message carries only the fields allowed by its type. */
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && actualKeys.every((key) => keys.includes(key));
}

/** Accepts non-empty string session identifiers. */
function isSessionId(value: unknown): value is SessionId {
  return typeof value === "string" && value.length > 0;
}

/** Accepts the absence of an active session or a non-empty session identifier. */
function isOptionalSessionId(value: unknown): value is SessionId | undefined {
  return value === undefined || isSessionId(value);
}

/** Validates every own array element without accepting sparse or inherited entries. */
function isArrayOf<T>(
  value: unknown,
  isElement: (entry: unknown) => entry is T
): value is readonly T[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index) || !isElement(value[index])) {
      return false;
    }
  }

  return true;
}

/** Accepts bounded positive terminal-cell dimensions safe for the managed PTY boundary. */
function isDimension(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= MAX_TERMINAL_DIMENSION;
}

/** Validates the immutable session snapshot passed to presentation code. */
function isSession(value: unknown): value is ManagedSessionSnapshot {
  return isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "rootId",
      "displayName",
      "ordinalWithinRoot",
      "state",
      "launchedImportIds",
      "launchedAt"
    ]) &&
    isSessionId(value.id) &&
    typeof value.rootId === "string" &&
    typeof value.displayName === "string" &&
    typeof value.ordinalWithinRoot === "number" &&
    Number.isInteger(value.ordinalWithinRoot) &&
    value.ordinalWithinRoot > 0 &&
    (value.state === "starting" || value.state === "running" || value.state === "closing") &&
    isArrayOf(value.launchedImportIds, (id): id is string => typeof id === "string") &&
    typeof value.launchedAt === "number" &&
    Number.isFinite(value.launchedAt);
}

/** Creates a typed successful decode result. */
function accepted<T>(value: T): DecodeResult<T> {
  return { ok: true, value };
}

/** Creates a typed rejected decode result without throwing on untrusted data. */
function rejected<T>(error: string): DecodeResult<T> {
  return { ok: false, error };
}
