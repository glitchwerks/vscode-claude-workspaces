import { randomBytes } from "node:crypto";

import * as vscode from "vscode";

import {
  decodeWebviewMessage,
  type HostMessage,
  type WebviewMessage
} from "./protocol";
import type {
  ManagedSessionSnapshot,
  SessionDataEvent,
  SessionId
} from "../sessions/sessionTypes";

const SESSION_VIEW_ID = "claudeWorkspaces.sessions";

/** Read-only session data made available to the session panel. */
export interface SessionPanelSessionSource {
  readonly sessions: readonly ManagedSessionSnapshot[];
  readonly activeSessionId: SessionId | undefined;
  readonly onDidChangeSessions: vscode.Event<readonly ManagedSessionSnapshot[]>;
  readonly onDidReceiveData: vscode.Event<SessionDataEvent>;
}

/** Validated intents the panel may request without process-level access. */
export interface SessionPanelActions {
  input(sessionId: SessionId, data: string): void | PromiseLike<void>;
  resize(sessionId: SessionId, columns: number, rows: number): void | PromiseLike<void>;
  selectSession(sessionId: SessionId): void | PromiseLike<void>;
  newSession(): void | PromiseLike<void>;
  newInFolder(): void | PromiseLike<void>;
  closeSession(sessionId: SessionId): void | PromiseLike<void>;
  restartFresh(sessionId: SessionId): void | PromiseLike<void>;
  previousSession(): void | PromiseLike<void>;
  nextSession(): void | PromiseLike<void>;
  configureWorkspace(): void | PromiseLike<void>;
}

/** Dependencies for rendering and operating the constrained session panel. */
export interface SessionPanelProviderDependencies {
  readonly extensionUri: vscode.Uri;
  readonly sessions: SessionPanelSessionSource;
  readonly actions: SessionPanelActions;
  readonly log?: (message: string) => void;
}

/** Provides the Claude-only webview panel from immutable session state and validated intents. */
export class SessionPanelProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private readonly subscriptions: vscode.Disposable[] = [];
  private view: vscode.WebviewView | undefined;
  private sessions = new Map<SessionId, ManagedSessionSnapshot>();
  private activeSessionId: SessionId | undefined;

  constructor(private readonly dependencies: SessionPanelProviderDependencies) {
    this.replaceSessionSnapshot(dependencies.sessions.sessions);
    this.activeSessionId = dependencies.sessions.activeSessionId;
    this.subscriptions.push(
      dependencies.sessions.onDidChangeSessions((sessions) => this.handleSessionsChanged(sessions)),
      dependencies.sessions.onDidReceiveData((event) => this.post({
        type: "sessionData",
        sessionId: event.sessionId,
        data: event.data
      }))
    );
  }

  /** Configures a resolved view with local resources, nonce CSP, and the closed protocol listener. */
  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.dependencies.extensionUri]
    };
    webviewView.webview.html = this.renderHtml(webviewView.webview);
    this.subscriptions.push(
      webviewView.webview.onDidReceiveMessage((message: unknown) => this.handleWebviewMessage(message)),
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) {
          this.view = undefined;
        }
      })
    );
  }

  /** Releases panel subscriptions without touching the session or PTY lifecycle. */
  dispose(): void {
    this.view = undefined;
    for (const subscription of this.subscriptions.splice(0)) {
      subscription.dispose();
    }
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

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}">
<title>Claude Workspaces</title>
</head>
<body>
<main id="app" aria-label="Claude sessions"></main>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /** Rejects malformed messages and forwards only allow-listed intents to injected host actions. */
  private handleWebviewMessage(message: unknown): void {
    const decoded = decodeWebviewMessage(message);
    if (!decoded.ok) {
      this.log(`Ignored invalid Claude session panel message: ${decoded.error}`);
      return;
    }

    const action = this.actionFor(decoded.value);
    if (action !== undefined) {
      void Promise.resolve().then(action).catch((error: unknown) => {
        this.log(`Claude session panel action failed: ${errorMessage(error)}`);
      });
    }
  }

  /** Maps a validated protocol message to its process-free host action. */
  private actionFor(message: WebviewMessage): (() => void | PromiseLike<void>) | undefined {
    switch (message.type) {
      case "ready":
        return () => this.hydrate();
      case "input":
        return () => this.dependencies.actions.input(message.sessionId, message.data);
      case "resize":
        return () => this.dependencies.actions.resize(message.sessionId, message.columns, message.rows);
      case "selectSession":
        return () => this.dependencies.actions.selectSession(message.sessionId);
      case "newSession":
        return () => this.dependencies.actions.newSession();
      case "newInFolder":
        return () => this.dependencies.actions.newInFolder();
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

  /** Sends the latest immutable session snapshot after the webview declares readiness. */
  private hydrate(): void {
    this.post({
      type: "hydrate",
      sessions: [...this.sessions.values()],
      activeSessionId: this.activeSessionId
    });
  }

  /** Diffs launch-ordered session snapshots into the closed renderer update stream. */
  private handleSessionsChanged(nextSessions: readonly ManagedSessionSnapshot[]): void {
    const previous = this.sessions;
    const next = new Map(nextSessions.map((session) => [session.id, session]));
    for (const sessionId of previous.keys()) {
      if (!next.has(sessionId)) {
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
    const activeSessionId = this.dependencies.sessions.activeSessionId;
    if (activeSessionId !== this.activeSessionId) {
      this.activeSessionId = activeSessionId;
      this.post({ type: "activeSessionChanged", activeSessionId });
    }
  }

  /** Replaces locally retained snapshots without emitting pre-resolution updates. */
  private replaceSessionSnapshot(sessions: readonly ManagedSessionSnapshot[]): void {
    this.sessions = new Map(sessions.map((session) => [session.id, session]));
  }

  /** Posts a typed host message only while a view remains resolved. */
  private post(message: HostMessage): void {
    void this.view?.webview.postMessage(message);
  }

  /** Writes rejected protocol and action failures to the supplied host logger. */
  private log(message: string): void {
    this.dependencies.log?.(message);
  }
}

/** Compares complete snapshot values so session state changes reach the webview. */
function sameSession(left: ManagedSessionSnapshot, right: ManagedSessionSnapshot): boolean {
  return left.id === right.id &&
    left.rootId === right.rootId &&
    left.displayName === right.displayName &&
    left.ordinalWithinRoot === right.ordinalWithinRoot &&
    left.state === right.state &&
    left.launchedAt === right.launchedAt &&
    left.launchedImportIds.length === right.launchedImportIds.length &&
    left.launchedImportIds.every((rootId, index) => rootId === right.launchedImportIds[index]);
}

/** Converts thrown values to safe diagnostic text. */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { SESSION_VIEW_ID };
