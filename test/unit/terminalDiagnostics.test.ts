import assert from "node:assert/strict";

import {
  createTerminalDiagnosticCapture,
  type TerminalDiagnosticMessage
} from "../../src/diagnostics/terminalDiagnostics";

describe("bounded terminal diagnostic capture", () => {
  it("merges frontend histograms into fingerprinted bounded host windows", () => {
    const harness = createHarness();
    harness.capture.toggle();
    const capture = harness.capture as typeof harness.capture & { merge(frame: unknown): void };
    assert.equal(typeof capture.merge, "function");
    capture.merge({ sessions: [{ sessionId: "private-session", metrics: [{
      metric: "renderMs", count: 2, total: 25, maximum: 20, buckets: [0, 1, 0, 1, 0, 0, 0, 0]
    }] }], omittedSamples: 3 });
    harness.advance(1_000);
    const window = harness.windows()[0]!;
    assert.deepEqual(window.sessions.find((entry) => entry.session !== null)?.metrics, [{
      metric: "renderMs", count: 2, total: 25, maximum: 20, buckets: [0, 1, 0, 1, 0, 0, 0, 0]
    }]);
    assert.equal(window.omittedSamples, 3);
    assert.ok(!JSON.stringify(window).includes("private-session"));
    harness.capture.dispose();
  });
  it("does no diagnostic work or scheduling while disabled", () => {
    const harness = createHarness();
    harness.capture.record("inputQueueMs", 10, "private-session");
    assert.equal(harness.capture.active, false);
    assert.equal(harness.capture.captureId, undefined);
    assert.equal(harness.pending.size, 0);
    assert.deepEqual(harness.lines, []);
    harness.capture.dispose();
  });

  it("aggregates a burst into one time window and fingerprints session identifiers", () => {
    const harness = createHarness();
    harness.capture.toggle();
    for (let index = 0; index < 20_000; index += 1) {
      harness.capture.record("inputQueueMs", 5, "private-session");
    }
    assert.equal(harness.lines.length, 1);
    harness.advance(1_000);
    const window = harness.windows()[0]!;
    assert.ok(window, "a completed aggregation window is emitted");
    assert.equal(window.elapsedMs, 1_000);
    const session = window.sessions.find((entry) => entry.session !== null)!;
    assert.match(session.session!, /^[a-f0-9]{16}$/u);
    assert.deepEqual(session.metrics, [{
      metric: "inputQueueMs", count: 20_000, total: 100_000, maximum: 5,
      buckets: [0, 20_000, 0, 0, 0, 0, 0, 0]
    }]);
    assert.ok(!JSON.stringify(harness.lines).includes("private-session"));
    assert.equal(harness.capture.active, true);
    harness.capture.dispose();
  });

  it("bounds distinct session aggregation and admits the active session under pressure", () => {
    const harness = createHarness();
    harness.capture.toggle();
    for (let index = 0; index < 10_000; index += 1) {
      harness.capture.record("outputCharacters", 1, `background-${index}`);
    }
    harness.capture.record("inputQueueMs", 9, "active-session");
    harness.advance(1_000);
    const window = harness.windows()[0]!;
    assert.ok(window, "a completed aggregation window is emitted");
    assert.equal(window.sessions.filter((entry) => entry.session !== null).length, 16);
    assert.equal(window.omittedSamples, 9_985);
    assert.ok(window.sessions.some((entry) => entry.metrics.some((metric) => metric.metric === "inputQueueMs")));
    harness.capture.dispose();
  });

  it("rejects unrecognized metrics, non-finite values and extra payload fields", () => {
    const harness = createHarness();
    harness.capture.toggle();
    const record = harness.capture.record as (metric: string, value: unknown, sessionId?: string) => void;
    record("private prompt", 2, "private-session");
    for (const value of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "private answer", { text: "private key" }]) {
      record("inputQueueMs", value, "private-session");
    }
    harness.advance(1_000);
    assert.ok(harness.windows()[0], "a completed aggregation window is emitted");
    const text = JSON.stringify(harness.lines);
    for (const privateText of ["private prompt", "private-session", "private answer", "private key"]) {
      assert.ok(!text.includes(privateText));
    }
    assert.equal(harness.windows()[0]!.sessions.some((session) => session.session !== null), false);
    harness.capture.dispose();
  });

  it("stops at 256 aggregate windows without allowing bursts to exhaust the capture", () => {
    const harness = createHarness();
    harness.capture.toggle();
    for (let index = 0; index < 300; index += 1) { harness.advance(1_000); }
    assert.equal(harness.windows().length, 256);
    assert.equal(harness.capture.active, false);
    assert.equal(harness.pending.size, 0);
    assert.deepEqual(harness.lines.at(-1), { capture: "stopped", reason: "limit", records: 256 });
  });

  it("labels host event-loop gaps independently of frontend clocks", () => {
    const harness = createHarness();
    harness.capture.toggle();
    harness.advance(2_500);
    assert.deepEqual(harness.windows()[0]?.sessions.find((entry) => entry.session === null)?.metrics, [{
      metric: "hostEventLoopGapMs", count: 1, total: 1_500, maximum: 1_500,
      buckets: [0, 0, 0, 0, 0, 0, 1, 0]
    }]);
    harness.capture.dispose();
  });

  it("keeps numeric aggregates finite when counters exceed the safe sum range", () => {
    const harness = createHarness();
    harness.capture.toggle();
    harness.capture.record("outputCharacters", Number.MAX_SAFE_INTEGER, "private-session");
    harness.capture.record("outputCharacters", Number.MAX_SAFE_INTEGER, "private-session");
    harness.advance(1_000);
    const metric = harness.windows()[0]?.sessions.find((entry) => entry.session !== null)?.metrics[0];
    assert.deepEqual(metric, {
      metric: "outputCharacters", count: 2, total: Number.MAX_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER,
      buckets: [0, 0, 0, 0, 0, 0, 0, 2]
    });
    harness.capture.dispose();
  });

  it("expires after five minutes even when the event loop has stalled", () => {
    const harness = createHarness();
    harness.capture.toggle();
    harness.advance(300_000);
    assert.equal(harness.capture.active, false);
    assert.equal(harness.pending.size, 0);
    assert.equal(harness.lines.at(-1)?.capture, "stopped");
    assert.deepEqual(harness.lines.at(-1), { capture: "stopped", reason: "timeout", records: 0 });
  });

  it("cancels old callbacks on manual stop, restart and disposal", () => {
    const harness = createHarness();
    harness.capture.toggle();
    const firstId = harness.capture.captureId;
    const oldCallbacks = [...harness.pending.values()].map((timer) => timer.callback);
    harness.capture.record("inputQueueMs", 7, "private-session");
    harness.capture.toggle();
    assert.equal(harness.windows().length, 1);
    assert.equal(harness.pending.size, 0);
    harness.capture.toggle();
    assert.notEqual(harness.capture.captureId, firstId);
    const length = harness.lines.length;
    for (const callback of oldCallbacks) { callback(); }
    assert.equal(harness.lines.length, length);
    assert.equal(harness.capture.active, true);
    harness.capture.dispose();
    assert.equal(harness.pending.size, 0);
    harness.capture.toggle();
    assert.equal(harness.capture.active, false);
    assert.deepEqual(harness.lines.at(-1), { capture: "stopped", reason: "disposed", records: 0 });
  });

  it("contains output failures while retaining its limits and lifecycle", () => {
    const harness = createHarness(() => { throw new Error("private failure"); });
    assert.doesNotThrow(() => {
      harness.capture.toggle();
      harness.capture.record("inputQueueMs", 3, "private-session");
      harness.advance(1_000);
      harness.capture.dispose();
    });
    assert.equal(harness.pending.size, 0);
    assert.equal(harness.capture.active, false);
  });
});

function createHarness(output?: (message: TerminalDiagnosticMessage) => void) {
  let now = 0;
  let nextTimer = 0;
  const pending = new Map<number, { due: number; callback: () => void }>();
  const lines: TerminalDiagnosticMessage[] = [];
  const capture = createTerminalDiagnosticCapture(output ?? ((message) => lines.push(message)), {
    now: () => now,
    activeSessionId: () => "active-session",
    schedule: (callback, milliseconds) => {
      const id = ++nextTimer;
      pending.set(id, { due: now + milliseconds, callback });
      return () => { pending.delete(id); };
    }
  });
  return {
    capture, lines, pending,
    windows: () => lines.filter((line) => line.capture === "window"),
    advance: (milliseconds: number) => {
      now += milliseconds;
      for (const [id, timer] of [...pending]) {
        if (timer.due <= now && pending.delete(id)) { timer.callback(); }
      }
    }
  };
}
