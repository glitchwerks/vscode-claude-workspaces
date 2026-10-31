import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const probePath = resolve("out/test/support/composerNativeProbe.js");

async function run(args: readonly string[]) {
  try {
    const result = await execute(process.execPath, [probePath, ...args], { timeout: 5000 });
    return { ...result, code: 0 };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return failure;
  }
}

describe("opt-in composer native probe", () => {
  it("recognizes the production-adapter control while keeping native execution opt-in", async () => {
    const args = ["--scenario", "product-control", "--claude-executable", resolve(".tmp/nonexistent-composer-cli.exe")];
    assert.equal((await run(args)).code, 2);
    const optedIn = await run(["--run-live", ...args]);
    assert.equal(optedIn.code, 1);
    assert.equal(optedIn.stdout, "");
    assert.doesNotMatch(optedIn.stderr, /nonexistent-composer-cli/);
  });
  it("keeps loading the shipped plugin behind the same native opt-in", async () => {
    const args=["--with-shipped-plugin","--claude-executable",resolve(".tmp/nonexistent-composer-cli.exe")];
    assert.equal((await run(args)).code,2);
    assert.equal((await run(["--run-live",...args])).code,1);
  });
  it("fails closed when recording a deliberately dropped prompt throws", async () => {
    type Next = (() => Promise<unknown>) & { called: boolean };
    type Handler = (api: unknown, event: unknown, next: Next) => Promise<unknown>;
    let handler: Handler | undefined;
    let fallback: Handler | undefined;
    const source = await readFile("test/fixtures/composer/probe-plugin/hooks/register.js", "utf8");
    const load = new Function("url", "return import(url)") as (url: string) => Promise<{ register(on: unknown): void }>;
    const fixture = await load(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
    fixture.register((event: string, matcherOrHandler: unknown, maybeHandler?: Handler) => {
      if (event === "prompt.submit") handler = (maybeHandler ?? matcherOrHandler) as Handler;
      return { catch: (caught: Handler) => { if (event === "prompt.submit") fallback = caught; } };
    });
    let nativeCalls = 0;
    const next = Object.assign(async () => { nativeCalls++; return { text: "should not enter" }; }, { called: false });
    const api = { fs: { write: async () => { throw new Error("fixture storage unavailable"); } } };
    assert.equal(typeof handler, "function");
    assert.equal(typeof fallback, "function");
    let result: unknown;
    try { result = await handler!(api, { text: "controlled drop" }, next); }
    catch { result = await fallback!(api, { text: "controlled drop" }, next); }
    assert.equal(nativeCalls, 0);
    assert.equal(typeof (result as { drop?: unknown }).drop, "string");
  });

  it("imports without starting native work or printing a receipt", async () => {
    const result = await execute(process.execPath, ["-e",
      `require(${JSON.stringify(probePath)}); process.stdout.write('imported')`], { timeout: 5000 });
    assert.equal(result.stdout, "imported");
    assert.equal(result.stderr, "");
  });

  it("refuses default CI execution before touching the supplied executable", async () => {
    const result = await run(["--claude-executable", "missing-native-executable"]);
    assert.equal(result.code, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /requires --run-live and --claude-executable/);
    assert.doesNotMatch(result.stderr, /ENOENT|spawn|missing-native-executable/);
  });

  it("requires an executable even with live opt-in", async () => {
    const result = await run(["--run-live"]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /requires --run-live and --claude-executable/);
  });

  it("rejects unknown arguments before native execution", async () => {
    const result = await run(["--run-live", "--claude-executable", "missing-native-executable", "--unexpected"]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Unsupported probe arguments/);
    assert.doesNotMatch(result.stderr, /ENOENT|spawn|missing-native-executable/);
  });

  it("rejects unrecognized scenarios before native execution", async () => {
    const result = await run(["--run-live", "--claude-executable", process.execPath, "--scenario", "arbitrary-code"]);
    assert.equal(result.code, 2);
    assert.match(result.stderr, /Unknown probe scenario/);
  });

  for (const scenario of ["live-basic", "live-busy", "live-file", "live-skill", "live-interrupt", "live-product-basic", "live-product-busy", "live-product-file", "live-product-skill"]) {
    it(`requires separate model opt-in for ${scenario}`, async () => {
      const result = await run(["--run-live", "--claude-executable", process.execPath, "--scenario", scenario]);
      assert.equal(result.code, 2);
      assert.match(result.stderr, /requires --allow-model/);
    });
  }

  it("exports only strict boolean observations, excluding private receipt text", async () => {
    const result = await execute(process.execPath, ["-e", `
      const { sanitizeReceipt } = require(${JSON.stringify(probePath)});
      process.stdout.write(JSON.stringify(sanitizeReceipt({
        ready: true, sawCommand: true, sawSubmit: "private prompt", text: "PRIVATE",
        path: "PRIVATE", token: "PRIVATE", filled: true
      })));
    `]);
    assert.deepEqual(JSON.parse(result.stdout), {
      ready: true, hasBuiltin: false, hasFixtureCommand: false, promptInitiallyEmpty: false,
      sawCommand: true, sawSubmit: false, routedCommand: false, dropped: false,
      filled: true, submittedTextPreserved: false, dialogConfirmed: false, dialogAnswered: false,
      accepted: false, ackBeforeCompletion: false, replyObserved: false, turnCompleted: false, nativeWaitFlag: false,
      targetedBusyTurn: false, hasFixtureSkill: false, fileContentObserved: false, skillExpanded: false,
      rejected: false, noSubmit: false, terminalDraftPreserved: false,
      identityMatches: false, builtinRan: false, interrupted: false,
      dialogPending: false, nativeInputUnavailableAfterSend: false,
      unconfirmed: false, noAutoRetry: false, commandAwaitedPrompt: false,
      productCatalogReady:false,productContextAccepted:false,productDuplicateSuppressed:false,
      productPromptNotAccepted:false,productSkillNotAccepted:false,productTerminalDraftRejected:false,productDialogRejected:false,
      hostAckBeforeCompletion:false
    });
  });

  it("does not report a successful control when its action receipt is missing", async () => {
    const result = await execute(process.execPath, ["-e", `
      const { controlPassed } = require(${JSON.stringify(probePath)});
      const ready = { ready: true, hasBuiltin: true, hasFixtureCommand: true, hasFixtureSkill: true, promptInitiallyEmpty: true, identityMatches: true };
      process.stdout.write(JSON.stringify([
        controlPassed('inventory', ready, undefined),
        controlPassed('direct-command', ready, undefined),
        controlPassed('direct-command', ready, { sawSubmit: true, dropped: true }),
        controlPassed('fill-command', ready, { filled: true, sawCommand: true }),
        controlPassed('fill-command', ready, { filled: true }),
        controlPassed('arbitrary', ready, {}),
        controlPassed('fill-dialog-race', ready, { filled: true, dialogConfirmed: true, sawCommand: true, dialogPending: true, nativeInputUnavailableAfterSend: true, dialogAnswered: false }),
        controlPassed('fill-dialog-race', ready, { filled: true }),
        controlPassed('fill-permission-race', ready, { filled: true, dialogConfirmed: true, sawCommand: true, dialogPending: true, nativeInputUnavailableAfterSend: true, dialogAnswered: false }),
        controlPassed('fill-queue-command', ready, { filled: true, sawCommand: true }),
        controlPassed('live-basic', ready, { filled: true, accepted: true, ackBeforeCompletion: true, replyObserved: true, turnCompleted: true }),
        controlPassed('live-basic', ready, { filled: true, accepted: true, turnCompleted: true }),
        controlPassed('live-file', ready, { filled: true, accepted: true, ackBeforeCompletion: true, replyObserved: true, turnCompleted: true, fileContentObserved: true }),
        controlPassed('live-skill', ready, { filled: true, accepted: true, ackBeforeCompletion: true, replyObserved: true, turnCompleted: true, skillExpanded: true }),
        controlPassed('pending-terminal', ready, { rejected: true, noSubmit: true, terminalDraftPreserved: true }),
        controlPassed('dialog-reject', ready, { rejected: true, noSubmit: true, dialogConfirmed: true }),
        controlPassed('drop-prompt', ready, { sawSubmit: true, dropped: true }),
        controlPassed('inventory', { ready: true }, {}),
        controlPassed('builtin-context', ready, { filled: true, sawCommand: true, builtinRan: true }),
        controlPassed('live-interrupt', ready, { filled: true, accepted: true, ackBeforeCompletion: true, interrupted: true, targetedBusyTurn: true, nativeWaitFlag: true }),
        controlPassed('fill-dialog-race', ready, { filled: true, dialogConfirmed: true, sawCommand: true, dialogPending: true, nativeInputUnavailableAfterSend: true, dialogAnswered: true }),
        controlPassed('lost-command-ack', ready, { filled: true, sawCommand: true, unconfirmed: true, noAutoRetry: true }),
        controlPassed('drop-skill', ready, { filled: true, sawSubmit: true, routedCommand: true, dropped: true, commandAwaitedPrompt: true })
      ]));
    `]);
    assert.deepEqual(JSON.parse(result.stdout), [true, false, true, true, false, false, true, false, true, true, true, false, true, true, true, true, true, false, true, true, false, true, true]);
  });
});
