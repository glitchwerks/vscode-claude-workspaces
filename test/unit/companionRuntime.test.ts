import type { Uri } from "vscode";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { LaunchSpec } from "../../src/launch/launchPlanner";
import type { ManagedPty, ManagedPtyFactory } from "../../src/launch/managedPty";
import type { ManagedSessionSnapshot } from "../../src/sessions/sessionTypes";
import type { CaptureHostOptions, CompanionCapture, CaptureProtocol, CaptureSourceEvent } from "../../src/companion/companionCapture";
import type { CompanionModel } from "../../src/companion/companionModel";
import type { CaptureCapabilityMetadata, CaptureQualification } from "../../src/companion/companionCapabilities";
import type { ManagedCaptureIdentity } from "../../src/companion/companionTypes";
import type { CaptureBinding } from "../../src/companion/companionTypes";
import { captureEnvironmentKeys, captureLimits } from "../../src/companion/companionTypes";
import { createHash } from "node:crypto";
import { CaptureFixtureClock, CaptureFixtureFileSystem, fixtureTarget } from "../support/companionHarness";
import { FakeManagedPty } from "../support/fakeManagedPty";
import { decodeCompanionHostMessage, decodeCompanionSnapshot, decodeCompanionDelta } from "../../src/panel/companionProtocol";
import type { CompanionHostMessage } from "../../src/panel/companionProtocol";
interface DocumentLease {readonly viewId:string;legacyReady(documentId:string):void;receive(payload:unknown):void;dispose():void}

interface Runtime {
  readonly resources:CompanionCapture;
  readonly model:CompanionModel;
  openDocument():DocumentLease;
  selectSession(sessionId:string|undefined):void;
  prepareLaunch(spec:LaunchSpec,session:ManagedSessionSnapshot):Promise<LaunchSpec>;
  observeSpawn(base:ManagedPtyFactory,spec:LaunchSpec):Promise<ManagedPty>;
  refresh():void;
  beginShutdown():void;
  close():Promise<void>;
}
interface Options {
  capture:Omit<CaptureHostOptions,"currentTarget"|"evictComplete">;
  currentTarget:(id:string)=>ManagedCaptureIdentity|undefined;
  capability:(spec:LaunchSpec)=>CaptureCapabilityMetadata;
  qualifiedBuilds:readonly CaptureQualification[];
  now:()=>number;
  schedule:(callback:()=>void,delay:number)=>()=>void;
  diagnostic:(reason:string)=>void;
  emit?:(message:{type:"companion";payload:CompanionHostMessage})=>void|PromiseLike<unknown>;
  renewDocument?:()=>void;
  runningTarget?:(id:string)=>ManagedCaptureIdentity|undefined;
  clipboard?:(value:string)=>PromiseLike<void>;
  revealRaw?:(target:Readonly<ManagedCaptureIdentity>)=>void;
  writeInput?:(id:string,data:"\u001b")=>void;
}
function createRuntime(options:Options):Runtime {
  const path=resolve("out/src/companion/companionRuntime.js");
  assert.ok(existsSync(path),"host companion runtime must preserve native launch and attach exact-owner exit proof");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded=require(path) as {CompanionRuntime:new(options:Options)=>Runtime};
  return new loaded.CompanionRuntime(options);
}
const spec={executable:"claude",args:["--resume","native-A"],cwd:"C:/workspace",env:{AUTH:"kept",CLAUDE_WORKSPACES_CAPTURE_TOKEN:"inherited"},root:{id:"root",label:"Root",uri:{fsPath:"C:/workspace"} as Uri},importedRoots:[],skippedImportIds:[]} as LaunchSpec;
const session={id:fixtureTarget.sessionId,claudeSessionId:fixtureTarget.claudeSessionId,state:"starting"} as ManagedSessionSnapshot;
function setup(qualified=true) {
  const fs=new CaptureFixtureFileSystem(),clock=new CaptureFixtureClock(),diagnostics:string[]=[];
  const messages:CompanionHostMessage[]=[];let renewals=0;
  const copied:string[]=[],writes:{id:string;data:string}[]=[],raw:ManagedCaptureIdentity[]=[];
  let write:((value:string)=>PromiseLike<void>)=async()=>{};
  let emit:((message:CompanionHostMessage)=>void|PromiseLike<unknown>)=()=>{};
  const targets=new Map<string,ManagedCaptureIdentity>([[fixtureTarget.sessionId,fixtureTarget]]);let entropy=0;
  const runtime=createRuntime({capture:{storageRoot:fs.root,fs,coordinator:fs.coordinator,processId:4242,probeProcess:()=>{},randomBytes:size=>Buffer.alloc(size,++entropy)},
    currentTarget:id=>targets.get(id),capability:()=>({platform:"win32",arch:"x64",remoteName:null,vscodeVersion:"1.128.0",cliVersion:"fixture",cliBuild:"synthetic",pluginAvailable:true,schemaVersion:1}),
    qualifiedBuilds:qualified?[{platform:"win32",arch:"x64",cliVersion:"fixture",cliBuild:"synthetic",schemaVersion:1,adapterId:"synthetic",receipt:"synthetic fixture only"}]:[],
    now:clock.now,schedule:clock.schedule,diagnostic:reason=>diagnostics.push(reason),
    emit:message=>{assert.deepEqual(Object.keys(message),["type","payload"]);assert.equal(message.type,"companion");assert.ok(decodeCompanionHostMessage(message.payload).ok);messages.push(message.payload);return emit(message.payload);},renewDocument:()=>{renewals++;},
    runningTarget:id=>targets.get(id),clipboard:value=>{copied.push(value);return write(value);},revealRaw:target=>raw.push(target),writeInput:(id,data)=>writes.push({id,data})});
  return {runtime,fs,clock,diagnostics,messages,copied,writes,raw,setEmitter:(callback:typeof emit)=>{emit=callback;},setClipboard:(callback:typeof write)=>{write=callback;},renewals:()=>renewals,setTarget:(value:ManagedCaptureIdentity|undefined,id=value?.sessionId??fixtureTarget.sessionId)=>{if(value)targets.set(id,value);else targets.delete(id);runtime.refresh();}};
}
async function flush():Promise<void> {for(let i=0;i<12;i++)await new Promise<void>(resolve=>setImmediate(resolve));}
function directories(h:ReturnType<typeof setup>):string[] {return [...h.fs.entries.keys()].filter(p=>/companion-[a-f0-9]{32}$/.test(p));}

describe("companion runtime managed launch",()=>{
  it("refuses a host target lookup naming a different managed session",async()=>{
    const h=setup(),other={...fixtureTarget,sessionId:"managed-B"};h.setTarget(other);h.setTarget(other,fixtureTarget.sessionId);
    const prepared=await h.runtime.prepareLaunch(spec,session);assert.equal(prepared.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,undefined);assert.equal(directories(h).length,0);await h.runtime.close();
  });
  it("contains a consumer teardown exception inside native exit delivery",async()=>{
    const h=await captured();await h.observation("`one.txt`");const pty=new FakeManagedPty();await h.runtime.observeSpawn({spawn:async()=>pty},h.prepared);
    const release=h.runtime.model.releaseSession.bind(h.runtime.model);h.runtime.model.releaseSession=context=>{release(context);throw new Error("fixture teardown observer");};
    assert.doesNotThrow(()=>pty.emitExit({exitCode:0}));await flush();assert.ok(h.diagnostics.includes("cleanup"));assert.equal(directories(h).length,0);await h.runtime.close();
  });
  it("cancels an older asynchronous preparation intent before admitting a newer same-tuple launch",async()=>{
    const h=setup();let unblock:(()=>void)|undefined;const gate=new Promise<void>(resolve=>{unblock=resolve;});let entered=false;
    h.fs.before=async operation=>{if(operation==="mkdir"&&!entered){entered=true;await gate;}};
    const first=h.runtime.prepareLaunch(spec,session);await flush();assert.equal(entered,true);
    const second=h.runtime.prepareLaunch(spec,session);unblock!();const results=await Promise.all([first,second]);await flush();
    assert.equal(results[0]!.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,undefined,"superseded intent must not publish a live capture lease");
    assert.ok(directories(h).length<=1);await h.runtime.close();
  });
  it("prepares a one-use exact spec and observes real shared fake exit before returning the same PTY",async()=>{
    const h=setup(),prepared=await h.runtime.prepareLaunch(spec,session),pty=new FakeManagedPty();
    assert.notEqual(prepared,spec);assert.equal(prepared.env.AUTH,"kept");assert.equal(directories(h).length,1);
    let calls=0;const returned=await h.runtime.observeSpawn({spawn:async received=>{calls++;assert.equal(received,prepared);return pty;}},prepared);
    assert.equal(returned,pty);assert.equal(calls,1);await pty.terminate();await flush();assert.equal(directories(h).length,1);
    pty.emitExit({exitCode:0});await flush();assert.equal(directories(h).length,0);await h.runtime.close();
  });
  it("does not qualify a build or recover authority from copied environment strings",async()=>{
    const h=setup(false),prepared=await h.runtime.prepareLaunch(spec,session),pty=new FakeManagedPty();
    assert.equal(directories(h).length,0);assert.equal(prepared.env.AUTH,"kept");
    const returned=await h.runtime.observeSpawn({spawn:async received=>{assert.ok(!Object.keys(received.env).some(k=>captureEnvironmentKeys.some(key=>key===k.toUpperCase())));return pty;}},spec);
    assert.equal(returned,pty);await h.runtime.close();
  });
});

interface ExitCase {id:string;events:(string|number)[][];expected:{proofFor:string[];cleanupFor:string[];baseSpawnCalls:number;diagnostic?:string;activeExitListeners?:number;captureKeysPresent?:boolean}}
const exitCases=(JSON.parse(readFileSync(resolve("test/fixtures/companion/capture-cases.json"),"utf8")) as {managedExitBridgeCases:ExitCase[]}).managedExitBridgeCases;
describe("selected managedExitBridgeCases through actual preparation/factory/event",()=>{
  for(const vector of exitCases)it(vector.id,async()=>{
    const h=setup(),bindings=new Map<string,CaptureBinding>(),specs=new Map<string,LaunchSpec>(),ptys=new Map<string,FakeManagedPty>();
    const proof:string[]=[],saved=new Map<string,()=>void>();let label="A",calls=0,listeners=0,lastSpec=spec;
    const prepare=h.runtime.resources.prepare.bind(h.runtime.resources),confirm=h.runtime.resources.confirmManagedPtyExit.bind(h.runtime.resources);
    h.runtime.resources.prepare=async id=>{const result=await prepare(id);if(result.ok)bindings.set(label,result.value);return result;};
    let confirmationThrows=false;
    h.runtime.resources.confirmManagedPtyExit=binding=>{proof.push([...bindings].find(([,v])=>v===binding)![0]);if(confirmationThrows)throw new Error("fixture confirmation");confirm(binding);};
    let fulfill:((pty:ManagedPty)=>void)|undefined,reject:((error:Error)=>void)|undefined,pending:Promise<ManagedPty>|undefined,closing:Promise<void>|undefined;
    const originalError=new Error("original factory failure");
    for(const [event,arg,owner] of vector.events){
      if(event==="prepare") {label=String(owner);h.setTarget({...fixtureTarget,generation:"generation-"+label});specs.set(String(arg),await h.runtime.prepareLaunch(spec,session));}
      else if(event==="spawn-enter") {pending=h.runtime.observeSpawn({spawn:received=>{calls++;lastSpec=received;return new Promise((res,rej)=>{fulfill=res;reject=rej;});}},specs.get(String(arg))??spec);}
      else if(String(event).startsWith("factory-resolve")) {
        const pty=new FakeManagedPty(),onExit=pty.onExit;ptys.set(String(arg),pty);
        if(event==="factory-resolve-already-exited")pty.emitExit({exitCode:0});
        Object.defineProperty(pty,"onExit",{value:(callback:()=>void)=>{
          if(event==="factory-resolve-observer-registration-throws-once")throw new Error("fixture registration");
          listeners++;saved.set(String(arg),callback);let disposed=false;
          const subscription=onExit(callback);
          return {dispose:()=>{if(!disposed){disposed=true;listeners--;subscription.dispose();}}};
        }});
        fulfill!(pty);assert.equal(await pending,pty);
      } else if(event==="factory-reject") {reject!(originalError);await assert.rejects(pending!,error=>error===originalError);}
      else if(event==="emit-exit")ptys.get(String(arg))!.emitExit({exitCode:0});
      else if(event==="invoke-saved-exit-callback-again")saved.get(String(arg))!();
      else if(event==="manager-terminate-settles")await ptys.get(String(arg))!.terminate();
      else if(event==="manager-disposes-pty")ptys.get(String(arg))!.dispose();
      else if(event==="revoke"||event==="session-removed-before-factory")h.setTarget(undefined);
      else if(event==="begin-shutdown")h.runtime.beginShutdown();
      else if(event==="close-runtime")closing=h.runtime.close();
      else if(event==="advance-ms"){h.clock.advance(Number(arg));h.clock.fireDue();}
      else if(event==="capture-confirmation-throws")confirmationThrows=true;
      else if(event==="native-session-end"||event==="same-uuid-epoch-reset")h.runtime.refresh();
      else assert.fail("Unhandled bridge fixture event "+String(event));
      await flush();
    }
    if(closing)await closing;
    assert.deepEqual(proof,vector.expected.proofFor);assert.equal(calls,vector.expected.baseSpawnCalls);
    assert.deepEqual([...bindings].filter(([,binding])=>!h.fs.entries.has(binding.directory)).map(([key])=>key),vector.expected.cleanupFor);
    if(vector.expected.activeExitListeners!==undefined)assert.equal(listeners,vector.expected.activeExitListeners);
    if(vector.expected.diagnostic)assert.ok(h.diagnostics.includes(vector.expected.diagnostic));
    if(vector.expected.captureKeysPresent===false)assert.ok(!Object.keys(lastSpec.env).some(k=>captureEnvironmentKeys.some(key=>key===k.toUpperCase())));
    for(const pty of ptys.values()){assert.deepEqual(pty.writes,[]);assert.deepEqual(pty.resizes,[]);}
    const close=h.runtime.close();h.clock.advance(2001);h.clock.fireDue();await close;
  });
});

/** Feed the actual file protocol, retaining its exact callback for adversarial stale delivery. */
async function captured(h=setup(),identity=fixtureTarget) {
  let binding:CaptureBinding|undefined,protocol:CaptureProtocol|undefined,callback:((event:CaptureSourceEvent)=>unknown)|undefined;
  assert.ok(h.runtime.model,"runtime must compose one retained model with its actual resource ledger");
  const prepare=h.runtime.resources.prepare.bind(h.runtime.resources),start=h.runtime.resources.startProtocol.bind(h.runtime.resources);
  h.runtime.resources.prepare=async id=>{const result=await prepare(id);if(result.ok)binding=result.value;return result;};
  h.runtime.resources.startProtocol=async (owner,options)=>{callback=options?.onEvent;const result=await start(owner,{...options,autoPoll:false});if(result.ok)protocol=result.value;return result;};
  const prepared=await h.runtime.prepareLaunch(spec,{...session,id:identity.sessionId,claudeSessionId:identity.claudeSessionId});assert.ok(binding);assert.ok(protocol);
  const owner=binding,driver=protocol;
  const json=(name:string)=>JSON.parse(h.fs.entries.get(resolve(owner.directory,name))!.data.toString()) as Record<string,unknown>;
  const pair=(name:string,data:unknown)=>{const text=JSON.stringify(data);h.fs.put(resolve(owner.directory,name+".upload"),"file",text);h.fs.put(resolve(owner.directory,name+".ready"),"file",JSON.stringify({v:1,basename:name+".upload",byteLength:Buffer.byteLength(text)}));};
  const envelope={v:1,token:owner.token,sessionId:owner.marker.sessionId,claudeSessionId:owner.marker.claudeSessionId,generation:owner.marker.generation};
  pair("request."+String(json("control.json").offerId),{...envelope,kind:"epochRequest",offerId:json("control.json").offerId,predecessorEpoch:null,nativeSessionId:owner.marker.claudeSessionId,reason:"initial"});await driver.poll();
  const epoch=String(json("control.json").captureEpoch);
  pair("activate."+epoch,{...envelope,kind:"epochActivate",captureEpoch:epoch,grantId:json("control.json").grantId,nativeSessionId:owner.marker.claudeSessionId});await driver.poll();
  let seq=0,observationId=0;const delivered:CaptureSourceEvent[]=[];
  const accept=h.runtime.model?.accept.bind(h.runtime.model);
  if(accept)h.runtime.model.accept=(binding,event)=>{delivered.push(event);return accept(binding,event);};
  const observation=async(text:string,rowId="row-A")=>{
    const bytes=Buffer.from(JSON.stringify({kind:"assistantRow",scope:{kind:"main"},rowId,blocks:[{kind:"text",index:0,text}]})),parts:string[]=[];observationId++;
    for(let offset=0;offset<bytes.length;){let end=Math.min(offset+65536,bytes.length);while(end<bytes.length&&(bytes[end]!&0xc0)===0x80)end--;parts.push(bytes.subarray(offset,end).toString());offset=end;}
    for(const [chunkIndex,data] of parts.entries()){seq++;pair("frame."+epoch+"."+seq,{...envelope,kind:"observationChunk",captureEpoch:epoch,seq,observationId,chunkIndex,chunkCount:parts.length,totalByteLength:bytes.length,byteLength:Buffer.byteLength(data),data});await driver.poll();}
  };
  return {...h,owner,driver,prepared,observation,delivered,deliver:(event:CaptureSourceEvent)=>callback?.(event),snapshot:()=>h.runtime.model.snapshot(identity.sessionId)};
}
describe("runtime exact P1 callback and P2 ownership",()=>{
  it("shares the actual ledger across sessions and evicts only complete model groups under real pressure",async()=>{
    const h=await captured();await h.observation("`one.txt`");
    const other={sessionId:"managed-B",claudeSessionId:"22222222-2222-4222-8222-222222222222",generation:"generation-B"};h.setTarget(other);
    const second=await captured(h,other);await second.observation("`two.txt`");
    assert.equal(second.runtime,h.runtime);assert.ok(h.runtime.resources.retentionUsage(other.sessionId).sessionBytes>0);
    const target=h.snapshot().groups[0]!.targets[0]!,ticket=h.runtime.resources.reserveRetention(h.owner,captureLimits.sessionBytes-2048);assert.ok(ticket);
    assert.equal(h.runtime.model.resolveLiteral(fixtureTarget.sessionId,target.targetId,target.targetRevision),undefined);
    assert.equal(second.snapshot().groups[0]?.sourceText,"`two.txt`");h.runtime.resources.releaseRetention(ticket);
    await h.runtime.close();assert.equal(h.runtime.resources.retentionUsage(other.sessionId).globalBytes,0);
  });
  it("does not mistake a held foreign ticket for the callback's binding origin",async()=>{
    const h=await captured();await h.observation("`one.txt`");const event=h.delivered[0]!;assert.equal(event.kind,"observation");
    const prepared=await h.runtime.resources.prepare(fixtureTarget.sessionId);assert.ok(prepared.ok);const foreign=h.runtime.resources.reserveRetention(prepared.value,1024);assert.ok(foreign);
    const before=h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes;
    h.deliver({...event,retention:foreign,observationId:99,ackSeq:99} as CaptureSourceEvent);
    assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,before);assert.equal(h.delivered.length,1);
    h.runtime.resources.releaseRetention(foreign);await h.runtime.resources.revoke(prepared.value);await h.runtime.close();
  });
  it("releases complete delivery when the consumer is missing and prevents duplicate adopted delivery from entering it again",async()=>{
    const h=await captured();await h.observation("`one.txt`");const event=h.delivered[0]!,before=h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes;
    Object.defineProperty(h.runtime.model,"accept",{value:undefined,configurable:true});h.deliver(event);assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,before);
    await h.observation("`two.txt`","row-B");assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,0);await h.runtime.close();
  });
  it("adopts completed real protocol source and releases it at exact session teardown",async()=>{
    const h=await captured();await h.observation("Run: `printf café`");
    assert.equal(h.snapshot().groups[0]?.sourceText,"Run: `printf café`");assert.equal(h.delivered.length,1);
    const target=h.snapshot().groups[0]!.targets[0]!;assert.equal(h.runtime.model.resolveLiteral(fixtureTarget.sessionId,target.targetId,target.targetRevision)?.literal,"printf café");
    const usage=h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes;assert.ok(usage>0);
    h.deliver(h.delivered[0]!);assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,usage);
    h.setTarget(undefined);assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,0);await h.runtime.close();
  });
  it("does not retag old callback data as the replacement owner and releases a stale exact reservation",async()=>{
    const h=await captured();await h.observation("`old.txt`");const event=h.delivered[0]!;assert.equal(event.kind,"observation");
    const ticket=h.runtime.resources.reserveRetention(h.owner,1024);assert.ok(ticket);
    h.setTarget({...fixtureTarget,generation:"replacement"});
    h.deliver({...event,retention:ticket} as CaptureSourceEvent);
    assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,0);assert.equal(h.snapshot().groups.length,0);await h.runtime.close();
  });
  it("releases partial adoption if the consumer throws, without revoking a duplicate still owned by the model",async()=>{
    const h=await captured(),accept=h.runtime.model.accept.bind(h.runtime.model);
    h.runtime.model.accept=(binding,event)=>{accept(binding,event);throw new Error("after adoption");};
    await h.observation("`partial.txt`");assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
    assert.equal(h.snapshot().groups.length,0);await h.runtime.close();
  });
});

const documentId="11111111-1111-4111-8111-111111111111",secondDocumentId="22222222-2222-4222-8222-222222222222";
function register(h:ReturnType<typeof setup>):DocumentLease {
  assert.equal(typeof h.runtime.openDocument,"function","runtime must register host HTML leases with legacy-ready pairing");
  const doc=h.runtime.openDocument();h.runtime.selectSession(fixtureTarget.sessionId);doc.legacyReady(documentId);doc.receive({kind:"companion.ready",v:1,viewId:doc.viewId,documentId});return doc;
}
function last<K extends CompanionHostMessage["kind"]>(h:ReturnType<typeof setup>,kind:K):Extract<CompanionHostMessage,{kind:K}> {
  const message=[...h.messages].reverse().find(m=>m.kind===kind);assert.ok(message,"missing "+kind);return message as Extract<CompanionHostMessage,{kind:K}>;
}
function envelope(message:CompanionHostMessage) {return {v:1,viewId:message.viewId,projectionId:message.projectionId,sessionId:message.sessionId,generation:message.generation};}
function completeTransfer(h:ReturnType<typeof setup>,doc:DocumentLease):unknown {
  const begin=last(h,"companion.transferBegin");let bytes=0,text="";
  for(let i=0;i<begin.chunkCount;i++){
    const chunk=last(h,"companion.transferChunk");assert.equal(chunk.chunkIndex,i);assert.equal(chunk.transferId,begin.transferId);text+=chunk.data;bytes+=chunk.byteLength;
    doc.receive({...envelope(begin),kind:"companion.transferAck",transferId:begin.transferId,nextChunkIndex:i+1,byteLength:bytes});
  }
  const end=last(h,"companion.transferEnd");assert.equal(end.transferId,begin.transferId);
  assert.equal(h.messages.some(m=>m.kind==="companion.transferCommit"&&m.transferId===begin.transferId),false);
  doc.receive({...envelope(begin),kind:"companion.transferReady",transferId:begin.transferId,revision:begin.revision,byteLength:bytes,sha256:end.sha256});
  assert.equal(last(h,"companion.transferCommit").transferId,begin.transferId);return JSON.parse(text);
}
describe("runtime document and atomic projection",()=>{
  it("pairs reverse ready once, does not extend its deadline, and renews reused HTML once",async()=>{
    const h=setup(false);assert.equal(typeof h.runtime.openDocument,"function","document lease registration is required");
    const doc=h.runtime.openDocument();h.runtime.selectSession(fixtureTarget.sessionId);
    const ready={v:1,kind:"companion.ready",viewId:doc.viewId,documentId};doc.receive(ready);assert.equal(h.messages.length,0);
    h.clock.advance(1999);doc.receive(ready);h.clock.advance(2);h.clock.fireDue();doc.legacyReady(documentId);assert.equal(h.messages.length,0);
    doc.receive(ready);const bind=last(h,"companion.bind");assert.equal(bind.documentId,documentId);
    doc.receive(ready);assert.equal(last(h,"companion.bind").projectionId,bind.projectionId);
    doc.legacyReady(secondDocumentId);doc.receive({...ready,documentId:secondDocumentId});assert.equal(h.renewals(),1);
    doc.receive({...ready,documentId:secondDocumentId});assert.equal(h.renewals(),1);await h.runtime.close();
  });
  it("commits a frozen cut then the ordered catch-up delta through acknowledgments",async()=>{
    const h=await captured();await h.observation("Run: `first`");const doc=register(h),initial=last(h,"companion.transferBegin");
    const baseline=h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes;await h.observation("Run: `second`","row-B");
    assert.ok(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes>baseline);
    const snapshot=decodeCompanionSnapshot(completeTransfer(h,doc));assert.ok(snapshot.ok);assert.equal(snapshot.value.groups.length,1);
    const deltaBegin=last(h,"companion.transferBegin");assert.equal(deltaBegin.mode,"delta");assert.equal(deltaBegin.baseRevision,initial.revision);
    const delta=decodeCompanionDelta(completeTransfer(h,doc));assert.ok(delta.ok);assert.ok(delta.value.changes.some(c=>c.kind==="upsertGroup"&&c.group.sourceText.includes("second")));
    const live=h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes;doc.dispose();assert.ok(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes<live);await h.runtime.close();
  });
  it("ignores old documents and transfer IDs, and permits only one automatic resync",async()=>{
    const h=await captured();await h.observation("`one.txt`");const doc=register(h),begin=last(h,"companion.transferBegin");
    doc.receive({...envelope(begin),kind:"companion.transferAck",transferId:"0".repeat(32),nextChunkIndex:1,byteLength:1});assert.equal(h.messages.filter(m=>m.kind==="companion.transferAbort").length,0);
    h.clock.advance(2000);h.clock.fireDue();assert.equal(h.messages.filter(m=>m.kind==="companion.bind").length,2);
    h.clock.advance(2000);h.clock.fireDue();assert.equal(h.messages.filter(m=>m.kind==="companion.bind").length,2);
    h.runtime.refresh();assert.equal(h.messages.filter(m=>m.kind==="companion.bind").length,2,"routine manager notifications cannot restart exhausted hydration");
    const replacement=h.runtime.openDocument(),count=h.messages.length;doc.receive({v:1,kind:"companion.ready",viewId:doc.viewId,documentId});assert.equal(h.messages.length,count);
    replacement.dispose();await h.runtime.close();
  });
  it("has no invented selected tuple and enforces canonical document IDs and the 128 registration cap",async()=>{
    const h=setup(false);assert.equal(typeof h.runtime.openDocument,"function","document lease registration is required");const doc=h.runtime.openDocument();
    doc.legacyReady(documentId);doc.receive({v:1,kind:"companion.ready",viewId:doc.viewId,documentId});assert.equal(h.messages.length,0);
    h.runtime.selectSession(fixtureTarget.sessionId);assert.equal(last(h,"companion.bind").sessionId,fixtureTarget.sessionId);
    const next=h.runtime.openDocument();for(let i=0;i<128;i++)next.legacyReady(i.toString(16).padStart(8,"0")+"-1111-4111-8111-111111111111");
    next.legacyReady(secondDocumentId);next.receive({v:1,kind:"companion.ready",viewId:next.viewId,documentId:secondDocumentId});assert.equal(h.messages.filter(m=>m.kind==="companion.bind").length,1);await h.runtime.close();
  });
});

function action(h:ReturnType<typeof setup>,kind:string,actionId:number,extra:Record<string,unknown>={}) {return {...envelope(last(h,"companion.bind")),kind,actionId,...extra};}
function targetAction(h:Awaited<ReturnType<typeof captured>>,kind:string,id:number,index=0) {
  const target=h.snapshot().groups.flatMap(g=>g.targets)[index]!;
  return action(h,kind,id,{targetId:target.targetId,targetRevision:target.targetRevision,appliedRevision:last(h,"companion.transferCommit").revision});
}
describe("runtime Copy Review and native actions",()=>{
  it("copies the exact host value once, rejects conflicting duplicates, and retains the high-water beyond 128 results",async()=>{
    const h=await captured();await h.observation("Run: `printf 'café  '`\n");const doc=register(h);completeTransfer(h,doc);
    const copy=targetAction(h,"companion.copy",1);doc.receive(copy);await flush();assert.deepEqual(h.copied,["printf 'café  '"]);
    doc.receive(copy);assert.equal(last(h,"companion.actionResult").status,"ok");assert.equal(h.copied.length,1);
    doc.receive({...copy,targetRevision:999});assert.equal(last(h,"companion.actionResult").status,"invalid");
    for(let id=2;id<=130;id++)doc.receive(action(h,"companion.toggleRaw",id));
    doc.receive(copy);assert.equal(last(h,"companion.actionResult").status,"duplicateExpired");assert.equal(h.copied.length,1);
    assert.equal(h.raw.length,129);assert.deepEqual(h.writes,[]);await h.runtime.close();
  });
  it("keeps unchanged targets copyable across unrelated revisions but rejects replacement before its delta commits",async()=>{
    const h=await captured();await h.observation("`one.txt`");const doc=register(h);completeTransfer(h,doc);const copy=targetAction(h,"companion.copy",1);
    await h.observation("Unrelated","row-B");doc.receive(copy);await flush();assert.deepEqual(h.copied,["one.txt"]);
    await h.observation("`two.txt`");doc.receive({...copy,actionId:2});assert.equal(last(h,"companion.actionResult").status,"stale");assert.equal(h.copied.length,1);await h.runtime.close();
  });
  it("holds a global latch after uncertainty, never retries, and suppresses settlement into another document",async()=>{
    const h=await captured();await h.observation("`one.txt`");let settle:(()=>void)|undefined;h.setClipboard(()=>new Promise(resolve=>{settle=resolve;}));
    const doc=register(h);completeTransfer(h,doc);doc.receive(targetAction(h,"companion.copy",1));h.clock.advance(2000);h.clock.fireDue();
    assert.equal(last(h,"companion.actionResult").status,"uncertain");doc.receive(targetAction(h,"companion.copy",2));assert.equal(last(h,"companion.actionResult").status,"busy");
    const replacement=register(h);completeTransfer(h,replacement);replacement.receive(targetAction(h,"companion.copy",1));assert.equal(last(h,"companion.actionResult").status,"busy");
    const count=h.messages.length;settle!();await flush();assert.equal(h.messages.length,count);assert.deepEqual(h.copied,["one.txt"]);await h.runtime.close();
  });
  it("reports late settlement only for the original action and treats synchronous platform failure as unavailable",async()=>{
    const h=await captured();await h.observation("`one.txt`");let settle:(()=>void)|undefined;h.setClipboard(()=>new Promise(resolve=>{settle=resolve;}));const doc=register(h);completeTransfer(h,doc);
    doc.receive(targetAction(h,"companion.copy",1));h.clock.advance(2000);h.clock.fireDue();assert.ok(settle,"clipboard dispatch is required");settle();await flush();assert.equal(last(h,"companion.actionResult").status,"settledAfterUncertain");assert.equal(last(h,"companion.actionResult").actionId,1);
    h.setClipboard(()=>{throw new Error("private platform content");});doc.receive(targetAction(h,"companion.copy",2));await flush();assert.equal(last(h,"companion.actionResult").reason,"PLATFORM_ERROR");assert.ok(!JSON.stringify(h.messages).includes("private platform"));await h.runtime.close();
  });
  it("opens Review once, copies only the submitted edited value, and consumes review before platform entry",async()=>{
    const h=await captured();await h.observation("`$HOME/a`");const doc=register(h);completeTransfer(h,doc);
    const open=targetAction(h,"companion.reviewOpen",1);doc.receive(open);const review=last(h,"companion.reviewOpened");assert.equal(review.value,"$HOME/a");
    doc.receive(open);assert.equal(h.messages.filter(m=>m.kind==="companion.reviewOpened").length,1);
    const copy={...open,kind:"companion.reviewCopy",actionId:2,reviewId:review.reviewId,value:"  edited café\\path\n"};doc.receive(copy);await flush();assert.deepEqual(h.copied,["  edited café\\path\n"]);
    doc.receive({...copy,actionId:3});assert.equal(last(h,"companion.actionResult").reason,"EXPIRED_REVIEW");assert.equal(h.copied.length,1);await h.runtime.close();
  });
  it("keeps a review live while clipboard is busy and invalidates changed or expired candidates",async()=>{
    const h=await captured();await h.observation("`$HOME/a`\n\n`copy.txt`");const doc=register(h);completeTransfer(h,doc);
    const targets=h.snapshot().groups.flatMap(g=>g.targets),reviewIndex=targets.findIndex(t=>t.action==="review"),copyIndex=targets.findIndex(t=>t.action==="copy");
    doc.receive(targetAction(h,"companion.reviewOpen",1,reviewIndex));const review=last(h,"companion.reviewOpened");let settle:(()=>void)|undefined;h.setClipboard(()=>new Promise(resolve=>{settle=resolve;}));
    doc.receive(targetAction(h,"companion.copy",2,copyIndex));doc.receive({...targetAction(h,"companion.reviewCopy",3,reviewIndex),reviewId:review.reviewId,value:"edited"});assert.equal(last(h,"companion.actionResult").status,"busy");
    settle!();await flush();h.setClipboard(async()=>{});doc.receive({...targetAction(h,"companion.reviewCopy",4,reviewIndex),reviewId:review.reviewId,value:"edited"});await flush();assert.deepEqual(h.copied,["copy.txt","edited"]);
    doc.receive(targetAction(h,"companion.reviewOpen",5,reviewIndex));h.clock.advance(300000);h.clock.fireDue();assert.equal(last(h,"companion.reviewInvalidated").reason,"expired");
    const expired=last(h,"companion.reviewOpened");doc.receive({...targetAction(h,"companion.reviewCopy",6,reviewIndex),reviewId:expired.reviewId,value:"expired"});assert.equal(last(h,"companion.actionResult").reason,"EXPIRED_REVIEW");assert.equal(last(h,"companion.actionResult").status,"unavailable");
    doc.receive(targetAction(h,"companion.reviewOpen",7,reviewIndex));await h.observation("Changed source");assert.equal(last(h,"companion.reviewInvalidated").reason,"sourceChanged");await h.runtime.close();
  });
  it("dispatches Raw and one Escape without capture or hydration and rejects stale and malformed requests",async()=>{
    const h=setup(false),doc=register(h),escape=action(h,"companion.escape",1);doc.receive(escape);doc.receive(escape);
    assert.deepEqual(h.writes,[{id:fixtureTarget.sessionId,data:"\u001b"}]);assert.equal(last(h,"companion.actionResult").status,"inputSent");
    doc.receive(action(h,"companion.toggleRaw",2));assert.equal(h.raw.length,1);
    doc.receive({...action(h,"companion.escape",3),extra:"forbidden"});assert.equal(last(h,"companion.actionResult").reason,"INVALID_MESSAGE");assert.equal(h.writes.length,1);
    h.setTarget({...fixtureTarget,generation:"replacement"});doc.receive({...escape,actionId:4});assert.equal(h.writes.length,1);assert.equal(last(h,"companion.actionResult").reason,"WRONG_BINDING");await h.runtime.close();
  });
});

describe("runtime bounded transactions and retention",()=>{
  it("funds bounded document/action metadata before retaining a projection",async()=>{
    const h=await captured();await h.observation("`one.txt`");const before=h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes;
    const doc=register(h);completeTransfer(h,doc);
    assert.ok(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes-before>=192*1024,"128 results, 128 ready UUIDs and review tombstones need a conservative fixed metadata charge");await h.runtime.close();
  });
  it("enforces the five-second complete-hydration deadline despite progressing chunk acknowledgments",async()=>{
    const h=await captured();await h.observation("a".repeat(150000));const doc=register(h),begin=last(h,"companion.transferBegin");assert.ok(begin.chunkCount>=4);let bytes=0;
    for(let i=0;i<2;i++){h.clock.advance(1900);h.clock.fireDue();const chunk=last(h,"companion.transferChunk");bytes+=chunk.byteLength;doc.receive({...envelope(begin),kind:"companion.transferAck",transferId:begin.transferId,nextChunkIndex:i+1,byteLength:bytes});}
    h.clock.advance(1200);h.clock.fireDue();assert.equal(last(h,"companion.transferAbort").reason,"timeout");assert.equal(h.messages.filter(m=>m.kind==="companion.bind").length,2);await h.runtime.close();
  });
  it("charges source-bearing async posts until their actual settlement even after document disposal",async()=>{
    const h=await captured();await h.observation("`one.txt`");let settle:(()=>void)|undefined;
    h.setEmitter(message=>message.kind==="companion.transferChunk"?new Promise<void>(resolve=>{settle=resolve;}):undefined);
    const doc=register(h);doc.dispose();h.runtime.model.dispose();assert.ok(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes>0,"pending transport source must remain funded");
    settle!();await flush();assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,0);await h.runtime.close();
  });
  it("does not authorize an in-flight new target using an older committed revision",async()=>{
    const h=await captured();await h.observation("`old.txt`");const doc=register(h);completeTransfer(h,doc);const original=targetAction(h,"companion.copy",1);
    await h.observation("`new.txt`","row-B");const pending=targetAction(h,"companion.copy",2,1);doc.receive(pending);assert.equal(last(h,"companion.actionResult").status,"stale");
    doc.receive({...original,actionId:3});await flush();assert.deepEqual(h.copied,["old.txt"]);completeTransfer(h,doc);
    doc.receive({...pending,actionId:4});assert.equal(last(h,"companion.actionResult").status,"stale");doc.receive(targetAction(h,"companion.copy",5,1));await flush();assert.deepEqual(h.copied,["old.txt","new.txt"]);await h.runtime.close();
  });
  it("R1 rejects never-committed revision holes and retains older exact committed target authority",async()=>{
    const h=await captured();await h.observation("`one.txt`");const doc=register(h),initial=last(h,"companion.transferBegin");
    await h.observation("unrelated one","row-B");const hole=h.runtime.model.revision;await h.observation("unrelated two","row-C");
    completeTransfer(h,doc);completeTransfer(h,doc);const copy=targetAction(h,"companion.copy",1);
    doc.receive({...copy,appliedRevision:hole});assert.equal(h.copied.length,0);assert.equal(last(h,"companion.actionResult").reason,"NOT_READY");
    doc.receive({...copy,actionId:2,appliedRevision:initial.revision});await flush();assert.deepEqual(h.copied,["one.txt"]);await h.runtime.close();
  });
  it("R1 supports more than 128 healthy commits and frees exact membership accounting on disposal",async()=>{
    const h=await captured();await h.observation("`one.txt`");const doc=register(h);completeTransfer(h,doc);const original=targetAction(h,"companion.copy",1);
    for(let i=0;i<130;i++){await h.observation("unrelated "+i,"row-B");completeTransfer(h,doc);}
    assert.equal(h.messages.filter(m=>m.kind==="companion.bind").length,1);doc.receive(original);await flush();assert.deepEqual(h.copied,["one.txt"]);
    doc.dispose();await h.runtime.close();assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
  it("R1 reserves new membership before commit and recovers only through real existing-budget capacity failure",async()=>{
    const h=await captured();await h.observation("`one.txt`");const doc=register(h),begin=last(h,"companion.transferBegin"),chunk=last(h,"companion.transferChunk");
    doc.receive({...envelope(begin),kind:"companion.transferAck",transferId:begin.transferId,nextChunkIndex:1,byteLength:chunk.byteLength});
    const room=captureLimits.sessionBytes-h.runtime.resources.retentionUsage(fixtureTarget.sessionId).sessionBytes,fill=h.runtime.resources.reserveRetention(h.owner,room);assert.ok(fill);
    doc.receive({...envelope(begin),kind:"companion.transferReady",transferId:begin.transferId,revision:begin.revision,byteLength:begin.byteLength,sha256:begin.sha256});
    assert.equal(h.messages.some(m=>m.kind==="companion.transferCommit"&&m.transferId===begin.transferId),false);
    assert.equal(last(h,"companion.transferAbort").reason,"capacity");h.runtime.resources.releaseRetention(fill);
    doc.receive({kind:"companion.ready",v:1,viewId:doc.viewId,documentId});completeTransfer(h,doc);await h.runtime.close();assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
  it("splits escaped and multibyte source at scalar boundaries and hashes the exact logical bytes",async()=>{
    const h=await captured();await h.observation("café 😀 ".repeat(4500));const doc=register(h),begin=last(h,"companion.transferBegin");assert.ok(begin.chunkCount>1);
    completeTransfer(h,doc);const chunks=h.messages.filter(m=>m.kind==="companion.transferChunk");assert.ok(chunks.length>1);
    const text=chunks.map(c=>c.data).join("");assert.equal(createHash("sha256").update(text).digest("hex"),begin.sha256);
    for(const chunk of chunks){assert.ok(Buffer.byteLength(chunk.data)<=65536);assert.ok(Buffer.byteLength(JSON.stringify({type:"companion",payload:chunk}))<=262144);assert.ok(!/[\uD800-\uDBFF]$/.test(chunk.data));}
    await h.runtime.close();
  });
  it("rejects uncommitted Copy and a false transfer-ready hash without committing partial source",async()=>{
    const h=await captured();await h.observation("`one.txt`");const doc=register(h),begin=last(h,"companion.transferBegin"),target=h.snapshot().groups[0]!.targets[0]!;
    doc.receive(action(h,"companion.copy",1,{targetId:target.targetId,targetRevision:target.targetRevision,appliedRevision:begin.revision}));assert.equal(last(h,"companion.actionResult").reason,"NOT_READY");
    const chunk=last(h,"companion.transferChunk");doc.receive({...envelope(begin),kind:"companion.transferAck",transferId:begin.transferId,nextChunkIndex:1,byteLength:chunk.byteLength});
    doc.receive({...envelope(begin),kind:"companion.transferReady",transferId:begin.transferId,revision:begin.revision,byteLength:begin.byteLength,sha256:"0".repeat(64)});
    assert.equal(h.messages.filter(m=>m.kind==="companion.transferCommit").length,0);assert.equal(last(h,"companion.transferAbort").reason,"decode");assert.deepEqual(h.copied,[]);await h.runtime.close();
  });
  it("caps queued catch-up at 64 changes and allows one bounded latest-window restart",async()=>{
    const h=await captured();await h.observation("initial");register(h);
    for(let i=0;i<32;i++)await h.observation("row "+i,"row-"+i);
    assert.equal(h.messages.filter(m=>m.kind==="companion.bind").length,1);
    await h.observation("overflow","row-overflow");assert.equal(last(h,"companion.transferAbort").reason,"capacity");assert.equal(h.messages.filter(m=>m.kind==="companion.bind").length,2);
    for(let i=0;i<33;i++)await h.observation("later "+i,"later-"+i);
    assert.equal(h.messages.filter(m=>m.kind==="companion.bind").length,2);assert.equal(h.messages.filter(m=>m.kind==="companion.transferCommit").length,0);await h.runtime.close();
  });
  it("does not retain a history of removed target IDs across committed deltas",async()=>{
    const h=await captured();await h.observation("`one.txt`");const doc=register(h);completeTransfer(h,doc);
    const before=h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes;
    for(let i=0;i<20;i++){await h.observation("`one.txt` "+String(i).padStart(2,"0"));completeTransfer(h,doc);}
    const after=h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes;
    assert.ok(after-before<1000,"removed targets must not accumulate in projection bookkeeping");await h.runtime.close();
  });
  it("retains only the in-flight clipboard value charge across shutdown until actual settlement",async()=>{
    const h=await captured();await h.observation("`one.txt`");const doc=register(h);completeTransfer(h,doc);let settle:(()=>void)|undefined;h.setClipboard(()=>new Promise(resolve=>{settle=resolve;}));
    doc.receive(targetAction(h,"companion.copy",1));await h.runtime.close();assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,7);
    settle!();await flush();assert.equal(h.runtime.resources.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
  it("rejects malformed action replay even after a corrected payload arrives with the same consumed ID",async()=>{
    const h=setup(false),doc=register(h),message=action(h,"companion.escape",1);doc.receive({...message,extra:true});doc.receive(message);
    assert.deepEqual(h.writes,[]);assert.equal(last(h,"companion.actionResult").status,"duplicateExpired");await h.runtime.close();
  });
  it("keeps valid Review at 32 KiB and rejects oversize or NUL without consuming it",async()=>{
    const h=await captured();await h.observation("`$HOME/a`");const doc=register(h);completeTransfer(h,doc);doc.receive(targetAction(h,"companion.reviewOpen",1));const review=last(h,"companion.reviewOpened");
    const copy={...targetAction(h,"companion.reviewCopy",2),reviewId:review.reviewId,value:"x".repeat(32769)};doc.receive(copy);assert.equal(last(h,"companion.actionResult").status,"invalid");
    doc.receive({...copy,actionId:3,value:"a\0b"});assert.equal(h.copied.length,0);doc.receive({...copy,actionId:4,value:"x".repeat(32768)});await flush();assert.equal(h.copied[0]?.length,32768);await h.runtime.close();
  });
});

interface ViewCase {id:string;events:{type:string;actionId?:number;value?:string}[];expected:Record<string,unknown>}
const viewCases=(JSON.parse(readFileSync(resolve("test/fixtures/companion/copy-cases.json"),"utf8")) as {viewCases:ViewCase[]}).viewCases;
describe("selected host action viewCases through real protocol/model",()=>{
  for(const vector of viewCases.filter(v=>["V08","V09","V10","V11","V12","V13","V14","V16","V17","V18"].includes(v.id)))it(vector.id,async()=>{
    const h=await captured();await h.observation("`C:/a`\n\n`$HOME/a`");let doc=register(h);completeTransfer(h,doc);
    let id=0,review:Extract<CompanionHostMessage,{kind:"companion.reviewOpened"}>|undefined;
    let settle:(()=>void)|undefined;h.setClipboard(()=>new Promise(resolve=>{settle=resolve;}));
    const copy=(actionId:number)=>targetAction(h,"companion.copy",actionId,0);let open=targetAction(h,"companion.reviewOpen",1,1);
    const originalCopy=copy(1);
    if(vector.id==="V13")for(let i=1;i<=200;i++)doc.receive(action(h,"companion.toggleRaw",i));
    if(vector.id==="V17"){doc.receive(copy(1));h.copied.length=0;doc=register(h);completeTransfer(h,doc);open=targetAction(h,"companion.reviewOpen",1,1);}
    for(const event of vector.events){
      if(event.type==="copy"||event.type==="duplicate-copy")doc.receive({...originalCopy,actionId:event.actionId??++id});
      else if(event.type==="review-open"){doc.receive({...open,actionId:++id});review=last(h,"companion.reviewOpened");}
      else if(event.type==="review-copy")doc.receive({...open,kind:"companion.reviewCopy",actionId:event.actionId??++id,reviewId:review!.reviewId,value:"explicit edited"});
      else if(event.type==="feedback-deadline"){h.clock.advance(2000);h.clock.fireDue();}
      else if(event.type==="platform-settled"){settle!();await flush();}
      else if(event.type==="source-update-target")await h.observation("replacement");
      else if(event.type==="review-expired"){h.clock.advance(300000);h.clock.fireDue();}
      else if(event.type==="escape"||event.type==="duplicate-escape")doc.receive(action(h,"companion.escape",event.actionId!));
      else if(event.type==="capture-reset")h.setTarget({...fixtureTarget,generation:"new-generation"});
      else assert.fail("unhandled host trace "+event.type);
    }
    if("clipboardWrites" in vector.expected)assert.equal(h.copied.length,vector.expected.clipboardWrites);
    if("nativeEscapes" in vector.expected)assert.equal(h.writes.length,vector.expected.nativeEscapes);
    if("actionResult" in vector.expected)assert.equal(last(h,"companion.actionResult").status,vector.expected.actionResult);
    if("secondReviewResult" in vector.expected)assert.equal(last(h,"companion.actionResult").status,vector.expected.secondReviewResult);
    if("firstResult" in vector.expected)assert.ok(h.messages.some(m=>m.kind==="companion.actionResult"&&m.actionId===1&&m.status===vector.expected.firstResult));
    if("secondResult" in vector.expected)assert.equal(last(h,"companion.actionResult").status,vector.expected.secondResult);
    if("result" in vector.expected)assert.equal(last(h,"companion.actionResult").status,vector.expected.result);
    settle?.();await flush();await h.runtime.close();
  });
});
