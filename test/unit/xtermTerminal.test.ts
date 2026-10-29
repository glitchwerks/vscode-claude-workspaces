import assert from "node:assert/strict";

import {
  XtermTerminal,
  type XtermTerminalDependencies
} from "../../src/panel/webview/xtermTerminal";

describe("xterm terminal adapter", () => {
  it("exposes genuine user input separately while preserving cursor recovery", () => {
    const harness = createParseHarness();
    const adapter = harness.adapter as XtermTerminal & { onUserInput(listener: () => void): void };
    assert.equal(typeof adapter.onUserInput, "function");
    let userInputs = 0;
    adapter.onUserInput(() => { userInputs += 1; throw new Error("observer failure"); });
    adapter.write("output");
    assert.equal(userInputs, 0);
    assert.doesNotThrow(() => harness.userInput());
    assert.equal(userInputs, 1);
    harness.completeWrite();
    adapter.dispose();
    harness.userInput();
    assert.equal(userInputs, 1);
  });

  it("counts all pending parser writes and resets pressure on disposal", () => {
    const harness = createParseHarness();
    const adapter = harness.adapter as XtermTerminal & { readonly pendingWriteCount: number };
    assert.equal(adapter.pendingWriteCount, 0);
    adapter.write("first");
    adapter.write("second");
    assert.equal(adapter.pendingWriteCount, 2);
    harness.completeWrite();
    assert.equal(adapter.pendingWriteCount, 1);
    adapter.dispose();
    assert.equal(adapter.pendingWriteCount, 0);
    harness.completeWrite();
    assert.equal(adapter.pendingWriteCount, 0);
  });
  for (const userInputBeforeParse of [false, true]) {
    it(`reports parsing once after xterm completes (user input before parse: ${userInputBeforeParse})`, () => {
      const harness = createParseHarness();
      let parsed = 0;
      harness.adapter.write("output", () => { parsed += 1; });
      assert.equal(parsed, 0);
      if (userInputBeforeParse) { harness.userInput(); }
      harness.completeWrite();
      assert.equal(parsed, 1);
      harness.adapter.dispose();
      assert.equal(parsed, 1);
    });
  }

  it("contains a parsing observer failure without interrupting cursor recovery or later output", () => {
    const harness = createParseHarness();
    let parsed = 0;
    harness.adapter.write("first", () => { parsed += 1; throw new Error("observer failed"); });
    assert.doesNotThrow(() => harness.completeWrite());
    assert.equal(parsed, 1);
    assert.equal(harness.scheduled.length, 1);
    harness.adapter.write("second", () => { parsed += 1; });
    harness.completeWrite();
    assert.equal(parsed, 2);
    assert.equal(harness.scheduled.length, 2);
    harness.adapter.dispose();
  });

  it("loads the WebGL renderer once after opening", () => {
    const events: string[] = [];
    let options: Parameters<XtermTerminalDependencies["createTerminal"]>[0] | undefined;
    const fitAddon = { activate: () => undefined, dispose: () => undefined, fit: () => undefined };
    const webLinksAddon = { activate: () => undefined, dispose: () => undefined };
    const rendererAddon = {
      activate: () => undefined,
      dispose: () => undefined,
      onContextLoss: () => ({ dispose: () => undefined })
    };
    let addonLinkHandler: ((event: MouseEvent, uri: string) => void) | undefined;
    const openedLinks: string[] = [];
    const parserDisposable = { dispose: () => undefined };
    const terminal = {
      options: { theme: {} },
      parser: {
        registerCsiHandler: () => parserDisposable,
        registerEscHandler: () => parserDisposable
      },
      open: () => { events.push("open"); },
      loadAddon: (addon: unknown) => {
        events.push(addon === fitAddon ? "load-fit" : addon === webLinksAddon ? "load-links" : "load-renderer");
      },
      write: () => undefined,
      paste: (data: string) => { events.push(`paste:${data}`); },
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
      (_event, uri) => openedLinks.push(uri),
      {
        createTerminal: (
          candidate: Parameters<XtermTerminalDependencies["createTerminal"]>[0]
        ) => { options = candidate; return terminal; },
        createFitAddon: () => fitAddon,
        createWebLinksAddon: (handler: (event: MouseEvent, uri: string) => void) => {
          addonLinkHandler = handler;
          return webLinksAddon;
        },
        createWebglAddon: () => rendererAddon,
        isCursorHidden: () => false,
        setCursorHidden: () => undefined,
        onUserInput: () => parserDisposable
      } as unknown as XtermTerminalDependencies
    );

    assert.equal((adapter as XtermTerminal & { rendererKind: string }).rendererKind, "unopened");
    adapter.open({} as HTMLElement);
    assert.equal((adapter as XtermTerminal & { rendererKind: string }).rendererKind, "webgl");
    adapter.open({} as HTMLElement);
    adapter.paste("first line\nsecond line");
    addonLinkHandler?.({} as MouseEvent, "https://example.com/docs");

    assert.equal(options?.customGlyphs, true);
    assert.deepEqual(events, [
      "load-fit",
      "load-links",
      "open",
      "load-renderer",
      "open",
      "paste:first line\nsecond line"
    ]);
    assert.deepEqual(openedLinks, ["https://example.com/docs"]);
  });

  it("skips zero-area fits", () => {
    // Forwarding either hidden fit lets FitAddon resize xterm to its minimum grid and reflow scrollback.
    const renderedArea = { width: 0, height: 320 };
    let fitCalls = 0;
    const parserDisposable = { dispose: () => undefined };
    const terminal = {
      element: {
        parentElement: {
          getBoundingClientRect: () => renderedArea
        }
      },
      options: { theme: {} },
      parser: {
        registerCsiHandler: () => parserDisposable,
        registerEscHandler: () => parserDisposable
      },
      open: () => undefined,
      loadAddon: () => undefined,
      write: () => undefined,
      paste: () => undefined,
      dispose: () => undefined,
      focus: () => undefined,
      onData: () => parserDisposable,
      onResize: () => parserDisposable,
      hasSelection: () => false,
      getSelection: () => "",
      attachCustomKeyEventHandler: () => undefined
    };
    const adapter = new XtermTerminal(
      { background: "#000", foreground: "#fff", selectionBackground: "#777" },
      { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      undefined,
      {
        createTerminal: () => terminal,
        createFitAddon: () => ({
          activate: () => undefined,
          dispose: () => undefined,
          fit: () => { fitCalls += 1; }
        }),
        createWebLinksAddon: () => ({ activate: () => undefined, dispose: () => undefined }),
        isCursorHidden: () => false,
        setCursorHidden: () => undefined,
        onUserInput: () => parserDisposable
      } as unknown as XtermTerminalDependencies
    );

    adapter.open({} as HTMLElement);
    adapter.fit();
    renderedArea.width = 640;
    renderedArea.height = 0;
    adapter.fit();
    renderedArea.height = 320;
    adapter.fit();

    assert.equal(fitCalls, 1);
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
      undefined,
      {
        createTerminal: () => terminal,
        createFitAddon: () => ({ activate: () => undefined, dispose: () => undefined, fit: () => undefined }),
        createWebLinksAddon: () => ({ activate: () => undefined, dispose: () => undefined }),
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
      undefined,
      {
        createTerminal: () => terminal,
        createFitAddon: () => ({ activate: () => undefined, dispose: () => undefined, fit: () => undefined }),
        createWebLinksAddon: () => ({ activate: () => undefined, dispose: () => undefined }),
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

function createParseHarness(): {
  adapter: XtermTerminal;
  userInput(): void;
  completeWrite(): void;
  scheduled: Array<() => void>;
} {
  const callbacks: Array<() => void> = [];
  const scheduled: Array<() => void> = [];
  let userInput = (): void => undefined;
  const disposable = { dispose: () => undefined };
  const terminal = {
    options: { theme: {} },
    parser: {
      registerCsiHandler: () => disposable,
      registerEscHandler: () => disposable
    },
    loadAddon: () => undefined,
    write: (_data: string, callback: () => void) => { callbacks.push(callback); },
    dispose: () => undefined
  };
  const adapter = new XtermTerminal(
    { background: "#000", foreground: "#fff", selectionBackground: "#777" },
    { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
    undefined,
    {
      createTerminal: () => terminal,
      createFitAddon: () => ({}),
      createWebLinksAddon: () => ({}),
      isCursorHidden: () => false,
      setCursorHidden: () => undefined,
      onUserInput: (_terminal: unknown, listener: () => void) => { userInput = listener; return disposable; },
      setTimeout: (callback: () => void) => { scheduled.push(callback); return scheduled.length; },
      clearTimeout: () => undefined
    } as unknown as XtermTerminalDependencies
  );
  return {
    adapter,
    userInput: () => userInput(),
    completeWrite: () => { assert.ok(callbacks.length > 0); callbacks.shift()!(); },
    scheduled
  };
}
