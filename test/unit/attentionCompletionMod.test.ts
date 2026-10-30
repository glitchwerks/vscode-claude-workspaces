import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

type Handler = (api: unknown, event: Record<string, unknown>, next: (event: unknown) => Promise<unknown>) => Promise<unknown>;

async function harness(withRetry = false) {
  const reporter = await readFile("media/attention/hooks/register.js", "utf8");
  const helper = await readFile("media/attention/hooks/completionRetry.js", "utf8");
  const source = reporter.replace('import { createCompletionRetry } from "./completionRetry.js";', helper);
  const load = new Function("url", "return import(url)") as (url: string) => Promise<{ register(on: unknown): void }>;
  const module = await load(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${Math.random()}`);
  const handlers = new Map<string, Handler>();
  module.register((event: string, handler: Handler) => handlers.set(event, handler));
  const publications: Array<{ argv: string[]; options: { stdin: string; timeoutMs: number } }> = [];
  const environment = new Map<string, string>();
  const diagnostics: string[] = [];
  const timers: Array<{ ms: number; cancelled: boolean; fn: () => Promise<void> }> = [];
  const controls = {
    sessionId: "session-1", exitCode: 0, throwProcess: false,
    throwSession: false, throwEnv: false, logFailure: "none"
  };
  const api = {
    clock: withRetry ? { after(ms: number, fn: () => Promise<void>) {
      const timer = { ms, fn, cancelled: false }; timers.push(timer);
      return { cancel() { timer.cancelled = true; } };
    } } : undefined,
    plugin: { root: "C:/extension path/media/attention" },
    session: { id: async () => {
      if (controls.throwSession) { throw new Error("private session error"); }
      return controls.sessionId;
    } },
    env: { set: async (name: string, value: string) => {
      if (controls.throwEnv) { throw new Error("private environment error"); }
      environment.set(name, value);
    } },
    process: { run: async (argv: string[], options: { stdin: string; timeoutMs: number }) => {
      publications.push({ argv, options });
      if (controls.throwProcess) { throw new Error("private error"); }
      return { exitCode: controls.exitCode, stdout: "", stderr: "private output" };
    } },
    ui: { log: (text: string) => {
      diagnostics.push(text);
      if (controls.logFailure === "throw") { throw new Error("private log error"); }
      if (controls.logFailure === "reject") { return Promise.reject(new Error("private log error")); }
    } }
  };
  return { handlers, publications, environment, diagnostics, controls, api, timers };
}

describe("confirmed attention completion mod", () => {
  it("does not launch a retry writer after session end during its session lookup", async () => {
    let time = 0; const originalNow = Date.now;
    let h: Awaited<ReturnType<typeof harness>>;
    try { Date.now = () => time; h = await harness(true); } finally { Date.now = originalNow; }
    const next = async () => undefined;
    await h.handlers.get("session.start")!(h.api, {}, next);
    await h.handlers.get("classic.SubagentStart")!(h.api, { agent_id: "child" }, next);
    await h.handlers.get("turn.complete")!(h.api, { agentId: "child", reason: "answer", isAborted: false }, next);
    let lookups = 0, resolve: ((id: string) => void) | undefined;
    h.api.session.id = () => ++lookups === 1 ? Promise.resolve("session-1") : new Promise<string>(done => { resolve = done; });
    time = 5000;
    const pending = h.timers.find(timer => !timer.cancelled)!.fn();
    for (let i = 0; i < 5; i++) await Promise.resolve();
    const beforeEnd = h.publications.length;
    await h.handlers.get("session.end")!(h.api, {}, next);
    resolve?.("session-1"); await pending;
    assert.equal(h.publications.length, beforeEnd);
  });
  for (const newerEvent of ["classic.SessionStart", "session.end"]) {
    it(`ignores an old readiness response after ${newerEvent}`, async () => {
      const h = await harness(true), next = async () => undefined;
      let resolve!: (id: string) => void;
      h.api.session.id = () => new Promise<string>(done => { resolve = done; });
      const old = h.handlers.get("session.start")!(h.api, {}, next);
      h.api.session.id = async () => "session-2";
      await h.handlers.get(newerEvent)!(h.api, {}, next);
      if (newerEvent !== "session.end") await h.handlers.get("classic.SubagentStart")!(h.api, { agent_id: "child" }, next);
      resolve("session-1"); await old;
      assert.equal(h.environment.get("CLAUDE_WORKSPACES_COMPLETION_SESSION"), newerEvent === "session.end" ? "" : "session-2");
      if (newerEvent !== "session.end") {
        await h.handlers.get("turn.complete")!(h.api, { agentId: "child", reason: "answer", isAborted: false }, next);
        const first = JSON.parse(h.publications[0]!.options.stdin), last = JSON.parse(h.publications[1]!.options.stdin);
        assert.equal(last.agent_generation, first.agent_generation); assert.equal(typeof last.agent_generation, "string");
      }
      await h.handlers.get("session.end")!(h.api, {}, next);
    });
  }
  it("serializes readiness writes so an in-flight old write cannot remain the final marker", async () => {
    const h = await harness(true), next = async () => undefined;
    let resolve!: () => void;
    const writes: string[] = [];
    h.api.env.set = async (name, value) => {
      writes.push(value);
      if (value === "session-1") await new Promise<void>(done => { resolve = done; });
      h.environment.set(name, value);
    };
    const old = h.handlers.get("session.start")!(h.api, {}, next);
    for (let i = 0; i < 10 && !resolve; i++) await Promise.resolve();
    assert(resolve, "first readiness write must start");
    h.controls.sessionId = "session-2";
    const fresh = h.handlers.get("classic.SessionStart")!(h.api, {}, next);
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(writes, ["session-1"]);
    resolve(); await Promise.all([old, fresh]);
    assert.deepEqual(writes, ["session-1", "session-2"]);
    assert.equal(h.environment.get("CLAUDE_WORKSPACES_COMPLETION_SESSION"), "session-2");
    await h.handlers.get("session.end")!(h.api, {}, next);
  });
  for (const initialExitCode of [0, 1]) {
    it(`retries a child after initial writer exit ${initialExitCode} without replaying the parent`, async () => {
      let time = 0;
      const originalNow = Date.now;
      let h: Awaited<ReturnType<typeof harness>>;
      try { Date.now = () => time; h = await harness(true); } finally { Date.now = originalNow; }
      const next = async () => undefined;
      await h.handlers.get("session.start")!(h.api, {}, next);
      await h.handlers.get("classic.SubagentStart")!(h.api, { agent_id: "child" }, next);
      h.controls.exitCode = initialExitCode;
      await h.handlers.get("turn.complete")!(h.api, { agentId: "child", reason: "answer", isAborted: false }, next);
      h.controls.exitCode = 0;
      await h.handlers.get("turn.complete")!(h.api, { reason: "answer", isAborted: false }, next);
      assert.equal(h.publications.length, 3);
      const timer = h.timers.find(timer => !timer.cancelled)!;
      assert.equal(timer.ms, 5000); time = 5000; timer.cancelled = true; await timer.fn();
      assert.equal(h.publications.length, 4);
      assert.deepEqual(JSON.parse(h.publications[3]!.options.stdin), JSON.parse(h.publications[1]!.options.stdin));
      assert(h.timers.every(timer => timer.cancelled));
      await h.handlers.get("session.end")!(h.api, {}, next);
    });
  }
  it("pairs generation metadata and schedules child retry after the original publication", async () => {
    const h = await harness(true), next = async () => ({ unchanged: true });
    await h.handlers.get("session.start")!(h.api, {}, next);
    await h.handlers.get("classic.SubagentStart")!(h.api, { agent_id: "child" }, next);
    await h.handlers.get("turn.complete")!(h.api, { agentId: "child", reason: "answer", isAborted: false }, next);
    const [start, completion] = h.publications.map(value => JSON.parse(value.options.stdin));
    assert.equal(typeof start.agent_generation, "string");
    assert.equal(completion.agent_generation, start.agent_generation);
    assert.equal(h.timers.filter(timer => !timer.cancelled).length, 1);
    assert(h.timers[0]!.ms > 0 && h.timers[0]!.ms <= 5000);
    await h.handlers.get("session.end")!(h.api, {}, next);
    assert(h.timers.every(timer => timer.cancelled));
  });
  it("captures an old completion generation before downstream middleware lets the same ID restart", async () => {
    const h = await harness(true), next = async () => undefined;
    await h.handlers.get("session.start")!(h.api, {}, next);
    await h.handlers.get("classic.SubagentStart")!(h.api, { agent_id: "child" }, next);
    const original = JSON.parse(h.publications[0]!.options.stdin).agent_generation;
    assert.equal(typeof original, "string");
    let resolve!: () => void;
    const pending = h.handlers.get("turn.complete")!(h.api, { agentId: "child", reason: "answer", isAborted: false },
      () => new Promise<void>(done => { resolve = done; }));
    await h.handlers.get("classic.SubagentStart")!(h.api, { agent_id: "child" }, next);
    const fresh = JSON.parse(h.publications[1]!.options.stdin).agent_generation;
    assert.notEqual(fresh, original);
    resolve(); await pending;
    assert.equal(JSON.parse(h.publications[2]!.options.stdin).agent_generation, original);
    assert(h.timers.every(timer => timer.cancelled));
    await h.handlers.get("session.end")!(h.api, {}, next);
  });
  it("never schedules a parent completion retry even with recovery available", async () => {
    const h = await harness(true), next = async () => undefined;
    await h.handlers.get("session.start")!(h.api, {}, next);
    await h.handlers.get("turn.complete")!(h.api, { reason: "answer", isAborted: false }, next);
    assert.equal(h.publications.length, 1); assert.equal(h.timers.length, 0);
  });
  it("does not confirm or retry a versioned child when downstream completion rejects", async () => {
    const h = await harness(true), next = async () => undefined;
    await h.handlers.get("session.start")!(h.api, {}, next);
    await h.handlers.get("classic.SubagentStart")!(h.api, { agent_id: "child" }, next);
    const error = new Error("downstream decision");
    await assert.rejects(h.handlers.get("turn.complete")!(h.api,
      { agentId: "child", reason: "answer", isAborted: false }, async () => { throw error; }), value => value === error);
    assert.equal(h.publications.length, 1); assert.equal(h.timers.length, 0);
  });
  for (const failure of ["throwSession", "throwEnv"] as const) {
    it(`preserves a known child generation across a transient readiness ${failure}`, async () => {
      const h = await harness(true), next = async () => undefined;
      await h.handlers.get("session.start")!(h.api, {}, next);
      await h.handlers.get("classic.SubagentStart")!(h.api, { agent_id: "child" }, next);
      const generation = JSON.parse(h.publications[0]!.options.stdin).agent_generation;
      assert.equal(typeof generation, "string");
      h.controls[failure] = true;
      await h.handlers.get("classic.SessionStart")!(h.api, {}, next);
      h.controls[failure] = false;
      await h.handlers.get("turn.complete")!(h.api, { agentId: "child", reason: "answer", isAborted: false }, next);
      assert.equal(JSON.parse(h.publications[1]!.options.stdin).agent_generation, generation);
      assert.equal(h.timers.filter(timer => !timer.cancelled).length, 1);
      assert.equal(h.diagnostics.length, 1);
      await h.handlers.get("session.end")!(h.api, {}, next);
    });
  }
  it("pairs starts with confirmed completions and preserves other middleware results", async () => {
    const h = await harness();
    const result = { decision: "block", private: "unchanged" };
    const next = async () => result;
    assert.equal(h.handlers.has("classic.SubagentStop"), false);
    assert.equal(h.handlers.has("classic.Stop"), false);
    await h.handlers.get("session.start")!(h.api, {}, next);
    assert.equal(h.environment.get("CLAUDE_WORKSPACES_COMPLETION_SESSION"), "session-1");
    assert.strictEqual(await h.handlers.get("classic.SubagentStart")!(h.api, {
      agent_id: "a", prompt: "private prompt"
    }, next), result);
    for (const reason of ["answer", "aborted", "error", "refusal"]) {
      assert.strictEqual(await h.handlers.get("turn.complete")!(h.api, {
        agentId: "a", reason, isAborted: reason === "aborted", answer: "private answer"
      }, next), result);
    }
    assert.equal(h.publications.length, 5);
    for (const publication of h.publications) {
      assert.equal(publication.argv.at(-1), "C:/extension path/media/attention/report-activity.ps1");
      assert.equal(publication.options.timeoutMs, 5000);
      assert.doesNotMatch(publication.options.stdin, /private|answer":"private/);
      const payload = JSON.parse(publication.options.stdin);
      assert.equal(payload.session_id, "session-1");
      assert.equal(payload.agent_id, "a");
      assert.equal(payload.completion_reporter_ready, true);
    }
  });

  it("correlates parent completion from the session API and refreshes readiness on resume", async () => {
    const h = await harness();
    const next = async () => undefined;
    h.controls.sessionId = "resumed-session";
    await h.handlers.get("classic.SessionStart")!(h.api, {}, next);
    assert.equal(h.environment.get("CLAUDE_WORKSPACES_COMPLETION_SESSION"), "resumed-session");
    await h.handlers.get("turn.complete")!(h.api, { reason: "answer", isAborted: false }, next);
    assert.deepEqual(JSON.parse(h.publications[0]!.options.stdin), {
      session_id: "resumed-session", completion_reporter_ready: true,
      hook_event_name: "TurnComplete", completion_reason: "answer", is_aborted: false
    });
    await h.handlers.get("session.end")!(h.api, {}, next);
    assert.equal(h.environment.get("CLAUDE_WORKSPACES_COMPLETION_SESSION"), "");
  });

  it("keeps delivery failures fail-open with a metadata-free diagnostic", async () => {
    const h = await harness();
    const result = { unchanged: true };
    for (const throwProcess of [false, true]) {
      h.controls.exitCode = 1;
      h.controls.throwProcess = throwProcess;
      assert.strictEqual(await h.handlers.get("turn.complete")!(h.api, {
        reason: "error", isAborted: false, answer: "private answer"
      }, async () => result), result);
    }
    assert.equal(h.diagnostics.length, 2);
    assert.doesNotMatch(h.diagnostics.join(""), /private|session-1/);
  });

  for (const name of ["session.start", "classic.SessionStart", "session.end", "classic.SubagentStart", "turn.complete"]) {
    const failures: Array<"throwSession" | "throwEnv"> = name === "session.end" ? ["throwEnv"]
      : name === "session.start" || name === "classic.SessionStart" ? ["throwSession", "throwEnv"] : ["throwSession"];
    for (const failure of failures) {
      it(`forwards ${name} exactly once when ${failure} fails`, async () => {
        const h = await harness();
        h.controls[failure] = true;
        const event = { reason: "answer", isAborted: false };
        const result = { untouched: true };
        let calls = 0;
        const returned = await h.handlers.get(name)!(h.api, event, async (received) => {
          calls++;
          assert.strictEqual(received, event);
          return result;
        });
        assert.strictEqual(returned, result);
        assert.equal(calls, 1);
      });
    }

    for (const failure of ["throw", "reject"]) {
      it(`preserves downstream ${failure} identity from ${name} without retrying next`, async () => {
        const h = await harness();
        Object.assign(h.controls, { throwSession: true, throwEnv: true, throwProcess: true, logFailure: "throw" });
        const error = new Error("downstream decision");
        let calls = 0;
        await assert.rejects(h.handlers.get(name)!(h.api, {}, () => {
          calls++;
          if (failure === "throw") { throw error; }
          return Promise.reject(error);
        }), (received: unknown) => received === error);
        assert.equal(calls, 1);
        if (name === "turn.complete") { assert.equal(h.publications.length, 0); }
      });
    }
  }

  for (const name of ["classic.SubagentStart", "turn.complete"]) {
    for (const logFailure of ["throw", "reject"]) {
      for (const throwProcess of [false, true]) {
        it(`forwards ${name} when process ${throwProcess ? "rejects" : "exits nonzero"} and log ${logFailure}s`, async () => {
          const h = await harness();
          Object.assign(h.controls, { exitCode: 1, throwProcess, logFailure });
          const result = { unchanged: true };
          let calls = 0;
          const unhandled: unknown[] = [];
          const onUnhandled = (error: unknown) => { unhandled.push(error); };
          process.on("unhandledRejection", onUnhandled);
          try {
            assert.strictEqual(await h.handlers.get(name)!(h.api, {}, async () => {
              calls++;
              return result;
            }), result);
            await new Promise<void>((resolve) => setImmediate(resolve));
            assert.equal(calls, 1);
            assert.deepEqual(unhandled, [], "diagnostic rejection must be consumed");
            assert.deepEqual(h.diagnostics, ["Claude Workspaces attention signal delivery failed."]);
          } finally {
            process.off("unhandledRejection", onUnhandled);
          }
        });
      }
    }
  }

  it("publishes completion only after downstream middleware resolves", async () => {
    const h = await harness();
    let resolveNext!: (result: object) => void;
    const result = { decision: "block" };
    const pending = h.handlers.get("turn.complete")!(h.api, { reason: "answer", isAborted: false },
      () => new Promise<object>((resolve) => { resolveNext = resolve; }));
    assert.equal(h.publications.length, 0);
    resolveNext(result);
    assert.strictEqual(await pending, result);
    assert.equal(h.publications.length, 1);
  });

  it("publishes only the allowlisted metadata from private events and downstream results", async () => {
    const h = await harness();
    const privateFields = { prompt: "private prompt", response: "private response", transcript: "private transcript", toolResult: "private tool result" };
    const next = async () => privateFields;
    await h.handlers.get("classic.SubagentStart")!(h.api, { agent_id: "agent-1", ...privateFields }, next);
    await h.handlers.get("turn.complete")!(h.api, { agentId: "agent-1", reason: "refusal", isAborted: false, ...privateFields }, next);
    assert.deepEqual(h.publications.map(({ options }) => JSON.parse(options.stdin)), [
      { session_id: "session-1", completion_reporter_ready: true, hook_event_name: "SubagentStart", agent_id: "agent-1" },
      { session_id: "session-1", completion_reporter_ready: true, hook_event_name: "TurnComplete", agent_id: "agent-1", completion_reason: "refusal", is_aborted: false }
    ]);
  });
});
