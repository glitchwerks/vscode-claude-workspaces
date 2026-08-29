import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { decodeHostMessage, type HostMessage, type WebviewMessage } from "../protocol";
import type { ManagedSessionSnapshot, SessionId } from "../../sessions/sessionTypes";

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
}

interface TerminalCell {
  readonly terminal: Terminal;
  readonly fit: FitAddon;
  readonly element: HTMLDivElement;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const app = requiredDocumentElement<HTMLElement>("#app");

const sessions = new Map<SessionId, ManagedSessionSnapshot>();
const terminals = new Map<SessionId, TerminalCell>();
let activeSessionId: SessionId | undefined;

app.innerHTML = `
  <header class="session-rail">
    <div class="session-tabs" role="tablist" aria-label="Claude sessions"></div>
    <div class="session-actions" aria-label="Session actions">
      <button type="button" data-action="newSession">New Session</button>
      <button type="button" data-action="newInFolder">New in Folder…</button>
      <button type="button" data-action="closeSession">Close Session</button>
      <button type="button" data-action="restartFresh">Restart Fresh</button>
      <button type="button" data-action="previousSession">Previous</button>
      <button type="button" data-action="nextSession">Next</button>
      <button type="button" data-action="configureWorkspace">Configure Workspace…</button>
    </div>
  </header>
  <section class="terminal-stage" aria-label="Active Claude session">
    <div class="terminal-empty" role="status">Start a Claude session to use this workspace.</div>
  </section>`;

const tabs = requiredElement<HTMLDivElement>(".session-tabs");
const terminalStage = requiredElement<HTMLElement>(".terminal-stage");
const emptyState = requiredElement<HTMLElement>(".terminal-empty");

app.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }
  const sessionId = target.dataset.sessionId;
  if (sessionId !== undefined) {
    vscode.postMessage({ type: "selectSession", sessionId });
    return;
  }
  const action = target.dataset.action;
  if (action !== undefined) {
    postAction(action);
  }
});

document.addEventListener("paste", (event) => {
  if (activeSessionId === undefined || !terminalStage.contains(document.activeElement)) {
    return;
  }
  const text = event.clipboardData?.getData("text");
  if (text !== undefined) {
    event.preventDefault();
    vscode.postMessage({ type: "input", sessionId: activeSessionId, data: text });
  }
});

window.addEventListener("resize", () => fitActiveTerminal());
new ResizeObserver(() => fitActiveTerminal()).observe(terminalStage);

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const decoded = decodeHostMessage(event.data);
  if (!decoded.ok) {
    return;
  }
  handleHostMessage(decoded.value);
});

vscode.postMessage({ type: "ready" });

/** Processes typed host updates without accepting arbitrary webview-window data. */
function handleHostMessage(message: HostMessage): void {
  switch (message.type) {
    case "hydrate":
      replaceSessions(message.sessions);
      activeSessionId = message.activeSessionId;
      render();
      return;
    case "sessionAdded":
    case "sessionUpdated":
      sessions.set(message.session.id, message.session);
      ensureTerminal(message.session.id);
      render();
      return;
    case "sessionRemoved":
      removeSession(message.sessionId);
      render();
      return;
    case "sessionData":
      terminals.get(message.sessionId)?.terminal.write(message.data);
      return;
    case "activeSessionChanged":
      activeSessionId = message.activeSessionId;
      render();
  }
}

/** Replaces retained live sessions and disposes terminal canvases no longer owned by a session. */
function replaceSessions(nextSessions: readonly ManagedSessionSnapshot[]): void {
  const nextIds = new Set(nextSessions.map(({ id }) => id));
  for (const sessionId of sessions.keys()) {
    if (!nextIds.has(sessionId)) {
      removeSession(sessionId);
    }
  }
  sessions.clear();
  for (const session of nextSessions) {
    sessions.set(session.id, session);
    ensureTerminal(session.id);
  }
}

/** Creates one buffered xterm instance for each session before it is first selected. */
function ensureTerminal(sessionId: SessionId): TerminalCell {
  const existing = terminals.get(sessionId);
  if (existing !== undefined) {
    return existing;
  }
  const terminal = new Terminal({
    convertEol: true,
    cursorBlink: true,
    fontFamily: "var(--vscode-editor-font-family, monospace)",
    fontSize: 13,
    theme: {
      background: "var(--vscode-terminal-background)",
      foreground: "var(--vscode-terminal-foreground)"
    }
  });
  const fit = new FitAddon();
  const element = document.createElement("div");
  element.className = "terminal-instance";
  element.tabIndex = 0;
  terminal.loadAddon(fit);
  terminal.onData((data) => vscode.postMessage({ type: "input", sessionId, data }));
  terminal.onResize(({ cols, rows }) => {
    vscode.postMessage({ type: "resize", sessionId, columns: cols, rows });
  });
  terminal.attachCustomKeyEventHandler((event) => copySelection(terminal, event));
  const cell = { terminal, fit, element };
  terminals.set(sessionId, cell);
  return cell;
}

/** Disposes the terminal that belonged only to a session that has left the live registry. */
function removeSession(sessionId: SessionId): void {
  sessions.delete(sessionId);
  const cell = terminals.get(sessionId);
  if (cell !== undefined) {
    cell.terminal.dispose();
    cell.element.remove();
    terminals.delete(sessionId);
  }
  if (activeSessionId === sessionId) {
    activeSessionId = undefined;
  }
}

/** Renders launch-order tabs and moves only the active terminal canvas into the dominant stage. */
function render(): void {
  const orderedSessions = [...sessions.values()];
  tabs.replaceChildren(...orderedSessions.map(createTab));
  const activeCell = activeSessionId === undefined ? undefined : terminals.get(activeSessionId);
  if (activeCell === undefined) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;
  if (!activeCell.element.hasChildNodes()) {
    activeCell.terminal.open(activeCell.element);
  }
  terminalStage.append(activeCell.element);
  fitActiveTerminal();
  activeCell.terminal.focus();
}

/** Creates a compact tab preserving manager-provided launch order and lifecycle state. */
function createTab(session: ManagedSessionSnapshot): HTMLButtonElement {
  const tab = document.createElement("button");
  const selected = session.id === activeSessionId;
  tab.type = "button";
  tab.className = "session-tab";
  tab.dataset.sessionId = session.id;
  tab.setAttribute("role", "tab");
  tab.setAttribute("aria-selected", String(selected));
  tab.textContent = session.displayName;
  tab.title = `${session.displayName} — ${session.state}`;
  if (selected) {
    tab.classList.add("is-active");
  }
  if (session.state !== "running") {
    tab.classList.add(`is-${session.state}`);
  }
  return tab;
}

/** Fits the active terminal after its canvas is attached to the visible stage. */
function fitActiveTerminal(): void {
  if (activeSessionId === undefined) {
    return;
  }
  const cell = terminals.get(activeSessionId);
  if (cell === undefined || !terminalStage.contains(cell.element)) {
    return;
  }
  cell.fit.fit();
}

/** Sends only one of the product's approved action messages. */
function postAction(action: string): void {
  switch (action) {
    case "newSession":
    case "newInFolder":
    case "previousSession":
    case "nextSession":
    case "configureWorkspace":
      vscode.postMessage({ type: action });
      return;
    case "closeSession":
    case "restartFresh":
      if (activeSessionId !== undefined) {
        vscode.postMessage({ type: action, sessionId: activeSessionId });
      }
  }
}

/** Copies selected output without turning the panel into a general terminal control surface. */
function copySelection(terminal: Terminal, event: KeyboardEvent): boolean {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && terminal.hasSelection()) {
    void navigator.clipboard?.writeText(terminal.getSelection());
    return false;
  }
  return true;
}

/** Returns a required element while keeping DOM initialization errors explicit. */
function requiredElement<T extends Element>(selector: string): T {
  const element = app.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Claude session panel element is missing: ${selector}`);
  }
  return element;
}

/** Returns a required document element before webview application initialization. */
function requiredDocumentElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Claude session panel root is missing: ${selector}`);
  }
  return element;
}
