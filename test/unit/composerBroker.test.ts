import assert from "node:assert/strict";
import { ComposerBroker, type BridgeRequest, type ComposerTransport } from "../../src/composer/composerBroker";
import type { ComposerTarget, SubmitRequest } from "../../src/composer/composerTypes";
import { composerFirstUuid, composerSecondUuid, composerSession } from "../support/composerHarness";

const target: ComposerTarget = {sessionId: "managed-first", claudeSessionId: composerFirstUuid, generation: "33333333-3333-4333-8333-333333333333"};
const submissionId = "44444444-4444-4444-8444-444444444444";
const token = "a".repeat(64);
const request = (): SubmitRequest => ({target, submissionId, draft: composerSession().draft});
const identity = (message: BridgeRequest) => ({protocol: 1, token: message.token, requestId: message.requestId, target: message.target});

function harness() {
  const writes: string[] = [], diagnostics: string[] = [], requests: BridgeRequest[] = [];
  let current: ComposerTarget | undefined = target;
  let timeout: (() => void) | undefined;
  const transport: ComposerTransport = {
    async exchange(message, prepared) {
      requests.push(message);
      await prepared({...identity(message), kind: "prepared", queueBinding: "ctrl+x enter"});
      return {...identity(message), kind: "result", status: "accepted"};
    },
    async close() {}
  };
  const broker = new ComposerBroker({
    resolveTarget: () => current,
    onFailure: code => diagnostics.push(code),
    now: () => 0,
    schedule: callback => { timeout = callback; return { dispose() { timeout = undefined; } }; }
  });
  broker.register(target, token, transport, async keys => { writes.push(keys); });
  return {broker, transport, writes, diagnostics, requests, timeout: () => timeout?.(), switch: () => { current = undefined; }};
}

describe("composer acceptance broker", () => {
  it("uses one native queue action and deduplicates repeated submission IDs", async () => {
    const h = harness();
    const first = await h.broker.submit(request());
    const repeated = await h.broker.submit(request());
    assert.equal(first.status, "accepted");
    assert.equal(first.submissionId, repeated.submissionId);
    assert.deepEqual(h.writes, ["\x18\r"]);
    assert.equal(h.requests.length, 1);
    assert.equal((await h.broker.submit({...request(), draft: {...request().draft, text: "different"}})).status, "rejected");
    assert.equal(h.requests.length, 1);
  });

  it("rejects stale targets and oversized drafts before native delivery", async () => {
    const h = harness();
    assert.equal((await h.broker.submit({...request(), target: {...target, claudeSessionId: composerSecondUuid}})).status, "rejected");
    assert.equal((await h.broker.submit({...request(), draft: {...request().draft, text: "x".repeat(1048577)}})).status, "rejected");
    h.switch();
    assert.equal((await h.broker.submit(request())).status, "rejected");
    assert.equal(h.requests.length, 0);
    assert.equal(h.writes.length, 0);
  });

  it("rejects unknown nested draft fields before creating a transport request", async () => {
    const h=harness();
    for (const draft of [{...request().draft,extra:"private metadata"},{...request().draft,selection:{...request().draft.selection,extra:"private metadata"}}]) {
      assert.equal((await h.broker.submit({...request(),draft})).status,"rejected");
    }
    assert.equal(h.requests.length,0);
    assert.equal(h.writes.length,0);
  });

  for (const corruption of ["token", "generation", "session", "malformed", "oversized", "binding"]) {
    it(`never writes native keys for a ${corruption} prepared frame`, async () => {
      const h = harness();
      h.transport.exchange = async (message, prepared) => {
        const frame: Record<string, unknown> = {...identity(message), kind: "prepared", queueBinding: "ctrl+x enter"};
        if (corruption === "token") frame.token = "b".repeat(64);
        if (corruption === "generation") frame.target = {...target, generation: "55555555-5555-4555-8555-555555555555"};
        if (corruption === "session") frame.target = {...target, sessionId: "managed-other"};
        if (corruption === "malformed") frame.extra = true;
        if (corruption === "oversized") frame.extra = "x".repeat(7000001);
        if (corruption === "binding") frame.queueBinding = "ctrl+enter";
        await prepared(frame);
        return {...identity(message), kind: "result", status: "accepted"};
      };
      assert.equal((await h.broker.submit(request())).status, "rejected");
      assert.equal(h.writes.length, 0);
      assert.doesNotMatch(JSON.stringify(h.diagnostics), /first draft|aaaaaaaa/);
    });
  }

  it("keeps a dropped native submission rejected even after a prepared write", async () => {
    const h = harness();
    h.transport.exchange = async (message, prepared) => {
      await prepared({...identity(message), kind: "prepared", queueBinding: "ctrl+x enter"});
      return {...identity(message), kind: "result", status: "rejected", reason: "invalid"};
    };
    assert.deepEqual(await h.broker.submit(request()), {status: "rejected", submissionId, reason: "invalid"});
    assert.equal(h.writes.length, 1);
  });

  it("reports timeout after possible delivery as unconfirmed and never retries", async () => {
    const h = harness();
    let dispatched!: () => void;
    const started = new Promise<void>(resolve => { dispatched = resolve; });
    h.transport.exchange = async (message, prepared) => {
      await prepared({...identity(message), kind: "prepared", queueBinding: "ctrl+x enter"});
      dispatched();
      return new Promise(() => undefined);
    };
    const pending = h.broker.submit(request());
    await started;
    h.timeout();
    assert.deepEqual(await pending, {status: "unconfirmed", submissionId});
    assert.deepEqual(await h.broker.submit(request()), {status: "unconfirmed", submissionId});
    assert.equal(h.writes.length, 1);
  });

  it("disposal aborts outstanding requests without dispatching a late prepared frame", async () => {
    const h = harness();
    let prepare!: (value: unknown) => Promise<void>;
    let message!: BridgeRequest;
    let dispatched!: () => void;
    const started = new Promise<void>(resolve => { dispatched = resolve; });
    h.transport.exchange = async (value, prepared) => {
      message = value; prepare = prepared; dispatched();
      return new Promise(() => undefined);
    };
    const pending = h.broker.submit(request());
    await started;
    await h.broker.disposeSession(target);
    assert.equal((await pending).status, "rejected");
    await assert.rejects(prepare({...identity(message), kind: "prepared", queueBinding: "ctrl+x enter"}));
    assert.equal(h.writes.length, 0);
  });

  it("treats private transport failures as unconfirmed after writing and redacts diagnostics", async () => {
    const h = harness();
    h.transport.exchange = async (message, prepared) => {
      await prepared({...identity(message), kind: "prepared", queueBinding: "ctrl+x enter"});
      throw new Error("first draft; token=" + token);
    };
    assert.equal((await h.broker.submit(request())).status, "unconfirmed");
    assert.doesNotMatch(JSON.stringify(h.diagnostics), /first draft|aaaaaaaa/);
  });

  it("accepts an explicitly unconfirmed native outcome without logging a transport failure", async () => {
    const h = harness();
    h.transport.exchange = async (message,prepared) => {
      await prepared({...identity(message),kind:"prepared",queueBinding:"ctrl+x enter"});
      return {...identity(message),kind:"result",status:"unconfirmed"};
    };
    assert.equal((await h.broker.submit(request())).status,"unconfirmed");
    assert.deepEqual(h.diagnostics,[]);
  });
});
