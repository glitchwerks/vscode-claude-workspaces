import assert from "node:assert/strict";

import { createAttentionNotificationSelectionHandler } from
  "../../src/attention/attentionNotificationSelection";

describe("attention notification selection", () => {
  it("waits for native window attention before moving terminal focus", async () => {
    let releaseAttention!: () => void;
    const attention = new Promise<void>((resolve) => { releaseAttention = resolve; });
    let focused = false;
    const options = {
      sessions: () => [{ id: "session-1", displayName: "API" }],
      isPanelAvailable: () => true,
      revealPanel: async () => undefined,
      activateSession: () => undefined,
      requestWindowAttention: () => attention,
      focusSession: () => { focused = true; },
      showWarning: async () => undefined
    };
    const selecting = createAttentionNotificationSelectionHandler(options)("session-1");
    await Promise.resolve();
    assert.equal(focused, false);
    releaseAttention();
    await selecting;
    assert.equal(focused, true);
  });

  it("explicitly focuses the selected terminal after requesting window attention", async () => {
    const events: string[] = [];
    const options = {
      sessions: () => [{ id: "session-1", displayName: "API" }],
      isPanelAvailable: () => true,
      revealPanel: async () => { events.push("reveal"); },
      activateSession: () => { events.push("activate"); },
      requestWindowAttention: async () => { events.push("window-attention"); },
      focusSession: (sessionId: string) => { events.push(`terminal-focus:${sessionId}`); },
      showWarning: async () => undefined
    };
    await createAttentionNotificationSelectionHandler(options)("session-1");
    assert.deepEqual(events, ["reveal", "activate", "window-attention", "terminal-focus:session-1"]);
  });

  it("does not focus a terminal that closes while window attention is pending", async () => {
    let live = true;
    let focused = false;
    const options = {
      sessions: () => live ? [{ id: "session-1", displayName: "API" }] : [],
      isPanelAvailable: () => true,
      revealPanel: async () => undefined,
      activateSession: () => undefined,
      requestWindowAttention: async () => { live = false; },
      focusSession: () => { focused = true; },
      showWarning: async () => undefined
    };
    await createAttentionNotificationSelectionHandler(options)("session-1");
    assert.equal(focused, false);
  });

  it("reveals the Sessions view and activates the selected live session", async () => {
    const events: string[] = [];
    const select = createAttentionNotificationSelectionHandler({
      sessions: () => [
        { id: "session-1", displayName: "API" },
        { id: "session-2", displayName: "Web" }
      ],
      isPanelAvailable: () => true,
      revealPanel: async () => { events.push("reveal"); },
      activateSession: (sessionId) => { events.push(`activate:${sessionId}`); },
      requestWindowAttention: async () => { events.push("window-attention"); },
      showWarning: async () => undefined
    });

    await select("session-2");

    assert.deepEqual(events, ["reveal", "activate:session-2", "window-attention"]);
  });

  it("does not request window attention when the target closes during panel reveal", async () => {
    let live = true;
    const events: string[] = [];
    const select = createAttentionNotificationSelectionHandler({
      sessions: () => live ? [{ id: "session-1", displayName: "API" }] : [],
      isPanelAvailable: () => true,
      revealPanel: async () => { events.push("reveal"); live = false; },
      activateSession: () => { events.push("activate"); },
      requestWindowAttention: async () => { events.push("window-attention"); },
      showWarning: async () => undefined
    });
    await select("session-1");
    assert.deepEqual(events, ["reveal"]);
  });

  it("names the waiting session when the Sessions view is unavailable", async () => {
    const warnings: string[] = [];
    const activated: string[] = [];
    const select = createAttentionNotificationSelectionHandler({
      sessions: () => [{ id: "session-1", displayName: "Fix release" }],
      isPanelAvailable: () => false,
      revealPanel: async () => undefined,
      activateSession: (sessionId) => activated.push(sessionId),
      requestWindowAttention: async () => { throw new Error("Unavailable views must not focus a window."); },
      showWarning: async (message) => { warnings.push(message); }
    });

    await select("session-1");

    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /Fix release/);
    assert.deepEqual(activated, []);
  });

  it("ignores callbacks for sessions that are no longer live", async () => {
    let revealed = false;
    const select = createAttentionNotificationSelectionHandler({
      sessions: () => [],
      isPanelAvailable: () => true,
      revealPanel: async () => { revealed = true; },
      activateSession: () => undefined,
      requestWindowAttention: async () => { throw new Error("Closed sessions must not focus a window."); },
      showWarning: async () => undefined
    });

    await select("closed-session");

    assert.equal(revealed, false);
  });

  it("retains session selection and surfaces a failed window-focus request", async () => {
    const events: string[] = [];
    const select = createAttentionNotificationSelectionHandler({
      sessions: () => [{ id: "session-1", displayName: "API" }],
      isPanelAvailable: () => true,
      revealPanel: async () => { events.push("reveal"); },
      activateSession: () => { events.push("activate"); },
      requestWindowAttention: async () => { throw new Error("window unavailable"); },
      showWarning: async () => undefined
    });
    await assert.rejects(select("session-1"), /window unavailable/);
    assert.deepEqual(events, ["reveal", "activate"]);
  });
});
