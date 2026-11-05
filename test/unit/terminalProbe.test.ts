import assert from "node:assert/strict";

import { createTerminalProbeTracker, isTerminalProbeTag } from "../../src/diagnostics/terminalProbe";

const FIRST_CAPTURE = "b8cbfba0-af18-4441-b145-4c5dcdd109cf";
const SECOND_CAPTURE = "ad20d65d-4065-43a7-a83e-d84c875e6516";

describe("bounded terminal probe correlation", () => {
  it("does no clock reads or counter reporting while disabled", () => {
    const tracker = createTerminalProbeTracker({
      now: () => { assert.fail("disabled probes must not read the clock"); },
      onCounter: () => { assert.fail("disabled probes must not report counters"); }
    });
    assert.equal(tracker.begin("session"), undefined);
    assert.equal(tracker.complete({ captureId: FIRST_CAPTURE, sequence: 1 }, "session"), undefined);
    tracker.sweep();
    assert.equal(tracker.pendingCount, 0);
  });

  it("measures same-process round trips and consumes each correlation only once", () => {
    let now = 100;
    const tracker = createTerminalProbeTracker({ now: () => now });
    tracker.setCapture(FIRST_CAPTURE);
    const tag = tracker.begin("session")!;
    assert.deepEqual(tag, { captureId: FIRST_CAPTURE, sequence: 1 });
    now = 10_100;
    assert.equal(tracker.complete(tag, "other-session"), undefined);
    assert.equal(tracker.pendingCount, 1);
    assert.equal(tracker.complete(tag, "session"), 10_000);
    assert.equal(tracker.complete(tag, "session"), undefined);
    assert.equal(tracker.pendingCount, 0);
  });

  it("samples at most ten probes per second and expires pending records after thirty seconds", () => {
    let now = 0;
    const counters: Array<[string, number]> = [];
    const tracker = createTerminalProbeTracker({ now: () => now, onCounter: (metric, count) => counters.push([metric, count]) });
    tracker.setCapture(FIRST_CAPTURE);
    const tags = Array.from({ length: 11 }, () => tracker.begin("session"));
    assert.equal(tags.filter(Boolean).length, 10);
    assert.deepEqual(counters, [["sampledOut", 1]]);
    now = 29_999;
    tracker.sweep();
    assert.equal(tracker.pendingCount, 10);
    now = 30_000;
    tracker.sweep();
    assert.equal(tracker.pendingCount, 0);
    assert.deepEqual(counters.at(-1), ["expired", 10]);
    assert.equal(tracker.complete(tags[0]!, "session"), undefined);
    assert.ok(tracker.begin("session"));
  });

  it("never retains more than 128 correlations under sustained missing acknowledgements", () => {
    let now = 0;
    const counters: Array<[string, number]> = [];
    const tracker = createTerminalProbeTracker({ now: () => now, onCounter: (metric, count) => counters.push([metric, count]) });
    tracker.setCapture(FIRST_CAPTURE);
    let accepted = 0;
    for (let second = 0; second < 20; second += 1) {
      now = second * 1_000;
      for (let probe = 0; probe < 10; probe += 1) {
        if (tracker.begin(`session-${second}`)) { accepted += 1; }
        assert.ok(tracker.pendingCount <= 128);
      }
    }
    assert.equal(accepted, 128);
    assert.equal(tracker.pendingCount, 128);
    assert.equal(counters.filter(([metric]) => metric === "dropped").reduce((sum, [, count]) => sum + count, 0), 72);
  });

  it("reserves half the sampling budget for the active terminal under background output", () => {
    const options = { now: () => 0, activeSessionId: () => "active" };
    const tracker = createTerminalProbeTracker(options);
    tracker.setCapture(FIRST_CAPTURE);
    const background = Array.from({ length: 100 }, () => tracker.begin("background"));
    const active = Array.from({ length: 10 }, () => tracker.begin("active"));
    assert.equal(background.filter(Boolean).length, 5);
    assert.equal(active.filter(Boolean).length, 5);
    assert.equal(tracker.pendingCount, 10);
  });

  it("admits an active-session correlation when background entries fill pending storage", () => {
    let now = 0;
    let selected = false;
    const options = { now: () => now, activeSessionId: () => selected ? "active" : undefined };
    const tracker = createTerminalProbeTracker(options);
    tracker.setCapture(FIRST_CAPTURE);
    const first = tracker.begin("background")!;
    for (let index = 1; index < 128; index += 1) {
      now = Math.floor(index / 10) * 1_000;
      assert.ok(tracker.begin("background"));
    }
    selected = true;
    const active = tracker.begin("active");
    assert.ok(active);
    assert.equal(tracker.pendingCount, 128);
    assert.equal(tracker.complete(first, "background"), undefined);
    assert.equal(tracker.complete(active, "active"), 0);
  });

  it("forgets exited sessions and rejects acknowledgements from stopped or replaced captures", () => {
    const tracker = createTerminalProbeTracker({ now: () => 0 });
    tracker.setCapture(FIRST_CAPTURE);
    const exited = tracker.begin("exited")!;
    const old = tracker.begin("live")!;
    tracker.forgetSession("exited");
    assert.equal(tracker.pendingCount, 1);
    assert.equal(tracker.complete(exited, "exited"), undefined);
    tracker.setCapture(SECOND_CAPTURE);
    const current = tracker.begin("live")!;
    assert.equal(tracker.complete(old, "live"), undefined);
    assert.equal(tracker.pendingCount, 1);
    assert.equal(tracker.complete(current, "live"), 0);
    tracker.begin("live");
    tracker.setCapture(undefined);
    assert.equal(tracker.pendingCount, 0);
    assert.equal(tracker.begin("live"), undefined);
  });

  it("contains counter observer failures without interfering with correlation", () => {
    const tracker = createTerminalProbeTracker({ now: () => 0, onCounter: () => { throw new Error("private failure"); } });
    tracker.setCapture(FIRST_CAPTURE);
    const first = tracker.begin("session")!;
    assert.doesNotThrow(() => { for (let index = 0; index < 20; index += 1) { tracker.begin("session"); } });
    assert.equal(tracker.complete(first, "session"), 0);
  });

  it("accepts only exact canonical capture tags with positive safe sequences", () => {
    assert.equal(isTerminalProbeTag({ captureId: FIRST_CAPTURE, sequence: 1 }), true);
    for (const value of [
      null, [], { captureId: FIRST_CAPTURE, sequence: 0 },
      { captureId: FIRST_CAPTURE, sequence: 1.5 }, { captureId: FIRST_CAPTURE, sequence: Infinity },
      { captureId: FIRST_CAPTURE, sequence: Number.MAX_SAFE_INTEGER + 1 },
      { captureId: "private session", sequence: 1 }, { captureId: FIRST_CAPTURE, sequence: 1, text: "private prompt" },
      Object.assign(Object.create({ captureId: FIRST_CAPTURE, sequence: 1 }) as object, { text: "private prompt", path: "private path" })
    ]) {
      assert.equal(isTerminalProbeTag(value), false);
    }
  });
});
