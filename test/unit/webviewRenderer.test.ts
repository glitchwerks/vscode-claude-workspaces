import assert from "node:assert/strict";

import { JSDOM } from "jsdom";

import {
  createSessionRenderer,
  type RendererTerminal,
  type RendererTerminalFactory,
  type RendererWindow
} from "../../src/panel/webview/renderer";
import type { WebviewMessage } from "../../src/panel/protocol";
import type { ManagedSessionSnapshot } from "../../src/sessions/sessionTypes";

describe("session webview renderer", () => {
  it("keeps only the active terminal canvas attached while retaining session output", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");

    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [alpha, beta],
      activeSessionId: alpha.id
    });
    harness.renderer.handleMessage({ type: "sessionData", sessionId: beta.id, data: "beta ready" });
    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: beta.id });

    assert.equal(harness.stage.querySelectorAll(".terminal-instance").length, 1);
    assert.equal(harness.stage.querySelector(".terminal-instance")?.getAttribute("data-session-id"), beta.id);
    assert.deepEqual(harness.terminals[1]?.writes, ["beta ready"]);

    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: alpha.id });
    assert.equal(harness.stage.querySelectorAll(".terminal-instance").length, 1);
    assert.equal(harness.stage.querySelector(".terminal-instance")?.getAttribute("data-session-id"), alpha.id);
    assert.deepEqual(harness.terminals[1]?.writes, ["beta ready"]);

    harness.renderer.handleMessage({ type: "sessionRemoved", sessionId: beta.id });
    assert.equal(harness.terminals[1]?.disposed, true);
  });

  it("forwards active terminal input and resize through the closed protocol", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");

    harness.renderer.handleMessage({ type: "hydrate", sessions: [alpha], activeSessionId: alpha.id });
    harness.terminals[0]?.emitData("hello");
    harness.terminals[0]?.emitResize(120, 40);

    assert.deepEqual(harness.messages.slice(1), [
      { type: "input", sessionId: alpha.id, data: "hello" },
      { type: "resize", sessionId: alpha.id, columns: 120, rows: 40 }
    ]);
  });

  it("resolves VS Code theme values and updates existing terminals when the theme mutates", async () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.document.documentElement.style.setProperty("--vscode-terminal-background", "#112233");
    harness.document.documentElement.style.setProperty("--vscode-terminal-foreground", "#ddeeff");

    harness.renderer.handleMessage({ type: "hydrate", sessions: [alpha], activeSessionId: alpha.id });
    assert.deepEqual(harness.terminals[0]?.theme, {
      background: "#112233",
      foreground: "#ddeeff"
    });

    harness.document.documentElement.style.setProperty("--vscode-terminal-background", "#445566");
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(harness.terminals[0]?.theme, {
      background: "#445566",
      foreground: "#ddeeff"
    });
  });
});

/** Creates a real DOM renderer harness with a fake terminal implementation. */
function createRendererHarness(): {
  readonly document: Document;
  readonly messages: WebviewMessage[];
  readonly renderer: ReturnType<typeof createSessionRenderer>;
  readonly stage: HTMLElement;
  readonly terminals: FakeTerminal[];
} {
  const dom = new JSDOM("<main id=\"app\"></main>", { pretendToBeVisual: true });
  const messages: WebviewMessage[] = [];
  const terminals: FakeTerminal[] = [];
  const terminalFactory: RendererTerminalFactory = {
    create: (theme: { background: string; foreground: string }) => {
      const terminal = new FakeTerminal(dom.window.document, theme);
      terminals.push(terminal);
      return terminal;
    }
  };
  const renderer = createSessionRenderer({
    document: dom.window.document,
    window: rendererWindow(dom.window as unknown as Window),
    postMessage: (message: WebviewMessage) => messages.push(message),
    terminalFactory,
    fitTerminal: () => undefined
  });
  const stage = dom.window.document.querySelector<HTMLElement>(".terminal-stage");
  assert.ok(stage, "terminal stage was rendered");
  return {
    document: dom.window.document,
    messages,
    renderer,
    stage,
    terminals
  };
}

/** Converts JSDOM's browser globals into the renderer's explicit window boundary. */
function rendererWindow(window: Window): RendererWindow {
  const globals = window as unknown as {
    readonly HTMLElement: typeof HTMLElement;
    readonly MutationObserver: typeof MutationObserver;
    readonly ResizeObserver?: typeof ResizeObserver;
  };
  return {
    HTMLElement: globals.HTMLElement,
    MutationObserver: globals.MutationObserver,
    ResizeObserver: globals.ResizeObserver,
    navigator: window.navigator,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window)
  };
}

/** Represents a hand-derived live session snapshot. */
function panelSession(id: string, displayName: string): ManagedSessionSnapshot {
  return {
    id,
    rootId: `file:///workspace/${id}`,
    displayName,
    ordinalWithinRoot: 1,
    state: "running",
    launchedImportIds: [],
    launchedAt: 1234
  };
}

/** Implements just enough terminal behavior to observe renderer boundary effects. */
class FakeTerminal implements RendererTerminal {
  readonly element: HTMLElement;
  readonly writes: string[] = [];
  readonly theme: { background: string; foreground: string };
  disposed = false;
  private dataListener: ((data: string) => void) | undefined;
  private resizeListener: ((size: { cols: number; rows: number }) => void) | undefined;

  constructor(document: Document, theme: { background: string; foreground: string }) {
    this.theme = theme;
    this.element = document.createElement("div");
  }

  open(parent: HTMLElement): void { parent.append(this.element); }
  write(data: string): void { this.writes.push(data); }
  dispose(): void { this.disposed = true; }
  focus(): void {}
  onData(listener: (data: string) => void): void { this.dataListener = listener; }
  onResize(listener: (size: { cols: number; rows: number }) => void): void { this.resizeListener = listener; }
  updateTheme(theme: { background: string; foreground: string }): void {
    this.theme.background = theme.background;
    this.theme.foreground = theme.foreground;
  }
  emitData(data: string): void { this.dataListener?.(data); }
  emitResize(cols: number, rows: number): void { this.resizeListener?.({ cols, rows }); }
}
