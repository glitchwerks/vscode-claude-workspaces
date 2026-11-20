import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { IncomingHttpHeaders, IncomingMessage, RequestListener, Server, ServerOptions, ServerResponse } from "node:http";
import type { ManagedCaptureIdentity } from "../../src/companion/companionTypes";
import { StopReplyCapture } from "../../src/companion/stopReplyCapture";

class FakeServer extends EventEmitter {
  readonly listenCalls: { host: string; port: number }[] = [];
  maxConnections = 0;
  maxRequestsPerSocket = 0;
  closeCalls = 0;
  closeConnectionsCalls = 0;

  listen(port: number, host: string): void {
    this.listenCalls.push({ host, port });
  }

  unref(): void {}
  close(): void { this.closeCalls++; }
  closeAllConnections(): void { this.closeConnectionsCalls++; }
  address(): { port: number } { return { port: 49821 }; }
}

class FakeRequest extends PassThrough {
  constructor(
    readonly headers: IncomingHttpHeaders,
    readonly method = "POST",
    readonly url = "/stop"
  ) { super(); }
}

class FakeResponse extends EventEmitter {
  readonly headers = new Map<string, string>();
  readonly finished: Promise<void>;
  private finish: () => void = () => undefined;
  statusCode = 200;
  endCalls = 0;
  body: unknown;

  constructor() {
    super();
    this.finished = new Promise(resolve => { this.finish = resolve; });
  }

  setHeader(name: string, value: string): void { this.headers.set(name.toLowerCase(), value); }
  end(value?: unknown): void {
    this.endCalls++;
    this.body = value;
    this.finish();
  }
}

function target(index: number, generation = "launch-one"): ManagedCaptureIdentity {
  return {
    sessionId: "managed-" + index,
    claudeSessionId: "031410ff-050d-4b1a-8a8a-" + String(index).padStart(12, "0"),
    generation
  };
}

function setup() {
  const sessions = new Map<string, ManagedCaptureIdentity>();
  const server = new FakeServer();
  let options: ServerOptions | undefined;
  let deliver: RequestListener | undefined;
  const capture = new StopReplyCapture(id => sessions.get(id), (configuration, receive) => {
    options = configuration;
    deliver = receive;
    return server as unknown as Server;
  });
  function bind(session: ManagedCaptureIdentity): string {
    sessions.set(session.sessionId, session);
    const token = capture.bind(session);
    assert.ok(token);
    return token;
  }
  function request(
    token: string, headers: IncomingHttpHeaders = {}, method?: string, url?: string
  ): { incoming: FakeRequest; outgoing: FakeResponse } {
    const incoming = new FakeRequest({
      authorization: "Bearer " + token,
      "content-type": "application/json",
      ...headers
    }, method, url);
    const outgoing = new FakeResponse();
    assert.ok(deliver);
    deliver(incoming as unknown as IncomingMessage, outgoing as unknown as ServerResponse);
    return { incoming, outgoing };
  }
  async function send(token: string, event: unknown): Promise<FakeResponse> {
    const { incoming, outgoing } = request(token);
    incoming.end(Buffer.from(JSON.stringify(event), "utf8"));
    await outgoing.finished;
    return outgoing;
  }

  return {
    sessions, capture, server, bind, request, send,
    get options() { return options; },
    async start() {
      const pending = capture.start();
      server.emit("listening");
      return pending;
    }
  };
}

function stop(targetSession: ManagedCaptureIdentity, message?: string): object {
  return {
    hook_event_name: "Stop",
    session_id: targetSession.claudeSessionId,
    ...(message === undefined ? {} : { last_assistant_message: message })
  };
}

describe("Stop reply capture", () => {
  it("starts one bounded IPv4 listener and resolves a disposed startup", async () => {
    const h = setup();
    const pending = h.capture.start();
    assert.equal(h.capture.start(), pending);
    assert.deepEqual(h.server.listenCalls, [{ host: "127.0.0.1", port: 0 }]);
    assert.equal(h.server.maxConnections, 16);
    assert.equal(h.options?.requestTimeout, 2000);
    assert.equal(h.options?.headersTimeout, 2000);
    h.capture.dispose();
    h.server.emit("listening");
    assert.equal(await pending, undefined);
    assert.equal(await h.capture.start(), undefined);
    assert.equal(h.server.closeCalls, 1);
    assert.equal(h.server.closeConnectionsCalls, 1);
  });

  it("falls back cleanly when the listener cannot start", async () => {
    const h = setup();
    const session = target(1);
    h.sessions.set(session.sessionId, session);
    const pending = h.capture.start();
    h.server.emit("error", new Error("cannot open fake listener"));
    assert.equal(await pending, undefined);
    assert.equal(h.capture.bind(session), undefined);
    assert.equal(await h.capture.start(), undefined);
    assert.equal(h.server.closeCalls, 1);
    h.capture.dispose();
  });

  it("preserves the exact text and acknowledges without returning hook decisions", async () => {
    const h = setup();
    const session = target(1);
    assert.equal(await h.start(), 49821);
    const token = h.bind(session);
    assert.match(token, /^[0-9a-f]{64}$/);
    assert.equal(h.capture.bind({ ...session }), token);
    assert.equal(h.capture.stateFor(session)?.status, "waiting");
    const text = 'Run this:\r\n\r\n  printf "café 🐈"  \r\n';
    const received: string[] = [];
    const subscription = h.capture.onDidChange(id => received.push(id));
    const response = await h.send(token, { ...stop(session, text), transcript_path: "unused.jsonl" });

    assert.equal(response.statusCode, 204);
    assert.equal(response.body, undefined);
    assert.equal(response.headers.get("connection"), "close");
    assert.deepEqual(h.capture.stateFor(session), {
      status: "captured",
      reply: { sequence: 1, text }
    });
    assert.deepEqual(received, [session.sessionId]);
    subscription.dispose();
    h.capture.dispose();
  });

  it("keeps a previous reply through a gap and preserves its identity on duplicate delivery", async () => {
    const h = setup();
    await h.start();
    const session = target(1);
    const token = h.bind(session);
    const statuses: (string | undefined)[] = [];
    const subscription = h.capture.onDidChange(() => statuses.push(h.capture.stateFor(session)?.status));
    await h.send(token, stop(session, "Use this text"));
    const previous = h.capture.stateFor(session);
    await h.send(token, stop(session, "Use this text"));
    assert.equal(h.capture.stateFor(session), previous);
    await h.send(token, stop(session));
    const gap = h.capture.stateFor(session);
    assert.equal(gap?.status, "gap");
    assert.equal(gap?.reply, previous?.reply);
    await h.send(token, stop(session, "    "));
    assert.equal(h.capture.stateFor(session), gap);
    await h.send(token, stop(session, "Use this text"));
    assert.equal(h.capture.stateFor(session)?.reply, previous?.reply);
    await h.send(token, stop(session, "The next reply"));
    assert.equal(h.capture.stateFor(session)?.reply?.sequence, 2);
    assert.deepEqual(statuses, ["captured", "gap", "captured", "captured"]);
    subscription.dispose();
    h.capture.dispose();
  });

  it("rejects notifications outside the bound launch and retires in-flight deliveries", async () => {
    const h = setup();
    await h.start();
    const session = target(1);
    const token = h.bind(session);
    const other = target(2);
    const otherToken = h.bind(other);
    assert.notEqual(otherToken, token);

    await h.send(token, stop(other, "Different managed launch"));
    await h.send(token, { ...stop(session, "Tool observation"), hook_event_name: "PostToolUse" });
    await h.send(token, { ...stop(session, "Teammate reply"), agent_id: "agent-2" });
    const unauthorized = h.request("unbound");
    assert.equal(unauthorized.incoming.listenerCount("data"), 0);
    assert.equal(unauthorized.outgoing.statusCode, 204);
    unauthorized.incoming.destroy();
    assert.equal(h.capture.stateFor(session)?.status, "waiting");
    assert.equal(h.capture.stateFor(other)?.status, "waiting");

    const pending = h.request(token);
    const replacement = target(1, "launch-two");
    h.sessions.set(session.sessionId, replacement);
    h.capture.refresh();
    assert.equal(h.capture.stateFor(session), undefined);
    const replacementToken = h.bind(replacement);
    assert.notEqual(replacementToken, token);
    pending.incoming.end(Buffer.from(JSON.stringify(stop(session, "Expired text"))));
    await pending.outgoing.finished;
    assert.equal(h.capture.stateFor(replacement)?.status, "waiting");
    await h.send(replacementToken, stop(replacement, "Current text"));
    assert.equal(h.capture.stateFor(replacement)?.reply?.text, "Current text");
    h.capture.dispose();
    assert.equal(h.capture.stateFor(replacement), undefined);
  });

  it("bounds the reply, body, and number of active bindings", async () => {
    const h = setup();
    await h.start();
    const session = target(1);
    const token = h.bind(session);
    for (let index = 2; index <= 16; index++) h.bind(target(index));
    const extra = target(17);
    h.sessions.set(extra.sessionId, extra);
    assert.equal(h.capture.bind(extra), undefined);

    const tooLong = "☕".repeat(45_000);
    await h.send(token, stop(session, tooLong));
    assert.equal(h.capture.stateFor(session)?.status, "gap");
    assert.equal(h.capture.stateFor(session)?.reply, undefined);

    const bodyLimit = h.request(token, { "content-length": String(896 * 1024 + 1) });
    assert.equal(bodyLimit.incoming.listenerCount("data"), 0);
    assert.equal(bodyLimit.outgoing.statusCode, 204);
    bodyLimit.incoming.destroy();
    const unsupported = h.request(token, { "content-encoding": "gzip" });
    assert.equal(unsupported.incoming.listenerCount("data"), 0);
    unsupported.incoming.destroy();
    const wrongRoute = h.request(token, {}, "POST", "/other");
    assert.equal(wrongRoute.incoming.listenerCount("data"), 0);
    wrongRoute.incoming.destroy();

    h.sessions.delete(session.sessionId);
    h.capture.refresh();
    assert.match(h.bind(extra), /^[0-9a-f]{64}$/);
    h.capture.dispose();
  });
});
