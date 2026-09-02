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
  setTimeout(callback: () => void, delay: number): number;
  clearTimeout(timer: number): void;
  isCursorHidden(terminal: Terminal): boolean;
  setCursorHidden(terminal: Terminal, hidden: boolean): void;
  onUserInput(terminal: Terminal, listener: () => void): { dispose(): void };
}

const CURSOR_REVEAL_DELAY_MS = 250;

/** Adapts xterm, FitAddon, and WebGL custom glyphs to the process-free renderer surface. */
export class XtermTerminal implements RendererTerminal {
  private readonly terminal: Terminal;
  private readonly fitAddon: FitAddon;
  private readonly cursorModeDisposables: Array<{ dispose(): void }>;
  private webglActivated = false;
  private cursorRevealTimer: number | undefined;
  private outputGeneration = 0;
  private suppressingCursor = false;
  private applicationCursorHidden = false;

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
    this.applicationCursorHidden = dependencies.isCursorHidden(this.terminal);
    this.cursorModeDisposables = [
      dependencies.onUserInput(this.terminal, () => this.revealCursor()),
      this.observeCursorMode({ prefix: "?", final: "h" }, false),
      this.observeCursorMode({ prefix: "?", final: "l" }, true),
      this.observeEscCursorReset(),
      this.observeCursorReset({ intermediates: "!", final: "p" })
    ];
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

  write(data: string): void {
    this.suppressingCursor = true;
    const generation = ++this.outputGeneration;
    this.cancelCursorReveal();
    this.dependencies.setCursorHidden(this.terminal, true);
    this.terminal.write(data, () => {
      if (!this.suppressingCursor) {
        return;
      }
      this.dependencies.setCursorHidden(this.terminal, true);
      if (generation === this.outputGeneration) {
        this.scheduleCursorReveal(generation);
      }
    });
  }
  dispose(): void {
    this.outputGeneration++;
    this.suppressingCursor = false;
    this.cancelCursorReveal();
    for (const disposable of this.cursorModeDisposables) {
      disposable.dispose();
    }
    this.terminal.dispose();
  }
  focus(): void { this.terminal.focus(); }
  onData(listener: (data: string) => void): void {
    this.terminal.onData(listener);
  }
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

  private scheduleCursorReveal(generation: number): void {
    this.cursorRevealTimer = this.dependencies.setTimeout(() => {
      if (generation !== this.outputGeneration || !this.suppressingCursor) {
        return;
      }
      this.cursorRevealTimer = undefined;
      this.suppressingCursor = false;
      this.dependencies.setCursorHidden(this.terminal, this.applicationCursorHidden);
    }, CURSOR_REVEAL_DELAY_MS);
  }

  private revealCursor(): void {
    this.outputGeneration++;
    this.suppressingCursor = false;
    this.cancelCursorReveal();
    this.dependencies.setCursorHidden(this.terminal, this.applicationCursorHidden);
  }

  private cancelCursorReveal(): void {
    if (this.cursorRevealTimer !== undefined) {
      this.dependencies.clearTimeout(this.cursorRevealTimer);
      this.cursorRevealTimer = undefined;
    }
  }

  private observeCursorMode(
    identifier: { readonly prefix: "?"; readonly final: "h" | "l" },
    hidden: boolean
  ): { dispose(): void } {
    return this.terminal.parser.registerCsiHandler(identifier, (params) => {
      if (params.includes(25)) {
        this.applicationCursorHidden = hidden;
      }
      return false;
    });
  }

  private observeCursorReset(
    identifier: { readonly intermediates: "!"; readonly final: "p" }
  ): { dispose(): void } {
    return this.terminal.parser.registerCsiHandler(identifier, () => {
      this.applicationCursorHidden = false;
      return false;
    });
  }

  private observeEscCursorReset(): { dispose(): void } {
    return this.terminal.parser.registerEscHandler({ final: "c" }, () => {
      this.applicationCursorHidden = false;
      return false;
    });
  }
}

const defaultDependencies: XtermTerminalDependencies = {
  createTerminal: (options) => new Terminal(options),
  createFitAddon: () => new FitAddon(),
  createWebglAddon: () => new WebglAddon(),
  setTimeout: (callback, delay) => window.setTimeout(callback, delay),
  clearTimeout: (timer) => window.clearTimeout(timer),
  isCursorHidden: (terminal) => terminalCore(terminal)?.coreService.isCursorHidden ?? false,
  setCursorHidden: (terminal, hidden) => {
    const core = terminalCore(terminal);
    if (core === undefined) {
      return;
    }
    core.coreService.isCursorHidden = hidden;
    const cursorRow = terminal.buffer.active.cursorY;
    terminal.refresh(cursorRow, cursorRow);
  },
  onUserInput: (terminal, listener) =>
    terminalCore(terminal)?.coreService.onUserInput(listener) ?? { dispose: () => undefined }
};

interface XtermInternalCore {
  readonly coreService: {
    isCursorHidden: boolean;
    onUserInput(listener: () => void): { dispose(): void };
  };
}

function terminalCore(terminal: Terminal): XtermInternalCore | undefined {
  return (terminal as unknown as { readonly _core?: XtermInternalCore })._core;
}
