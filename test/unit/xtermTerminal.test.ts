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
    const terminal = {
      options: { theme: {} },
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
        createWebglAddon: () => webglAddon
      } as unknown as XtermTerminalDependencies
    );

    adapter.open({} as HTMLElement);
    adapter.open({} as HTMLElement);

    assert.equal(options?.customGlyphs, true);
    assert.deepEqual(events, ["load-fit", "open", "load-webgl", "open"]);
  });
});
