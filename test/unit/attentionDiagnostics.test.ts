import assert from "node:assert/strict";

import { createAttentionDiagnosticCapture, type AttentionDiagnosticRecord } from "../../src/attention/attentionDiagnostics";

describe("temporary attention diagnostic capture", () => {
  const record = { event: "UserPromptSubmit" } as AttentionDiagnosticRecord;
  it("is off by default and stops after 256 records", () => {
    const lines: unknown[] = [];
    const capture = createAttentionDiagnosticCapture((value) => lines.push(value));
    capture.record(record);
    assert.equal(lines.length, 0);
    capture.toggle();
    for (let index = 0; index < 300; index += 1) { capture.record(record); }
    assert.equal(lines.filter((line) => line === record).length, 256);
    assert.deepEqual(lines.at(-1), { capture: "stopped", reason: "limit", records: 256 });
    assert.equal(capture.active, false);
    capture.dispose();
  });
  it("stops after five minutes, manual stop, and disposal without leaking timers", () => {
    const lines: unknown[] = [];
    let callback: (() => void) | undefined;
    let clears = 0;
    const capture = createAttentionDiagnosticCapture((value) => lines.push(value), {
      schedule: (listener, delay) => { assert.equal(delay, 300_000); callback = listener; return () => { clears += 1; }; }
    });
    capture.toggle();
    callback!();
    assert.deepEqual(lines.at(-1), { capture: "stopped", reason: "timeout", records: 0 });
    capture.toggle();
    capture.toggle();
    capture.toggle();
    capture.dispose();
    capture.toggle();
    capture.record(record);
    assert.equal(capture.active, false);
    assert.equal(clears, 3);
    assert.deepEqual(lines.at(-1), { capture: "stopped", reason: "disposed", records: 0 });
  });
  it("contains output failures and continues enforcing the bound", () => {
    const capture = createAttentionDiagnosticCapture(() => { throw new Error("private failure"); });
    assert.doesNotThrow(() => { capture.toggle(); capture.record(record); capture.toggle(); capture.dispose(); });
  });
});
