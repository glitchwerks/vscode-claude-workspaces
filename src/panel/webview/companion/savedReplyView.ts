import type { CompanionTarget } from "../../../companion/companionTypes";
import type { SavedReplyDisplay, SavedReplyHostMessage, SavedReplyWebviewMessage } from "../../savedReplyProtocol";
import { CopyPreview } from "./copyPreview";
import { renderReplyContent } from "./replyContent";

interface SavedReplyViewOptions {
  readonly documentId: string;
  readonly postMessage: (message: SavedReplyWebviewMessage) => void;
  readonly onModeChange: (visible: boolean) => void;
  readonly focusTerminal?: () => void;
}
interface SelectedSession {
  readonly sessionId: string;
  readonly identity: string;
}
type PendingAction =
  | { readonly kind: "import"; readonly id: number; reveal: boolean }
  | { readonly kind: "copy"; readonly id: number; readonly review: CopyPreview | undefined };

const feedbackText = {
  copied: "Copied.",
  empty: "The clipboard contains no reply text.",
  oversize: "The copied reply exceeds the import size limit.",
  invalid: "The reply or copy target could not be used.",
  clipboard: "The clipboard is unavailable. Try again.",
  stale: "The selected reply changed. Use the current reply.",
  busy: "Another clipboard action is pending. Try again when it finishes."
} as const;

/** Read-only presentation of a single, explicitly imported reply in the current session. */
export class SavedReplyView {
  private readonly document: Document;
  private readonly importButton: HTMLButtonElement;
  private readonly rawButton: HTMLButtonElement;
  private readonly replyButton: HTMLButtonElement;
  private readonly reading: HTMLElement;
  private readonly feedback: HTMLElement;
  private session: SelectedSession | undefined;
  private reply: SavedReplyDisplay | undefined;
  private review: CopyPreview | undefined;
  private pending: PendingAction | undefined;
  private requestId = 0;
  private visible = false;
  private disposed = false;

  constructor(private readonly root: HTMLElement, private readonly options: SavedReplyViewOptions) {
    this.document = root.ownerDocument;
    root.classList.add("companion", "saved-reply");

    const toolbar = this.document.createElement("div");
    toolbar.className = "companion-toolbar";
    this.importButton = this.button("Import copied reply", () => this.importReply());
    this.rawButton = this.button("Raw", () => {
      this.showRaw();
      if (this.options.focusTerminal) this.options.focusTerminal();
      else this.replyButton.focus();
    });
    this.replyButton = this.button("Copied reply", () => {
      if (this.reply === undefined) return;
      this.setVisible(true);
      this.reading.focus();
    });
    toolbar.append(this.importButton, this.rawButton, this.replyButton);

    this.reading = this.document.createElement("div");
    this.reading.className = "companion-reading";
    this.reading.tabIndex = -1;
    this.reading.setAttribute("aria-label", "Imported reply");
    this.feedback = this.document.createElement("p");
    this.feedback.className = "companion-live";
    this.feedback.setAttribute("role", "status");
    root.append(toolbar, this.feedback, this.reading);
    this.refresh();
  }

  /** A new launch or selection expires the view's reply, pending response, and Review. */
  select(session?: SelectedSession): void {
    if (this.disposed || (this.session?.sessionId === session?.sessionId && this.session?.identity === session?.identity)) return;
    this.session = session;
    this.pending = undefined;
    this.reply = undefined;
    this.feedback.textContent = "";
    this.closeReview(false);
    this.reading.replaceChildren();
    this.setVisible(false);
  }

  /** Handle only the response for the current document, selection and action. */
  handle(message: SavedReplyHostMessage): void {
    const pending = this.pending;
    if (this.disposed || message.documentId !== this.options.documentId ||
        message.sessionId !== this.session?.sessionId || message.requestId !== pending?.id) return;
    if (message.type === "savedReplyImported") {
      if (pending.kind !== "import") return;
      this.pending = undefined;
      this.closeReview(false);
      this.reply = message.reply;
      this.renderReply(message.reply);
      this.feedback.textContent = "";
      this.setVisible(pending.reveal);
      if (this.visible) this.reading.focus();
      return;
    }
    if ((message.status === "copied" && pending.kind !== "copy") ||
        ((message.status === "empty" || message.status === "oversize") && pending.kind !== "import")) return;
    this.pending = undefined;
    const feedback = feedbackText[message.status];
    this.feedback.textContent = feedback;
    if (pending.kind === "copy" && pending.review !== undefined && pending.review === this.review) {
      if (message.status === "copied" || message.status === "stale") this.closeReview();
      else pending.review.setPending(false, feedback);
    }
    this.refresh();
  }

  /** Keep the selected reply while the existing terminal is shown. */
  showRaw(): void {
    if (this.disposed) return;
    if (this.pending?.kind === "import") this.pending.reveal = false;
    this.closeReview(false);
    this.setVisible(false);
  }

  dispose(): void {
    if (this.disposed) return;
    this.select();
    this.disposed = true;
    this.root.replaceChildren();
  }

  private importReply(): void {
    if (this.session === undefined || this.disposed || this.pending !== undefined) return;
    const requestId = ++this.requestId;
    this.pending = { kind: "import", id: requestId, reveal: true };
    this.feedback.textContent = "";
    this.closeReview(false);
    this.refresh();
    this.options.postMessage({ type: "savedReplyImport", documentId: this.options.documentId,
      sessionId: this.session.sessionId, requestId });
  }

  private copy(reply: SavedReplyDisplay, target: CompanionTarget, editedValue?: string): void {
    const session = this.session;
    if (session === undefined || !this.currentReply(reply) || this.pending !== undefined) return;
    const requestId = ++this.requestId;
    const review = editedValue === undefined ? undefined : this.review;
    this.pending = { kind: "copy", id: requestId, review };
    this.feedback.textContent = "";
    review?.setPending(true);
    this.refresh();
    this.options.postMessage({
      type: "savedReplyCopy", documentId: this.options.documentId, sessionId: session.sessionId,
      requestId, replyId: reply.groupId, targetId: target.targetId,
      ...(editedValue === undefined ? {} : { editedValue })
    });
  }

  private currentReply(reply: SavedReplyDisplay): boolean {
    return !this.disposed && this.visible && this.session !== undefined && reply === this.reply;
  }

  private openReview(reply: SavedReplyDisplay, target: CompanionTarget, invoker: HTMLButtonElement): void {
    this.closeReview(false);
    this.feedback.textContent = "";
    const preview = new CopyPreview(this.root, {
      value: reply.sourceText.slice(target.sourceStart, target.sourceEnd),
      label: target.kind === "path" ? "Path" : "Command",
      restoreFocus: () => { if (invoker.isConnected) invoker.focus(); },
      copy: value => {
        if (this.review === preview) this.copy(reply, target, value);
      },
      cancel: () => {
        if (this.review === preview) this.closeReview();
      }
    });
    this.review = preview;
  }

  private closeReview(restoreFocus = true): void {
    const current = this.review;
    this.review = undefined;
    current?.close(restoreFocus);
  }

  private renderReply(reply: SavedReplyDisplay): void {
    const title = this.document.createElement("h2");
    title.className = "saved-reply-title";
    title.textContent = "Imported reply — unverified";
    const group = this.document.createElement("section");
    group.className = "companion-group";
    renderReplyContent(group, reply, { renderTarget: target => {
      const wrapper = this.document.createElement("span");
      wrapper.className = "companion-target";
      const button = this.button(target.action === "copy" ? "Copy" : "Review", () => {
        if (!this.currentReply(reply) || this.pending !== undefined) return;
        if (target.action === "copy") this.copy(reply, target);
        else this.openReview(reply, target, button);
      });
      const context = Array.from(reply.sourceText.slice(target.sourceStart, target.sourceEnd)).slice(0, 96).join("");
      button.setAttribute("aria-label", target.accessibleLabel + ": " + context);
      button.dataset.targetId = target.targetId;
      wrapper.append(button);
      return wrapper;
    } });
    this.reading.replaceChildren(title, group);
    this.reading.scrollTop = 0;
  }

  private button(label: string, activate: () => void): HTMLButtonElement {
    const button = this.document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", activate);
    return button;
  }

  private setVisible(visible: boolean): void {
    const changed = this.visible !== visible;
    this.visible = visible;
    this.refresh();
    if (changed) this.options.onModeChange(visible);
  }

  private refresh(): void {
    this.root.hidden = this.session === undefined || this.disposed;
    this.root.dataset.mode = this.visible ? "companion" : "raw";
    this.reading.hidden = !this.visible;
    this.reading.setAttribute("aria-busy", String(this.pending !== undefined));
    this.rawButton.hidden = !this.visible;
    this.replyButton.hidden = this.visible || this.reply === undefined;
    this.importButton.disabled = this.pending !== undefined;
  }
}
