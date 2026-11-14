import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type * as nativeFs from "node:fs";
import * as fileIo from "node:fs/promises";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { access, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type * as attentionWatcherApi from "../../src/attention/attentionSignalWatcher";
import type { AttentionDiagnosticRecord } from "../../src/attention/attentionDiagnostics";

import {
  createAttentionSignalProcessor,
  ingestAttentionSignals,
  startAttentionChannelWatcher,
  type AttentionSignalProcessor
} from "../../src/attention/attentionSignalWatcher";

interface TestSession {
  readonly id: string;
  readonly claudeSessionId: string | null;
  readonly state: "running";
  readonly activity: "idle" | "working" | "waiting";
  readonly hasUnreadResponse: boolean;
  readonly activeAgentCount?:number;
}

class FakeSessionManager {
  sessions: readonly TestSession[];
  readonly attentionChanges: Array<{
    readonly id: string;
    readonly activity: TestSession["activity"];
    readonly hasUnreadResponse: boolean;
  }> = [];
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

  setAttention(
    id: string,
    attention: Pick<TestSession, "activity" | "hasUnreadResponse" | "activeAgentCount">
  ): void {
    const current = this.sessions.find((session) => session.id === id);
    if (
      current === undefined ||
      (current.activity === attention.activity &&
        current.hasUnreadResponse === attention.hasUnreadResponse &&
        (current.activeAgentCount ?? 0)===(attention.activeAgentCount ?? current.activeAgentCount ?? 0))
    ) {
      return;
    }
    this.attentionChanges.push({ id, activity:attention.activity,hasUnreadResponse:attention.hasUnreadResponse });
    this.sessions = this.sessions.map((candidate) =>
      candidate.id === id ? { ...candidate, ...attention } : candidate
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
  return {
    id,
    claudeSessionId,
    state: "running",
    activity: "idle",
    hasUnreadResponse: false,activeAgentCount:0
  };
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


/** Controls only native wakeups, timer delivery, and selected I/O boundaries. */
async function controlledWatcher(options: {
  readdir?: typeof fileIo.readdir;
  readFile?: typeof fileIo.readFile;
  rm?: typeof fileIo.rm;
} = {}) {
  const filename = require.resolve("../../src/attention/attentionSignalWatcher");
  const localRequire = createRequire(filename);
  const exports = {} as typeof attentionWatcherApi;
  const nativeWatcher = new EventEmitter();
  let event: nativeFs.WatchListener<string> | undefined;
  let timer: (() => void) | undefined;
  let unrefs = 0;
  let clears = 0;
  let closes = 0;
  let interval = 0;
  const handle = { unref: () => { unrefs += 1; } };
  runInNewContext(await readFile(filename, "utf8"), {
    exports,
    require: (id: string) => id === "node:fs" ? {
      watch: (_directory: string, _options: unknown, listener: nativeFs.WatchListener<string>) => {
        event = listener;
        return Object.assign(nativeWatcher, { close: () => { closes += 1; } });
      }
    } : id === "node:fs/promises" ? { ...fileIo, ...options } : localRequire(id),
    setInterval: (callback: () => void, milliseconds: number) => {
      timer = callback;
      interval = milliseconds;
      return handle;
    },
    clearInterval: (value: unknown) => {
      assert.equal(value, handle);
      clears += 1;
    }
  }, { filename });
  return {
    ...exports,
    nativeWatcher,
    wake: (filename: string | null = "later.signal.json") => event?.("rename", filename),
    tick: () => {
      assert.ok(timer, "durable signals need reconciliation without a native callback");
      timer();
    },
    resources: () => ({ unrefs, clears, closes, interval })
  };
}

/** Exposes a test-controlled asynchronous boundary without wall-clock sleeps. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("attention watcher reconciliation", () => {

  for (const initialFailure of [false, true]) {
    it(
      initialFailure
        ? "settles startup after an initial scan error while reconciliation remains pending"
        : "returns after the initial scan while recurring wakeups keep reconciliation pending",
      async () => {
        const reads = Array.from({ length: 4 }, () => deferred<Awaited<ReturnType<typeof fileIo.readdir>>>());
        const started = Array.from({ length: 4 }, () => deferred<void>());
        let scans = 0;
        let errors = 0;
        let calls = 0;
        const controlled = await controlledWatcher({
          readdir: (async () => {
            const index = scans++;
            started[index]?.resolve();
            const result = await reads[index]?.promise;
            if (index === 0 && initialFailure) {
              throw new Error("initial snapshot unavailable");
            }
            return result ?? [];
          }) as unknown as typeof fileIo.readdir
        });
        const manager = new FakeSessionManager(session());
        const actual = createAttentionSignalProcessor(manager);
        const processor = {
          promptSubmitted: actual.promptSubmitted.bind(actual), dispose: () => actual.dispose(),
          process: (value: unknown) => { calls += 1; return actual.process(value); }
        };
        let owner: { dispose(): void } | undefined;
        const startup = controlled.startAttentionChannelWatcher("controlled-channel", processor, () => {
          errors += 1;
          throw new Error("diagnostic sink unavailable");
        }).then(value => { owner = value; return value; });
        try {
          await started[0]!.promise;
          controlled.tick();
          reads[0]!.resolve([]);
          await started[1]!.promise;
          // Yield promise jobs only; the follow-up read remains deliberately unresolved.
          await new Promise<void>(resolve => setImmediate(resolve));
          assert.ok(owner, "startup must return an owner after its first pass, without drain quiescence");
          assert.equal(errors, initialFailure ? 1 : 0);
          for (const index of [1, 2]) {
            controlled.tick();
            reads[index]!.resolve([]);
            await started[index + 1]!.promise;
          }
          controlled.tick();
          owner.dispose();
          controlled.tick();
          controlled.wake();
          reads[3]!.resolve([]);
          await new Promise<void>(resolve => setImmediate(resolve));
          assert.equal(scans, 4, "the returned owner must cancel pending follow-up work");
          assert.equal(calls, 0);
          assert.deepEqual(controlled.resources(), { unrefs: 1, clears: 1, closes: 1, interval: 500 });
        } finally {
          // Release every held read even on RED so the old drain can return and be disposed.
          for (const read of reads) {
            read.resolve([]);
          }
          (await startup).dispose();
          actual.dispose();
        }
      }
    );
  }

  it("recovers a complete atomic rename without native callbacks and consumes it once", async () => {
    let removed = deferred<void>();
    const controlled = await controlledWatcher({
      rm: (async (...args: Parameters<typeof fileIo.rm>) => {
        await fileIo.rm(...args);
        removed.resolve();
      }) as typeof fileIo.rm
    });
    const channel = await mkdtemp(path.join(tmpdir(), "attention missed wakeup "));
    const manager = new FakeSessionManager(session());
    const applied: unknown[] = [];
    const actual = createAttentionSignalProcessor(manager);
    const processor = { promptSubmitted: actual.promptSubmitted.bind(actual), dispose: () => actual.dispose(), process: (value: unknown) => {
      applied.push(value);
      return actual.process(value);
    } };
    const errors: unknown[] = [];
    const watcher = await controlled.startAttentionChannelWatcher(channel, processor, () => errors.push("error"));
    try {
      await writeFile(path.join(channel, "atomic.tmp"), JSON.stringify(signal()), "utf8");
      await rename(path.join(channel, "atomic.tmp"), path.join(channel, "atomic.signal.json"));
      assert.equal(manager.sessions[0]?.activity, "idle");
      assert.deepEqual(await readdir(channel), ["atomic.signal.json"]);
      controlled.tick();
      await removed.promise;
      assert.equal(manager.sessions[0]?.activity, "waiting");
      assert.deepEqual(await readdir(channel), []);
      assert.equal(applied.length, 1);
      removed = deferred<void>();
      await writeFile(path.join(channel, "later.signal.json"), JSON.stringify(signal({
        hookEventName: "UserPromptSubmit", createdAt: "2026-09-19T12:00:01.000Z"
      })), "utf8");
      controlled.wake();
      await removed.promise;
      assert.equal(manager.sessions[0]?.activity, "working");
      assert.deepEqual(await readdir(channel), []);
      controlled.wake();
      controlled.tick();
      // A late event must not duplicate either consumed file's effect.
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(applied.length, 2);
      assert.deepEqual(errors, []);
    } finally {
      watcher.dispose();
      actual.dispose();
      await rm(channel, { recursive: true, force: true });
    }
  });

  it("coalesces timer and native wakeups during slow I/O into one serialized follow-up", async () => {
    const snapshot = deferred<Awaited<ReturnType<typeof fileIo.readdir>>>();
    const scanning = deferred<void>();
    const removed = deferred<void>();
    let scans = 0;
    let active = 0;
    let maxActive = 0;
    const controlled = await controlledWatcher({
      readdir: (async (...args: Parameters<typeof fileIo.readdir>) => {
        scans += 1;
        active += 1;
        maxActive = Math.max(maxActive, active);
        try {
          if (scans === 2) {
            scanning.resolve();
            return await snapshot.promise;
          }
          // Only the follow-up needs real I/O; excess scans complete deterministically.
          return scans === 3 ? await fileIo.readdir(...args) : [];
        } finally {
          active -= 1;
        }
      }) as typeof fileIo.readdir,
      rm: (async (...args: Parameters<typeof fileIo.rm>) => {
        await fileIo.rm(...args);
        removed.resolve();
      }) as typeof fileIo.rm
    });
    const channel = await mkdtemp(path.join(tmpdir(), "attention coalesced wakeups "));
    const manager = new FakeSessionManager(session());
    const actual = createAttentionSignalProcessor(manager);
    let applied = 0;
    const processor = {
      promptSubmitted: actual.promptSubmitted.bind(actual), dispose: () => actual.dispose(),
      process: (value: unknown) => { applied += 1; return actual.process(value); }
    };
    const watcher = await controlled.startAttentionChannelWatcher(channel, processor);
    try {
      controlled.tick();
      await scanning.promise;
      await writeFile(path.join(channel, "mid-scan.signal.json"), JSON.stringify(signal()), "utf8");
      for (let index = 0; index < 1_000; index += 1) {
        controlled.tick();
        controlled.wake();
      }
      assert.equal(scans, 2);
      snapshot.resolve([]);
      await removed.promise;
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(maxActive, 1, "native and timer requests must share a serialized scan");
      assert.equal(scans, 3, "a burst needs only one follow-up snapshot");
      assert.equal(applied, 1);
      assert.equal(manager.sessions[0]?.activity, "waiting");
      assert.deepEqual(await readdir(channel), []);
    } finally {
      snapshot.resolve([]);
      watcher.dispose();
      actual.dispose();
      await rm(channel, { recursive: true, force: true });
    }
  });

  it("stops queued and in-flight recovery before processing after disposal", async () => {
    const reading = deferred<void>();
    const release = deferred<void>();
    const readFinished = deferred<void>();
    let scans = 0;
    const controlled = await controlledWatcher({
      readdir: (async (...args: Parameters<typeof fileIo.readdir>) => {
        scans += 1;
        return await fileIo.readdir(...args);
      }) as typeof fileIo.readdir,
      readFile: (async (...args: Parameters<typeof fileIo.readFile>) => {
        const value = await fileIo.readFile(...args);
        reading.resolve();
        await release.promise;
        readFinished.resolve();
        return value;
      }) as typeof fileIo.readFile
    });
    const channel = await mkdtemp(path.join(tmpdir(), "attention disposed recovery "));
    const manager = new FakeSessionManager(session());
    const actual = createAttentionSignalProcessor(manager);
    let calls = 0;
    const processor = {
      promptSubmitted: actual.promptSubmitted.bind(actual), dispose: () => actual.dispose(),
      process: (value: unknown) => { calls += 1; return actual.process(value); }
    };
    const watcher = await controlled.startAttentionChannelWatcher(channel, processor);
    try {
      await writeFile(path.join(channel, "held.signal.json"), JSON.stringify(signal()), "utf8");
      controlled.tick();
      await reading.promise;
      controlled.tick();
      controlled.wake();
      watcher.dispose();
      watcher.dispose();
      controlled.tick(); // A callback already queued at clearInterval must also be harmless.
      controlled.wake();
      release.resolve();
      await readFinished.promise;
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(calls, 0, "an in-flight read must not call the processor after disposal");
      assert.equal(manager.sessions[0]?.activity, "idle");
      assert.deepEqual(await readdir(channel), ["held.signal.json"]);
      assert.equal(scans, 2, "queued and late callbacks cannot start scans after disposal");
      assert.deepEqual(controlled.resources(), { unrefs: 1, clears: 1, closes: 1, interval: 500 });
    } finally {
      release.resolve();
      watcher.dispose();
      actual.dispose();
      await rm(channel, { recursive: true, force: true });
    }
  });


  it("contains scan and diagnostic failures while later native events still consume valid signals", async () => {
    const failed = deferred<void>();
    const removed = deferred<void>();
    let scans = 0;
    let errors = 0;
    const controlled = await controlledWatcher({
      readdir: (async (...args: Parameters<typeof fileIo.readdir>) => {
        scans += 1;
        if (scans === 2) {
          throw new Error("synthetic read failure");
        }
        return await fileIo.readdir(...args);
      }) as typeof fileIo.readdir,
      rm: (async (...args: Parameters<typeof fileIo.rm>) => {
        await fileIo.rm(...args);
        removed.resolve();
      }) as typeof fileIo.rm
    });
    const channel = await mkdtemp(path.join(tmpdir(), "attention recovery errors "));
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    const watcher = await controlled.startAttentionChannelWatcher(channel, processor, () => {
      errors += 1;
      failed.resolve();
      throw new Error("synthetic diagnostic failure");
    });
    try {
      controlled.tick();
      await failed.promise;
      controlled.nativeWatcher.emit("error", new Error("synthetic watcher failure"));
      await writeFile(path.join(channel, "valid.signal.json"), JSON.stringify(signal()), "utf8");
      controlled.wake();
      await removed.promise;
      assert.equal(errors, 2);
      assert.equal(manager.sessions[0]?.activity, "waiting");
      assert.deepEqual(await readdir(channel), []);
    } finally {
      watcher.dispose();
      processor.dispose();
      await rm(channel, { recursive: true, force: true });
    }
  });

});

describe("attention completion generations", () => {
  it("publishes the number of active agents while preserving a genuine parent input wait",()=>{
    const manager=new FakeSessionManager(session());const processor=createAttentionSignalProcessor(manager);
    processor.process(signal());
    for(const agentId of ["agent-a","agent-b"])processor.process(signal({hookEventName:"SubagentStart",agentId,completionReporterReady:true}));
    assert.equal(manager.sessions[0]?.activity,"waiting");assert.equal(Reflect.get(manager.sessions[0]!,"activeAgentCount"),2);
    processor.process(signal({hookEventName:"TurnComplete",agentId:"agent-a",completionReporterReady:true,completionReason:"answer",isAborted:false}));
    assert.equal(Reflect.get(manager.sessions[0]!,"activeAgentCount"),1);
    processor.process(signal({hookEventName:"TurnComplete",agentId:"agent-b",completionReporterReady:true,completionReason:"answer",isAborted:false}));
    assert.equal(Reflect.get(manager.sessions[0]!,"activeAgentCount"),0);assert.equal(manager.sessions[0]?.activity,"waiting");processor.dispose();
  });
  function start(agentGeneration?: unknown) {
    return signal({ hookEventName: "SubagentStart", agentId: "agent-1", completionReporterReady: true,
      ...(agentGeneration === undefined ? {} : { agentGeneration }) });
  }
  function complete(agentGeneration?: unknown, overrides: Record<string, unknown> = {}) {
    return signal({ hookEventName: "TurnComplete", agentId: "agent-1", completionReporterReady: true,
      completionReason: "answer", isAborted: false,
      ...(agentGeneration === undefined ? {} : { agentGeneration }), ...overrides });
  }
  it("rejects old retries and unversioned completions after a new start with the same ID", () => {
    const manager = new FakeSessionManager(session());
    const stages: unknown[] = [];
    const processor = createAttentionSignalProcessor(manager, stage => stages.push(stage));
    processor.process(start("worker.1"));
    processor.process(complete(undefined, { agentId: undefined }));
    assert.equal(manager.sessions[0]?.activity, "working");
    assert.equal(manager.sessions[0]?.hasUnreadResponse, true);
    processor.process(start("worker.2"));
    for (const generation of ["worker.1", undefined, "unrelated.1"]) {
      assert.equal(processor.process(complete(generation)), "ignored");
      assert.equal(manager.sessions[0]?.activity, "working");
    }
    assert.equal(processor.process(complete("worker.2")), "applied");
    assert.equal(manager.sessions[0]?.activity, "waiting");
    assert.equal(manager.sessions[0]?.hasUnreadResponse, true);
    assert.equal(processor.process(complete("worker.2")), "ignored");
    assert.deepEqual(stages, []);
    processor.dispose();
  });
  it("keeps legacy pairs isolated from versioned retries", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    processor.process(start());
    assert.equal(processor.process(complete("old-worker.1")), "ignored");
    assert.equal(processor.process(complete()), "applied");
    processor.dispose();
  });
  it("rejects malformed generation metadata without changing owned work", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    for (const generation of [null, 42, "", "space token", "x\n", "non-ascii-é", "a".repeat(129)]) {
      assert.equal(processor.process(start(generation)), "ignored");
    }
    assert.equal(processor.process(start("a".repeat(128))), "applied");
    for (const generation of [null, 42, "", "a_1", "x\n", "a".repeat(129)]) {
      assert.equal(processor.process(complete(generation)), "ignored");
    }
    assert.equal(manager.sessions[0]?.activity, "working");
    assert.equal(processor.process(complete("a".repeat(128))), "applied");
    processor.dispose();
  });
  it("preserves parent activity, input-wait stages and unread across matching child retries", () => {
    for (const parentDone of [false, true]) {
      for (const inputWait of [false, true]) {
        const manager = new FakeSessionManager(session());
        const stages: unknown[] = [], records: AttentionDiagnosticRecord[] = [];
        const processor = createAttentionSignalProcessor(manager, stage => stages.push(stage), undefined, undefined,
          record => records.push(record));
        processor.process(signal({ hookEventName: "UserPromptSubmit" }));
        processor.process(start("private-worker.1"));
        if (parentDone) processor.process(complete(undefined, { agentId: undefined }));
        if (inputWait) processor.process(signal());
        const unread = manager.sessions[0]?.hasUnreadResponse, stageCount = stages.length;
        assert.equal(processor.process(complete("private-worker.1")), "applied");
        assert.equal(manager.sessions[0]?.activity, inputWait || parentDone ? "waiting" : "working");
        assert.equal(manager.sessions[0]?.hasUnreadResponse, unread);
        assert.equal(stages.length, stageCount);
        assert.doesNotMatch(JSON.stringify(records), /private-worker/u);
        processor.dispose();
      }
    }
  });
  it("rejects unready, mismatched and removed-session retries", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    processor.process(start("worker.1"));
    for (const overrides of [{ completionReporterReady: false }, { claudeSessionId: "old-session" },
      { managedSessionId: "other-session" }, { agentId: "unknown-agent" }]) {
      assert.equal(processor.process(complete("worker.1", overrides)), "ignored");
    }
    manager.remove("managed-session-1");
    manager.sessions = [session()];
    assert.equal(processor.process(complete("worker.1")), "ignored");
    processor.process(start("fresh-worker.1"));
    assert.equal(processor.process(complete("worker.1")), "ignored");
    assert.equal(processor.process(complete("fresh-worker.1")), "applied");
    processor.dispose();
  });
});

describe("attention processor diagnostics", () => {
  it("bypasses disabled capture and contains a failed enabled predicate", () => {
    const manager = new FakeSessionManager(session());
    let calls = 0;
    let enabled = false;
    const processor = createAttentionSignalProcessor(manager, undefined, undefined, undefined,
      () => { calls += 1; }, () => { if (enabled) { throw new Error("private predicate"); } return false; });
    processor.process(signal({ hookEventName: "UserPromptSubmit" }));
    enabled = true;
    assert.equal(processor.promptSubmitted("managed-session-1"), "applied");
    assert.equal(calls, 0);
    assert.equal(manager.sessions[0]?.activity, "working");
    processor.dispose();
  });
  it("captures aggregate before/after state and rejection reasons without private payloads", () => {
    const manager = new FakeSessionManager(session());
    const records: AttentionDiagnosticRecord[] = [];
    const processor = createAttentionSignalProcessor(manager, undefined, () => true, undefined,
      (record) => records.push(record));
    processor.process(signal({ hookEventName: "SubagentStart", agentId: "private-agent-content",
      completionReporterReady: true, prompt: "private-prompt", transcript_path: "C:/private-path" }));
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true,
      completionReason: "answer", isAborted: false }));
    processor.process(signal({ claudeSessionId: "private-other-session" }));
    processor.process(signal({ hookEventName: "private-event", notificationType: "private-notification" }));
    processor.promptSubmitted("managed-session-1");
    assert.equal(records[0]?.activeAgentsAfter, 1);
    assert.equal(records[1]?.activityAfter, "working");
    assert.equal(records[1]?.activeAgentsAfter, 1);
    assert.equal(records[2]?.reason, "identity-mismatch");
    assert.equal(records[3]?.event, "other");
    assert.equal(records[3]?.notification, "other");
    assert.equal(records[4]?.event, "terminal-submit");
    assert.doesNotMatch(JSON.stringify(records), /private|managed-session|claude-session/u);
    processor.dispose();
  });
  it("does not let a diagnostic callback change activity processing", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager, undefined, undefined, undefined,
      () => { throw new Error("diagnostic failed"); });
    assert.equal(processor.process(signal({ hookEventName: "UserPromptSubmit" })), "applied");
    assert.equal(manager.sessions[0]?.activity, "working");
    assert.equal(processor.promptSubmitted("managed-session-1"), "applied");
    processor.dispose();
  });
});

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
  it("reports missing readiness once without disabling ordinary prompt activity", () => {
    const manager = new FakeSessionManager(session());
    const unavailable: string[] = [];
    const processor = createAttentionSignalProcessor(manager, undefined, undefined,
      (sessionId) => { unavailable.push(sessionId); });
    for (let attempt = 0; attempt < 2; attempt++) {
      processor.process(signal({ hookEventName: "UserPromptSubmit", completionReporterReady: false }));
    }
    assert.deepEqual(unavailable, ["managed-session-1"]);
    assert.equal(manager.sessions[0]?.activity, "working");
    processor.dispose();
  });

  it("keeps reporter diagnostics from breaking prompt processing", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager, undefined, undefined,
      () => { throw new Error("diagnostic failure"); });
    assert.equal(processor.process(signal({ hookEventName: "UserPromptSubmit" })), "applied");
    assert.equal(manager.sessions[0]?.activity, "working");
    processor.dispose();
  });
  it("waits for confirmed parent completion when another hook blocks Stop", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    processor.process(signal({ hookEventName: "UserPromptSubmit", completionReporterReady: true }));
    assert.equal(processor.process(signal({ hookEventName: "Stop", completionReporterReady: true })), "ignored");
    assert.equal(manager.sessions[0]?.activity, "working");
    assert.equal(manager.sessions[0]?.hasUnreadResponse, false);
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true,
      completionReason: "answer", isAborted: false }));
    assert.equal(manager.sessions[0]?.activity, "waiting");
    assert.equal(manager.sessions[0]?.hasUnreadResponse, true);
    processor.dispose();
  });

  it("does not track agents without an admitted completion reporter", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    assert.equal(processor.process(signal({ hookEventName: "SubagentStart", agentId: "a" })), "ignored");
    assert.equal(manager.sessions[0]?.activity, "idle");
    processor.dispose();
  });

  for (const completionReason of ["aborted", "error", "refusal"]) {
    it(`clears confirmed ${completionReason} agent work without marking a response unread`, () => {
      const manager = new FakeSessionManager(session());
      const processor = createAttentionSignalProcessor(manager);
      processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, agentId: "a" }));
      processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true,
        completionReason, isAborted: completionReason === "aborted", agentId: "a" }));
      assert.equal(manager.sessions[0]?.activity, "idle");
      assert.equal(manager.sessions[0]?.hasUnreadResponse, false);
      processor.dispose();
    });
  }
  it("keeps a subagent working when another hook blocks its stop", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    processor.process(signal({ hookEventName: "UserPromptSubmit", notificationType: null }));
    processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId: "a" }));
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null }));
    // SubagentStop is emitted before parallel hooks resolve. Another hook can
    // return a block and continue this same agent without a new SubagentStart.
    processor.process(signal({ hookEventName: "SubagentStop", completionReporterReady: true, notificationType: null, agentId: "a" }));
    assert.equal(manager.sessions[0]?.activity, "working");
    assert.equal(manager.sessions[0]?.hasUnreadResponse, true);
    processor.dispose();
  });

  it("keeps background agents working after the parent response stops", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    processor.process(signal({ hookEventName: "UserPromptSubmit", notificationType: null }));
    processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId: "a" }));
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null }));
    assert.equal(manager.sessions[0]?.activity, "working");
    assert.equal(manager.sessions[0]?.hasUnreadResponse, true);
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null, agentId: "a" }));
    assert.equal(manager.sessions[0]?.activity, "waiting");
    assert.equal(manager.sessions[0]?.hasUnreadResponse, true);
    processor.dispose();
  });

  it("deduplicates starts and waits for the last concurrent agent", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    for (const agentId of ["a", "a", "b"]) {
      processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId }));
    }
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null }));
    for (const agentId of ["a", "a", "unknown"]) {
      processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null, agentId }));
      assert.equal(manager.sessions[0]?.activity, "working");
    }
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null, agentId: "b" }));
    assert.equal(manager.sessions[0]?.activity, "waiting");
    processor.dispose();
  });

  it("does not stop foreground work when a subagent finishes", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    processor.process(signal({ hookEventName: "UserPromptSubmit", notificationType: null }));
    processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId: "a" }));
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null, agentId: "a" }));
    assert.equal(manager.sessions[0]?.activity, "working");
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null }));
    assert.equal(manager.sessions[0]?.activity, "waiting");
    processor.dispose();
  });

  it("keeps genuine input waits visible while background agents run", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    processor.process(signal({ hookEventName: "UserPromptSubmit", notificationType: null }));
    processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId: "a" }));
    processor.process(signal());
    processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId: "b" }));
    assert.equal(manager.sessions[0]?.activity, "waiting");
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null, agentId: "a" }));
    assert.equal(manager.sessions[0]?.activity, "waiting");
    processor.promptSubmitted("managed-session-1");
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null }));
    assert.equal(manager.sessions[0]?.activity, "working");
    processor.dispose();
  });

  it("clears agent ownership on session end and removal", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId: "a" }));
    processor.process(signal({ hookEventName: "SessionEnd", notificationType: null }));
    assert.equal(manager.sessions[0]?.activity, "idle");
    assert.equal(processor.process(signal({
      hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null, agentId: "a"
    })), "ignored");
    assert.equal(manager.sessions[0]?.activity, "idle");
    processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId: "b" }));
    assert.equal(manager.sessions[0]?.activity, "working");
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null, agentId: "b" }));
    assert.equal(manager.sessions[0]?.activity, "idle");
    processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId: "c" }));
    manager.remove("managed-session-1");
    manager.sessions = [session()];
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null }));
    assert.equal(manager.sessions[0]?.activity, "waiting");
    processor.dispose();
  });

  it("does not resurrect a viewed response when the last agent finishes", () => {
    const manager = new FakeSessionManager(session());
    const processor = createAttentionSignalProcessor(manager);
    processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId: "a" }));
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null }));
    manager.setAttention("managed-session-1", { activity: "working", hasUnreadResponse: false });
    processor.process(signal({ hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null, agentId: "a" }));
    assert.equal(manager.sessions[0]?.activity, "waiting");
    assert.equal(manager.sessions[0]?.hasUnreadResponse, false);
    processor.dispose();
  });

  it("rejects malformed agent identities and isolates concurrent sessions", () => {
    const manager = new FakeSessionManager(session(), session("managed-session-2", "claude-session-2"));
    const processor = createAttentionSignalProcessor(manager);
    for (const agentId of [undefined, null, "", " ", 5]) {
      assert.equal(processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, agentId })), "ignored");
    }
    processor.process(signal({ hookEventName: "SubagentStart", completionReporterReady: true, notificationType: null, agentId: "a" }));
    processor.process(signal({
      managedSessionId: "managed-session-2", claudeSessionId: "claude-session-2",
      hookEventName: "TurnComplete", completionReporterReady: true, completionReason: "answer", isAborted: false, notificationType: null
    }));
    assert.deepEqual(manager.sessions.map(({ activity }) => activity), ["working", "waiting"]);
    processor.dispose();
  });

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

    assert.deepEqual(manager.attentionChanges.map(({ activity, hasUnreadResponse }) => ({
      activity,
      hasUnreadResponse
    })), [
      { activity: "waiting", hasUnreadResponse: false },
      { activity: "waiting", hasUnreadResponse: true },
      { activity: "waiting", hasUnreadResponse: false },
      { activity: "working", hasUnreadResponse: false },
      { activity: "waiting", hasUnreadResponse: false },
      { activity: "idle", hasUnreadResponse: false }
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

    assert.deepEqual(manager.attentionChanges.map(({ activity, hasUnreadResponse }) => ({
      activity,
      hasUnreadResponse
    })), [{ activity: "idle", hasUnreadResponse: false }]);
    processor.dispose();
  });

  it("closes a waiting stage on local prompt submission before the next waiting signal", () => {
    // A missed UserPromptSubmit hook must not make the next response look like the same waiting stage.
    const manager = new FakeSessionManager(session());
    const transitions: unknown[] = [];
    const processor = createAttentionSignalProcessor(
      manager,
      (transition) => transitions.push(transition)
    );

    assert.equal(processor.process(signal()), "applied");
    assert.equal(processor.promptSubmitted("managed-session-1"), "applied");
    assert.equal(processor.process(signal({
      hookEventName: "UserPromptSubmit",
      notificationType: null
    })), "applied");
    assert.equal(processor.process(signal()), "applied");

    assert.deepEqual(transitions.map((transition) => {
      const value = transition as { kind: string; reason?: string };
      return [value.kind, value.reason];
    }), [
      ["opened", undefined],
      ["closed", "user-prompt"],
      ["opened", undefined]
    ]);
    assert.deepEqual(manager.attentionChanges.map(({ activity, hasUnreadResponse }) => ({
      activity,
      hasUnreadResponse
    })), [
      { activity: "waiting", hasUnreadResponse: false },
      { activity: "working", hasUnreadResponse: false },
      { activity: "waiting", hasUnreadResponse: false }
    ]);
    processor.dispose();
  });

  it("rejects malformed signals, unknown sessions, and a mismatched Claude identity before checking visibility", () => {
    // A file in the channel cannot mutate a session unless both owned identities correlate.
    const manager = new FakeSessionManager(session());
    const viewedSessionIds: string[] = [];
    const processor = createAttentionSignalProcessor(
      manager,
      undefined,
      (sessionId) => {
        viewedSessionIds.push(sessionId);
        return false;
      }
    );

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

    assert.deepEqual(manager.attentionChanges, []);
    assert.deepEqual(viewedSessionIds, []);
    processor.dispose();
  });

  it("marks a stopped unviewed response unread and leaves a viewed response waiting", () => {
    // Failing to consult current visibility would either hide unread work or badge the active session.
    const manager = new FakeSessionManager(session());
    let viewed = false;
    const processor = createAttentionSignalProcessor(manager, undefined, () => viewed);

    processor.process(signal({ hookEventName: "UserPromptSubmit", notificationType: null }));
    processor.process(signal({ hookEventName: "Stop", notificationType: null }));
    viewed = true;
    processor.process(signal({ hookEventName: "UserPromptSubmit", notificationType: null }));
    processor.process(signal({ hookEventName: "Stop", notificationType: null }));

    assert.deepEqual(manager.attentionChanges.map(({ activity, hasUnreadResponse }) => ({
      activity,
      hasUnreadResponse
    })), [
      { activity: "working", hasUnreadResponse: false },
      { activity: "waiting", hasUnreadResponse: true },
      { activity: "working", hasUnreadResponse: false },
      { activity: "waiting", hasUnreadResponse: false }
    ]);
    processor.dispose();
  });

  it("tracks stopped response visibility independently across concurrent sessions", () => {
    // Reusing one visibility result across sessions would assign the unread badge to the wrong response.
    const manager = new FakeSessionManager(
      session("managed-session-1", "claude-session-1"),
      session("managed-session-2", "claude-session-2")
    );
    const processor = createAttentionSignalProcessor(
      manager,
      undefined,
      (sessionId) => sessionId === "managed-session-1"
    );

    processor.process(signal({ hookEventName: "Stop", notificationType: null }));
    processor.process(signal({
      managedSessionId: "managed-session-2",
      claudeSessionId: "claude-session-2",
      hookEventName: "Stop",
      notificationType: null
    }));

    assert.deepEqual(manager.sessions.map(({ id, activity, hasUnreadResponse }) => ({
      id,
      activity,
      hasUnreadResponse
    })), [
      { id: "managed-session-1", activity: "waiting", hasUnreadResponse: false },
      { id: "managed-session-2", activity: "waiting", hasUnreadResponse: true }
    ]);
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
    assert.deepEqual(manager.sessions.map(({ id, activity, hasUnreadResponse }) => ({
      id,
      activity,
      hasUnreadResponse
    })), [
      { id: "managed-session-1", activity: "working", hasUnreadResponse: false },
      { id: "managed-session-2", activity: "waiting", hasUnreadResponse: false }
    ]);
    processor.dispose();
  });

  it("uses the managed identity when persistence leaves the Claude identity unknown", () => {
    // Hook ingestion must remain available on CLIs that support --settings but not persistence.
    const manager = new FakeSessionManager(session("managed-session-1", null));
    const processor = createAttentionSignalProcessor(manager);

    assert.equal(processor.process(signal({ claudeSessionId: "runtime-claude-session" })), "applied");

    assert.deepEqual(manager.sessions[0], {
      id: "managed-session-1",
      claudeSessionId: null,
      state: "running",
      activity: "waiting",
      hasUnreadResponse: false,activeAgentCount:0
    });
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

      assert.deepEqual(manager.sessions[0], {
        id: "managed-session-1",
        claudeSessionId: "claude-session-1",
        state: "running",
        activity: "waiting",
        hasUnreadResponse: false,activeAgentCount:0
      });
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

      assert.deepEqual(manager.sessions[0], {
        id: "managed-session-1",
        claudeSessionId: "claude-session-1",
        state: "running",
        activity: "working",
        hasUnreadResponse: false,activeAgentCount:0
      });
      assert.deepEqual(manager.attentionChanges.map(({ activity, hasUnreadResponse }) => ({
        activity,
        hasUnreadResponse
      })), [
        { activity: "waiting", hasUnreadResponse: false },
        { activity: "working", hasUnreadResponse: false }
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
