import type { HostMessage, TerminalFontMetrics, WebviewMessage } from "../protocol";
import type { ManagedSessionSnapshot, SessionId } from "../../sessions/sessionTypes";
import type { ResumableSessionSnapshot } from "../../sessions/resumableSessionStore";

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
  paste(data: string): void;
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
  create(
    theme: RendererTheme,
    terminalFont: TerminalFontMetrics,
    openLink: (event: MouseEvent, uri: string) => void
  ): RendererTerminal;
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
  readonly loadState?: () => unknown;
  readonly saveState?: (state: { readonly sessionDetailsExpanded: boolean }) => void;
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
  const restoredDetailsState = readSessionDetailsExpanded(dependencies.loadState?.());
  const sessionDetailsInitiallyExpanded = restoredDetailsState ??
    app.dataset.sessionDetailsInitiallyExpanded !== "false";
  const sessions = new Map<SessionId, ManagedSessionSnapshot>();
  const terminals = new Map<SessionId, TerminalCell>();
  let activeSessionId: SessionId | undefined;
  let terminalFont: TerminalFontMetrics | undefined;
  let disposed = false;

  app.innerHTML = `
    <header class="session-rail">
      <div class="session-tabs" role="tablist" aria-label="Claude sessions"></div>
    </header>
    <div class="session-context-menu" role="menu" data-session-context-menu hidden>
      <button type="button" role="menuitem" data-context-action="renameSession">
        Rename Session…
      </button>
      <button type="button" role="menuitem" data-context-action="forgetSession" hidden>
        Forget Session
      </button>
    </div>
    <details class="session-details"${sessionDetailsInitiallyExpanded ? " open" : ""} hidden>
      <summary>Added directories (0)</summary>
      <div class="session-details-content">
        <p class="session-details-empty">No added directories.</p>
        <ul class="session-details-list" aria-label="Directories added to this session"></ul>
      </div>
    </details>
    <div class="session-workspace">
      <section class="terminal-stage" aria-label="Active Claude session">
        <div class="terminal-empty" role="status">Start a Claude session to use this workspace.</div>
      </section>
      <aside class="session-sidebar" aria-label="Session actions">
        <button class="session-sidebar-toggle" type="button" data-sidebar-toggle
          aria-controls="session-actions" aria-expanded="true" aria-label="Collapse session actions"
          title="Collapse session actions">
          <span class="session-action-icon" aria-hidden="true">›</span>
          <span class="session-action-label">Collapse</span>
        </button>
        <div id="session-actions" class="session-actions">
          ${createActionButton("newSession", "＋", "New Session")}
          ${createActionButton("newInFolder", "▣", "New in Folder…")}
          ${createActionButton("closeSession", "×", "Close Session")}
          ${createActionButton("restartFresh", "↻", "Restart Fresh")}
          ${createActionButton("previousSession", "↑", "Previous Session")}
          ${createActionButton("nextSession", "↓", "Next Session")}
          ${createActionButton("configureWorkspace", "⚙", "Configure Workspace…")}
          <section class="resume-sessions" aria-labelledby="resume-sessions-heading">
            <h2 id="resume-sessions-heading">Resume sessions</h2>
            <p class="resume-sessions-empty">Start a session to build your resume list.</p>
            <ul class="resume-sessions-list"></ul>
          </section>
        </div>
      </aside>
    </div>`;

  const tabs = requiredElement<HTMLDivElement>(app, ".session-tabs");
  const terminalStage = requiredElement<HTMLElement>(app, ".terminal-stage");
  const emptyState = requiredElement<HTMLElement>(app, ".terminal-empty");
  const sidebar = requiredElement<HTMLElement>(app, ".session-sidebar");
  const sidebarToggle = requiredElement<HTMLButtonElement>(app, "[data-sidebar-toggle]");
  const sidebarToggleIcon = requiredElement<HTMLElement>(sidebarToggle, ".session-action-icon");
  const resumeList = requiredElement<HTMLUListElement>(app, ".resume-sessions-list");
  const resumeEmpty = requiredElement<HTMLElement>(app, ".resume-sessions-empty");
  const sessionContextMenu = requiredElement<HTMLElement>(app, "[data-session-context-menu]");
  const sessionDetails = requiredElement<HTMLDetailsElement>(app, ".session-details");
  const sessionDetailsSummary = requiredElement<HTMLElement>(sessionDetails, "summary");
  const sessionDetailsEmpty = requiredElement<HTMLElement>(
    sessionDetails,
    ".session-details-empty"
  );
  const sessionDetailsList = requiredElement<HTMLUListElement>(
    sessionDetails,
    ".session-details-list"
  );
  const renameSessionItem = requiredElement<HTMLButtonElement>(
    sessionContextMenu,
    "[data-context-action=renameSession]"
  );
  const forgetSessionItem = requiredElement<HTMLButtonElement>(
    sessionContextMenu,
    "[data-context-action=forgetSession]"
  );
  let contextSessionId: SessionId | undefined;
  let contextClaudeSessionId: string | undefined;

  const findSessionTab = (sessionId: SessionId): HTMLButtonElement | undefined =>
    [...tabs.querySelectorAll<HTMLButtonElement>(".session-tab[data-session-id]")]
      .find((tab) => tab.dataset.sessionId === sessionId);
  const findResumeButton = (claudeSessionId: string): HTMLButtonElement | undefined =>
    [...resumeList.querySelectorAll<HTMLButtonElement>("button[data-resume-session-id]")]
      .find((button) => button.dataset.resumeSessionId === claudeSessionId);

  const closeSessionContextMenu = (restoreFocus: boolean): void => {
    const sessionId = contextSessionId;
    const claudeSessionId = contextClaudeSessionId;
    contextSessionId = undefined;
    contextClaudeSessionId = undefined;
    sessionContextMenu.hidden = true;
    const tab = sessionId === undefined ? undefined : findSessionTab(sessionId);
    const resumeButton = claudeSessionId === undefined ? undefined : findResumeButton(claudeSessionId);
    tab?.setAttribute("aria-expanded", "false");
    resumeButton?.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      (tab ?? resumeButton)?.focus();
    }
  };

  const openSessionContextMenu = (
    sessionId: SessionId,
    position: { readonly left: number; readonly top: number }
  ): void => {
    closeSessionContextMenu(false);
    contextSessionId = sessionId;
    renameSessionItem.hidden = false;
    forgetSessionItem.hidden = true;
    sessionContextMenu.hidden = false;
    const viewport = dependencies.document.documentElement;
    const maxLeft = Math.max(0, viewport.clientWidth - sessionContextMenu.offsetWidth);
    const maxTop = Math.max(0, viewport.clientHeight - sessionContextMenu.offsetHeight);
    sessionContextMenu.style.left = `${Math.max(0, Math.min(position.left, maxLeft))}px`;
    sessionContextMenu.style.top = `${Math.max(0, Math.min(position.top, maxTop))}px`;
    findSessionTab(sessionId)?.setAttribute("aria-expanded", "true");
    renameSessionItem.focus();
  };

  const openResumeContextMenu = (
    claudeSessionId: string,
    button: HTMLButtonElement,
    position: { readonly left: number; readonly top: number }
  ): void => {
    closeSessionContextMenu(false);
    contextClaudeSessionId = claudeSessionId;
    renameSessionItem.hidden = true;
    forgetSessionItem.hidden = false;
    sessionContextMenu.hidden = false;
    const viewport = dependencies.document.documentElement;
    sessionContextMenu.style.left = `${Math.max(0, Math.min(position.left,
      Math.max(0, viewport.clientWidth - sessionContextMenu.offsetWidth)))}px`;
    sessionContextMenu.style.top = `${Math.max(0, Math.min(position.top,
      Math.max(0, viewport.clientHeight - sessionContextMenu.offsetHeight)))}px`;
    button.setAttribute("aria-expanded", "true");
    forgetSessionItem.focus();
  };

  const render = (): void => {
    tabs.replaceChildren(...[...sessions.values()].map(createTab));
    renderSessionDetails();
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
    if (contextSessionId !== undefined && sessions.has(contextSessionId)) {
      renameSessionItem.focus();
    } else if (contextClaudeSessionId !== undefined && findResumeButton(contextClaudeSessionId) !== undefined) {
      forgetSessionItem.focus();
    } else {
      activeCell.terminal.focus();
    }
  };

  const ensureTerminal = (sessionId: SessionId): TerminalCell => {
    const existing = terminals.get(sessionId);
    if (existing !== undefined) {
      return existing;
    }
    if (terminalFont === undefined) {
      throw new Error("Claude session panel received a session before terminal font metrics.");
    }
    const element = dependencies.document.createElement("div");
    element.className = "terminal-instance";
    element.dataset.sessionId = sessionId;
    element.tabIndex = 0;
    const terminal = dependencies.terminalFactory.create(
      resolveTheme(dependencies.document),
      terminalFont,
      (event, uri) => {
        if (
          hasLinkModifier(event, dependencies.window.navigator.platform) &&
          activeSessionId === sessionId &&
          terminalStage.contains(element)
        ) {
          dependencies.postMessage({ type: "openExternal", sessionId, uri });
        }
      }
    );
    terminal.onData((data) => dependencies.postMessage({ type: "input", sessionId, data }));
    terminal.onResize(({ cols, rows }) => {
      dependencies.postMessage({ type: "resize", sessionId, columns: cols, rows });
    });
    terminal.attachCustomKeyEventHandler?.((event) => {
      if (
        event.type === "keydown" &&
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        event.key.toLowerCase() === "v" &&
        activeSessionId === sessionId &&
        terminalStage.contains(element) &&
        element.contains(dependencies.document.activeElement)
      ) {
        event.preventDefault();
        event.stopPropagation();
        dependencies.postMessage({ type: "requestPaste", sessionId });
        return false;
      }
      return copySelection(terminal, event, dependencies.window);
    });
    const cell = { terminal, element, opened: false };
    terminals.set(sessionId, cell);
    return cell;
  };

  const removeSession = (sessionId: SessionId): void => {
    if (contextSessionId === sessionId) {
      closeSessionContextMenu(false);
    }
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
  sessionDetails.addEventListener("toggle", () => {
    dependencies.saveState?.({ sessionDetailsExpanded: sessionDetails.open });
    fitActiveTerminal();
  });
  const onWindowResize = (): void => fitActiveTerminal();
  dependencies.window.addEventListener("resize", onWindowResize);
  const ResizeObserverConstructor = dependencies.window.ResizeObserver;
  const resizeObserver = ResizeObserverConstructor === undefined
    ? undefined
    : new ResizeObserverConstructor(fitActiveTerminal);
  resizeObserver?.observe(terminalStage);

  const setSidebarCollapsed = (collapsed: boolean): void => {
    sidebar.classList.toggle("is-collapsed", collapsed);
    const action = collapsed ? "Expand" : "Collapse";
    const accessibleLabel = `${action} session actions`;
    sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
    sidebarToggle.setAttribute("aria-label", accessibleLabel);
    sidebarToggle.title = accessibleLabel;
    sidebarToggleIcon.textContent = collapsed ? "‹" : "›";
  };

  app.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof dependencies.window.HTMLElement)) {
      return;
    }
    if (target.closest("[data-context-action=renameSession]") !== null) {
      const sessionId = contextSessionId;
      closeSessionContextMenu(true);
      if (sessionId !== undefined) {
        dependencies.postMessage({ type: "requestRenameSession", sessionId });
      }
      return;
    }
    if (target.closest("[data-context-action=forgetSession]") !== null) {
      const claudeSessionId = contextClaudeSessionId;
      closeSessionContextMenu(true);
      if (claudeSessionId !== undefined) {
        dependencies.postMessage({ type: "forgetSession", claudeSessionId });
      }
      return;
    }
    if (!sessionContextMenu.hidden) {
      closeSessionContextMenu(false);
    }
    if (target.closest("[data-sidebar-toggle]") !== null) {
      setSidebarCollapsed(!sidebar.classList.contains("is-collapsed"));
      return;
    }
    const claudeSessionId = target.closest<HTMLElement>("button[data-resume-session-id]")
      ?.dataset.resumeSessionId;
    if (claudeSessionId !== undefined) {
      dependencies.postMessage({ type: "resumeSession", claudeSessionId });
      return;
    }
    const sessionId = target.closest<HTMLElement>(".session-tab[data-session-id]")?.dataset.sessionId;
    if (sessionId !== undefined) {
      activeSessionId = sessionId;
      render();
      dependencies.postMessage({ type: "selectSession", sessionId });
      return;
    }
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    postAction(action, activeSessionId, dependencies.postMessage);
  });

  app.addEventListener("contextmenu", (event) => {
    const target = event.target;
    if (!(target instanceof dependencies.window.HTMLElement)) {
      return;
    }
    const tab = target.closest<HTMLButtonElement>(".session-tab[data-session-id]");
    const sessionId = tab?.dataset.sessionId;
    const resumeButton = target.closest<HTMLButtonElement>("button[data-resume-session-id]");
    const claudeSessionId = resumeButton?.dataset.resumeSessionId;
    if (resumeButton !== null && claudeSessionId !== undefined) {
      event.preventDefault();
      openResumeContextMenu(claudeSessionId, resumeButton, { left: event.clientX, top: event.clientY });
      return;
    }
    if (tab === null || sessionId === undefined) {
      return;
    }
    event.preventDefault();
    openSessionContextMenu(sessionId, { left: event.clientX, top: event.clientY });
  });

  app.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sessionContextMenu.hidden) {
      event.preventDefault();
      closeSessionContextMenu(true);
      return;
    }
    const target = event.target;
    if (!(target instanceof dependencies.window.HTMLElement)) {
      return;
    }
    const tab = target.closest<HTMLButtonElement>(".session-tab[data-session-id]");
    const sessionId = tab?.dataset.sessionId;
    const resumeButton = target.closest<HTMLButtonElement>("button[data-resume-session-id]");
    const claudeSessionId = resumeButton?.dataset.resumeSessionId;
    const isContextKey = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
    if (resumeButton !== null && claudeSessionId !== undefined && isContextKey) {
      event.preventDefault();
      const bounds = resumeButton.getBoundingClientRect();
      openResumeContextMenu(claudeSessionId, resumeButton, { left: bounds.left, top: bounds.bottom });
      return;
    }
    if (
      tab === null ||
      sessionId === undefined ||
      !isContextKey
    ) {
      return;
    }
    event.preventDefault();
    const bounds = tab.getBoundingClientRect();
    openSessionContextMenu(sessionId, { left: bounds.left, top: bounds.bottom });
  });

  const onPaste = (event: ClipboardEvent): void => {
    if (activeSessionId === undefined || !terminalStage.contains(dependencies.document.activeElement)) {
      return;
    }
    const cell = terminals.get(activeSessionId);
    if (cell === undefined || !terminalStage.contains(cell.element)) {
      return;
    }
    const text = event.clipboardData?.getData("text");
    if (text !== undefined) {
      event.preventDefault();
      cell.terminal.paste(text);
    }
  };
  dependencies.document.addEventListener("paste", onPaste);
  dependencies.postMessage({ type: "ready" });

  return {
    handleMessage(message): void {
      switch (message.type) {
        case "hydrate":
          terminalFont = message.terminalFont;
          renderResumableSessions(message.resumableSessions);
          replaceSessions(message.sessions);
          activeSessionId = message.activeSessionId;
          render();
          return;
        case "resumableSessionsChanged":
          renderResumableSessions(message.sessions);
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
        case "paste": {
          const cell = terminals.get(message.sessionId);
          if (
            message.sessionId === activeSessionId &&
            cell !== undefined &&
            terminalStage.contains(cell.element)
          ) {
            cell.terminal.paste(message.data);
          }
          return;
        }
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

  /** Renders metadata-only resume controls without touching live terminal state. */
  function renderResumableSessions(nextSessions: readonly ResumableSessionSnapshot[]): void {
    if (contextClaudeSessionId !== undefined &&
        !nextSessions.some((session) => session.claudeSessionId === contextClaudeSessionId)) {
      closeSessionContextMenu(true);
    }
    const previousButtons = [...resumeList.querySelectorAll<HTMLButtonElement>("button")];
    const focusedIndex = previousButtons.findIndex(
      (button) => button === dependencies.document.activeElement
    );
    const focusedId = previousButtons[focusedIndex]?.dataset.resumeSessionId;
    const ordered = [...nextSessions].sort((left, right) =>
      Date.parse(right.lastLaunchedAt) - Date.parse(left.lastLaunchedAt) ||
      left.claudeSessionId.localeCompare(right.claudeSessionId)
    );
    resumeEmpty.hidden = ordered.length > 0;
    resumeList.replaceChildren(...ordered.map((session) => {
      const item = dependencies.document.createElement("li");
      const button = dependencies.document.createElement("button");
      button.type = "button";
      button.className = "resume-session";
      button.dataset.resumeSessionId = session.claudeSessionId;
      button.setAttribute("aria-label", `Resume ${session.displayName} in ${session.rootLabel}`);
      button.title = `${session.displayName}\n${session.rootLabel} · ${session.rootPath}`;
      const name = dependencies.document.createElement("span");
      name.className = "resume-session-name";
      name.textContent = session.displayName;
      const root = dependencies.document.createElement("span");
      root.className = "resume-session-root";
      root.append(`${session.rootLabel} · `);
      const path = dependencies.document.createElement("span");
      path.className = "resume-session-path";
      path.textContent = session.rootPath;
      root.append(path);
      button.append(name, root);
      item.append(button);
      return item;
    }));
    if (focusedIndex >= 0) {
      // Replacing rows disconnects the focused button; preserve its identity or nearby list position.
      const buttons = [...resumeList.querySelectorAll<HTMLButtonElement>("button")];
      const nextFocus = buttons.find((button) => button.dataset.resumeSessionId === focusedId) ??
        buttons[Math.min(focusedIndex, buttons.length - 1)] ??
        requiredElement<HTMLButtonElement>(app, "[data-action=newSession]");
      nextFocus.focus();
    }
  }

  function createTab(session: ManagedSessionSnapshot): HTMLButtonElement {
    const tab = dependencies.document.createElement("button");
    const selected = session.id === activeSessionId;
    tab.type = "button";
    tab.className = "session-tab";
    tab.dataset.sessionId = session.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(selected));
    tab.setAttribute("aria-haspopup", "menu");
    tab.setAttribute("aria-expanded", String(session.id === contextSessionId));
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

  function renderSessionDetails(): void {
    const session = activeSessionId === undefined ? undefined : sessions.get(activeSessionId);
    sessionDetails.hidden = session === undefined;
    if (session === undefined) {
      sessionDetailsList.replaceChildren();
      sessionDetailsSummary.textContent = "Added directories (0)";
      sessionDetailsEmpty.hidden = false;
      return;
    }

    const paths = session.launchedAddDirPaths;
    sessionDetailsSummary.textContent = `Added directories (${paths.length})`;
    sessionDetailsEmpty.hidden = paths.length > 0;
    sessionDetailsList.hidden = paths.length === 0;
    sessionDetailsList.replaceChildren(...paths.map((path) => {
      const item = dependencies.document.createElement("li");
      const value = dependencies.document.createElement("code");
      value.className = "session-details-path";
      value.textContent = path;
      value.title = path;
      item.append(value);
      return item;
    }));
  }
}

/** Accepts only the renderer state field owned by the details disclosure. */
function readSessionDetailsExpanded(value: unknown): boolean | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const expanded = (value as Record<string, unknown>).sessionDetailsExpanded;
  return typeof expanded === "boolean" ? expanded : undefined;
}

/** Creates one vertical action button with a stable accessible name. */
function createActionButton(action: string, icon: string, label: string): string {
  return `<button class="session-action" type="button" data-action="${action}"
    aria-label="${label}" title="${label}">
    <span class="session-action-icon" aria-hidden="true">${icon}</span>
    <span class="session-action-label">${label}</span>
  </button>`;
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
  if (
    event.type === "keydown" &&
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === "c" &&
    terminal.hasSelection?.()
  ) {
    void window.navigator.clipboard?.writeText(terminal.getSelection?.() ?? "");
    return false;
  }
  return true;
}

/** Uses the native terminal link modifier while leaving ordinary clicks available for selection. */
function hasLinkModifier(event: MouseEvent, platform: string): boolean {
  return /^Mac/iu.test(platform) ? event.metaKey : event.ctrlKey;
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
