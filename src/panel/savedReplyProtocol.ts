import type { CompanionGroup } from "../companion/companionTypes";
import { decodeCompanionDisplay } from "./companionProtocol";
import type { DecodeResult } from "./protocol";

export type SavedReplyDisplay = Pick<CompanionGroup, "groupId" | "sourceText" | "nodes" | "targets">;

export const savedReplyLimits = Object.freeze({
  sourceBytes: 128 * 1024,
  displayBytes: 2 * 1024 * 1024,
  reviewBytes: 32 * 1024,
  identityBytes: 128
});

interface ReplyCoordinates {
  readonly documentId: string;
  readonly sessionId: string;
  readonly requestId: number;
}

export type SavedReplyWebviewMessage = ReplyCoordinates & (
  | { readonly type: "savedReplyImport" }
  | {
      readonly type: "savedReplyCopy";
      readonly replyId: string;
      readonly targetId: string;
      readonly editedValue?: string;
    }
);

const feedbackStatuses = ["copied", "empty", "oversize", "invalid", "clipboard", "stale", "busy"] as const;
export type SavedReplyFeedbackStatus = (typeof feedbackStatuses)[number];

export type SavedReplyHostMessage = ReplyCoordinates & (
  | { readonly type: "savedReplyImported"; readonly reply: SavedReplyDisplay }
  | { readonly type: "savedReplyFeedback"; readonly status: SavedReplyFeedbackStatus }
);

const encoder = new TextEncoder();
const coordinates = ["type", "documentId", "sessionId", "requestId"];
const malformedScalar = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;

/** Bound original or edited text by UTF-8 bytes without modifying the value. */
export function boundedSavedReplyText(value: unknown, maxBytes: number): value is string {
  return typeof value === "string" && value.length <= maxBytes &&
    !value.includes("\0") && !malformedScalar.test(value) && encoder.encode(value).length <= maxBytes;
}

function identity(value: unknown): value is string {
  return boundedSavedReplyText(value, savedReplyLimits.identityBytes) && value.length > 0;
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function envelope(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const fields = value as Record<string, unknown>;
  return typeof fields.documentId === "string" && uuid.test(fields.documentId) &&
    identity(fields.sessionId) && typeof fields.requestId === "number" &&
    Number.isSafeInteger(fields.requestId) && fields.requestId > 0;
}

function rejected(): DecodeResult<never> {
  return { ok: false, error: "Invalid saved reply message or content bounds." };
}

/** Decode the copy-only browser intents. The host still verifies the active owner. */
export function decodeSavedReplyWebviewMessage(value: unknown): DecodeResult<SavedReplyWebviewMessage> {
  if (!envelope(value)) return rejected();
  if (value.type === "savedReplyImport" && exact(value, coordinates)) {
    return { ok: true, value: value as unknown as SavedReplyWebviewMessage };
  }
  if (value.type !== "savedReplyCopy") return rejected();
  const hasEdit = Object.hasOwn(value, "editedValue");
  const keys = [...coordinates, "replyId", "targetId"];
  if (hasEdit) keys.push("editedValue");
  if (!exact(value, keys) || !identity(value.replyId) || !identity(value.targetId) ||
    (hasEdit && !boundedSavedReplyText(value.editedValue, savedReplyLimits.reviewBytes))) {
    return rejected();
  }
  return { ok: true, value: value as unknown as SavedReplyWebviewMessage };
}

/** Validate the display content without accepting native capture or execution metadata. */
export function decodeSavedReplyHostMessage(value: unknown): DecodeResult<SavedReplyHostMessage> {
  if (!envelope(value)) return rejected();
  if (value.type === "savedReplyImported" && exact(value, [...coordinates, "reply"])) {
    const reply = decodeCompanionDisplay(value.reply, savedReplyLimits.sourceBytes, savedReplyLimits.displayBytes);
    if (reply.ok) return { ok: true, value: value as unknown as SavedReplyHostMessage };
  }
  if (value.type === "savedReplyFeedback" && exact(value, [...coordinates, "status"]) &&
    feedbackStatuses.some(status => status === value.status)) {
    return { ok: true, value: value as unknown as SavedReplyHostMessage };
  }
  return rejected();
}
