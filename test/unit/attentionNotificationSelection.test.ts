import assert from "node:assert/strict";

import { createAttentionNotificationSelectionHandler } from
  "../../src/attention/attentionNotificationSelection";

describe("attention notification selection", () => {
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
      showWarning: async () => undefined
    });

    await select("session-2");

    assert.deepEqual(events, ["reveal", "activate:session-2"]);
  });

  it("names the waiting session when the Sessions view is unavailable", async () => {
    const warnings: string[] = [];
    const activated: string[] = [];
    const select = createAttentionNotificationSelectionHandler({
      sessions: () => [{ id: "session-1", displayName: "Fix release" }],
      isPanelAvailable: () => false,
      revealPanel: async () => undefined,
      activateSession: (sessionId) => activated.push(sessionId),
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
      showWarning: async () => undefined
    });

    await select("closed-session");

    assert.equal(revealed, false);
  });
});
