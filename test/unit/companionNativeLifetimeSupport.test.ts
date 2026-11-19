import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fork } from "node:child_process";
import { mkdtemp, mkdir, realpath, rm, writeFile, readdir, rename } from "node:fs/promises";
import { build } from "esbuild";
// All tests in this file are synthetic source tests; none is Native qualification.
const supportPath=resolve("test/manual/companionNativeLifetimeSupport.cjs");
// Absence is asserted as a missing behavior rather than an import failure during RED.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const support=existsSync(supportPath)?require(supportPath):{};
const fixturePath=resolve("test/fixtures/companion/native-qualification/native-f-108f14b.receipt.json");
const sha=(bytes:Buffer)=>createHash("sha256").update(bytes).digest("hex");
describe("synthetic Trial L source support: historical actual F",()=>{
  it("reproduces the pinned raw actual receipt and validates its historical prerequisite",()=>{
    assert.equal(typeof support.parseFPrerequisite,"function","missing bounded historical F loader");
    const loaded=support.parseFPrerequisite(readFileSync(fixturePath));
    assert.equal(loaded.raw.length,9372);
    assert.equal(sha(loaded.raw),"787a6d007ade1fa389eb6daef12bc21bbd310563fe5d181283a48d1266c0f7dc");
    assert.equal(loaded.receipt.sourceSha,"108f14b1bb2086f5e49196a932bf6515fc661be6");
    assert.equal(loaded.receipt.productionAdmission,false);
  });
  it("rejects altered, truncated, noncanonical, extended and forged envelopes",()=>{
    assert.equal(typeof support.parseFPrerequisite,"function");
    const envelope=JSON.parse(readFileSync(fixturePath,"utf8"));
    for(const change of [{extra:true},{rawBytes:9371},{rawSha256:"a".repeat(64)},
      {rawBase64:envelope.rawBase64+"\n"},{rawBase64:envelope.rawBase64.slice(0,-4)},
      {rawBase64:Buffer.from(JSON.stringify({healthy:true})).toString("base64")}]) {
      assert.throws(()=>support.parseFPrerequisite(Buffer.from(JSON.stringify({...envelope,...change}))),/invalid-f-prerequisite/);
    }
    const raw=Buffer.from(envelope.rawBase64,"base64");
    const forged=JSON.parse(raw.toString()); forged.runtime.node="99.0.0";
    const bytes=Buffer.from(JSON.stringify(forged));
    assert.throws(()=>support.parseFPrerequisite(Buffer.from(JSON.stringify({...envelope,rawBase64:bytes.toString("base64"),rawBytes:bytes.length,rawSha256:sha(bytes)}))),/invalid-f-prerequisite/);
  });
  it("checks receipt-owned byte inventory without translating line endings or trusting a pass Boolean",async()=>{
    assert.equal(typeof support.verifyFDependencies,"function");
    const envelope=readFileSync(fixturePath);
    const read=async(name:string)=>readFileSync(resolve(name));
    // Controlled readers use the checked-out bytes only on the pinned Windows profile.
    if(process.platform==="win32") {
      const result=await support.verifyFDependencies(envelope,read);
      assert.equal(result.ok,true);
    }
    const result=await support.verifyFDependencies(envelope,async()=>Buffer.from("drift"));
    assert.equal(result.ok,false); assert.equal(result.reason,"dependency-drift");
    await assert.rejects(()=>support.verifyFDependencies(Buffer.from('{"pass":true}'),read),/invalid-f-prerequisite/);
    const loaded=await support.loadFPrerequisite(); assert.equal(loaded.raw.length,9372);
  });
});

type Json=ReturnType<typeof JSON.parse>;
const profile={platform:process.platform,arch:process.arch,node:process.versions.node,uv:process.versions.uv,electron:null};
const message=(id:string,kind:string,extra:Json={})=>({v:1,id,kind,deadlineMs:2000,...extra});

describe("synthetic Trial L source support: bounded protocol",()=>{
  it("rejects unknown fields, unsafe selectors, bad profiles and unbounded messages",()=>{
    assert.equal(typeof support.parseLifetimeMessage,"function","missing closed host protocol");
    assert.ok(support.parseLifetimeMessage(message("one","sweep")));
    assert.ok(support.parseLifetimeMessage(message("two","snapshot",{watch:{channel:"companion-"+"a".repeat(32),slot:0}})));
    for(const bad of [null,{},message("one","remove"),message("one","sweep",{path:"private"}),
      message("one","sweep",{deadlineMs:2001}),message("../x","stop"),
      message("one","snapshot",{watch:{channel:"../escape",slot:0}}),
      message("one","init",{storageRoot:"relative",profile}),
      message("one","init",{storageRoot:resolve(".tmp"),profile:{...profile,fake:true}}),
      message("one","sweep",{secret:"x".repeat(9000)})]) assert.equal(support.parseLifetimeMessage(bad),null);
  });
  it("serializes mutations, reports unknown timeout and later settlement, and never executes expired queued calls",async()=>{
    assert.equal(typeof support.createSerializedDispatcher,"function","missing serialized deadlines");
    const events:Json[]=[];const started:string[]=[];let finish:()=>void=()=>{};
    const dispatcher=support.createSerializedDispatcher(async(m:Json)=>{
      started.push(m.id);if(m.id==="first")await new Promise<void>(r=>{finish=r;});
      return {outcome:"ok",reason:"none",data:{}};
    },(event:Json)=>events.push(event));
    dispatcher.accept(message("first","sweep",{deadlineMs:10}));
    dispatcher.accept(message("second","sweep",{deadlineMs:10}));
    await new Promise(r=>setTimeout(r,30));
    assert.deepEqual(started,["first"]);
    assert.equal(events.filter(e=>e.phase==="deadline"&&e.outcome==="unknown").length,2);
    finish(); await dispatcher.settled();
    assert.deepEqual(started,["first"]);
    assert.equal(events.find(e=>e.id==="first"&&e.phase==="settled").late,true);
    assert.equal(events.find(e=>e.id==="second"&&e.phase==="settled").reason,"expired-before-start");
    dispatcher.accept(message("first","sweep"));
    assert.equal(events.at(-1).reason,"duplicate-id");
  });
  it("bounds the queue and converts thrown private errors to fixed failure enums",async()=>{
    const events:Json[]=[];let finish:()=>void=()=>{};
    const dispatcher=support.createSerializedDispatcher(async(m:Json)=>{
      if(m.id==="q-0")await new Promise<void>(r=>{finish=r;});
      throw new Error("PRIVATE PATH AND TOKEN");
    },(event:Json)=>events.push(event));
    for(let i=0;i<33;i++)dispatcher.accept(message("q-"+i,"sweep"));
    dispatcher.accept({secret:"PRIVATE"});
    await new Promise(r=>setImmediate(r));finish();await dispatcher.settled();
    assert.equal(events.find(e=>e.id==="q-32").reason,"protocol-limit");
    assert.equal(events.find(e=>e.id===null).reason,"invalid-message");
    assert.equal(events.filter(e=>e.reason==="operation-failed").length,32);
    assert.equal(JSON.stringify(events).includes("PRIVATE"),false);
  });
});

/** Own every child from creation through an observed close; only this handle can be killed. */
async function ownedHost(file:string) {
  const options={stdio:["ignore","ignore","ignore","ipc"] as ["ignore","ignore","ignore","ipc"],windowsHide:true};
  const child=fork(file,[],options);
  const received:Json[]=[];
  child.on("message",m=>received.push(m));
  const terminal=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(r=>child.once("close",(code,signal)=>r({code,signal})));
  let sequence=0;
  return {
    async request(kind:string,extra:Json={}):Promise<Json> {
      const id="call-"+(++sequence);child.send(message(id,kind,extra));
      const until=Date.now()+5000;
      while(Date.now()<until) {
        const reply=received.find(m=>m.id===id&&m.phase==="settled");if(reply)return reply;
        await new Promise(r=>setTimeout(r,5));
      }
      throw new Error("synthetic-owned-host-reply-deadline");
    },
    async close() {
      // Give an already-acknowledged normal stop its close witness before fallback termination.
      if(child.exitCode===null&&child.signalCode===null) {
        await Promise.race([terminal,new Promise(r=>setTimeout(r,100))]);
        if(child.exitCode===null&&child.signalCode===null)child.kill();
      }
      let timer:ReturnType<typeof setTimeout>|undefined;
      try {return await Promise.race([terminal,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("synthetic-owned-host-close-deadline")),5000);})]);}
      finally {clearTimeout(timer);}
    },
    terminal
  };
}

describe("synthetic Trial L generated host: real Capture composition",function(){
  this.timeout(30000);
  for(const field of ["hostId","channelId"] as const) {
    it(`charges malformed array-valued ${field} intent and matching unclaimed channel separately`,async()=>{
      await mkdir(resolve(".tmp"),{recursive:true});
      const directory=await realpath(await mkdtemp(resolve(".tmp/lifetime-host-synthetic-")));
      const capture=resolve(directory,"capture");await mkdir(capture);const file=resolve(directory,"host.cjs");
      await build({stdin:{contents:support.createLifetimeHostSource(),resolveDir:process.cwd()},bundle:true,platform:"node",format:"cjs",outfile:file,logLevel:"silent"});
      const h=await ownedHost(file);
      try {
        const init=await h.request("init",{storageRoot:capture,profile});
        if(process.platform!=="win32"||process.arch!=="x64"){assert.equal(init.reason,"profile-mismatch");return;}
        assert.equal(init.outcome,"ok");
        // Deliberately malformed synthetic fixture, never actual Native qualification evidence.
        const intent={v:1,kind:"claude-workspaces-admission",hostId:"a".repeat(32),processId:process.pid,channelId:"b".repeat(32)};
        const malformed=Buffer.from(JSON.stringify({...intent,[field]:[intent[field]]}));
        await writeFile(resolve(capture,"companion-admission.00.json"),malformed);
        await mkdir(resolve(capture,"companion-"+intent.channelId));
        const first=await h.request("snapshot",{watch:null});assert.equal(first.outcome,"ok");
        assert.equal(first.data.future.bytes,4240384);assert.equal(first.data.future.files,53);
        assert.equal(first.data.future.rootEntries,13);
        assert.equal(first.data.slots[0].channelLabel,null);assert.equal(first.data.channels[0].claimed,false);
        assert.equal(first.data.physical.files,1);assert.equal(first.data.physical.bytes,malformed.length);
        assert.equal(first.data.future.withinLimits,true);
        // Nine real admissions leave one namespace slot, but its projected charge would overflow.
        for(let i=0;i<9;i++)assert.equal((await h.request("prepare-additional")).outcome,"ok");
        const near=await h.request("snapshot",{watch:null});assert.equal(near.outcome,"ok");
        assert.equal(near.data.slots.length,10);assert.equal(near.data.future.bytes,23271424);
        assert.equal(near.data.future.files,242);assert.equal(near.data.future.withinLimits,true);
        assert.equal(near.data.future.nextPrepare.slotAvailable,true);
        assert.equal(near.data.future.nextPrepare.files,263);assert.equal(near.data.future.nextPrepare.withinLimits,false);
        assert.equal((await h.request("refuse")).outcome,"refused");
        // Another synthetic unclaimed channel also makes the CURRENT projection exceed 256 files.
        await mkdir(resolve(capture,"companion-"+"c".repeat(32)));
        const overflow=await h.request("snapshot",{watch:null});assert.equal(overflow.outcome,"ok");
        assert.equal(overflow.data.future.bytes,25385984);assert.equal(overflow.data.future.files,263);
        assert.equal(overflow.data.future.withinLimits,false);assert.equal(overflow.data.future.nextPrepare.withinLimits,false);
        assert.deepEqual(overflow.data.violations,["aggregate-limit"]);
        assert.equal(overflow.data.slots[0].channelLabel,null);
        assert.equal(overflow.data.channels.filter((channel:Json)=>!channel.claimed).length,2);
        assert.equal((await h.request("refuse")).outcome,"refused");
        assert.equal((await h.request("stop")).outcome,"ok");assert.equal((await h.close()).code,0);
      } finally {await h.close();await rm(directory,{recursive:true,force:true});}
    });
  }
  it("retains real intents across host stop/sweep, admits ten more bindings and exposes actual refusal/accounting",async()=>{
    assert.equal(typeof support.createLifetimeHostSource,"function","missing generated host composition");
    await mkdir(resolve(".tmp"),{recursive:true});
    const directory=await realpath(await mkdtemp(resolve(".tmp/lifetime-host-synthetic-")));
    const capture=resolve(directory,"capture"); await mkdir(capture);
    const hostFile=resolve(directory,"host.cjs");
    await build({stdin:{contents:support.createLifetimeHostSource(),resolveDir:process.cwd(),sourcefile:"lifetime-host.cjs"},bundle:true,platform:"node",format:"cjs",outfile:hostFile,logLevel:"silent"});
    const h1=await ownedHost(hostFile);let h2:Awaited<ReturnType<typeof ownedHost>>|undefined;
    try {
      const init=await h1.request("init",{storageRoot:capture,profile});
      if(process.platform!=="win32"||process.arch!=="x64") {
        assert.equal(init.reason,"profile-mismatch");return;
      }
      assert.equal(init.outcome,"ok");assert.equal(init.data.topology,"injected-qualification-probe-only/development");
      assert.equal((await h1.request("init",{storageRoot:capture,profile})).reason,"already-initialized");
      const primary=await h1.request("prepare-primary"); assert.equal(primary.outcome,"ok");
      assert.ok(primary.transient.environment);assert.ok(primary.transient.target.endsWith(".upload"));
      const watch=primary.transient.watch;
      const before=await h1.request("snapshot",{watch});assert.equal(before.outcome,"ok");
      assert.equal(before.data.physical.files,3);assert.equal(before.data.future.bytes,2125824);assert.equal(before.data.future.files,32);
      assert.equal((await h1.request("expose-primary")).outcome,"ok");
      assert.equal((await h1.request("expose-primary")).reason,"exposure-refused");
      h2=await ownedHost(hostFile);
      assert.equal((await h2.request("init",{storageRoot:capture,profile})).outcome,"ok");
      // H2 may be ready before the bounded hold, but live H1 is not cleanup authority.
      assert.equal((await h2.request("sweep")).outcome,"ok");
      assert.equal((await h2.request("snapshot",{watch})).data.watch.parent.identity,before.data.watch.parent.identity);
      assert.equal((await h1.request("stop")).data.storage,"preserved");
      assert.equal((await h1.close()).code,0);
      assert.equal((await h2.request("sweep")).outcome,"ok");
      const swept=(await h2.request("snapshot",{watch})).data;
      assert.equal(swept.watch.parent.state,"absent");assert.deepEqual(swept.watch.intent,before.data.watch.intent);
      const bindings=[];const targetLabels=[];const generationLabels=[];
      for(let i=0;i<10;i++) {
        const admitted:Json=await h2.request("prepare-additional");assert.equal(admitted.outcome,"ok");
        assert.equal(admitted.transient,undefined);bindings.push(admitted.data.bindingLabel);
        assert.match(admitted.data.targetLabel,/^[a-f0-9]{64}$/);assert.match(admitted.data.generationLabel,/^[a-f0-9]{64}$/);
        targetLabels.push(admitted.data.targetLabel);generationLabels.push(admitted.data.generationLabel);
      }
      assert.equal(new Set(bindings).size,10);
      assert.equal(new Set(targetLabels).size,10);assert.equal(new Set(generationLabels).size,10);
      assert.equal((await h2.request("refuse")).outcome,"refused");
      const full=(await h2.request("snapshot",{watch})).data;
      assert.equal(full.slots.length,11);assert.equal(full.future.bytes,23271424);assert.equal(full.future.files,242);
      assert.equal(full.future.nextPrepare.files,263);assert.equal(full.future.nextPrepare.withinLimits,false);
      assert.equal(full.physical.files,21);assert.deepEqual(full.watch.intent,swept.watch.intent);
      // Synthetic late file only exercises observer/accounting; never claims an SDK write.
      const late=resolve(capture,watch.channel);await mkdir(late);
      await writeFile(resolve(late,"request."+"a".repeat(32)+".upload"),Buffer.alloc(359));
      await writeFile(resolve(late,"unclaimed-extra"),Buffer.alloc(7));
      const after=(await h2.request("snapshot",{watch})).data;
      assert.equal(after.watch.parent.state,"present");assert.deepEqual(after.watch.intent,swept.watch.intent);
      assert.equal(after.future.bytes,23271431);assert.equal(after.future.files,243);
      assert.equal(after.physical.files,23);assert.equal(after.channels.find((c:Json)=>c.staging.files===1).staging.bytes,359);
      assert.equal((await h2.request("refuse")).outcome,"refused");
      const safe=JSON.stringify(after);
      assert.equal(safe.includes(capture),false);assert.equal(safe.includes(primary.transient.environment.CLAUDE_WORKSPACES_CAPTURE_TOKEN),false);
      for(let i=1;i<=8;i++)await writeFile(resolve(late,"request."+String(i).padStart(32,"0")+".upload"),Buffer.alloc(1));
      const overStaging=(await h2.request("snapshot",{watch})).data;
      assert.deepEqual(overStaging.violations,["staging-limit"]);assert.equal(overStaging.future.withinLimits,false);
      assert.equal((await h2.request("refuse")).outcome,"refused");
      // Unknown top-level files are physically counted but ignored by the production projection.
      await writeFile(resolve(capture,"unrecognized-root-file"),Buffer.alloc(23));
      const rootExtra=(await h2.request("snapshot",{watch})).data;
      assert.deepEqual(rootExtra.unknownRoot,{files:1,bytes:23,chargedByProduction:false});
      assert.equal(rootExtra.future.bytes,overStaging.future.bytes);
      assert.equal(rootExtra.physical.bytes,overStaging.physical.bytes+23);
      const unclaimed=resolve(capture,"companion-"+"f".repeat(32));await mkdir(unclaimed);
      const extraChannel=(await h2.request("snapshot",{watch})).data;
      assert.equal(extraChannel.future.bytes,rootExtra.future.bytes+2114560);
      assert.equal(extraChannel.future.files,rootExtra.future.files+21);
      assert.equal(extraChannel.physical.files,rootExtra.physical.files);
      assert.equal(extraChannel.channels.filter((c:Json)=>!c.claimed).length,1);
      for(let i=1;i<=6;i++)for(const suffix of ["upload","ready","committed"])
        await writeFile(resolve(unclaimed,"frame."+"b".repeat(32)+"."+i+"."+suffix),Buffer.alloc(1));
      const overFiles=(await h2.request("snapshot",{watch})).data.channels.find((c:Json)=>!c.claimed);
      assert.deepEqual(overFiles.staging,{transactions:6,files:18,bytes:18,withinLimits:false});
      await writeFile(resolve(unclaimed,"request."+"c".repeat(32)+".upload"),Buffer.alloc(2097153));
      const overBytes=(await h2.request("snapshot",{watch})).data.channels.find((c:Json)=>!c.claimed);
      assert.equal(overBytes.staging.bytes,2097171);assert.equal(overBytes.staging.withinLimits,false);
      assert.equal((await h2.request("stop")).data.storage,"preserved");
      assert.equal((await h2.close()).code,0);
      assert.equal((await readdir(capture)).filter(name=>name.startsWith("companion-admission.")).length,11);
    } finally {
      await h1.close();if(h2)await h2.close();
      // Only the unique test-created directory is removed, after both owned terminal receipts.
      await rm(directory,{recursive:true,force:true});
    }
  });
  it("reports unexpected refuse success as retained, unexposed real admission",async()=>{
    assert.equal(typeof support.createLifetimeHostSource,"function");
    await mkdir(resolve(".tmp"),{recursive:true});
    const directory=await realpath(await mkdtemp(resolve(".tmp/lifetime-host-synthetic-")));
    const capture=resolve(directory,"capture");await mkdir(capture);const file=resolve(directory,"host.cjs");
    await build({stdin:{contents:support.createLifetimeHostSource(),resolveDir:process.cwd()},bundle:true,platform:"node",format:"cjs",outfile:file,logLevel:"silent"});
    const h=await ownedHost(file);
    try {
      const init=await h.request("init",{storageRoot:capture,profile});
      if(process.platform!=="win32"||process.arch!=="x64"){assert.equal(init.reason,"profile-mismatch");return;}
      const result=await h.request("refuse");assert.equal(result.outcome,"unexpected-admission");assert.equal(result.transient,undefined);
      const snapshot=(await h.request("snapshot",{watch:null})).data;
      assert.equal(snapshot.slots.length,1);assert.equal(snapshot.bindings.exposed,0);
      assert.equal((await h.request("stop")).outcome,"ok");assert.equal((await h.close()).code,0);
      assert.equal((await readdir(capture)).length,2);
    } finally {await h.close();await rm(directory,{recursive:true,force:true});}
  });
  it("rejects mismatched actual runtime without initializing a second manager",async()=>{
    await mkdir(resolve(".tmp"),{recursive:true});
    const directory=await realpath(await mkdtemp(resolve(".tmp/lifetime-host-synthetic-")));
    const file=resolve(directory,"host.cjs");
    await build({stdin:{contents:support.createLifetimeHostSource(),resolveDir:process.cwd()},bundle:true,platform:"node",format:"cjs",outfile:file,logLevel:"silent"});
    const h=await ownedHost(file);
    try {
      assert.equal((await h.request("sweep")).reason,"not-initialized");
      assert.equal((await h.request("init",{storageRoot:directory,profile:{...profile,node:"0.0.0"}})).reason,"profile-mismatch");
      assert.equal((await h.request("init",{storageRoot:directory,profile})).reason,"already-initialized");
      assert.equal((await h.request("prepare-primary")).reason,"not-initialized");
      assert.equal((await h.request("stop")).outcome,"ok");assert.equal((await h.close()).code,0);
    } finally {await h.close();await rm(directory,{recursive:true,force:true});}
  });
  it("does not mint authority in a root replaced after initialization",async()=>{
    await mkdir(resolve(".tmp"),{recursive:true});
    const directory=await realpath(await mkdtemp(resolve(".tmp/lifetime-host-synthetic-")));
    const capture=resolve(directory,"capture");await mkdir(capture);const file=resolve(directory,"host.cjs");
    await build({stdin:{contents:support.createLifetimeHostSource(),resolveDir:process.cwd()},bundle:true,platform:"node",format:"cjs",outfile:file,logLevel:"silent"});
    const h=await ownedHost(file);
    try {
      const init=await h.request("init",{storageRoot:capture,profile});
      if(process.platform!=="win32"||process.arch!=="x64"){assert.equal(init.reason,"profile-mismatch");return;}
      assert.equal(init.outcome,"ok");
      await rename(capture,resolve(directory,"old-capture"));await mkdir(capture);
      assert.equal((await h.request("prepare-primary")).reason,"unsafe-root");
      assert.deepEqual(await readdir(capture),[]);
      assert.equal((await h.request("stop")).outcome,"ok");assert.equal((await h.close()).code,0);
    } finally {await h.close();await rm(directory,{recursive:true,force:true});}
  });
});
