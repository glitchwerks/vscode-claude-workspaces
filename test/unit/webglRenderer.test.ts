import assert from "node:assert/strict";

import {
  activateWebglRenderer,
  type WebglRendererAddon
} from "../../src/panel/webview/webglRenderer";

describe("xterm WebGL renderer", () => {
  it("loads custom glyph rendering and falls back after context loss", () => {
    let contextLoss: (() => void) | undefined;
    let disposeCalls = 0;
    const addon: WebglRendererAddon = {
      activate: () => undefined,
      onContextLoss: (listener) => {
        contextLoss = listener;
        return { dispose: () => undefined };
      },
      dispose: () => { disposeCalls += 1; }
    };
    let loaded: unknown;

    activateWebglRenderer({ loadAddon: (candidate) => { loaded = candidate; } }, () => addon);
    contextLoss?.();

    assert.equal(loaded, addon);
    assert.equal(disposeCalls, 1);
  });

  it("keeps the DOM renderer when WebGL activation fails", () => {
    let disposeCalls = 0;
    const addon: WebglRendererAddon = {
      activate: () => undefined,
      onContextLoss: () => ({ dispose: () => undefined }),
      dispose: () => { disposeCalls += 1; }
    };

    assert.doesNotThrow(() => activateWebglRenderer({
      loadAddon: () => { throw new Error("WebGL is unavailable"); }
    }, () => addon));
    assert.equal(disposeCalls, 1);
  });
});
