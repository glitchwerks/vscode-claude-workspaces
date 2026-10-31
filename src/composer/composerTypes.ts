/** Workspace-local companion document; the resumable-session schema stays independent. */
export const COMPOSER_STATE_KEY = "claudeWorkspaces.composerState";
export const MAX_DRAFT_UTF8_BYTES = 1_048_576;
export const RECENT_MAX_ITEMS = 20;
export const RECENT_MAX_UTF8_BYTES = 262_144;
export const FILE_RESULT_LIMIT = 100;
export const SAVE_DEBOUNCE_MS = 200;
export const CATALOG_TIMEOUT_MS = 2_000;
export const SUBMIT_ACK_TIMEOUT_MS = 5_000;
export const SPLIT_RATIO_MIN = 0.15;
export const SPLIT_RATIO_MAX = 0.75;
export const RECOVERY_PAGE_LIMIT = 100;
export const COMPOSER_SEND_MIN_VERSION = "2.1.299";

export type ComposerTarget = Readonly<{
  sessionId: string; claudeSessionId: string; generation: string;
}>;
export type ComposerCapability =
  | Readonly<{ status: "available"; target: ComposerTarget }>
  | Readonly<{ status: "unavailable"; sessionId: string; generation: string;
      reason: "unsupported-identity" }>;
export type ComposerLayout = Readonly<{ splitRatio: number }>;
export type DraftState = Readonly<{
  revision: number; text: string; selection: Readonly<{ anchor: number; head: number }>;
}>;
export type SavedComposerSession = Readonly<{
  claudeSessionId: string; rootId: string; rootPath: string; displayName: string;
  draft: DraftState; recent: readonly string[];
}>;
export type RecoveryDraftRow = Readonly<Pick<SavedComposerSession,
  "claudeSessionId" | "rootId" | "rootPath" | "displayName"> & { draftRevision: number }>;
export type RecoveryCursor = Readonly<{ revision: number; afterUuid: string }>;
export type RecoveryPage = Readonly<{
  revision: number; rows: readonly RecoveryDraftRow[]; nextCursor?: RecoveryCursor;
}>;
export type ComposerCommand = Readonly<{
  invocation: string; description: string; source: string; plugin?: string;
}>;
export type SubmitRequest = Readonly<{
  target: ComposerTarget; submissionId: string; draft: DraftState;
}>;
export type SubmitResult =
  | Readonly<{ status: "accepted"; submissionId: string; revision: number }>
  | Readonly<{ status: "rejected"; submissionId: string;
      reason: "unavailable" | "dialog" | "terminal-draft" | "invalid" }>
  | Readonly<{ status: "unconfirmed"; submissionId: string }>;
export type SaveResult = "saved" | "stale" | "forgotten" | "too-large" | "failed";
export interface ClaudeComposerAdapter {
  listCommands(target: ComposerTarget): Promise<readonly ComposerCommand[]>;
  submit(request: SubmitRequest): Promise<SubmitResult>;
  disposeSession(target: ComposerTarget): Promise<void>;
}

function offset(value: unknown, text: string): value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > text.length) { return false; }
  return value === 0 || value === text.length || !(/[\uD800-\uDBFF]/.test(text[value - 1]!) && /[\uDC00-\uDFFF]/.test(text[value]!));
}

/** Validates UTF-16 selection boundaries without truncating or rewriting draft text. */
export function isDraftState(value: unknown): value is DraftState {
  const record = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
  return record(value) && typeof value.revision === "number" && Number.isSafeInteger(value.revision)
    && value.revision >= 0 && typeof value.text === "string" && record(value.selection)
    && offset(value.selection.anchor, value.text) && offset(value.selection.head, value.text);
}
