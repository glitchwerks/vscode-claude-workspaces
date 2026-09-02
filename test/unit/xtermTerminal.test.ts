import assert from "node:assert/strict";

import {
  XtermTerminal,
  type XtermTerminalDependencies
} from "../../src/panel/webview/xtermTerminal";

describe("xterm terminal adapter", () => {
  it("opens before activating WebGL custom glyphs and activates them only once", () => {
    const events: string[] = [];
    let options: Parameters<XtermTerminalDependencies["createTerminal"]>[0] | undefined;
    const fitAddon = { activate: () => undefined, dispose: () => undefined, fit: () => undefined };
    const webglAddon = {
      activate: () => undefined,
      dispose: () => undefined,
      onContextLoss: () => ({ dispose: () => undefined })
    };
    const parserDisposable = { dispose: () => undefined };
    const terminal = {
      options: { theme: {} },
      parser: {
        registerCsiHandler: () => parserDisposable,
        registerEscHandler: () => parserDisposable
      },
      open: () => { events.push("open"); },
      loadAddon: (addon: unknown) => {
        events.push(addon === fitAddon ? "load-fit" : "load-webgl");
      },
      write: () => undefined,
      dispose: () => undefined,
      focus: () => undefined,
      onData: () => ({ dispose: () => undefined }),
      onResize: () => ({ dispose: () => undefined }),
      hasSelection: () => false,
      getSelection: () => "",
      attachCustomKeyEventHandler: () => undefined
    };
    const adapter = new XtermTerminal(
      { background: "#000", foreground: "#fff", selectionBackground: "#777" },
      { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      {
        createTerminal: (
          candidate: Parameters<XtermTerminalDependencies["createTerminal"]>[0]
        ) => { options = candidate; return terminal; },
        createFitAddon: () => fitAddon,
        createWebglAddon: () => webglAddon,
        isCursorHidden: () => false,
        setCursorHidden: () => undefined,
        onUserInput: () => parserDisposable
      } as unknown as XtermTerminalDependencies
    );

    adapter.open({} as HTMLElement);
    adapter.open({} as HTMLElement);

    assert.equal(options?.customGlyphs, true);
    assert.deepEqual(events, ["load-fit", "open", "load-webgl", "open"]);
  });

  it("suppresses the cursor across rapid output and restores it after output settles", () => {
    const scheduled: Array<() => void> = [];
    const cancelled = new Set<number>();
    const writes: string[] = [];
    const cursorHidden: boolean[] = [];
    const csiHandlers = new Map<string, (params: (number | number[])[]) => boolean>();
    let inputListener: ((data: string) => void) | undefined;
    let userInputListener: (() => void) | undefined;
    const receivedInput: string[] = [];
    const theme = { background: "#102030", foreground: "#f0f0f0", selectionBackground: "#777" };
    const parserDisposable = { dispose: () => undefined };
    const terminal = {
      options: { theme },
      parser: {
        registerCsiHandler: (
          identifier: { prefix?: string; intermediates?: string; final: string },
          handler: (params: (number | number[])[]) => boolean
        ) => {
          csiHandlers.set(`${identifier.prefix ?? ""}${identifier.intermediates ?? ""}${identifier.final}`, handler);
          return parserDisposable;
        },
        registerEscHandler: () => parserDisposable
      },
      open: () => undefined,
      loadAddon: () => undefined,
      write: (data: string, callback?: () => void) => {
        writes.push(data);
        callback?.();
      },
      dispose: () => undefined,
      focus: () => undefined,
      onData: (listener: (data: string) => void) => {
        inputListener = listener;
        return { dispose: () => undefined };
      },
      onResize: () => ({ dispose: () => undefined }),
      hasSelection: () => false,
      getSelection: () => "",
      attachCustomKeyEventHandler: () => undefined
    };
    const adapter = new XtermTerminal(
      theme,
      { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      {
        createTerminal: () => terminal,
        createFitAddon: () => ({ activate: () => undefined, dispose: () => undefined, fit: () => undefined }),
        createWebglAddon: () => ({
          activate: () => undefined,
          dispose: () => undefined,
          onContextLoss: () => ({ dispose: () => undefined })
        }),
        setTimeout: (callback: () => void) => {
          scheduled.push(callback);
          return scheduled.length;
        },
        clearTimeout: (timer: number) => { cancelled.add(timer); },
        isCursorHidden: () => false,
        setCursorHidden: (_terminal: unknown, hidden: boolean) => { cursorHidden.push(hidden); },
        onUserInput: (_terminal: unknown, listener: () => void) => {
          userInputListener = listener;
          return parserDisposable;
        }
      } as unknown as XtermTerminalDependencies
    );
    adapter.onData((data) => { receivedInput.push(data); });

    adapter.write("first chunk");
    adapter.write("second chunk");

    assert.strictEqual(terminal.options.theme, theme);
    assert.deepEqual(writes, ["first chunk", "second chunk"]);
    assert.deepEqual(cursorHidden, [true, true, true, true]);
    assert.deepEqual([...cancelled], [1]);

    scheduled[0]?.();
    assert.deepEqual(cursorHidden, [true, true, true, true]);

    assert.equal(csiHandlers.get("?l")?.([25]), false);
    scheduled[1]?.();
    assert.deepEqual(cursorHidden, [true, true, true, true, true]);

    assert.equal(csiHandlers.get("?h")?.([25]), false);
    adapter.write("third chunk");
    userInputListener?.();
    inputListener?.("escape");

    assert.strictEqual(terminal.options.theme, theme);
    assert.deepEqual(writes, ["first chunk", "second chunk", "third chunk"]);
    assert.deepEqual(cursorHidden, [true, true, true, true, true, true, true, false]);
    assert.deepEqual(receivedInput, ["escape"]);
    assert.deepEqual([...cancelled], [1, 3]);
  });

  it("keeps the cursor suppressed for terminal replies and reveals it for genuine user input", () => {
    const writeCallbacks: Array<() => void> = [];
    const scheduled: Array<() => void> = [];
    const cursorHidden: boolean[] = [];
    let dataListener: ((data: string) => void) | undefined;
    let userInputListener: (() => void) | undefined;
    const parserDisposable = { dispose: () => undefined };
    const terminal = {
      options: { theme: {} },
      parser: {
        registerCsiHandler: () => parserDisposable,
        registerEscHandler: () => parserDisposable
      },
      open: () => undefined,
      loadAddon: () => undefined,
      write: (_data: string, callback?: () => void) => {
        if (callback !== undefined) {
          writeCallbacks.push(callback);
        }
      },
      dispose: () => undefined,
      focus: () => undefined,
      onData: (listener: (data: string) => void) => {
        dataListener = listener;
        return { dispose: () => undefined };
      },
      onResize: () => ({ dispose: () => undefined }),
      hasSelection: () => false,
      getSelection: () => "",
      attachCustomKeyEventHandler: () => undefined
    };
    const adapter = new XtermTerminal(
      { background: "#000", foreground: "#fff", selectionBackground: "#777" },
      { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      {
        createTerminal: () => terminal,
        createFitAddon: () => ({ activate: () => undefined, dispose: () => undefined, fit: () => undefined }),
        createWebglAddon: () => ({
          activate: () => undefined,
          dispose: () => undefined,
          onContextLoss: () => ({ dispose: () => undefined })
        }),
        setTimeout: (callback: () => void) => {
          scheduled.push(callback);
          return scheduled.length;
        },
        clearTimeout: () => undefined,
        isCursorHidden: () => false,
        setCursorHidden: (_terminal: unknown, hidden: boolean) => { cursorHidden.push(hidden); },
        onUserInput: (_terminal: unknown, listener: () => void) => {
          userInputListener = listener;
          return parserDisposable;
        }
      } as unknown as XtermTerminalDependencies
    );
    const forwardedData: string[] = [];
    adapter.onData((data) => { forwardedData.push(data); });

    adapter.write("first chunk");
    adapter.write("second chunk");
    dataListener?.("\u001b[0n");

    assert.deepEqual(forwardedData, ["\u001b[0n"]);
    assert.deepEqual(cursorHidden, [true, true]);

    writeCallbacks[0]?.();
    writeCallbacks[1]?.();
    assert.equal(scheduled.length, 1);
    assert.deepEqual(cursorHidden, [true, true, true, true]);

    userInputListener?.();
    assert.deepEqual(cursorHidden, [true, true, true, true, false]);
  });
});
