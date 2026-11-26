import { CompanionView } from "./companion/view";
import { SavedReplyView } from "./companion/savedReplyView";
import { savedReplySessionIdentity } from "../protocol";
import type { HostMessage, TerminalFontMetrics, WebviewMessage } from "../protocol";
import type { ManagedSessionSnapshot, SessionId } from "../../sessions/sessionTypes";
import type { RecoveryCursor, RecoveryDraftRow } from "../../composer/composerTypes";
import type { ComposerHostMessage } from "../composerProtocol";
import type { ComposerView, ComposerViewOptions } from "./composer/view";
import type { ResumableSessionSnapshot } from "../../sessions/resumableSessionStore";
import { filterResumableSessions } from "./resumeSessions";
import { createWebviewTerminalDiagnostics } from "../../diagnostics/webviewTerminalDiagnostics";

/** Resolved xterm colors, not unresolved CSS custom-property expressions. */
export interface RendererTheme {
  readonly background: string;
  readonly foreground: string;
  readonly selectionBackground: string;
}

/** The process-free terminal surface used by the renderer. */
export interface RendererTerminal {
  open(parent: HTMLElement): void;
  write(data: string, onParsed?: () => void): void;
  paste(data: string): void;
  dispose(): void;
  focus(): void;
  onData(listener: (data: string) => void): void;
  onUserInput?(listener: () => void): void;
  readonly pendingWriteCount?: number;
  readonly rendererKind?: "unopened" | "webgl" | "default" | "disposed";
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
  readonly createComposer?: (options:ComposerViewOptions)=>ComposerView;
  readonly document: Document;
  readonly documentId?: string;
  readonly companionViewId?: string;
  readonly window: RendererWindow;
  readonly postMessage: (message: WebviewMessage) => void;
  readonly now?: () => number;
  readonly monotonicNow?: () => number;
  readonly formatDateTime?: (date: Date) => string;
  readonly setInterval?: (callback: () => void, milliseconds: number) => number;
  readonly clearInterval?: (id: number) => void;
  readonly terminalFactory: RendererTerminalFactory;
  readonly fitTerminal: (terminal: RendererTerminal) => void;
}

interface TerminalCell {
  readonly terminal: RendererTerminal;
  readonly element: HTMLDivElement;
  opened: boolean;
}

type BottomPane = "closed" | "prompt" | "reply";

/** The typed host-message controller returned by the session renderer. */
export interface SessionRenderer {
  handleMessage(message: HostMessage): void;
  dispose(): void;
}

/** Creates the constrained Claude session renderer. */
export function createSessionRenderer(dependencies: SessionRendererDependencies): SessionRenderer {
  const app = requiredDocumentElement<HTMLElement>(dependencies.document, "#app");
  const now = dependencies.now ?? Date.now;
  const formatDateTime = dependencies.formatDateTime ?? ((date: Date) =>
    new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
      timeZoneName: "shortOffset"
    }).format(date));
  const scheduleInterval = dependencies.setInterval ?? ((callback: () => void, milliseconds: number) =>
    globalThis.setInterval(callback, milliseconds) as unknown as number);
  const cancelInterval = dependencies.clearInterval ?? ((id: number) => globalThis.clearInterval(id));
  const sessions = new Map<SessionId, ManagedSessionSnapshot>();
  const terminals = new Map<SessionId, TerminalCell>();
  let activeSessionId: SessionId | undefined;
  let terminalFont: TerminalFontMetrics | undefined;
  let resumableAgeIntervalId: number | undefined;
  let disposed = false;
  let recoveryRevision:number|undefined;
  let recoveryRequestId:string|undefined;
  const recoveryRows=new Map<string,RecoveryDraftRow>();
  let recoveryStaging=new Map<string,RecoveryDraftRow>();
  let eligibleResumeIds=new Set<string>();
  let resumableSessions: readonly ResumableSessionSnapshot[] = [];
  let focusProbeTimer: ReturnType<typeof setTimeout> | undefined;
  const monotonicNow = dependencies.monotonicNow ?? (() => performance.now());
  const diagnostics = createWebviewTerminalDiagnostics({ documentId: dependencies.documentId, now: monotonicNow,
    activeSessionId: () => activeSessionId, postMessage: dependencies.postMessage,
    setInterval: scheduleInterval, clearInterval: cancelInterval,
    observe: () => {
      const terminal = activeSessionId === undefined ? undefined : terminals.get(activeSessionId)?.terminal;
      if (terminal === undefined) { return; }
      diagnostics.record("pendingWrites", terminal.pendingWriteCount ?? 0, activeSessionId);
      diagnostics.record("rendererAvailable", terminal.rendererKind === "webgl" || terminal.rendererKind === "default" ? 1 : 0, activeSessionId);
      diagnostics.record("webglActive", terminal.rendererKind === "webgl" ? 1 : 0, activeSessionId);
    } });
  const fit = (terminal: RendererTerminal): void => {
    const started = diagnostics.active ? monotonicNow() : undefined;
    dependencies.fitTerminal(terminal);
    if (started !== undefined) {
      diagnostics.record("fitCount", 1, activeSessionId);
      diagnostics.record("fitMs", monotonicNow() - started, activeSessionId);
    }
  };

  app.innerHTML = `
    <header class="session-rail">
      <div class="session-header">
        <div class="session-switcher">
          <div class="session-tabs" role="tablist" aria-label="Claude sessions"></div>
          <button type="button" class="session-action" data-session-popup="sessions"
            aria-controls="session-picker" aria-expanded="false" hidden>Sessions<span data-waiting-count aria-hidden="true"></span></button>
        </div>
        <div class="session-header-actions">
          ${createActionButton("newSession", "＋", "New Session")}
          <button type="button" class="session-action" data-session-popup="actions"
            aria-controls="session-actions" aria-expanded="false" aria-label="Actions" title="Actions"><span class="session-action-label">Actions</span></button>
          ${createActionButton("configureWorkspace", "", "Configure")}
        </div>
      </div>
      <section id="session-actions" class="session-popup session-actions" aria-label="Actions" hidden>
        <button type="button" class="session-action" data-session-popup="resume">Resume Session…</button>
        <button type="button" class="session-action" data-session-popup="drafts"
          aria-controls="restore-drafts" hidden>Restore Draft…</button>
        ${createActionButton("newInFolder", "⌂", "New in Folder…")}
        ${createActionButton("requestRenameSession", "", "Rename Session…")}
        ${createActionButton("closeSession", "×", "Close Session")}
        ${createActionButton("restartFresh", "↻", "Restart Fresh")}
        ${createActionButton("previousSession", "↑", "Previous Session")}
        ${createActionButton("nextSession", "↓", "Next Session")}
      </section>
      <section id="session-picker" class="session-popup" aria-label="Sessions" hidden>
        <h2>Live sessions</h2>
        <div class="session-picker-tabs" role="tablist" aria-label="Live sessions"></div>
      </section>
      <section id="restore-drafts" class="session-popup" aria-labelledby="restore-drafts-heading" hidden>
        <header class="session-popup-header">
          <h2 id="restore-drafts-heading">Restore Draft</h2>
          <button type="button" class="session-action" data-session-popup="close" aria-label="Close Restore Draft">×</button>
        </header>
        <ul class="saved-drafts-list"></ul>
      </section>
      <section id="resume-sessions" class="session-popup resume-sessions" aria-labelledby="resume-sessions-heading" hidden>
        <header class="session-popup-header">
          <h2 id="resume-sessions-heading">Resume sessions</h2>
          <button type="button" class="session-action" data-session-popup="actions">Back to Actions</button>
          <button type="button" class="session-action" data-session-popup="close" aria-label="Close Resume sessions">×</button>
        </header>
        <input type="search" data-resume-search aria-label="Search sessions by name or folder" placeholder="Search by name or folder">
        <p class="resume-count" data-resume-count role="status"></p>
        <p class="resume-sessions-empty">No sessions to resume.</p>
        <ul class="resume-sessions-list"></ul>
      </section>
    </header>
    <div class="session-context-menu" role="menu" data-session-context-menu hidden>
      <button type="button" role="menuitem" data-context-action="renameSession">
        Rename Session…
      </button>
      <button type="button" role="menuitem" data-context-action="closeSession">
        Close Session
      </button>
    </div>
    <div class="terminal-header">
      <strong>Raw terminal</strong>
      <button type="button" class="session-action" data-session-popup="details" aria-haspopup="dialog"
        aria-controls="launch-details" aria-expanded="false" hidden>Launch details</button>
      <section id="launch-details" class="session-popup session-details" role="dialog" aria-labelledby="launch-details-heading" hidden>
        <header class="session-popup-header">
          <h2 id="launch-details-heading">Launch details</h2>
          <button type="button" class="session-action" data-session-popup="close" aria-label="Close Launch details">×</button>
        </header>
        <dl class="session-launch-root">
          <dt>Launch root</dt>
          <dd>
            <span class="session-launch-root-label"></span>
            <span class="session-launch-root-hint">Working directory when this session started</span>
            <code class="session-launch-root-path"></code>
          </dd>
        </dl>
        <p class="session-details-empty">No added directories.</p>
        <ul class="session-details-list" aria-label="Directories added to this session"></ul>
      </section>
    </div>
    <div class="session-workspace">
      <div class="session-column">
      <section class="companion-stage" hidden></section>
       <section class="terminal-stage" aria-label="Active Claude session">
        <div class="terminal-empty" role="status">Start a Claude session to use this workspace.</div>
      </section>
      <div class="composer-divider" hidden></div>
      <section class="bottom-pane-slot" id="prompt-bottom-pane" aria-label="Prompt editor" hidden>
        <p class="pane-status" data-prompt-loading role="status" hidden>Loading session draft…</p>
      </section>
      <section class="bottom-pane-slot" id="reply-bottom-pane" aria-label="Reply capture" tabindex="-1" hidden>
        <p class="pane-status" data-reply-unavailable>Reply capture is unavailable for this session.</p>
        <div class="saved-reply-stage" hidden></div>
      </section>
      <footer class="bottom-bar" role="group" aria-label="Bottom pane">
        <button type="button" class="session-action" data-bottom-pane="prompt"
          aria-controls="prompt-bottom-pane" aria-expanded="false" disabled>Prompt editor</button>
        <button type="button" class="session-action" data-bottom-pane="reply"
          aria-controls="reply-bottom-pane" aria-expanded="false" disabled>Reply capture</button>
      </footer>
      </div>
    </div>`;

  const header = requiredElement<HTMLDivElement>(app, ".session-header");
  const switcher = requiredElement<HTMLDivElement>(header, ".session-switcher");
  const tabs = requiredElement<HTMLDivElement>(switcher, ".session-tabs");
  const pickerTabs = requiredElement<HTMLDivElement>(app, ".session-picker-tabs");
  const waitingCount = requiredElement<HTMLElement>(app, "[data-waiting-count]");
  const popupPanels = {
    actions: requiredElement<HTMLElement>(app, "#session-actions"),
    drafts: requiredElement<HTMLElement>(app, "#restore-drafts"),
    sessions: requiredElement<HTMLElement>(app, "#session-picker"),
    resume: requiredElement<HTMLElement>(app, "#resume-sessions"),
    details: requiredElement<HTMLElement>(app, "#launch-details")
  };
  const actionsTrigger = requiredElement<HTMLButtonElement>(app, ".session-header [data-session-popup=actions]");
  const sessionsTrigger = requiredElement<HTMLButtonElement>(app, ".session-switcher [data-session-popup=sessions]");
  const restoreDraftTrigger = requiredElement<HTMLButtonElement>(app, "[data-session-popup=drafts]");
  const detailsTrigger = requiredElement<HTMLButtonElement>(app, "[data-session-popup=details]");
  type SessionPopup = keyof typeof popupPanels;
  let openPopup: SessionPopup | undefined;
  const terminalStage = requiredElement<HTMLElement>(app, ".terminal-stage");
  const layoutHost = requiredElement<HTMLElement>(app, ".session-column");
  const divider = requiredElement<HTMLElement>(app, ".composer-divider");
  const promptSlot = requiredElement<HTMLElement>(app, "#prompt-bottom-pane");
  const replySlot = requiredElement<HTMLElement>(app, "#reply-bottom-pane");
  const replyUnavailable = requiredElement<HTMLElement>(replySlot, "[data-reply-unavailable]");
  const promptLoading = requiredElement<HTMLElement>(promptSlot, "[data-prompt-loading]");
  const promptToggle = requiredElement<HTMLButtonElement>(app, "[data-bottom-pane=prompt]");
  const replyToggle = requiredElement<HTMLButtonElement>(app, "[data-bottom-pane=reply]");
  let bottomPane: BottomPane = "closed";
  let visibleBottomPane: BottomPane = "closed";
  let initializedPane = false;
  let hydratedComposerSession: SessionId | undefined;

  const companionRoot = requiredElement<HTMLElement>(app, ".companion-stage");
  let companionSessionId: string | undefined;
  // Keep the legacy message lifecycle isolated from the Bottom bar output.
  const companion = new CompanionView(companionRoot, {
    viewId: dependencies.companionViewId,
    documentId: dependencies.documentId ?? "",
    postMessage: dependencies.postMessage,
    onModeChange: (_, sessionId) => {
      companionSessionId = sessionId;
    },
    openLink: uri => {
      if (activeSessionId !== undefined && companionSessionId === activeSessionId) {
        dependencies.postMessage({type:"openExternal",sessionId:activeSessionId,uri});
      }
    }
  });

  const savedReply = dependencies.documentId === undefined ? undefined :
    new SavedReplyView(requiredElement<HTMLElement>(replySlot, ".saved-reply-stage"), {
      documentId: dependencies.documentId,
      postMessage: dependencies.postMessage,
      hosted: true,
      openLink: (sessionId, uri) => {
        if (sessionId === activeSessionId) {
          dependencies.postMessage({ type: "openExternal", sessionId, uri });
        }
      },
      focusTerminal: () => {
        setBottomPane("closed", true);
      }
    });

  const emptyState = requiredElement<HTMLElement>(app, ".terminal-empty");
  const composer = dependencies.documentId === undefined ? undefined : dependencies.createComposer?.({
    parent: promptSlot,
    documentId: dependencies.documentId,
    postMessage: dependencies.postMessage,
    openExternal: (target, uri) => dependencies.postMessage({type:"openExternal",sessionId:target.sessionId,uri}),
    focusTerminal: () => {
      companion.setMode("raw");
      if (activeSessionId !== undefined) terminals.get(activeSessionId)?.terminal.focus();
    },
    hosted: {
      layoutHost,
      divider,
      activePane: () => !promptSlot.hidden ? promptSlot : !replySlot.hidden ? replySlot : undefined,
      requestVisibility: (visible, notifyHost = true) => {
        if (visible || bottomPane === "prompt") {
          initializedPane = true;
          setBottomPane(visible ? "prompt" : "closed", true, notifyHost);
        }
      }
    }
  });

  function setBottomPane(next: BottomPane, focus: boolean, notifyHost = focus): void {
    const promptChanged = (bottomPane === "prompt") !== (next === "prompt");
    bottomPane = next;
    presentBottomPane(next, focus, notifyHost && promptChanged);
  }

  function presentBottomPane(next: BottomPane, focus: boolean, notifyHost: boolean): void {
    const changed = next !== visibleBottomPane;
    const promptChanged = (visibleBottomPane === "prompt") !== (next === "prompt");
    visibleBottomPane = next;
    promptSlot.hidden = next !== "prompt";
    replySlot.hidden = next !== "reply";
    divider.hidden = next === "closed";
    promptToggle.setAttribute("aria-expanded", String(next === "prompt"));
    replyToggle.setAttribute("aria-expanded", String(next === "reply"));
    if (changed) savedReply?.setPanelVisible(next === "reply");
    if (composer?.setPanelVisible) {
      composer.setPanelVisible(next === "prompt", { focus: focus && next === "prompt", notifyHost });
    } else if (promptChanged) {
      composer?.setVisible(next === "prompt");
    }
    if (focus && next === "reply") replySlot.focus();
    if (focus && next === "closed") {
      const terminal = activeSessionId === undefined ? undefined : terminals.get(activeSessionId)?.terminal;
      if (terminal) terminal.focus();
      else promptToggle.focus();
    }
    if (changed) fitActiveTerminal();
  }

  function updatePromptReadiness(): void {
    const loading = composer !== undefined && activeSessionId !== undefined && hydratedComposerSession !== activeSessionId;
    promptSlot.toggleAttribute("data-awaiting-composer", loading);
    promptLoading.hidden = !loading;
  }
  const resumeList = requiredElement<HTMLUListElement>(app, ".resume-sessions-list");
  const resumeSearch = requiredElement<HTMLInputElement>(app, "[data-resume-search]");
  const resumeCount = requiredElement<HTMLElement>(app, "[data-resume-count]");
  const draftsList=requiredElement<HTMLUListElement>(app,".saved-drafts-list");
  const resumeEmpty = requiredElement<HTMLElement>(app, ".resume-sessions-empty");
  const sessionContextMenu = requiredElement<HTMLElement>(app, "[data-session-context-menu]");
  const sessionDetails = popupPanels.details;
  const sessionLaunchRootLabel = requiredElement<HTMLElement>(
    sessionDetails,
    ".session-launch-root-label"
  );
  const sessionLaunchRootPath = requiredElement<HTMLElement>(
    sessionDetails,
    ".session-launch-root-path"
  );
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
  const closeSessionItem = requiredElement<HTMLButtonElement>(
    sessionContextMenu,
    "[data-context-action=closeSession]"
  );
  const contextMenuItems = [renameSessionItem, closeSessionItem] as const;
  let contextSessionId: SessionId | undefined;

  const focusContextMenuItem = (item: HTMLButtonElement): void => {
    for (const candidate of contextMenuItems) {
      candidate.tabIndex = candidate === item ? 0 : -1;
    }
    item.focus();
  };

  const availableContextMenuItems = (): readonly HTMLButtonElement[] =>
    contextMenuItems.filter((item) => !item.hidden && !item.disabled);

  const findSessionTab = (sessionId: SessionId): HTMLButtonElement | undefined =>
    [...(openPopup === "sessions" ? pickerTabs : tabs).querySelectorAll<HTMLButtonElement>(".session-tab[data-session-id]")]
      .find((tab) => tab.dataset.sessionId === sessionId);
  const closeSessionContextMenu = (restoreFocus: boolean): void => {
    const sessionId = contextSessionId;
    contextSessionId = undefined;
    sessionContextMenu.hidden = true;
    const tab = sessionId === undefined ? undefined : findSessionTab(sessionId);
    tab?.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      tab?.focus();
    }
  };

  const openSessionContextMenu = (
    sessionId: SessionId,
    position: { readonly left: number; readonly top: number }
  ): void => {
    closeSessionContextMenu(false);
    contextSessionId = sessionId;
    renameSessionItem.hidden = false;
    closeSessionItem.hidden = false;
    closeSessionItem.disabled = sessions.get(sessionId)?.state === "closing";
    sessionContextMenu.hidden = false;
    const viewport = dependencies.document.documentElement;
    const maxLeft = Math.max(0, viewport.clientWidth - sessionContextMenu.offsetWidth);
    const maxTop = Math.max(0, viewport.clientHeight - sessionContextMenu.offsetHeight);
    sessionContextMenu.style.left = `${Math.max(0, Math.min(position.left, maxLeft))}px`;
    sessionContextMenu.style.top = `${Math.max(0, Math.min(position.top, maxTop))}px`;
    findSessionTab(sessionId)?.setAttribute("aria-expanded", "true");
    focusContextMenuItem(renameSessionItem);
  };

  function renderTabStrip(container: HTMLElement): void {
    const focused = dependencies.document.activeElement;
    const hadFocus = container.contains(focused);
    const existing = new Map(
      [...container.querySelectorAll<HTMLButtonElement>(".session-tab[data-session-id]")]
        .map(tab => [tab.dataset.sessionId, tab] as const)
    );
    for (const [id, tab] of existing) {
      if (id === undefined || !sessions.has(id)) tab.remove();
    }
    let position = container.firstElementChild;
    for (const session of sessions.values()) {
      const tab = renderTab(session, existing.get(session.id));
      if (tab !== position) container.insertBefore(tab, position);
      position = tab.nextElementSibling;
    }
    if (hadFocus && dependencies.document.activeElement !== focused) {
      if (container.contains(focused) && focused instanceof dependencies.window.HTMLElement) {
        focused.focus({ preventScroll: true });
      }
      if (dependencies.document.activeElement !== focused) {
        (sessionsTrigger.hidden ? actionsTrigger : sessionsTrigger).focus({ preventScroll: true });
      }
    }
  }

  function visibleHeaderTab(sessionId: SessionId | undefined): HTMLButtonElement | undefined {
    return [...tabs.querySelectorAll<HTMLButtonElement>(".session-tab:not([hidden])")]
      .find(tab => tab.dataset.sessionId === sessionId);
  }

  function layoutSessionTabs(): void {
    switcher.style.removeProperty("--session-picker-width");
    const switcherBounds = switcher.getBoundingClientRect();
    if (switcherBounds.width === 0 && header.getBoundingClientRect().width === 0) return;

    const focused = dependencies.document.activeElement;
    const focusedTab = focused instanceof dependencies.window.HTMLElement &&
      focused.matches(".session-tab") ? focused : undefined;
    const focusInPicker = popupPanels.sessions.contains(focused);
    const focusInContext = sessionContextMenu.contains(focused);
    const buttons = [...tabs.querySelectorAll<HTMLButtonElement>(".session-tab")];
    // Measure every tab at its natural width before applying the new overflow state.
    tabs.hidden = false;
    for (const button of buttons) button.hidden = false;
    const measured = buttons.map(button => ({ button, width: button.getBoundingClientRect().width }));
    const view = dependencies.document.defaultView!;
    const gap = Number.parseFloat(view.getComputedStyle(tabs).columnGap) || 0;
    const fullWidth = measured.reduce((width, tab) => width + tab.width, 0) + Math.max(0, measured.length - 1) * gap;
    const overflow = fullWidth > switcherBounds.width;
    sessionsTrigger.hidden = !overflow;
    if (overflow) {
      const pickerGap = Number.parseFloat(view.getComputedStyle(switcher).columnGap) || 0;
      const pickerWidth = sessionsTrigger.getBoundingClientRect().width;
      let available = switcherBounds.width;
      if (pickerWidth > available) {
        switcher.style.setProperty("--session-picker-width", `${pickerWidth}px`);
        available = switcher.getBoundingClientRect().width;
      }
      let remaining = available - pickerWidth - pickerGap;
      const activeTab = measured.find(tab => tab.button.dataset.sessionId === activeSessionId);
      const ordered = activeTab === undefined ? measured : [activeTab, ...measured.filter(tab => tab !== activeTab)];
      for (const { button, width } of ordered) {
        button.hidden = width > remaining;
        if (!button.hidden) remaining -= width + gap;
      }
    }
    tabs.hidden = buttons.every(button => button.hidden);

    const closingPicker = !overflow && openPopup === "sessions";
    const contextId = contextSessionId;
    const closingContext = contextId !== undefined &&
      (closingPicker || (openPopup !== "sessions" && visibleHeaderTab(contextId) === undefined));
    if (closingContext) closeSessionContextMenu(false);
    if (closingPicker) setSessionPopup(undefined, false);
    if ((focused === sessionsTrigger && !overflow) || (closingPicker && focusInPicker) ||
        (closingContext && focusInContext) || (focusedTab?.parentElement === tabs && focusedTab.hidden)) {
      const target = visibleHeaderTab(focusInContext ? contextId : focusedTab?.dataset.sessionId) ??
        (overflow ? sessionsTrigger : visibleHeaderTab(activeSessionId) ?? actionsTrigger);
      target.focus({ preventScroll: true });
    }
  }

  function setSessionPopup(next: SessionPopup | undefined, focus: boolean): void {
    const previous = openPopup;
    openPopup = next;
    for (const [name, panel] of Object.entries(popupPanels)) panel.hidden = name !== next;
    actionsTrigger.setAttribute("aria-expanded", String(next === "actions" || next === "resume" || next === "drafts"));
    sessionsTrigger.setAttribute("aria-expanded", String(next === "sessions"));
    detailsTrigger.setAttribute("aria-expanded", String(next === "details"));
    if (next === "sessions") renderTabStrip(pickerTabs);
    else pickerTabs.replaceChildren();
    if (!focus) return;
    if (next === undefined) {
      if (previous !== undefined) sessionPopupTrigger(previous).focus();
      return;
    }
    const firstControl = next === "resume" ? resumeSearch :
      popupPanels[next].querySelector<HTMLElement>(next === "drafts" ? "[data-restore-draft]" : "button");
    (firstControl ?? sessionPopupTrigger(next)).focus();
  }

  function sessionPopupTrigger(popup: SessionPopup): HTMLButtonElement {
    if (popup === "details") return detailsTrigger;
    return popup === "sessions" ? sessionsTrigger : actionsTrigger;
  }

  const render = (requestFocus=false): void => {
    const started = diagnostics.active ? monotonicNow() : undefined;
    const composerHadFocus = dependencies.document.activeElement?.closest(".composer-pane") != null;
    try {
      const activeSession = activeSessionId === undefined ? undefined : sessions.get(activeSessionId);
      const replyIdentity = savedReplySessionIdentity(activeSession);
      savedReply?.select(activeSession !== undefined && replyIdentity !== undefined
        ? {sessionId: activeSession.id, identity: replyIdentity}
        : undefined);
      savedReply?.setWaiting(activeSession?.activity === "waiting");
      replyUnavailable.hidden = savedReply !== undefined && replyIdentity !== undefined;
      renderTabStrip(tabs);
      const waiting = [...sessions.values()].filter(session => session.state === "running" && session.activity === "waiting").length;
      waitingCount.textContent = waiting > 0 ? `· ${waiting}` : "";
      const sessionsLabel = waiting > 0 ? `Sessions · ${waiting} ${waiting === 1 ? "needs" : "need"} input` : "Sessions";
      sessionsTrigger.setAttribute("aria-label", sessionsLabel);
      sessionsTrigger.title = sessionsLabel;
      layoutSessionTabs();
      if (openPopup === "sessions") renderTabStrip(pickerTabs);
      renderSessionDetails();
      const activeCell = activeSessionId === undefined ? undefined : terminals.get(activeSessionId);
      promptToggle.disabled = composer === undefined || activeCell === undefined;
      replyToggle.disabled = savedReply === undefined || activeCell === undefined;
      updatePromptReadiness();
      const desiredPane = activeCell === undefined ? "closed" : bottomPane;
      if (desiredPane !== visibleBottomPane) presentBottomPane(desiredPane, false, false);
      for (const cell of terminals.values()) {
        if(cell!==activeCell && cell.element.parentElement===terminalStage)cell.element.remove();
      }
      if (activeCell === undefined) {
        emptyState.hidden = false;
        return;
      }
      emptyState.hidden = true;
      if (!activeCell.opened) {
        activeCell.terminal.open(activeCell.element);
        activeCell.opened = true;
      }
      const mounting=activeCell.element.parentElement!==terminalStage;
      if(mounting){terminalStage.append(activeCell.element);fit(activeCell.terminal);}
      if (contextSessionId !== undefined && sessions.has(contextSessionId)) {
        const focusedItem = contextMenuItems.find((item) => item === dependencies.document.activeElement);
        closeSessionItem.disabled = sessions.get(contextSessionId)?.state === "closing";
        focusContextMenuItem(
          focusedItem !== undefined && !focusedItem.hidden && !focusedItem.disabled
            ? focusedItem
            : renameSessionItem
        );
      } else if ((mounting || requestFocus) && !composerHadFocus && !terminalStage.hidden) {
        activeCell.terminal.focus();
      }
    } finally {
      if (started !== undefined) {
        diagnostics.record("renderCount", 1, activeSessionId);
        diagnostics.record("renderMs", monotonicNow() - started, activeSessionId);
      }
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
    let promptSubmissionPending = false;
    let userInputPending = false;
    let keyStartedAt: number | undefined;
    let keyCaptureId: string | undefined;
    const retireKey = (): void => { keyStartedAt = undefined; keyCaptureId = undefined; };
    element.addEventListener("focusout", retireKey);
    terminal.onUserInput?.(() => { userInputPending = diagnostics.active; });
    terminal.onData((data) => {
      const isPromptSubmission = promptSubmissionPending;
      promptSubmissionPending = false;
      const keyAge = keyStartedAt === undefined || keyCaptureId !== diagnostics.captureId ? undefined : monotonicNow() - keyStartedAt;
      const probe = diagnostics.input(sessionId, data.length, userInputPending,
        keyAge !== undefined && keyAge >= 0 && keyAge < 30_000 ? keyStartedAt : undefined);
      if (userInputPending) { retireKey(); }
      userInputPending = false;
      dependencies.postMessage({ type: "input", sessionId, data, isPromptSubmission, ...(probe === undefined ? {} : { probe }) });
    });
    terminal.onResize(({ cols, rows }) => {
      dependencies.postMessage({ type: "resize", sessionId, columns: cols, rows });
    });
    terminal.attachCustomKeyEventHandler?.((event) => {
      if (diagnostics.active && event.type === "keydown") {
        keyStartedAt = monotonicNow();
        keyCaptureId = diagnostics.captureId;
        const dispatchMs = keyStartedAt - event.timeStamp;
        if (dispatchMs >= 0 && dispatchMs <= 300_000) { diagnostics.record("keyDispatchMs", dispatchMs, sessionId); }
      }
      if (event.type === "keyup") { retireKey(); }
      // Release the declared default toggle gesture to VS Code's native resolver.
      // Do not prevent/default-dispatch it here: user overrides and unbindings still win.
      if(event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && event.key.toLowerCase()==="g"
        && activeSessionId===sessionId && terminalStage.contains(element) && element.contains(dependencies.document.activeElement)){
        if(event.isComposing || event.keyCode===229){event.stopPropagation();return true;}
        return false;
      }
      if (
        event.type === "keydown" &&
        event.key === "Enter" &&
        !event.shiftKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.isComposing &&
        activeSessionId === sessionId &&
        terminalStage.contains(element) &&
        element.contains(dependencies.document.activeElement)
      ) {
        promptSubmissionPending = true;
        void Promise.resolve().then(() => {
          promptSubmissionPending = false;
        });
      }
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
    companion.forgetSession(sessionId);
    diagnostics.forgetSession(sessionId);
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
    layoutSessionTabs();
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
      fit(activeCell.terminal);
    }
  };
  sessionDetails.addEventListener("toggle", () => {
    fitActiveTerminal();
  });
  const onWindowResize = (): void => {
    layoutSessionTabs();
    fitActiveTerminal();
  };
  dependencies.window.addEventListener("resize", onWindowResize);
  const ResizeObserverConstructor = dependencies.window.ResizeObserver;
  const resizeObserver = ResizeObserverConstructor === undefined
    ? undefined
    : new ResizeObserverConstructor(entries => {
      if (entries.some(entry => entry.target === switcher)) layoutSessionTabs();
      if (entries.some(entry => entry.target === terminalStage)) fitActiveTerminal();
    });
  resizeObserver?.observe(terminalStage);
  resizeObserver?.observe(switcher);

  resumeSearch.addEventListener("input", () => {
    renderResumeRows();
    resumeList.scrollTop = 0;
  });

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
    if (target.closest("[data-context-action=closeSession]") !== null) {
      const sessionId = contextSessionId;
      const session = sessionId === undefined ? undefined : sessions.get(sessionId);
      closeSessionContextMenu(true);
      if (session !== undefined && session.state !== "closing") {
        dependencies.postMessage({ type: "closeSession", sessionId: session.id });
      }
      return;
    }
    if (!sessionContextMenu.hidden) {
      closeSessionContextMenu(false);
    }
    const paneButton = target.closest<HTMLButtonElement>("button[data-bottom-pane]");
    const requestedPane = paneButton?.dataset.bottomPane;
    if (requestedPane === "prompt" || requestedPane === "reply") {
      if (!paneButton?.disabled) {
        if (openPopup !== undefined) setSessionPopup(undefined, false);
        initializedPane = true;
        setBottomPane(bottomPane === requestedPane ? "closed" : requestedPane, true);
      }
      return;
    }
    const requestedPopup = target.closest<HTMLElement>("[data-session-popup]")?.dataset.sessionPopup;
    if (requestedPopup === "actions" || requestedPopup === "sessions" || requestedPopup === "resume" ||
        requestedPopup === "drafts" || requestedPopup === "details" || requestedPopup === "close") {
      setSessionPopup(requestedPopup === openPopup || requestedPopup === "close" ? undefined : requestedPopup, true);
      return;
    }
    if (openPopup !== undefined && !popupPanels[openPopup].contains(target)) setSessionPopup(undefined, false);
    const restore=target.closest<HTMLButtonElement>("button[data-restore-draft]");
    if(restore!==null && dependencies.documentId!==undefined){
      const row=recoveryRows.get(restore.dataset.restoreDraft!);
      if (row !== undefined) {
        setSessionPopup(undefined, true);
        dependencies.postMessage({type:"composerRestoreDraft",documentId:dependencies.documentId,claudeSessionId:row.claudeSessionId,expectedRevision:row.draftRevision});
      }
      return;
    }
    const forget=target.closest<HTMLButtonElement>("button[data-forget-draft]");
    if(forget!==null){dependencies.postMessage({type:"forgetSession",claudeSessionId:forget.dataset.forgetDraft!});return;}
    const forgetSessionId = target.closest<HTMLElement>("[data-forget-session-id]")?.dataset.forgetSessionId;
    if (forgetSessionId !== undefined) {
      dependencies.postMessage({ type: "forgetSession", claudeSessionId: forgetSessionId });
      return;
    }
    const claudeSessionId = target.closest<HTMLElement>("button[data-resume-session-id]")
      ?.dataset.resumeSessionId;
    if (claudeSessionId !== undefined) {
      setSessionPopup(undefined, true);
      dependencies.postMessage({ type: "resumeSession", claudeSessionId });
      return;
    }
    const sessionId = target.closest<HTMLElement>(".session-tab[data-session-id]")?.dataset.sessionId;
    if (sessionId !== undefined) {
      setSessionPopup(undefined, false);
      activeSessionId = sessionId;
      render(true);
      dependencies.postMessage({ type: "selectSession", sessionId });
      return;
    }
    const action = target.closest<HTMLElement>("[data-action]")?.dataset.action;
    if (action !== undefined && openPopup !== undefined) setSessionPopup(undefined, true);
    postAction(action, activeSessionId, dependencies.postMessage);
  });

  app.addEventListener("contextmenu", (event) => {
    const target = event.target;
    if (!(target instanceof dependencies.window.HTMLElement)) {
      return;
    }
    const tab = target.closest<HTMLButtonElement>(".session-tab[data-session-id]");
    const sessionId = tab?.dataset.sessionId;
    if (tab === null || sessionId === undefined) {
      return;
    }
    event.preventDefault();
    openSessionContextMenu(sessionId, { left: event.clientX, top: event.clientY });
  });

  app.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (event.defaultPrevented || event.isComposing || event.keyCode === 229)) return;
    if (event.key === "Escape" && !sessionContextMenu.hidden) {
      event.preventDefault();
      closeSessionContextMenu(true);
      return;
    }
    const target = event.target;
    if (!(target instanceof dependencies.window.HTMLElement)) {
      return;
    }
    if (event.key === "Escape" && openPopup !== undefined &&
        (popupPanels[openPopup].contains(target) || target === actionsTrigger ||
          target === sessionsTrigger || target === detailsTrigger)) {
      event.preventDefault();
      setSessionPopup(undefined, true);
      return;
    }
    // CodeMirror uses Escape in the draft to temporarily release Tab for focus navigation.
    if (event.key === "Escape" &&
        ((bottomPane === "prompt" && (target === promptToggle ||
          (promptSlot.contains(target) && target.closest(".composer-editor") === null))) ||
          (bottomPane === "reply" && (replySlot.contains(target) || target === replyToggle)))) {
      event.preventDefault();
      setBottomPane("closed", true);
      return;
    }
    if (!sessionContextMenu.hidden && sessionContextMenu.contains(target)) {
      if (event.key === "Tab") {
        closeSessionContextMenu(false);
        return;
      }
      const items = availableContextMenuItems();
      const currentIndex = items.findIndex((item) => item === target);
      let nextIndex: number | undefined;
      if (event.key === "ArrowDown") {
        nextIndex = (currentIndex + 1) % items.length;
      } else if (event.key === "ArrowUp") {
        nextIndex = (currentIndex - 1 + items.length) % items.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = items.length - 1;
      }
      const nextItem = nextIndex === undefined ? undefined : items[nextIndex];
      if (nextItem !== undefined) {
        event.preventDefault();
        focusContextMenuItem(nextItem);
      }
      return;
    }
    const tab = target.closest<HTMLButtonElement>(".session-tab[data-session-id]");
    const sessionId = tab?.dataset.sessionId;
    const isContextKey = event.key === "ContextMenu" || (event.shiftKey && event.key === "F10");
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
  dependencies.postMessage(
    dependencies.documentId === undefined
      ? { type: "ready" }
      : { type: "ready", documentId: dependencies.documentId }
  );

  companion.start();

  return {
    handleMessage(message): void | Promise<void> {
      if(disposed)return;
      if(message.type === "companion") return companion.receive(message.payload);
      if(message.type==="composerRecoveryInvalidated"){
        if(message.documentId!==dependencies.documentId || (recoveryRevision!==undefined && message.revision<recoveryRevision))return;
        recoveryRevision=message.revision;recoveryRequestId=undefined;recoveryStaging=new Map();requestRecovery();return;
      }
      if(message.type==="composerRecoveryPage"){
        if(message.documentId!==dependencies.documentId || message.requestId!==recoveryRequestId || message.page.revision!==recoveryRevision)return;
        recoveryRequestId=undefined;
        for(const row of message.page.rows)recoveryStaging.set(row.claudeSessionId,row);
        if(message.page.nextCursor!==undefined)requestRecovery(message.page.nextCursor);
        else {recoveryRows.clear();for(const [uuid,row] of recoveryStaging)recoveryRows.set(uuid,row);renderRecovery();}
        return;
      }
      if (message.type === "composerHydrate") {
        const sessionId = message.capability.status === "available"
          ? message.capability.target.sessionId : message.capability.sessionId;
        if (sessionId !== activeSessionId) return;
        composer?.hydrate(message);
        hydratedComposerSession = activeSessionId;
        updatePromptReadiness();
        if (!initializedPane && !promptToggle.disabled) {
          initializedPane = true;
          if (message.visible) setBottomPane("prompt", false);
        }
        return;
      }
      if(message.type.startsWith("composer")){
        const composerMessage = message as ComposerHostMessage;
        if ("target" in composerMessage && composerMessage.target !== undefined &&
            composerMessage.target.sessionId !== activeSessionId) return;
        if (composerMessage.type === "composerReset" && composerMessage.documentId === dependencies.documentId) {
          hydratedComposerSession = undefined;
          updatePromptReadiness();
        }
        composer?.handleHostMessage(composerMessage);
        return;
      }
      switch (message.type) {
        case "savedReplyImported":
        case "savedReplyFeedback":
        case "savedReplyCaptured":
          savedReply?.handle(message);
          return;
        case "terminalDiagnostics":
          diagnostics.control(message);
          return;
        case "terminalInputAck":
          diagnostics.inputAck(message);
          return;
        case "hydrate":
          terminalFont = message.terminalFont;
          renderResumableSessions(message.resumableSessions);
          replaceSessions(message.sessions);
          renderRecovery();
          activeSessionId = message.activeSessionId;
          render();
          return;
        case "resumableSessionsChanged":
          diagnostics.record("savedSessionsUpdated", 1);
          renderResumableSessions(message.sessions);
          return;
        case "sessionAdded":
        case "sessionUpdated":
          if (message.type === "sessionUpdated") { diagnostics.record("sessionUpdated", 1, message.session.id); }
          sessions.set(message.session.id, message.session);
          renderRecovery();
          ensureTerminal(message.session.id);
          render();
          return;
        case "sessionRemoved":
          removeSession(message.sessionId);
          renderRecovery();
          render();
          return;
        case "sessionData": {
          const terminal = terminals.get(message.sessionId)?.terminal;
          if (terminal === undefined) { return; }
          if (diagnostics.active) {
            terminal.write(message.data, diagnostics.output(message.sessionId, message.probe, () => terminal.pendingWriteCount ?? 0));
          } else { terminal.write(message.data); }
          return;
        }
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
        case "focusSession": {
          const cell = terminals.get(message.sessionId);
          if (
            message.sessionId === activeSessionId &&
            cell !== undefined &&
            terminalStage.contains(cell.element)
          ) {
            companion.setMode("raw");
            closeSessionContextMenu(false);
            setSessionPopup(undefined, false);
            cell.terminal.focus();
            const report = (phase: "immediate" | "settled"): void => {
              if (disposed || message.sessionId !== activeSessionId || !terminalStage.contains(cell.element)) {
                return;
              }
              dependencies.postMessage({ type: "terminalFocusResult", sessionId: message.sessionId, phase,
                documentHasFocus: dependencies.document.hasFocus(),
                terminalHasFocus: cell.element.contains(dependencies.document.activeElement) });
            };
            report("immediate");
            clearTimeout(focusProbeTimer);
            focusProbeTimer = setTimeout(() => { focusProbeTimer = undefined; report("settled"); }, 500);
          }
          return;
        }
        case "activeSessionChanged":
          activeSessionId = message.activeSessionId;
          render(true);
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      savedReply?.dispose();
      companion.dispose();
      composer?.dispose();
      diagnostics.dispose();
      clearTimeout(focusProbeTimer);
      dependencies.window.removeEventListener("resize", onWindowResize);
      dependencies.document.removeEventListener("paste", onPaste);
      themeObserver.disconnect();
      resizeObserver?.disconnect();
      if (resumableAgeIntervalId !== undefined) {
        cancelInterval(resumableAgeIntervalId);
        resumableAgeIntervalId = undefined;
      }
      for (const sessionId of [...terminals.keys()]) {
        removeSession(sessionId);
      }
    }
  };

  /** Hydrates resume records and the eligibility filter from the same host snapshot. */
  function renderResumableSessions(nextSessions: readonly ResumableSessionSnapshot[]): void {
    resumableSessions = nextSessions;
    eligibleResumeIds = new Set(nextSessions.map(session => session.claudeSessionId));
    renderRecovery();
    renderResumeRows();
    synchronizeResumableAgeInterval(nextSessions.length > 0);
  }

  function renderResumeRows(): void {
    const focused = dependencies.document.activeElement;
    const previousRow = focused?.closest("li");
    const focusedIndex = previousRow ? [...resumeList.children].indexOf(previousRow) : -1;
    const focusButton = focusedIndex >= 0 && focused instanceof dependencies.window.HTMLElement ? focused : undefined;
    const action = focusButton?.dataset.forgetSessionId !== undefined ? "forgetSessionId" : "resumeSessionId";
    const focusedId = focusButton?.dataset[action];
    const previousScroll = resumeList.scrollTop;
    const query = resumeSearch.value;
    const ordered = filterResumableSessions(resumableSessions, query);
    const total = resumableSessions.length;
    const count = query.trim() ? `${ordered.length} of ${total} sessions` : `${total} ${total === 1 ? "session" : "sessions"}`;
    if (resumeCount.textContent !== count) resumeCount.textContent = count;
    resumeEmpty.hidden = ordered.length > 0;
    resumeEmpty.textContent = total > 0 ? "No sessions match your search." : "No sessions to resume.";
    resumeList.replaceChildren(...ordered.map(session => {
      const item = dependencies.document.createElement("li");
      const button = dependencies.document.createElement("button");
      button.type = "button";
      button.className = "resume-session";
      button.dataset.resumeSessionId = session.claudeSessionId;
      const exactLaunchTime = formatExactLaunchTime(session.lastLaunchedAt);
      button.setAttribute("aria-label", `Resume ${session.displayName} from ${session.rootPath}. Last opened ${exactLaunchTime}.`);
      button.title = `${session.displayName}\n${session.rootPath}\nLast opened ${exactLaunchTime}`;

      const name = dependencies.document.createElement("span");
      name.className = "resume-session-name";
      name.textContent = session.displayName;
      const age = dependencies.document.createElement("time");
      age.className = "resume-session-time";
      age.dateTime = session.lastLaunchedAt;
      age.textContent = `Last opened ${formatRelativeLaunchAge(session.lastLaunchedAt, now())}`;
      age.title = `Last opened ${exactLaunchTime}`;
      const root = dependencies.document.createElement("span");
      root.className = "resume-session-root";
      root.append(`${session.rootLabel} · `);
      const path = dependencies.document.createElement("span");
      path.className = "resume-session-path";
      path.textContent = session.rootPath;
      root.append(path);
      button.append(name, age, root);

      const forget = dependencies.document.createElement("button");
      forget.type = "button";
      forget.className = "session-action resume-forget";
      forget.dataset.forgetSessionId = session.claudeSessionId;
      forget.setAttribute("aria-label", `Forget ${session.displayName} from ${session.rootPath}`);
      forget.title = "Forget Session";
      forget.textContent = "×";
      item.append(button, forget);
      return item;
    }));
    resumeList.scrollTop = previousScroll;
    if (focusButton) {
      const selector = action === "forgetSessionId" ? "[data-forget-session-id]" : "[data-resume-session-id]";
      const buttons = [...resumeList.querySelectorAll<HTMLButtonElement>(selector)];
      (buttons.find(button => button.dataset[action] === focusedId) ??
        buttons[Math.min(focusedIndex, buttons.length - 1)] ?? resumeSearch).focus();
    }
  }

  function requestRecovery(cursor?:RecoveryCursor):void {
    if(disposed || dependencies.documentId===undefined)return;
    recoveryRequestId=dependencies.document.defaultView!.crypto.randomUUID();
    dependencies.postMessage({type:"composerRequestRecovery",documentId:dependencies.documentId,requestId:recoveryRequestId,...(cursor===undefined?{}:{cursor})});
  }

  function renderRecovery():void {
    const live=new Set([...sessions.values()].map(session=>session.claudeSessionId));
    const focused=dependencies.document.activeElement as HTMLElement|null;
    const focusedId=focused?.dataset.restoreDraft ?? focused?.dataset.forgetDraft;
    const wasForget=focused?.dataset.forgetDraft!==undefined;
    const rows=[...recoveryRows.values()].filter(row=>!eligibleResumeIds.has(row.claudeSessionId) && !live.has(row.claudeSessionId));
    restoreDraftTrigger.hidden=rows.length===0;
    if (restoreDraftTrigger.hidden && openPopup === "drafts") {
      setSessionPopup(undefined, popupPanels.drafts.contains(focused));
    }
    if (restoreDraftTrigger.hidden && focused === restoreDraftTrigger) {
      (popupPanels.actions.querySelector<HTMLElement>("button:not([hidden])") ?? actionsTrigger).focus();
    }
    draftsList.replaceChildren(...rows.map(row=>{
      const item=dependencies.document.createElement("li");
      const restore=dependencies.document.createElement("button");restore.type="button";restore.className="resume-session";
      restore.dataset.restoreDraft=row.claudeSessionId;
      restore.textContent=`Restore draft · ${row.displayName}`;
      restore.title=`${row.rootPath}
${row.claudeSessionId}${row.storageStatus==="error"?"\nNot saved to disk; available in this window only.":""}`;
      const forget=dependencies.document.createElement("button");forget.type="button";forget.dataset.forgetDraft=row.claudeSessionId;forget.textContent="Forget";
      forget.setAttribute("aria-label",`Forget saved draft for ${row.displayName}`);item.append(restore,forget);return item;
    }));
    if(focusedId!==undefined && rows.length>0){
      const buttons=[...draftsList.querySelectorAll<HTMLButtonElement>("button")];
      (buttons.find(button=>(wasForget?button.dataset.forgetDraft:button.dataset.restoreDraft)===focusedId) ?? buttons[0])?.focus();
    }
  }

  function synchronizeResumableAgeInterval(hasSessions: boolean): void {
    if (hasSessions && resumableAgeIntervalId === undefined) {
      resumableAgeIntervalId = scheduleInterval(refreshResumableLaunchAges, 60_000);
      return;
    }
    if (!hasSessions && resumableAgeIntervalId !== undefined) {
      cancelInterval(resumableAgeIntervalId);
      resumableAgeIntervalId = undefined;
    }
  }

  function refreshResumableLaunchAges(): void {
    for (const time of resumeList.querySelectorAll<HTMLTimeElement>(".resume-session-time")) {
      time.textContent = `Last opened ${formatRelativeLaunchAge(time.dateTime, now())}`;
    }
  }

  function formatExactLaunchTime(lastLaunchedAt: string): string {
    try {
      return formatDateTime(new Date(lastLaunchedAt));
    } catch {
      return lastLaunchedAt;
    }
  }

  function renderTab(session: ManagedSessionSnapshot, tab = dependencies.document.createElement("button")): HTMLButtonElement {
    const selected = session.id === activeSessionId;
    const agentCount=session.state==="running" ? session.activeAgentCount ?? 0 : 0;
    const showWorking = session.state === "running" && (session.activity === "working" || agentCount>0);
    const showUnread = session.state === "running" && session.hasUnreadResponse;
    const statusParts = session.state === "running"
      ? [
          ...(session.activity === "working" ? ["working"] : []),
          ...(session.activity === "waiting" ? ["waiting"] : []),
          ...(agentCount>0 ? [`${agentCount} ${agentCount===1?"agent":"agents"} working`] : []),
          ...(showUnread ? ["unread response"] : [])
        ]
      : [session.state];
    const accessibleName = [session.displayName, ...statusParts].join(" — ");
    tab.type = "button";
    tab.className = "session-tab";
    tab.dataset.sessionId = session.id;
    tab.setAttribute("role", "tab");
    tab.setAttribute("aria-selected", String(selected));
    tab.setAttribute("aria-haspopup", "menu");
    tab.setAttribute("aria-expanded", String(session.id === contextSessionId));
    tab.setAttribute("aria-label", accessibleName);
    tab.title = accessibleName;
    tab.replaceChildren();
    if (showWorking) {
      const marker = dependencies.document.createElement("span");
      marker.className = "session-tab-working-marker";
      marker.setAttribute("aria-hidden", "true");
      tab.append(marker);
    }
    if (showUnread) {
      const marker = dependencies.document.createElement("span");
      marker.className = "session-tab-unread-marker";
      marker.setAttribute("aria-hidden", "true");
      tab.append(marker);
    }
    const label = dependencies.document.createElement("span");
    label.className = "session-tab-label";
    label.textContent = session.displayName;
    tab.append(label);
    if(agentCount>0){
      const count=dependencies.document.createElement("span");count.className="session-tab-agents";
      count.textContent=`${agentCount} ${agentCount===1?"agent":"agents"}`;count.setAttribute("aria-hidden","true");tab.append(count);
    }
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
    detailsTrigger.hidden = session === undefined;
    if (session === undefined) {
      if (openPopup === "details") setSessionPopup(undefined, false);
      sessionDetailsList.replaceChildren();
      sessionLaunchRootLabel.textContent = "";
      sessionLaunchRootPath.textContent = "";
      sessionLaunchRootPath.removeAttribute("title");
      sessionDetailsEmpty.hidden = false;
      return;
    }

    const paths = session.launchedAddDirPaths;
    detailsTrigger.textContent = `Launch details — Added directories (${paths.length})`;
    sessionLaunchRootLabel.textContent = session.launchedRootLabel;
    sessionLaunchRootPath.textContent = session.launchedRootPath;
    sessionLaunchRootPath.title = session.launchedRootPath;
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

/** Formats a stable, concise age without allowing future clock skew to imply a future launch. */
function formatRelativeLaunchAge(lastLaunchedAt: string, now: number): string {
  const ageMilliseconds = Math.max(0, now - Date.parse(lastLaunchedAt));
  const ageMinutes = Math.floor(ageMilliseconds / 60_000);
  if (ageMinutes < 1) {
    return "just now";
  }
  if (ageMinutes < 60) {
    return `${ageMinutes} ${ageMinutes === 1 ? "minute" : "minutes"} ago`;
  }
  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 24) {
    return `${ageHours} ${ageHours === 1 ? "hour" : "hours"} ago`;
  }
  const ageDays = Math.floor(ageHours / 24);
  return `${ageDays} ${ageDays === 1 ? "day" : "days"} ago`;
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
    background:
      styles?.getPropertyValue("--vscode-terminal-background").trim() ||
      styles?.getPropertyValue("--vscode-editor-background").trim() ||
      styles?.getPropertyValue("--vscode-panel-background").trim() ||
      "#1e1e1e",
    foreground:
      styles?.getPropertyValue("--vscode-terminal-foreground").trim() ||
      styles?.getPropertyValue("--vscode-editor-foreground").trim() ||
      styles?.getPropertyValue("--vscode-foreground").trim() ||
      "#cccccc",
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
    case "requestRenameSession":
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
