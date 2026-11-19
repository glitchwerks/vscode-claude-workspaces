import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm, mkdir, realpath, writeFile } from "node:fs/promises";
import { join } from "node:path";
// These tests execute source logic with synthetic actors. They never qualify Native L.
const source=resolve("test/manual/companionNativeLifetime.smoke.cjs");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const L=existsSync(source)?require(source):{};
type Json=ReturnType<typeof JSON.parse>;
const hash=(s:string|Buffer)=>createHash("sha256").update(s).digest("hex");
/** Construct synthetic Windows fixture bytes only when the authenticated hash proves them. */
function syntheticWindowsDependency(name:string,bytes:Buffer,expectedSha:string):Buffer {
  if(hash(bytes)===expectedSha)return Buffer.from(bytes);
  // Binary/unknown files are never decoded or rewritten, even in this synthetic reader.
  assert.match(name,/(?:\.(?:json|cjs|js|ts|ps1|md)|\/COPYING\.LGPL-3)$/,"synthetic-dependency-drift");
  const text=bytes.toString("utf8");
  assert.ok(Buffer.from(text,"utf8").equals(bytes)&&!text.includes("\0")&&!text.includes("\r"),"synthetic-dependency-drift");
  const windowsBytes=Buffer.from(text.replace(/\n/g,"\r\n"),"utf8");
  assert.equal(hash(windowsBytes),expectedSha,"synthetic-dependency-drift");
  return windowsBytes;
}
const nonce="a".repeat(32);
const profile={platform:"win32",arch:"x64",node:"24.14.0",uv:"1.51.0",electron:null};
/** Independent fixture of the accepted L1 public snapshot shape. */
function inventory(count:number,present:boolean,retained=count-1,exposed=0):Json {
  const slots=Array.from({length:count},(_,slot)=>({slot,bytes:100,sha256:hash("intent"+slot),identity:hash("inode"+slot),channelLabel:hash("channel"+slot)}));
  const channels=slots.filter(s=>present||s.slot>0).map(s=>({label:s.channelLabel,identity:hash("parent"+s.slot),claimed:true,bytes:200,files:2,staging:{transactions:0,files:0,bytes:0,withinLimits:true},unknown:{files:0,bytes:0}}));
  const bytes=11264+count*2114560,files=11+count*21;
  return {format:"lifetime-inventory-v1",observation:"bounded-stable-scan/non-atomic",method:"companionCapture.ts@108f14b:590-639/no-host-transaction-reservations",
    physical:{bytes:count*100+channels.length*200,files:count+channels.length*2,directories:channels.length,withinLimits:true},
    future:{bytes,files,rootEntries:11+count,withinLimits:true,nextPrepare:{bytes:bytes+2114560,files:files+21,rootEntries:12+count,slotAvailable:count<11,withinLimits:count<11}},
    unknownRoot:{files:0,bytes:0,chargedByProduction:false},slots,channels,violations:[],bindings:{retained,exposed},
    watch:{parent:present?{state:"present",identity:hash("parent0")}:{state:"absent"},intent:{state:"present",bytes:100,sha256:hash("intent0"),identity:hash("inode0")}}};
}
/** Controlled monotonic actors; no filesystem/process/Native work occurs. */
function actors(change?:(kind:string,value:Json,state:Json)=>Json) {
  const state:Json={time:0,count:1,released:false,dead:false,releaseCalls:0,commands:[],exposed:false};
  const binding=(i:number)=>({bindingLabel:hash("channel"+i),targetLabel:hash("target"+i),generationLabel:hash("generation"+i),exposed:false});
  const io={now:()=>state.time,sleep:async(ms:number)=>{state.time+=ms;},checkpoint:async()=>{},
    command:async(host:string,kind:string,_extra:Json,budget:number)=>{
      state.time+=10;state.commands.push({host,kind,budget});let data:Json={};let outcome="ok";
      if(kind==="init") data={topology:"injected-qualification-probe-only/development",runtime:profile,rootLabel:hash("root")};
      if(kind==="prepare-primary")data=binding(0);
      if(kind==="expose-primary"){state.exposed=true;data={bindingLabel:hash("channel0"),exposed:true};}
      if(kind==="prepare-additional")data=binding(state.count++);
      if(kind==="snapshot")data=inventory(state.count,!state.dead||state.released,host==="h1"?1:state.count-1,host==="h1"&&state.exposed?1:0);
      if(kind==="refuse"){data={exposed:false};outcome="refused";}
      const reply={v:1,id:"request",phase:"settled",late:false,outcome,reason:outcome==="refused"?"cleanup-capacity":"none",data};
      return change?change(kind,reply,state):reply;
    },
    spawn:async()=>{assert.equal(state.exposed,true);},
    killH1:async()=>{state.dead=true;state.time+=10;return {observed:true,atMs:state.time,code:null,signal:"SIGTERM"};},
    release:async()=>{state.releaseCalls++;state.released=true;},
    read:async()=>{
      const value={producerAlive:true,h1Alive:!state.dead,h2Alive:true,started:{nonce,version:"2.1.322",turns:0},
        entry:{nonce,origin:"workspaces-attention",tier:"user",targetKind:"epoch-request-upload",bytes:10,sha256:hash("payload"),forwardCount:0},
        forward:state.released?{nonce,forwardCount:1}:null,returned:state.released?{nonce,dispatch:"returned",forwardCount:1,coreCalls:1}:null,
        file:state.released?{bytes:10,sha256:hash("payload")}:null,rejected:null,failed:null,unexpected:null};
      return change?change("read",value,state):value;
    }};
  return {io,state};
}
/** Manually advanced checkpoint timers; owned-stop waits use the same monotonic clock. */
function shutdownClock() {
  let time=0,sequence=0;
  const timers=new Map<number,{at:number,callback:()=>void}>();
  const clock={now:()=>time,sleep:async(ms:number)=>{time+=ms;},
    setTimeout:(callback:()=>void,ms:number)=>{const id=++sequence;timers.set(id,{at:time+ms,callback});return id;},
    clearTimeout:(id:number)=>{timers.delete(id);}};
  return {clock,timers,advance:async(ms:number)=>{
    time+=ms;for(const [id,timer] of [...timers])if(timer.at<=time){timers.delete(id);timer.callback();}
    for(let i=0;i<8;i++)await Promise.resolve();
  }};
}
/** Retained fake handles record request order separately from actual synthetic witnesses. */
function shutdownHandles(witness=true) {
  const actions:string[]=[];
  const owned:Json={producerExited:false,h1:{exited:false,closed:false},h2:{exited:false,closed:false},pty:null};
  owned.pty={terminate:async()=>{actions.push("P");if(witness)owned.producerExited=true;}};
  for(const name of ["h1","h2"])owned[name].child={kill:()=>{actions.push(name);if(witness){owned[name].exited=true;owned[name].closed=true;}return true;}};
  return {owned,actions};
}
describe("synthetic Trial L controller",()=>{
  it("accepts only inert modes or exact explicit live arguments",()=>{
    assert.equal(typeof L.parseArguments,"function","missing closed L entry point");
    assert.deepEqual(L.parseArguments([]),{mode:"plan"});
    assert.deepEqual(L.parseArguments(["--plan"]),{mode:"plan"});
    assert.deepEqual(L.parseArguments(["--self-test"]),{mode:"self-test"});
    assert.deepEqual(L.parseArguments(["--run-live","--config",resolve("private.json")]),{mode:"live",config:resolve("private.json")});
    for(const args of [["--run-live"],["--plan","--run-live"],["--run-live","--config","relative"],["--run-diagnostic"],["--self-test","--force"]]) assert.equal(L.parseArguments(args),undefined);
  });
  it("preserves the exact shell preference but refuses authentication/provider overrides",()=>{
    assert.equal(typeof L.liveEnvironment,"function");
    assert.equal(L.liveEnvironment({CLAUDE_CODE_USE_POWERSHELL_TOOL:"1"}).CLAUDE_CODE_USE_POWERSHELL_TOOL,"1");
    assert.equal(L.liveEnvironment({}).DISABLE_AUTOUPDATER,"1");
    for(const key of ["ANTHROPIC_API_KEY","ANTHROPIC_AUTH_TOKEN","ANTHROPIC_BASE_URL","CLAUDE_CODE_OAUTH_TOKEN","CLAUDE_CONFIG_DIR","CLAUDE_CODE_USE_BEDROCK"]) assert.throws(()=>L.liveEnvironment({[key]:"private"}),/auth-unverified/);
  });
  it("validates real snapshot accounting independently and rejects nested private data",()=>{
    assert.equal(typeof L.validInventory,"function","missing closed inventory validator");
    const good=inventory(11,false); assert.equal(L.validInventory(good),true);
    for(const mutate of [(v:Json)=>v.future.files--,(v:Json)=>v.physical.bytes++,
      (v:Json)=>v.channels[0].staging.transactions=9,(v:Json)=>v.slots[0].token="private",
      (v:Json)=>v.future.nextPrepare.withinLimits=true,(v:Json)=>v.watch.intent.path="private",
      (v:Json)=>v.bindings.retained=12,(v:Json)=>v.unknownRoot.chargedByProduction=true]){
      const bad=structuredClone(good);mutate(bad);assert.equal(L.validInventory(bad),false);
    }
  });
  it("executes the complete synthetic schedule with ten bindings, two real refusal calls and one release",async()=>{
    assert.equal(typeof L.observeLifetime,"function","missing ordered L observer");
    const {io,state}=actors();const result=await L.observeLifetime(io,{nonce,profile});
    assert.equal(result.status,"observed"); assert.equal(result.synthetic,true);assert.equal(result.nativeExecuted,false);
    assert.equal(L.validateObservation(result),true);assert.equal(L.validateActualNativeL(result),false);
    assert.equal(state.releaseCalls,1);assert.equal(state.commands.filter((v:Json)=>v.kind==="prepare-additional").length,10);
    assert.equal(state.commands.filter((v:Json)=>v.kind==="refuse").length,2);
    assert.ok(state.commands.every((v:Json)=>v.budget<=2000));
    assert.equal(JSON.stringify(result).includes("CLAUDE_WORKSPACES"),false);
    const forged=structuredClone(result);forged.events[0].private="secret";assert.equal(L.validateObservation(forged),false);
  });
  for(const fault of ["wrong-nonce","wrong-origin","wrong-kind","wrong-hash","missing-b1","early-file","forward","producer-loss","abandoned","late","unknown","bad-shape","parent-retained","intent-changed","intent-missing","duplicate-binding","overflow","staging","exposed","admitted","deadline"]){
    it("fails closed without release for "+fault,async()=>{
      assert.equal(typeof L.observeLifetime,"function");
      const {io,state}=actors((kind,value,s)=>{
        if(kind==="read"){
          if(fault==="wrong-nonce")value.entry.nonce="b".repeat(32);
          if(fault==="wrong-origin")value.entry.origin="other";
          if(fault==="wrong-kind")value.entry.targetKind="other";
          if(fault==="wrong-hash")value.entry.sha256="invalid";
          if(fault==="missing-b1")value.entry=null;
          if(fault==="early-file")value.file={bytes:10,sha256:hash("payload")};
          if(fault==="forward")value.forward={nonce,forwardCount:1};
          if(fault==="producer-loss")value.producerAlive=false;
          if(fault==="abandoned")value.failed={nonce,reason:"abandoned"};
        }
        if(kind==="sweep"){
          if(fault==="late")value.late=true;
          if(fault==="unknown"){value.phase="deadline";value.outcome="unknown";}
          if(fault==="bad-shape")value.data.token="secret";
          if(fault==="deadline")s.time+=6001;
        }
        if(kind==="snapshot"&&s.dead){
          if(fault==="parent-retained")value.data=inventory(s.count,true);
          if(fault==="intent-changed")value.data.watch.intent.sha256=hash("changed");
          if(fault==="intent-missing")value.data.watch.intent={state:"absent"};
          if(fault==="overflow")value.data.future.files=257;
          if(fault==="staging"&&value.data.channels.length)value.data.channels[0].staging.files=17;
        }
        if(kind==="prepare-additional"&&fault==="duplicate-binding")value.data.bindingLabel=hash("channel0");
        if(kind==="prepare-additional"&&fault==="exposed")value.data.exposed=true;
        if(kind==="refuse"&&fault==="admitted"){value.outcome="unexpected-admission";value.reason="none";value.data={bindingLabel:hash("extra"),targetLabel:hash("extra-target"),generationLabel:hash("extra-generation"),exposed:false};}
        return value;
      });
      const result=await L.observeLifetime(io,{nonce,profile});
      assert.equal(result.status,"unestablished");assert.equal(state.releaseCalls,0);assert.equal(L.validateObservation(result),false);
    });
  }
  it("keeps a timed-out command unknown when its late settlement arrives",async()=>{
    assert.equal(typeof L.createHostClient,"function","missing bounded correlated host client");
    const child:Json=new EventEmitter();let sent:Json;
    child.send=(m:Json,done:()=>void)=>{sent=m;done();};
    const client=L.createHostClient(child,()=>0);
    await assert.rejects(client.command("sweep",{},5),/ipc-uncertain/);
    child.emit("message",{v:1,id:sent.id,phase:"settled",late:false,outcome:"ok",reason:"none",data:{}});
    assert.equal(client.uncertain,true);
    assert.deepEqual(client.evidence.map((e:Json)=>e.phase),["deadline","settled"]);
    assert.equal(client.evidence[1].late,true);
    await assert.rejects(client.command("sweep",{},2000),/ipc-uncertain/);
    child.emit("close",0,null);
  });
  it("separates exact private primary launch material from host evidence",async()=>{
    assert.equal(typeof L.createHostClient,"function");
    const child:Json=new EventEmitter();let secret:Json;
    const transient={environment:{CLAUDE_WORKSPACES_CAPTURE_DIR:"secret"},target:"secret",targetIdentity:{},watch:{}};
    child.send=(m:Json,done:()=>void)=>{done();queueMicrotask(()=>child.emit("message",{v:1,id:m.id,phase:"settled",late:false,outcome:"ok",reason:"none",data:{bindingLabel:hash("b"),targetLabel:hash("t"),generationLabel:hash("g"),exposed:false},transient}));};
    const client=L.createHostClient(child,()=>0,(v:Json)=>{secret=v;});
    const reply=await client.command("prepare-primary",{},2000);
    assert.deepEqual(secret,transient);assert.equal(Object.hasOwn(reply,"transient"),false);
    assert.equal(JSON.stringify(client.evidence).includes("secret"),false);
    child.emit("close",0,null);
  });
  it("refuses unknown reply keys and lost owned IPC without copying secret text",async()=>{
    assert.equal(typeof L.createHostClient,"function");
    const child:Json=new EventEmitter();
    child.send=(m:Json,done:()=>void)=>{done();queueMicrotask(()=>child.emit("message",{v:1,id:m.id,phase:"settled",late:false,outcome:"ok",reason:"none",data:{token:"secret"}}));};
    const client=L.createHostClient(child,()=>0);
    await assert.rejects(client.command("sweep",{},2000),/ipc-uncertain/);
    assert.equal(JSON.stringify(client.evidence).includes("secret"),false);
    child.emit("close",0,null);
  });
  it("rejects source/profile/F/dependency/pin drift before live actors can be constructed",async()=>{
    assert.equal(typeof L.verifyPrerequisites,"function","missing prerequisite gate");
    const c={nativeExecutable:"C:/native.exe",nativeSha256:"345996b4bdbae21d817f750fae2f34cbf8d81224a5444c78136091d121beb298",declarationPath:"C:/sdk.d.ts",declarationSha256:"bfbbc814e3c033d7d9942f58a73cd57cbc5fa1edba0a664653ff4103ad4201bc",nativeVersion:"2.1.322",sourceSha:"a".repeat(40),ownedParent:"C:/repo/.tmp/new",hostProfile:profile};
    const facts={profile,head:c.sourceSha,clean:true,parentFresh:true,pins:{native:c.nativeSha256,declaration:c.declarationSha256,node:"63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088"}};
    // This profile is synthetic Windows data, including an in-memory LF checkout view.
    // No working file changes and neither view is actual Native qualification.
    const fs=await import("node:fs/promises");
    const envelope=await fs.readFile(resolve("test/fixtures/companion/native-qualification/native-f-108f14b.receipt.json"));
    // Authenticate the original receipt before consulting its per-file historical hashes.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const support=require(resolve("test/manual/companionNativeLifetimeSupport.cjs"));
    const historical=support.parseFPrerequisite(envelope);
    const expected=new Map<string,string>(historical.receipt.sources.map((s:Json)=>[s.path,s.sha256]));
    const syntheticReader=(readBytes:(name:string)=>Promise<Buffer>)=>async(name:string)=>{
      const sha=expected.get(name);assert.ok(sha,"unknown synthetic dependency");
      return syntheticWindowsDependency(name,await readBytes(name),sha);
    };
    const io={facts:async()=>facts,envelope:async()=>envelope,readDependency:syntheticReader(name=>fs.readFile(resolve(name)))};
    const result=await L.verifyPrerequisites(c,io);assert.equal(result.dependencies.count,24);
    const lfCheckout=async(name:string)=>{
      const bytes=await fs.readFile(resolve(name));
      return name.endsWith(".exe")?bytes:Buffer.from(bytes.toString("utf8").replace(/\r\n/g,"\n"));
    };
    assert.equal((await L.verifyPrerequisites(c,{...io,readDependency:syntheticReader(lfCheckout)})).dependencies.count,24,
      "the positive synthetic Windows fixture must work from an LF checkout view");
    // The actual runtime byte verifier still refuses raw LF, with no reconstruction seam.
    const rawLf=await support.verifyFDependencies(envelope,lfCheckout);
    assert.equal(rawLf.ok,false);assert.equal(rawLf.reason,"dependency-drift");
    await assert.rejects(L.verifyPrerequisites(c,{...io,readDependency:lfCheckout}),/identity-mismatch/);
    for(const entry of historical.receipt.sources) {
      const bytes=await lfCheckout(entry.path),constructed=syntheticWindowsDependency(entry.path,bytes,entry.sha256);
      assert.equal(hash(constructed),entry.sha256,"every positive fixture byte sequence is authenticated");
      if(entry.path.endsWith(".exe"))assert.deepEqual(constructed,bytes,"binary fixture bytes stay untouched");
    }
    const textName="media/attention/hooks/register.js",textBytes=await lfCheckout(textName),textSha=expected.get(textName)!;
    assert.throws(()=>syntheticWindowsDependency(textName,Buffer.concat([textBytes,Buffer.from("\n// semantic drift\n")]),textSha),/synthetic-dependency-drift/);
    assert.throws(()=>syntheticWindowsDependency(textName,Buffer.concat([textBytes,Buffer.from([255])]),textSha),/synthetic-dependency-drift/);
    const binaryName="media/attention/snoretoast/SnoreToast.exe",binaryBytes=Buffer.from(await lfCheckout(binaryName));
    binaryBytes[0]=binaryBytes.readUInt8(0)^255;
    assert.throws(()=>syntheticWindowsDependency(binaryName,binaryBytes,expected.get(binaryName)!),/synthetic-dependency-drift/);
    const reordered={...c,hostProfile:{electron:null,uv:profile.uv,node:profile.node,arch:profile.arch,platform:profile.platform}};
    assert.equal((await L.verifyPrerequisites(reordered,io)).dependencies.count,24);
    for(const delta of [{head:"b".repeat(40)},{clean:false},{parentFresh:false},{profile:{...profile,node:"20.0.0"}},{pins:{...facts.pins,native:hash("bad")}}])
      await assert.rejects(L.verifyPrerequisites(c,{...io,facts:async()=>({...facts,...delta})}));
    await assert.rejects(L.verifyPrerequisites({...c,healthy:true},io));
    await assert.rejects(L.verifyPrerequisites(c,{...io,envelope:async()=>Buffer.from('{"pass":true}')}));
    await assert.rejects(L.verifyPrerequisites(c,{...io,readDependency:async()=>Buffer.from("changed")}));
  });
  it("rejects a missing owned exit witness and a final Native rejection or hash change",async()=>{
    const first=actors();first.io.killH1=async()=>({observed:false,atMs:0,code:null,signal:"SIGTERM"});
    const missing=await L.observeLifetime(first.io,{nonce,profile});assert.equal(missing.status,"unestablished");assert.equal(first.state.releaseCalls,0);
    for(const fault of ["rejection","hash","return","h2","duplicate"]){
      const {io}=actors((kind,v,s)=>{
        if(kind==="read"&&s.released){
          if(fault==="rejection")v.rejected={nonce,dispatch:"rejected",forwardCount:1};
          if(fault==="hash")v.file.sha256=hash("bad");
          if(fault==="return")v.returned=null;
          if(fault==="h2")v.h2Alive=false;
          if(fault==="duplicate")v.forward.forwardCount=2;
        }return v;
      });
      const r=await L.observeLifetime(io,{nonce,profile});assert.equal(r.status,"unestablished");assert.equal(L.validateObservation(r),false);
    }
  });
  it("builds the accepted host/adapter and unchanged control generator without executing them",async function(){
    this.timeout(15000);
    assert.equal(typeof L.buildOwnedSources,"function","missing owned source composition");
    const directory=await realpath(await mkdtemp(resolve(".tmp/lifetime-controller-synthetic-")));
    try {
      const sources=[{path:"media/attention/hooks/register.js",sha256:hash(await readFile(resolve("media/attention/hooks/register.js"),"utf8"))}];
      const built=await L.buildOwnedSources(directory,sources);
      for(const key of ["hostSha256","adapterSha256"])assert.match(built.generated[key],/^[a-f0-9]{64}$/);
      assert.match(await readFile(built.host,"utf8"),/owned-ipc-host-required/);
      assert.deepEqual(await readFile(join(built.product,"hooks/register.js")),await readFile(resolve("media/attention/hooks/register.js")));
      const control=await L.writeControl(directory,{target:join(directory,"request.abc.upload")},nonce);
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const F=require(resolve("test/manual/companionNativeRendezvous.smoke.cjs"));
      assert.equal(await readFile(join(control.plugin,"hooks/control.js"),"utf8"),F.createControlPluginSource({target:join(directory,"request.abc.upload"),control:control.control.replace(/\\/g,"/"),nonce}));
      assert.equal(control.generated.pluginSha256,hash(await readFile(join(control.plugin,"hooks/control.js"),"utf8")));
    }finally {await rm(directory,{recursive:true,force:true});}
  });
  it("reads stable bounded single-link bytes and rejects unsafe/oversized inputs",async()=>{
    assert.equal(typeof L.readStableBytes,"function","missing stable bounded source reader");
    const directory=await realpath(await mkdtemp(resolve(".tmp/lifetime-controller-reader-")));
    try{
      const file=join(directory,"data");await writeFile(file,"small");
      assert.equal((await L.readStableBytes(file,5)).toString(),"small");
      assert.equal(await L.hashStableFile(file),hash("small"));
      await assert.rejects(L.readStableBytes(file,4));await assert.rejects(L.readStableBytes(directory,10));
      await mkdir(join(directory,"child"));
    }finally{await rm(directory,{recursive:true,force:true});}
  });
  it("tears down P before surviving hosts and requires real exit/close observations",async()=>{
    assert.equal(typeof L.stopLifetime,"function","missing owned lifetime teardown");
    const actions:string[]=[];let time=0;
    const owned:Json={producerExited:false,h1:{exited:true,closed:true},h2:{exited:false,closed:false},pty:{terminate:async()=>{actions.push("P");owned.producerExited=true;}},teardown:false};
    owned.h2.child={kill:()=>{actions.push("H2");owned.h2.exited=true;owned.h2.closed=true;return true;}};
    const clock={now:()=>time,sleep:async(ms:number)=>{time+=ms;}};
    assert.equal(await L.stopLifetime(owned,1000,clock),true);assert.deepEqual(actions,["P","H2"]);
    const unresolved:Json={producerExited:false,h1:null,h2:null,pty:{terminate:async()=>{}},teardown:false};
    assert.equal(await L.stopLifetime(unresolved,1000,clock),false);
  });
  it("keeps default/plan/self-test inert and rejects forged actual receipt claims",async()=>{
    assert.equal(typeof L.main,"function","missing inert executable entry point");
    assert.equal(await L.main(["--unknown"]),2);
    const result=await L.selfTest();assert.equal(result.synthetic,true);assert.equal(result.nativeExecuted,false);
    const observation=await L.observeLifetime(actors().io,{nonce,profile});
    assert.equal(L.validateActualNativeL({observation,healthy:true,actualNativeL:true}),false);
  });
  it("validates the private launch tuple against the actual bound labels and owned root",()=>{
    assert.equal(typeof L.validatePrimary,"function","missing private launch validation");
    const capture=resolve(".tmp/capture"),channel="companion-"+"a".repeat(32),directory=join(capture,channel);
    const targetIdentity={sessionId:"11111111-1111-4111-8111-111111111111",claudeSessionId:"22222222-2222-4222-8222-222222222222",generation:"33333333-3333-4333-8333-333333333333"};
    const environment={CLAUDE_WORKSPACES_CAPTURE_DIR:directory,CLAUDE_WORKSPACES_CAPTURE_TOKEN:"a".repeat(43),CLAUDE_WORKSPACES_CAPTURE_SESSION_ID:targetIdentity.sessionId,CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID:targetIdentity.claudeSessionId,CLAUDE_WORKSPACES_CAPTURE_GENERATION:targetIdentity.generation};
    const value={environment,target:directory+"/request."+"b".repeat(32)+".upload",targetIdentity,watch:{channel,slot:0}};
    const binding={bindingLabel:hash(channel),targetLabel:hash(JSON.stringify(Object.values(targetIdentity))),generationLabel:hash(targetIdentity.generation),exposed:false};
    assert.equal(L.validatePrimary(value,binding,capture),true);
    for(const mutate of [(v:Json)=>v.environment.EXTRA="secret",(v:Json)=>v.watch.channel="../escape",(v:Json)=>v.target=resolve("outside.upload"),(v:Json)=>v.targetIdentity.generation=targetIdentity.sessionId]) {
      const bad=structuredClone(value);mutate(bad);assert.equal(L.validatePrimary(bad,binding,capture),false);
    }
  });
  it("keeps informational receipt validation separate from actual Native execution",async()=>{
    assert.equal(typeof L.validateReceiptEvidence,"function","missing closed L receipt validator");
    const observation=await L.observeLifetime(actors().io,{nonce,profile});
    const pins={native:"345996b4bdbae21d817f750fae2f34cbf8d81224a5444c78136091d121beb298",declaration:"bfbbc814e3c033d7d9942f58a73cd57cbc5fa1edba0a664653ff4103ad4201bc",node:"63c259c81e5d472b5f11c8d506070130cb04a1ecf84b80377a34ed6ec9048088"};
    const envelope=JSON.parse(await readFile(resolve("test/fixtures/companion/native-qualification/native-f-108f14b.receipt.json"),"utf8"));
    const historical=JSON.parse(Buffer.from(envelope.rawBase64,"base64").toString());
    const dependencies=historical.sources.map((s:Json)=>({label:hash(s.path),sha256:s.sha256}));
    const sources=[...dependencies,...["test/manual/companionNativeLifetime.smoke.cjs","test/manual/companionNativeLifetimeSupport.cjs","test/fixtures/companion/native-qualification/native-f-108f14b.receipt.json"].map(name=>({label:hash(name),sha256:hash("synthetic-current-source")}))];
    const transcript=(host:string)=>observation.events.filter((e:Json)=>e.data?.host===host).map((e:Json,index:number)=>({id:"l-"+(index+1),kind:e.data.kind,phase:"settled",late:false,outcome:e.data.outcome,reason:e.data.reason,atMs:e.atMs,binding:null}));
    const finalAt=observation.events.at(-1).atMs;
    const receipt={format:"native-trial-l-v2",synthetic:true,nativeExecuted:false,status:"observed",reason:"none",sourceSha:"a".repeat(40),sourceFingerprint:hash("index"),before:pins,after:pins,runtime:profile,
      prerequisite:{rawSha256:"787a6d007ade1fa389eb6daef12bc21bbd310563fe5d181283a48d1266c0f7dc",rawBytes:9372,dependencyCount:24,method:"exact-working-bytes/no-normalization",dependencies},sources,
      generated:Object.fromEntries(["hostSha256","adapterSha256","pluginSha256","manifestSha256","hooksSha256"].map(k=>[k,hash(k)])),authentication:"claude.ai",version:"2.1.322",observation,
      inspections:["version","auth","version","auth"].map(kind=>({kind,close:"observed",termination:"not-requested",reason:"none",exit:"zero"})),ipc:{h1:transcript("h1"),h2:transcript("h2")},
      lifecycle:{producer:{observed:true,atMs:finalAt+10,code:0,signal:null},h1:observation.events.find((e:Json)=>e.stage==="h1-exit").data,h2:{observed:true,atMs:finalAt+20,code:0,signal:null},hostCloses:true,teardown:"owned-exits-observed",finalRead:{bytes:10,sha256:hash("payload")}},
      cleanup:"storage-and-intents-preserved",evidenceLevel:"sdk-dispatch-pending/pre-next",topology:"injected-qualification-probe-only/development",productionAdmission:false,qualificationGates:"all-63-pending",otherLifetimes:"E/installed-unestablished"};
    // Complete synthetic source evidence remains explicitly ineligible for Native qualification.
    assert.equal(L.validateReceiptEvidence(receipt),true);assert.equal(L.validateActualNativeL(receipt),false);
    for(const mutate of [(v:Json)=>v.private="secret",(v:Json)=>v.ipc.h2.pop(),(v:Json)=>v.ipc.h2[0].late=true,
      (v:Json)=>v.lifecycle.h1.observed=false,(v:Json)=>v.lifecycle.producer.atMs=0,(v:Json)=>v.lifecycle.hostCloses=false,
      (v:Json)=>v.lifecycle.finalRead.sha256=hash("wrong"),(v:Json)=>v.prerequisite.dependencies[0].sha256=hash("wrong"),
      (v:Json)=>v.inspections[0].close="unobserved",(v:Json)=>v.generated.secret="private",
      (v:Json)=>v.sourceSha="x".repeat(1048577),
      (v:Json)=>v.observation.events[1].atMs=0,(v:Json)=>v.observation.events.find((e:Json)=>e.stage==="release").data.count=2]) {
      const bad=structuredClone(receipt);mutate(bad);assert.equal(L.validateReceiptEvidence(bad),false);
    }
  });
  it("exports an actual live entry point but rejects bad config before any actor",async()=>{
    assert.equal(typeof L.runLive,"function","missing opt-in live orchestration");
    await assert.rejects(L.runLive({healthy:true}));
  });
  it("preserves a common controller time origin across observation and owned exits",async()=>{
    const {io,state}=actors();state.time=200;
    const result=await L.observeLifetime(io,{nonce,profile});
    assert.equal(result.status,"observed");assert.ok(result.events[0].atMs>=200);
    assert.equal(L.validateObservation(result),true);
  });
  it("awaits an exited host close without sending another kill",async()=>{
    let time=0,kills=0;
    const owned:Json={producerExited:true,pty:null,h1:{exited:true,closed:false,child:{kill:()=>{kills++;return false;}}},h2:null};
    const okay=await L.stopLifetime(owned,1000,{now:()=>time,sleep:async(ms:number)=>{time+=ms;owned.h1.closed=true;}});
    assert.equal(okay,true);assert.equal(kills,0);
  });
  it("bounds discarded output and rejects startup interaction without answering it",()=>{
    assert.equal(typeof L.createOutputGuard,"function","missing bounded output guard");
    const errors:string[]=[];const guard=L.createOutputGuard((reason:string)=>errors.push(reason));
    guard("trust this ",true);guard("folder",true);assert.deepEqual(errors,["startup-interaction"]);
    guard("x".repeat(65537),false);assert.equal(errors.at(-1),"output-limit");
  });
  it("requires unchanged final raw markers as well as the upload after teardown",async()=>{
    assert.equal(typeof L.validateReadBack,"function","missing final raw read-back gate");
    const {io,state}=actors();state.released=true;state.dead=true;
    const expected=await io.read();
    assert.equal(L.validateReadBack(expected,{...expected,producerAlive:false,h2Alive:false}),true);
    for(const mutate of [(v:Json)=>v.forward.forwardCount=2,(v:Json)=>v.returned=null,(v:Json)=>v.entry.sha256=hash("bad"),(v:Json)=>v.started.turns=1,(v:Json)=>v.file=null,(v:Json)=>v.failed={reason:"abandoned"}]){
      const bad=structuredClone(expected);mutate(bad);assert.equal(L.validateReadBack(expected,bad),false);
    }
  });
  it("keeps a valid event interval when the monotonic millisecond ticks during emission",async()=>{
    let samples=0,commands=0,replySeen=false;
    const {io}=actors();
    io.now=()=>replySeen&&++samples>=6?1:0;
    io.command=async()=>{
      if(++commands>1)throw new Error("io-failed");
      replySeen=true;
      return {v:1,id:"first",phase:"settled",late:false,outcome:"ok",reason:"none",data:{topology:"injected-qualification-probe-only/development",runtime:profile,rootLabel:hash("root")}};
    };
    const result=await L.observeLifetime(io,{nonce,profile});
    assert.equal(result.events.length,1);
    const first=result.events[0];
    assert.equal(first.stage,"init-h1");
    assert.equal(first.atMs-first.durationMs,0,"the first command began at controller time zero");
    assert.ok(first.atMs>=first.durationMs,"a monotonic clock cannot imply a negative start");
  });
  it("stops retained owned handles P-first even when a checkpoint never settles",async()=>{
    assert.equal(typeof L.createCheckpointGuard,"function","missing persistence deadline guard");
    assert.equal(typeof L.checkpointThenStop,"function","missing bounded checkpoint/owned-stop composition");
    const {clock,advance,timers}=shutdownClock(),{owned,actions}=shutdownHandles();
    const failures:string[]=[];let writes=0;
    const persistence=L.createCheckpointGuard(()=>{writes++;return new Promise(()=>{});},(reason:string)=>failures.push(reason),clock);
    const stopping=L.checkpointThenStop(owned,persistence,10000,clock);
    await Promise.resolve();assert.equal(writes,1);assert.deepEqual(actions,[]);
    await advance(1000);
    assert.equal(await stopping,true,"actual synthetic exits/closes were observed after the stop request");
    assert.deepEqual(actions,["P","h1","h2"]);assert.deepEqual(failures,["checkpoint-failed"]);
    assert.equal(persistence.uncertain,true);assert.equal(persistence.records[0].state,"deadline");
    assert.ok(persistence.records[0].promise instanceof Promise,"retain the original unresolved write");
    assert.ok(owned.shutdownPromise instanceof Promise);assert.equal(timers.size,0);
    await assert.rejects(persistence.checkpoint(1000),/checkpoint-failed/);assert.equal(writes,1,"never queue another write behind an unresolved one");
  });
  it("retains late checkpoint settlement without restoring persistence certainty",async()=>{
    assert.equal(typeof L.createCheckpointGuard,"function");
    const {clock,advance}=shutdownClock(),failures:string[]=[];
    let finish:()=>void=()=>{throw new Error("write did not start");};
    const persistence=L.createCheckpointGuard(()=>new Promise<void>(resolve=>{finish=resolve;}),(reason:string)=>failures.push(reason),clock);
    const pending=assert.rejects(persistence.checkpoint(1000),/checkpoint-failed/);
    await advance(1000);await pending;finish();await advance(0);
    assert.equal(persistence.records[0].state,"late-settled");assert.equal(persistence.uncertain,true);
    assert.deepEqual(failures,["checkpoint-failed"]);
    await assert.rejects(persistence.checkpoint(1000),/checkpoint-failed/);
  });
  it("does not let a reserve checkpoint queue behind an existing stalled write",async()=>{
    assert.equal(typeof L.createCheckpointGuard,"function");
    const {clock,advance}=shutdownClock(),{owned,actions}=shutdownHandles();let writes=0;
    const persistence=L.createCheckpointGuard(()=>{writes++;return new Promise(()=>{});},()=>{},clock);
    const pending=assert.rejects(persistence.checkpoint(1000),/checkpoint-failed/);
    await Promise.resolve();const stopping=L.checkpointThenStop(owned,persistence,10000,clock);
    await advance(0);assert.equal(await stopping,true);await advance(1000);await pending;
    assert.equal(writes,1);assert.deepEqual(actions,["P","h1","h2"]);assert.equal(persistence.uncertain,true);
  });
  it("makes an immediate unqualified P-first hard stop with zero remaining wait",async()=>{
    const {clock,timers}=shutdownClock(),{owned,actions}=shutdownHandles(false);
    const stopping=L.stopLifetime(owned,0,clock);
    assert.deepEqual(actions,["P","h1","h2"],"all owned requests precede controller exit");
    assert.equal(await stopping,false,"requests alone are never exit/close evidence");
    assert.equal(clock.now(),0);assert.equal(timers.size,0);assert.ok(owned.producerTermination.promise instanceof Promise);
    assert.equal(await L.stopLifetime(owned,0,clock),false);assert.deepEqual(actions,["P","h1","h2"],"retain one request per handle");
  });
  it("retains an in-flight stop when the hard fallback requests surviving hosts",async()=>{
    const {clock}=shutdownClock(),{owned,actions}=shutdownHandles(false);
    owned.pty.terminate=()=>{actions.push("P");return new Promise(()=>{});};
    const normal=L.stopLifetime(owned,8000,clock),retained=owned.stopPromise,before=clock.now();
    assert.equal(await L.stopLifetime(owned,0,clock),false);
    assert.equal(owned.stopPromise,retained);assert.ok(owned.producerTermination.promise instanceof Promise);
    assert.deepEqual(actions,["P","h1","h2"]);assert.ok(clock.now()>=before);
    assert.equal(await normal,false);assert.equal(owned.producerTermination.settled,false);
    assert.deepEqual(actions,["P","h1","h2"]);
  });
  it("records timely failed and late failed checkpoints without exposing writer errors",async()=>{
    const {clock,advance}=shutdownClock();const failures:string[]=[];
    const failed=L.createCheckpointGuard(()=>Promise.reject(new Error("private path/token")),(r:string)=>failures.push(r),clock);
    await assert.rejects(failed.checkpoint(),/checkpoint-failed/);assert.equal(failed.records[0].state,"failed");
    assert.equal(JSON.stringify(failed.records).includes("private"),false);
    let rejectWrite:(reason:Error)=>void=()=>{throw new Error("write did not start");};
    const late=L.createCheckpointGuard(()=>new Promise((_resolve,reject)=>{rejectWrite=reject;}),(r:string)=>failures.push(r),clock);
    const waiting=assert.rejects(late.checkpoint(),/checkpoint-failed/);await advance(1000);await waiting;
    rejectWrite(new Error("private path/token"));await advance(0);
    assert.equal(late.records[0].state,"late-failed");assert.equal(late.uncertain,true);
    assert.deepEqual(failures,["checkpoint-failed","checkpoint-failed"]);
  });
  it("retains certain persistence and observed exits on the ordinary shutdown path",async()=>{
    const {clock}=shutdownClock(),{owned,actions}=shutdownHandles();let writes=0;
    const persistence=L.createCheckpointGuard(async()=>{writes++;},()=>assert.fail("unexpected checkpoint failure"),clock);
    assert.equal(await L.checkpointThenStop(owned,persistence,10000,clock),true);
    assert.equal(writes,1);assert.equal(persistence.uncertain,false);assert.equal(persistence.records[0].state,"settled");
    assert.deepEqual(actions,["P","h1","h2"]);assert.equal(owned.shutdownRequested,true);
  });
});

/** Mutate one owned scratch file exactly between lstat and the first fstat. */
async function atMarkerOpen(file:string,mutate:()=>Promise<void>,action:()=>Promise<void>) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const api=require("node:fs/promises"),original=api.open;let intercepted=false;
  api.open=async(...args:Json[])=>{const handle=await original(...args);if(args[0]===file&&!intercepted){intercepted=true;await mutate();}return handle;};
  try {await action();assert.equal(intercepted,true);} finally {api.open=original;}
}
/** The real production marker reader, using only ordinary disposable synthetic files. */
async function markerFixture(action:(directory:string)=>Promise<void>) {
  await mkdir(resolve(".tmp"),{recursive:true});const directory=await mkdtemp(resolve(".tmp/trial-l-marker-"));
  try {await action(await realpath(directory));} finally {await rm(directory,{recursive:true,force:true});}
}
describe("typed Trial L marker polling",()=>{
  it("classifies same-identity growth through the strict public reader",async()=>{
    await markerFixture(async directory=>{const file=join(directory,"forward.json");await writeFile(file,'{"nonce":');
      await atMarkerOpen(file,()=>writeFile(file,JSON.stringify({nonce,forwardCount:1})),async()=>{
        await assert.rejects(L.readStableBytes(file,4096),(error:Json)=>{assert.deepEqual(error.readIssue,{operation:"fstat-before",classification:"unstable"});return true;});
      });
    });
  });
  it("defers the whole real marker sample and retains a bounded content-free diagnostic",async()=>{
    await markerFixture(async directory=>{const file=join(directory,"forward.json");await writeFile(file,'{"nonce":');const diagnostics=L.createReadDiagnostics();
      await atMarkerOpen(file,()=>writeFile(file,JSON.stringify({nonce,forwardCount:1})),async()=>{
        const sample=await L.readControlMarkers(directory,"post-release",diagnostics,()=>12);
        assert.equal(sample.complete,false);assert.equal(Object.hasOwn(sample.markers,"forward"),false);
        assert.deepEqual(diagnostics,{format:"trial-l-read-diagnostics-v1",transients:[{phase:"post-release",role:"forward",operation:"fstat-before",classification:"unstable",atMs:12}],terminal:null});
      });
      const stable=await L.readControlMarkers(directory,"post-release",diagnostics,()=>22);assert.equal(stable.complete,true);assert.deepEqual(stable.markers.forward,{nonce,forwardCount:1});
    });
  });
  for(const phase of ["pre-release","final","read-back"])it("keeps "+phase+" same-file instability terminal",async()=>{
    await markerFixture(async directory=>{const file=join(directory,"forward.json");await writeFile(file,'{"nonce":');const diagnostics=L.createReadDiagnostics();
      await atMarkerOpen(file,()=>writeFile(file,JSON.stringify({nonce,forwardCount:1})),async()=>{
        await assert.rejects(L.readControlMarkers(directory,phase,diagnostics,()=>12));assert.equal(diagnostics.transients.length,0);assert.deepEqual(diagnostics.terminal,{phase,role:"forward",operation:"fstat-before",classification:"unstable",atMs:12});
      });
    });
  });
  it("requires a later complete real sample even when returned and upload are ready",async()=>{
    await markerFixture(async directory=>{const a=actors(),read=a.io.read,diagnostics=L.createReadDiagnostics();let postReads=0;const file=join(directory,"forward.json");
      a.io.read=async()=>{const sample=await read();if(!a.state.released)return sample;postReads++;if(postReads===2)assert.equal(a.state.commands.filter((c:Json)=>c.kind==="refuse").length,1);
        for(const name of ["started","entry","forward","returned"])await writeFile(join(directory,name+".json"),JSON.stringify(sample[name]));
        if(postReads===1)await writeFile(file,'{"nonce":');let markers:Json;
        const load=async()=>{markers=await L.readControlMarkers(directory,"post-release",diagnostics,a.io.now);};
        if(postReads===1)await atMarkerOpen(file,()=>writeFile(file,JSON.stringify(sample.forward)),load);else await load();
        for(const name of ["started","entry","forward","returned","rejected","failed","unexpected"])delete sample[name];
        return {...sample,...markers!.markers,markerReadComplete:markers!.complete};};
      const result=await L.observeLifetime(a.io,{nonce,profile,readDiagnostics:diagnostics});assert.equal(result.status,"observed");assert.equal(postReads,3);assert.equal(result.readDiagnostics.transients.length,1);assert.equal(a.state.releaseCalls,1);assert.equal(a.state.commands.filter((c:Json)=>c.kind==="refuse").length,2);
      assert.equal(L.validateObservation(result),true);
      for(const mutation of [(d:Json)=>d.transients[0].path="private",(d:Json)=>d.transients[0].role="private-path",(d:Json)=>d.transients[0].atMs=-1,(d:Json)=>d.transients[0].classification="io",(d:Json)=>d.transients.push(...Array(64).fill(d.transients[0])),(d:Json)=>d.terminal=d.transients[0]]){const bad=structuredClone(result);mutation(bad.readDiagnostics);assert.equal(L.validateObservation(bad),false);}
    });
  });
  for(const failure of ["failed","rejected","unexpected","producerAlive","h2Alive"])it("detects "+failure+" during an incomplete sample",async()=>{
    const a=actors((kind,v,state)=>{if(kind==="read"&&state.released){v.markerReadComplete=false;delete v.forward;if(failure.endsWith("Alive"))v[failure]=false;else v[failure]={nonce};}return v;});
    const result=await L.observeLifetime(a.io,{nonce,profile});assert.equal(result.status,"unestablished");assert.equal(result.reason,failure.endsWith("Alive")?"producer-lost":"native-failed");assert.equal(result.events.some((e:Json)=>e.stage==="returned"),false);
  });
  it("keeps the original return deadline while whole samples remain incomplete",async()=>{
    const a=actors((kind,v,state)=>{if(kind==="read"&&state.released){v.markerReadComplete=false;delete v.forward;}return v;});const before=a.io.release;let releaseAt=0;
    a.io.release=async()=>{await before();releaseAt=a.state.time;};const result=await L.observeLifetime(a.io,{nonce,profile});assert.equal(result.status,"unestablished");assert.equal(a.state.time-releaseAt,60000);assert.equal(a.state.releaseCalls,1);assert.equal(result.events.some((e:Json)=>e.stage==="returned"),false);
  });
  it("terminates at the 65th transient without replacing any retained record",async()=>{
    await markerFixture(async directory=>{const file=join(directory,"forward.json"),diagnostics=L.createReadDiagnostics();
      for(let i=0;i<65;i++){await writeFile(file,'{"nonce":');await atMarkerOpen(file,()=>writeFile(file,JSON.stringify({nonce,forwardCount:1})),async()=>{if(i<64)await L.readControlMarkers(directory,"post-release",diagnostics,()=>i);else await assert.rejects(L.readControlMarkers(directory,"post-release",diagnostics,()=>i));});}
      assert.equal(diagnostics.transients.length,64);assert.deepEqual(diagnostics.terminal,{phase:"post-release",role:"forward",operation:"poll",classification:"overflow",atMs:64});assert.equal(L.validateReadDiagnostics(diagnostics),true);
    });
  });
});

/** Advance the synthetic clock once at the release checkpoint and once when the first returned sample is read. */
async function timedReturn(checkpointMs:number, readMs:number, tickAfterRead=false) {
  const a=actors(), read=a.io.read;
  let pollStart:number|undefined, sampled=false, ticking=false;
  a.io.checkpoint=async()=>{
    if(!a.state.released)return;
    if(pollStart===undefined){a.state.time+=checkpointMs;pollStart=a.state.time;}
    else ticking=false;
  };
  a.io.read=async()=>{
    const value=await read();
    if(a.state.released&&!sampled){sampled=true;a.state.time+=readMs;ticking=tickAfterRead;}
    return value;
  };
  a.io.now=()=>{const at=a.state.time;if(ticking)a.state.time++;return at;};
  const result=await L.observeLifetime(a.io,{nonce,profile});
  assert.ok(pollStart!==undefined);
  return {result,pollStart};
}
describe("exact Trial L return window",()=>{
  it("replays 59995 ms after a 10 ms release checkpoint",async()=>{
    const {result,pollStart}=await timedReturn(10,59995);
    const release=result.events.find((event:Json)=>event.stage==="release");
    assert.equal(pollStart-release.atMs,10);
    assert.equal(result.status,"observed");
    assert.deepEqual(result.returnPoll,{startedAtMs:pollStart,acceptedAtMs:pollStart+59995});
    assert.equal(L.validateObservation(result),true);
  });
  it("preserves fractional clock values across the exclusive boundary",async()=>{
    const {result,pollStart}=await timedReturn(10.75,59999.5);
    assert.equal(result.status,"observed");
    assert.equal(result.returnPoll.startedAtMs,pollStart);
    assert.equal(result.returnPoll.acceptedAtMs-pollStart,59999.5);
    assert.equal(Math.floor(result.returnPoll.acceptedAtMs)-Math.floor(pollStart),60000);
    assert.equal(L.validateObservation(result),true);
  });
  it("rejects fractional stamps attributed to the integer live clock",async()=>{
    const {result}=await timedReturn(10,10);
    assert.equal(result.status,"observed");
    for(const key of ["startedAtMs","acceptedAtMs"]){
      const forged=structuredClone(result);
      forged.synthetic=false;forged.nativeExecuted=true;
      forged.returnPoll[key]+=0.25;
      assert.equal(L.validateObservation(forged),false);
    }
  });
  it("replays the checked sample even when returned event emission crosses the deadline",async()=>{
    const {result,pollStart}=await timedReturn(10,59997,true);
    const returned=result.events.find((event:Json)=>event.stage==="returned");
    assert.ok(returned);
    assert.ok(returned.atMs>=pollStart+60000);
    assert.equal(result.status,"observed");
    assert.ok(result.returnPoll.acceptedAtMs<pollStart+60000);
    assert.equal(L.validateObservation(result),true);
    const forged=structuredClone(result);
    forged.returnPoll.acceptedAtMs--;
    assert.equal(L.validateObservation(forged),false);
    const lateRead=structuredClone(result);
    lateRead.readDiagnostics.transients.push({phase:"post-release",role:"forward",operation:"read",classification:"unstable",atMs:returned.atMs});
    assert.equal(L.validateObservation(lateRead),false);
  });
  for(const delay of [60000,60001])it("rejects a complete sample at "+delay+" ms",async()=>{
    const {result,pollStart}=await timedReturn(10.75,delay);
    assert.equal(result.status,"unestablished");assert.equal(result.reason,"native-failed");
    assert.equal(result.events.some((event:Json)=>event.stage==="returned"),false);
    assert.deepEqual(result.returnPoll,{startedAtMs:pollStart,acceptedAtMs:null});
    assert.equal(L.validateObservation(result),false);
  });
  it("rejects missing, malformed and misordered poll clock evidence",async()=>{
    const {result,pollStart}=await timedReturn(10,10);
    assert.equal(result.status,"observed");
    assert.deepEqual(result.returnPoll,{startedAtMs:pollStart,acceptedAtMs:pollStart+10});
    for(const change of [
      (r:Json)=>delete r.returnPoll,(r:Json)=>delete r.returnPoll.acceptedAtMs,
      (r:Json)=>r.returnPoll.extra="private",(r:Json)=>r.returnPoll.startedAtMs=String(pollStart),
      (r:Json)=>r.returnPoll.startedAtMs=NaN,(r:Json)=>r.returnPoll.acceptedAtMs=Infinity,
      (r:Json)=>r.returnPoll.startedAtMs=pollStart-11,(r:Json)=>r.returnPoll.startedAtMs=pollStart+11,
      (r:Json)=>r.returnPoll.acceptedAtMs=pollStart+11,
      (r:Json)=>r.readDiagnostics.transients.push({phase:"post-release",role:"forward",operation:"read",classification:"unstable",atMs:pollStart-1})
    ]){const bad=structuredClone(result);change(bad);assert.equal(L.validateObservation(bad),false);}
    const edge=await timedReturn(10,59999);
    assert.equal(edge.result.status,"observed");
    edge.result.returnPoll.startedAtMs-=1;
    assert.equal(L.validateObservation(edge.result),false);
  });
});

describe("strict Trial L read classifications",()=>{
  for(const classification of ["type","symlink","links","canonical","device","inode","birthtime","bound","io"])it("keeps "+classification+" terminal during post-release polling",async()=>{
    await markerFixture(async directory=>{
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const api=require("node:fs/promises"),originals={lstat:api.lstat,realpath:api.realpath,open:api.open};const file=join(directory,"started.json");await writeFile(file,'{}');let closes=0;
      const alter=(st:Json)=>Object.assign(Object.create(st),classification==="type"?{isFile:()=>false}:classification==="symlink"?{isSymbolicLink:()=>true}:classification==="links"?{nlink:2n}:classification==="bound"?{size:4097n}:{});
      api.lstat=async(...args:Json[])=>alter(await originals.lstat(...args));
      if(classification==="canonical")api.realpath=async()=>directory;
      api.open=async(...args:Json[])=>{if(classification==="io")throw Object.assign(new Error("PRIVATE IO"),{code:"EIO"});const handle=await originals.open(...args),stat=handle.stat.bind(handle),close=handle.close.bind(handle);
        handle.stat=async(...options:Json[])=>{const st=await stat(...options);return Object.assign(Object.create(st),classification==="device"?{dev:st.dev+1n}:classification==="inode"?{ino:st.ino+1n}:classification==="birthtime"?{birthtimeNs:st.birthtimeNs+1n}:{});};handle.close=async()=>{closes++;await close();};return handle;};
      const diagnostics={format:"trial-l-read-diagnostics-v1",transients:[],terminal:null} as Json;
      try {await assert.rejects(L.readControlMarkers(directory,"post-release",diagnostics,()=>1));assert.equal(diagnostics.transients.length,0);assert.equal(diagnostics.terminal.classification,classification);assert.equal(diagnostics.terminal.role,"started");assert.equal(JSON.stringify(diagnostics).includes("PRIVATE"),false);assert.equal(L.validateReadDiagnostics(diagnostics),true);if(["device","inode","birthtime"].includes(classification))assert.equal(closes,1);}
      finally {Object.assign(api,originals);}
    });
  });
  it("checks final identity despite an in-bound byte-count mismatch and closes its handle",async()=>{
    await markerFixture(async directory=>{
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const api=require("node:fs/promises"),original=api.open,file=join(directory,"started.json");await writeFile(file,'{}');let afterRead=false,afterStats=0,closes=0;
      api.open=async(...args:Json[])=>{const h=await original(...args),read=h.read.bind(h),stat=h.stat.bind(h),close=h.close.bind(h);h.read=async(...a:Json[])=>{await writeFile(file,'{"grown":true}');afterRead=true;return read(...a);};h.stat=async(...options:Json[])=>{const s=await stat(...options);if(afterRead){afterStats++;return Object.assign(Object.create(s),{ino:s.ino+1n});}return s;};h.close=async()=>{closes++;await close();};return h;};
      const diagnostics={format:"trial-l-read-diagnostics-v1",transients:[],terminal:null} as Json;try {await assert.rejects(L.readControlMarkers(directory,"post-release",diagnostics,()=>1));assert.equal(afterStats,1);assert.equal(closes,1);assert.equal(diagnostics.terminal.classification,"inode");assert.equal(diagnostics.transients.length,0);}finally{api.open=original;}
    });
  });
  it("keeps disappearance after open terminal rather than treating it as absence",async()=>{
    await markerFixture(async directory=>{
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const api=require("node:fs/promises"),original=api.lstat,file=join(directory,"started.json");await writeFile(file,'{}');let count=0;
      api.lstat=async(...args:Json[])=>{if(args[0]===file&&++count>1)throw Object.assign(new Error("PRIVATE ENOENT"),{code:"ENOENT"});return original(...args);};
      const diagnostics={format:"trial-l-read-diagnostics-v1",transients:[],terminal:null} as Json;try{await assert.rejects(L.readControlMarkers(directory,"post-release",diagnostics,()=>1));assert.equal(diagnostics.terminal.operation,"lstat-after");assert.equal(diagnostics.terminal.classification,"io");}finally{api.lstat=original;}
    });
  });
  it("preserves nonfinal JSON syntax handling and rejects final malformed JSON",async()=>{
    await markerFixture(async directory=>{await writeFile(join(directory,"started.json"),'{');const d=L.createReadDiagnostics();assert.equal((await L.readControlMarkers(directory,"post-release",d,()=>1)).markers.started,null);await assert.rejects(L.readControlMarkers(directory,"final",d,()=>2));assert.equal(d.terminal.operation,"parse");assert.equal(d.terminal.classification,"json");});
  });
});

describe("exact Trial L marker stats",()=>{
  for(const [field,site,classification] of [
    ["ino","fstat-before","inode"],["ino","fstat-after","inode"],["ino","lstat-after","inode"],
    ["dev","fstat-before","device"],["birthtime","lstat-after","birthtime"],["mtime","fstat-after","unstable"],
  ] as const)it("compares exact "+field+" at "+site,async()=>{
    await markerFixture(async directory=>{
      // Match Node's projection for each requested stat mode, including collisions in Number mode.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const api=require("node:fs/promises"),originalLstat=api.lstat,originalOpen=api.open;
      const file=join(directory,"forward.json"),diagnostics=L.createReadDiagnostics();
      const timestamp=field==="mtime"||field==="birthtime";
      const base=timestamp?1700000000000000000n:9007199254740992n;
      assert.equal(Number(base),Number(base+1n));
      const project=(stats:Json,operation:string)=>{
        const exact=operation===site?base+1n:base;
        const big=typeof stats.ino==="bigint";
        const projected:Record<string,number|bigint>={};
        if(timestamp){
          if(big)projected[field+"Ns"]=exact;
          projected[field+"Ms"]=big?exact/1000000n:Number(exact)/1e6;
        }else projected[field]=big?exact:Number(exact);
        return Object.assign(Object.create(stats),projected);
      };
      let pathStats=0,handleStats=0,closed=0;
      api.lstat=async(name:string,...options:Json[])=>{
        const stats=await originalLstat(name,...options);
        return name===file?project(stats,++pathStats===1?"lstat-before":"lstat-after"):stats;
      };
      api.open=async(name:string,...args:Json[])=>{
        const handle=await originalOpen(name,...args);
        if(name===file){
          const stat=handle.stat.bind(handle),close=handle.close.bind(handle);
          handle.stat=async(...options:Json[])=>project(await stat(...options),++handleStats===1?"fstat-before":"fstat-after");
          handle.close=async()=>{await close();closed++;};
        }
        return handle;
      };
      try{
        await writeFile(file,"{}");
        const load=()=>L.readControlMarkers(directory,"post-release",diagnostics,()=>5);
        if(field==="mtime"){
          const sample=await load();assert.equal(sample.complete,false);
          assert.equal(Object.hasOwn(sample.markers,"forward"),false);
          assert.deepEqual(diagnostics.transients,[{phase:"post-release",role:"forward",operation:site,classification:"unstable",atMs:5}]);
          assert.equal(diagnostics.terminal,null);
        }else{
          // Grow the real file between path and descriptor stats to exercise deferral admission.
          await atMarkerOpen(file,()=>writeFile(file,'{"grown":true}'),async()=>{
            await assert.rejects(load);
            assert.deepEqual(diagnostics.terminal,{phase:"post-release",role:"forward",operation:site,classification,atMs:5});
            assert.deepEqual(diagnostics.transients,[]);
          });
        }
        assert.equal(closed,1);
      }finally{api.lstat=originalLstat;api.open=originalOpen;}
    });
  });
});

describe("incomplete real Trial L samples",()=>{
  for(const role of ["rejected","failed","unexpected"])it("still reads stable "+role+" after a changing forward marker",async()=>{
    await markerFixture(async directory=>{const file=join(directory,"forward.json");await writeFile(file,'{"nonce":');await writeFile(join(directory,role+".json"),JSON.stringify({nonce}));const diagnostics=L.createReadDiagnostics();
      await atMarkerOpen(file,()=>writeFile(file,JSON.stringify({nonce,forwardCount:1})),async()=>{const sample=await L.readControlMarkers(directory,"post-release",diagnostics,()=>10);assert.equal(sample.complete,false);assert.deepEqual(sample.markers[role],{nonce});assert.equal(Object.hasOwn(sample.markers,"forward"),false);});
    });
  });
  it("classifies a same-size mtime change without accepting its bytes",async()=>{
    await markerFixture(async directory=>{
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const api=require("node:fs/promises"),file=join(directory,"forward.json");await writeFile(file,'{}');const st=await api.stat(file);
      await atMarkerOpen(file,()=>api.utimes(file,st.atime,new Date(st.mtimeMs+2000)),async()=>{await assert.rejects(L.readStableBytes(file,4096),(error:Json)=>{assert.equal(error.readIssue.classification,"unstable");return true;});});
    });
  });
});
