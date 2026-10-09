import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

type Handler = (api: unknown, event: Record<string, unknown>, next: (event: unknown) => Promise<unknown>) => Promise<unknown>;

async function harness() {
  const source = await readFile("media/attention/hooks/register.js", "utf8");
  const load = new Function("url", "return import(url)") as (url: string) => Promise<{ register(on: unknown): void }>;
  const module = await load(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
  const handlers = new Map<string, Handler>();
  module.register((event: string, handler: Handler) => handlers.set(event, handler));
  const publications: Array<{ argv: string[]; options: { stdin: string; timeoutMs: number } }> = [];
  const environment = new Map<string, string>();
  const diagnostics: string[] = [];
  const controls = {
    sessionId: "session-1", exitCode: 0, throwProcess: false,
    throwSession: false, throwEnv: false, logFailure: "none"
  };
  const api = {
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
  return { handlers, publications, environment, diagnostics, controls, api };
}

describe("confirmed attention completion mod", () => {
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
