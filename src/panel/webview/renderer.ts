import type { HostMessage, WebviewMessage } from "../protocol";
import type { ManagedSessionSnapshot, SessionId } from "../../sessions/sessionTypes";

/** Resolved xterm colors, not unresolved CSS custom-property expressions. */
export interface RendererTheme {
  readonly background: string;
  readonly foreground: string;
  readonly selectionBackground: string;
}

/** The process-free terminal surface used by the renderer. */
export interface RendererTerminal {
  open(parent: HTMLElement): void;
  write(data: string): void;
  dispose(): void;
  focus(): void;
  onData(listener: (data: string) => void): void;
  onResize(listener: (size: { readonly cols: number; readonly rows: number }) => void): void;
  updateTheme(theme: RendererTheme): void;
  fit?(): void;
  hasSelection?(): boolean;
  getSelection?(): string;
  attachCustomKeyEventHandler?(handler: (event: KeyboardEvent) => boolean): void;
}

/** Creates one terminal instance for each live Claude session. */
export interface RendererTerminalFactory {
  create(theme: RendererTheme, fontFamily: string): RendererTerminal;
}

/** The browser globals the renderer uses, exposed explicitly for DOM harnesses. */
export interface RendererWindow {
  readonly HTMLElement: typeof HTMLElement;
  readonly MutationObserver: typeof MutationObserver;
  readonly ResizeObserver?: typeof ResizeObserver;
  readonly navigator: Navigator;
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

/** Browser dependencies isolated for DOM tests without an xterm or process implementation. */
export interface SessionRendererDependencies {
  readonly document: Document;
  readonly window: RendererWindow;
  readonly postMessage: (message: WebviewMessage) => void;
  readonly terminalFactory: RendererTerminalFactory;
  readonly fitTerminal: (terminal: RendererTerminal) => void;
}

interface TerminalCell {
  readonly terminal: RendererTerminal;
  readonly element: HTMLDivElement;
  opened: boolean;
}

/** The typed host-message controller returned by the session renderer. */
export interface SessionRenderer {
  handleMessage(message: HostMessage): void;
  dispose(): void;
}

/** Creates the constrained Claude session renderer. */
export function createSessionRenderer(dependencies: SessionRendererDependencies): SessionRenderer {
  const app = requiredDocumentElement<HTMLElement>(dependencies.document, "#app");
  const sessions = new Map<SessionId, ManagedSessionSnapshot>();
  const terminals = new Map<SessionId, TerminalCell>();
  let activeSessionId: SessionId | undefined;
  let disposed = false;

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

  const tabs = requiredElement<HTMLDivElement>(app, ".session-tabs");
  const terminalStage = requiredElement<HTMLElement>(app, ".terminal-stage");
  const emptyState = requiredElement<HTMLElement>(app, ".terminal-empty");

  const render = (): void => {
    tabs.replaceChildren(...[...sessions.values()].map(createTab));
    for (const cell of terminals.values()) {
      cell.element.remove();
    }
    const activeCell = activeSessionId === undefined ? undefined : terminals.get(activeSessionId);
    if (activeCell === undefined) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;
    if (!activeCell.opened) {
      activeCell.terminal.open(activeCell.element);
      activeCell.opened = true;
    }
    terminalStage.append(activeCell.element);
    dependencies.fitTerminal(activeCell.terminal);
    activeCell.terminal.focus();
  };

  const ensureTerminal = (sessionId: SessionId): TerminalCell => {
    const existing = terminals.get(sessionId);
    if (existing !== undefined) {
      return existing;
    }
    const terminal = dependencies.terminalFactory.create(
      resolveTheme(dependencies.document),
      resolveFontFamily(dependencies.document)
    );
    const element = dependencies.document.createElement("div");
    element.className = "terminal-instance";
    element.dataset.sessionId = sessionId;
    element.tabIndex = 0;
    terminal.onData((data) => dependencies.postMessage({ type: "input", sessionId, data }));
    terminal.onResize(({ cols, rows }) => {
      dependencies.postMessage({ type: "resize", sessionId, columns: cols, rows });
    });
    terminal.attachCustomKeyEventHandler?.((event) => copySelection(terminal, event, dependencies.window));
    const cell = { terminal, element, opened: false };
    terminals.set(sessionId, cell);
    return cell;
  };

  const removeSession = (sessionId: SessionId): void => {
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
  };

  const replaceSessions = (nextSessions: readonly ManagedSessionSnapshot[]): void => {
    const nextIds = new Set(nextSessions.map(({ id }) => id));
    for (const sessionId of [...sessions.keys()]) {
      if (!nextIds.has(sessionId)) {
        removeSession(sessionId);
      }
    }
    sessions.clear();
    for (const session of nextSessions) {
      sessions.set(session.id, session);
      ensureTerminal(session.id);
    }
  };

  const updateTheme = (): void => {
    const theme = resolveTheme(dependencies.document);
    for (const { terminal } of terminals.values()) {
      terminal.updateTheme(theme);
    }
  };

  const themeObserver = new dependencies.window.MutationObserver(updateTheme);
  themeObserver.observe(dependencies.document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });
  if (dependencies.document.body !== null) {
    themeObserver.observe(dependencies.document.body, { attributes: true, attributeFilter: ["class", "style"] });
  }

  const fitActiveTerminal = (): void => {
    if (activeSessionId === undefined) {
      return;
    }
    const activeCell = terminals.get(activeSessionId);
    if (activeCell !== undefined && terminalStage.contains(activeCell.element)) {
      dependencies.fitTerminal(activeCell.terminal);
    }
  };
  const onWindowResize = (): void => fitActiveTerminal();
  dependencies.window.addEventListener("resize", onWindowResize);
  const ResizeObserverConstructor = dependencies.window.ResizeObserver;
  const resizeObserver = ResizeObserverConstructor === undefined
    ? undefined
    : new ResizeObserverConstructor(fitActiveTerminal);
  resizeObserver?.observe(terminalStage);

  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof dependencies.window.HTMLElement)) {
      return;
    }
    const sessionId = target.dataset.sessionId;
    if (sessionId !== undefined) {
      dependencies.postMessage({ type: "selectSession", sessionId });
      return;
    }
    postAction(target.dataset.action, activeSessionId, dependencies.postMessage);
  });

  const onPaste = (event: ClipboardEvent): void => {
    if (activeSessionId === undefined || !terminalStage.contains(dependencies.document.activeElement)) {
      return;
    }
    const text = event.clipboardData?.getData("text");
    if (text !== undefined) {
      event.preventDefault();
      dependencies.postMessage({ type: "input", sessionId: activeSessionId, data: text });
    }
  };
  dependencies.document.addEventListener("paste", onPaste);
  dependencies.postMessage({ type: "ready" });

  return {
    handleMessage(message): void {
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
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      dependencies.window.removeEventListener("resize", onWindowResize);
      dependencies.document.removeEventListener("paste", onPaste);
      themeObserver.disconnect();
      resizeObserver?.disconnect();
      for (const sessionId of [...terminals.keys()]) {
        removeSession(sessionId);
      }
    }
  };

  function createTab(session: ManagedSessionSnapshot): HTMLButtonElement {
    const tab = dependencies.document.createElement("button");
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
}

/** Resolves VS Code CSS variables before xterm parses terminal colors. */
export function resolveTheme(document: Document): RendererTheme {
  const styles = document.defaultView?.getComputedStyle(document.documentElement);
  return {
    background: styles?.getPropertyValue("--vscode-terminal-background").trim() || "#000000",
    foreground: styles?.getPropertyValue("--vscode-terminal-foreground").trim() || "#ffffff",
    selectionBackground:
      styles?.getPropertyValue("--vscode-terminal-selectionBackground").trim() ||
      styles?.getPropertyValue("--vscode-editor-selectionBackground").trim() ||
      "rgba(128, 128, 128, 0.45)"
  };
}

/** Resolves the editor font token before xterm uses it in canvas font metrics. */
export function resolveFontFamily(document: Document): string {
  const styles = document.defaultView?.getComputedStyle(document.documentElement);
  const fontFamily = styles?.getPropertyValue("--vscode-editor-font-family").trim();
  if (!fontFamily) {
    return "monospace";
  }
  return /(?:^|,)\s*monospace\s*(?:,|$)/i.test(fontFamily)
    ? fontFamily
    : `${fontFamily}, monospace`;
}

/** Sends only one of the approved action messages. */
function postAction(
  action: string | undefined,
  activeSessionId: SessionId | undefined,
  postMessage: (message: WebviewMessage) => void
): void {
  switch (action) {
    case "newSession":
    case "newInFolder":
    case "previousSession":
    case "nextSession":
    case "configureWorkspace":
      postMessage({ type: action });
      return;
    case "closeSession":
    case "restartFresh":
      if (activeSessionId !== undefined) {
        postMessage({ type: action, sessionId: activeSessionId });
      }
  }
}

/** Copies terminal selection without adding a general-terminal control surface. */
function copySelection(terminal: RendererTerminal, event: KeyboardEvent, window: RendererWindow): boolean {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && terminal.hasSelection?.()) {
    void window.navigator.clipboard?.writeText(terminal.getSelection?.() ?? "");
    return false;
  }
  return true;
}

/** Returns a required descendant element. */
function requiredElement<T extends Element>(parent: ParentNode, selector: string): T {
  const element = parent.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Claude session panel element is missing: ${selector}`);
  }
  return element;
}

/** Returns a required document element before renderer initialization. */
function requiredDocumentElement<T extends Element>(document: Document, selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) {
    throw new Error(`Claude session panel root is missing: ${selector}`);
  }
  return element;
}
