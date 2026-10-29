import assert from "node:assert/strict";
import { createTerminalMetricWindow } from "../../src/diagnostics/terminalMetricWindow";

describe("terminal numeric window merging", () => {
  it("merges histograms without replacing count distributions with their maxima", () => {
    const window = createTerminalMetricWindow();
    window.record("renderMs", 1, "session");
    const target = window as typeof window & { merge(frame: unknown): void };
    assert.equal(typeof target.merge, "function");
    target.merge({ sessions: [{ sessionId: "session", metrics: [{
      metric: "renderMs", count: 2, total: 25, maximum: 20, buckets: [0, 1, 0, 1, 0, 0, 0, 0]
    }] }], omittedSamples: 4 });
    assert.deepEqual(window.drain(), { sessions: [{ sessionId: "session", metrics: [{
      metric: "renderMs", count: 3, total: 26, maximum: 20, buckets: [1, 1, 0, 1, 0, 0, 0, 0]
    }] }], omittedSamples: 4 });
    assert.equal(window.hasData, false);
  });

  it("rejects a malformed frame atomically rather than merging its valid prefix", () => {
    const window = createTerminalMetricWindow();
    const target = window as typeof window & { merge(frame: unknown): void };
    assert.equal(typeof target.merge, "function");
    target.merge({ sessions: [{ sessionId: "private", metrics: [
      { metric: "renderMs", count: 1, total: 5, maximum: 5, buckets: [0, 1, 0, 0, 0, 0, 0, 0] },
      { metric: "private prompt", count: 1, total: 5, maximum: 5, buckets: [0, 1, 0, 0, 0, 0, 0, 0] }
    ] }], omittedSamples: 0 });
    assert.equal(window.hasData, false);
  });
});
