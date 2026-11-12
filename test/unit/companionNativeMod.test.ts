import assert from "node:assert/strict";
import { lstat, mkdir, readFile, readdir, realpath, unlink, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { CompanionCapture } from "../../src/companion/companionCapture";
import type { CaptureBinding, NormalizedObservation } from "../../src/companion/companionTypes";
import { captureHostProcess, diskCompanionHarness, fixtureTarget, nativeCaptureHarness } from "../support/companionHarness";

type Native = Record<string, unknown>;
type Next = ((input: Native) => Promise<unknown>) & {origin?: {plugin:string;tier:string}};
interface Sink {
  window(): number;
  enqueue(observation: NormalizedObservation, window:number): boolean;
  gap(reason:string):void;
  nativeStart(id:unknown, source:unknown):void;
  nativeEnd(id:unknown):void;
  imageGuard(id:string, safe?:boolean): boolean;
}
interface Observer { observe(event:string,input:Native,next:Next,identity?:Readonly<{id:string;version:string}>):Promise<unknown> }
interface NativeModule {createCaptureObserver(sink:Sink):Observer}
/** Load the actual ESM helper graph even though the extension test package is CommonJS. */
async function loadObserver():Promise<NativeModule> {
  let source:string;
  try {source=await readFile("media/attention/hooks/companion/observer.js","utf8");}
  catch(error) {assert.fail(`Passive observer implementation missing: ${String((error as NodeJS.ErrnoException).code)}`);}
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`) as Promise<NativeModule>;
}
function collectingSink() {
  const observations:NormalizedObservation[]=[];const gaps:string[]=[];const guards=new Map<string,boolean>();let window=1;
  const sink:Sink={window:()=>window,enqueue:(value,w)=>{if(w!==window)return false;observations.push(value);return true;},gap:r=>gaps.push(r),
    nativeStart:()=>{window++;guards.clear();},nativeEnd:()=>{window++;guards.clear();},
    imageGuard:(id,safe)=>{if(safe!==undefined)guards.set(id,guards.has(id)?guards.get(id)===true&&safe:safe);return guards.get(id)===true;}};
  return {sink,observations,gaps};
}
const append=(content:unknown[],uuid="row-A"):Native=>({uuid,door:"response",origin:{kind:"model"},message:{type:"assistant",role:"assistant",content}});
const stored=(content:unknown[],uuid="row-A")=>({uuid,message:{type:"assistant",role:"assistant",content}});
const core={plugin:"engine",tier:"core"};
const call={tool:"Bash",tool_use_id:"call-A",command:"printf source"};
const nextReturning=(value:unknown):Next=>Object.assign(async()=>value,{origin:core});

describe("passive native capture observer",()=>{
  it("captures only the returned canonical row, preserving input/result identity and private exclusions",async()=>{
    const h=collectingSink();const observer=(await loadObserver()).createCaptureObserver(h.sink);
    const input=append([{type:"text",text:"INPUT PRIVATE"}]);const before=structuredClone(input);
    const result=stored([{type:"thinking",thinking:"HIDDEN"},{type:"text",text:"canonical café\n"},{type:"image",source:{data:"BINARY"}}]);
    let calls=0;const returned=await observer.observe("session.append",input,async e=>{calls++;assert.equal(e,input);return result;});
    assert.equal(returned,result);assert.equal(calls,1);assert.deepEqual(input,before);assert.equal(Object.isFrozen(result),false);
    assert.deepEqual(h.observations,[{kind:"assistantRow",scope:{kind:"main"},rowId:"row-A",blocks:[{kind:"text",index:1,text:"canonical café\n"},{kind:"unsupported",index:2}]}]);
    assert.ok(Object.isFrozen(h.observations[0]));assert.ok(Object.isFrozen((h.observations[0] as {blocks:unknown[]}).blocks));
    result.message.content.push({type:"text",text:"late"});assert.equal((h.observations[0] as {blocks:unknown[]}).blocks.length,2);
  });
  for(const result of [{deny:"private"},stored([],"wrong"),{uuid:"row-A"},stored([{type:"text",text:42}])]) {
    it(`rejects missing/denied/mismatched/invalid stored source ${JSON.stringify(result)}`,async()=>{
      const h=collectingSink();const o=(await loadObserver()).createCaptureObserver(h.sink);
      assert.equal(await o.observe("session.append",append([{type:"text",text:"never fallback"}]),nextReturning(result)),result);
      assert.equal(h.observations.length,0);assert.deepEqual(h.gaps,["SOURCE_REJECTED"]);
    });
  }
  it("returns the original native rejection even when capture throws",async()=>{
    const h=collectingSink();h.sink.enqueue=()=>{throw new Error("capture");};h.sink.gap=()=>{throw new Error("capture gap");};
    const o=(await loadObserver()).createCaptureObserver(h.sink);const error={native:"error"};let calls=0;
    await assert.rejects(o.observe("tool.call",call,Object.assign(async()=>{calls++;throw error;},{origin:core})),e=>e===error);assert.equal(calls,1);
    const result=stored([{type:"text",text:"public"}]);assert.equal(await o.observe("session.append",append([]),nextReturning(result)),result);
  });
  it("does not deliver a late append after cancellation changes the local window",async()=>{
    const h=collectingSink();const o=(await loadObserver()).createCaptureObserver(h.sink);const result=stored([{type:"text",text:"old"}]);
    let finish!:(value:unknown)=>void;const pending=o.observe("session.append",append([]),()=>new Promise(resolve=>{finish=resolve;}));
    h.sink.nativeEnd(fixtureTarget.claudeSessionId);finish(result);assert.equal(await pending,result);assert.equal(h.observations.length,0);
  });
  for(const agentId of [undefined,"",42,null])it(`rejects present invalid agent identity ${String(agentId)}`,async()=>{
    const h=collectingSink();const o=(await loadObserver()).createCaptureObserver(h.sink);
    await o.observe("session.append",{...append([]),agentId},nextReturning(stored([{type:"text",text:"WORKER"}])));
    assert.equal(h.observations.length,0);assert.deepEqual(h.gaps,["SOURCE_REJECTED"]);
  });
  it("applies worker then plugin then unsupported-tool precedence without reading private source",async()=>{
    const h=collectingSink();const o=(await loadObserver()).createCaptureObserver(h.sink);
    const input={tool:"Other",tool_use_id:"call-A",agentId:"worker",get command(){throw new Error("private read");}};
    await o.observe("tool.call",input,Object.assign(async()=>({}),{origin:{plugin:"plugin",tier:"plugins"}}));
    await o.observe("tool.call",{tool:"Other",tool_use_id:"call-A"},Object.assign(async()=>({}),{origin:{plugin:"plugin",tier:"plugins"}}));
    await o.observe("tool.call",{tool:"Other",tool_use_id:"call-A"},nextReturning({}));
    assert.deepEqual(h.observations,[{kind:"unsupported",scope:{kind:"agent",agentId:"worker"},reason:"AGENT_SCOPE"},{kind:"unsupported",scope:{kind:"main"},reason:"PLUGIN_ORIGIN"},{kind:"unsupported",scope:{kind:"main"},reason:"UNSUPPORTED_TOOL"}]);
  });
});

describe("native C4 branch and source normalization",()=>{
  const fixture=JSON.parse(readFileSync("test/fixtures/companion/capture-cases.json","utf8")) as {
    nativeReturnExamples:{id:string;returned:Native;expected:NormalizedObservation;undefinedFields?:string[]}[]
  };
  for(const vector of fixture.nativeReturnExamples)it(`${vector.id} maps the actual native return without private envelope data`,async()=>{
    const h=collectingSink();const o=(await loadObserver()).createCaptureObserver(h.sink);const result={...vector.returned};
    for(const key of vector.undefinedFields??[])result[key]=undefined;
    assert.equal(await o.observe("tool.call",call,nextReturning(result)),result);
    assert.deepEqual(h.observations[0],{kind:"callEnter",scope:{kind:"main"},toolUseId:"call-A",bindingValid:true,command:"printf source"});
    assert.deepEqual(h.observations[1],vector.expected);assert.equal(h.gaps.length,0);
  });
  it("snapshots the call key and origin before the continuation mutates them",async()=>{
    const h=collectingSink();const o=(await loadObserver()).createCaptureObserver(h.sink);const input={...call};
    const next:Next=Object.assign(async()=>{input.tool_use_id="changed";input.command="changed";next.origin={plugin:"other",tier:"plugins"};return {deny:"withheld"};},{origin:core});
    await o.observe("tool.call",input,next);assert.deepEqual(h.observations.map(v=>"toolUseId" in v?v.toolUseId:null),["call-A","call-A"]);
    assert.equal((h.observations[0] as {command:string}).command,"printf source");
  });
  it("captures literal Bash requests without arbitrary tool input or source authority",async()=>{
    const h=collectingSink();const o=(await loadObserver()).createCaptureObserver(h.sink);
    await o.observe("session.append",append([]),nextReturning(stored([{type:"tool_use",id:"call-A",name:"Bash",input:{command:"café\n\"quoted\"",private:"SECRET"}},{type:"tool_use",name:"Read",input:{command:"PRIVATE"}}])));
    assert.deepEqual(h.observations,[{kind:"assistantRow",scope:{kind:"main"},rowId:"row-A",blocks:[{kind:"bashRequest",index:0,toolUseId:"call-A",command:"café\n\"quoted\""},{kind:"unsupported",index:1}]}]);
  });
  for(const bad of [{interrupted:"false"},{isImage:"false"},{backgroundTaskId:""},{backgroundWakesOwner:false},{timedOutAfterMs:-1},{backgroundedByUser:null}]) {
    it(`preserves invalid Bash guard as typed post facts: ${JSON.stringify(bad)}`,async()=>{
      const h=collectingSink();const o=(await loadObserver()).createCaptureObserver(h.sink);const input={session_id:fixtureTarget.claudeSessionId,tool_name:"Bash",tool_use_id:"call-A",tool_input:{command:"literal"},tool_response:{stdout:"SECRET",stderr:"SECRET",interrupted:false,...bad}};
      const result={native:true};assert.equal(await o.observe("classic.PostToolUse",input,nextReturning(result)),result);
      assert.deepEqual(h.observations,[{kind:"post",scope:{kind:"main"},toolUseId:"call-A",command:"literal",responseState:"invalid",flags:null}]);
    });
  }
  it("uses only stored output and suppresses unknown and image guards",async()=>{
    const h=collectingSink();const o=(await loadObserver()).createCaptureObserver(h.sink);
    const input={uuid:"result",door:"tool-result",origin:{kind:"tool",tool:"Bash"}};
    const result={uuid:"result",message:{type:"user",role:"user",content:[{type:"tool_result",tool_use_id:"call-A",is_error:false,content:"CANONICAL"}]}};
    await o.observe("session.append",input,nextReturning(result));
    await o.observe("classic.PostToolUse",{session_id:fixtureTarget.claudeSessionId,tool_name:"Bash",tool_use_id:"call-A",tool_input:{command:"literal"},tool_response:{stdout:"SECRET",stderr:"SECRET",interrupted:false}},nextReturning({}));
    await o.observe("session.append",input,nextReturning(result));
    await o.observe("tool.call",call,nextReturning({result:{stdout:"SECRET",stderr:"SECRET",interrupted:false,isImage:true}}));
    await o.observe("session.append",input,nextReturning(result));
    const outputs=h.observations.filter(v=>v.kind==="storedResult");
    assert.deepEqual(outputs.map(v=>v.output),[[{kind:"unavailable",reason:"MEDIA"}],[{kind:"text",text:"CANONICAL"}],[{kind:"unavailable",reason:"MEDIA"}]]);
    assert.ok(!JSON.stringify(h.observations).includes("SECRET"));
  });
  it("caps the aggregate output with TOO_LARGE rather than a partial tail",async()=>{
    const h=collectingSink();h.sink.imageGuard("call-A",true);const o=(await loadObserver()).createCaptureObserver(h.sink);
    const content=[{type:"text",text:"a".repeat(131072)},{type:"text",text:"b".repeat(131073)}];
    await o.observe("session.append",{uuid:"result",door:"tool-result",origin:{kind:"tool",tool:"Bash"}},nextReturning({uuid:"result",message:{type:"user",role:"user",content:[{type:"tool_result",tool_use_id:"call-A",content}]}}));
    assert.deepEqual(h.observations,[{kind:"storedResult",scope:{kind:"main"},rowId:"result",index:0,toolUseId:"call-A",isError:null,output:[{kind:"unavailable",reason:"TOO_LARGE"}]}]);
  });
  it("rejects aggregate assistant/array/metadata overflow without partial sources",async()=>{
    const h=collectingSink();const o=(await loadObserver()).createCaptureObserver(h.sink);
    for(const blocks of [[{type:"text",text:"x".repeat(524289)},{type:"text",text:"x".repeat(524288)}],Array.from({length:20001},()=>({type:"thinking"})),Array.from({length:2000},()=>({type:"image"}))])
      await o.observe("session.append",append([]),nextReturning(stored(blocks)));
    assert.equal(h.observations.length,0);assert.equal(h.gaps.length,3);
  });
});

interface Publisher extends Sink {
  poll():Promise<void>;stop():void;
  snapshot():Readonly<{phase:string;queuedSlots:number;queuedBytes:number;stagedTransactions:number;stagedBytes:number;ackSeq:number;nextSeq:number;captureEpoch:string|null}>;
}
async function loadPublisher():Promise<{createFilePublisher(driver:unknown,environment:unknown):Publisher}> {
  let source:string;
  try {source=await readFile("media/attention/hooks/companion/filePublisher.js","utf8");}
  catch(error) {assert.fail(`Private file publisher missing: ${String((error as NodeJS.ErrnoException).code)}`);}
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`) as Promise<{createFilePublisher(driver:unknown,environment:unknown):Publisher}>;
}
async function liveNative() {
  const h=await nativeCaptureHarness();
  const publisher=(await loadPublisher()).createFilePublisher(h.driver,h.environment);
  const observer=(await loadObserver()).createCaptureObserver(publisher);
  const consumed=new Set<unknown>();
  const tick=async()=>{await publisher.poll();await h.protocol.poll();for(const e of h.events)if(e.kind==="observation"&&!consumed.has(e.retention)){assert.ok(Object.isFrozen(e.observation));consumed.add(e.retention);h.host.releaseRetention(e.retention);}};
  const drain=async(n=20)=>{for(let i=0;i<n;i++)await tick();};
  const start=async()=>{publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await drain(4);assert.equal(h.protocol.snapshot().state,"active");};
  const values=()=>h.events.flatMap(e=>e.kind==="observation"?[e.observation]:[]);
  const close=()=>{publisher.stop();h.protocol.stop();for(const event of h.events)if(event.kind==="observation")h.host.releaseRetention(event.retention);};
  return {...h,publisher,observer,tick,drain,start,values,close};
}
describe("native publisher through the real owned-file host",()=>{
  it("handshakes, publishes canonical text, admits only complete source and retires the cumulative ack",async()=>{
    const h=await liveNative();await h.start();
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"canonical café\n\"quote\""}])));
    assert.equal(h.values().length,0);await h.drain();
    assert.deepEqual(h.values(),[{kind:"assistantRow",scope:{kind:"main"},rowId:"row-A",blocks:[{kind:"text",index:0,text:"canonical café\n\"quote\""}]}]);
    assert.equal(h.json("ack.json").ackSeq,1);assert.equal(h.publisher.snapshot().ackSeq,1);
    assert.equal(new Set(h.writes.map(v=>v.path)).size,h.writes.length,"every native file is written exactly once");h.close();assert.equal(h.clock.pendingDelays().length,0);
  });
  it("runs scalar-safe escaped multi-frame output through actual assembly and never publishes partial source",async()=>{
    const h=await liveNative();await h.start();const text='\u0001😀"\\\n'.repeat(30000);
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text}])));
    await h.tick();assert.equal(h.values().length,0);await h.drain(100);
    assert.equal((h.values()[0] as unknown as {blocks:{text:string}[]}).blocks[0]!.text,text);
    const frames=h.writes.filter(w=>w.path.endsWith(".upload")&&w.path.includes("frame.")).map(w=>({raw:w.text,value:JSON.parse(w.text)}));
    assert.ok(frames.length>2);for(const f of frames){assert.ok(Buffer.byteLength(f.raw)<=262144);if(f.value.kind==="observationChunk")assert.ok(Buffer.byteLength(f.value.data)<=65536);}
    h.close();
  });
  it("bounds unencoded slots and exposes overflow without waiting in native continuation",async()=>{
    const h=await liveNative();await h.start();const result=stored([{type:"text",text:"source"}]);
    for(let i=0;i<70;i++)assert.equal(await h.observer.observe("session.append",append([]),nextReturning(result)),result);
    assert.ok(h.publisher.snapshot().queuedSlots<=64);assert.ok(h.publisher.snapshot().queuedBytes<=4194304);
    await h.drain(150);assert.ok(h.events.some(e=>e.kind==="discontinuity"));assert.equal(h.protocol.snapshot().state,"active");h.close();
  });
  it("keeps heartbeat scheduling active during consecutive data work",async()=>{
    const h=await liveNative();await h.start();
    for(let i=0;i<6;i++){h.clock.advance(1000);await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"x".repeat(100000)}])));await h.drain(6);}
    const heartbeats=h.writes.filter(w=>w.path.endsWith(".upload")).map(w=>JSON.parse(w.text)).filter(v=>v.kind==="heartbeat");
    assert.equal(heartbeats.length,6);assert.equal(h.protocol.snapshot().state,"active");h.close();
  });
  it("renews after same-process end/start, coalesces resets and never replays an old source window",async()=>{
    const h=await liveNative();await h.start();const epoch=h.json("control.json").captureEpoch;
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"OLD"}])));
    await h.observer.observe("session.end",{sessionId:fixtureTarget.claudeSessionId,reason:"clear"},nextReturning({}));
    for(let i=0;i<3;i++)await h.observer.observe("classic.SessionStart",{session_id:fixtureTarget.claudeSessionId,source:"clear"},nextReturning({}));
    await h.drain(8);assert.equal(h.protocol.snapshot().state,"active");assert.notEqual(h.json("control.json").captureEpoch,epoch);assert.equal(h.values().length,0);
    assert.equal(h.writes.filter(w=>w.path.includes("request.")&&w.path.endsWith(".upload")).length,2);
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"NEW"}])));await h.drain();
    assert.ok(JSON.stringify(h.values()).includes("NEW"));assert.ok(!JSON.stringify(h.values()).includes("OLD"));h.close();
  });
});



describe("native reset retirement interleavings",()=>{
  async function interruptedReset(action:(h:Awaited<ReturnType<typeof liveNative>>)=>Promise<void>) {
    const h=await liveNative();await h.start();
    h.publisher.nativeStart(fixtureTarget.claudeSessionId,"clear");await h.publisher.poll();
    let observed=false;
    h.fs.before=async(operation,file)=>{
      if(observed||operation!=="write"||!file.endsWith("ack.json.tmp")||h.json("control.json").state!=="retired")return;
      observed=true;await action(h);
    };
    try {await h.protocol.poll();assert.equal(observed,true);h.fs.before=undefined;return h;}
    catch(error){h.close();throw error;}
  }
  for(const visibility of ["ack", "control", "both"] as const)it(`preserves the pending native-reset grant across repeated intermediate ${visibility} retirement reads`,async()=>{
    const h=await liveNative();await h.start();const old=h.json("control.json");
    let release!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>{release=r;}),waiting=new Promise<void>(r=>{entered=r;});
    let polling:Promise<void>|undefined,blocked=false;
    const exists=h.driver.fs.exists;
    try {
      await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"OLD QUEUE"}])));
      let finish!:(value:unknown)=>void;const result=stored([{type:"text",text:"OLD CALLBACK"}]);
      const callback=h.observer.observe("session.append",append([]),()=>new Promise(r=>{finish=r;}));
      h.publisher.nativeEnd(fixtureTarget.claudeSessionId);h.publisher.nativeStart(fixtureTarget.claudeSessionId,"clear");
      finish(result);assert.equal(await callback,result);await h.publisher.poll();
      h.fs.before=async(operation,file)=>{
        if(blocked)return;
        const boundary=visibility==="ack"?operation==="rename"&&file.endsWith("control.json.tmp")&&h.json("ack.json").disposition==="retired":
          operation==="write"&&file.endsWith("ack.json.tmp")&&h.json("control.json").state==="retired";
        if(boundary){blocked=true;entered();await gate;}
      };
      polling=h.protocol.poll();await waiting;
      assert.equal(h.json("ack.json").disposition,"retired");
      assert.equal(h.json("control.json").state,visibility==="ack"?"active":"retired");
      if(visibility==="control")h.driver.fs.exists=async file=>file.endsWith("ack.json")?false:exists(file);
      for(let i=0;i<3;i++)await h.publisher.poll();
      assert.equal(h.writes.filter(w=>w.path.includes("request.")&&w.path.endsWith(".upload")).length,2,"intermediate retirement must not spend a recovery offer");
      h.driver.fs.exists=exists;release();await polling;h.fs.before=undefined;
      await h.drain(8);assert.equal(h.publisher.snapshot().phase,"active");assert.equal(h.protocol.snapshot().state,"active");
      assert.notEqual(h.publisher.snapshot().captureEpoch,old.captureEpoch);
      await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"NEW COMPLETE"}])));await h.drain();
      assert.equal(h.values().length,1);assert.ok(JSON.stringify(h.values()).includes("NEW COMPLETE"));assert.ok(!JSON.stringify(h.values()).includes("OLD"));
      assert.equal(h.events.filter(e=>e.kind==="discontinuity"&&e.captureEpoch===old.captureEpoch).length,1);
      const resetGaps=h.events.filter(e=>e.kind==="discontinuity"&&e.captureEpoch===h.publisher.snapshot().captureEpoch);
      assert.equal(resetGaps.length,1);assert.equal(resetGaps[0]!.kind==="discontinuity"&&resetGaps[0]!.reason,"RESET_BOUNDARY");
    } finally {h.driver.fs.exists=exists;release();await polling;h.fs.before=undefined;h.close();}
  });
  it("keeps the original reset deadline despite repeated intermediate retirement reads",async()=>{
    const h=await interruptedReset(async h=>{
      h.clock.advance(4999);await h.publisher.poll();await h.publisher.poll();
      h.clock.advance(1);await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,"closed");
    });
    try {await h.publisher.poll();assert.equal(h.writes.filter(w=>w.path.includes("activate.")&&w.path.endsWith(".upload")).length,1);}
    finally {h.close();}
  });
  it("does not reset the pending deadline while native lifecycle is suspended",async()=>{
    const h=await interruptedReset(async h=>{
      await h.publisher.poll();h.publisher.nativeEnd(fixtureTarget.claudeSessionId);
      const count=h.fs.calls.length;h.clock.advance(5000);await h.publisher.poll();assert.equal(h.fs.calls.length,count);
      h.publisher.nativeStart(fixtureTarget.claudeSessionId,"resume");await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,"closed");
    });h.close();
  });
  for(const mutation of ["wrong-offer","failed","wrong-predecessor"] as const)it(`rejects ${mutation} after intermediate reset retirement`,async()=>{
    const h=await interruptedReset(async h=>{await h.publisher.poll();});
    try {
      const grant=h.json("control.json");assert.equal(grant.state,"granted");
      h.fs.overwrite(resolve(h.binding.directory,"control.json"),JSON.stringify({...grant,...(mutation==="wrong-offer"?{grantId:"f".repeat(32)}:
        mutation==="wrong-predecessor"?{predecessorEpoch:"f".repeat(32)}:{state:"failed",offerId:null,reasonCode:"CONTROL_REJECTED",recoveriesRemaining:0})}));
      const writes=h.writes.length;await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,"closed");assert.equal(h.writes.length,writes);
    } finally {h.close();}
  });
  it("keeps UUID mismatch terminal after intermediate reset retirement",async()=>{
    const h=await interruptedReset(async h=>{
      await h.publisher.poll();h.publisher.nativeStart("22222222-2222-4222-8222-222222222222","resume");
    });
    try {
      await h.drain(8);assert.equal(h.publisher.snapshot().phase,"closed");assert.equal(h.json("control.json").state,"failed");
      assert.equal(h.json("control.json").reasonCode,"IDENTITY_CHANGED");assert.equal(h.values().length,0);
    } finally {h.close();}
  });
  it("cannot activate a revoked owner after intermediate reset retirement",async()=>{
    const h=await interruptedReset(async h=>{await h.publisher.poll();});
    try {
      assert.equal((await h.host.revoke(h.binding)).ok,true);await h.publisher.poll();
      assert.equal(h.publisher.snapshot().phase,"closed");assert.equal(h.protocol.snapshot().stopped,true);assert.equal(h.values().length,0);
    } finally {h.close();}
  });
  it("ignores a late retired predecessor ack after activating the reset epoch",async()=>{
    const h=await interruptedReset(async h=>{await h.publisher.poll();});
    try {
      const retired=h.json("control.json").lastRetired;await h.drain(8);const epoch=h.publisher.snapshot().captureEpoch;
      h.fs.overwrite(resolve(h.binding.directory,"ack.json"),JSON.stringify({...h.envelope,kind:"ack",captureEpoch:retired.captureEpoch,
        disposition:"retired",ackSeq:retired.ackSeq,reasonCode:retired.reasonCode}));
      await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"CURRENT SOURCE"}])));await h.drain();
      assert.equal(h.publisher.snapshot().phase,"active");assert.equal(h.publisher.snapshot().captureEpoch,epoch);
      assert.equal(h.values().length,1);assert.ok(JSON.stringify(h.values()).includes("CURRENT SOURCE"));
    } finally {h.close();}
  });
  it("still recovers a genuine health retirement while a native-reset request is pending",async()=>{
    const h=await liveNative();await h.start();
    try {
      h.clock.advance(100);
      h.publisher.nativeStart(fixtureTarget.claudeSessionId,"clear");await h.publisher.poll();
      h.clock.advance(4900);await h.protocol.poll();assert.equal(h.json("control.json").reasonCode,"TRANSACTION_TIMEOUT");
      await h.drain(8);assert.equal(h.publisher.snapshot().phase,"active");
      assert.equal(h.writes.filter(w=>w.path.includes("request.")&&w.path.endsWith(".upload")).length,3);
    } finally {h.close();}
  });
});

describe("native publisher transport limits and cancellation",()=>{
  it("counts retained acknowledged and obsolete committed artifacts against the physical eight-transaction bound",async()=>{
    const h=await liveNative();await h.start();
    for(let i=1;i<=8;i++)h.fs.put(resolve(h.binding.directory,`frame.${"f".repeat(32)}.${i}.committed`),"file","old");
    const before=h.writes.length;await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"held"}])));await h.publisher.poll();
    assert.equal(h.writes.length,before);assert.ok(h.publisher.snapshot().queuedSlots>0);h.close();
  });
  it("counts retained physical bytes even when there are fewer than eight transactions",async()=>{
    const h=await liveNative();await h.start();h.fs.put(resolve(h.binding.directory,`frame.${"f".repeat(32)}.1.committed`),"file","x".repeat(2097100));
    const before=h.writes.length;await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"held"}])));await h.publisher.poll();
    assert.equal(h.writes.length,before);h.close();
  });
  it("stops after a stuck write deadline and never writes its marker when the SDK mutation completes late",async()=>{
    const h=await liveNative();await h.start();let finish!:()=>void;
    h.setBeforeWrite(async(path)=>{if(path.includes("frame.")&&path.endsWith(".upload"))await new Promise<void>(resolve=>{finish=resolve;});});
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"late"}])));
    const polling=h.publisher.poll();for(let i=0;i<100&&!finish;i++)await Promise.resolve();assert.ok(finish);
    h.clock.advance(2000);h.clock.fireDue();assert.equal(h.publisher.snapshot().phase,"closed");
    const result={native:"continues"};assert.equal(await h.observer.observe("turn.complete",{},nextReturning(result)),result);
    finish();await polling;assert.equal(h.writes.filter(w=>w.path.includes("frame.")&&w.path.endsWith(".ready")).length,0);
    assert.equal(h.clock.pendingDelays().length,0);await h.publisher.poll();assert.equal(h.clock.pendingDelays().length,0);h.close();
  });
  it("never overlaps a blocked SDK operation and preserves exact native rejection",async()=>{
    const h=await liveNative();await h.start();let finish!:()=>void;
    h.setBeforeWrite(()=>new Promise<void>(resolve=>{finish=resolve;}));
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"one"}])));
    const first=h.publisher.poll();for(let i=0;i<100&&!finish;i++)await Promise.resolve();assert.ok(finish);
    const count=h.writes.length;await h.publisher.poll();await h.publisher.poll();assert.equal(h.writes.length,count);
    const error={native:true};await assert.rejects(h.observer.observe("tool.call",call,Object.assign(async()=>{throw error;},{origin:core})),e=>e===error);
    h.publisher.stop();finish();await first;assert.equal(h.writes.length,count);h.close();
  });
  it("leaves malformed binding inactive without I/O or timer installation",async()=>{
    const h=await nativeCaptureHarness();const factory=(await loadPublisher()).createFilePublisher;
    for(const environment of [{}, {...h.environment,CLAUDE_WORKSPACES_CAPTURE_TOKEN:"bad"},{...h.environment,CLAUDE_WORKSPACES_CAPTURE_DIR:"relative"}]){
      const publisher=factory(h.driver,environment);publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await publisher.poll();assert.equal(h.writes.length,0);assert.equal(h.clock.pendingDelays().length,0);publisher.stop();
    }h.protocol.stop();
  });
  it("retries no old source after a real host retirement and one automatic recovery",async()=>{
    const h=await liveNative();await h.start();const old=h.json("control.json").captureEpoch;
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"lost"}])));
    h.clock.advance(5000);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"retired");await h.drain(8);
    assert.equal(h.protocol.snapshot().state,"active");assert.notEqual(h.json("control.json").captureEpoch,old);assert.equal(h.values().length,0);
    assert.ok(h.events.some(e=>e.kind==="discontinuity"));h.close();
  });
  it("ignores a lower control revision and an old-epoch ack without consuming current source",async()=>{
    const h=await liveNative();await h.start();const old=h.json("control.json");
    h.publisher.nativeStart(fixtureTarget.claudeSessionId,"compact");await h.drain(8);const current=h.json("control.json");
    const controlPath=resolve(h.binding.directory,"control.json"),ackPath=resolve(h.binding.directory,"ack.json");
    h.fs.overwrite(controlPath,JSON.stringify(old));h.fs.overwrite(ackPath,JSON.stringify({...h.envelope,kind:"ack",captureEpoch:old.captureEpoch,ackSeq:999,disposition:"continue"}));
    await h.publisher.poll();assert.equal(h.publisher.snapshot().captureEpoch,current.captureEpoch);assert.equal(h.publisher.snapshot().phase,"active");h.close();
  });
  it("closes on a contradictory current control without more writes",async()=>{
    const h=await liveNative();await h.start();const control=h.json("control.json");
    h.fs.overwrite(resolve(h.binding.directory,"control.json"),JSON.stringify({...control,grantId:"e".repeat(32)}));
    const before=h.writes.length;await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,"closed");assert.equal(h.writes.length,before);h.close();
  });
});

interface C4Event {event:string;input?:Native;returned?:unknown;nextOrigin?:{plugin:string;tier:string};forToolUseId?:string;sourceEnvelope?:Native;nativeReturn?:unknown}
interface C4Case {id:string;events:C4Event[];expected:Native}
const transferred=JSON.parse(readFileSync("test/fixtures/companion/capture-cases.json","utf8")) as {
  nativeC4:{cases:C4Case[]};nativeDenyPipelines:{id:string;sourceCaseId:string;expected:{observations:NormalizedObservation[]}}[];
  nativeReturnExamples:{id:string;returned:Native;expected:NormalizedObservation;undefinedFields?:string[]}[]
};
/** Play each original native call/return closure; other events execute while that call is pending. */
async function playNativeCase(h:Awaited<ReturnType<typeof liveNative>>,vector:C4Case) {
  const calls:{id:unknown;finish:(value:unknown)=>void;promise:Promise<unknown>;input:Native;before:Native}[]=[];
  for(const event of vector.events) {
    if(event.event==="tool.call:return") {
      const call=calls.find(v=>v.id===event.forToolUseId);assert.ok(call);calls.splice(calls.indexOf(call),1);
      call.finish(event.returned);assert.equal(await call.promise,event.returned);assert.deepEqual(call.input,call.before);await h.drain();continue;
    }
    if(event.event==="observer-contract") {
      for(let i=0;i<70;i++)await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"queued"}])));
      assert.equal(await h.observer.observe("tool.call",call,nextReturning(event.nativeReturn)),event.nativeReturn);await h.drain();continue;
    }
    const input=structuredClone(event.input??{}),before=structuredClone(input);let count=0;
    if(event.event==="tool.call") {
      let finish!:(value:unknown)=>void;const next:Next=Object.assign((e:Native)=>{count++;assert.equal(e,input);return new Promise(resolve=>{finish=resolve;});},{origin:event.nextOrigin});
      const promise=h.observer.observe(event.event,input,next);assert.equal(count,1);calls.push({id:input.tool_use_id,finish,promise,input,before});
    } else if(event.sourceEnvelope) {
      let finish!:(value:unknown)=>void;const pending=h.observer.observe(event.event,input,()=>new Promise(resolve=>{finish=resolve;}));
      h.publisher.nativeStart(fixtureTarget.claudeSessionId,"compact");await h.drain(8);finish(event.returned);assert.equal(await pending,event.returned);
    } else {
      const returned=await h.observer.observe(event.event,input,async e=>{count++;assert.equal(e,input);return event.returned;});
      assert.equal(returned,event.returned);assert.equal(count,1);assert.deepEqual(input,before);
    }
    await h.drain();
  }
  for(const call of calls){const result={};call.finish(result);assert.equal(await call.promise,result);assert.deepEqual(call.input,call.before);}await h.drain();
}
const expectedKinds:Record<string,string>={
  "01":"assistantRow","02":"unsupported","03":"assistantRow","04":"assistantRow callEnter callReturn",
  "05":"assistantRow callEnter post storedResult callReturn","06":"assistantRow callEnter failure callReturn storedResult",
  "07":"assistantRow callEnter permissionDenied storedResult callReturn","08":"assistantRow callEnter callReturn",
  "09":"assistantRow callEnter post storedResult callReturn","10":"assistantRow callEnter failure storedResult callReturn",
  "11":"assistantRow callEnter failure storedResult callReturn","12":"assistantRow callEnter post storedResult callReturn",
  "13":"assistantRow callEnter post storedResult callReturn","14":"assistantRow callEnter unsupported unsupported unsupported callReturn unsupported",
  "15":"assistantRow callEnter post post storedResult storedResult callReturn","16":"assistantRow callEnter post post storedResult callReturn",
  "17":"assistantRow callEnter","18":"assistantRow callEnter assistantRow callEnter post storedResult permissionDenied storedResult callReturn callReturn",
  "19":"","20":"assistantRow callEnter post callReturn storedResult","21":"assistantRow callEnter storedResult callReturn",
  "22":"assistantRow callEnter post callReturn","23":"","24":"unsupported","25":"assistantRow post storedResult unsupported",
  "26":"assistantRow callEnter post storedResult callReturn","27":"assistantRow callEnter post storedResult permissionDenied callReturn",
  "29":"assistantRow callEnter post storedResult callReturn","30":"","31":"assistantRow callEnter post storedResult callReturn",
  "32":"assistantRow callEnter post storedResult callReturn"
};
describe("original native fixture producer to host pipelines",()=>{
  for(const vector of transferred.nativeC4.cases)it(`${vector.id} retains original native body facts and privacy through host admission`,async()=>{
    const h=await liveNative();await h.start();const epoch=h.json("control.json").captureEpoch;await playNativeCase(h,vector);
    const values=h.values(),number=vector.id.slice(3,5),serialized=JSON.stringify(values);
    if(number!=="28")assert.equal(values.map(v=>v.kind).join(" "),expectedKinds[number]);
    assert.ok(!serialized.includes("EXCLUDED"));assert.ok(!serialized.includes("PRE-STORAGE TEXT"));
    assert.ok(!/"(?:executionConfirmed|sourceShellFamily|sourceRevision|executedCopyValue|runAgainEvidenceEligible|context|stdout|stderr|rawOutputPath)":/.test(serialized));
    if(typeof vector.expected.capturedText==="string")assert.ok(values.some(v=>v.kind==="assistantRow"&&v.blocks.some(b=>b.kind==="text"&&b.text===vector.expected.capturedText)));
    if(typeof vector.expected.requestedCopyValue==="string")assert.ok(values.some(v=>v.kind==="assistantRow"&&v.blocks.some(b=>b.kind==="bashRequest"&&b.command===vector.expected.requestedCopyValue)));
    if(number==="05")assert.equal(values.find(v=>v.kind==="post")?.command,"printf 'effective'");
    if(number==="09")assert.equal(values.find(v=>v.kind==="post")?.flags?.backgroundedByTurnAbort,true);
    if(number==="10")assert.equal(values.find(v=>v.kind==="failure")?.isInterrupt,true);
    if(number==="11")assert.equal(values.find(v=>v.kind==="failure")?.isInterrupt,false);
    if(number==="12")assert.equal(values.find(v=>v.kind==="post")?.flags?.backgroundTaskId,null);
    if(number==="13")assert.equal(values.find(v=>v.kind==="post")?.flags?.interrupted,true);
    if(number==="16")assert.deepEqual(values.filter(v=>v.kind==="post").map(v=>v.command),["printf A","printf B"]);
    if(number==="18")assert.deepEqual(values.filter(v=>v.kind==="callEnter").map(v=>v.toolUseId),["call-A","call-B"]);
    if(number==="20"){assert.equal(values.find(v=>v.kind==="post")?.flags?.backgroundArtifactHint,true);assert.equal((values.find(v=>v.kind==="storedResult")?.output[0] as {text:string}).text,"Stored reported output");assert.equal(vector.expected.executionConfirmed,false);assert.equal(vector.expected.executedCopyValue,null);}
    if(number==="23"){assert.equal(h.protocol.snapshot().state,"failed");assert.equal(h.json("control.json").reasonCode,"IDENTITY_CHANGED");}
    if(number==="28")assert.ok(h.events.some(e=>e.kind==="discontinuity"));
    if(number==="30")assert.notEqual(h.json("control.json").captureEpoch,epoch);
    if(number==="31")assert.deepEqual(values.find(v=>v.kind==="storedResult")?.output,[{kind:"unavailable",reason:"MEDIA"}]);
    h.close();
  });
  for(const vector of transferred.nativeReturnExamples)it(`${vector.id} serializes actual return branch into the host decoder`,async()=>{
    const h=await liveNative();await h.start();const returned=vector.returned===null?null:{...vector.returned};for(const key of vector.undefinedFields??[])returned![key]=undefined;assert.equal(await h.observer.observe("tool.call",call,nextReturning(returned)),returned);await h.drain();
    assert.deepEqual(h.values()[1],vector.expected);assert.equal(h.protocol.snapshot().state,"active");h.close();
  });
  for(const pipeline of transferred.nativeDenyPipelines)it(`${pipeline.id} executes its original C4 native body through producer and decoder`,async()=>{
    const h=await liveNative();await h.start();const vector=transferred.nativeC4.cases.find(c=>c.id===pipeline.sourceCaseId);assert.ok(vector);
    await playNativeCase(h,vector);assert.deepEqual(h.values(),pipeline.expected.observations);h.close();
  });
});


describe("native boundary regressions",()=>{
  it("does not serialize large source strings during synchronous observer enqueue",async()=>{
    const h=await liveNative();await h.start();const result=stored([{type:"text",text:"x".repeat(70000)}]);
    const stringify=JSON.stringify;let sourcePieces=0;
    JSON.stringify=((value:unknown,...args:unknown[])=>{if(typeof value==="string"&&value.length>=500)sourcePieces++;return Reflect.apply(stringify,JSON,[value,...args]);}) as typeof JSON.stringify;
    try {await h.observer.observe("session.append",append([]),nextReturning(result));}finally{JSON.stringify=stringify;}
    assert.equal(sourcePieces,0,"escaped source counting belongs to publisher work");await h.drain();assert.equal(h.values().length,1);h.close();
  });
  it("never double charges a prepared frame while its write transfers to staged accounting",async()=>{
    const h=await liveNative();await h.start();
    for(let i=0;i<4;i++)await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"x".repeat(1020000)}])));
    const observations:number[]=[];h.setBeforeWrite(()=>{observations.push(h.publisher.snapshot().queuedBytes);});
    await h.publisher.poll();assert.ok(observations.every(bytes=>bytes<=4194304));h.close();
  });
  it("retries an unwritten capacity-blocked initial request exactly once after host cleanup",async()=>{
    const h=await liveNative();const paths:string[]=[];
    for(let i=1;i<=8;i++){const path=resolve(h.binding.directory,`frame.${"f".repeat(32)}.${i}.committed`);paths.push(path);h.fs.put(path,"file","old");}
    h.publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await h.publisher.poll();assert.equal(h.writes.length,0);
    for(const path of paths)h.fs.entries.delete(path);await h.drain(5);assert.equal(h.protocol.snapshot().state,"active");
    assert.equal(h.writes.filter(w=>w.path.includes("request.")&&w.path.endsWith(".upload")).length,1);h.close();
  });
  it("applies the original write deadline before publishing a marker even if timer delivery is delayed",async()=>{
    const h=await liveNative();await h.start();h.setBeforeWrite(path=>{if(path.includes("frame.")&&path.endsWith(".upload"))h.clock.advance(2000);});
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"late"}])));await h.publisher.poll();
    assert.equal(h.writes.filter(w=>w.path.includes("frame.")&&w.path.endsWith(".ready")).length,0);assert.equal(h.publisher.snapshot().phase,"closed");h.close();
  });
  it("does not admit a grant first observed at the original five-second handshake deadline",async()=>{
    const h=await liveNative();h.publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await h.publisher.poll();await h.protocol.poll();h.clock.advance(5000);
    await h.publisher.poll();assert.equal(h.writes.filter(w=>w.path.includes("activate.")).length,0);assert.equal(h.publisher.snapshot().phase,"closed");h.close();
  });
  it("drops old in-flight native content after an actual queued overflow gap",async()=>{
    const h=await liveNative();await h.start();let finish!:(value:unknown)=>void;const result=stored([{type:"text",text:"old callback"}]);
    const pending=h.observer.observe("session.append",append([]),()=>new Promise(resolve=>{finish=resolve;}));
    for(let i=0;i<65;i++)await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"queued"}])));
    finish(result);assert.equal(await pending,result);await h.drain();assert.ok(!JSON.stringify(h.values()).includes("old callback"));h.close();
  });
});



describe("native lifecycle and scheduling boundaries",()=>{
  it("cancels session-end polling without disposing same-process renewal",async()=>{
    const h=await liveNative();await h.start();h.publisher.nativeEnd(fixtureTarget.claudeSessionId);assert.equal(h.clock.pendingDelays().length,0);
    const before=h.fs.calls.length;await h.publisher.poll();assert.equal(h.fs.calls.length,before);
    h.publisher.nativeStart(fixtureTarget.claudeSessionId,"resume");await h.drain(8);assert.equal(h.protocol.snapshot().state,"active");h.close();
  });
  it("retries only an unwritten activation after physical capacity becomes available",async()=>{
    const h=await liveNative();h.publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await h.publisher.poll();await h.protocol.poll();
    const paths:string[]=[];for(let i=1;i<=8;i++){const path=resolve(h.binding.directory,`frame.${"f".repeat(32)}.${i}.committed`);paths.push(path);h.fs.put(path,"file","retained");}
    await h.publisher.poll();assert.equal(h.writes.filter(w=>w.path.includes("activate.")).length,0);for(const path of paths)h.fs.entries.delete(path);
    await h.drain(5);assert.equal(h.protocol.snapshot().state,"active");assert.equal(h.writes.filter(w=>w.path.includes("activate.")).length,2);h.close();
  });
  it("holds an actual partial ready write without promotion until it completes",async()=>{
    const h=await liveNative();await h.start();let finish!:()=>void;
    h.setBeforeWrite(async(path,text)=>{if(path.includes("frame.")&&path.endsWith(".ready")){h.fs.put(path,"file",text.slice(0,12));await new Promise<void>(resolve=>{finish=resolve;});}});
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"complete only"}])));
    const pending=h.publisher.poll();for(let i=0;i<150&&!finish;i++)await Promise.resolve();assert.ok(finish);
    await h.protocol.poll();assert.equal(h.values().length,0);assert.equal(h.json("ack.json").ackSeq,0);assert.equal(h.protocol.snapshot().state,"active");
    h.clock.advance(1999);finish();await pending;await h.protocol.poll();assert.equal(h.values().length,1);h.close();
  });
  it("abandons the whole assembly on a corrupted middle frame and never admits a partial observation",async()=>{
    const h=await liveNative();await h.start();await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"x".repeat(200000)}])));
    await h.tick();assert.equal(h.json("ack.json").ackSeq,1);assert.equal(h.values().length,0);await h.publisher.poll();
    const upload=h.writes.filter(w=>w.path.includes("frame.")&&w.path.endsWith(".upload")).at(-1)!;
    const frame=JSON.parse(upload.text);frame.data="broken";h.fs.overwrite(upload.path,JSON.stringify(frame));
    const ready=upload.path.replace(/upload$/,"ready");h.fs.overwrite(ready,JSON.stringify({v:1,basename:upload.path.slice(upload.path.lastIndexOf("\\")+1),byteLength:Buffer.byteLength(JSON.stringify(frame))}));
    await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"retired");assert.equal(h.json("ack.json").ackSeq,1);assert.equal(h.values().length,0);h.close();
  });
  for(const offset of [1999,2000,2001])it(`bounds unacknowledged staging at inclusive ${offset}ms`,async()=>{
    const h=await liveNative();await h.start();await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"unread"}])));await h.publisher.poll();
    h.clock.advance(offset);await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,offset<2000?"active":"closed");h.close();
  });
  it("reserves one known allocated gap and unknown source boundary under combined byte pressure",async()=>{
    const h=await liveNative();await h.start();
    for(let i=0;i<4;i++)await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"x".repeat(1040000)}])));
    await h.drain(20);const gaps=h.writes.filter(w=>w.path.endsWith(".upload")).map(w=>JSON.parse(w.text)).filter(v=>v.kind==="gap");
    assert.deepEqual(gaps.map(v=>v.mode),["known","unknown"]);assert.equal(gaps[0].seq,gaps[0].coversThrough);assert.equal(gaps[1].seq,gaps[1].coversThrough);assert.equal(h.values().length,0);assert.equal(h.protocol.snapshot().state,"active");h.close();
  });
  it("bounds memory slots shared with image guards and exposes MEDIA after guard eviction",async()=>{
    const h=await liveNative();await h.start();for(let i=0;i<70;i++)h.publisher.imageGuard("guard-"+i,true);
    assert.ok(h.publisher.snapshot().queuedSlots<=64);assert.equal(h.publisher.imageGuard("guard-0"),false);
    await h.observer.observe("session.append",{uuid:"row-result",door:"tool-result",origin:{kind:"tool",tool:"Bash"}},nextReturning({uuid:"row-result",message:{type:"user",role:"user",content:[{type:"tool_result",tool_use_id:"guard-0",content:"secret image"}]}}));
    await h.drain();assert.ok(!JSON.stringify(h.values()).includes("secret image"));h.close();
  });
});

describe("native I/O lock and closed-control guards",()=>{
  it("retries a transient fixed-file read lock within its original bounded interval",async()=>{
    const h=await liveNative();await h.start();let locked=true;
    h.fs.before=(operation,path)=>{if(locked&&operation==="read"&&path.endsWith("control.json"))throw new Error("locked");};
    await h.publisher.poll();assert.notEqual(h.publisher.snapshot().phase,"closed");h.clock.advance(1999);locked=false;
    await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,"active");h.close();
  });
  it("expires repeated fixed-file read locks without rearming forever",async()=>{
    const h=await liveNative();await h.start();h.fs.before=(operation,path)=>{if(operation==="read"&&path.endsWith("control.json"))throw new Error("locked");};
    await h.publisher.poll();h.clock.advance(2000);await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,"closed");assert.equal(h.clock.pendingDelays().length,0);h.close();
  });
  for(const delta of [{extra:"private"},{controlRevision:Number.MAX_SAFE_INTEGER+1},{state:"unknown"},{lastRetired:[]}])it(`rejects a current malformed closed control ${JSON.stringify(delta)}`,async()=>{
    const h=await liveNative();await h.start();h.fs.overwrite(resolve(h.binding.directory,"control.json"),JSON.stringify({...h.json("control.json"),...delta}));
    await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,"closed");h.close();
  });
  it("ignores unauthenticated control and ack without acquiring their epoch or cursor",async()=>{
    const h=await liveNative();await h.start();const epoch=h.publisher.snapshot().captureEpoch;
    h.fs.overwrite(resolve(h.binding.directory,"control.json"),JSON.stringify({...h.json("control.json"),token:"Z".repeat(43),captureEpoch:"e".repeat(32),controlRevision:999}));
    h.fs.overwrite(resolve(h.binding.directory,"ack.json"),JSON.stringify({...h.json("ack.json"),token:"Z".repeat(43),ackSeq:999}));
    await h.publisher.poll();assert.equal(h.publisher.snapshot().captureEpoch,epoch);assert.equal(h.publisher.snapshot().ackSeq,0);assert.equal(h.publisher.snapshot().phase,"active");h.close();
  });
  it("refuses an oversized control using stat without reading its body",async()=>{
    const h=await liveNative();await h.start();h.fs.overwrite(resolve(h.binding.directory,"control.json"),"x".repeat(4097));
    const at=h.fs.calls.length;await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,"closed");assert.ok(!h.fs.calls.slice(at).some(v=>v.operation==="read"&&v.path.endsWith("control.json")));h.close();
  });
  it("never overwrites or retries a partially failed upload",async()=>{
    const h=await liveNative();await h.start();h.setBeforeWrite((path,text)=>{if(path.includes("frame.")){h.fs.put(path,"file",text.slice(0,50));throw new Error("partial write");}});
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"source"}])));await h.publisher.poll();
    for(let i=0;i<5;i++)await h.publisher.poll();assert.equal(h.writes.filter(w=>w.path.includes("frame.")).length,1);assert.equal(h.publisher.snapshot().phase,"closed");h.close();
  });
});

describe("native grant admission",()=>{
  it("requires the epoch-zero ack before publishing activation",async()=>{
    const h=await liveNative();h.publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await h.publisher.poll();await h.protocol.poll();
    const ack=resolve(h.binding.directory,"ack.json"),saved=h.fs.entries.get(ack)!;h.fs.entries.delete(ack);await h.publisher.poll();assert.equal(h.writes.filter(w=>w.path.includes("activate.")).length,0);
    h.fs.entries.set(ack,saved);await h.drain(4);assert.equal(h.protocol.snapshot().state,"active");h.close();
  });
  it("rejects a granted predecessor contradictory to the pending offer",async()=>{
    const h=await liveNative();h.publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await h.publisher.poll();await h.protocol.poll();
    h.fs.overwrite(resolve(h.binding.directory,"control.json"),JSON.stringify({...h.json("control.json"),predecessorEpoch:"e".repeat(32)}));
    await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,"closed");assert.equal(h.writes.filter(w=>w.path.includes("activate.")).length,0);h.close();
  });
  it("rejects an active control that precedes its own activation",async()=>{
    const h=await liveNative();h.publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await h.publisher.poll();await h.protocol.poll();
    const control=h.json("control.json");h.fs.overwrite(resolve(h.binding.directory,"control.json"),JSON.stringify({...control,state:"active",offerId:"e".repeat(32)}));
    await h.publisher.poll();assert.equal(h.publisher.snapshot().phase,"closed");h.close();
  });
  it("does not clear a source frame using an ack for an allocated but unwritten sequence",async()=>{
    const h=await liveNative();await h.start();for(let i=1;i<=8;i++)h.fs.put(resolve(h.binding.directory,`frame.${"f".repeat(32)}.${i}.committed`),"file","retained");
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"unwritten"}])));await h.publisher.poll();
    h.fs.overwrite(resolve(h.binding.directory,"ack.json"),JSON.stringify({...h.json("ack.json"),ackSeq:1}));await h.publisher.poll();
    assert.equal(h.publisher.snapshot().phase,"closed");assert.equal(h.values().length,0);h.close();
  });
});

describe("native publisher wake and path guards",()=>{
  it("uses 50ms busy polling after source arrives at an idle 250ms publisher",async()=>{
    const h=await liveNative();await h.start();assert.deepEqual(h.clock.pendingDelays(),[250]);
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"wake"}])));
    assert.equal(Math.min(...h.clock.pendingDelays()),50);assert.ok(h.clock.pendingDelays().length<=2);h.close();
  });
  it("refuses a channel root that the SDK reports as a redirected link before publishing source",async()=>{
    const h=await liveNative();await h.start();h.fs.put(h.binding.directory,"link");
    const before=h.writes.length;await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"private"}])));await h.publisher.poll();
    assert.equal(h.writes.length,before);assert.equal(h.publisher.snapshot().phase,"closed");h.close();
  });
});

describe("native prepared-frame accounting",()=>{
  it("counts the ready marker with a prepared frame before any write can start",async()=>{
    const h=await liveNative();await h.start();for(let i=1;i<=8;i++)h.fs.put(resolve(h.binding.directory,`frame.${"f".repeat(32)}.${i}.committed`),"file","held");
    const observation={kind:"assistantRow",scope:{kind:"main"},rowId:"row-A",blocks:[{kind:"text",index:0,text:"held"}]};
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"held"}])));await h.publisher.poll();
    const data=JSON.stringify(observation),epoch=h.json("control.json").captureEpoch;
    const frame={...h.envelope,captureEpoch:epoch,seq:1,kind:"observationChunk",observationId:1,chunkIndex:0,chunkCount:1,totalByteLength:Buffer.byteLength(data),byteLength:Buffer.byteLength(data),data};
    const size=Buffer.byteLength(JSON.stringify(frame)),marker=JSON.stringify({v:1,basename:`frame.${epoch}.1.upload`,byteLength:size});
    assert.equal(h.publisher.snapshot().queuedBytes,size+Buffer.byteLength(marker));h.close();
  });
});

describe("native late-callback cancellation",()=>{
  it("does no second existence probe after the first probe returns beyond cancellation",async()=>{
    const h=await liveNative();await h.start();let finish!:(value:boolean)=>void;const calls:string[]=[];const exists=h.driver.fs.exists;
    h.driver.fs.exists=async path=>{calls.push(path);if(path.includes("frame.")&&path.endsWith(".upload"))return new Promise<boolean>(resolve=>{finish=resolve;});return exists(path);};
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"source"}])));const pending=h.publisher.poll();
    for(let i=0;i<150&&!finish;i++)await Promise.resolve();assert.ok(finish);h.publisher.stop();const count=calls.length;finish(false);await pending;
    assert.equal(calls.length,count);assert.equal(h.writes.filter(w=>w.path.includes("frame.")).length,0);h.close();
  });
  it("cancels a native-end source marker but allows the same process to renew",async()=>{
    const h=await liveNative();await h.start();let finish!:()=>void;
    h.setBeforeWrite(async path=>{if(path.includes("frame.")&&path.endsWith(".upload"))await new Promise<void>(resolve=>{finish=resolve;});});
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"old"}])));const pending=h.publisher.poll();
    for(let i=0;i<150&&!finish;i++)await Promise.resolve();assert.ok(finish);h.publisher.nativeEnd(fixtureTarget.claudeSessionId);finish();await pending;
    assert.equal(h.writes.filter(w=>w.path.includes("frame.")&&w.path.endsWith(".ready")).length,0);assert.equal(h.publisher.snapshot().phase,"suspended");
    h.setBeforeWrite(undefined);h.publisher.nativeStart(fixtureTarget.claudeSessionId,"resume");await h.drain(8);assert.equal(h.protocol.snapshot().state,"active");assert.equal(h.values().length,0);h.close();
  });
});

describe("native literal launch binding vectors",()=>{
  const bindings=(JSON.parse(readFileSync("test/fixtures/companion/capture-cases.json","utf8")) as {bindingExamples:{id:string;environment:Native;nativeSessionId?:string}[]}).bindingExamples;
  for(const vector of bindings)it(`${vector.id} applies the exact structural mutation before actual producer/host admission`,async()=>{
    const h=await nativeCaptureHarness();const fixtureEnvironment={...vector.environment};
    // Only owned-directory/token authority is rebased to this real resource owner.
    if(vector.id==="B01"||vector.id==="B04"){fixtureEnvironment.CLAUDE_WORKSPACES_CAPTURE_DIR=h.environment.CLAUDE_WORKSPACES_CAPTURE_DIR;fixtureEnvironment.CLAUDE_WORKSPACES_CAPTURE_TOKEN=h.environment.CLAUDE_WORKSPACES_CAPTURE_TOKEN;}
    const publisher=(await loadPublisher()).createFilePublisher(h.driver,fixtureEnvironment);publisher.nativeStart(vector.nativeSessionId??fixtureTarget.claudeSessionId,"startup");
    for(let i=0;i<5;i++){await publisher.poll();await h.protocol.poll();}
    if(vector.id==="B01")assert.equal(h.protocol.snapshot().state,"active");
    else if(vector.id==="B04"){assert.equal(h.protocol.snapshot().state,"failed");assert.equal(h.json("control.json").reasonCode,"IDENTITY_CHANGED");}
    else {assert.equal(h.writes.length,0);assert.equal(publisher.snapshot().phase,"closed");}
    publisher.stop();h.protocol.stop();assert.equal(h.clock.pendingDelays().length,0);
  });
});

describe("native review fix round one C1",()=>{
  const mismatch="22222222-2222-4222-8222-222222222222";
  for(const phase of ["request-written","grant-visible","grant-observed","activation-written","active-unobserved"] as const) {
    it(`latches a UUID mismatch at ${phase} until authenticated terminal identity retirement`,async()=>{
      const h=await liveNative();h.publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await h.publisher.poll();
      if(phase!=="request-written")await h.protocol.poll();
      if(phase==="grant-observed") {
        const ackPath=resolve(h.binding.directory,"ack.json"),ack=h.fs.entries.get(ackPath)!;
        h.fs.entries.delete(ackPath);await h.publisher.poll();h.fs.entries.set(ackPath,ack);assert.equal(h.publisher.snapshot().phase,"granted");
      }
      if(phase==="activation-written"||phase==="active-unobserved")await h.publisher.poll();
      if(phase==="active-unobserved")await h.protocol.poll();
      const beforeWindow=h.publisher.window();let finish!:(value:unknown)=>void;
      const oldRow=stored([{type:"text",text:"late original source"}]);
      const late=h.observer.observe("session.append",append([]),()=>new Promise(resolve=>{finish=resolve;}));
      const input={session_id:mismatch,source:"resume"},original=structuredClone(input),nativeResult={unchanged:true};let count=0;
      assert.equal(await h.observer.observe("classic.SessionStart",input,async value=>{count++;assert.equal(value,input);return nativeResult;}),nativeResult);
      assert.equal(count,1);assert.deepEqual(input,original);assert.ok(h.publisher.window()>beforeWindow,"mismatch must invalidate in-flight source immediately");
      finish(oldRow);assert.equal(await late,oldRow);
      // A later matching notification must not erase the already observed mismatch.
      await h.observer.observe("classic.SessionStart",{session_id:fixtureTarget.claudeSessionId,source:"startup"},nextReturning(nativeResult));
      await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"mismatched source"}])));
      await h.drain(8);assert.equal(h.values().length,0);assert.equal(h.protocol.snapshot().state,"failed");
      const control=h.json("control.json");assert.equal(control.reasonCode,"IDENTITY_CHANGED");assert.equal(control.token,h.binding.token);
      assert.equal(control.claudeSessionId,fixtureTarget.claudeSessionId);assert.equal(control.offerId,null);
      const reports=h.writes.filter(w=>w.path.endsWith(".upload")&&!w.path.includes("frame.")).map(w=>JSON.parse(w.text));
      assert.ok(reports.some(value=>value.nativeSessionId===mismatch));
      assert.ok(reports.every(value=>value.claudeSessionId===fixtureTarget.claudeSessionId&&value.token===h.binding.token));
      assert.equal(h.writes.filter(w=>w.path.includes("frame.")).length,0);
      const written=h.writes.length;h.publisher.nativeStart(fixtureTarget.claudeSessionId,"resume");await h.drain(3);
      assert.equal(h.writes.length,written);assert.equal(h.clock.pendingDelays().length,0);h.close();
    });
  }
  for(const phase of ["request-written","grant-visible","active-unobserved"] as const)it(`still coalesces matching startup notifications at ${phase}`,async()=>{
    const h=await liveNative();h.publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await h.publisher.poll();
    if(phase!=="request-written")await h.protocol.poll();if(phase==="active-unobserved"){await h.publisher.poll();await h.protocol.poll();}
    const window=h.publisher.window();for(let i=0;i<3;i++)await h.observer.observe("classic.SessionStart",{session_id:fixtureTarget.claudeSessionId,source:"startup"},nextReturning({}));
    assert.equal(h.publisher.window(),window);await h.drain(5);assert.equal(h.protocol.snapshot().state,"active");
    assert.equal(h.writes.filter(w=>w.path.includes("request.")&&w.path.endsWith(".upload")).length,1);
    assert.equal(h.writes.filter(w=>w.path.includes("activate.")&&w.path.endsWith(".upload")).length,1);h.close();
  });
  it("admits a new managed owner after identity retirement without reopening the old publisher",async()=>{
    const old=await liveNative();await old.start();old.publisher.nativeStart(mismatch,"resume");await old.drain(5);assert.equal(old.protocol.snapshot().state,"failed");
    const replacement=await liveNative();await replacement.start();assert.equal(replacement.protocol.snapshot().state,"active");
    old.publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await old.publisher.poll();assert.equal(old.publisher.snapshot().phase,"closed");
    old.close();replacement.close();
  });
});

describe("native review fix round one I1",()=>{
  for(const arrivals of [1,64,70])it(`publishes automatically under 25ms source arrivals with batch=${arrivals}`,async function(){
    this.timeout(15000);const h=await liveNative();await h.start();const before=h.writes.length;
    const heartbeats:number[]=[];h.setBeforeWrite((path,text)=>{if(path.endsWith(".upload")&&JSON.parse(text).kind==="heartbeat")heartbeats.push(h.clock.time);});
    let active=0,maximum=0;
    for(const key of ["exists","stat","read","list","write"] as const){const original=h.driver.fs[key];Object.assign(h.driver.fs,{[key]:async(...args:unknown[])=>{active++;maximum=Math.max(maximum,active);try{return await Reflect.apply(original,h.driver.fs,args);}finally{active--;}}});}
    for(let i=0;i<240;i++){
      h.clock.advance(25);h.clock.fireDue();await new Promise<void>(resolve=>setImmediate(resolve));await h.protocol.poll();
      for(const event of h.events)if(event.kind==="observation")h.host.releaseRetention(event.retention);
      for(let j=0;j<arrivals;j++){
        const result=stored([{type:"text",text:"automatic source"}]);assert.equal(await h.observer.observe("session.append",append([]),nextReturning(result)),result);
      }
      const snapshot=h.publisher.snapshot();assert.ok(snapshot.queuedSlots<=64);assert.ok(snapshot.queuedBytes<=4194304);assert.ok(h.clock.pendingDelays().length<=2);
      assert.equal(h.protocol.snapshot().state,"active",`host health at ${h.clock.time}ms`);
    }
    const frames=h.writes.slice(before).filter(w=>w.path.includes("frame.")&&w.path.endsWith(".upload")).map(w=>JSON.parse(w.text));
    assert.ok(frames.length>50);assert.ok(frames.filter(v=>v.kind==="heartbeat").length>=5);assert.equal(maximum,1);
    let previous=0;for(const at of heartbeats){assert.ok(at-previous<=1050);previous=at;}assert.ok(h.clock.time-previous<=1050);
    if(arrivals>1)assert.ok(frames.some(v=>v.kind==="gap"&&v.reason==="OVERFLOW"));else assert.ok(h.values().length>0);
    h.close();assert.equal(h.clock.pendingDelays().length,0);
  });
  it("does not push an already scheduled busy deadline later",async()=>{
    const h=await liveNative();await h.start();await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"first"}])));
    h.clock.advance(25);await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"second"}])));
    assert.equal(Math.min(...h.clock.pendingDelays()),25);h.publisher.gap("OVERFLOW");assert.equal(Math.min(...h.clock.pendingDelays()),25);h.close();
  });
  it("preserves an idle timer already earlier than the requested busy wake",async()=>{
    const h=await liveNative();await h.start();h.clock.advance(240);
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"earlier idle"}])));
    assert.equal(Math.min(...h.clock.pendingDelays()),10);h.clock.advance(10);h.clock.fireDue();await new Promise<void>(resolve=>setImmediate(resolve));await h.protocol.poll();
    assert.equal(h.values().length,1);h.close();
  });
  it("ignores a cancelled wake callback after same-process renewal starts",async()=>{
    const h=await liveNative();await h.start();const callbacks:(()=>void)[]=[];const after=h.driver.clock.after;
    h.driver.clock.after=(ms,callback)=>{callbacks.push(callback);return after(ms,callback);};
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"old"}])));const oldWake=callbacks[0]!;
    h.publisher.nativeEnd(fixtureTarget.claudeSessionId);h.publisher.nativeStart(fixtureTarget.claudeSessionId,"resume");
    const calls=h.fs.calls.length,delays=h.clock.pendingDelays();oldWake();await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(h.fs.calls.length,calls);assert.deepEqual(h.clock.pendingDelays(),delays);h.close();
  });
});




describe("native review fix round one in-flight C1",()=>{
  for(const kind of ["request","activate"])it(`retains a mismatch reported while the ${kind} upload is still in flight`,async()=>{
    const h=await liveNative();h.publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");
    if(kind==="activate"){await h.publisher.poll();await h.protocol.poll();}
    let finish!:()=>void;h.setBeforeWrite(async path=>{if(path.includes(kind+".")&&path.endsWith(".upload"))await new Promise<void>(resolve=>{finish=resolve;});});
    const polling=h.publisher.poll();for(let i=0;i<150&&!finish;i++)await Promise.resolve();assert.ok(finish);
    const oldWindow=h.publisher.window(),nativeResult={native:true};let calls=0;
    assert.equal(await h.observer.observe("classic.SessionStart",{session_id:"22222222-2222-4222-8222-222222222222",source:"resume"},async()=>{calls++;return nativeResult;}),nativeResult);
    assert.equal(calls,1);assert.ok(h.publisher.window()>oldWindow);
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"forbidden new identity source"}])));
    h.setBeforeWrite(undefined);finish();await polling;await h.drain(8);
    assert.equal(h.protocol.snapshot().state,"failed");assert.equal(h.json("control.json").reasonCode,"IDENTITY_CHANGED");assert.equal(h.values().length,0);h.close();
  });
});

describe("native review fix round one stale clock",()=>{
  it("does not resurrect automatic polling when an expired clock.now promise fulfills late",async()=>{
    const h=await liveNative();await h.start();let finish!:(value:number)=>void;h.driver.clock.now=()=>new Promise<number>(resolve=>{finish=resolve;});
    await h.observer.observe("session.append",append([]),nextReturning(stored([{type:"text",text:"expired"}])));
    h.clock.advance(50);h.clock.fireDue();await new Promise<void>(resolve=>setImmediate(resolve));assert.ok(finish);
    h.clock.advance(2000);h.clock.fireDue();assert.equal(h.publisher.snapshot().phase,"closed");const calls=h.fs.calls.length,writes=h.writes.length;
    finish(50);await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(h.fs.calls.length,calls);assert.equal(h.writes.length,writes);assert.equal(h.clock.pendingDelays().length,0);h.close();
  });
});


describe("native producer lifetime after real host death",function(){
  this.timeout(15000);
  it("models SDK write creating each missing ancestor after directory deletion",async()=>{
    const h=await nativeCaptureHarness();
    try {
      for(const path of [...h.fs.entries.keys()])if(path===h.binding.directory||path.startsWith(h.binding.directory+sep))h.fs.entries.delete(path);
      const path=resolve(h.binding.directory,"nested","late.upload");await h.driver.fs.write(path,"late SDK effect");
      assert.equal(h.fs.entries.get(h.binding.directory)?.info.kind,"directory");
      assert.equal(h.fs.entries.get(dirname(path))?.info.kind,"directory");
      assert.ok((await h.fs.list(h.fs.root,256)).names.includes(h.binding.directory.slice(h.fs.root.length+1)));
      assert.equal((await h.fs.read(path,100)).toString(),"late SDK effect");
    } finally {h.protocol.stop();}
  });
  it("retains dead-host lifetime headroom before and after an independently surviving SDK write recreates its channel",async()=>{
    const h=await diskCompanionHarness();const child=captureHostProcess(h.root);
    let publisher:Publisher|undefined;let polling:Promise<void>|undefined;let finish:()=>void=()=>{};
    try {
      const prepared=await child.request("prepare");
      const supported=process.platform==="win32"&&process.arch==="x64"&&process.versions.node==="24.14.0"&&process.versions.uv==="1.51.0"&&!process.versions.electron;
      if(!supported){assert.equal(prepared.ok,false);assert.deepEqual(await readdir(h.root),[]);return;}
      assert.equal(prepared.ok,true);const exposed=await child.request("expose");assert.ok(exposed.ok&&exposed.binding);const old=exposed.binding;
      let entered!:()=>void;const waiting=new Promise<void>(r=>{entered=r;});const gate=new Promise<void>(r=>{finish=r;});let first=true;
      const driver={fs:{
        exists:async(path:string)=>{try{await lstat(path);return true;}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return false;throw error;}},
        stat:async(path:string)=>{const s=await lstat(path);return {kind:s.isDirectory()?"dir":s.isFile()?"file":"other",size:s.size,isLink:s.isSymbolicLink(),mtimeMs:s.mtimeMs,realPath:await realpath(path)};},
        list:async(path:string)=>Promise.all((await readdir(path)).map(async name=>{const s=await lstat(resolve(path,name));return {name,kind:s.isDirectory()?"dir":"file",size:s.size,isLink:s.isSymbolicLink()};})),
        read:(path:string)=>readFile(path,"utf8"),
        write:async(path:string,text:string)=>{if(first){first=false;assert.match(path,/request\.[a-f0-9]{32}\.upload$/);entered();await gate;}await mkdir(dirname(path),{recursive:true});await writeFile(path,text);}
      },clock:{now:async()=>0,after:()=>({cancel(){}})}};
      publisher=(await loadPublisher()).createFilePublisher(driver,{CLAUDE_WORKSPACES_CAPTURE_DIR:old.directory,CLAUDE_WORKSPACES_CAPTURE_TOKEN:old.token,
        CLAUDE_WORKSPACES_CAPTURE_SESSION_ID:fixtureTarget.sessionId,CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID:fixtureTarget.claudeSessionId,CLAUDE_WORKSPACES_CAPTURE_GENERATION:fixtureTarget.generation});
      publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");polling=publisher.poll();await waiting;
      await child.stop();assert.throws(()=>process.kill(child.child.pid!,0),(error:unknown)=>(error as NodeJS.ErrnoException).code==="ESRCH");
      const host=new CompanionCapture({storageRoot:h.root,currentTarget:()=>fixtureTarget});assert.equal((await host.sweep()).ok,true);
      assert.equal((await readdir(h.root)).some(name=>name===old.directory.slice(h.root.length+1)),false,"ESRCH still permits marked directory cleanup");
      const retained=(await readdir(h.root)).filter(name=>name.startsWith("companion-admission."));assert.equal(retained.length,1,"host death is not producer quiescence");
      const intent=await readFile(resolve(h.root,retained[0]!));
      const bindings:CaptureBinding[]=[];
      for(let i=0;i<10;i++){
        const result=await host.prepare(fixtureTarget.sessionId);assert.ok(result.ok);bindings.push(result.value);
        if(i===0)for(let n=0;n<14;n++)await writeFile(resolve(result.value.directory,"unknown-"+n),"");
      }
      assert.equal((await host.prepare(fixtureTarget.sessionId)).ok,false,"the independent producer keeps the eleventh lifetime bucket before its pending effects occur");
      for(const binding of bindings){
        for(let i=1;i<=8;i++){await writeFile(resolve(binding.directory,"frame."+"a".repeat(32)+"."+i+".committed"),Buffer.alloc(262000));await writeFile(resolve(binding.directory,"frame."+"a".repeat(32)+"."+i+".ready"),Buffer.alloc(144));}
        for(const name of ["control.json","ack.json","control.json.tmp","ack.json.tmp"])await writeFile(resolve(binding.directory,name),Buffer.alloc(4096));
      }
      const inventory=async()=>{let files=0,bytes=0;for(const name of await readdir(h.root)){const path=resolve(h.root,name),s=await lstat(path);if(s.isDirectory()){for(const name of await readdir(path)){const file=await lstat(resolve(path,name));files++;bytes+=file.size;}}else{files++;bytes+=s.size;}}return {files,bytes};};
      assert.equal((await inventory()).files,235);finish();await polling;
      assert.deepEqual((await readdir(old.directory)).map(name=>name.split(".").at(-1)).sort(),["ready","upload"]);
      const after=await inventory();assert.equal(after.files,237);assert.ok(after.bytes<=33554432);
      // Materialize the old producer's remaining permitted 14 transaction and four metadata files.
      for(let i=1;i<=7;i++){await writeFile(resolve(old.directory,"frame."+"b".repeat(32)+"."+i+".upload"),Buffer.alloc(262000));await writeFile(resolve(old.directory,"frame."+"b".repeat(32)+"."+i+".ready"),Buffer.alloc(144));}
      for(const name of ["control.json","ack.json","control.json.tmp","ack.json.tmp"])await writeFile(resolve(old.directory,name),Buffer.alloc(4096));
      const full=await inventory();assert.equal(full.files,255,"all future channel file quotas fit; the dead channel has no ownership marker");assert.ok(full.bytes<=33554432);
      assert.deepEqual(await readFile(resolve(h.root,retained[0]!)),intent);assert.equal((await host.prepare(fixtureTarget.sessionId)).ok,false);
      const healthy=bindings.at(-1)!;assert.equal((await host.validateOwner(healthy)).ok,true);
      // The synthetic future temp file is not a host-held publication receipt; retire it first.
      await unlink(resolve(healthy.directory,"ack.json.tmp"));
      assert.equal((await host.writeMetadata(healthy,"ack.json",Buffer.from("healthy current owner"))).ok,true);
      // Never-exposed and exact held managed-exit cleanup both recover ordinary capacity.
      assert.equal((await host.revoke(healthy)).ok,true);let fresh=await host.prepare(fixtureTarget.sessionId);assert.ok(fresh.ok);
      host.markProducerExposed(fresh.value);host.confirmManagedPtyExit(fresh.value);await host.settled(fresh.value);
      fresh=await host.prepare(fixtureTarget.sessionId);assert.ok(fresh.ok);assert.equal((await host.revoke(fresh.value)).ok,true);
      assert.deepEqual(await readFile(resolve(h.root,retained[0]!)),intent,"unrelated exact cleanup cannot release the old producer's intent");
    } finally {finish();await polling;publisher?.stop();await child.stop();await h.dispose();}
  });
});
