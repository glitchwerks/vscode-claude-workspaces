import assert from "node:assert/strict";

import {
  decodeHostMessage,
  decodeWebviewMessage,
  type HostMessage,
  type WebviewMessage
} from "../../src/panel/protocol";

const session = {
  id: "session-alpha",
  claudeSessionId: null,
  rootId: "file:///workspace/alpha",
  displayName: "alpha 1",
  ordinalWithinRoot: 1,
  state: "running" as const,
  launchedImportIds: ["file:///workspace/shared"],
  launchedAddDirPaths: ["C:\\workspace\\shared"],
  launchedAt: 1234
};

describe("panel protocol", () => {
  const resumable = {
    claudeSessionId: "11111111-1111-4111-8111-111111111111",
    displayName: "Saved session", rootId: "file:///alpha", rootLabel: "Alpha",
    rootPath: "C:/alpha", createdAt: "2026-09-01T10:00:00.000Z",
    lastLaunchedAt: "2026-09-02T10:00:00.000Z"
  };

  it("accepts only a canonical Claude UUID for the exact resume intent", () => {
    const message = { type: "resumeSession", claudeSessionId: resumable.claudeSessionId };
    assert.deepEqual(decodeWebviewMessage(message), { ok: true, value: message });
    for (const invalid of [
      { type: "resumeSession" },
      ...[null, 7, "", "session-alpha", "123E4567-e89b-42d3-a456-426614174000",
        "11111111-1111-7111-8111-111111111111"].map((claudeSessionId) => ({
        ...message, claudeSessionId
      })),
      ...["rootId", "rootPath", "command", "args", "sessionId"].map((key) => ({
        ...message, [key]: "untrusted"
      }))
    ]) {
      assert.equal(decodeWebviewMessage(invalid).ok, false, JSON.stringify(invalid));
    }
  });

  it("validates complete resumable arrays in hydration and incremental messages", () => {
    for (const sessions of [[], [resumable]]) {
      for (const message of [
        { type: "hydrate", sessions: [], resumableSessions: sessions,
          activeSessionId: undefined,
          terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 } },
        { type: "resumableSessionsChanged", sessions }
      ]) {
        assert.deepEqual(decodeHostMessage(message), { ok: true, value: message });
      }
    }
  });

  it("rejects calendar-invalid days in resumable timestamps", () => {
    for (const timestamp of [
      "2026-02-30T00:00:00Z",
      "2025-04-31T23:59:59.125-04:00"
    ]) {
      const message = {
        type: "resumableSessionsChanged",
        sessions: [{ ...resumable, lastLaunchedAt: timestamp }]
      };

      assert.equal(decodeHostMessage(message).ok, false, timestamp);
    }
  });

  it("rejects out-of-range time and offset fields in resumable timestamps", () => {
    for (const timestamp of [
      "2026-09-07T24:00:00Z",
      "2026-09-07T23:60:00Z",
      "2026-09-07T23:59:60Z",
      "2026-09-07T23:59:59+24:00",
      "2026-09-07T23:59:59+23:60"
    ]) {
      const message = {
        type: "resumableSessionsChanged",
        sessions: [{ ...resumable, lastLaunchedAt: timestamp }]
      };

      assert.equal(decodeHostMessage(message).ok, false, timestamp);
    }
  });

  it("accepts calendar-valid offset resumable timestamps", () => {
    const offsetSession = {
      ...resumable,
      createdAt: "2024-02-29T23:59:59.125+05:30",
      lastLaunchedAt: "2026-09-02T23:59:59.123456+23:59"
    };
    const message = { type: "resumableSessionsChanged", sessions: [offsetSession] };

    assert.deepEqual(decodeHostMessage(message), { ok: true, value: message });
  });

  it("rejects incomplete, duplicate, sparse, malformed and privileged resumable records", () => {
    const invalidRecords: unknown[] = [null, {}, { ...resumable, claudeSessionId: "bad" },
      { ...resumable, command: "cmd.exe" }, { ...resumable, args: ["--resume"] }];
    for (const key of Object.keys(resumable)) {
      const missing = { ...resumable } as Record<string, unknown>;
      delete missing[key];
      invalidRecords.push(missing, { ...resumable, [key]: " " });
    }
    invalidRecords.push({ ...resumable, createdAt: "yesterday" },
      { ...resumable, lastLaunchedAt: "2026-99-99T00:00:00Z" });
    for (const sessions of [undefined, null, {}, new Array(1), [resumable, resumable],
      ...invalidRecords.map((record) => [record])]) {
      for (const message of [
        { type: "hydrate", sessions: [], resumableSessions: sessions,
          terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 } },
        { type: "resumableSessionsChanged", sessions }
      ]) {
        assert.equal(decodeHostMessage(message).ok, false, JSON.stringify(message));
      }
    }
    assert.equal(decodeHostMessage({ type: "resumableSessionsChanged" }).ok, false);
    assert.equal(decodeHostMessage({ type: "resumableSessionsChanged", sessions: [], command: "cmd.exe" }).ok, false);
  });

  it("accepts every closed webview-to-host message shape", () => {
    const messages: readonly WebviewMessage[] = [
      { type: "ready" },
      { type: "input", sessionId: "session-alpha", data: "hello" },
      { type: "requestPaste", sessionId: "session-alpha" },
      { type: "openExternal", sessionId: "session-alpha", uri: "https://example.com/docs" },
      { type: "resize", sessionId: "session-alpha", columns: 120, rows: 40 },
      { type: "selectSession", sessionId: "session-alpha" },
      { type: "requestRenameSession", sessionId: "session-alpha" },
      { type: "newSession" },
      { type: "newInFolder" },
      { type: "resumeSession", claudeSessionId: "11111111-1111-4111-8111-111111111111" },
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
      {
        type: "hydrate",
        resumableSessions: [],
        sessions: [session],
        activeSessionId: "session-alpha",
        terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 }
      },
      { type: "sessionAdded", session },
      { type: "resumableSessionsChanged", sessions: [resumable] },
      { type: "sessionUpdated", session },
      { type: "sessionRemoved", sessionId: "session-alpha" },
      { type: "sessionData", sessionId: "session-alpha", data: "Claude ready\\r\\n" },
      { type: "paste", sessionId: "session-alpha", data: "first\\nsecond" },
      { type: "activeSessionChanged", activeSessionId: "session-alpha" },
      { type: "activeSessionChanged", activeSessionId: undefined }
    ];

    for (const message of messages) {
      assert.deepEqual(decodeHostMessage(message), { ok: true, value: message });
    }
  });

  it("requires a nullable Claude session id on every host session snapshot", () => {
    // Treating the field as optional would make exact-key validation disagree across JSON boundaries.
    const identifiedSession = {
      ...session,
      claudeSessionId: "123e4567-e89b-42d3-a456-426614174000"
    };
    const missingIdentity = {
      id: session.id,
      rootId: session.rootId,
      displayName: session.displayName,
      ordinalWithinRoot: session.ordinalWithinRoot,
      state: session.state,
      launchedImportIds: session.launchedImportIds,
      launchedAddDirPaths: session.launchedAddDirPaths,
      launchedAt: session.launchedAt
    };

    assert.deepEqual(decodeHostMessage({ type: "sessionAdded", session: identifiedSession }), {
      ok: true,
      value: { type: "sessionAdded", session: identifiedSession }
    });
    assert.deepEqual(decodeHostMessage({ type: "sessionUpdated", session }), {
      ok: true,
      value: { type: "sessionUpdated", session }
    });
    for (const invalidSession of [
      missingIdentity,
      { ...session, claudeSessionId: undefined },
      { ...session, claudeSessionId: 7 }
    ]) {
      assert.equal(
        decodeHostMessage({ type: "sessionAdded", session: invalidSession }).ok,
        false,
        JSON.stringify(invalidSession)
      );
    }
  });

  it("accepts complete terminal font metrics during hydration", () => {
    const message = {
      type: "hydrate",
      resumableSessions: [],
      sessions: [session],
      activeSessionId: "session-alpha",
      terminalFont: {
        fontFamily: "monospace",
        fontSize: 13.5,
        letterSpacing: 0,
        lineHeight: 1
      }
    };

    assert.deepEqual(decodeHostMessage(message), { ok: true, value: message });
  });

  it("accepts JSON-serialized optional active session fields when no session is active", () => {
    // JSON removes undefined properties, so requiring the key rejects valid host messages in the renderer.
    const hydration = JSON.parse(JSON.stringify({
      type: "hydrate",
      resumableSessions: [],
      sessions: [session],
      activeSessionId: undefined,
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 }
    })) as unknown;
    const activeChange = JSON.parse(JSON.stringify({
      type: "activeSessionChanged",
      activeSessionId: undefined
    })) as unknown;

    assert.deepEqual(decodeHostMessage(hydration), {
      ok: true,
      value: {
        type: "hydrate",
        resumableSessions: [],
        sessions: [session],
        activeSessionId: undefined,
        terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 }
      }
    });
    assert.deepEqual(decodeHostMessage(activeChange), {
      ok: true,
      value: { type: "activeSessionChanged", activeSessionId: undefined }
    });
  });

  it("still rejects missing required and excess host-message fields", () => {
    const terminalFont = { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 };

    assert.equal(decodeHostMessage({ type: "hydrate", terminalFont }).ok, false);
    assert.equal(decodeHostMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [session],
      terminalFont,
      command: "cmd.exe"
    }).ok, false);
    assert.equal(decodeHostMessage({ type: "activeSessionChanged", command: "cmd.exe" }).ok, false);
    assert.equal(decodeHostMessage({ type: "paste", sessionId: "", data: "text" }).ok, false);
    assert.equal(decodeHostMessage({ type: "paste", sessionId: "session-alpha", data: 7 }).ok, false);
  });

  it("rejects incomplete or non-finite terminal font metrics", () => {
    const hydration = {
      type: "hydrate",
      resumableSessions: [],
      sessions: [session],
      activeSessionId: "session-alpha"
    };
    const invalidMetrics = [
      { fontFamily: "", fontSize: 14, letterSpacing: 0, lineHeight: 1 },
      { fontFamily: "monospace", fontSize: Number.NaN, letterSpacing: 0, lineHeight: 1 },
      { fontFamily: "monospace", fontSize: 14, letterSpacing: Infinity, lineHeight: 1 },
      { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 0 }
    ];

    for (const terminalFont of invalidMetrics) {
      assert.equal(decodeHostMessage({ ...hydration, terminalFont }).ok, false);
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
      { type: "requestPaste", sessionId: "" },
      { type: "requestPaste", sessionId: "session-alpha", data: "unexpected" },
      { type: "openExternal", sessionId: "", uri: "https://example.com" },
      { type: "openExternal", sessionId: "session-alpha", uri: "" },
      { type: "openExternal", sessionId: "session-alpha", uri: 7 },
      {
        type: "openExternal",
        sessionId: "session-alpha",
        uri: "https://example.com",
        command: "cmd.exe"
      },
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
      { type: "requestRenameSession", sessionId: "" },
      { type: "requestRenameSession", sessionId: "session-alpha", displayName: "untrusted" },
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
      resumableSessions: [],
      sessions: sparseSessions,
      activeSessionId: undefined,
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 }
    });

    assert.equal(result.ok, false);
  });

  it("rejects sparse launched import id arrays in hydration messages", () => {
    const sparseImportIds = new Array(1);
    const result = decodeHostMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [{ ...session, launchedImportIds: sparseImportIds }],
      activeSessionId: "session-alpha",
      terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 }
    });

    assert.equal(result.ok, false);
  });

  it("rejects empty and sparse launched add-dir path arrays", () => {
    const sparsePaths = new Array(1);
    const invalidSessions = [
      { ...session, launchedAddDirPaths: [""] },
      { ...session, launchedAddDirPaths: sparsePaths }
    ];

    for (const invalidSession of invalidSessions) {
      const result = decodeHostMessage({
        type: "hydrate",
        resumableSessions: [],
        sessions: [invalidSession],
        activeSessionId: "session-alpha",
        terminalFont: { fontFamily: "monospace", fontSize: 14, letterSpacing: 0, lineHeight: 1 }
      });
      assert.equal(result.ok, false);
    }
  });
});
