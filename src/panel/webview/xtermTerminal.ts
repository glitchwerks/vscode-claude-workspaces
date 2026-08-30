import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import {
  Terminal,
  type ITerminalInitOnlyOptions,
  type ITerminalOptions
} from "@xterm/xterm";

import type { TerminalFontMetrics } from "../protocol";
import type { RendererTerminal, RendererTheme } from "./renderer";
import { activateWebglRenderer, type WebglRendererAddon } from "./webglRenderer";

/** Injectable constructors used to verify the production xterm renderer lifecycle. */
export interface XtermTerminalDependencies {
  createTerminal(options: ITerminalOptions & ITerminalInitOnlyOptions): Terminal;
  createFitAddon(): FitAddon;
  createWebglAddon(): WebglRendererAddon;
}

/** Adapts xterm, FitAddon, and WebGL custom glyphs to the process-free renderer surface. */
export class XtermTerminal implements RendererTerminal {
  private readonly terminal: Terminal;
  private readonly fitAddon: FitAddon;
  private webglActivated = false;

  constructor(
    theme: RendererTheme,
    terminalFont: TerminalFontMetrics,
    private readonly dependencies: XtermTerminalDependencies = defaultDependencies
  ) {
    this.terminal = dependencies.createTerminal({
      convertEol: true,
      cursorBlink: true,
      customGlyphs: true,
      fontFamily: terminalFont.fontFamily,
      fontSize: terminalFont.fontSize,
      letterSpacing: terminalFont.letterSpacing,
      lineHeight: terminalFont.lineHeight,
      theme
    });
    this.fitAddon = dependencies.createFitAddon();
    this.terminal.loadAddon(this.fitAddon);
  }

  open(parent: HTMLElement): void {
    this.terminal.open(parent);
    if (!this.webglActivated) {
      this.webglActivated = true;
      activateWebglRenderer(this.terminal, () => this.dependencies.createWebglAddon());
    }
  }

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

const defaultDependencies: XtermTerminalDependencies = {
  createTerminal: (options) => new Terminal(options),
  createFitAddon: () => new FitAddon(),
  createWebglAddon: () => new WebglAddon()
};
