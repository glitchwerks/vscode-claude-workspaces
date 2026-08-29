import assert from "node:assert/strict";

import {
  decodeHostMessage,
  decodeWebviewMessage,
  type HostMessage,
  type WebviewMessage
} from "../../src/panel/protocol";

const session = {
  id: "session-alpha",
  rootId: "file:///workspace/alpha",
  displayName: "alpha 1",
  ordinalWithinRoot: 1,
  state: "running" as const,
  launchedImportIds: ["file:///workspace/shared"],
  launchedAt: 1234
};

describe("panel protocol", () => {
  it("accepts every closed webview-to-host message shape", () => {
    const messages: readonly WebviewMessage[] = [
      { type: "ready" },
      { type: "input", sessionId: "session-alpha", data: "hello" },
      { type: "resize", sessionId: "session-alpha", columns: 120, rows: 40 },
      { type: "selectSession", sessionId: "session-alpha" },
      { type: "newSession" },
      { type: "newInFolder" },
      { type: "closeSession", sessionId: "session-alpha" },
      { type: "restartFresh", sessionId: "session-alpha" },
      { type: "previousSession" },
      { type: "nextSession" },
      { type: "configureWorkspace" }
    ];

    for (const message of messages) {
      assert.deepEqual(decodeWebviewMessage(message), { ok: true, value: message });
    }
  });

  it("accepts every closed host-to-webview message shape", () => {
    const messages: readonly HostMessage[] = [
      { type: "hydrate", sessions: [session], activeSessionId: "session-alpha" },
      { type: "sessionAdded", session },
      { type: "sessionUpdated", session },
      { type: "sessionRemoved", sessionId: "session-alpha" },
      { type: "sessionData", sessionId: "session-alpha", data: "Claude ready\\r\\n" },
      { type: "activeSessionChanged", activeSessionId: "session-alpha" },
      { type: "activeSessionChanged", activeSessionId: undefined }
    ];

    for (const message of messages) {
      assert.deepEqual(decodeHostMessage(message), { ok: true, value: message });
    }
  });

  it("rejects unknown message types and privileged excess fields", () => {
    const unknown = decodeWebviewMessage({ type: "openTerminal", command: "cmd.exe" });
    const privileged = decodeWebviewMessage({
      type: "newSession",
      command: "cmd.exe"
    });

    assert.equal(unknown.ok, false);
    assert.equal(privileged.ok, false);
  });

  it("rejects malformed session input and dimensions", () => {
    const invalidMessages = [
      { type: "input", sessionId: "", data: "hello" },
      { type: "input", sessionId: "session-alpha", data: 7 },
      { type: "resize", sessionId: "session-alpha", columns: -1, rows: 40 },
      { type: "resize", sessionId: "session-alpha", columns: 120, rows: -1 },
      { type: "resize", sessionId: "session-alpha", columns: 0, rows: 40 },
      { type: "resize", sessionId: "session-alpha", columns: 120, rows: 0 },
      { type: "resize", sessionId: "session-alpha", columns: 120.5, rows: 40 },
      { type: "resize", sessionId: "session-alpha", columns: 120, rows: 40.5 },
      { type: "resize", sessionId: "session-alpha", columns: Number.NaN, rows: 40 },
      { type: "resize", sessionId: "session-alpha", columns: Infinity, rows: 40 },
      { type: "resize", sessionId: "session-alpha", columns: 1001, rows: 40 },
      { type: "resize", sessionId: "session-alpha", columns: 120, rows: 1001 },
      { type: "selectSession", sessionId: "" },
      { type: "closeSession", sessionId: "" },
      { type: "restartFresh", sessionId: "" }
    ];

    for (const message of invalidMessages) {
      const result = decodeWebviewMessage(message);
      assert.equal(result.ok, false, JSON.stringify(message));
    }
  });

  it("rejects sparse session arrays in hydration messages", () => {
    const sparseSessions = new Array(1);
    const result = decodeHostMessage({
      type: "hydrate",
      sessions: sparseSessions,
      activeSessionId: undefined
    });

    assert.equal(result.ok, false);
  });

  it("rejects sparse launched import id arrays in hydration messages", () => {
    const sparseImportIds = new Array(1);
    const result = decodeHostMessage({
      type: "hydrate",
      sessions: [{ ...session, launchedImportIds: sparseImportIds }],
      activeSessionId: "session-alpha"
    });

    assert.equal(result.ok, false);
  });
});
