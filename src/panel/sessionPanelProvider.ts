import { randomBytes } from "node:crypto";

import * as vscode from "vscode";
import type { ComposerStore } from "../composer/composerStore";
import type { RecoveryCursor } from "../composer/composerTypes";
import type { ComposerHostMessage, ComposerWebviewMessage } from "./composerProtocol";
import type { PanelFailureReason } from "../logging/outputLogger";
import type { TerminalDiagnosticCapture } from "../diagnostics/terminalDiagnostics";
import { createTerminalProbeTracker } from "../diagnostics/terminalProbe";

import {
  decodeWebviewMessage,
  type HostMessage,
  type SessionSidebarPosition,
  type TerminalFontMetrics,
  type TerminalFocusResult,
  type WebviewMessage
} from "./protocol";
import type { ResumableSessionSnapshot } from "../sessions/resumableSessionStore";
import type {
  ManagedSessionSnapshot,
  SessionDataEvent,
  SessionId
} from "../sessions/sessionTypes";

const SESSION_VIEW_ID = "claudeWorkspaces.sessions";
const RECENT_OUTPUT_LIMIT = 256 * 1024;

interface DiagnosticDeliveryState {
  active: boolean;
  pending: number;
  readonly captureId: string;
  readonly documentId: string | undefined;
  readonly capture: TerminalDiagnosticCapture;
}

/** Retired promises retain only a weak handle, never the provider or its capture state. */
function completeDiagnosticDelivery(reference: WeakRef<DiagnosticDeliveryState>): void {
  const state = reference.deref();
  if (state?.active !== true || state.capture.captureId !== state.captureId) { return; }
  state.pending -= 1;
  state.capture.record("pendingMessages", state.pending);
}

/** Read-only session data made available to the session panel. */
export interface SessionPanelSessionSource {
  readonly sessions: readonly ManagedSessionSnapshot[];
  readonly activeSessionId: SessionId | undefined;
  readonly onDidChangeSessions: vscode.Event<readonly ManagedSessionSnapshot[]>;
  readonly onDidReceiveData: vscode.Event<SessionDataEvent>;
}

/** Read-only persisted session metadata, with no process or persistence mutation authority. */
export interface SessionPanelResumableSource {
  readonly sessions: readonly ResumableSessionSnapshot[];
  readonly onDidChangeSessions: vscode.Event<readonly ResumableSessionSnapshot[]>;
}

/** Validated intents the panel may request without process-level access. */
export interface SessionPanelActions {
  input(
    sessionId: SessionId,
    data: string,
    isPromptSubmission: boolean
  ): void | PromiseLike<void>;
  resize(sessionId: SessionId, columns: number, rows: number): void | PromiseLike<void>;
  selectSession(sessionId: SessionId): void | PromiseLike<void>;
  renameSession(sessionId: SessionId, displayName: string): void | PromiseLike<void>;
  newSession(): void | PromiseLike<void>;
  newInFolder(): void | PromiseLike<void>;
  resumeSession(claudeSessionId: string): void | PromiseLike<void>;
  forgetSession(claudeSessionId: string): void | PromiseLike<void>;
  closeSession(sessionId: SessionId): void | PromiseLike<void>;
  restartFresh(sessionId: SessionId): void | PromiseLike<void>;
  previousSession(): void | PromiseLike<void>;
  nextSession(): void | PromiseLike<void>;
  configureWorkspace(): void | PromiseLike<void>;
}

/** Dependencies for rendering and operating the constrained session panel. */
export interface SessionPanelProviderDependencies {
  readonly composer?: {
    readonly store: Pick<ComposerStore,"recoveryPage"|"getRecoverable"|"onDidChangeRecovery">;
    handle(message: ComposerWebviewMessage): PromiseLike<void>;
    ready(): PromiseLike<void>;
    viewDisposed(): void;
  };
  readonly terminalDiagnostics?: TerminalDiagnosticCapture;
  readonly diagnosticNow?: () => number;
  readonly checkConversationEligibility?: (sessionId: string) => PromiseLike<"present" | "absent" | "unknown">;
  readonly extensionUri: vscode.Uri;
  readonly sessions: SessionPanelSessionSource;
  readonly resumableSessions: SessionPanelResumableSource;
  readonly actions: SessionPanelActions;
  readonly terminalFont: TerminalFontMetrics;
  readonly sessionDetailsInitiallyExpanded?: boolean;
  readonly getSidebarPosition?: () => unknown;
  readonly getSidebarInitiallyExpanded?: () => unknown;
  readonly readClipboardText?: () => PromiseLike<string>;
  readonly openExternal?: (uri: vscode.Uri) => PromiseLike<boolean>;
  readonly requestSessionName?: (
    options: vscode.InputBoxOptions
  ) => PromiseLike<string | undefined>;
  readonly onDidChangeVisibility?: (visible: boolean) => void;
  readonly reportTerminalFocus?: (result: TerminalFocusResult) => void;
  readonly log?: (reason: PanelFailureReason) => void;
}

/** Provides the Claude-only webview panel from immutable session state and validated intents. */
export class SessionPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly providerSubscriptions: vscode.Disposable[] = [];
  private readonly viewSubscriptions: vscode.Disposable[] = [];
  private view: vscode.WebviewView | undefined;
  private visible: boolean | undefined;
  private sessions = new Map<SessionId, ManagedSessionSnapshot>();
  private resumableSessions: readonly ResumableSessionSnapshot[] = [];
  private readonly recentOutput = new Map<SessionId, string>();
  private readonly discardingOutputLine = new Set<SessionId>();
  private activeSessionId: SessionId | undefined;
  private viewGeneration = 0;
  private eligibilityGeneration = 0;
  private checkingEligibility = false;
  private eligibilityRefreshPending = false;
  private eligibilityRetry: ReturnType<typeof setTimeout> | undefined;
  private ready = false;
  private recoveryRevision = 0;
  private recoveryStoreRevision: number | undefined;
  private readonly recoveryCursors = new Set<string>();
  private sidebarPosition: SessionSidebarPosition = "right";
  private renderedSidebarPosition: SessionSidebarPosition = "right";
  private readonly readyDocumentIds = new Set<string>();
  private pasteQueue: Promise<void> = Promise.resolve();
  private diagnosticDocumentId: string | undefined;
  private diagnosticCaptureId: string | undefined;
  private diagnosticWindowSequence = 0;
  private diagnosticStop: { captureId: string; documentId: string; viewGeneration: number;
    promise: Promise<void>; resolve: () => void; timer: ReturnType<typeof setTimeout> } | undefined;
  private readonly diagnosticNow: () => number;
  private readonly outputProbes: ReturnType<typeof createTerminalProbeTracker>;
  private diagnosticDeliveries: DiagnosticDeliveryState | undefined;
  private readonly retiredDiagnosticSessions = new Map<string, number>();

  constructor(private readonly dependencies: SessionPanelProviderDependencies) {
    this.diagnosticNow = dependencies.diagnosticNow ?? (() => performance.now());
    this.outputProbes = createTerminalProbeTracker({ now: this.diagnosticNow,
      activeSessionId: () => this.activeSessionId,
      onCounter: (metric, count) => dependencies.terminalDiagnostics?.record(metric, count) });
    this.replaceSessionSnapshot(dependencies.sessions.sessions);
    this.activeSessionId = dependencies.sessions.activeSessionId;
    this.updateResumableSessions();
    const recoverySubscription=dependencies.composer?.store.onDidChangeRecovery(()=>this.invalidateRecovery());
    if(recoverySubscription!==undefined)this.providerSubscriptions.push(recoverySubscription);
    this.providerSubscriptions.push(
      dependencies.sessions.onDidChangeSessions((sessions) => this.handleSessionsChanged(sessions)),
      dependencies.sessions.onDidReceiveData((event) => this.handleSessionData(event)),
      dependencies.resumableSessions.onDidChangeSessions(() => this.updateResumableSessions())
    );
  }

  /** Configures a resolved view with local resources, nonce CSP, and the closed protocol listener. */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.resetTerminalDiagnostics();
    if (this.view !== undefined) {
      this.dependencies.composer?.viewDisposed();
      this.reportVisibility(false);
    }
    this.disposeViewSubscriptions();
    this.view = webviewView;
    this.updateWaitingBadge();
    this.reportVisibility(webviewView.visible);
    const viewGeneration = ++this.viewGeneration;
    this.ready = false;
    this.readyDocumentIds.clear();
    this.updateResumableSessions();
    this.scheduleEligibilityRetry();
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.dependencies.extensionUri]
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);
    const visibilitySubscription = webviewView.onDidChangeVisibility?.(() => {
      if (this.view === webviewView) {
        this.reportVisibility(webviewView.visible);
        if (webviewView.visible) {
          this.updateResumableSessions();
        }
      }
    });
    if (visibilitySubscription !== undefined) {
      this.viewSubscriptions.push(visibilitySubscription);
    }
    this.viewSubscriptions.push(
      webviewView.webview.onDidReceiveMessage((message: unknown) => {
        this.handleWebviewMessage(message, viewGeneration);
      }),
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) {
          this.dependencies.composer?.viewDisposed();
          this.resetTerminalDiagnostics();
          this.reportVisibility(false);
          this.view = undefined;
          this.viewGeneration += 1;
          this.ready = false;
          this.readyDocumentIds.clear();
          this.eligibilityGeneration += 1;
          clearTimeout(this.eligibilityRetry);
          this.disposeViewSubscriptions();
        }
      })
    );
  }

  /** Refocuses a live selected terminal even when selecting it did not change session state. */
  focusSession(sessionId: SessionId): void {
    if (
      sessionId !== this.dependencies.sessions.activeSessionId ||
      !this.sessions.has(sessionId)
    ) {
      return;
    }
    // A loading renderer focuses the selected terminal during its initial hydration.
    this.post({ type: "focusSession", sessionId });
  }

  /** Applies placement preferences without rebuilding the webview or its terminals. */
  refreshSidebarPosition(): void {
    const position = this.dependencies.getSidebarPosition?.() === "left" ? "left" : "right";
    if (position === this.sidebarPosition) {
      return;
    }
    this.sidebarPosition = position;
    this.post({ type: "sidebarPositionChanged", position });
  }

  /** Releases panel subscriptions without touching the session or PTY lifecycle. */
  dispose(): void {
    this.dependencies.composer?.viewDisposed();
    this.resetTerminalDiagnostics();
    this.reportVisibility(false);
    this.view = undefined;
    this.viewGeneration += 1;
    this.ready = false;
    this.readyDocumentIds.clear();
    this.eligibilityGeneration += 1;
    clearTimeout(this.eligibilityRetry);
    this.disposeViewSubscriptions();
    for (const subscription of this.providerSubscriptions.splice(0)) {
      subscription.dispose();
    }
  }

  /** Flushes the current renderer before retiring capture, without blocking terminal actions. */
  stopTerminalDiagnostics(): Promise<void> {
    const capture = this.dependencies.terminalDiagnostics;
    if (!capture?.active) { return Promise.resolve(); }
    const captureId = capture.captureId;
    const pending = this.diagnosticStop;
    if (pending !== undefined && pending.captureId === captureId) { return pending.promise; }
    if (!this.ready || this.diagnosticDocumentId === undefined || captureId === undefined || this.diagnosticCaptureId !== captureId) {
      capture.toggle();
      this.refreshTerminalDiagnostics();
      return Promise.resolve();
    }
    let resolve!: () => void;
    const promise = new Promise<void>((complete) => { resolve = complete; });
    const timer = setTimeout(() => this.finishDiagnosticStop(true), 1_000);
    timer.unref();
    this.diagnosticStop = { captureId, documentId: this.diagnosticDocumentId,
      viewGeneration: this.viewGeneration, promise, resolve, timer };
    this.postDiagnostic({ type: "terminalDiagnostics", documentId: this.diagnosticDocumentId, captureId: null });
    return promise;
  }

  private cancelDiagnosticStop(): void {
    const pending = this.diagnosticStop;
    this.diagnosticStop = undefined;
    if (pending !== undefined) { clearTimeout(pending.timer); pending.resolve(); }
  }

  private finishDiagnosticStop(timedOut = false): void {
    const pending = this.diagnosticStop;
    if (pending === undefined) { return; }
    this.cancelDiagnosticStop();
    const capture = this.dependencies.terminalDiagnostics;
    if (capture?.captureId === pending.captureId && this.diagnosticDocumentId === pending.documentId &&
      this.viewGeneration === pending.viewGeneration) {
      if (timedOut) { capture.record("frontendDrainTimeout", 1); }
      if (capture.captureId === pending.captureId) { capture.toggle(); }
      this.refreshTerminalDiagnostics();
    }
  }

  /** Synchronizes capture controls only with the currently hydrated renderer document. */
  refreshTerminalDiagnostics(): void {
    const next = this.ready && this.diagnosticDocumentId !== undefined
      ? this.dependencies.terminalDiagnostics?.captureId : undefined;
    if (next !== this.diagnosticCaptureId) {
      this.cancelDiagnosticStop();
      this.retireDiagnosticDeliveries();
      this.retiredDiagnosticSessions.clear();
      this.diagnosticCaptureId = next;
      this.diagnosticWindowSequence = 0;
      this.outputProbes.setCapture(next);
      if (this.diagnosticDocumentId !== undefined) {
        this.postDiagnostic({ type: "terminalDiagnostics", documentId: this.diagnosticDocumentId, captureId: next ?? null });
      }
    }
    this.outputProbes.sweep();
    this.sweepRetiredDiagnosticSessions();
  }

  private resetTerminalDiagnostics(): void {
    this.cancelDiagnosticStop();
    this.retireDiagnosticDeliveries();
    if (this.diagnosticDocumentId !== undefined && this.dependencies.terminalDiagnostics?.active) {
      this.dependencies.terminalDiagnostics.toggle();
    }
    this.diagnosticDocumentId = undefined;
    this.diagnosticCaptureId = undefined;
    this.diagnosticWindowSequence = 0;
    this.retiredDiagnosticSessions.clear();
    this.outputProbes.setCapture(undefined);
  }

  private retireDiagnosticDeliveries(): void {
    if (this.diagnosticDeliveries !== undefined) { this.diagnosticDeliveries.active = false; }
    this.diagnosticDeliveries = undefined;
  }

  private sweepRetiredDiagnosticSessions(): void {
    if (this.diagnosticCaptureId === undefined) { this.retiredDiagnosticSessions.clear(); return; }
    const cutoff = this.diagnosticNow() - 30_000;
    for (const [id, timestamp] of this.retiredDiagnosticSessions) {
      if (timestamp <= cutoff) { this.retiredDiagnosticSessions.delete(id); }
    }
  }

  private postDiagnostic(message: HostMessage): void {
    try { if (this.ready) { void Promise.resolve(this.view?.webview.postMessage(message)).catch(() => undefined); } }
    catch { /* Diagnostic delivery cannot interrupt terminal actions. */ }
  }

  /** Releases listeners owned by the current webview resolution. */
  private disposeViewSubscriptions(): void {
    for (const subscription of this.viewSubscriptions.splice(0)) {
      subscription.dispose();
    }
  }

  /** Reports only visibility transitions for the currently resolved view. */
  private reportVisibility(visible: boolean): void {
    if (visible === this.visible) {
      return;
    }
    this.visible = visible;
    this.dependencies.onDidChangeVisibility?.(visible);
  }

  /** Renders the shell that loads only bundled local assets with a unique script nonce. */
  private renderHtml(webview: vscode.Webview): string {
    const nonce = randomBytes(16).toString("base64");
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(
      this.dependencies.extensionUri,
      "dist",
      "panel",
      "webview",
      "index.js"
    ));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(
      this.dependencies.extensionUri,
      "dist",
      "panel",
      "webview",
      "index.css"
    ));
    const sessionDetailsInitiallyExpanded =
      this.dependencies.sessionDetailsInitiallyExpanded !== false;
    this.sidebarPosition = this.dependencies.getSidebarPosition?.() === "left" ? "left" : "right";
    this.renderedSidebarPosition = this.sidebarPosition;
    const sidebarInitiallyExpanded = this.dependencies.getSidebarInitiallyExpanded?.() !== false;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}">
<title>Claude Workspaces</title>
</head>
<body>
<main id="app" aria-label="Claude sessions" data-session-details-initially-expanded="${
  sessionDetailsInitiallyExpanded
}" data-session-sidebar-position="${this.sidebarPosition}" data-session-sidebar-initially-expanded="${sidebarInitiallyExpanded}"></main>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /** Rejects malformed messages and forwards only allow-listed intents to injected host actions. */
  private handleWebviewMessage(message: unknown, viewGeneration: number): void {
    const decoded = decodeWebviewMessage(message);
    if (!decoded.ok) {
      this.log("invalid-message");
      return;
    }

    const action = this.actionFor(decoded.value, viewGeneration);
    if (action !== undefined) {
      const enteredAt = decoded.value.type === "input" && this.dependencies.terminalDiagnostics?.active ? this.diagnosticNow() : undefined;
      void Promise.resolve().then(() => {
        if (viewGeneration !== this.viewGeneration) {
          return;
        }
        if (enteredAt === undefined || decoded.value.type !== "input") { return action(); }
        const input = decoded.value;
        const started = this.diagnosticNow();
        const queueMs = started - enteredAt;
        const captureId = this.diagnosticCaptureId;
        const documentId = this.diagnosticDocumentId;
        this.dependencies.terminalDiagnostics?.record("inputQueueMs", queueMs, input.sessionId);
        const finished = (): void => {
          const actionMs = this.diagnosticNow() - started;
          this.dependencies.terminalDiagnostics?.record("inputActionMs", actionMs, input.sessionId);
          if (captureId !== undefined && captureId === this.dependencies.terminalDiagnostics?.captureId &&
            captureId === input.probe?.captureId && documentId !== undefined && documentId === this.diagnosticDocumentId &&
            this.sessions.has(input.sessionId) && viewGeneration === this.viewGeneration &&
            queueMs >= 0 && queueMs <= 300_000 && actionMs >= 0 && actionMs <= 300_000) {
            this.postDiagnostic({ type: "terminalInputAck", documentId, sessionId: input.sessionId, probe: input.probe, queueMs, actionMs });
          }
        };
        return Promise.resolve(action()).then(finished, (error: unknown) => { finished(); throw error; });
      }).catch(() => {
        this.log("action-failed");
      });
    }
  }

  /** Maps a validated protocol message to its process-free host action. */
  private actionFor(
    message: WebviewMessage,
    viewGeneration: number
  ): (() => void | PromiseLike<void>) | undefined {
    if(message.type.startsWith("composer"))return ()=>this.handleComposerMessage(message as ComposerWebviewMessage);
    switch (message.type) {
      case "terminalDiagnosticsStopped":
        return () => {
          const pending = this.diagnosticStop;
          if (pending !== undefined && message.captureId === pending.captureId &&
            message.captureId === this.dependencies.terminalDiagnostics?.captureId && message.documentId === pending.documentId &&
            pending.viewGeneration === viewGeneration && message.sequence === this.diagnosticWindowSequence) {
            this.finishDiagnosticStop();
          }
        };
      case "terminalTimingWindow":
        return () => {
          this.sweepRetiredDiagnosticSessions();
          if (message.captureId !== this.diagnosticCaptureId || message.captureId !== this.dependencies.terminalDiagnostics?.captureId ||
            message.documentId !== this.diagnosticDocumentId || message.sequence <= this.diagnosticWindowSequence ||
            message.frame.sessions.some((session) => session.sessionId !== null && !this.sessions.has(session.sessionId) &&
              !this.retiredDiagnosticSessions.has(session.sessionId))) { return; }
          this.diagnosticWindowSequence = message.sequence;
          let omittedSamples = message.frame.omittedSamples;
          const sessions = message.frame.sessions.filter((session) => {
            if (session.sessionId === null || this.sessions.has(session.sessionId)) { return true; }
            for (const metric of session.metrics) { omittedSamples = Math.min(Number.MAX_SAFE_INTEGER, omittedSamples + metric.count); }
            return false;
          });
          this.dependencies.terminalDiagnostics.merge({ sessions, omittedSamples });
        };
      case "terminalOutputAck":
        return () => {
          if (message.documentId !== this.diagnosticDocumentId || message.probe.captureId !== this.dependencies.terminalDiagnostics?.captureId ||
            !this.sessions.has(message.sessionId)) { return; }
          const elapsed = this.outputProbes.complete(message.probe, message.sessionId);
          if (elapsed !== undefined) { this.dependencies.terminalDiagnostics?.record("outputRoundTripMs", elapsed, message.sessionId); }
        };
      case "terminalFocusResult":
        return () => {
          if (message.sessionId === this.dependencies.sessions.activeSessionId && this.sessions.has(message.sessionId)) {
            this.dependencies.reportTerminalFocus?.({ phase: message.phase,
              documentHasFocus: message.documentHasFocus, terminalHasFocus: message.terminalHasFocus });
          }
        };
      case "ready":
        return () => this.hydrate(message.documentId);
      case "input":
        return () => this.dependencies.actions.input(
          message.sessionId,
          message.data,
          message.isPromptSubmission
        );
      case "requestPaste":
        return () => this.queuePaste(message.sessionId, viewGeneration);
      case "openExternal":
        return () => this.openExternal(message.sessionId, message.uri, viewGeneration);
      case "resize":
        return () => this.dependencies.actions.resize(message.sessionId, message.columns, message.rows);
      case "selectSession":
        return () => this.dependencies.actions.selectSession(message.sessionId);
      case "requestRenameSession":
        return () => this.requestRenameSession(message.sessionId, viewGeneration);
      case "newSession":
        return () => this.dependencies.actions.newSession();
      case "newInFolder":
        return () => this.dependencies.actions.newInFolder();
      case "resumeSession":
        return () => this.dependencies.actions.resumeSession(message.claudeSessionId);
      case "forgetSession":
        return () => this.dependencies.actions.forgetSession(message.claudeSessionId);
      case "closeSession":
        return () => this.dependencies.actions.closeSession(message.sessionId);
      case "restartFresh":
        return () => this.dependencies.actions.restartFresh(message.sessionId);
      case "previousSession":
        return () => this.dependencies.actions.previousSession();
      case "nextSession":
        return () => this.dependencies.actions.nextSession();
      case "configureWorkspace":
        return () => this.dependencies.actions.configureWorkspace();
    }
  }

  /** Prompts for and applies a presentation-only name to a still-live session. */
  private async requestRenameSession(
    sessionId: SessionId,
    viewGeneration: number
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session === undefined || viewGeneration !== this.viewGeneration) {
      return;
    }
    const options: vscode.InputBoxOptions = {
      title: "Rename Claude Session",
      prompt: "Enter a name for this live session.",
      value: session.displayName,
      valueSelection: [0, session.displayName.length],
      validateInput: (value) =>
        value.trim().length === 0 ? "Session name cannot be blank." : undefined
    };
    const displayName = await (
      this.dependencies.requestSessionName?.(options) ?? vscode.window.showInputBox(options)
    );
    const normalizedName = displayName?.trim();
    if (
      normalizedName === undefined ||
      normalizedName.length === 0 ||
      viewGeneration !== this.viewGeneration ||
      !this.sessions.has(sessionId)
    ) {
      return;
    }
    await this.dependencies.actions.renameSession(sessionId, normalizedName);
  }

  /** Opens a validated web URI only for the still-current active session and webview. */
  private async openExternal(
    sessionId: SessionId,
    candidate: string,
    viewGeneration: number
  ): Promise<void> {
    if (
      viewGeneration !== this.viewGeneration ||
      sessionId !== this.activeSessionId ||
      !this.sessions.has(sessionId)
    ) {
      return;
    }
    const uri = parseExternalWebUri(candidate);
    if (uri === undefined) {
      return;
    }
    const opened = await (this.dependencies.openExternal?.(uri) ?? vscode.env.openExternal(uri));
    if (!opened) {
      this.log("external-open-failed");
    }
  }

  /** Serializes host clipboard reads so repeated paste requests retain invocation order. */
  private queuePaste(sessionId: SessionId, viewGeneration: number): Promise<void> {
    const operation = this.pasteQueue.then(() =>
      this.pasteIntoActiveSession(sessionId, viewGeneration)
    );
    this.pasteQueue = operation.catch(() => undefined);
    return operation;
  }

  /** Returns trusted clipboard data only to the still-current active terminal. */
  private async pasteIntoActiveSession(
    sessionId: SessionId,
    viewGeneration: number
  ): Promise<void> {
    if (
      viewGeneration !== this.viewGeneration ||
      sessionId !== this.activeSessionId ||
      !this.sessions.has(sessionId)
    ) {
      return;
    }
    const text = await (
      this.dependencies.readClipboardText?.() ?? vscode.env.clipboard.readText()
    );
    if (
      text.length === 0 ||
      viewGeneration !== this.viewGeneration ||
      sessionId !== this.activeSessionId ||
      !this.sessions.has(sessionId)
    ) {
      return;
    }
    this.post({ type: "paste", sessionId, data: text });
  }

  /** Sends the latest immutable session snapshot after the webview declares readiness. */
  private hydrate(documentId?: string): void {
    if (documentId === undefined ? this.ready : this.readyDocumentIds.has(documentId)) {
      return;
    }
    if (this.diagnosticDocumentId !== undefined && this.diagnosticDocumentId !== documentId) { this.resetTerminalDiagnostics(); }
    this.diagnosticDocumentId = documentId;
    this.refreshSidebarPosition();
    this.ready = true;
    if (documentId !== undefined) {
      this.readyDocumentIds.add(documentId);
    }
    this.post({
      type: "hydrate",
      sessions: [...this.sessions.values()],
      resumableSessions: this.resumableSessions,
      activeSessionId: this.activeSessionId,
      terminalFont: this.dependencies.terminalFont
    });
    if (this.sidebarPosition !== this.renderedSidebarPosition) {
      this.post({ type: "sidebarPositionChanged", position: this.sidebarPosition });
    }
    for (const sessionId of this.sessions.keys()) {
      const data = this.recentOutput.get(sessionId);
      if (data !== undefined) {
        this.dependencies.terminalDiagnostics?.record("replayCharacters", data.length, sessionId);
        this.post({ type: "sessionData", sessionId, data });
      }
    }
    this.refreshTerminalDiagnostics();
    if(documentId!==undefined && this.dependencies.composer!==undefined){
      void Promise.resolve(this.dependencies.composer.ready()).catch(()=>this.log("action-failed"));
      this.invalidateRecovery();
    }
  }

  /** Retains output across unavailable webviews while continuing live delivery. */
  private handleSessionData(event: SessionDataEvent): void {
    if (!this.sessions.has(event.sessionId)) {
      return;
    }
    let replayableData = event.data;
    if (this.discardingOutputLine.has(event.sessionId)) {
      const newlineIndex = replayableData.indexOf("\n");
      if (newlineIndex < 0) {
        this.postLiveData(event);
        return;
      }
      this.discardingOutputLine.delete(event.sessionId);
      replayableData = replayableData.slice(newlineIndex + 1);
    }
    const combined = (this.recentOutput.get(event.sessionId) ?? "") + replayableData;
    const retained = boundReplayableOutput(combined);
    if (retained.output === "") {
      this.recentOutput.delete(event.sessionId);
    } else {
      this.recentOutput.set(event.sessionId, retained.output);
    }
    if (retained.discardedUnterminatedLine) {
      this.discardingOutputLine.add(event.sessionId);
    }
    this.postLiveData(event);
  }

  private postLiveData(event: SessionDataEvent): void {
    if (this.diagnosticCaptureId !== this.dependencies.terminalDiagnostics?.captureId) { this.refreshTerminalDiagnostics(); }
    const probe = this.outputProbes.begin(event.sessionId);
    this.post({ type: "sessionData", sessionId: event.sessionId, data: event.data, ...(probe === undefined ? {} : { probe }) });
  }

  /** Diffs launch-ordered session snapshots into the closed renderer update stream. */
  private handleSessionsChanged(nextSessions: readonly ManagedSessionSnapshot[]): void {
    const previous = this.sessions;
    const next = new Map(nextSessions.map((session) => [session.id, session]));
    for (const sessionId of previous.keys()) {
      if (!next.has(sessionId)) {
        this.outputProbes.forgetSession(sessionId);
        if (this.diagnosticCaptureId !== undefined && this.diagnosticCaptureId === this.dependencies.terminalDiagnostics?.captureId) {
          this.sweepRetiredDiagnosticSessions();
          if (this.retiredDiagnosticSessions.size >= 128) {
            this.retiredDiagnosticSessions.delete(this.retiredDiagnosticSessions.keys().next().value!);
            this.dependencies.terminalDiagnostics.record("dropped", 1);
          }
          this.retiredDiagnosticSessions.set(sessionId, this.diagnosticNow());
        }
        this.recentOutput.delete(sessionId);
        this.discardingOutputLine.delete(sessionId);
        this.post({ type: "sessionRemoved", sessionId });
      }
    }
    for (const session of nextSessions) {
      const prior = previous.get(session.id);
      if (prior === undefined) {
        this.post({ type: "sessionAdded", session });
      } else if (!sameSession(prior, session)) {
        this.post({ type: "sessionUpdated", session });
      }
    }
    this.sessions = next;
    const previousUuids=[...previous.values()].map(session=>session.claudeSessionId).sort();
    const nextUuids=nextSessions.map(session=>session.claudeSessionId).sort();
    if(JSON.stringify(previousUuids)!==JSON.stringify(nextUuids))this.invalidateRecovery();
    this.updateWaitingBadge();
    const activeSessionId = this.dependencies.sessions.activeSessionId;
    if (activeSessionId !== this.activeSessionId) {
      this.activeSessionId = activeSessionId;
      this.post({ type: "activeSessionChanged", activeSessionId });
    }
    this.updateResumableSessions();
    if ([...previous.keys()].some((id) => !next.has(id))) {
      this.scheduleEligibilityRetry();
    }
  }

  /** Recomputes the resume list whenever either source changes, excluding all live UUIDs. */
  private updateResumableSessions(): void {
    const generation = ++this.eligibilityGeneration;
    const liveIds = new Set([...this.sessions.values()]
      .map((session) => session.claudeSessionId).filter((id) => id !== null));
    const next = this.dependencies.resumableSessions.sessions.filter(
      (session) => !liveIds.has(session.claudeSessionId)
    );
    const check = this.dependencies.checkConversationEligibility;
    if (check === undefined) {
      this.publishResumableSessions(next);
      return;
    }
    // Newly discovered candidates stay hidden until checked. Already checked rows remain
    // stable during refresh, while forgotten and live records disappear immediately.
    const retained = new Set(this.resumableSessions.map((session) => session.claudeSessionId));
    this.publishResumableSessions(next.filter((session) => retained.has(session.claudeSessionId)));
    if (this.view === undefined) {
      return;
    }
    if (this.checkingEligibility) {
      this.eligibilityRefreshPending = true;
      return;
    }
    this.checkingEligibility = true;
    void this.checkResumableSessions(next, generation, check).finally(() => {
      this.checkingEligibility = false;
      if (this.eligibilityRefreshPending) {
        this.eligibilityRefreshPending = false;
        this.updateResumableSessions();
      }
    });
  }

  /** Checks one candidate at a time and ignores superseded snapshots after every await. */
  private async checkResumableSessions(
    candidates: readonly ResumableSessionSnapshot[],
    generation: number,
    check: NonNullable<SessionPanelProviderDependencies["checkConversationEligibility"]>
  ): Promise<void> {
    const eligible: ResumableSessionSnapshot[] = [];
    for (const session of candidates) {
      let result: "present" | "absent" | "unknown";
      try {
        result = await check(session.claudeSessionId);
      } catch {
        // Do not log thrown filesystem/parser errors: they could contain transcript text.
        result = "unknown";
      }
      if (generation !== this.eligibilityGeneration) {
        return;
      }
      if (result !== "absent") {
        eligible.push(session);
      }
    }
    if (generation === this.eligibilityGeneration) {
      this.publishResumableSessions(eligible);
    }
  }

  /** Retries once after close or view resolution to accommodate delayed CLI transcript flushes. */
  private scheduleEligibilityRetry(): void {
    clearTimeout(this.eligibilityRetry);
    if (this.dependencies.checkConversationEligibility !== undefined) {
      this.eligibilityRetry = setTimeout(() => this.updateResumableSessions(), 1000);
      this.eligibilityRetry.unref();
    }
  }

  /** Publishes changed eligible metadata only, leaving the persistence store untouched. */
  private publishResumableSessions(next: readonly ResumableSessionSnapshot[]): void {
    if (next.length === this.resumableSessions.length && next.every((session, index) => {
      const previous = this.resumableSessions[index]!;
      return session.claudeSessionId === previous.claudeSessionId &&
        session.displayName === previous.displayName && session.rootId === previous.rootId &&
        session.rootLabel === previous.rootLabel && session.rootPath === previous.rootPath &&
        session.createdAt === previous.createdAt && session.lastLaunchedAt === previous.lastLaunchedAt;
    })) {
      return;
    }
    this.resumableSessions = next;
    this.post({ type: "resumableSessionsChanged", sessions: next });
    this.invalidateRecovery();
  }

  /** Replaces locally retained snapshots without emitting pre-resolution updates. */
  private replaceSessionSnapshot(sessions: readonly ManagedSessionSnapshot[]): void {
    this.sessions = new Map(sessions.map((session) => [session.id, session]));
  }

  /** Mirrors the number of live waiting sessions in VS Code's native panel badge. */
  private updateWaitingBadge(): void {
    if (this.view === undefined) {
      return;
    }
    const waitingCount = [...this.sessions.values()].filter(
      (session) => session.state === "running" && session.activity === "waiting"
    ).length;
    this.view.badge = waitingCount === 0 ? undefined : {
      value: waitingCount,
      tooltip: waitingCount === 1
        ? "1 session waiting for input"
        : `${waitingCount} sessions waiting for input`
    };
  }

  /** The current renderer document is the only recipient of composer actions. */
  get composerDocumentId(): string | undefined { return this.ready?this.diagnosticDocumentId:undefined; }

  postComposer(message:ComposerHostMessage): void {
    if(this.composerDocumentId===undefined || ("documentId" in message && message.documentId!==this.composerDocumentId))return;
    this.post(message);
  }

  private invalidateRecovery():void {
    this.recoveryRevision+=1;this.recoveryStoreRevision=undefined;this.recoveryCursors.clear();
    const documentId=this.composerDocumentId;
    if(documentId!==undefined && this.dependencies.composer!==undefined)
      this.postComposer({type:"composerRecoveryInvalidated",documentId,revision:this.recoveryRevision});
  }

  private async handleComposerMessage(message:ComposerWebviewMessage):Promise<void> {
    const composer=this.dependencies.composer;
    if(composer===undefined || this.composerDocumentId===undefined || ("documentId" in message && message.documentId!==this.composerDocumentId))return;
    if(message.type==="composerRequestRecovery"){
      const cursor=message.cursor;
      if(cursor!==undefined && (cursor.revision!==this.recoveryRevision || !this.recoveryCursors.has(cursor.afterUuid) || this.recoveryStoreRevision===undefined)){
        this.invalidateRecovery();return;
      }
      let page;
      try{page=composer.store.recoveryPage(cursor===undefined?undefined:{...cursor,revision:this.recoveryStoreRevision!});}
      catch{this.invalidateRecovery();return;}
      if(cursor===undefined){this.recoveryCursors.clear();this.recoveryStoreRevision=page.revision;}
      const live=new Set([...this.sessions.values()].map(session=>session.claudeSessionId));
      const eligible=new Set(this.resumableSessions.map(session=>session.claudeSessionId));
      const rows=page.rows.filter(row=>!live.has(row.claudeSessionId));
      const nextCursor:RecoveryCursor|undefined=page.nextCursor===undefined?undefined:{...page.nextCursor,revision:this.recoveryRevision};
      if(nextCursor!==undefined)this.recoveryCursors.add(nextCursor.afterUuid);
      this.postComposer({type:"composerRecoveryPage",documentId:message.documentId,requestId:message.requestId,
        page:{revision:this.recoveryRevision,rows,...(nextCursor===undefined?{}:{nextCursor})},actions:rows.map(row=>eligible.has(row.claudeSessionId)?"resume":"restoreDraft")});
      return;
    }
    if(message.type==="composerRestoreDraft"){
      const source=composer.store.getRecoverable(message.claudeSessionId);
      if(source===undefined || source.draft.revision!==message.expectedRevision || [...this.sessions.values()].some(session=>session.claudeSessionId===message.claudeSessionId))return;
    }
    await composer.handle(message);
  }

  /** Posts a typed host message only while a view remains resolved. */
  private post(message: HostMessage): void {
    if (this.ready) {
      const capture = this.dependencies.terminalDiagnostics;
      if (capture?.captureId !== undefined) {
        if (this.diagnosticDeliveries?.captureId !== capture.captureId || this.diagnosticDeliveries.documentId !== this.diagnosticDocumentId) {
          this.retireDiagnosticDeliveries();
          this.diagnosticDeliveries = { active: true, pending: 0, captureId: capture.captureId,
            documentId: this.diagnosticDocumentId, capture };
        }
        const state = this.diagnosticDeliveries;
        if (state.pending < 128) {
          state.pending += 1;
          capture.record("pendingMessages", state.pending);
          const completed = completeDiagnosticDelivery.bind(undefined, new WeakRef(state));
          try { void Promise.resolve(this.view?.webview.postMessage(message)).then(completed, completed); }
          catch (error) { completed(); throw error; }
          return;
        }
        capture.record("dropped", 1);
      }
      void this.view?.webview.postMessage(message);
    }
  }

  /** Writes rejected protocol and action failures to the supplied host logger. */
  private log(reason: PanelFailureReason): void {
    this.dependencies.log?.(reason);
  }
}

/** Compares complete snapshot values so session state changes reach the webview. */
function sameSession(left: ManagedSessionSnapshot, right: ManagedSessionSnapshot): boolean {
  return left.id === right.id &&
    left.claudeSessionId === right.claudeSessionId &&
    left.rootId === right.rootId &&
    left.displayName === right.displayName &&
    left.ordinalWithinRoot === right.ordinalWithinRoot &&
    left.state === right.state &&
    left.activity === right.activity &&
    left.hasUnreadResponse === right.hasUnreadResponse &&
    left.launchedRootLabel === right.launchedRootLabel &&
    left.launchedRootPath === right.launchedRootPath &&
    left.launchedAt === right.launchedAt &&
    left.launchedImportIds.length === right.launchedImportIds.length &&
    left.launchedImportIds.every((rootId, index) => rootId === right.launchedImportIds[index]) &&
    left.launchedAddDirPaths.length === right.launchedAddDirPaths.length &&
    left.launchedAddDirPaths.every((path, index) => path === right.launchedAddDirPaths[index]);
}

/** Accepts only canonical absolute HTTP(S) URLs from the untrusted webview boundary. */
function parseExternalWebUri(candidate: string): vscode.Uri | undefined {
  if (candidate.trim() !== candidate) {
    return undefined;
  }
  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.hostname.length === 0 ||
      !/^https?:\/\//iu.test(candidate)
    ) {
      return undefined;
    }
    return vscode.Uri.parse(parsed.href, true);
  } catch {
    return undefined;
  }
}

/** Bounds UTF-8 replay data by discarding complete leading lines instead of partial terminal data. */
function boundReplayableOutput(output: string): {
  readonly output: string;
  readonly discardedUnterminatedLine: boolean;
} {
  const encoded = Buffer.from(output, "utf8");
  if (encoded.byteLength <= RECENT_OUTPUT_LIMIT) {
    return { output, discardedUnterminatedLine: false };
  }
  const excessBytes = encoded.byteLength - RECENT_OUTPUT_LIMIT;
  const newlineIndex = encoded.indexOf(0x0a, excessBytes);
  return newlineIndex < 0
    ? { output: "", discardedUnterminatedLine: true }
    : {
        output: encoded.subarray(newlineIndex + 1).toString("utf8"),
        discardedUnterminatedLine: false
      };
}

export { SESSION_VIEW_ID };
