import type { CompanionContentNode, CompanionNode, CompanionTarget } from "./companionTypes";
import { extractCompanionContent } from "./companionContent";
import {
  boundedSavedReplyText, savedReplyLimits, type SavedReplyDisplay, type SavedReplyFeedbackStatus
} from "../panel/savedReplyProtocol";

export type SavedReplyImportResult =
  | { readonly status: "imported"; readonly reply: SavedReplyDisplay }
  | { readonly status: Exclude<SavedReplyFeedbackStatus, "copied"> };
export type SavedReplyCopyResult = Exclude<SavedReplyFeedbackStatus, "empty" | "oversize">;
export type SavedReplyCaptureResult =
  | { readonly status: "captured"; readonly reply: SavedReplyDisplay }
  | { readonly status: "unchanged" | "invalid" };

type ReplyProjection =
  | { readonly status: "imported"; readonly reply: SavedReplyDisplay }
  | { readonly status: "empty" | "oversize" | "invalid" };

interface SavedReplyClipboard {
  readonly readText: () => PromiseLike<string>;
  readonly writeText: (text: string) => PromiseLike<void>;
}

/** Renderable nodes contain no link destination or additional action payload. */
function displayNodes(
  nodes: readonly CompanionContentNode[],
  targets: readonly CompanionTarget[]
): readonly CompanionNode[] {
  let ordinal = 0;
  function displayNode(node: CompanionContentNode): CompanionNode {
    const nodeId = "n" + ++ordinal;
    if (node.kind === "code") {
      const { targetIndex, ...fields } = node;
      return Object.freeze({ ...fields, nodeId, targetId: targetIndex === null ? null : targets[targetIndex]?.targetId ?? null });
    }
    if (node.kind === "link") {
      return Object.freeze({ ...node, nodeId, href: null, children: Object.freeze(node.children.map(displayNode)) });
    }
    if ("children" in node) {
      return Object.freeze({ ...node, nodeId, children: Object.freeze(node.children.map(displayNode)) });
    }
    return Object.freeze({ ...node, nodeId });
  }
  return Object.freeze(nodes.map(displayNode));
}

function makeDisplay(sourceText: string, groupId: string): SavedReplyDisplay {
  const content = extractCompanionContent(sourceText, { sourceKind: "savedReply" });
  const targets = Object.freeze(content.targets.map((target, index): CompanionTarget => {
    const { sourceStart, sourceEnd, action, kind } = target;
    return Object.freeze({
      groupId,
      targetId: "t" + (index + 1),
      targetRevision: 1,
      sourceStart,
      sourceEnd,
      kind,
      action,
      accessibleLabel: (action === "copy" ? "Copy " : "Review ") + kind,
      displayLabel: kind === "command" ? "Command in reply" :
        kind === "code" ? "Code in reply" : action === "copy" ? "Copy path" : "Review path"
    });
  }));
  return Object.freeze({ groupId, sourceText, nodes: displayNodes(content.nodes, targets), targets });
}

/** Owns one immutable reply for one selected launch. It never sends terminal input. */
export class SavedReplyController {
  private selection: { readonly identity: string } | undefined;
  private current: SavedReplyDisplay | undefined;
  private captureSequence = 0;
  private captureValid = false;
  private capturedReplyId: string | undefined;
  private busy = false;
  private revision = 0;

  constructor(private readonly clipboard: SavedReplyClipboard) {}

  get reply(): SavedReplyDisplay | undefined {
    return this.current;
  }

  /** Drop reply authority if the selected launch or view changes. */
  select(identity: string | undefined): void {
    if (identity === this.selection?.identity) return;
    this.selection = identity === undefined ? undefined : { identity };
    this.current = undefined;
    this.clearCapture();
  }

  /** A retired native launch invalidates its capture without discarding a manual import. */
  clearCapture(): boolean {
    const cleared = this.current !== undefined && this.current.groupId === this.capturedReplyId;
    if (cleared) this.current = undefined;
    this.captureSequence = 0;
    this.captureValid = false;
    this.capturedReplyId = undefined;
    return cleared;
  }

  /** Admit the trusted Stop source only for the currently selected launch. */
  capture(identity: string, sequence: number, text: string): SavedReplyCaptureResult {
    if (identity !== this.selection?.identity || !Number.isSafeInteger(sequence) || sequence <= 0) {
      return { status: "invalid" };
    }
    if (sequence < this.captureSequence) return { status: "unchanged" };
    if (sequence === this.captureSequence) {
      return { status: this.captureValid ? "unchanged" : "invalid" };
    }
    this.captureSequence = sequence;
    const projected = this.project(text);
    this.captureValid = projected.status === "imported";
    if (projected.status !== "imported") return { status: "invalid" };
    this.capturedReplyId = projected.reply.groupId;
    return { status: "captured", reply: projected.reply };
  }

  /** An explicit import reads once and leaves the previous reply intact on failure. */
  async import(): Promise<SavedReplyImportResult> {
    const selection = this.selection;
    if (selection === undefined) return { status: "stale" };
    if (this.busy) return { status: "busy" };

    this.busy = true;
    try {
      let text: string;
      try {
        text = await this.clipboard.readText();
      } catch {
        return { status: selection === this.selection ? "clipboard" : "stale" };
      }
      if (selection !== this.selection) return { status: "stale" };
      return this.project(text);
    } finally {
      this.busy = false;
    }
  }

  private project(text: string): ReplyProjection {
    if (text.length > savedReplyLimits.sourceBytes || Buffer.byteLength(text) > savedReplyLimits.sourceBytes) {
      return { status: "oversize" };
    }
    if (!boundedSavedReplyText(text, savedReplyLimits.sourceBytes)) return { status: "invalid" };
    if (text.trim().length === 0) return { status: "empty" };

    const reply = makeDisplay(text, "reply-" + ++this.revision);
    if (Buffer.byteLength(JSON.stringify(reply)) > savedReplyLimits.displayBytes) return { status: "oversize" };
    this.current = reply;
    return { status: "imported", reply };
  }

  /** Copy an owned source range or an explicitly edited Review value. */
  async copy(replyId: string, targetId: string, editedValue?: string): Promise<SavedReplyCopyResult> {
    const selection = this.selection;
    const reply = this.current;
    if (selection === undefined || reply?.groupId !== replyId) return "stale";
    if (this.busy) return "busy";
    const target = reply.targets.find(value => value.targetId === targetId);
    if (target === undefined) return "invalid";

    let text: string;
    if (target.action === "review") {
      if (!boundedSavedReplyText(editedValue, savedReplyLimits.reviewBytes)) return "invalid";
      text = editedValue;
    } else {
      if (editedValue !== undefined) return "invalid";
      text = reply.sourceText.slice(target.sourceStart, target.sourceEnd);
    }
    this.busy = true;
    try {
      await this.clipboard.writeText(text);
      return selection === this.selection ? "copied" : "stale";
    } catch {
      return selection === this.selection ? "clipboard" : "stale";
    } finally {
      this.busy = false;
    }
  }
}
