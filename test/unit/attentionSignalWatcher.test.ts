import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createAttentionSignalProcessor,
  ingestAttentionSignals,
  startAttentionChannelWatcher,
  type AttentionSignalProcessor
} from "../../src/attention/attentionSignalWatcher";

interface TestSession {
  readonly id: string;
  readonly claudeSessionId: string | null;
  readonly activity: "idle" | "working" | "waiting";
}

class FakeSessionManager {
  sessions: readonly TestSession[];
  readonly activityChanges: Array<{ readonly id: string; readonly activity: TestSession["activity"] }> = [];
  private readonly listeners = new Set<(sessions: readonly TestSession[]) => void>();

  constructor(...sessions: readonly TestSession[]) {
    this.sessions = sessions;
  }

  readonly onDidChangeSessions = (
    listener: (sessions: readonly TestSession[]) => void
  ): { dispose(): void } => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };

  setActivity(id: string, activity: TestSession["activity"]): void {
    const current = this.sessions.find((session) => session.id === id);
    if (current === undefined || current.activity === activity) {
      return;
    }
    this.activityChanges.push({ id, activity });
    this.sessions = this.sessions.map((session) =>
      session.id === id ? { ...session, activity } : session
    );
    this.fire();
  }

  remove(id: string): void {
    this.sessions = this.sessions.filter((session) => session.id !== id);
    this.fire();
  }

  private fire(): void {
    this.listeners.forEach((listener) => listener(this.sessions));
  }
}

function session(
  id = "managed-session-1",
  claudeSessionId: string | null = "claude-session-1"
): TestSession {
  return { id, claudeSessionId, activity: "idle" };
}

function signal(overrides: Readonly<Record<string, unknown>> = {}): Readonly<Record<string, unknown>> {
  return {
    schemaVersion: 1,
    managedSessionId: "managed-session-1",
    claudeSessionId: "claude-session-1",
    hookEventName: "Notification",
    notificationType: "permission_prompt",
    createdAt: "2026-09-19T12:00:00.000Z",
    ...overrides
  };
}

async function waitForRemoval(filePath: string): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    try {
      await access(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`Timed out waiting for signal cleanup: ${filePath}`);
}

describe("attention signal ingestion", () => {
  it("maps hook events and deduplicates one waiting stage per session", () => {
    // Repeated waiting events must update one stage instead of opening duplicate notifications.
    const manager = new FakeSessionManager(session());
    const transitions: unknown[] = [];
    const processor = createAttentionSignalProcessor(
      manager,
      (transition) => transitions.push(transition)
    );

    assert.equal(processor.process(signal()), "applied");
    assert.equal(processor.process(signal({ notificationType: "agent_needs_input" })), "applied");
    assert.equal(processor.process(signal({
      hookEventName: "Stop",
      notificationType: null
    })), "applied");
    assert.equal(processor.process(signal({ notificationType: "elicitation_dialog" })), "applied");
    assert.equal(processor.process(signal({
      hookEventName: "UserPromptSubmit",
      notificationType: null
    })), "applied");
    assert.equal(processor.process(signal()), "applied");
    assert.equal(processor.process(signal({
      hookEventName: "SessionEnd",
      notificationType: null
    })), "applied");

    assert.deepEqual(manager.activityChanges.map(({ activity }) => activity), [
      "waiting",
      "idle",
      "waiting",
      "working",
      "waiting",
      "idle"
    ]);
    assert.deepEqual(transitions, [
      { kind: "opened", sessionId: "managed-session-1", signal: signal() },
      {
        kind: "updated",
        sessionId: "managed-session-1",
        signal: signal({ notificationType: "agent_needs_input" })
      },
      {
        kind: "updated",
        sessionId: "managed-session-1",
        signal: signal({ notificationType: "elicitation_dialog" })
      },
      { kind: "closed", sessionId: "managed-session-1", reason: "user-prompt" },
      { kind: "opened", sessionId: "managed-session-1", signal: signal() },
      { kind: "closed", sessionId: "managed-session-1", reason: "session-end" }
    ]);
    processor.dispose();
  });

  it("maps idle prompts while ignoring unknown events and notification types", () => {
    // Treating future hook values as fatal can stop ingestion for otherwise valid sessions.
    const manager = new FakeSessionManager({ ...session(), activity: "working" });
    const processor = createAttentionSignalProcessor(manager);

    assert.equal(processor.process(signal({ notificationType: "idle_prompt" })), "applied");
    assert.equal(processor.process(signal({ notificationType: "future_notification" })), "ignored");
    assert.equal(processor.process(signal({ hookEventName: "FutureEvent" })), "ignored");

    assert.deepEqual(manager.activityChanges.map(({ activity }) => activity), ["idle"]);
    processor.dispose();
  });

  it("rejects malformed signals, unknown sessions, and a mismatched Claude identity", () => {
    // A file in the channel cannot mutate a session unless both owned identities correlate.
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);

    for (const candidate of [
      null,
      {},
      signal({ schemaVersion: 2 }),
      signal({ managedSessionId: "unknown-session" }),
      signal({ claudeSessionId: "wrong-claude-session" }),
      signal({ createdAt: "not-a-timestamp" })
    ]) {
      assert.equal(processor.process(candidate), "ignored");
    }

    assert.deepEqual(manager.activityChanges, []);
    processor.dispose();
  });

  it("closes an open waiting stage when its managed session is removed", () => {
    // Retaining stage state after removal would suppress the next session that reuses an id in tests or recovery.
    const manager = new FakeSessionManager(session());
    const transitions: unknown[] = [];
    const processor = createAttentionSignalProcessor(
      manager,
      (transition) => transitions.push(transition)
    );
    processor.process(signal());

    manager.remove("managed-session-1");

    assert.deepEqual(transitions.at(-1), {
      kind: "closed",
      sessionId: "managed-session-1",
      reason: "session-removed"
    });
    processor.dispose();
  });

  it("tracks waiting stages independently across concurrent sessions", () => {
    // A global stage flag would suppress one session merely because another is already waiting.
    const manager = new FakeSessionManager(
      session("managed-session-1", "claude-session-1"),
      session("managed-session-2", "claude-session-2")
    );
    const transitions: unknown[] = [];
    const processor = createAttentionSignalProcessor(
      manager,
      (transition) => transitions.push(transition)
    );

    processor.process(signal());
    processor.process(signal({
      managedSessionId: "managed-session-2",
      claudeSessionId: "claude-session-2"
    }));
    processor.process(signal({ notificationType: "agent_needs_input" }));
    processor.process(signal({
      hookEventName: "UserPromptSubmit",
      notificationType: null
    }));
    processor.process(signal({
      managedSessionId: "managed-session-2",
      claudeSessionId: "claude-session-2",
      notificationType: "elicitation_dialog"
    }));

    assert.deepEqual(transitions.map((transition) => {
      const value = transition as { kind: string; sessionId: string };
      return [value.kind, value.sessionId];
    }), [
      ["opened", "managed-session-1"],
      ["opened", "managed-session-2"],
      ["updated", "managed-session-1"],
      ["closed", "managed-session-1"],
      ["updated", "managed-session-2"]
    ]);
    assert.deepEqual(manager.sessions.map(({ id, activity }) => [id, activity]), [
      ["managed-session-1", "working"],
      ["managed-session-2", "waiting"]
    ]);
    processor.dispose();
  });

  it("uses the managed identity when persistence leaves the Claude identity unknown", () => {
    // Hook ingestion must remain available on CLIs that support --settings but not persistence.
    const manager = new FakeSessionManager(session("managed-session-1", null));
    const processor = createAttentionSignalProcessor(manager);

    assert.equal(processor.process(signal({ claudeSessionId: "runtime-claude-session" })), "applied");

    assert.equal(manager.sessions[0]?.activity, "waiting");
    processor.dispose();
  });

  it("consumes only signal files from its owning host channel", async () => {
    // Scanning a shared parent would let one VS Code window ingest another window's session event.
    const parent = await mkdtemp(path.join(tmpdir(), "attention signal routing "));
    const ownChannel = path.join(parent, "own");
    const foreignChannel = path.join(parent, "foreign");
    await mkdir(ownChannel);
    await mkdir(foreignChannel);
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    try {
      await writeFile(path.join(ownChannel, "malformed.signal.json"), "{", "utf8");
      await writeFile(path.join(ownChannel, "partial.signal.json"), JSON.stringify({ schemaVersion: 1 }), "utf8");
      await writeFile(
        path.join(ownChannel, "unknown.signal.json"),
        JSON.stringify(signal({ hookEventName: "FutureEvent" })),
        "utf8"
      );
      await writeFile(path.join(ownChannel, "valid.signal.json"), JSON.stringify(signal()), "utf8");
      await writeFile(path.join(ownChannel, ".owner.json"), JSON.stringify({ processId: 1 }), "utf8");
      await writeFile(path.join(foreignChannel, "foreign.signal.json"), JSON.stringify(signal()), "utf8");

      assert.equal(await ingestAttentionSignals(ownChannel, processor), 1);

      assert.equal(manager.sessions[0]?.activity, "waiting");
      assert.deepEqual((await readdir(ownChannel)).sort(), [".owner.json"]);
      assert.deepEqual(await readdir(foreignChannel), ["foreign.signal.json"]);
      assert.match(await readFile(path.join(foreignChannel, "foreign.signal.json"), "utf8"), /managed-session-1/);
    } finally {
      processor.dispose();
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("applies queued signals in event-time order instead of random filename order", async () => {
    // Hook filenames are GUIDs, so lexical order can otherwise resurrect an earlier waiting state.
    const channel = await mkdtemp(path.join(tmpdir(), "attention signal ordering "));
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    try {
      await writeFile(
        path.join(channel, "a-later.signal.json"),
        JSON.stringify(signal({
          hookEventName: "UserPromptSubmit",
          notificationType: null,
          createdAt: "2026-09-19T12:00:01.000Z"
        })),
        "utf8"
      );
      await writeFile(
        path.join(channel, "z-earlier.signal.json"),
        JSON.stringify(signal({ createdAt: "2026-09-19T12:00:00.000Z" })),
        "utf8"
      );

      assert.equal(await ingestAttentionSignals(channel, processor), 2);

      assert.equal(manager.sessions[0]?.activity, "working");
      assert.deepEqual(manager.activityChanges.map(({ activity }) => activity), [
        "waiting",
        "working"
      ]);
    } finally {
      processor.dispose();
      await rm(channel, { recursive: true, force: true });
    }
  });

  it("watches atomic signal renames after the initial channel scan", async function () {
    // A one-time scan passes tests but misses every hook event written after activation.
    this.timeout(5_000);
    const channel = await mkdtemp(path.join(tmpdir(), "attention signal watch "));
    const manager = new FakeSessionManager(session());
    const processor: AttentionSignalProcessor = createAttentionSignalProcessor(manager);
    const errors: unknown[] = [];
    const watcher = await startAttentionChannelWatcher(
      channel,
      processor,
      () => errors.push(new Error("watch failed"))
    );
    try {
      const observed = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("signal was not observed")), 2_000);
        const subscription = manager.onDidChangeSessions((sessions) => {
          if (sessions[0]?.activity === "waiting") {
            clearTimeout(timeout);
            subscription.dispose();
            resolve();
          }
        });
      });
      const temporaryPath = path.join(channel, "atomic.tmp");
      const finalPath = path.join(channel, "atomic.signal.json");
      await writeFile(temporaryPath, JSON.stringify(signal()), "utf8");
      await rename(temporaryPath, finalPath);

      await observed;

      assert.deepEqual(errors, []);
      await waitForRemoval(finalPath);
    } finally {
      watcher.dispose();
      processor.dispose();
      await rm(channel, { recursive: true, force: true });
    }
  });
});
