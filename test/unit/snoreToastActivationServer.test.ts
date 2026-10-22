import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";
import path from "node:path";
import { tmpdir } from "node:os";

import {
  createSnoreToastActivationRegistry,
  openSnoreToastActivationServer,
  parseSnoreToastActivation
} from "../../src/attention/snoreToastActivationServer";

describe("SnoreToast activation server", () => {
  it("reports only safe callback actions and matching state without changing routing", () => {
    const callbacks: unknown[] = [];
    const options = { onCallback: (action: string, matched: boolean) => callbacks.push({ action, matched }) };
    const registry = createSnoreToastActivationRegistry(options);
    const selected: string[] = [];
    registry.onDidSelect((id) => selected.push(id));
    registry.register("toast-1", "session-1");
    registry.accept(Buffer.from("private malformed payload", "utf16le"));
    registry.accept(Buffer.from("action=timedout;notificationId=toast-1;", "utf16le"));
    registry.accept(Buffer.from("action=private-text;notificationId=toast-1;", "utf16le"));
    registry.accept(Buffer.from("action=clicked;notificationId=toast-1;", "utf16le"));
    registry.accept(Buffer.from("action=clicked;notificationId=toast-1;", "utf16le"));
    assert.deepEqual(callbacks, [
      { action: "unknown", matched: false },
      { action: "timedout", matched: true }, { action: "unknown", matched: true },
      { action: "clicked", matched: true }, { action: "clicked", matched: false }
    ]);
    assert.deepEqual(selected, ["session-1"]);
    registry.dispose();
  });

  it("keeps routing when callback diagnostics throw", () => {
    let calls = 0;
    const options = { onCallback: () => { calls += 1; throw new Error("diagnostic failed"); } };
    const registry = createSnoreToastActivationRegistry(options);
    const selected: string[] = [];
    registry.onDidSelect((id) => selected.push(id));
    registry.register("toast-1", "session-1");
    assert.doesNotThrow(() => registry.accept(Buffer.from("action=clicked;notificationId=toast-1;", "utf16le")));
    assert.deepEqual(selected, ["session-1"]);
    assert.equal(calls, 1);
    registry.dispose();
  });

  it("retains callback ownership after fade and releases it on dismissal, expiry or disposal", () => {
    let now = 0;
    const registry = createSnoreToastActivationRegistry({ now: () => now, correlationTtlMs: 50 });
    assert.equal(registry.hasPendingNotifications(), false);
    registry.register("faded", "session");
    assert.equal(registry.hasPendingNotifications(), true);
    registry.accept(Buffer.from("action=timedout;notificationId=faded;", "utf16le"));
    assert.equal(registry.hasPendingNotifications(), true);
    registry.accept(Buffer.from("action=dismissed;notificationId=faded;", "utf16le"));
    assert.equal(registry.hasPendingNotifications(), false);
    registry.register("expired", "session");
    now = 51;
    assert.equal(registry.hasPendingNotifications(), false);
    registry.register("disposed", "session");
    registry.dispose();
    assert.equal(registry.hasPendingNotifications(), false);
  });

  it("cancels faded registrations when their session closes without a callback", () => {
    const liveSessions = new Set(["closed-session"]);
    const options = { now: Date.now, isSessionLive: (sessionId: string) => liveSessions.has(sessionId) };
    const registry = createSnoreToastActivationRegistry(options);
    const selected: string[] = [];
    registry.onDidSelect((sessionId) => selected.push(sessionId));
    registry.register("stale-toast", "closed-session");
    registry.accept(Buffer.from("action=timedout;notificationId=stale-toast;", "utf16le"));
    assert.equal(registry.hasPendingNotifications(), true);

    liveSessions.clear();
    assert.equal(registry.hasPendingNotifications(), false);
    liveSessions.add("closed-session");
    registry.accept(Buffer.from("action=clicked;notificationId=stale-toast;", "utf16le"));
    assert.deepEqual(selected, [], "cancelled correlations must not revive if an ID is reused");
    registry.dispose();
  });

  it("prunes closed-session clicks without consuming another session's registration", () => {
    const liveSessions = new Set(["closed-session", "live-session"]);
    const options = { now: Date.now, isSessionLive: (sessionId: string) => liveSessions.has(sessionId) };
    const registry = createSnoreToastActivationRegistry(options);
    const selected: string[] = [];
    registry.onDidSelect((sessionId) => selected.push(sessionId));
    registry.register("closed-toast", "closed-session");
    registry.register("live-toast", "live-session");
    liveSessions.delete("closed-session");

    registry.accept(Buffer.from("action=clicked;notificationId=closed-toast;", "utf16le"));
    assert.deepEqual(selected, []);
    assert.equal(registry.hasPendingNotifications(), true);
    registry.accept(Buffer.from("action=clicked;notificationId=live-toast;", "utf16le"));
    assert.deepEqual(selected, ["live-session"]);
    assert.equal(registry.hasPendingNotifications(), false);
    registry.dispose();
  });

  it("preserves the seven-day delayed-click lifetime for a live session", () => {
    let now = 0;
    const options = { now: () => now, isSessionLive: () => true };
    const registry = createSnoreToastActivationRegistry(options);
    const selected: string[] = [];
    registry.onDidSelect((sessionId) => selected.push(sessionId));
    registry.register("live-toast", "live-session");
    registry.accept(Buffer.from("action=timedout;notificationId=live-toast;", "utf16le"));
    now = 7 * 24 * 60 * 60 * 1_000 - 1;
    assert.equal(registry.hasPendingNotifications(), true);
    registry.accept(Buffer.from("action=clicked;notificationId=live-toast;", "utf16le"));
    assert.deepEqual(selected, ["live-session"]);
    registry.dispose();
  });

  it("parses SnoreToast's UTF-16LE callback protocol", () => {
    const payload = Buffer.from(
      "action=clicked;notificationId=toast-1;version=0.10.0;\0",
      "utf16le"
    );

    assert.deepEqual(parseSnoreToastActivation(payload), {
      action: "clicked",
      notificationId: "toast-1"
    });
  });

  it("routes only a click to the session registered for that toast", () => {
    const registry = createSnoreToastActivationRegistry();
    const selected: string[] = [];
    registry.onDidSelect((sessionId) => selected.push(sessionId));
    registry.register("toast-1", "managed-session-1");
    registry.register("toast-2", "managed-session-2");

    registry.accept(Buffer.from(
      "action=timedout;notificationId=toast-1;version=0.10.0;",
      "utf16le"
    ));
    registry.accept(Buffer.from(
      "action=clicked;notificationId=toast-1;version=0.10.0;",
      "utf16le"
    ));
    registry.accept(Buffer.from(
      "action=dismissed;notificationId=toast-2;version=0.10.0;",
      "utf16le"
    ));
    registry.accept(Buffer.from(
      "action=clicked;notificationId=toast-2;version=0.10.0;",
      "utf16le"
    ));
    registry.accept(Buffer.from(
      "action=clicked;notificationId=unknown;version=0.10.0;",
      "utf16le"
    ));

    assert.deepEqual(selected, ["managed-session-1"]);
  });

  it("expires abandoned correlations and honors explicit cancellation", () => {
    let now = 100;
    const registry = createSnoreToastActivationRegistry({
      now: () => now,
      correlationTtlMs: 50
    });
    const selected: string[] = [];
    registry.onDidSelect((sessionId) => selected.push(sessionId));
    registry.register("expired", "session-1");
    const cancelled = registry.register("cancelled", "session-2");
    cancelled.dispose();
    now = 151;

    registry.accept(Buffer.from("action=clicked;notificationId=expired;", "utf16le"));
    registry.accept(Buffer.from("action=clicked;notificationId=cancelled;", "utf16le"));

    assert.deepEqual(selected, []);
  });

  it("receives a click through the host IPC endpoint", async () => {
    const pipeName = process.platform === "win32"
      ? `\\\\.\\pipe\\claude-workspaces-test-${randomUUID()}`
      : path.join(tmpdir(), `claude-workspaces-test-${randomUUID()}.sock`);
    const server = await openSnoreToastActivationServer({ pipeName });
    server.register("toast-1", "managed-session-1");
    const selected = new Promise<string>((resolve) => server.onDidSelect(resolve));
    const client = createConnection(pipeName);

    try {
      await new Promise<void>((resolve, reject) => {
        client.once("connect", resolve);
        client.once("error", reject);
      });
      client.end(Buffer.from(
        "action=clicked;notificationId=toast-1;version=0.10.0;",
        "utf16le"
      ));

      assert.equal(await selected, "managed-session-1");
    } finally {
      client.destroy();
      server.dispose();
    }
  });

  it("rejects oversized and idle pipe clients", async () => {
    const pipeName = process.platform === "win32"
      ? `\\\\.\\pipe\\claude-workspaces-test-${randomUUID()}`
      : path.join(tmpdir(), `claude-workspaces-test-${randomUUID()}.sock`);
    const errors: unknown[] = [];
    const server = await openSnoreToastActivationServer({
      pipeName,
      maxPayloadBytes: 4,
      socketTimeoutMs: 20,
      onError: (error) => errors.push(error)
    });
    const oversized = createConnection(pipeName);

    try {
      await new Promise<void>((resolve, reject) => {
        oversized.once("connect", resolve);
        oversized.once("error", reject);
      });
      oversized.write(Buffer.alloc(5));
      await waitFor(() => errors.length === 1);

      const idle = createConnection(pipeName);
      try {
        await new Promise<void>((resolve, reject) => {
          idle.once("connect", resolve);
          idle.once("error", reject);
        });
        await waitFor(() => errors.length === 2);
      } finally {
        idle.destroy();
      }
    } finally {
      oversized.destroy();
      server.dispose();
    }
  });
});

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 1_000;
  while (!predicate()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for the pipe server.");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
}
