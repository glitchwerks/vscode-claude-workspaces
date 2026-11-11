import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as codec from "../../src/companion/companionTypes";
import { companionHarness, CaptureFixtureFileSystem, fixtureTarget, diskCompanionHarness, protocolHarness, CaptureFixtureClock } from "../support/companionHarness";
import { lstat, readFile, writeFile, symlink, link } from "node:fs/promises";
import { CompanionCapture } from "../../src/companion/companionCapture";
import type { CaptureResourceResult } from "../../src/companion/companionCapture";
import type { CaptureBinding } from "../../src/companion/companionTypes";

function accepted<T>(result:CaptureResourceResult<T>):T {
  assert.equal(result.ok,true,JSON.stringify(result));
  if(!result.ok) throw new Error("expected accepted operation");
  return result.value;
}

describe("companion review recovery and arbitration regressions",()=>{
  it("I2 lets confirmed cleanup await mutation settlement without holding healthy sessions behind it",async()=>{
    const {host,fs,setTarget}=companionHarness({deadlineMs:80});const a=accepted(await host.prepare("managed-A"));
    setTarget({...fixtureTarget,sessionId:"managed-B"});const b=accepted(await host.prepare("managed-B"));
    let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});
    fs.before=async(op,path)=>{if(op==="write"&&path===resolve(a.directory,"ack.json.tmp"))await gate;};
    host.markProducerExposed(a);assert.equal((await host.writeMetadata(a,"ack.json",Buffer.from("late"))).ok,false);
    host.confirmManagedPtyExit(a);
    accepted(await host.writeMetadata(b,"ack.json",Buffer.from("healthy while cleanup waits")));
    finish();await host.settled(a);
    assert.equal(fs.entries.has(a.directory),false);assert.equal(fs.entries.has(b.directory),true);
  });
  it("I2 reserves future directory slots for unresolved exclusive creations",async()=>{
    const {host,fs}=companionHarness({deadlineMs:12});
    for(let index=0;index<254;index++)fs.put(resolve(fs.root,"foreign-"+index),"file");
    let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});fs.before=async op=>{if(op==="mkdir")await gate;};
    try {
      for(let index=0;index<3;index++)assert.equal((await host.prepare("managed-A")).ok,false);
      assert.equal(fs.calls.filter(call=>call.operation==="mkdir").length,2);
    } finally {finish();await new Promise<void>(r=>setImmediate(r));}
  });
  it("I2 retains the pending file slot and rejects replacement temp identity during reconciliation",async()=>{
    const {host,fs,setTarget}=companionHarness({deadlineMs:25});const a=accepted(await host.prepare("managed-A"));
    setTarget({...fixtureTarget,sessionId:"managed-B"});const b=accepted(await host.prepare("managed-B"));
    for(let index=1;index<=253;index++)fs.put(resolve(b.directory,`frame.${"a".repeat(32)}.${index}.committed`),"file");
    let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});const temp=resolve(a.directory,"ack.json.tmp");
    fs.before=async(op,path)=>{if(op==="write"&&path===temp)await gate;};
    assert.equal((await host.writeMetadata(a,"ack.json",Buffer.from("held"))).ok,false);
    assert.equal((await host.reserve(b,0,1)).ok,false);finish();await new Promise<void>(r=>setImmediate(r));fs.before=undefined;
    fs.put(temp,"file","replacement");assert.equal((await host.writeMetadata(a,"ack.json",Buffer.from("forbidden replacement"))).ok,false);
    assert.equal(Buffer.from(await fs.read(temp,4096)).toString(),"replacement");accepted(await host.validateOwner(b));
  });
  it("I1 preserves exact ownership for retirement and recovery after a settled transaction lock error",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
    const signal=host.signal(b)!;const frame=`frame.${"a".repeat(32)}.1.committed`;
    fs.put(resolve(b.directory,frame),"file","old-epoch");
    fs.before=(op,path)=>{if(op==="stat"&&path.endsWith("ack.json"))throw Object.assign(new Error("private lock"),{code:"EACCES"});};
    assert.equal((await host.readOptionalFile(b,"ack.json",4096)).ok,false);fs.before=undefined;
    assert.equal(signal.aborted,false);accepted(await host.retireFiles(b,[frame]));
    accepted(await host.writeMetadata(b,"ack.json",Buffer.from("retired")));
    accepted(await host.writeMetadata(b,"control.json",Buffer.from("recovery-offer")));
    assert.equal(Buffer.from(accepted(await host.readFile(b,"control.json",4096))).toString(),"recovery-offer");
    fs.overwrite(resolve(b.directory,"ownership.json"),JSON.stringify({...b.marker,generation:"foreign"}));
    assert.equal((await host.writeMetadata(b,"control.json",Buffer.from("forbidden"))).ok,false);assert.equal(signal.aborted,true);
    fs.overwrite(resolve(b.directory,"ownership.json"),JSON.stringify(b.marker));
    assert.equal((await host.writeMetadata(b,"control.json",Buffer.from("still forbidden"))).ok,false);
  });
  it("I2 quarantines a pending mutation without disabling another owner and reconciles a known late write",async()=>{
    const {host,fs,setTarget}=companionHarness({deadlineMs:35});const a=accepted(await host.prepare("managed-A"));
    setTarget({...fixtureTarget,sessionId:"managed-B"});const b=accepted(await host.prepare("managed-B"));
    let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});
    fs.before=async(op,path)=>{if(op==="write"&&path===resolve(a.directory,"ack.json.tmp"))await gate;};
    assert.equal((await host.writeMetadata(a,"ack.json",Buffer.from("late-old"))).ok,false);
    assert.equal((await host.writeMetadata(a,"control.json",Buffer.from("conflicting"))).ok,false);
    accepted(await host.writeMetadata(b,"ack.json",Buffer.from("healthy")));
    assert.equal(fs.entries.has(a.directory),true);finish();await new Promise<void>(r=>setImmediate(r));fs.before=undefined;
    assert.equal(fs.entries.has(resolve(a.directory,"ack.json")),false,"late write cannot publish itself");
    accepted(await host.writeMetadata(a,"ack.json",Buffer.from("retired-after-settlement")));
    assert.equal(Buffer.from(accepted(await host.readFile(a,"ack.json",4096))).toString(),"retired-after-settlement");
    setTarget({...fixtureTarget,generation:"next-generation"});const next=accepted(await host.prepare("managed-A"));
    assert.notEqual(next.directory,a.directory);accepted(await host.validateOwner(b));
  });
  it("I2 retains pending byte/file charges and never revives an explicitly revoked owner on late rejection",async()=>{
    const {host,fs,setTarget}=companionHarness({deadlineMs:30});const a=accepted(await host.prepare("managed-A"));
    setTarget({...fixtureTarget,sessionId:"managed-B"});const b=accepted(await host.prepare("managed-B"));
    const markerBytes=[a,b].reduce((sum,owner)=>sum+fs.entries.get(resolve(owner.directory,"ownership.json"))!.info.bytes,0);
    fs.put(resolve(b.directory,"control.json"),"file");const retained=fs.entries.get(resolve(b.directory,"control.json"))!;
    retained.info={...retained.info,bytes:33554432-markerBytes-4096};
    let reject!:()=>void;const gate=new Promise<void>((_,rejectGate)=>{reject=()=>rejectGate(Object.assign(new Error("private late rejection"),{code:"EACCES"}));});
    fs.before=async(op,path)=>{if(op==="write"&&path===resolve(a.directory,"ack.json.tmp"))await gate;};
    host.markProducerExposed(a);
    assert.equal((await host.writeMetadata(a,"ack.json",Buffer.alloc(4096))).ok,false);
    assert.equal((await host.reserve(b,1,1)).ok,false,"pending bytes count although no file exists yet");
    accepted(await host.revoke(a));const signal=host.signal(a)!;assert.equal(signal.aborted,true);
    reject();await new Promise<void>(r=>setImmediate(r));fs.before=undefined;
    accepted(await host.reserve(b,1,1));assert.equal(signal.aborted,true);
    assert.equal((await host.writeMetadata(a,"ack.json",Buffer.from("resurrect"))).ok,false);
    assert.equal(fs.entries.has(a.directory),true,"rejection is not PTY exit");
  });
  it("I3 services two exit cleanups queued behind the same content read",async()=>{
    const {host,fs,setTarget}=companionHarness();const a=accepted(await host.prepare("managed-A"));
    setTarget({...fixtureTarget,sessionId:"managed-B"});const b=accepted(await host.prepare("managed-B"));
    fs.put(resolve(a.directory,"ack.json"),"file","ack");
    let finish!:()=>void;let start!:()=>void;const gate=new Promise<void>(r=>{finish=r;});const entered=new Promise<void>(r=>{start=r;});
    fs.before=async(op,path)=>{if(op==="read"&&path===resolve(a.directory,"ack.json")){start();await gate;}};
    const reading=host.readFile(a,"ack.json",4096);await entered;
    host.markProducerExposed(a);host.markProducerExposed(b);host.confirmManagedPtyExit(a);host.confirmManagedPtyExit(b);
    finish();assert.equal((await reading).ok,false);await Promise.all([host.settled(a),host.settled(b)]);
    assert.equal(fs.entries.has(a.directory),false);assert.equal(fs.entries.has(b.directory),false);
  });
  it("I3 fairly serializes simultaneous preparations and content operations",async()=>{
    const {host,fs,setTarget}=companionHarness();setTarget({...fixtureTarget,sessionId:"managed-B"});
    const [a,b]=(await Promise.all([host.prepare("managed-A"),host.prepare("managed-B")])).map(accepted);
    assert.notEqual(a!.directory,b!.directory);
    const results=await Promise.all([host.writeMetadata(a!,"ack.json",Buffer.from("first")),host.writeMetadata(b!,"ack.json",Buffer.from("second"))]);
    results.forEach(accepted);
    assert.deepEqual(fs.calls.filter(call=>call.operation==="rename").map(call=>call.path),[resolve(a!.directory,"ack.json.tmp"),resolve(b!.directory,"ack.json.tmp")]);
  });
  it("I3 expires queued work at its original deadline and bounds the waiter count",async()=>{
    const clock=new CaptureFixtureClock();
    const {host,fs}=companionHarness({deadlineMs:25,now:clock.now,schedule:clock.schedule});const b=accepted(await host.prepare("managed-A"));
    let finish!:()=>void;let start!:()=>void;const gate=new Promise<void>(r=>{finish=r;});const entered=new Promise<void>(r=>{start=r;});
    fs.put(resolve(b.directory,"ack.json"),"file","ack");
    fs.before=async(op,path)=>{if(op==="read"&&path.endsWith("ack.json")){start();await gate;}};
    const read=host.readFile(b,"ack.json",4096);await entered;
    const namedWaiter=host.writeMetadata(b,"control.json",Buffer.from("queued body must never run"));
    const queued=Array.from({length:255},()=>host.validateOwner(b));
    const overflow=await host.writeMetadata(b,"control.json",Buffer.from("must not write"));
    assert.deepEqual(overflow,{ok:false,reason:"cleanup-capacity"});
    clock.advance(25);clock.fireDue();
    assert.deepEqual(await namedWaiter,{ok:false,reason:"cleanup"});
    assert.equal(fs.calls.some(call=>call.operation==="write"&&call.path.endsWith("control.json.tmp")),false);
    assert.equal((await read).ok,false);await Promise.all(queued);
    assert.equal(fs.entries.has(resolve(b.directory,"control.json")),false);
    finish();await new Promise<void>(r=>setImmediate(r));fs.before=undefined;
    accepted(await host.writeMetadata(b,"control.json",Buffer.from("future operation")));
  });
});

describe("companion owned resources",()=>{
  it("rejects a target lookup that returns another session before creating resources",async()=>{
    const {host,fs}=companionHarness({currentTarget:()=>({...fixtureTarget,sessionId:"other"})});
    assert.equal((await host.prepare(fixtureTarget.sessionId)).ok,false);
    assert.equal(fs.calls.some(call=>call.operation==="mkdir"),false);
  });
  it("keeps each managed session current independently in one shared resource manager",async()=>{
    const {host,setTarget}=companionHarness();
    const a=accepted(await host.prepare("managed-A"));
    setTarget({...fixtureTarget,sessionId:"managed-B",generation:"generation-B"});
    const b=accepted(await host.prepare("managed-B"));
    assert.equal(a.marker.sessionId,"managed-A");assert.equal(b.marker.sessionId,"managed-B");
    accepted(await host.validateOwner(a));accepted(await host.validateOwner(b));
    assert.equal(host.markProducerExposed(a),true);assert.equal(host.markProducerExposed(b),true);
    setTarget(undefined,"managed-A");
    assert.equal((await host.validateOwner(a)).ok,false);accepted(await host.validateOwner(b));
    assert.equal(host.environment({},b).CLAUDE_WORKSPACES_CAPTURE_SESSION_ID,"managed-B");
    assert.equal((await host.prepare("missing-session")).ok,false);
  });
  it("shares global reservations across concurrently current managed sessions",async()=>{
    const {host,fs,setTarget}=companionHarness();
    const a=accepted(await host.prepare("managed-A"));
    setTarget({...fixtureTarget,sessionId:"managed-B",generation:"generation-B"});
    const b=accepted(await host.prepare("managed-B"));
    assert.notEqual(a.marker.sessionId,b.marker.sessionId);
    const markerBytes=fs.entries.get(resolve(a.directory,"ownership.json"))!.info.bytes+fs.entries.get(resolve(b.directory,"ownership.json"))!.info.bytes;
    fs.put(resolve(a.directory,"control.json"),"file");
    const retained=fs.entries.get(resolve(a.directory,"control.json"))!;retained.info={...retained.info,bytes:33554432-markerBytes-2097152};
    const first=accepted(await host.reserve(a,1048576,1));accepted(await host.reserve(b,1048576,1));
    assert.equal((await host.reserve(b,1,1)).ok,false);
    host.release(first);accepted(await host.reserve(b,1,1));
  });
  it("creates exclusive private ownership and removes inherited capture keys on an inactive overlay",async()=>{
    const {host,fs}=companionHarness();
    const binding=accepted(await host.prepare(fixtureTarget.sessionId));
    assert.ok(Object.isFrozen(binding)&&Object.isFrozen(binding.marker));
    assert.match(binding.directory,/companion-[a-f0-9]{32}$/);
    assert.match(binding.token,/^[A-Za-z0-9_-]{43}$/);
    const marker=JSON.parse(Buffer.from(await fs.read(resolve(binding.directory,"ownership.json"),1024)).toString());
    assert.deepEqual(marker,{v:1,kind:"claude-workspaces-companion",hostId:"01".repeat(16),processId:4242,channelId:"02".repeat(16),...fixtureTarget});
    const inherited={AUTH:"private-auth",UNRELATED:"keep",...Object.fromEntries(codec.captureEnvironmentKeys.map(key=>[key,"inherited"]))};
    assert.deepEqual(host.environment(inherited),{AUTH:"private-auth",UNRELATED:"keep"});
    const env=host.environment(inherited,binding);
    assert.equal(env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,binding.token);
    assert.equal(env.AUTH,"private-auth");
    assert.equal(codec.decodeCaptureLaunchBinding(env).ok,true);
    assert.equal((await host.validateOwner({...binding} as CaptureBinding)).ok,false);
    assert.equal(host.markProducerExposed({...binding} as CaptureBinding),false);
  });
  it("unpublished cancellation deletes only the held owner and aborts content work first",async()=>{
    const {host,fs}=companionHarness();const binding=accepted(await host.prepare(fixtureTarget.sessionId));
    let stopped=false;host.signal(binding)!.addEventListener("abort",()=>{stopped=true;});
    fs.before=(operation)=>{if(operation==="unlink")assert.equal(stopped,true);};
    accepted(await host.revoke(binding));
    assert.equal(fs.entries.has(binding.directory),false);
    assert.deepEqual(host.environment({KEEP:"yes"},binding),{KEEP:"yes"});
  });
  it("exposure latches once and revocation retains until exact binding exit confirmation",async()=>{
    const {host,fs}=companionHarness();const binding=accepted(await host.prepare(fixtureTarget.sessionId));
    assert.equal(host.markProducerExposed(binding),true);
    assert.equal(host.markProducerExposed(binding),false);
    accepted(await host.revoke(binding));assert.equal(fs.entries.has(binding.directory),true);
    host.confirmManagedPtyExit({...binding} as CaptureBinding);await host.settled(binding);
    assert.equal(fs.entries.has(binding.directory),true);
    host.confirmManagedPtyExit(binding);await host.settled(binding);
    assert.equal(fs.entries.has(binding.directory),false);
    assert.doesNotThrow(()=>host.confirmManagedPtyExit(binding));
  });
  it("exit before revocation cleans only its retired generation",async()=>{
    const {host,fs,setTarget}=companionHarness();const old=accepted(await host.prepare(fixtureTarget.sessionId));host.markProducerExposed(old);
    setTarget({...fixtureTarget,generation:"generation-B"});const current=accepted(await host.prepare(fixtureTarget.sessionId));
    host.confirmManagedPtyExit(old);await host.settled(old);
    assert.equal(fs.entries.has(old.directory),false);assert.equal(fs.entries.has(current.directory),true);
    accepted(await host.validateOwner(current));
  });
  it("rechecks managed identity after asynchronous creation without adopting a replacement target",async()=>{
    const {host,fs,setTarget}=companionHarness();
    fs.before=(op)=>{if(op==="write")setTarget({...fixtureTarget,generation:"changed"});};
    assert.equal((await host.prepare(fixtureTarget.sessionId)).ok,false);
    assert.equal([...fs.entries.keys()].filter(p=>p.includes("companion-01")||p.includes("companion-02")).length,0);
  });
  it("uses fresh IDs on collisions and never adopts existing files",async()=>{
    const {host,fs}=companionHarness();const collision=resolve(fs.root,"companion-"+"02".repeat(16));
    fs.put(collision,"directory");fs.put(resolve(collision,"private"),"file","sentinel");
    const b=accepted(await host.prepare(fixtureTarget.sessionId));assert.notEqual(b.directory,collision);
    assert.equal(Buffer.from(await fs.read(resolve(collision,"private"),99)).toString(),"sentinel");
  });
  for(const item of JSON.parse(readFileSync(resolve(__dirname,"../../../test/fixtures/companion/capture-cases.json"),"utf8")).ownershipExamples as {
    id:string;operation:string;markerSerialized:string|null;context:{directoryBasename:string;markerBytesBase64?:string;linkedAncestor:boolean;markerIsLinkOrReparse:boolean};expected:{admit:boolean}
  }[]) {
    if(item.operation!=="admit-current")continue;
    it(item.id+" applies marker/path input to actual owner admission",async()=>{
      let random=0;const {host,fs}=companionHarness({randomBytes:size=>Buffer.alloc(size,++random===1?0xcc:random===2?parseInt(item.context.directoryBasename.slice(-2),16):0xee)});
      const binding=accepted(await host.prepare(fixtureTarget.sessionId));const path=resolve(binding.directory,"ownership.json");
      fs.overwrite(path,item.context.markerBytesBase64?Buffer.from(item.context.markerBytesBase64,"base64"):item.markerSerialized!);
      if(item.context.linkedAncestor)fs.put(fs.root,"link","",resolve(fs.root,"elsewhere"));
      if(item.context.markerIsLinkOrReparse)fs.put(path,"link");
      assert.equal((await host.validateOwner(binding)).ok,item.expected.admit,item.id);
      assert.equal(fs.calls.filter(c=>c.operation==="unlink").length,0);
    });
  }
  for(const outcome of ["ESRCH","success","EPERM","EIO"]) {
    it("sweeps lost ownership only with ESRCH: "+outcome,async()=>{
      const {host,fs}=companionHarness();const binding=accepted(await host.prepare(fixtureTarget.sessionId));
      const lost=new CompanionCapture({storageRoot:fs.root,fs,currentTarget:()=>fixtureTarget,probeProcess:pid=>{
        assert.equal(pid,4242);if(outcome!=="success")throw Object.assign(new Error("private probe"),{code:outcome});
      }});
      accepted(await lost.sweep());assert.equal(fs.entries.has(binding.directory),outcome!=="ESRCH");
    });
  }
  for(const name of ["unknown.txt","nested","frame."+"a".repeat(32)+".01.upload","frame."+"a".repeat(32)+".9007199254740992.upload"]) {
    it("prevalidates the entire child set before deleting: "+name,async()=>{
      const {host,fs}=companionHarness();const binding=accepted(await host.prepare(fixtureTarget.sessionId));
      fs.put(resolve(binding.directory,"control.json"),"file","{}");
      fs.put(resolve(binding.directory,name),name==="nested"?"directory":"file","sentinel");
      await host.revoke(binding);
      assert.equal(fs.calls.filter(c=>c.operation==="unlink").length,0);
      assert.equal(fs.entries.has(resolve(binding.directory,"control.json")),true);
    });
  }
  it("validates all eight identity fields and rejects replacement marker inode",async()=>{
    for(const change of [{v:2},{kind:"other"},{hostId:"f".repeat(32)},{processId:4243},{channelId:"e".repeat(32)},
      {sessionId:"other"},{claudeSessionId:"22222222-2222-4222-8222-222222222222"},{generation:"other"}]) {
      const {host,fs}=companionHarness();const binding=accepted(await host.prepare(fixtureTarget.sessionId));
      fs.overwrite(resolve(binding.directory,"ownership.json"),JSON.stringify({...binding.marker,...change}));
      assert.equal((await host.validateOwner(binding)).ok,false);
      await host.revoke(binding);assert.equal(fs.entries.has(binding.directory),true);
    }
    const {host,fs}=companionHarness();const binding=accepted(await host.prepare(fixtureTarget.sessionId));
    fs.put(resolve(binding.directory,"ownership.json"),"file",JSON.stringify(binding.marker));
    assert.equal((await host.validateOwner(binding)).ok,false);
  });
  it("rejects a linked or redirected root before creating a channel",async()=>{
    for(const kind of ["link","directory"] as const) {
      const fs=new CaptureFixtureFileSystem();fs.put(fs.root,kind,"",resolve(fs.root,"redirect"));
      const host=new CompanionCapture({storageRoot:fs.root,fs,currentTarget:()=>fixtureTarget});
      assert.equal((await host.prepare(fixtureTarget.sessionId)).ok,false);assert.equal(fs.calls.some(c=>c.operation==="mkdir"),false);
    }
  });
});

describe("companion resource budgets and controlled I/O",()=>{
  it("treats only confirmed ENOENT as not ready during an optional poll",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
    const name=`request.${"a".repeat(32)}.ready`;
    assert.deepEqual(await host.readOptionalFile(b,name,4096),{ok:true,value:undefined});
    assert.equal(host.signal(b)!.aborted,false);
    fs.put(resolve(b.directory,name),"file","ready");
    const result=accepted(await host.readOptionalFile(b,name,4096));assert.equal(Buffer.from(result!).toString(),"ready");
    for(const error of ["EACCES","EIO"]) {
      const h=companionHarness();const owner=accepted(await h.host.prepare(fixtureTarget.sessionId));
      h.fs.before=(op,path)=>{if(op==="stat"&&path.endsWith(name))throw Object.assign(new Error("private-error"),{code:error});};
      assert.equal((await h.host.readOptionalFile(owner,name,4096)).ok,false);
      assert.equal(h.host.signal(owner)!.aborted,false);
      h.fs.before=undefined;accepted(await h.host.writeMetadata(owner,"control.json",Buffer.from("recovery")));
    }
    fs.overwrite(resolve(b.directory,"ownership.json"),"{}");
    assert.equal((await host.readOptionalFile(b,name,4096)).ok,false);assert.equal(host.signal(b)!.aborted,true);
    const slow=companionHarness({deadlineMs:15});const owner=accepted(await slow.host.prepare(fixtureTarget.sessionId));
    let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});
    slow.fs.before=async(op,path)=>{if(op==="stat"&&path.endsWith(name))await gate;};
    const timedOut=await slow.host.readOptionalFile(owner,name,4096);
    assert.deepEqual(timedOut,{ok:false,reason:"cleanup"});assert.equal(slow.host.signal(owner)!.aborted,false);
    finish();await new Promise<void>(r=>setImmediate(r));
  });
  it("counts staged files together with held reservations for the same channel",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
    for(let index=1;index<=7;index++)fs.put(resolve(b.directory,`frame.${"a".repeat(32)}.${index}.upload`),"file","x");
    accepted(await host.reserve(b,1,1));assert.equal((await host.reserve(b,1,1)).ok,false);
  });
  it("stops callbacks when reservation admission discovers a changed owner",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));const signal=host.signal(b)!;
    fs.overwrite(resolve(b.directory,"ownership.json"),"{}");
    assert.equal((await host.reserve(b,1,1)).ok,false);assert.equal(signal.aborted,true);
  });
  it("latches exit during in-flight content I/O, then cleans after the stopped operation settles",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));host.markProducerExposed(b);
    fs.put(resolve(b.directory,"ack.json"),"file","ack");
    let finish!:()=>void;let started!:()=>void;
    const gate=new Promise<void>(r=>{finish=r;});const entered=new Promise<void>(r=>{started=r;});
    fs.before=async(op,path)=>{if(op==="read"&&path.endsWith("ack.json")){started();await gate;}};
    const read=host.readFile(b,"ack.json",4096);await entered;
    host.confirmManagedPtyExit(b);assert.equal(host.signal(b)!.aborted,true);finish();
    assert.equal((await read).ok,false);await host.settled(b);assert.equal(fs.entries.has(b.directory),false);
  });
  it("promotes a host-computed frame once without overwriting a destination or accepting a path",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));const epoch="a".repeat(32);
    const upload=`frame.${epoch}.1.upload`;const committed=`frame.${epoch}.1.committed`;
    fs.put(resolve(b.directory,upload),"file","original");
    accepted(await host.promoteFrame(b,epoch,1));
    assert.equal(fs.entries.has(resolve(b.directory,upload)),false);
    assert.equal(Buffer.from(await fs.read(resolve(b.directory,committed),99)).toString(),"original");
    fs.put(resolve(b.directory,upload),"file","replacement");
    assert.equal((await host.promoteFrame(b,epoch,1)).ok,false);
    assert.equal(Buffer.from(await fs.read(resolve(b.directory,committed),99)).toString(),"original");
    for(const [e,seq] of [["../x",1],[epoch,0],[epoch,1.5],[epoch,Number.MAX_SAFE_INTEGER+1]] as const) {
      accepted(await host.validateOwner(b));assert.equal((await host.promoteFrame(b,e,seq)).ok,false);
    }
  });
  it("bounds staged reservations and only releases exact held tickets",async()=>{
    const {host}=companionHarness();const binding=accepted(await host.prepare(fixtureTarget.sessionId));
    const tickets=[];
    for(let index=0;index<8;index++)tickets.push(accepted(await host.reserve(binding,262144,2)));
    assert.equal((await host.reserve(binding,1,1)).ok,false);
    host.release({...tickets[0]!});assert.equal((await host.reserve(binding,1,1)).ok,false);
    host.release(tickets[0]!);accepted(await host.reserve(binding,262144,2));
    assert.equal((await host.reserve(binding,-1,1)).ok,false);
    assert.equal((await host.reserve({...binding} as CaptureBinding,1,1)).ok,false);
  });
  it("charges retained channels and their metadata against exact global byte and file boundaries",async()=>{
    for(const mode of ["bytes","files"]) {
      const {host,fs}=companionHarness();const binding=accepted(await host.prepare(fixtureTarget.sessionId));
      const marker=fs.entries.get(resolve(binding.directory,"ownership.json"))!;
      if(mode==="bytes") {
        const path=resolve(binding.directory,"control.json");fs.put(path,"file");
        const file=fs.entries.get(path)!;file.info={...file.info,bytes:33554432-marker.info.bytes-1};
      } else {
        for(let index=1;index<=254;index++)fs.put(resolve(binding.directory,`frame.${"a".repeat(32)}.${index}.committed`),"file");
      }
      const ticket=accepted(await host.reserve(binding,1,1));
      assert.equal((await host.reserve(binding,1,1)).ok,false);
      host.release(ticket);
      if(mode==="files")fs.put(resolve(binding.directory,"ack.json"),"file");
      host.markProducerExposed(binding);await host.revoke(binding);
      assert.equal((await host.prepare(fixtureTarget.sessionId)).ok,false,"a fresh channel must not bypass retained usage");
    }
  });
  it("rejects excess staged bytes and invalid numeric reservations before touching files",async()=>{
    const {host}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
    for(const bytes of [2097153,-1,Infinity,NaN,1.5])assert.equal((await host.reserve(b,bytes,1)).ok,false);
    for(const files of [0,-1,Infinity,1.5])assert.equal((await host.reserve(b,1,files)).ok,false);
    accepted(await host.reserve(b,2097152,2));assert.equal((await host.reserve(b,1,1)).ok,false);
  });
  it("writes metadata atomically and retires only validated transaction children",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
    accepted(await host.writeMetadata(b,"control.json",Buffer.from("first")));
    accepted(await host.writeMetadata(b,"control.json",Buffer.from("second")));
    assert.equal(Buffer.from(accepted(await host.readFile(b,"control.json",4096))).toString(),"second");
    assert.equal(fs.entries.has(resolve(b.directory,"control.json.tmp")),false);
    const frame="frame."+"a".repeat(32)+".1.upload";
    fs.put(resolve(b.directory,frame),"file","payload");
    accepted(await host.retireFiles(b,[frame]));assert.equal(fs.entries.has(resolve(b.directory,frame)),false);
    for(const name of ["ownership.json","../outside","control.json","frame."+"a".repeat(32)+".0.upload"]) {
      accepted(await host.validateOwner(b));assert.equal((await host.retireFiles(b,[name])).ok,false);
    }
    assert.equal(fs.entries.has(resolve(b.directory,"ownership.json")),true);
    assert.equal((await host.writeMetadata(b,"ack.json",Buffer.alloc(4097))).ok,false);
    assert.equal((await host.readFile(b,"../outside",100)).ok,false);
  });
  it("stops content callbacks after marker mismatch and leaves transaction files untouched",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));const signal=host.signal(b)!;
    fs.overwrite(resolve(b.directory,"ownership.json"),JSON.stringify({...b.marker,generation:"replacement"}));
    const name="frame."+"a".repeat(32)+".1.upload";fs.put(resolve(b.directory,name),"file","private");
    assert.equal((await host.retireFiles(b,[name])).ok,false);
    assert.equal(signal.aborted,true);assert.equal(fs.entries.has(resolve(b.directory,name)),true);
  });
  it("retains a late exclusive creation without adoption and permits a separately accounted fresh channel",async()=>{
    let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});
    const {host,fs,diagnostics}=companionHarness({deadlineMs:15});
    fs.before=async operation=>{if(operation==="mkdir")await gate;};
    assert.equal((await host.prepare(fixtureTarget.sessionId)).ok,false);finish();await new Promise<void>(r=>setImmediate(r));
    const directories=[...fs.entries.keys()].filter(p=>/companion-[a-f0-9]{32}$/.test(p));
    assert.equal(directories.length,1);const fresh=accepted(await host.prepare(fixtureTarget.sessionId));
    assert.notEqual(fresh.directory,directories[0]);assert.equal(fs.entries.has(directories[0]!),true);
    assert.ok(diagnostics.every(d=>["cleanup","capture-unavailable","cleanup-capacity"].includes(d)));
  });
  it("retains pending metadata writes without retry and permits exact-owner cleanup only after settlement",async()=>{
    const {host,fs}=companionHarness({deadlineMs:20});const b=accepted(await host.prepare(fixtureTarget.sessionId));
    let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});
    fs.before=async(op,path)=>{if(op==="write"&&path.endsWith("ack.json.tmp"))await gate;};
    assert.equal((await host.writeMetadata(b,"ack.json",Buffer.from("private-data"))).ok,false);
    assert.equal((await host.revoke(b)).ok,false);assert.equal(fs.entries.has(b.directory),true,"pending mutation prevents deletion");
    const signal=host.signal(b)!;assert.equal(signal.aborted,true);
    finish();await new Promise<void>(r=>setImmediate(r));
    assert.equal(fs.entries.has(resolve(b.directory,"ack.json.tmp")),true);
    assert.equal(fs.entries.has(resolve(b.directory,"ack.json")),false);
    accepted(await host.prepare(fixtureTarget.sessionId));assert.equal(signal.aborted,true);
    accepted(await host.revoke(b));assert.equal(fs.entries.has(b.directory),false,"known settlement permits held-owner cleanup");
    assert.equal(fs.calls.filter(c=>c.operation==="write"&&c.path.endsWith("ack.json.tmp")).length,1);
  });
  it("refuses admission when a producer exceeds staged transaction or byte capacity",async()=>{
    for(const boundary of ["transactions","bytes"]) {
      const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
      const name=`frame.${"a".repeat(32)}.1.upload`;
      fs.put(resolve(b.directory,name),"file","frame");
      if(boundary==="transactions") {
        for(let index=2;index<=9;index++)fs.put(resolve(b.directory,`frame.${"a".repeat(32)}.${index}.ready`),"file","marker");
      } else {
        const entry=fs.entries.get(resolve(b.directory,name))!;entry.info={...entry.info,bytes:2097153};
      }
      assert.equal((await host.readFile(b,name,262144)).ok,false);
      assert.equal(fs.entries.has(resolve(b.directory,name)),true);
    }
  });
});

describe("companion cleanup adversaries",()=>{
  it("removes every closed child family with ownership last and nonrecursive directory deletion",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
    const data=JSON.parse(readFileSync(resolve(__dirname,"../../../test/fixtures/companion/capture-cases.json"),"utf8")) as {resourceCleanupNames:string[]};
    for(const name of data.resourceCleanupNames)fs.put(resolve(b.directory,name),"file","inert");
    accepted(await host.revoke(b));assert.equal(fs.entries.has(b.directory),false);
    const unlinks=fs.calls.filter(c=>c.operation==="unlink");
    assert.equal(unlinks.at(-1)?.path,resolve(b.directory,"ownership.json"));
    assert.equal(fs.calls.at(-1)?.operation,"rmdir");
  });
  for(const item of JSON.parse(readFileSync(resolve(__dirname,"../../../test/fixtures/companion/capture-cases.json"),"utf8")).ownershipExamples as {
    id:string;operation:string;markerSerialized:string|null;context:{directoryBasename:string;rootEntryIndex:number;childCount:number;
      children:{name:string;regular:boolean;linkOrReparse:boolean}[];markerStillMatchesAtDelete:boolean;firstUnlinkResult:string;pidProbe:string};
    expected:{deleteDirectory:boolean;diagnostic:string|null}
  }[]) {
    if(item.operation!=="cleanup-previous")continue;
    it(item.id+" sweeps actual fixture files with the authored PID/child inputs",async()=>{
      const fs=new CaptureFixtureFileSystem();const context=item.context;
      for(let index=0;index<context.rootEntryIndex;index++)fs.put(resolve(fs.root,"foreign-"+index),"file");
      const directory=resolve(fs.root,context.directoryBasename);fs.put(directory,"directory");
      for(const child of context.children) {
        if(child.name==="ownership.json"&&item.markerSerialized===null)continue;
        fs.put(resolve(directory,child.name),child.linkOrReparse?"link":child.regular?"file":"directory",
          child.name==="ownership.json"?item.markerSerialized!:"inert");
      }
      for(let index=context.children.length;index<context.childCount;index++)
        fs.put(resolve(directory,`frame.${"a".repeat(32)}.${index}.upload`),"file");
      let markerReads=0;
      fs.before=(operation,path)=>{
        if(operation==="read"&&path.endsWith("ownership.json")&&++markerReads===2&&!context.markerStillMatchesAtDelete)
          fs.overwrite(path,JSON.stringify({...JSON.parse(item.markerSerialized!),generation:"changed"}));
        if(operation==="unlink"&&context.firstUnlinkResult!=="ok")throw Object.assign(new Error("fixture lock"),{code:"EACCES"});
      };
      const diagnostics:string[]=[];
      const host=new CompanionCapture({storageRoot:fs.root,fs,currentTarget:()=>fixtureTarget,diagnostic:reason=>diagnostics.push(reason),
        probeProcess:pid=>{assert.equal(pid,4243);if(context.pidProbe!=="success")throw Object.assign(new Error("fixture probe"),{code:context.pidProbe});}});
      await host.sweep();assert.equal(!fs.entries.has(directory),item.expected.deleteDirectory);
      assert.deepEqual(diagnostics,item.expected.diagnostic?[item.expected.diagnostic]:[]);
    });
  }
  it("stops if a new unknown child appears after whole-set validation",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));let reads=0;
    fs.before=(op,path)=>{if(op==="read"&&path.endsWith("ownership.json")&&++reads===2)fs.put(resolve(b.directory,"private-extra"),"file","untouched");};
    await host.revoke(b);assert.equal(fs.calls.some(c=>c.operation==="unlink"),false);
  });
  it("stops before the first unlink when the marker changes during whole-set validation",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
    fs.put(resolve(b.directory,"control.json"),"file","control");
    fs.before=(op,path)=>{if(op==="stat"&&path.endsWith("control.json"))fs.overwrite(resolve(b.directory,"ownership.json"),JSON.stringify({...b.marker,generation:"changed"}));};
    await host.revoke(b);assert.equal(fs.calls.some(c=>c.operation==="unlink"),false);
  });
  it("stops on replacement children after a partial cleanup and keeps marker last",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
    fs.put(resolve(b.directory,"control.json"),"file","first");fs.put(resolve(b.directory,"ack.json"),"file","second");
    fs.before=(op,path)=>{if(op==="unlink"&&path.endsWith("control.json"))fs.put(resolve(b.directory,"ack.json"),"link");};
    await host.revoke(b);
    assert.equal(fs.entries.has(resolve(b.directory,"control.json")),false);
    assert.equal(fs.entries.has(resolve(b.directory,"ack.json")),true);
    assert.equal(fs.entries.has(resolve(b.directory,"ownership.json")),true);
  });
  it("keeps unknown descendants, linked files and hard links untouched",async()=>{
    for(const kind of ["link","directory","hardlink"]) {
      const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));const child=resolve(b.directory,"ack.json");
      fs.put(child,kind==="hardlink"?"file":kind as "link"|"directory","private");
      if(kind==="hardlink"){const e=fs.entries.get(child)!;e.info={...e.info,links:2};}
      await host.revoke(b);assert.equal(fs.calls.some(c=>c.operation==="unlink"),false);
    }
  });
  it("rolls back an empty exclusive directory when marker creation fails before writing",async()=>{
    const {host,fs}=companionHarness();fs.before=op=>{if(op==="write")throw Object.assign(new Error("private lock"),{code:"EBUSY"});};
    assert.equal((await host.prepare(fixtureTarget.sessionId)).ok,false);
    assert.equal([...fs.entries.keys()].some(p=>/companion-[a-f0-9]{32}$/.test(p)),false);
  });
  it("stops locked cleanup without retries and does not expose raw filesystem errors",async()=>{
    const {host,fs,diagnostics}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
    fs.before=op=>{if(op==="unlink")throw Object.assign(new Error("PRIVATE_TOKEN_AND_PATH"),{code:"EBUSY"});};
    assert.deepEqual(await host.revoke(b),{ok:false,reason:"cleanup"});
    assert.equal(fs.calls.filter(c=>c.operation==="unlink").length,1);
    assert.ok(diagnostics.every(d=>!d.includes("PRIVATE")));assert.equal(fs.entries.has(b.directory),true);
  });
  it("bounds root and child enumeration and yields between eligible prior candidates",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare(fixtureTarget.sessionId));
    let yields=0;const sweeper=new CompanionCapture({storageRoot:fs.root,fs,currentTarget:()=>fixtureTarget,yieldControl:async()=>{yields++;},probeProcess:()=>{}});
    for(let index=0;index<256;index++)fs.put(resolve(fs.root,"unrelated-"+index),"file");
    assert.deepEqual(await sweeper.sweep(),{ok:false,reason:"cleanup-capacity"});assert.equal(yields,1);
    for(let index=0;index<256;index++)fs.put(resolve(b.directory,`frame.${"a".repeat(32)}.${index+1}.upload`),"file");
    assert.equal((await host.revoke(b)).ok,false);assert.equal(fs.calls.some(c=>c.operation==="unlink"),false);
  });
  it("stops collision attempts at eight without adopting a directory",async()=>{
    const fs=new CaptureFixtureFileSystem();const path=resolve(fs.root,"companion-"+"a".repeat(32));fs.put(path,"directory");
    const host=new CompanionCapture({storageRoot:fs.root,fs,currentTarget:()=>fixtureTarget,randomBytes:size=>Buffer.alloc(size,0xaa)});
    assert.equal((await host.prepare(fixtureTarget.sessionId)).ok,false);assert.equal(fs.calls.filter(c=>c.operation==="mkdir").length,8);
    assert.equal(fs.entries.has(path),true);
  });
});

describe("companion real Node filesystem smoke",()=>{
  it("creates regular private files, atomically writes metadata, promotes and retires a frame, then cleans on exit",async()=>{
    const h=await diskCompanionHarness();
    try {
      const b=accepted(await h.host.prepare(fixtureTarget.sessionId));accepted(await h.host.validateOwner(b));
      const path=resolve(b.directory,"ownership.json");const stat=await lstat(path);
      assert.equal(stat.isFile(),true);assert.equal(stat.isSymbolicLink(),false);
      if(process.platform!=="win32")assert.equal(stat.mode&0o777,0o600);
      assert.equal((await readFile(path)).includes(Buffer.from(b.token)),false);
      accepted(await h.host.writeMetadata(b,"ack.json",Buffer.from("ack")));
      assert.equal(Buffer.from(accepted(await h.host.readFile(b,"ack.json",4096))).toString(),"ack");
      const epoch="a".repeat(32);const upload=`frame.${epoch}.1.upload`;const committed=`frame.${epoch}.1.committed`;
      await writeFile(resolve(b.directory,upload),"frame");accepted(await h.host.promoteFrame(b,epoch,1));
      accepted(await h.host.retireFiles(b,[committed]));h.host.markProducerExposed(b);await h.host.revoke(b);
      assert.equal((await lstat(b.directory)).isDirectory(),true);
      h.host.confirmManagedPtyExit(b);await h.host.settled(b);
      await assert.rejects(lstat(b.directory),{code:"ENOENT"});
    } finally {await h.dispose();}
  });
  it("rejects real junction roots and hard-linked marker authority",async()=>{
    const h=await diskCompanionHarness();
    try {
      const junction=resolve(h.root,"redirect");await symlink(h.root,junction,process.platform==="win32"?"junction":"dir");
      const redirected=new CompanionCapture({storageRoot:junction,currentTarget:()=>fixtureTarget});
      assert.equal((await redirected.prepare(fixtureTarget.sessionId)).ok,false);
      const b=accepted(await h.host.prepare(fixtureTarget.sessionId));await link(resolve(b.directory,"ownership.json"),resolve(h.root,"marker-copy"));
      assert.equal((await h.host.validateOwner(b)).ok,false);
      await h.host.revoke(b);assert.equal((await lstat(b.directory)).isDirectory(),true);
    } finally {await h.dispose();}
  });
});

interface WireCase {
  id: string;
  frames: string[];
  initial?:{ackSeq:number;lastObservationId:number};
  clock?:{noProgressMs:number};
  expected: { disposition: string; reasonCode?: string; observations?: unknown[];ackSeq?:number;lossVisible?:boolean };
}
const fixture = JSON.parse(readFileSync(resolve(__dirname, "../../../test/fixtures/companion/capture-cases.json"), "utf8")) as {
  wireExamples: WireCase[];
  ownershipExamples: { id: string; markerSerialized: string; context: {directoryBasename: string} }[];
  bindingExamples: {id:string;environment:Record<string,unknown>}[];
  nativeReturnExamples: {id:string;expected:unknown}[];
  nativeDenyPipelines: WireCase[];
};
const envelope = {v:1, token:"A".repeat(43), sessionId:"managed-A",
  claudeSessionId:"11111111-1111-4111-8111-111111111111", generation:"generation-A"};
const epoch = "a".repeat(32);
const hex = "b".repeat(32);
const main = {kind:"main"};
const enter = {kind:"callEnter",scope:main,toolUseId:"call-A",bindingValid:true,command:"雪 🚀\nquoted"};
const flags = {interrupted:false,backgroundTaskId:null,backgroundedByUser:null,
  backgroundedByTurnAbort:null,backgroundedToDeliverMessage:null,backgroundEndsWithFinalResponse:null,
  backgroundWakesOwner:null,timedOutAfterMs:null,isImage:false,backgroundArtifactHint:false};
const rejection = (reason = "SCHEMA_REJECTED") => ({ok:false,reason});
const observation = (value: unknown) => codec.decodeNormalizedObservation(JSON.stringify(value));
const frame = (value: unknown) => codec.decodeCaptureData(JSON.stringify(value));

describe("companion capture closed codecs", () => {
  it("decodes all native-return projections and serialized withholding pipelines without execution inference", () => {
    for (const item of fixture.nativeReturnExamples) assert.deepEqual(observation(item.expected),{ok:true,value:item.expected},item.id);
    for (const item of fixture.nativeDenyPipelines) {
      const values = item.frames.map(data => {
        const decoded = codec.decodeCaptureData(data);
        assert.equal(decoded.ok,true,item.id);
        if (!decoded.ok || decoded.value.kind !== "observationChunk") assert.fail("expected a normalized chunk");
        const result = codec.decodeNormalizedObservation(decoded.value.data);
        assert.equal(result.ok,true,item.id);
        if (!result.ok) assert.fail("expected a valid normalized observation");
        return result.value;
      });
      assert.deepEqual(values,item.expected.observations);
    }
    const multi = fixture.wireExamples.find(c=>c.id==="W18")!;
    const pieces = multi.frames.map(data => {
      const result = codec.decodeCaptureData(data);
      if (!result.ok || result.value.kind !== "observationChunk") assert.fail("expected a valid chunk");
      return result.value.data;
    });
    assert.deepEqual(codec.decodeNormalizedObservation(pieces.join("")),{ok:true,value:multi.expected.observations![0]});
  });
  it("accepts metadata at 32 KiB and rejects the next byte independently of source text", () => {
    const blocks = Array.from({length:937},(_,index)=>({kind:"unsupported",index}));
    // The compact row with rowId='r' is 32755 bytes; only the ID length changes.
    for (const length of [13,14,15]) {
      const result = observation({kind:"assistantRow",scope:main,rowId:"r".repeat(length),blocks});
      if (length <= 14) assert.equal(result.ok,true);
      else assert.deepEqual(result,rejection("CONTENT_REJECTED"));
    }
  });
  it("accounts for JSON escaping in the serialized frame cap", () => {
    const base = {...envelope,kind:"observationChunk",captureEpoch:epoch,seq:1,observationId:1,chunkIndex:0,chunkCount:1};
    const accepted = {...base,totalByteLength:40000,byteLength:40000,data:"\u0001".repeat(40000)};
    assert.equal(frame(accepted).ok,true);
    assert.deepEqual(frame({...base,totalByteLength:65536,byteLength:65536,data:"\u0001".repeat(65536)}),rejection("CONTENT_REJECTED"));
    assert.equal(frame({...base,chunkCount:8192,totalByteLength:6324224,byteLength:1,data:"x"}).ok,true);
    assert.deepEqual(frame({...base,totalByteLength:6324225,byteLength:1,data:"x",chunkCount:8192}),rejection("CONTENT_REJECTED"));
  });
  it("decodes the five literal launch keys without granting directory ownership", () => {
    const good = fixture.bindingExamples[0]!;
    assert.deepEqual(codec.decodeCaptureLaunchBinding({...good.environment,UNRELATED:"preserve"}),{ok:true,value:{
      directory:"C:/synthetic/capture/channel-A",token:"A".repeat(43),sessionId:"managed-A",
      claudeSessionId:envelope.claudeSessionId,generation:"generation-A"}});
    for (const index of [1,2]) assert.deepEqual(codec.decodeCaptureLaunchBinding(fixture.bindingExamples[index]!.environment),rejection());
    assert.equal(codec.decodeCaptureLaunchBinding(fixture.bindingExamples[3]!.environment).ok,true);
    for (const key of Object.keys(good.environment)) {
      assert.deepEqual(codec.decodeCaptureLaunchBinding({...good.environment,[key]:undefined}),rejection());
    }
    for (const directory of ["C:relative","../channel","C:/ok\u0000bad","C:/\ud800"])
      assert.deepEqual(codec.decodeCaptureLaunchBinding({...good.environment,CLAUDE_WORKSPACES_CAPTURE_DIR:directory}),rejection());
  });
  it("rejects missing and extra keys at every normalized union boundary", () => {
    for (const item of fixture.wireExamples.filter(c=>/^(W0[1-9]|W1[0-4]|W43|W44)$/.test(c.id))) {
      const value = item.expected.observations![0] as Record<string,unknown>;
      assert.deepEqual(observation({...value,runEligible:true}),rejection());
      for (const key of Object.keys(value)) assert.deepEqual(observation({...value,[key]:undefined}),rejection());
    }
    for (const change of [
      {blocks:[{kind:"text",index:0,text:"",hidden:true}]},
      {blocks:[{kind:"bashRequest",index:0,toolUseId:"t"}]},
      {blocks:[{kind:"unsupported",index:0,text:"private"}]},
      {blocks:[null]}, {blocks:{}}, {blocks:[{kind:"text",index:0,text:7}]}
    ]) assert.deepEqual(observation({kind:"assistantRow",scope:main,rowId:"r",...change}),rejection());
    for (const output of [[{kind:"text",text:"",raw:"private"}],[{kind:"unavailable",reason:"MEDIA",text:"private"}],
      [{kind:"unavailable",reason:"OTHER"}],[null],{}]) {
      assert.deepEqual(observation({kind:"storedResult",scope:main,rowId:"r",index:0,toolUseId:"t",isError:false,output}),rejection());
    }
  });
  for (const item of fixture.wireExamples.filter(c => /^(W0[1-9]|W1[0-7]|W43|W44)$/.test(c.id))) {
    it(item.id + " decodes the exact outer member and normalized content", () => {
      const decoded = codec.decodeCaptureData(item.frames[0]!);
      assert.equal(decoded.ok, true);
      if (!decoded.ok) return;
      assert.deepEqual(decoded.value, JSON.parse(item.frames[0]!));
      if (decoded.value.kind === "observationChunk") {
        assert.deepEqual(codec.decodeNormalizedObservation(decoded.value.data),
          {ok:true,value:item.expected.observations![0]});
      }
    });
  }
  for (const id of ["W19","W20","W21","W22","W23","W24","W25"]) {
    const item = fixture.wireExamples.find(c => c.id === id)!;
    it(id + " rejects the outer member with the selected reason", () => {
      assert.deepEqual(codec.decodeCaptureData(item.frames[0]!), rejection(item.expected.reasonCode));
    });
  }
  for (const id of ["W26","W27","W28","W29","W30","W31","W32","W33","W34","W35","W36","W45","W46"]) {
    const item = fixture.wireExamples.find(c => c.id === id)!;
    it(id + " rejects malformed/private normalized membership", () => {
      const value = JSON.parse(item.frames[0]!) as {data:string};
      assert.deepEqual(codec.decodeNormalizedObservation(value.data), rejection(item.expected.reasonCode));
    });
  }
  it("preserves scalar newline and non-ASCII content and freezes nested snapshots", () => {
    const result = observation(enter);
    assert.deepEqual(result, {ok:true,value:enter});
    if (!result.ok) return;
    assert.ok(Object.isFrozen(result.value));
    assert.ok(Object.isFrozen(result.value.scope));
    assert.throws(() => Object.assign(result.value.scope, {kind:"agent"}));
  });
  it("uses fatal UTF-8 decoding and rejects unpaired surrogates", () => {
    for (const data of [Buffer.from([0xff]), Buffer.from([0xed,0xa0,0x80]), "{", "null", "[]"]) {
      assert.deepEqual(codec.decodeNormalizedObservation(data), rejection());
    }
    assert.deepEqual(observation({...enter,command:"\ud800"}), rejection("CONTENT_REJECTED"));
    assert.deepEqual(observation({...enter,toolUseId:"\udfff"}), rejection("CONTENT_REJECTED"));
    assert.deepEqual(codec.decodeNormalizedObservation(Buffer.from(JSON.stringify(enter),"utf8")),{ok:true,value:enter});
    assert.deepEqual(codec.decodeNormalizedObservation(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify(enter))])),rejection());
  });
  it("keeps source strings inert and rejects private nested keys and omitted fields", () => {
    assert.equal(observation({...enter,command:'{"kind":"run","token":"PRIVATE"}'}).ok,true);
    for (const change of [{scope:{kind:"main",agentId:null}},{scope:{kind:"agent",agentId:"worker"}},
      {exitCode:0},{command:undefined}]) assert.deepEqual(observation({...enter,...change}), rejection());
  });
  it("requires ascending unique safe original indices", () => {
    const row = {kind:"assistantRow",scope:main,rowId:"r",blocks:[{kind:"text",index:0,text:""},{kind:"unsupported",index:2}]};
    assert.equal(observation(row).ok,true);
    for (const index of [0,-1,0.5,Number.MAX_SAFE_INTEGER+1]) {
      assert.deepEqual(observation({...row,blocks:[row.blocks[0],{kind:"unsupported",index}]}), rejection());
    }
  });
  it("enforces nullable/boolean branch combinations without truthiness", () => {
    assert.equal(observation({...enter,bindingValid:false,command:null}).ok,true);
    for (const change of [{bindingValid:"true"},{bindingValid:false},{command:null}]) {
      assert.deepEqual(observation({...enter,...change}), rejection());
    }
    for (const branch of ["deny","error","unknown"]) {
      assert.equal(observation({kind:"callReturn",scope:main,toolUseId:"t",branch,flags:null}).ok,true);
      assert.deepEqual(observation({kind:"callReturn",scope:main,toolUseId:"t",branch,flags}), rejection());
    }
    for (const change of [{backgroundEndsWithFinalResponse:false},{backgroundWakesOwner:false},
      {timedOutAfterMs:-1},{timedOutAfterMs:"1"},{backgroundedByUser:1},{isImage:undefined}]) {
      assert.deepEqual(observation({kind:"post",scope:main,toolUseId:"t",command:"",responseState:"valid",flags:{...flags,...change}}), rejection());
    }
    assert.equal(observation({kind:"post",scope:main,toolUseId:"t",command:"",responseState:"valid",flags:{...flags,timedOutAfterMs:0.5,backgroundWakesOwner:true}}).ok,true);
    assert.deepEqual(observation({kind:"post",scope:main,toolUseId:"t",command:null,responseState:"valid",flags}),rejection());
    assert.deepEqual(observation({kind:"post",scope:main,toolUseId:"t",command:null,responseState:"invalid",flags}),rejection());
  });
  it("enforces scope/reason membership and opaque native-ID byte boundaries", () => {
    assert.equal(observation({...enter,toolUseId:"雪".repeat(85)+"a"}).ok,true);
    for (const toolUseId of ["", "雪".repeat(86)]) {
      assert.deepEqual(observation({...enter,toolUseId}),rejection("CONTENT_REJECTED"));
    }
    for (const value of [
      {kind:"unsupported",scope:main,reason:"AGENT_SCOPE"},
      {kind:"unsupported",scope:{kind:"agent",agentId:"a"},reason:"PLUGIN_ORIGIN"},
      {kind:"unsupported",scope:{kind:"agent",agentId:null},reason:"AGENT_SCOPE"}
    ]) assert.deepEqual(observation(value),rejection());
  });
  it("enforces aggregate assistant source and command UTF-8 budgets", () => {
    for (const delta of [-1,0,1]) {
      const command = "é".repeat(524287)+"x".repeat(2+delta);
      assert.equal(observation({...enter,command}).ok,delta<=0);
      const value = {kind:"assistantRow",scope:main,rowId:"r",blocks:[
        {kind:"text",index:0,text:command},{kind:"bashRequest",index:1,toolUseId:"t",command:"x"}]};
      assert.equal(observation(value).ok,delta<0);
    }
    assert.deepEqual(observation({...enter,command:"x".repeat(1048577)}),rejection("CONTENT_REJECTED"));
  });
  it("enforces complete stored-output UTF-8 budget across ordered blocks", () => {
    for (const delta of [-1,0,1]) {
      const value = {kind:"storedResult",scope:main,rowId:"r",index:0,toolUseId:"t",isError:null,
        output:[{kind:"text",text:"é".repeat(131071)},{kind:"text",text:"x".repeat(2+delta)}]};
      assert.equal(observation(value).ok,delta<=0);
    }
  });
  it("rejects excess metadata, oversized arrays and serialized observations", () => {
    const row = {kind:"assistantRow",scope:main,rowId:"r",blocks:Array.from({length:20000},(_,index)=>({kind:"unsupported",index}))};
    assert.deepEqual(observation(row),rejection("CONTENT_REJECTED"));
    assert.deepEqual(observation({...row,blocks:[...row.blocks,{kind:"unsupported",index:20000}]}),rejection("CONTENT_REJECTED"));
    assert.deepEqual(codec.decodeNormalizedObservation(" ".repeat(6324225)),rejection("CONTENT_REJECTED"));
  });
  it("enforces frame lengths, safe integers and scalar chunk boundaries", () => {
    const value = {...envelope,kind:"observationChunk",captureEpoch:epoch,seq:1,observationId:1,chunkIndex:0,chunkCount:1,totalByteLength:8,byteLength:8,data:"雪🚀\n"};
    assert.equal(frame(value).ok,true);
    for (const change of [{seq:0},{seq:1.5},{seq:Number.MAX_SAFE_INTEGER+1},{captureEpoch:epoch.toUpperCase()},
      {chunkCount:8193},{chunkIndex:-1},{chunkCount:0},{byteLength:0}]) {
      assert.deepEqual(frame({...value,...change}),rejection());
    }
    assert.deepEqual(frame({...value,byteLength:7}),rejection("CONTENT_REJECTED"));
    assert.deepEqual(frame({...value,totalByteLength:9}),rejection("CONTENT_REJECTED"));
    assert.deepEqual(frame({...value,data:"\ud800",byteLength:3}),rejection("CONTENT_REJECTED"));
    for (const size of [65535,65536,65537]) {
      assert.equal(frame({...value,totalByteLength:size,byteLength:size,data:"x".repeat(size)}).ok,size<=65536);
    }
    assert.deepEqual(codec.decodeCaptureData(" ".repeat(262145)),rejection("CONTENT_REJECTED"));
  });
  it("decodes eight ownership fields and checks the computed directory suffix", () => {
    const good = fixture.ownershipExamples[0]!;
    assert.deepEqual(codec.decodeOwnershipMarker(good.markerSerialized,good.context.directoryBasename),{ok:true,value:JSON.parse(good.markerSerialized)});
    for (const id of ["O03","O04","O05","O06","O07"]) {
      const item=fixture.ownershipExamples.find(c=>c.id===id)!;
      assert.equal(codec.decodeOwnershipMarker(item.markerSerialized,item.context.directoryBasename).ok,false,id);
    }
    const marker = JSON.parse(good.markerSerialized);
    for (const change of [{hostId:"C".repeat(32)},{processId:0},{sessionId:""},{generation:"a".repeat(129)},
      {claudeSessionId:"11111111-1111-4111-8111-11111111111A"},{kind:"composer"},{v:2}]) {
      assert.equal(codec.decodeOwnershipMarker(JSON.stringify({...marker,...change}),good.context.directoryBasename).ok,false);
    }
    assert.equal(codec.decodeOwnershipMarker(good.markerSerialized,"../"+good.context.directoryBasename).ok,false);
    assert.equal(codec.decodeOwnershipMarker(good.markerSerialized.padEnd(1024),good.context.directoryBasename).ok,true);
    assert.equal(codec.decodeOwnershipMarker(good.markerSerialized.padEnd(1025),good.context.directoryBasename).ok,false);
  });
  it("decodes closed control, request, activation and acknowledgements", () => {
    const records = [
      {...envelope,kind:"control",controlRevision:1,state:"offered",offerId:hex,captureEpoch:null,grantId:null,predecessorEpoch:null,reasonCode:null,recoveriesRemaining:1,lastRetired:null},
      {...envelope,kind:"epochRequest",offerId:hex,predecessorEpoch:null,nativeSessionId:envelope.claudeSessionId,reason:"initial"},
      {...envelope,kind:"epochActivate",captureEpoch:epoch,grantId:hex,nativeSessionId:envelope.claudeSessionId},
      {...envelope,kind:"ack",captureEpoch:epoch,disposition:"continue",ackSeq:0},
      {...envelope,kind:"ack",captureEpoch:epoch,disposition:"retired",ackSeq:4,reasonCode:"SCHEMA_REJECTED"}
    ];
    for (const value of records) {
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify(value)),{ok:true,value});
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...value,private:true})),rejection());
      const missing = {...value,token:undefined};
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify(missing)),rejection());
    }
    for (const reasonCode of ["SCHEMA_REJECTED","CONTENT_REJECTED","IDENTITY_CHANGED","TRANSACTION_TIMEOUT","CHANNEL_RETIRED","CONTROL_REJECTED","HANDSHAKE_TIMEOUT"]) {
      assert.equal(codec.decodeCaptureControl(JSON.stringify({...records[4],reasonCode})).ok,true);
      assert.equal(codec.decodeCaptureControl(JSON.stringify({...records[0],lastRetired:{captureEpoch:epoch,ackSeq:0,reasonCode}})).ok,true);
    }
    for (const change of [{token:"+".repeat(43)},{sessionId:"é".repeat(65)},{generation:""},{v:"1"}]) {
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[1],...change})),rejection());
    }
    for (const change of [{ackSeq:-1},{ackSeq:Number.MAX_SAFE_INTEGER+1},{reasonCode:null},{reasonCode:"OTHER"}]) {
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[4],...change})),rejection());
    }
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[3],reasonCode:null})),rejection());
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[0],lastRetired:{captureEpoch:epoch,ackSeq:0,reasonCode:null}})),rejection());
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[0],lastRetired:[]})),rejection());
    assert.equal(codec.decodeCaptureControl(JSON.stringify(records[0]).padEnd(4096)).ok,true);
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify(records[0]).padEnd(4097)),rejection());
  });
  it("validates ready marker against a host-computed upload name", () => {
    const basename = "frame."+epoch+".1.upload";
    const value = {v:1,basename,byteLength:15};
    assert.deepEqual(codec.decodeUploadMarker(JSON.stringify(value),basename),{ok:true,value});
    for (const change of [{v:undefined},{basename:"../"+basename},{basename:basename.replace(".1.",".01.")},
      {byteLength:0},{byteLength:1.1},{byteLength:Number.MAX_SAFE_INTEGER+1},{extra:true}]) {
      assert.deepEqual(codec.decodeUploadMarker(JSON.stringify({...value,...change}),basename),rejection());
    }
    for (const kind of ["request","activate"]) {
      const name = kind+"."+hex+".upload";
      assert.equal(codec.decodeUploadMarker(JSON.stringify({v:1,basename:name,byteLength:1}),name).ok,true);
    }
    assert.equal(codec.decodeUploadMarker(JSON.stringify(value).padEnd(4096),basename).ok,true);
    assert.deepEqual(codec.decodeUploadMarker(JSON.stringify(value),"frame."+epoch+".9007199254740992.upload"),rejection());
    assert.deepEqual(codec.decodeUploadMarker(JSON.stringify(value).padEnd(4097),basename),rejection());
  });
});


describe("companion host epoch protocol",()=>{
  it("publishes an authenticated initial offer through the owned fixed temporary file",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare("managed-A"));
    const open=(host as unknown as {startProtocol?:(binding:CaptureBinding)=>Promise<CaptureResourceResult>}).startProtocol;
    assert.equal(typeof open,"function","host must implement owned protocol publication");
    accepted(await open!.call(host,b));
    const control=codec.decodeCaptureControl(Buffer.from(await fs.read(resolve(b.directory,"control.json"),4096)));
    assert.equal(control.ok,true);if(!control.ok||control.value.kind!=="control")throw new Error("missing host control");
    assert.equal(control.value.state,"offered");assert.equal(control.value.controlRevision,1);
    assert.equal(control.value.captureEpoch,null);assert.equal(control.value.lastRetired,null);
    assert.equal(control.value.token,b.token);assert.equal(fs.entries.has(resolve(b.directory,"ack.json")),false);
    assert.equal(fs.entries.has(resolve(b.directory,"control.json.tmp")),false);
    assert.ok(fs.calls.some(c=>c.operation==="rename"&&c.path===resolve(b.directory,"control.json.tmp")));
  });
});


describe("companion protocol handshake and authority",()=>{
  it("grants ack zero before grant and publishes active last; E01 E02 E16 E17",async()=>{
    const h=await protocolHarness();await h.request();
    const c=h.json("control.json");assert.equal(c.state,"granted");assert.equal(c.grantId.length,32);
    assert.equal(h.json("ack.json").ackSeq,0);
    assert.deepEqual(h.fs.calls.filter(x=>x.operation==="rename").slice(-2).map(x=>x.path.split(/[\\/]/).pop()),["ack.json.tmp","control.json.tmp"]);
    await h.frame(1);assert.equal(h.protocol.snapshot().ackSeq,0);
    await h.activate();assert.equal(h.json("control.json").state,"active");
    await h.frame(1);assert.equal(h.json("ack.json").ackSeq,1);
  });
  it("preserves cursor and revision on duplicate request and activation after data; E03 E08",async()=>{
    const h=await protocolHarness();const request=await h.request();await h.activate();
    for(let seq=1;seq<=7;seq++)await h.frame(seq);
    const before=h.json("control.json");h.pair("request."+String(request.offerId),request);await h.protocol.poll();
    await h.activate();assert.deepEqual(h.json("control.json"),before);assert.equal(h.json("ack.json").ackSeq,7);
  });
  it("authenticates fixed envelope and current membership before native mismatch; E05 E09 E10",async()=>{
    const h=await protocolHarness();await h.active();await h.frame(1);
    const before=h.json("control.json");
    for(const extra of [{token:"x".repeat(43)},{generation:"old"},{offerId:"f".repeat(32)}]){
      const request={...h.envelope,kind:"epochRequest",offerId:before.offerId,predecessorEpoch:before.captureEpoch,
        reason:"native-reset",nativeSessionId:"22222222-2222-4222-8222-222222222222",...extra};
      h.pair("request."+request.offerId,request);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"active");
    }
    await h.request("native-reset",{nativeSessionId:"22222222-2222-4222-8222-222222222222"});
    assert.equal(h.protocol.snapshot().state,"failed");assert.equal(h.json("ack.json").ackSeq,1);
    assert.equal(h.json("ack.json").reasonCode,"IDENTITY_CHANGED");assert.equal(h.host.signal(h.binding)!.aborted,false);
  });
  it("rejects malformed authenticated current request after membership; E18",async()=>{
    const h=await protocolHarness();await h.active();await h.frame(1);
    await h.request("native-reset",{private:"forbidden"});
    assert.equal(h.protocol.snapshot().state,"retired");assert.equal(h.json("ack.json").ackSeq,1);
    assert.equal(h.json("ack.json").reasonCode,"CONTROL_REJECTED");
  });
  it("retires the old cursor before reset grant and never admits old epoch data; E04 E05",async()=>{
    const h=await protocolHarness();await h.active();for(let n=1;n<=4;n++)await h.frame(n);
    const old=h.json("control.json").captureEpoch;const published:unknown[]=[];
    h.fs.before=(op,path)=>{if(op==="rename")published.push(JSON.parse(h.fs.entries.get(path)!.data.toString()));};
    await h.request("native-reset");const c=h.json("control.json");
    assert.equal(c.state,"granted");assert.equal(c.predecessorEpoch,old);assert.notEqual(c.captureEpoch,old);
    assert.deepEqual(c.lastRetired,{captureEpoch:old,ackSeq:4,reasonCode:"CHANNEL_RETIRED"});
    assert.deepEqual((published as {kind:string;disposition?:string;state?:string}[]).map(v=>v.disposition??v.state),["retired","retired","continue","granted"]);
    await h.activate();await h.frame(1);await h.frame(6,{kind:"heartbeat",captureEpoch:old,extra:"malformed stale"});
    assert.equal(h.protocol.snapshot().state,"active");assert.equal(h.protocol.snapshot().ackSeq,1);
  });
  it("has no standby handshake timeout and permits one recovery until successful activation; E07 E11 E12",async()=>{
    const h=await protocolHarness();await h.active();for(let n=1;n<=6;n++){h.clock.advance(1000);await h.frame(n);}
    assert.equal(h.protocol.snapshot().state,"active");h.clock.advance(5000);await h.protocol.poll();
    assert.equal(h.protocol.snapshot().state,"retired");assert.equal(h.json("control.json").recoveriesRemaining,1);
    await h.request("recover");assert.equal(h.json("control.json").recoveriesRemaining,0);
    h.clock.advance(5000);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"failed");
    assert.equal(h.json("control.json").reasonCode,"HANDSHAKE_TIMEOUT");
  });
  for(const at of [4999,5000,5001])it("expires initial offer at inclusive five-second boundary "+at,async()=>{
    const h=await protocolHarness();h.clock.advance(at);await h.protocol.poll();
    assert.equal(h.protocol.snapshot().state,at<5000?"offered":"failed");assert.equal(h.fs.entries.has(resolve(h.binding.directory,"ack.json")),false);
  });
});


const protocolRow={kind:"assistantRow",scope:{kind:"main"},rowId:"row-1",blocks:[{kind:"text",index:0,text:"é 😀 \"quote\"\n"}]};
describe("companion protocol observation assembly",()=>{
  it("publishes only a complete immutable decoded observation with interleaved heartbeat",async()=>{
    const h=await protocolHarness();await h.active();const chunks=h.chunks(protocolRow,45);
    await h.frame(1,chunks[0]);assert.equal(h.protocol.snapshot().ackSeq,1);assert.equal(h.events.length,0);
    await h.frame(2);assert.equal(h.events.length,0);await h.frame(3,chunks[1]);
    assert.equal(h.protocol.snapshot().ackSeq,3);assert.equal(h.events.length,1);const event=h.events[0]!;
    assert.equal(event.kind,"observation");if(event.kind!=="observation")throw new Error("missing complete event");
    assert.deepEqual(event.observation,protocolRow);assert.ok(Object.isFrozen(event)&&Object.isFrozen(event.observation));
    assert.ok(Object.isFrozen((event.observation as codec.NormalizedObservation & {blocks:unknown[]}).blocks));
    await h.frame(3,chunks[1]);assert.equal(h.events.length,1,"stale sequence cannot readmit source");
  });
  for(const fault of ["repeated-first","new-id","wrong-total","invalid-final","wrong-bytes"])
    it("drops whole assembly and retires preceding cursor for "+fault,async()=>{
      const h=await protocolHarness();await h.active();const chunks=h.chunks(protocolRow,45);await h.frame(1,chunks[0]);
      const bad={...chunks[1]!};if(fault==="repeated-first")Object.assign(bad,chunks[0]);
      if(fault==="new-id")bad.observationId=2;if(fault==="wrong-total")bad.totalByteLength++;
      if(fault==="invalid-final")bad.data=bad.data!.slice(0,-1)+"!";
      if(fault==="wrong-bytes")bad.byteLength++;
      await h.frame(2,bad);assert.equal(h.protocol.snapshot().state,"retired");assert.equal(h.json("ack.json").ackSeq,1);
      assert.equal(h.events.filter(e=>e.kind==="observation").length,0);assert.equal(h.events.filter(e=>e.kind==="discontinuity").length,1);
    });
  for(const mode of ["known","unknown"])
    it("discards assembly at "+mode+" gap and accepts only a greater fresh observation ID",async()=>{
      const h=await protocolHarness();await h.active();const chunks=h.chunks(protocolRow,45);await h.frame(1,chunks[0]);
      const through=mode==="known"?7:2;await h.frame(2,{kind:"gap",mode,coversThrough:through,reason:"OVERFLOW"});
      assert.equal(h.protocol.snapshot().ackSeq,through);assert.equal(h.events[0]!.kind,"discontinuity");
      await h.observation(through+1,2,protocolRow);assert.equal(h.events[1]!.kind,"observation");
      await h.observation(through+2,4,protocolRow);assert.equal(h.protocol.snapshot().state,"retired");
      assert.equal(h.protocol.snapshot().ackSeq,through+1);
    });
  it("does not let heartbeat extend no-progress assembly deadline",async()=>{
    const h=await protocolHarness();await h.active();await h.frame(1,h.chunks(protocolRow,45)[0]);
    h.clock.advance(4999);await h.frame(2);assert.equal(h.protocol.snapshot().state,"active");
    h.clock.advance(1);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"retired");
    assert.equal(h.json("ack.json").reasonCode,"TRANSACTION_TIMEOUT");assert.equal(h.json("ack.json").ackSeq,2);
  });
  it("rejects seq five after ack four and ignores old six after retirement; E06",async()=>{
    const h=await protocolHarness();await h.active();for(let n=1;n<=4;n++)await h.frame(n);
    await h.frame(5,{kind:"unknown"});await h.frame(6);
    assert.equal(h.json("ack.json").ackSeq,4);assert.equal(h.json("ack.json").reasonCode,"SCHEMA_REJECTED");
    assert.equal(h.events.length,1);assert.equal(h.events[0]!.kind,"discontinuity");
  });
  it("commits cursor before callback and isolates throwing observers without duplicate source",async()=>{
    let calls=0;const h=await protocolHarness({onEvent:()=>{calls++;throw new Error("private consumer failure");}});await h.active();
    await h.observation(1,1,protocolRow);assert.equal(h.protocol.snapshot().ackSeq,1);assert.equal(h.json("ack.json").ackSeq,1);
    await h.observation(1,1,protocolRow);assert.equal(calls,1);await h.frame(2);assert.equal(h.protocol.snapshot().state,"active");
    assert.equal(h.diagnostics.some(d=>d.includes("private")),false);
  });
});


describe("companion protocol retention",()=>{
  it("enforces actual per-session boundary and exact ticket releases",async()=>{
    const h=companionHarness();const b=accepted(await h.host.prepare("managed-A"));
    const a=h.host.reserveRetention(b,8388607);assert.ok(a);assert.equal(h.host.retentionUsage("managed-A").sessionBytes,8388607);
    const last=h.host.reserveRetention(b,1);assert.ok(last);assert.equal(h.host.reserveRetention(b,1),undefined);
    h.host.releaseRetention({...a});assert.equal(h.host.reserveRetention(b,1),undefined);
    assert.equal(h.host.resizeRetention(last,2),false);h.host.releaseRetention(a);h.host.releaseRetention(a);
    assert.deepEqual(h.host.retentionUsage("managed-A"),{sessionBytes:1,globalBytes:1});
  });
  it("shares exact global budget across concurrent current session owners",async()=>{
    const h=companionHarness();const bindings=[];
    for(let n=0;n<5;n++){const sessionId="retained-"+n;h.setTarget({...fixtureTarget,sessionId});bindings.push(accepted(await h.host.prepare(sessionId)));}
    const tickets=await Promise.all(bindings.map(async b=>h.host.reserveRetention(b,8388608)));
    assert.equal(tickets.filter(Boolean).length,4);assert.equal(h.host.retentionUsage("retained-4").globalBytes,33554432);
    h.host.releaseRetention(tickets[0]!);assert.ok(h.host.reserveRetention(bindings[4]!,8388608));
  });
  it("reserves serialized plus maximum decoded bytes and releases serialized storage on commit",async()=>{
    const h=await protocolHarness();await h.active();const chunks=h.chunks(protocolRow,45);await h.frame(1,chunks[0]);
    assert.equal(h.host.retentionUsage("managed-A").sessionBytes,chunks[0]!.totalByteLength+1081344);
    await h.frame(2,chunks[1]);const usage=h.host.retentionUsage("managed-A").sessionBytes;
    assert.ok(usage>0&&usage<=1081344);const event=h.events[0]!;assert.equal(event.kind,"observation");
    if(event.kind==="observation")h.host.releaseRetention(event.retention);
    assert.equal(h.host.retentionUsage("managed-A").globalBytes,0);
  });
  it("releases abandoned serialized reservations at gap and failed final chunk",async()=>{
    const h=await protocolHarness();await h.active();await h.frame(1,h.chunks(protocolRow,45)[0]);
    await h.frame(2,{kind:"gap",mode:"unknown",coversThrough:2,reason:"SOURCE_REJECTED"});
    assert.equal(h.host.retentionUsage("managed-A").sessionBytes,0);
    await h.frame(3,{...h.chunks(protocolRow,45)[0],observationId:2});
    await h.frame(4,{...h.chunks(protocolRow,45)[1],observationId:3});
    assert.equal(h.host.retentionUsage("managed-A").sessionBytes,0);
  });
  it("requests complete-group eviction before rejecting an otherwise bounded reservation",async()=>{
    let evictions=0;
    const h=companionHarness({evictComplete:request=>{assert.equal(request.sessionId,"managed-A");evictions++;h.host.releaseRetention(held!);}});
    const b=accepted(await h.host.prepare("managed-A"));const held=h.host.reserveRetention(b,8388608);assert.ok(held);
    assert.ok(h.host.reserveRetention(b,1));assert.equal(evictions,1);assert.equal(h.host.retentionUsage("managed-A").globalBytes,1);
  });
});


describe("companion protocol complete wire fixtures",()=>{
  for(const item of fixture.wireExamples)it(item.id+" runs owned uploads through production staging and source admission",async()=>{
    const h=await protocolHarness();await h.active();
    if(item.initial?.ackSeq){await h.observation(1,1,protocolRow);h.events.length=0;}
    for(const serialized of item.frames){const raw=JSON.parse(serialized) as Record<string,unknown>;
      if(raw.token==="A".repeat(43))raw.token=h.binding.token;
      if(raw.captureEpoch==="a".repeat(32))raw.captureEpoch=h.json("control.json").captureEpoch;
      h.pair("frame."+String(raw.captureEpoch)+"."+String(raw.seq),raw);await h.protocol.poll();
    }
    if(item.clock){h.clock.advance(item.clock.noProgressMs);await h.protocol.poll();}
    const ack=h.json("ack.json");assert.equal(ack.disposition,item.expected.disposition);
    assert.equal(ack.ackSeq,item.expected.ackSeq??0);if(item.expected.reasonCode)assert.equal(ack.reasonCode,item.expected.reasonCode);
    assert.deepEqual(h.events.filter(e=>e.kind==="observation").map(e=>e.observation),item.expected.observations??[]);
    if(item.expected.lossVisible)assert.ok(h.events.some(e=>e.kind==="discontinuity"));
    if(ack.disposition==="retired")assert.equal(h.host.retentionUsage("managed-A").globalBytes,0);
  });
});

describe("companion protocol deadlines and cancellation",()=>{
  for(const at of [1999,2000,2001])it("expires an authenticated partial pair at original deadline "+at,async()=>{
    const h=await protocolHarness();await h.active();const base="frame."+h.json("control.json").captureEpoch+".1";
    h.pair(base,{...h.envelope,kind:"heartbeat",captureEpoch:h.json("control.json").captureEpoch,seq:1});
    h.fs.entries.delete(resolve(h.binding.directory,base+".ready"));await h.protocol.poll();h.clock.advance(at);await h.protocol.poll();
    assert.equal(h.protocol.snapshot().state,at<2000?"active":"retired");assert.equal(h.protocol.snapshot().ackSeq,0);
    if(at>=2000)assert.equal(h.fs.entries.has(resolve(h.binding.directory,base+".upload")),false);
  });
  it("expires unauthenticated partial files without consuming offer or refreshing health",async()=>{
    const h=await protocolHarness();await h.active();const before=h.json("control.json");const base="request."+before.offerId;
    h.fs.put(resolve(h.binding.directory,base+".upload"),"file","{unparseable");await h.protocol.poll();
    h.clock.advance(2000);await h.protocol.poll();assert.equal(h.fs.entries.has(resolve(h.binding.directory,base+".upload")),false);
    assert.deepEqual(h.json("control.json"),before);await h.frame(1);assert.equal(h.protocol.snapshot().ackSeq,1);
    h.clock.advance(4999);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"active");
    h.clock.advance(1);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"retired");
  });
  it("never reads an over-cap body or retires from its unprovable envelope",async()=>{
    const h=await protocolHarness();await h.active();const e=h.json("control.json").captureEpoch;const base="frame."+e+".1";
    h.pair(base,{...h.envelope,captureEpoch:e,seq:1,kind:"observationChunk",data:"x".repeat(262144)});
    await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"active");assert.equal(h.protocol.snapshot().ackSeq,0);
    assert.equal(h.fs.calls.some(c=>c.operation==="read"&&c.path===resolve(h.binding.directory,base+".upload")),false);
    h.clock.advance(2000);await h.protocol.poll();assert.equal(h.fs.entries.has(resolve(h.binding.directory,base+".upload")),false);
    h.clock.advance(3000);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"retired");
  });
  it("retires authenticated within-cap declared observation overflow before allocating assembly",async()=>{
    const h=await protocolHarness();await h.active();await h.frame(1,{kind:"observationChunk",observationId:1,chunkIndex:0,
      chunkCount:8192,totalByteLength:6324225,byteLength:1,data:"x"});
    assert.equal(h.json("ack.json").reasonCode,"CONTENT_REJECTED");assert.equal(h.host.retentionUsage("managed-A").globalBytes,0);
  });
  it("enforces absolute assembly deadline while chunks and heartbeats keep progressing",async()=>{
    const h=await protocolHarness();await h.active();const text=JSON.stringify(protocolRow);const count=10;
    let seq=0;
    for(let n=0;n<8;n++){if(n){h.clock.advance(4000);await h.frame(++seq);}await h.frame(++seq,{kind:"observationChunk",observationId:1,
      chunkIndex:n,chunkCount:count,totalByteLength:Buffer.byteLength(text),byteLength:1,data:text[n]});}
    h.clock.advance(1999);await h.frame(seq+1);assert.equal(h.protocol.snapshot().state,"active");
    h.clock.advance(1);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"retired");assert.equal(h.protocol.snapshot().ackSeq,16);
  });
  it("coalesces concurrent polls and cannot promote or emit after generation cancellation",async()=>{
    const h=await protocolHarness();await h.active();const e=h.json("control.json").captureEpoch;
    h.pair("frame."+e+".1",{...h.envelope,captureEpoch:e,seq:1,kind:"heartbeat"});
    let release!:()=>void;let entered!:()=>void;const gate=new Promise<void>(r=>{release=r;});const ready=new Promise<void>(r=>{entered=r;});
    h.fs.before=async(op,path)=>{if(op==="read"&&path.endsWith(".upload")){entered();await gate;}};
    const first=h.protocol.poll();await ready;assert.equal(h.protocol.poll(),first);
    h.setTarget({...fixtureTarget,generation:"replacement"});release();await first;
    assert.equal(h.protocol.snapshot().stopped,true);assert.equal(h.protocol.snapshot().ackSeq,0);
    assert.equal(h.fs.calls.some(c=>c.operation==="rename"&&c.path.endsWith(".upload")),false);
  });
  it("stops a pending metadata operation before rename and never rearms after late completion",async()=>{
    const h=await protocolHarness();let release!:()=>void;let entered!:()=>void;
    const gate=new Promise<void>(r=>{release=r;});const ready=new Promise<void>(r=>{entered=r;});
    h.fs.before=async(op,path)=>{if(op==="write"&&path.endsWith("ack.json.tmp")){entered();await gate;}};
    const pending=h.request();await ready;h.protocol.stop();release();await pending;
    assert.equal(h.fs.entries.has(resolve(h.binding.directory,"ack.json")),false);assert.equal(h.protocol.snapshot().stopped,true);
  });
  it("retains a stopped source boundary once, with no native owner revocation",async()=>{
    const h=await protocolHarness();await h.active();await h.observation(1,1,protocolRow);h.protocol.stop();h.protocol.stop();
    assert.equal(h.protocol.snapshot().state,"failed");assert.equal(h.events.filter(e=>e.kind==="discontinuity").length,1);
    assert.equal(h.host.signal(h.binding)!.aborted,false);
  });
  it("schedules one idle/busy poll and cancels the timer on stop",async()=>{
    const h=await protocolHarness({autoPoll:true});assert.deepEqual(h.clock.pendingDelays(),[250]);
    await h.request();assert.deepEqual(h.clock.pendingDelays(),[50]);h.protocol.stop();assert.deepEqual(h.clock.pendingDelays(),[]);
  });
  it("replenishes recovery only after activation and allows recovery after a reset activation failure",async()=>{
    const h=await protocolHarness();await h.active();await h.request("native-reset");h.clock.advance(5000);await h.protocol.poll();
    assert.equal(h.protocol.snapshot().state,"retired");await h.request("recover");await h.activate();
    h.clock.advance(5000);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"retired");
    assert.equal(h.json("control.json").recoveriesRemaining,1);
  });
  it("coalesces concurrent starts into one offered publication",async()=>{
    const h=companionHarness();const b=accepted(await h.host.prepare("managed-A"));
    const [a,c]=await Promise.all([h.host.startProtocol(b,{autoPoll:false}),h.host.startProtocol(b,{autoPoll:false})]);
    assert.equal(accepted(a),accepted(c));assert.equal(h.fs.calls.filter(c=>c.operation==="rename").length,1);
  });
  it("N1 expires a named queued write without executing its body",async()=>{
    const clock=new CaptureFixtureClock();const h=companionHarness({deadlineMs:25,now:clock.now,schedule:clock.schedule});
    const b=accepted(await h.host.prepare("managed-A"));h.fs.put(resolve(b.directory,"ack.json"),"file","ack");
    let release!:()=>void;let entered!:()=>void;const gate=new Promise<void>(r=>{release=r;});const ready=new Promise<void>(r=>{entered=r;});
    h.fs.before=async(op,path)=>{if(op==="read"&&path.endsWith("ack.json")){entered();await gate;}};
    const stalled=h.host.readFile(b,"ack.json",4096);await ready;
    const queued=h.host.writeMetadata(b,"control.json",Buffer.from("never written"));
    let resolved=false;void queued.then(()=>{resolved=true;});
    clock.advance(25);clock.fireDue();await new Promise<void>(r=>setImmediate(r));assert.equal(resolved,true);const expired=await queued;
    assert.deepEqual(expired,{ok:false,reason:"cleanup"});
    assert.equal(h.fs.calls.some(c=>c.operation==="write"&&c.path.endsWith("control.json.tmp")),false);
    assert.equal((await stalled).ok,false);release();await new Promise<void>(r=>setImmediate(r));
  });
});


describe("companion protocol adverse publication",()=>{
  it("does not retire current capture for an unauthenticated locked pair",async()=>{
    const h=await protocolHarness();await h.active();const c=h.json("control.json");
    const base="request."+c.offerId;h.pair(base,{...h.envelope,token:"x".repeat(43),kind:"epochRequest",offerId:c.offerId,
      predecessorEpoch:c.captureEpoch,nativeSessionId:fixtureTarget.claudeSessionId,reason:"native-reset"});
    h.fs.before=(op,path)=>{if(op==="read"&&path.endsWith(base+".upload"))throw Object.assign(new Error("locked"),{code:"EACCES"});};
    await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"active");h.fs.before=undefined;
    await h.frame(1);assert.equal(h.protocol.snapshot().ackSeq,1);assert.equal(h.events.length,0);
  });
  for(const seq of ["1",0,2])it("rejects authenticated current frame sequence/body disagreement "+seq,async()=>{
    const h=await protocolHarness();await h.active();const e=h.json("control.json").captureEpoch;
    h.pair("frame."+e+".1",{...h.envelope,captureEpoch:e,seq,kind:"heartbeat"});await h.protocol.poll();
    assert.equal(h.protocol.snapshot().state,"retired");assert.equal(h.json("ack.json").ackSeq,0);assert.equal(h.json("ack.json").reasonCode,"SCHEMA_REJECTED");
  });
  it("cannot promote a verified pair if stop occurs during final owner recheck",async()=>{
    const h=await protocolHarness();await h.active();const e=h.json("control.json").captureEpoch;
    h.pair("frame."+e+".1",{...h.envelope,captureEpoch:e,seq:1,kind:"heartbeat"});let uploads=0;
    h.fs.before=(op,path)=>{if(op==="read"&&path.endsWith(".upload"))uploads++;if(uploads===2&&op==="read"&&path.endsWith("ownership.json"))h.protocol.stop();};
    await h.protocol.poll();assert.equal(h.fs.calls.some(c=>c.operation==="rename"&&c.path.endsWith(".upload")),false);
    assert.equal(h.protocol.snapshot().ackSeq,0);
  });
  it("starts handshake at actual initial-offer visibility, not after post-publication validation",async()=>{
    const h=companionHarness();const b=accepted(await h.host.prepare("managed-A"));const clock=new CaptureFixtureClock();let visible=false;
    h.fs.before=(op,path)=>{if(op==="rename"&&path.endsWith("control.json.tmp"))visible=true;
      else if(visible&&op==="stat"){clock.advance(2000);visible=false;}};
    const protocol=accepted(await h.host.startProtocol(b,{now:clock.now,autoPoll:false}));h.fs.before=undefined;
    clock.advance(3000);await protocol.poll();assert.equal(protocol.snapshot().state,"failed");
  });
  it("retires at the previous cursor when ack publication fails after full observation decode",async()=>{
    const h=await protocolHarness();await h.active();let failed=false;
    h.fs.before=(op,path)=>{if(!failed&&op==="write"&&path.endsWith("ack.json.tmp")){failed=true;throw Object.assign(new Error("locked"),{code:"EACCES"});}};
    await h.observation(1,1,protocolRow);assert.equal(h.protocol.snapshot().state,"retired");
    assert.equal(h.json("ack.json").ackSeq,0);assert.equal(h.events.filter(e=>e.kind==="observation").length,0);
    assert.equal(h.host.retentionUsage("managed-A").globalBytes,0);assert.equal(h.host.signal(h.binding)!.aborted,false);
  });
  it("does not admit a frame completed beyond the original health deadline",async()=>{
    const h=await protocolHarness();await h.active();let advance=true;
    h.fs.before=(op,path)=>{if(advance&&op==="read"&&path.endsWith(".upload")){advance=false;h.clock.advance(5000);}};
    await h.frame(1);assert.equal(h.protocol.snapshot().state,"retired");assert.equal(h.protocol.snapshot().ackSeq,0);
  });
  it("retains the maximum safe gap cursor and retires rather than wrapping",async()=>{
    const h=await protocolHarness();await h.active();await h.frame(1,{kind:"gap",mode:"known",coversThrough:Number.MAX_SAFE_INTEGER,reason:"OVERFLOW"});
    assert.equal(h.protocol.snapshot().state,"retired");assert.equal(h.json("ack.json").ackSeq,Number.MAX_SAFE_INTEGER);
    assert.equal(h.json("ack.json").reasonCode,"CHANNEL_RETIRED");
  });
});


describe("companion protocol bounded assembly edges",()=>{
  for(const bytes of [65535,65536,65537])it("bounds actual scalar chunk bytes "+bytes,async()=>{
    const h=await protocolHarness();await h.active();await h.frame(1,{kind:"observationChunk",observationId:1,chunkIndex:0,
      chunkCount:2,totalByteLength:bytes*2,byteLength:bytes,data:"x".repeat(bytes)});
    assert.equal(h.protocol.snapshot().ackSeq,bytes<=65536?1:0);assert.equal(h.protocol.snapshot().state,bytes<=65536?"active":"retired");h.protocol.stop();
  });
  for(const total of [6324223,6324224,6324225])it("bounds declared serialized reservation "+total,async()=>{
    const h=await protocolHarness();await h.active();await h.frame(1,{kind:"observationChunk",observationId:1,chunkIndex:0,
      chunkCount:8192,totalByteLength:total,byteLength:1,data:"x"});
    assert.equal(h.protocol.snapshot().ackSeq,total<=6324224?1:0);
    assert.equal(h.host.retentionUsage("managed-A").sessionBytes,total<=6324224?total+1081344:0);h.protocol.stop();
  });
  for(const length of [13,14,15])it("validates complete normalized metadata bytes at limit offset "+(length-14),async()=>{
    const h=await protocolHarness();await h.active();const row={kind:"assistantRow",scope:{kind:"main"},rowId:"r".repeat(length),
      blocks:Array.from({length:937},(_,index)=>({kind:"unsupported",index}))};
    await h.observation(1,1,row);assert.equal(h.protocol.snapshot().ackSeq,length<=14?1:0);
    assert.equal(h.events.filter(e=>e.kind==="observation").length,length<=14?1:0);
  });
  for(const kind of ["command","output"])for(const delta of [-1,0,1])it("validates complete "+kind+" bytes at limit offset "+delta,async()=>{
    const h=await protocolHarness();await h.active();const size=(kind==="command"?1048576:262144)+delta;
    const value=kind==="command"?{kind:"callEnter",scope:{kind:"main"},toolUseId:"t",bindingValid:true,command:"x".repeat(size)}:
      {kind:"storedResult",scope:{kind:"main"},rowId:"r",index:0,toolUseId:"t",isError:false,output:[{kind:"text",text:"x".repeat(size)}]};
    const text=JSON.stringify(value);const count=Math.ceil(text.length/60000);
    for(let n=0;n<count;n++){const data=text.slice(n*60000,(n+1)*60000);await h.frame(n+1,{kind:"observationChunk",observationId:1,
      chunkIndex:n,chunkCount:count,totalByteLength:text.length,byteLength:data.length,data});}
    assert.equal(h.protocol.snapshot().ackSeq,delta<=0?count:count-1);assert.equal(h.events.filter(e=>e.kind==="observation").length,delta<=0?1:0);
    if(delta>0)assert.equal(h.json("ack.json").reasonCode,"CONTENT_REJECTED");
  });
  it("expires a previously authenticated partial even if ready appears at its deadline",async()=>{
    const h=await protocolHarness();await h.active();const e=h.json("control.json").captureEpoch;const base="frame."+e+".1";
    const body={...h.envelope,captureEpoch:e,seq:1,kind:"heartbeat"};h.pair(base,body);h.fs.entries.delete(resolve(h.binding.directory,base+".ready"));
    await h.protocol.poll();h.clock.advance(2000);h.pair(base,body);await h.protocol.poll();
    assert.equal(h.protocol.snapshot().state,"retired");assert.equal(h.protocol.snapshot().ackSeq,0);
  });
});


describe("companion protocol source retirement atomicity",()=>{
  it("invalidates source before awaiting retired metadata publication and emits only one boundary",async()=>{
    const h=await protocolHarness();await h.active();await h.observation(1,1,protocolRow);
    let release!:()=>void;let entered!:()=>void;const gate=new Promise<void>(r=>{release=r;});const ready=new Promise<void>(r=>{entered=r;});
    h.fs.before=async(op,path)=>{if(op==="write"&&path.endsWith("ack.json.tmp")){entered();await gate;}};
    const retirement=h.frame(2,{kind:"unknown"});await ready;
    assert.equal(h.events.filter(e=>e.kind==="discontinuity").length,1);assert.equal(h.protocol.snapshot().state,"retired");
    release();await retirement;assert.equal(h.events.filter(e=>e.kind==="discontinuity").length,1);
    assert.equal(h.protocol.snapshot().ackSeq,1);
  });
  it("does not consume host control or ack as producer authority; E13 E14",async()=>{
    const h=await protocolHarness();await h.active();await h.frame(1);await h.frame(2);const before=h.protocol.snapshot();
    h.fs.overwrite(resolve(h.binding.directory,"control.json"),JSON.stringify({...h.json("control.json"),controlRevision:1,captureEpoch:"f".repeat(32)}));
    h.fs.overwrite(resolve(h.binding.directory,"ack.json"),JSON.stringify({...h.json("ack.json"),captureEpoch:"f".repeat(32),ackSeq:40}));
    await h.protocol.poll();assert.deepEqual(h.protocol.snapshot(),before);await h.frame(3,{captureEpoch:before.captureEpoch,kind:"heartbeat"});
    assert.equal(h.protocol.snapshot().ackSeq,3);
  });
  it("does not reconstruct lost owner state from a directory/token; E15 B01 B03",async()=>{
    const h=await protocolHarness();await h.active();const replacement=new CompanionCapture({storageRoot:h.fs.root,fs:h.fs,currentTarget:()=>fixtureTarget});
    assert.equal((await replacement.startProtocol(h.binding,{autoPoll:false})).ok,false);
    assert.equal((await h.host.startProtocol({...h.binding},{autoPoll:false})).ok,false);
    assert.equal(h.protocol.snapshot().state,"active");
  });
  for(const bytes of [262143,262144,262145])it("bounds actual escaped outer frame bytes "+bytes,async()=>{
    const h=await protocolHarness();await h.active();const e=h.json("control.json").captureEpoch;
    const body={...h.envelope,captureEpoch:e,seq:1,kind:"observationChunk",observationId:1,chunkIndex:0,chunkCount:2,
      totalByteLength:131072,byteLength:65536,data:"x".repeat(65536)};
    const extra=bytes-Buffer.byteLength(JSON.stringify(body));const controls=Math.floor(extra/5);const quotes=extra%5;
    body.data="\u0001".repeat(controls)+"\"".repeat(quotes)+"x".repeat(65536-controls-quotes);
    assert.equal(Buffer.byteLength(JSON.stringify(body)),bytes);h.pair("frame."+e+".1",body);await h.protocol.poll();
    assert.equal(h.protocol.snapshot().ackSeq,bytes<=262144?1:0);assert.equal(h.protocol.snapshot().state,"active");h.protocol.stop();
  });
});


describe("companion protocol callback lifetime",()=>{
  it("isolates asynchronous observer rejection without replay or an unhandled rejection",async()=>{
    const failures:unknown[]=[];const rejected=(error:unknown)=>{failures.push(error);};process.on("unhandledRejection",rejected);
    try {const h=await protocolHarness({onEvent:async()=>{throw new Error("private asynchronous consumer");}});await h.active();
      await h.observation(1,1,protocolRow);await new Promise<void>(r=>setImmediate(r));
      assert.deepEqual(failures,[]);assert.equal(h.protocol.snapshot().ackSeq,1);await h.frame(2);
      assert.equal(h.protocol.snapshot().state,"active");
    }finally{process.removeListener("unhandledRejection",rejected);}
  });
  it("does not allocate retention after the eviction callback revokes its owner",async()=>{
    const h=companionHarness({evictComplete:()=>{void h.host.revoke(owner);h.host.releaseRetention(ticket!);}});
    const owner=accepted(await h.host.prepare("managed-A"));h.host.markProducerExposed(owner);
    const ticket=h.host.reserveRetention(owner,8388608);assert.ok(ticket);
    assert.equal(h.host.reserveRetention(owner,1),undefined);assert.equal(h.host.retentionUsage("managed-A").globalBytes,0);
  });
});


describe("companion protocol late transaction settlement",()=>{
  for(const outcome of ["fulfill","reject"])it("quarantines a timed-out authenticated promotion and never resumes after late "+outcome,async()=>{
    const h=await protocolHarness({}, {deadlineMs:15});await h.active();let release!:()=>void;
    const gate=new Promise<void>((resolveGate,rejectGate)=>{release=()=>outcome==="fulfill"?resolveGate():rejectGate(new Error("late private rejection"));});
    h.fs.before=async(op,path)=>{if(op==="rename"&&path.endsWith(".upload"))await gate;};
    await h.frame(1);h.clock.advance(2000);await h.protocol.poll();
    assert.equal(h.protocol.snapshot().state,"failed");assert.equal(h.protocol.snapshot().ackSeq,0);
    assert.equal(h.events.filter(e=>e.kind==="discontinuity").length,1);assert.equal(h.host.signal(h.binding)!.aborted,false);
    release();await new Promise<void>(r=>setImmediate(r));h.fs.before=undefined;accepted(await h.host.validateOwner(h.binding));
    await h.protocol.poll();assert.equal(h.protocol.snapshot().stopped,true);assert.equal(h.json("ack.json").ackSeq,0);
    assert.equal(h.events.filter(e=>e.kind==="observation").length,0);
  });
  it("retains failed unauthenticated cleanup without unbounded retry of the expired pair",async()=>{
    const h=await protocolHarness();await h.active();const base="request."+h.json("control.json").offerId;
    h.fs.put(resolve(h.binding.directory,base+".upload"),"file","{");await h.protocol.poll();let unlinks=0;
    h.fs.before=(op,path)=>{if(op==="unlink"&&path.endsWith(base+".upload")){unlinks++;throw new Error("locked");}};
    h.clock.advance(2000);await h.protocol.poll();await h.frame(1);h.clock.advance(2000);await h.protocol.poll();
    assert.equal(unlinks,1);assert.equal(h.protocol.snapshot().state,"active");assert.equal(h.fs.entries.has(resolve(h.binding.directory,base+".upload")),true);
  });
  it("finishes a maximum-ID observation before retiring its exhausted counter",async()=>{
    const h=await protocolHarness();await h.active();await h.frame(1,{kind:"gap",mode:"unknown",coversThrough:1,reason:"OVERFLOW"});
    const chunks=h.chunks(protocolRow,45);await h.frame(2,{...chunks[0],observationId:Number.MAX_SAFE_INTEGER});
    assert.equal(h.protocol.snapshot().state,"active");await h.frame(3,{...chunks[1],observationId:Number.MAX_SAFE_INTEGER});
    assert.equal(h.events.filter(e=>e.kind==="observation").length,1);assert.equal(h.protocol.snapshot().state,"retired");
  });
});


describe("companion protocol retired membership",()=>{
  it("ignores a previous grant request before checking native UUID during recovery offer",async()=>{
    const h=await protocolHarness();const old=await h.request();await h.activate();await h.frame(1,{kind:"unknown"});
    const before=h.json("control.json");assert.equal(before.state,"retired");
    h.pair("request."+String(old.offerId),{...old,nativeSessionId:"22222222-2222-4222-8222-222222222222"});await h.protocol.poll();
    assert.deepEqual(h.json("control.json"),before);await h.request("recover");assert.equal(h.protocol.snapshot().state,"granted");
  });
});


describe("companion retention callback isolation",()=>{
  it("contains a rejected eviction promise without allocating beyond capacity",async()=>{
    const failures:unknown[]=[];const rejected=(error:unknown)=>{failures.push(error);};process.on("unhandledRejection",rejected);
    try {const h=companionHarness({evictComplete:async()=>{throw new Error("private eviction error");}});const b=accepted(await h.host.prepare("managed-A"));
      assert.ok(h.host.reserveRetention(b,8388608));assert.equal(h.host.reserveRetention(b,1),undefined);
      await new Promise<void>(r=>setImmediate(r));assert.deepEqual(failures,[]);assert.equal(h.host.retentionUsage("managed-A").sessionBytes,8388608);
      assert.equal(h.diagnostics.some(d=>d.includes("private")),false);
    }finally{process.removeListener("unhandledRejection",rejected);}
  });
});


describe("companion protocol heartbeat-only health",()=>{
  for(const kind of ["chunk","gap","observation"])it("does not let admitted "+kind+" mask a missing heartbeat",async()=>{
    const h=await protocolHarness();await h.active();h.clock.advance(4000);
    if(kind==="chunk")await h.frame(1,h.chunks(protocolRow,45)[0]);
    else if(kind==="gap")await h.frame(1,{kind:"gap",mode:"unknown",coversThrough:1,reason:"OVERFLOW"});
    else await h.observation(1,1,protocolRow);
    assert.equal(h.protocol.snapshot().ackSeq,1);h.clock.advance(999);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"active");
    h.clock.advance(1);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,"retired");
    assert.equal(h.json("ack.json").ackSeq,1);assert.equal(h.json("ack.json").reasonCode,"TRANSACTION_TIMEOUT");
  });
  for(const traffic of ["activation","request","stale-heartbeat","foreign-heartbeat","old-epoch-heartbeat"])
    it("does not refresh health for duplicate or noncurrent "+traffic,async()=>{
      const h=await protocolHarness();const request=await h.request();await h.activate();await h.frame(1);h.clock.advance(4000);
      if(traffic==="activation")await h.activate();
      else if(traffic==="request"){h.pair("request."+String(request.offerId),request);await h.protocol.poll();}
      else if(traffic==="stale-heartbeat")await h.frame(1);
      else if(traffic==="foreign-heartbeat")await h.frame(2,{kind:"heartbeat",token:"x".repeat(43)});
      else await h.frame(2,{kind:"heartbeat",captureEpoch:"f".repeat(32)});
      assert.equal(h.protocol.snapshot().ackSeq,1);h.clock.advance(1000);await h.protocol.poll();
      assert.equal(h.protocol.snapshot().state,"retired");assert.equal(h.json("ack.json").ackSeq,1);
    });
  for(const delta of [-1,0,1])it("expires at five seconds since the latest admitted heartbeat plus "+delta,async()=>{
    const h=await protocolHarness();await h.active();h.clock.advance(4000);await h.frame(1);
    h.clock.advance(5000+delta);await h.protocol.poll();assert.equal(h.protocol.snapshot().state,delta<0?"active":"retired");
    assert.equal(h.protocol.snapshot().ackSeq,1);
  });
});
