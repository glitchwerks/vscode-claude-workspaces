import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createAttentionSignalProcessor } from "../../src/attention/attentionSignalWatcher";

type Fields = Record<string, unknown>;
interface Api {
  clock?: { after(ms: number, fn: () => Promise<void>): { cancel(): void } };
  session: { id(): Promise<string> };
}
interface Retry {
  activate(id: string): void;
  started(api: Api, id: string): string | undefined;
  generation(id: string): string | undefined;
  completed(api: Api, id: string, generation: string | undefined, fields: Fields): void;
  end(): void;
}
async function harness(options: { makeNonce?: () => string; maxStarts?: number } = {}) {
  const source = await readFile("media/attention/hooks/completionRetry.js", "utf8").catch(error => {
    if (error.code === "ENOENT") return "";
    throw error;
  });
  const load = new Function("url", "return import(url)") as (url: string) => Promise<{
    createCompletionRetry(publish: (api: Api, fields: Fields) => Promise<boolean>, options: unknown): Retry;
  }>;
  const module = await load(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${Math.random()}`);
  assert.equal(typeof module.createCompletionRetry, "function", "completion retry controller is not implemented");
  let time = 0, currentSession = "claude-1";
  const timers: Array<{ at: number; cancelled: boolean; fn: () => Promise<void> }> = [];
  const publications: Fields[] = [];
  const controls: { publish(api: Api, fields: Fields): Promise<boolean> } = { publish: async () => true };
  const api: Api = { session: { id: async () => currentSession }, clock: { after(ms, fn) {
    const timer = { at: time + ms, fn, cancelled: false }; timers.push(timer);
    return { cancel() { timer.cancelled = true; } };
  } } };
  const retry = module.createCompletionRetry(async (api, fields) => {
    publications.push(fields); return controls.publish(api, fields);
  }, { now: () => time, makeNonce: () => "worker", ...options });
  retry.activate("claude-1");
  const pending = () => timers.filter(timer => !timer.cancelled);
  const runNext = async () => {
    const timer = pending().sort((a, b) => a.at - b.at)[0];
    assert(timer, "expected a pending timer"); timer.cancelled = true; time = timer.at; await timer.fn();
  };
  const fields = (reason = "answer") => ({ hook_event_name: "TurnComplete", completion_reason: reason,
    is_aborted: reason === "aborted", prompt: "private prompt", answer: "private answer" });
  const completed = (id: string, generation = retry.generation(id), reason = "answer") => retry.completed(api, id, generation, fields(reason));
  return { retry, api, controls, publications, pending, runNext, completed,
    time: () => time, setTime: (value: number) => { time = value; },
    setSession: (value: string) => { currentSession = value; } };
}

describe("confirmed child completion retry", () => {
  it("recovers the dropped child completion without changing parent unread or notifying", async () => {
    const h = await harness();
    const session = { id: "managed", claudeSessionId: "claude-1", state: "running" as const,
      activity: "idle" as "idle" | "working" | "waiting", hasUnreadResponse: false };
    const stages: unknown[] = [];
    const processor = createAttentionSignalProcessor({ sessions: [session], onDidChangeSessions: () => ({ dispose() {} }),
      setAttention(_id, attention) { Object.assign(session, attention); } }, stage => stages.push(stage));
    const event = (fields: Fields) => ({ schemaVersion: 1, managedSessionId: "managed", claudeSessionId: "claude-1",
      notificationType: null, createdAt: "2026-10-30T12:00:00Z", completionReporterReady: true, ...fields });
    const generation = h.retry.started(h.api, "child"); assert(generation);
    processor.process(event({ hookEventName: "SubagentStart", agentId: "child", agentGeneration: generation }));
    // The initial child publication is deliberately omitted from the real processor.
    h.completed("child");
    processor.process(event({ hookEventName: "TurnComplete", completionReason: "answer", isAborted: false }));
    assert.equal(session.activity, "working"); assert.equal(session.hasUnreadResponse, true);
    await h.runNext();
    const retry = h.publications[0]!;
    assert.equal(h.time(), 5000);
    processor.process(event({ hookEventName: retry.hook_event_name, agentId: retry.agent_id,
      agentGeneration: retry.agent_generation, completionReason: retry.completion_reason, isAborted: retry.is_aborted }));
    assert.equal(session.activity, "waiting"); assert.equal(session.hasUnreadResponse, true);
    assert.deepEqual(stages, []); assert.equal(h.pending().length, 0);
    processor.dispose();
  });
  it("does no work for active, untracked, parent or legacy completions", async () => {
    const h = await harness();
    h.retry.started(h.api, "active");
    h.completed("unknown"); h.retry.completed(h.api, "active", undefined, { completion_reason: "answer", is_aborted: false });
    h.retry.completed(h.api, "", undefined, { completion_reason: "answer", is_aborted: false });
    assert.equal(h.pending().length, 0); assert.equal(h.publications.length, 0);
    h.retry.end();
  });
  for (const reason of ["answer", "aborted", "error", "refusal"]) {
    it(`retries confirmed ${reason} using only allowlisted metadata`, async () => {
      const h = await harness(); const generation = h.retry.started(h.api, "child");
      h.completed("child", generation, reason); await h.runNext();
      assert.deepEqual(h.publications, [{ hook_event_name: "TurnComplete", agent_id: "child", agent_generation: generation,
        completion_reason: reason, is_aborted: reason === "aborted" }]);
      assert.doesNotMatch(JSON.stringify(h.publications), /private/u);
      assert.equal(h.retry.generation("child"), undefined); assert.equal(h.pending().length, 0);
    });
  }
  it("stops after three failed retries with the proposed backoff", async () => {
    const h = await harness(); h.controls.publish = async () => false;
    h.retry.started(h.api, "child"); h.completed("child");
    for (const at of [5000, 20000, 50000]) { await h.runNext(); assert.equal(h.time(), at); }
    assert.equal(h.publications.length, 3); assert.equal(h.pending().length, 0);
    assert.equal(h.retry.generation("child"), undefined);
  });
  it("keeps independently active work busy when every completion retry fails", async () => {
    const h = await harness(); h.controls.publish = async () => false;
    const session = { id: "managed", claudeSessionId: "claude-1", state: "running" as const,
      activity: "idle" as "idle" | "working" | "waiting", hasUnreadResponse: false };
    const stages: unknown[] = [];
    const processor = createAttentionSignalProcessor({ sessions: [session], onDidChangeSessions: () => ({ dispose() {} }),
      setAttention(_id, attention) { Object.assign(session, attention); } }, stage => stages.push(stage));
    const event = (fields: Fields) => ({ schemaVersion: 1, managedSessionId: "managed", claudeSessionId: "claude-1",
      notificationType: null, createdAt: "2026-10-30T12:00:00Z", completionReporterReady: true, ...fields });
    for (const id of ["completed-but-lost", "still-running"]) {
      processor.process(event({ hookEventName: "SubagentStart", agentId: id, agentGeneration: h.retry.started(h.api, id) }));
    }
    processor.process(event({ hookEventName: "TurnComplete", completionReason: "answer", isAborted: false }));
    h.completed("completed-but-lost");
    for (let attempt = 0; attempt < 3; attempt++) {
      await h.runNext();
      assert.equal(session.activity, "working"); assert.equal(session.hasUnreadResponse, true);
    }
    assert.equal(h.pending().length, 0); assert.equal(h.publications.length, 3);
    assert(h.retry.generation("still-running")); assert.deepEqual(stages, []);
    h.retry.end(); processor.dispose();
  });
  it("contains rejected publications and stops as soon as a retry succeeds", async () => {
    const h = await harness(); h.controls.publish = async () => { throw new Error("private failure"); };
    h.retry.started(h.api, "child"); h.completed("child"); await h.runNext();
    h.controls.publish = async () => true; await h.runNext();
    assert.equal(h.time(), 20000); assert.equal(h.publications.length, 2); assert.equal(h.pending().length, 0);
  });
  it("cancels a queued retry when the same agent ID starts a newer run", async () => {
    const h = await harness(); const old = h.retry.started(h.api, "child"); h.completed("child");
    const generation = h.retry.started(h.api, "child"); assert.notEqual(generation, old);
    h.completed("child", old); assert.equal(h.pending().length, 0);
    h.completed("child", generation); await h.runNext();
    assert.equal(h.publications[0]?.agent_generation, generation);
  });
  it("does not release a newer start after an older retry finishes publishing", async () => {
    const h = await harness(); let resolve!: (value: boolean) => void;
    h.controls.publish = () => new Promise<boolean>(done => { resolve = done; });
    h.retry.started(h.api, "child"); h.completed("child");
    const run = h.runNext(); await Promise.resolve(); await Promise.resolve();
    const fresh = h.retry.started(h.api, "child"); resolve(true); await run;
    assert.equal(h.retry.generation("child"), fresh); assert.equal(h.pending().length, 0);
  });
  it("serializes retry publications while admitting more completions", async () => {
    const h = await harness(); let resolve!: (value: boolean) => void;
    h.controls.publish = () => new Promise<boolean>(done => { resolve = done; });
    h.retry.started(h.api, "a"); h.completed("a"); const run = h.runNext();
    await Promise.resolve(); await Promise.resolve();
    h.retry.started(h.api, "b"); h.completed("b"); assert.equal(h.pending().length, 0);
    resolve(true); await run; assert.equal(h.pending().length, 1);
    h.controls.publish = async () => true; await h.runNext(); assert.equal(h.publications.length, 2);
  });
  it("limits active and pending records without evicting live generations", async () => {
    const h = await harness();
    const first = h.retry.started(h.api, "0");
    for (let i = 1; i < 256; i++) assert(h.retry.started(h.api, String(i)));
    assert.equal(h.retry.started(h.api, "overflow"), undefined);
    assert.equal(h.retry.generation("0"), first);
    h.completed("overflow"); assert.equal(h.pending().length, 0);
    h.completed("0"); await h.runNext(); assert(h.retry.started(h.api, "overflow"));
    h.retry.end();
  });
  it("completes all 257 concurrent agents through versioned and overflow legacy pairs", async () => {
    const h = await harness();
    const session = { id: "managed", claudeSessionId: "claude-1", state: "running" as const,
      activity: "idle" as "idle" | "working" | "waiting", hasUnreadResponse: false };
    const processor = createAttentionSignalProcessor({ sessions: [session], onDidChangeSessions: () => ({ dispose() {} }),
      setAttention(_id, attention) { Object.assign(session, attention); } });
    const event = (fields: Fields) => ({ schemaVersion: 1, managedSessionId: "managed", claudeSessionId: "claude-1",
      notificationType: null, createdAt: "2026-10-30T12:00:00Z", completionReporterReady: true, ...fields });
    const agents = Array.from({ length: 257 }, (_, i) => {
      const id = String(i), generation = h.retry.started(h.api, id);
      processor.process(event({ hookEventName: "SubagentStart", agentId: id, agentGeneration: generation }));
      return { id, generation };
    });
    assert.equal(agents[256]?.generation, undefined);
    processor.process(event({ hookEventName: "TurnComplete", completionReason: "answer", isAborted: false }));
    for (const { id, generation } of agents) {
      assert.equal(processor.process(event({ hookEventName: "TurnComplete", agentId: id, agentGeneration: generation,
        completionReason: "answer", isAborted: false })), "applied");
      h.completed(id, generation);
    }
    assert.equal(session.activity, "waiting"); assert.equal(session.hasUnreadResponse, true);
    await h.runNext();
    const duplicate = h.publications[0]!;
    assert.equal(processor.process(event({ hookEventName: "TurnComplete", agentId: duplicate.agent_id,
      agentGeneration: duplicate.agent_generation, completionReason: "answer", isAborted: false })), "ignored");
    assert.equal(session.hasUnreadResponse, true);
    h.retry.end(); processor.dispose();
  });
  it("preserves the schedule across same-identity initialization and resets on a new identity", async () => {
    const h = await harness(); h.retry.started(h.api, "child"); h.completed("child");
    h.retry.activate("claude-1"); assert.equal(h.pending().length, 1);
    h.retry.activate("claude-2"); assert.equal(h.pending().length, 0);
    assert.equal(h.retry.generation("child"), undefined);
  });
  it("rejects a callback whose current session API no longer matches", async () => {
    const h = await harness(); h.retry.started(h.api, "child"); h.completed("child"); h.setSession("other");
    await h.runNext(); assert.deepEqual(h.publications, []); assert.equal(h.pending().length, 0);
  });
  it("invalidates queued and in-flight callbacks on session end", async () => {
    const h = await harness(); let resolve!: (value: string) => void;
    h.api.session.id = () => new Promise<string>(done => { resolve = done; });
    h.retry.started(h.api, "child"); h.completed("child"); const run = h.runNext();
    h.retry.end(); resolve("claude-1"); await run;
    assert.equal(h.publications.length, 0); assert.equal(h.pending().length, 0);
    h.retry.activate("claude-1"); h.retry.started(h.api, "child"); h.completed("child"); h.retry.end();
    assert.equal(h.pending().length, 0);
  });
  it("uses legacy mode on missing clock, nonce failure or exhausted counter", async () => {
    const missing = await harness(); missing.api.clock = undefined;
    assert.equal(missing.retry.started(missing.api, "child"), undefined);
    const nonce = await harness({ makeNonce: () => { throw new Error("nonce unavailable"); } });
    assert.equal(nonce.retry.started(nonce.api, "child"), undefined);
    const exhausted = await harness({ maxStarts: 1 }); assert(exhausted.retry.started(exhausted.api, "a"));
    assert.equal(exhausted.retry.started(exhausted.api, "b"), undefined);
  });
  it("contains throwing timers and keeps a silently refused timer bounded until cleanup", async () => {
    const h = await harness(); h.api.clock!.after = () => { throw new Error("timer unavailable"); };
    h.retry.started(h.api, "child"); h.completed("child"); assert.equal(h.retry.generation("child"), undefined);
    const refused = await harness(); refused.api.clock!.after = () => ({ cancel() {} });
    for (let i = 0; i < 256; i++) { refused.retry.started(refused.api, String(i)); refused.completed(String(i)); }
    assert.equal(refused.retry.started(refused.api, "overflow"), undefined);
    refused.retry.end(); assert.equal(refused.retry.generation("0"), undefined);
  });
  it("does not requeue a publication that finishes after session end", async () => {
    const h = await harness(); let resolve!: (value: boolean) => void;
    h.controls.publish = () => new Promise<boolean>(done => { resolve = done; });
    h.retry.started(h.api, "child"); h.completed("child"); const run = h.runNext();
    await Promise.resolve(); await Promise.resolve();
    h.retry.end(); resolve(false); await run;
    assert.equal(h.pending().length, 0); assert.equal(h.retry.generation("child"), undefined);
  });
  it("contains session API failures and keeps retries bounded", async () => {
    const h = await harness(); h.api.session.id = async () => { throw new Error("private session failure"); };
    h.retry.started(h.api, "child"); h.completed("child");
    for (let i = 0; i < 3; i++) await h.runNext();
    assert.equal(h.publications.length, 0); assert.equal(h.pending().length, 0);
  });
  it("keeps a new identity's queued completion when an older session check resolves", async () => {
    const h = await harness(); let resolve!: (value: string) => void;
    h.api.session.id = () => new Promise<string>(done => { resolve = done; });
    h.retry.started(h.api, "child"); h.completed("child"); const run = h.runNext();
    h.retry.activate("claude-2"); h.setSession("claude-2"); h.api.session.id = async () => "claude-2";
    const fresh = h.retry.started(h.api, "child"); h.completed("child");
    resolve("claude-1"); await run; assert.equal(h.retry.generation("child"), fresh);
    await h.runNext(); assert.equal(h.publications.length, 1);
    assert.equal(h.publications[0]?.agent_generation, fresh);
  });
  it("discards invalid confirmations and retains a copy of the first valid one", async () => {
    const h = await harness(); const generation = h.retry.started(h.api, "child");
    for (const fields of [{ completion_reason: "future", is_aborted: false }, { completion_reason: "answer", is_aborted: "false" }]) {
      h.retry.completed(h.api, "child", generation, fields);
    }
    assert.equal(h.pending().length, 0);
    const fields = { completion_reason: "answer", is_aborted: false };
    h.retry.completed(h.api, "child", generation, fields); fields.completion_reason = "error";
    h.completed("child", generation, "refusal"); await h.runNext();
    assert.equal(h.publications[0]?.completion_reason, "answer");
  });
  it("ignores cancelled callbacks even when the timer cancellation throws", async () => {
    const h = await harness(); let callback!: () => Promise<void>;
    h.api.clock!.after = (_ms, fn) => { callback = fn; return { cancel() { throw new Error("cancel failed"); } }; };
    h.retry.started(h.api, "child"); h.completed("child"); h.retry.end(); await callback();
    assert.equal(h.publications.length, 0);
  });
});
