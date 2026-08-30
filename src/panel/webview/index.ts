import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

import "@xterm/xterm/css/xterm.css";
import "./styles.css";
import { decodeHostMessage, type WebviewMessage } from "../protocol";
import {
  createSessionRenderer,
  type RendererTerminal,
  type RendererTheme
} from "./renderer";

interface VsCodeApi {
  postMessage(message: WebviewMessage): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const renderer = createSessionRenderer({
  document,
  window: {
    HTMLElement,
    MutationObserver,
    ResizeObserver,
    navigator: window.navigator,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window)
  },
  postMessage: (message) => vscode.postMessage(message),
  terminalFactory: {
    create: (theme, fontFamily) => new XtermTerminal(theme, fontFamily)
  },
  fitTerminal: (terminal) => terminal.fit?.()
});

window.addEventListener("message", (event: MessageEvent<unknown>) => {
  const decoded = decodeHostMessage(event.data);
  if (decoded.ok) {
    renderer.handleMessage(decoded.value);
  }
});

/** Adapts xterm and FitAddon to the renderer's process-free terminal surface. */
class XtermTerminal implements RendererTerminal {
  private readonly terminal: Terminal;
  private readonly fitAddon = new FitAddon();

  constructor(theme: RendererTheme, fontFamily: string) {
    this.terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontFamily,
      fontSize: 13,
      theme
    });
    this.terminal.loadAddon(this.fitAddon);
  }

  open(parent: HTMLElement): void { this.terminal.open(parent); }
  write(data: string): void { this.terminal.write(data); }
  dispose(): void { this.terminal.dispose(); }
  focus(): void { this.terminal.focus(); }
  onData(listener: (data: string) => void): void { this.terminal.onData(listener); }
  onResize(listener: (size: { readonly cols: number; readonly rows: number }) => void): void {
    this.terminal.onResize(listener);
  }
  updateTheme(theme: RendererTheme): void { this.terminal.options.theme = theme; }
  hasSelection(): boolean { return this.terminal.hasSelection(); }
  getSelection(): string { return this.terminal.getSelection(); }
  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
    this.terminal.attachCustomKeyEventHandler(handler);
  }
  fit(): void { this.fitAddon.fit(); }
}
