import assert from "node:assert/strict";

import {
  ResumableSessionStore,
  type ResumableSessionSnapshot
} from "../../src/sessions/resumableSessionStore";

const SESSION_STORE_KEY = "claudeWorkspaces.resumableSessions";
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const thirdId = "33333333-3333-4333-8333-333333333333";

/** In-memory workspace state with observable, optionally delayed writes. */
class SessionMemento {
  readonly updates: Array<{ readonly key: string; readonly value: unknown }> = [];
  private readonly values = new Map<string, unknown>();
  private nextUpdateError: Error | undefined;

  constructor(value: unknown = undefined, private readonly delayUpdates = false) {
    if (value !== undefined) {
      this.values.set(SESSION_STORE_KEY, value);
    }
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  async update(key: string, value: unknown): Promise<void> {
    this.updates.push({ key, value });
    if (this.delayUpdates) {
      await Promise.resolve();
    }
    if (this.nextUpdateError !== undefined) {
      const error = this.nextUpdateError;
      this.nextUpdateError = undefined;
      throw error;
    }
    this.values.set(key, value);
  }

  failNextUpdate(error: Error): void {
    this.nextUpdateError = error;
  }

  storedDocument(): unknown {
    return this.values.get(SESSION_STORE_KEY);
  }
}

function snapshot(
  claudeSessionId: string,
  overrides: Partial<ResumableSessionSnapshot> = {}
): ResumableSessionSnapshot {
  return {
    claudeSessionId,
    displayName: "Alpha 1",
    rootId: "file:///alpha",
    rootLabel: "Alpha",
    rootPath: "C:/projects/alpha",
    createdAt: "2026-09-06T10:00:00.000Z",
    lastLaunchedAt: "2026-09-06T10:00:00.000Z",
    ...overrides
  };
}

describe("ResumableSessionStore", () => {
  it("starts empty when no persisted session document exists", () => {
    const errors: string[] = [];
    const store = new ResumableSessionStore(
      new SessionMemento(),
      (message: string) => errors.push(message)
    );

    assert.deepEqual(store.sessions, []);
    assert.deepEqual(errors, []);
  });

  it("loads and orders valid version-1 records by latest launch then session id", () => {
    const older = snapshot(firstId, { lastLaunchedAt: "2026-09-06T09:00:00.000Z" });
    const tied = snapshot(thirdId, { lastLaunchedAt: "2026-09-06T10:00:00.000Z" });
    const newest = snapshot(secondId, { lastLaunchedAt: "2026-09-06T10:00:00.000Z" });
    const store = new ResumableSessionStore(
      new SessionMemento({ schemaVersion: 1, sessions: [older, tied, newest] }),
      () => undefined
    );

    assert.deepEqual(store.sessions, [newest, tied, older]);
  });

  it("accepts parseable ISO timestamps with more than three fractional digits", () => {
    const precise = snapshot(firstId, {
      createdAt: "2026-09-06T10:00:00.123456Z",
      lastLaunchedAt: "2026-09-06T10:00:00.123456Z"
    });
    const store = new ResumableSessionStore(
      new SessionMemento({ schemaVersion: 1, sessions: [precise] }),
      () => undefined
    );

    assert.deepEqual(store.sessions, [precise]);
  });

  it("resets malformed persisted records instead of exposing partial session metadata", () => {
    const errors: string[] = [];
    const store = new ResumableSessionStore(
      new SessionMemento({
        schemaVersion: 1,
        sessions: [snapshot(firstId, { rootPath: "   " })]
      }),
      (message: string) => errors.push(message)
    );

    assert.deepEqual(store.sessions, []);
    assert.deepEqual(errors, ["Discarded invalid Claude Workspaces resumable sessions."]);
  });

  it("resets an unknown schema version instead of treating it as a compatible document", () => {
    const errors: string[] = [];
    const store = new ResumableSessionStore(
      new SessionMemento({ schemaVersion: 2, sessions: [snapshot(firstId)] }),
      (message: string) => errors.push(message)
    );

    assert.deepEqual(store.sessions, []);
    assert.deepEqual(errors, ["Discarded invalid Claude Workspaces resumable sessions."]);
  });

  it("resets duplicate UUID records so one launch identity cannot overwrite another", () => {
    const errors: string[] = [];
    const store = new ResumableSessionStore(
      new SessionMemento({ schemaVersion: 1, sessions: [snapshot(firstId), snapshot(firstId)] }),
      (message: string) => errors.push(message)
    );

    assert.deepEqual(store.sessions, []);
    assert.deepEqual(errors, ["Discarded invalid Claude Workspaces resumable sessions."]);
  });

  it("resets persisted records with malformed UUIDs or timestamps", () => {
    const malformedRecords: ReadonlyArray<{
      readonly label: string;
      readonly overrides: Partial<ResumableSessionSnapshot>;
    }> = [
      {
        label: "a UUID without canonical separators",
        overrides: { claudeSessionId: "11111111111141118111111111111111" }
      },
      {
        label: "a UUID with an unsupported RFC 4122 version",
        overrides: { claudeSessionId: "11111111-1111-6111-8111-111111111111" }
      },
      {
        label: "a UUID with noncanonical upper-case digits",
        overrides: { claudeSessionId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" }
      },
      {
        label: "an ISO-shaped but unparseable timestamp",
        overrides: { createdAt: "2026-99-06T10:00:00Z" }
      },
      {
        label: "a parseable timestamp without ISO time syntax",
        overrides: { lastLaunchedAt: "September 6, 2026" }
      }
    ];

    malformedRecords.forEach(({ label, overrides }) => {
      const errors: string[] = [];
      const store = new ResumableSessionStore(
        new SessionMemento({ schemaVersion: 1, sessions: [snapshot(firstId, overrides)] }),
        (message: string) => errors.push(message)
      );

      assert.deepEqual(store.sessions, [], label);
      assert.deepEqual(errors, ["Discarded invalid Claude Workspaces resumable sessions."], label);
    });
  });

  it("publishes frozen copied snapshots so callers cannot mutate persisted session metadata", async () => {
    const input = { ...snapshot(firstId) };
    const store = new ResumableSessionStore(new SessionMemento(), () => undefined);

    await store.upsert(input);
    input.displayName = "Mutated caller input";
    const sessions = store.sessions;

    assert.equal(Object.isFrozen(sessions), true);
    assert.equal(Object.isFrozen(sessions[0]), true);
    assert.equal(sessions[0]?.displayName, "Alpha 1");
    assert.throws(() => {
      (sessions as ResumableSessionSnapshot[]).push(snapshot(secondId));
    }, TypeError);
  });

  it("serializes overlapping upsert rename and forget calls without losing the final state", async () => {
    const store = new ResumableSessionStore(new SessionMemento(undefined, true), () => undefined);

    await Promise.all([
      store.upsert(snapshot(firstId)),
      store.upsert(snapshot(secondId)),
      store.rename(firstId, "  Renamed Alpha  "),
      store.forget(secondId)
    ]);

    assert.deepEqual(store.sessions, [snapshot(firstId, { displayName: "Renamed Alpha" })]);
  });

  it("runs an upsert after invalid-document cleanup persistence fails", async () => {
    const memento = new SessionMemento({ schemaVersion: 2, sessions: [snapshot(firstId)] });
    memento.failNextUpdate(new Error("cleanup unavailable"));
    const store = new ResumableSessionStore(memento, () => undefined);

    await store.upsert(snapshot(secondId));

    assert.deepEqual(store.sessions, [snapshot(secondId)]);
  });

  it("emits one immutable change only after a successful persistence write", async () => {
    const memento = new SessionMemento();
    const store = new ResumableSessionStore(memento, () => undefined);
    const changes: (readonly ResumableSessionSnapshot[])[] = [];
    store.onDidChangeSessions((sessions: readonly ResumableSessionSnapshot[]) => changes.push(sessions));

    await store.upsert(snapshot(firstId));
    memento.failNextUpdate(new Error("disk unavailable"));
    await assert.rejects(store.rename(firstId, "Unpersisted name"), /disk unavailable/);

    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0], [snapshot(firstId)]);
    assert.deepEqual(store.sessions, [snapshot(firstId)]);
    assert.deepEqual(memento.storedDocument(), {
      schemaVersion: 1,
      sessions: [snapshot(firstId)]
    });
  });
});
