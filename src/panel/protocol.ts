import type { ManagedSessionSnapshot, SessionId } from "../sessions/sessionTypes";
import type { ResumableSessionSnapshot } from "../sessions/resumableSessionStore";

const MAX_TERMINAL_DIMENSION = 1000;

/** Literal font metrics used by xterm for terminal-cell measurement and rendering. */
export interface TerminalFontMetrics {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly letterSpacing: number;
  readonly lineHeight: number;
}

/** Messages the webview may send to the extension host. */
export type WebviewMessage =
  | { readonly type: "ready" }
  | { readonly type: "input"; readonly sessionId: SessionId; readonly data: string }
  | { readonly type: "requestPaste"; readonly sessionId: SessionId }
  | { readonly type: "openExternal"; readonly sessionId: SessionId; readonly uri: string }
  | {
      readonly type: "resize";
      readonly sessionId: SessionId;
      readonly columns: number;
      readonly rows: number;
    }
  | { readonly type: "selectSession"; readonly sessionId: SessionId }
  | { readonly type: "requestRenameSession"; readonly sessionId: SessionId }
  | { readonly type: "newSession" }
  | { readonly type: "newInFolder" }
  | { readonly type: "resumeSession"; readonly claudeSessionId: string }
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
      readonly resumableSessions: readonly ResumableSessionSnapshot[];
      readonly activeSessionId: SessionId | undefined;
      readonly terminalFont: TerminalFontMetrics;
    }
  | { readonly type: "resumableSessionsChanged"; readonly sessions: readonly ResumableSessionSnapshot[] }
  | { readonly type: "sessionAdded"; readonly session: ManagedSessionSnapshot }
  | { readonly type: "sessionUpdated"; readonly session: ManagedSessionSnapshot }
  | { readonly type: "sessionRemoved"; readonly sessionId: SessionId }
  | { readonly type: "sessionData"; readonly sessionId: SessionId; readonly data: string }
  | { readonly type: "paste"; readonly sessionId: SessionId; readonly data: string }
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
    case "resumeSession":
      return hasExactKeys(value, ["type", "claudeSessionId"]) && isClaudeSessionId(value.claudeSessionId)
        ? accepted({ type: "resumeSession", claudeSessionId: value.claudeSessionId })
        : rejected("Resume requires only a canonical Claude session UUID.");
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
    case "openExternal":
      return hasExactKeys(value, ["type", "sessionId", "uri"]) &&
        isSessionId(value.sessionId) &&
        typeof value.uri === "string" &&
        value.uri.length > 0
        ? accepted({ type: "openExternal", sessionId: value.sessionId, uri: value.uri })
        : rejected("External navigation requires a session id and URI string.");
    case "selectSession":
    case "requestPaste":
    case "requestRenameSession":
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
      return hasExactKeysWithOptional(value, ["type", "sessions", "resumableSessions", "terminalFont"], "activeSessionId") &&
        isArrayOf(value.sessions, isSession) &&
        isResumableSessions(value.resumableSessions) &&
        isOptionalSessionId(value.activeSessionId) &&
        isTerminalFontMetrics(value.terminalFont)
        ? accepted({
            type: "hydrate",
            sessions: value.sessions,
            resumableSessions: value.resumableSessions,
            activeSessionId: value.activeSessionId,
            terminalFont: value.terminalFont
          })
        : rejected("Hydration requires valid live and resumable sessions, active session id, and terminal font metrics.");
    case "resumableSessionsChanged":
      return hasExactKeys(value, ["type", "sessions"]) && isResumableSessions(value.sessions)
        ? accepted({ type: "resumableSessionsChanged", sessions: value.sessions })
        : rejected("Resumable updates require valid unique session records.");
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
    case "paste":
      return hasExactKeys(value, ["type", "sessionId", "data"]) &&
        isSessionId(value.sessionId) &&
        typeof value.data === "string"
        ? accepted({ type: value.type, sessionId: value.sessionId, data: value.data })
        : rejected("Session data requires a session id and string data.");
    case "activeSessionChanged":
      return hasExactKeysWithOptional(value, ["type"], "activeSessionId") &&
        isOptionalSessionId(value.activeSessionId)
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

/** Allows one JSON-omittable field while requiring every other field exactly once. */
function hasExactKeysWithOptional(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
  optionalKey: string
): boolean {
  const actualKeys = Object.keys(value);
  return requiredKeys.every((key) => Object.hasOwn(value, key)) &&
    actualKeys.every((key) => key === optionalKey || requiredKeys.includes(key));
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

/** Accepts finite, positive terminal metrics and a literal non-empty font family. */
function isTerminalFontMetrics(value: unknown): value is TerminalFontMetrics {
  return isRecord(value) &&
    hasExactKeys(value, ["fontFamily", "fontSize", "letterSpacing", "lineHeight"]) &&
    typeof value.fontFamily === "string" &&
    value.fontFamily.trim().length > 0 &&
    typeof value.fontSize === "number" &&
    Number.isFinite(value.fontSize) &&
    value.fontSize >= 6 &&
    value.fontSize <= 100 &&
    typeof value.letterSpacing === "number" &&
    Number.isInteger(value.letterSpacing) &&
    value.letterSpacing >= -5 &&
    typeof value.lineHeight === "number" &&
    Number.isFinite(value.lineHeight) &&
    value.lineHeight >= 1;
}

/** Validates the immutable session snapshot passed to presentation code. */
function isSession(value: unknown): value is ManagedSessionSnapshot {
  return isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "claudeSessionId",
      "rootId",
      "displayName",
      "ordinalWithinRoot",
      "state",
      "launchedImportIds",
      "launchedAddDirPaths",
      "launchedAt"
    ]) &&
    isSessionId(value.id) &&
    (value.claudeSessionId === null || typeof value.claudeSessionId === "string") &&
    typeof value.rootId === "string" &&
    typeof value.displayName === "string" &&
    typeof value.ordinalWithinRoot === "number" &&
    Number.isInteger(value.ordinalWithinRoot) &&
    value.ordinalWithinRoot > 0 &&
    (value.state === "starting" || value.state === "running" || value.state === "closing") &&
    isArrayOf(value.launchedImportIds, (id): id is string => typeof id === "string") &&
    isArrayOf(
      value.launchedAddDirPaths,
      (path): path is string => typeof path === "string" && path.length > 0
    ) &&
    typeof value.launchedAt === "number" &&
    Number.isFinite(value.launchedAt);
}

/** Accepts only canonical lower-case RFC 4122 session identities. */
function isClaudeSessionId(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

/** Accepts canonical RFC 3339 timestamps whose Gregorian calendar day exists. */
function isCalendarValidRfc3339Timestamp(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (match === null || !Number.isFinite(Date.parse(value))) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const februaryDays = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  const daysInMonth = [31, februaryDays, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  return daysInMonth !== undefined && day >= 1 && day <= daysInMonth;
}

/** Validates complete resumable records identically for hydration and incremental updates. */
function isResumableSession(value: unknown): value is ResumableSessionSnapshot {
  return isRecord(value) && hasExactKeys(value, [
    "claudeSessionId", "displayName", "rootId", "rootLabel", "rootPath", "createdAt", "lastLaunchedAt"
  ]) && isClaudeSessionId(value.claudeSessionId) &&
    [value.displayName, value.rootId, value.rootLabel, value.rootPath].every(
      (field) => typeof field === "string" && field.trim().length > 0
    ) && [value.createdAt, value.lastLaunchedAt].every(isCalendarValidRfc3339Timestamp);
}

/** Rejects sparse records and repeated identities before presentation consumes the array. */
function isResumableSessions(value: unknown): value is readonly ResumableSessionSnapshot[] {
  return isArrayOf(value, isResumableSession) &&
    new Set(value.map((session) => session.claudeSessionId)).size === value.length;
}

/** Creates a typed successful decode result. */
function accepted<T>(value: T): DecodeResult<T> {
  return { ok: true, value };
}

/** Creates a typed rejected decode result without throwing on untrusted data. */
function rejected<T>(error: string): DecodeResult<T> {
  return { ok: false, error };
}
