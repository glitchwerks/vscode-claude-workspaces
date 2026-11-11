import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";
import { createClaudeComposerAdapter, supportsComposerVersion, FileComposerTransport } from "../../src/composer/claudeComposerAdapter";
import type { ComposerTransport, BridgeBinding } from "../../src/composer/composerBroker";
import type { ComposerTarget } from "../../src/composer/composerTypes";
import type { LaunchSpec } from "../../src/launch/launchPlanner";
import { composerFirstUuid, composerSession } from "../support/composerHarness";

const target: ComposerTarget = {sessionId: "managed-first", claudeSessionId: composerFirstUuid, generation: "33333333-3333-4333-8333-333333333333"};
const spec = {executable: "C:/fixture/claude.exe", args: ["--session-id", composerFirstUuid], env: {KEEP: "original"}, cwd: "I:/fixture"} as unknown as LaunchSpec;

describe("private Claude composer adapter", () => {
  for(const kind of ["prepared","result"] as const){
    it(`ignores a late ${kind} response from an earlier request while the current slot is active`,async()=>{
      const controller=new AbortController();const token="a".repeat(64);const current="44444444-4444-4444-8444-444444444444";
      const transport=new FileComposerTransport({directory:storagePath,target,token});
      let prepared=0;let settled=false;
      const sending=transport.exchange({protocol:1,token,target,requestId:current,operation:"submit",draft:composerSession().draft},async()=>{prepared++;},controller.signal);
      void sending.then(()=>{settled=true;},()=>{settled=true;});
      try{
        const deadline=Date.now()+1000;
        while(Date.now()<deadline){try{await readFile(path.join(storagePath,"request.json"));break;}catch{await delay(5);}}
        const identity={protocol:1,token,target,requestId:"55555555-5555-4555-8555-555555555555"};
        await writeFile(path.join(storagePath,"response.json"),JSON.stringify({...identity,kind,...(kind==="prepared"?{queueBinding:"ctrl+x enter"}:{status:"unconfirmed"})}));
        await delay(80);assert.equal(settled,false,"stale responses cannot finish the current exchange");assert.equal(prepared,0,"stale preparation cannot dispatch native keys");
        await writeFile(path.join(storagePath,"response.json"),JSON.stringify({...identity,requestId:current,kind:"result",status:"accepted"}));
        assert.equal((await sending as {requestId:string}).requestId,current);
      }finally{controller.abort();await sending.catch(()=>undefined);await transport.close();}
    });
  }
  it("retries host directory initialization after a transient filesystem failure",async()=>{
    const blocked=path.join(storagePath,"temporarily-blocked");await writeFile(blocked,"occupied");
    const adapter=await createClaudeComposerAdapter({storagePath:blocked,platform:"win32",resolveTarget:()=>target,writeQueue:async()=>undefined,
      transportFactory:async()=>({exchange:async()=>undefined,close:async()=>undefined})});
    try{
      assert.equal(await adapter.prepareLaunch(spec,target,"2.1.299"),spec);
      await rm(blocked);await mkdir(blocked);
      const prepared=await adapter.prepareLaunch(spec,target,"2.1.299");
      assert.ok(prepared.env.CLAUDE_WORKSPACES_COMPOSER_CHANNEL);assert.equal(adapter.isAvailable(target),false);
    }finally{await adapter.close();}
  });
  let storagePath = "";
  const storageRoot=path.resolve(".tmp/145-execution");
  beforeEach(async () => {
    storagePath="";
    await mkdir(storageRoot,{recursive:true});
    storagePath=await mkdtemp(path.join(storageRoot,"adapter-"));
  });
  afterEach(async () => {
    if(!storagePath)return;
    assert.ok(path.resolve(storagePath).startsWith(storageRoot+path.sep) && path.basename(storagePath).startsWith("adapter-"));
    await rm(storagePath, {recursive: true, force: true});
  });

  it("keeps a host binding unavailable until an authenticated native ready frame arrives",async()=>{
    const adapter=await createClaudeComposerAdapter({storagePath,platform:"win32",resolveTarget:()=>target,writeQueue:async()=>undefined});
    try{
      const planned=await adapter.prepareLaunch(spec,target,"2.1.322");
      const directory=planned.env.CLAUDE_WORKSPACES_COMPOSER_CHANNEL!;
      assert.ok(directory,"Channel injection must not wait for native readiness");
      assert.equal(adapter.isAvailable(target),false,"A registered host channel is not a native-ready acknowledgement");
      const observable=adapter as typeof adapter & {onDidChangeAvailability:(listener:()=>void)=>{dispose:()=>void}};
      let changed=0;const subscription=observable.onDidChangeAvailability(()=>{changed++;});
      await writeFile(path.join(directory,"native-ready.json"),JSON.stringify({protocol:1,token:planned.env.CLAUDE_WORKSPACES_COMPOSER_TOKEN,target,kind:"ready"}));
      for(let tick=0;tick<100 && !adapter.isAvailable(target);tick++)await delay(5);
      assert.equal(adapter.isAvailable(target),true);assert.equal(changed,1);subscription.dispose();
    }finally{await adapter.close();}
  });

  it("rejects malformed, forged, wrong-target and extra native readiness fields and notifies once",async function(){
    this.timeout(6_000);
    const adapter=await createClaudeComposerAdapter({storagePath,platform:"win32",resolveTarget:()=>target,writeQueue:async()=>undefined});
    try{
      const planned=await adapter.prepareLaunch(spec,target,"2.1.322");const directory=planned.env.CLAUDE_WORKSPACES_COMPOSER_CHANNEL!;
      const valid={protocol:1,token:planned.env.CLAUDE_WORKSPACES_COMPOSER_TOKEN,target,kind:"ready"};let changed=0;
      const subscription=adapter.onDidChangeAvailability!(()=>{changed++;});
      for(const frame of ["{",{...valid,protocol:2},{...valid,token:"b".repeat(64)},{...valid,target:{...target,sessionId:"retired"}},
        {...valid,target:{...target,claudeSessionId:"22222222-2222-4222-8222-222222222222"}},
        {...valid,target:{...target,generation:"44444444-4444-4444-8444-444444444444"}},{...valid,extra:true},{...valid,kind:"catalog"}]){
        await writeFile(path.join(directory,"native-ready.json"),typeof frame==="string"?frame:JSON.stringify(frame));await delay(280);
        assert.equal(adapter.isAvailable(target),false);assert.equal(changed,0);
      }
      await writeFile(path.join(directory,"native-ready.json"),JSON.stringify(valid));
      for(let tick=0;tick<200 && !adapter.isAvailable(target);tick++)await delay(5);assert.equal(adapter.isAvailable(target),true);assert.equal(changed,1);
      await writeFile(path.join(directory,"native-ready.json"),JSON.stringify(valid));await delay(300);assert.equal(changed,1);subscription.dispose();
    }finally{await adapter.close();}
  });
  it("retains an early ready acknowledgement and ignores late frames after replacement and disposal",async()=>{
    let current=target;const captured:BridgeBinding[]=[];
    const adapter=await createClaudeComposerAdapter({storagePath,platform:"win32",resolveTarget:()=>current,writeQueue:async()=>undefined,
      transportFactory:async binding=>{captured.push(binding);if(captured.length===1)await writeFile(path.join(binding.directory,"native-ready.json"),JSON.stringify({protocol:1,token:binding.token,target:binding.target,kind:"ready"}));return {exchange:async()=>undefined,close:async()=>{}};}});
    try{
      await adapter.prepareLaunch(spec,target,"2.1.322");for(let tick=0;tick<200 && !adapter.isAvailable(target);tick++)await delay(5);
      assert.equal(adapter.isAvailable(target),true,"A frame published before observer registration remains available");
      let changed=0;adapter.onDidChangeAvailability!(()=>{changed++;});
      current={...target,generation:"44444444-4444-4444-8444-444444444444"};await adapter.prepareLaunch(spec,current,"2.1.322");
      const binding=captured[1]!;await writeFile(path.join(binding.directory,"native-ready.json"),JSON.stringify({protocol:1,token:captured[0]!.token,target,kind:"ready"}));await delay(280);
      assert.equal(adapter.isAvailable(target),false);assert.equal(adapter.isAvailable(current),false);assert.equal(changed,0);
      await adapter.disposeSession(current);await mkdir(binding.directory,{recursive:true});
      await writeFile(path.join(binding.directory,"native-ready.json"),JSON.stringify({protocol:1,token:binding.token,target:current,kind:"ready"}));await delay(280);
      assert.equal(adapter.isAvailable(current),false);assert.equal(changed,0);
    }finally{await adapter.close();}
  });

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
