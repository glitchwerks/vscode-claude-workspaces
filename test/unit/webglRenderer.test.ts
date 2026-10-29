import assert from "node:assert/strict";

import {
  activateWebglRenderer,
  type WebglRendererAddon
} from "../../src/panel/webview/webglRenderer";

describe("xterm WebGL renderer", () => {
  it("observes availability and context loss without allowing diagnostic failures to change fallback", () => {
    const states: string[] = [];
    let contextLoss: (() => void) | undefined;
    let disposals = 0;
    const addon: WebglRendererAddon = { activate: () => undefined,
      onContextLoss: (listener) => { contextLoss = listener; return { dispose: () => undefined }; },
      dispose: () => { disposals += 1; } };
    const activate = activateWebglRenderer as (terminal: { loadAddon(addon: unknown): void }, create: () => WebglRendererAddon,
      observer: (state: "webgl" | "default") => void) => void;
    activate({ loadAddon: () => undefined }, () => addon, (state) => { states.push(state); throw new Error("observer failure"); });
    assert.deepEqual(states, ["webgl"]);
    assert.equal(disposals, 0);
    contextLoss?.();
    assert.deepEqual(states, ["webgl", "default"]);
    assert.equal(disposals, 1);
    states.length = 0;
    activate({ loadAddon: () => { throw new Error("no GPU"); } }, () => addon, (state) => { states.push(state); });
    assert.deepEqual(states, ["default"]);
  });
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

  it("falls back without throwing when addon activation fails", () => {
    let disposeCalls = 0;
    const addon: WebglRendererAddon = {
      activate: () => undefined,
      onContextLoss: () => ({ dispose: () => undefined }),
      dispose: () => { disposeCalls += 1; }
    };

    assert.doesNotThrow(() => {
      activateWebglRenderer({ loadAddon: () => { throw new Error("WebGL unavailable"); } }, () => addon);
    });

    assert.equal(disposeCalls, 1);
  });
});
