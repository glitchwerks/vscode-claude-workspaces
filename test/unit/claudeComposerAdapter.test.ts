import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { createClaudeComposerAdapter, supportsComposerVersion } from "../../src/composer/claudeComposerAdapter";
import type { ComposerTransport, BridgeBinding } from "../../src/composer/composerBroker";
import type { ComposerTarget } from "../../src/composer/composerTypes";
import type { LaunchSpec } from "../../src/launch/launchPlanner";
import { composerFirstUuid, composerSession } from "../support/composerHarness";

const target: ComposerTarget = {sessionId: "managed-first", claudeSessionId: composerFirstUuid, generation: "33333333-3333-4333-8333-333333333333"};
const spec = {executable: "C:/fixture/claude.exe", args: ["--session-id", composerFirstUuid], env: {KEEP: "original"}, cwd: "I:/fixture"} as unknown as LaunchSpec;

describe("private Claude composer adapter", () => {
  let storagePath: string;
  beforeEach(async () => { storagePath = await mkdtemp(path.resolve(".tmp/145-execution/adapter-")); });
  afterEach(async () => { await rm(storagePath, {recursive: true, force: true}); });

  it("enforces the approved composer-only version floor without changing a launch", async () => {
    for (const version of [undefined, "2.1.287", "2.1.290", "2.1.298", "garbage", "2.1.299-beta"]) {
      assert.equal(supportsComposerVersion(version), false);
    }
    for (const version of ["2.1.299", "2.1.312 (Claude Code)", "2.2.0", "3.0.0"]) {
      assert.equal(supportsComposerVersion(version), true);
    }
    const adapter = await createClaudeComposerAdapter({storagePath, platform: "win32", resolveTarget: () => target, writeQueue: async () => undefined});
    assert.equal(await adapter.prepareLaunch(spec, target, "2.1.287"), spec);
    assert.equal((await adapter.submit({target, submissionId: "44444444-4444-4444-8444-444444444444", draft: composerSession().draft})).status, "rejected");
    assert.deepEqual(spec.env, {KEEP: "original"});
    await adapter.close();
  });

  it("isolates host/session credentials and preserves arguments and existing environment", async () => {
    const bindings: BridgeBinding[] = [];
    const transportFactory = async (binding: BridgeBinding): Promise<ComposerTransport> => {
      bindings.push(binding);
      return {exchange: async () => undefined, close: async () => undefined};
    };
    const adapter = await createClaudeComposerAdapter({storagePath, platform: "win32", resolveTarget: () => target, writeQueue: async () => undefined, transportFactory});
    const planned = await adapter.prepareLaunch(spec, target, "2.1.299");
    assert.deepEqual(planned.args, spec.args);
    assert.equal(planned.env.KEEP, "original");
    assert.equal(planned.env.CLAUDE_WORKSPACES_COMPOSER_SESSION, target.sessionId);
    assert.equal(planned.env.CLAUDE_WORKSPACES_COMPOSER_UUID, target.claudeSessionId);
    assert.match(planned.env.CLAUDE_WORKSPACES_COMPOSER_TOKEN!, /^[a-f0-9]{64}$/);
    assert.equal(bindings.length, 1);
    assert.ok(bindings[0]!.directory.startsWith(storagePath + path.sep));
    await adapter.close();
    assert.deepEqual(await readdir(storagePath), []);
  });

  it("leaves unsupported platforms and remote sessions on their normal terminal path", async () => {
    for (const context of [{platform: "linux" as const}, {platform: "win32" as const, remoteName: "ssh-remote"}]) {
      const adapter = await createClaudeComposerAdapter({...context, storagePath, resolveTarget: () => target, writeQueue: async () => undefined});
      assert.equal(await adapter.prepareLaunch(spec, target, "2.1.312"), spec);
      await adapter.close();
    }
    assert.deepEqual(await readdir(storagePath), []);
  });

  it("contains private channel initialization errors without exposing secrets or breaking launch", async () => {
    const diagnostics: string[] = [];
    const adapter = await createClaudeComposerAdapter({storagePath, platform: "win32", resolveTarget: () => target, writeQueue: async () => undefined,
      transportFactory: async () => { throw new Error("private token and prompt text"); }, onFailure: code => diagnostics.push(code)});
    assert.equal(await adapter.prepareLaunch(spec, target, "2.1.299"), spec);
    assert.doesNotMatch(JSON.stringify(diagnostics), /private token|prompt text/);
    await adapter.close();
    assert.deepEqual(await readdir(storagePath), []);
  });

  it("exchanges real private files, tolerates a partial reply and removes request text", async () => {
    let directory = "";
    const writes: string[] = [];
    const adapter = await createClaudeComposerAdapter({storagePath, platform:"win32", resolveTarget: () => target,
      writeQueue: async (_target, keys) => {
        writes.push(keys);
        const message = JSON.parse(await readFile(path.join(directory,"request.json"),"utf8"));
        await writeFile(path.join(directory,"response.json"), JSON.stringify({protocol:1,token:message.token,requestId:message.requestId,target,kind:"result",status:"accepted"}));
      }});
    try {
      const planned = await adapter.prepareLaunch(spec,target,"2.1.299");
      directory = planned.env.CLAUDE_WORKSPACES_COMPOSER_CHANNEL!;
      const sending = adapter.submit({target,submissionId:"44444444-4444-4444-8444-444444444444",draft:composerSession().draft});
      let message: Record<string, unknown> | undefined;
      for (let attempt=0; attempt<25; attempt++) {
        try { message = JSON.parse(await readFile(path.join(directory,"request.json"),"utf8")); break; } catch { await delay(10); }
      }
      if (message === undefined) {
        assert.equal((await sending).status, "accepted", "the default transport must write an owned native request");
        return;
      }
      assert.equal((message.draft as {text:string}).text, "first draft");
      await writeFile(path.join(directory,"response.json"), "{");
      await delay(40);
      assert.equal(writes.length,0);
      await writeFile(path.join(directory,"response.json"), JSON.stringify({protocol:1,token:message.token,requestId:message.requestId,target,kind:"prepared",queueBinding:"ctrl+x enter"}));
      assert.equal((await sending).status,"accepted");
      assert.deepEqual(writes,["\x18\r"]);
      assert.deepEqual(await readdir(directory),[]);
    } finally { await adapter.close(); }
  });

  it("removes only recognized channels whose owning host is dead", async () => {
    const owned = {schemaVersion:1,kind:"claude-workspaces-composer",processId:111};
    for (const [name,marker] of [["composer-dead",owned],["composer-live",{...owned,processId:222}],["composer-foreign",{processId:111}]] as const) {
      await mkdir(path.join(storagePath,name));
      await writeFile(path.join(storagePath,name,".owner.json"),JSON.stringify(marker));
    }
    await writeFile(path.join(storagePath,"sentinel"),"unrelated storage");
    const adapter=await createClaudeComposerAdapter({storagePath,platform:"win32",resolveTarget:()=>target,writeQueue:async()=>undefined,
      isProcessAlive:pid=>pid===222,transportFactory:async()=>({exchange:async()=>undefined,close:async()=>undefined})});
    await adapter.prepareLaunch(spec,target,"2.1.299");
    await adapter.close();
    assert.deepEqual((await readdir(storagePath)).sort(),["composer-foreign","composer-live","sentinel"]);
    assert.equal(await readFile(path.join(storagePath,"sentinel"),"utf8"),"unrelated storage");
  });
});
