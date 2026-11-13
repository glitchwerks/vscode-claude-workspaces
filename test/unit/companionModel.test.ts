import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CompanionCapture, CaptureSourceEvent, CaptureRetentionTicket } from "../../src/companion/companionCapture";
import type { CaptureBinding, ManagedCaptureIdentity, NormalizedObservation, CompanionSnapshot, CompanionTarget, CompanionChange } from "../../src/companion/companionTypes";
import { captureLimits, decodeNormalizedObservation } from "../../src/companion/companionTypes";
import { companionHarness, fixtureTarget, protocolHarness, nativeCaptureHarness } from "../support/companionHarness";
interface Context {binding:CaptureBinding;target:ManagedCaptureIdentity;captureEpoch:string}
interface Model {
  accept(binding:CaptureBinding,event:CaptureSourceEvent):"handled"|"capacity";
  refresh(sessionId:string):"ready"|"capacity";
  releaseSession(context:Context):boolean;
  snapshot(sessionId:string):CompanionSnapshot;
  readonly revision:number;
  resolveLiteral(sessionId:string,targetId:string,targetRevision:number):Readonly<{literal:string;action:"copy"|"review"}>|undefined;
  subscribe(listener:(batch:Readonly<{sessionId:string;revision:number;changes:readonly CompanionChange[];resyncRequired:boolean}>)=>void):()=>void;
  evictComplete(request:Readonly<{sessionId:string;bytes:number;sessionAvailable:number;globalAvailable:number}>):void;
  dispose():void;
}
interface Options {resources:CompanionCapture;currentContext:(sessionId:string)=>Context|undefined}
function createModel(options:Options):Model {
  const path=resolve("out/src/companion/companionModel.js");
  assert.ok(existsSync(path),"retained source model must provide literal authority");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const module=require(path) as {CompanionModel:new(options:Options)=>Model};
  return new module.CompanionModel(options);
}
const epoch="a".repeat(32), scope={kind:"main"} as const;
const row=(text:string,rowId="row-A"):NormalizedObservation=>({kind:"assistantRow",scope,rowId,blocks:[{kind:"text",index:0,text}]});
/** Real P1 reservations; only the filesystem and managed-target provider are fixtures. */
async function setup() {

  const h=companionHarness({evictComplete:request=>model?.evictComplete(request)});
  const prepared=await h.host.prepare(fixtureTarget.sessionId);assert.ok(prepared.ok);
  const binding=prepared.value;let context:Context|undefined={binding,target:fixtureTarget,captureEpoch:epoch};
  const model=createModel({resources:h.host,currentContext:()=>context});let id=0;
  const send=(observation:NormalizedObservation,extra:Partial<Extract<CaptureSourceEvent,{kind:"observation"}>>={})=>{
    const retention=h.host.reserveRetention(binding,captureLimits.sourceBytes+captureLimits.metadataBytes);assert.ok(retention);
    const event={kind:"observation" as const,captureEpoch:epoch,observationId:++id,ackSeq:id,observation,retention,...extra};
    model!.accept(binding,event);return event;
  };
  return {...h,model,binding,send,setContext:(value:Context|undefined)=>{context=value;},snapshot:()=>model!.snapshot(fixtureTarget.sessionId)};
}
function literal(h:Awaited<ReturnType<typeof setup>>,target:CompanionTarget) {return h.model.resolveLiteral(fixtureTarget.sessionId,target.targetId,target.targetRevision)?.literal;}
describe("retained companion model ownership",()=>{
  it("adopts the actual completed P1 ticket and resolves exact source-backed literals",async()=>{
    const h=await protocolHarness();await h.active();
    const model=createModel({resources:h.host,currentContext:()=>({binding:h.binding,target:fixtureTarget,captureEpoch:h.json("control.json").captureEpoch})});
    await h.observation(1,1,row("Before.\n\nRun: `printf café`\n\nAfter."));
    const event=h.events.find(e=>e.kind==="observation");assert.ok(event);const reserved=event.retention.reservedBytes;
    model.accept(h.binding,event);const snapshot=model.snapshot(fixtureTarget.sessionId),group=snapshot.groups[0]!;
    assert.equal(group.sourceText,"Before.\n\nRun: `printf café`\n\nAfter.");assert.ok(Object.isFrozen(group.nodes));
    assert.equal(model.resolveLiteral(fixtureTarget.sessionId,group.targets[0]!.targetId,group.targets[0]!.targetRevision)?.literal,"printf café");
    assert.ok(h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes<reserved);
    assert.equal(event.retention.reservedBytes,reserved);model.dispose();assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);h.protocol.stop();
  });
  it("does not double-release an adopted ticket but releases a distinct duplicate reservation",async()=>{
    const h=await setup(),event=h.send(row("`C:/exact path/file.txt`"));const usage=h.host.retentionUsage(fixtureTarget.sessionId);
    const revision=h.model.revision;h.model.accept(h.binding,event);assert.deepEqual(h.host.retentionUsage(fixtureTarget.sessionId),usage);
    h.send(event.observation);assert.deepEqual(h.host.retentionUsage(fixtureTarget.sessionId),usage);assert.equal(h.model.revision,revision);
    assert.equal(literal(h,h.snapshot().groups[0]!.targets[0]!),"C:/exact path/file.txt");h.model.dispose();
  });
  it("invalidates replaced source targets while unrelated groups leave them current",async()=>{
    const h=await setup();h.send(row("`one.txt`"));const target=h.snapshot().groups[0]!.targets[0]!;
    h.send(row("Unrelated.","row-B"));assert.equal(literal(h,target),"one.txt");
    h.send(row("`two.txt`"));assert.equal(literal(h,target),undefined);assert.equal(literal(h,h.snapshot().groups[0]!.targets[0]!),"two.txt");h.model.dispose();
  });
  it("invalidates authority immediately at a gap while retaining bounded reading context",async()=>{
    const h=await setup();h.send(row("`one.txt`"));const target=h.snapshot().groups[0]!.targets[0]!;
    h.model.accept(h.binding,{kind:"discontinuity",captureEpoch:epoch,ackSeq:2,mode:"unknown",reason:"OVERFLOW"});
    assert.equal(literal(h,target),undefined);assert.equal(h.snapshot().groups[0]!.sourceText,"`one.txt`");
    assert.equal(h.snapshot().historyBoundary,true);assert.deepEqual(h.snapshot().captureStatus,{state:"unavailable",reason:"GAP"});h.model.dispose();
  });
  it("checks current owner and managed identity again at literal resolution",async()=>{
    const h=await setup();h.send(row("`one.txt`"));const target=h.snapshot().groups[0]!.targets[0]!;
    h.setContext({binding:h.binding,target:{...fixtureTarget,generation:"replacement"},captureEpoch:epoch});
    assert.equal(literal(h,target),undefined);assert.equal(h.snapshot().captureStatus.reason,"IDENTITY_CHANGED");h.model.dispose();
  });
  it("releases ignored scope and stale-epoch tickets without manufacturing groups",async()=>{
    const h=await setup();h.send({kind:"unsupported",scope:{kind:"agent",agentId:"private"},reason:"AGENT_SCOPE"});
    h.send(row("stale"),{captureEpoch:"b".repeat(32)});assert.equal(h.snapshot().groups.length,0);
    assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);h.model.dispose();
  });
  it("keeps all explanation and assigns no single outcome to independently labelled blocks",async()=>{
    const h=await setup();h.send(row("Before\n\n`one.txt` and `two.txt`\n\nAfter"));
    const group=h.snapshot().groups[0]!;assert.equal(group.provenanceStatus,"none");assert.equal(group.statusLabel,null);
    assert.equal(group.targets.length,2);assert.ok(group.sourceText.endsWith("After"));h.model.dispose();
  });
  it("isolates throwing consumers and releases all retained capacity on disposal",async()=>{
    const h=await setup();h.model.subscribe(()=>{throw new Error("consumer failed");});
    h.send(row("`one.txt`"));assert.equal(literal(h,h.snapshot().groups[0]!.targets[0]!),"one.txt");
    h.model.dispose();assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
});

type Native=Record<string,unknown>;
type Next=((input:Native)=>Promise<unknown>)&{origin?:{plugin:string;tier:string}};
interface Sink {window():number;enqueue(value:NormalizedObservation,window:number):boolean;gap(reason:string):void;nativeStart(id:unknown,source:unknown):void;nativeEnd(id:unknown):void;imageGuard(id:string,safe?:boolean):boolean}
interface Publisher extends Sink {poll():Promise<void>;stop():void}
interface Observer {observe(event:string,input:Native,next:Next):Promise<unknown>}
interface C4Event {event:string;input?:Native;returned?:unknown;nextOrigin?:{plugin:string;tier:string};forToolUseId?:string;sourceEnvelope?:Native;nativeReturn?:unknown}
interface C4Case {id:string;events:C4Event[];expected:Native}
const core={plugin:"engine",tier:"core"};
const call={tool:"Bash",tool_use_id:"call-A",command:"printf source"};
const append=(content:unknown[],uuid="row-A"):Native=>({uuid,door:"response",origin:{kind:"model"},message:{type:"assistant",role:"assistant",content}});
const stored=(content:unknown[],uuid="row-A")=>({uuid,message:{type:"assistant",role:"assistant",content}});
const nextReturning=(value:unknown):Next=>Object.assign(async()=>value,{origin:core});
/** The committed native helper graph, actual file publisher and actual P1 decoder feed the model. */
async function liveModel() {
  const h=await nativeCaptureHarness();
  const load=async(name:string)=>import("data:text/javascript;base64,"+Buffer.from(readFileSync("media/attention/hooks/companion/"+name+".js","utf8")).toString("base64"));
  const publisher=(await load("filePublisher") as {createFilePublisher(driver:unknown,environment:unknown):Publisher}).createFilePublisher(h.driver,h.environment);
  const observer=(await load("observer") as {createCaptureObserver(sink:Sink):Observer}).createCaptureObserver(publisher);
  const model=createModel({resources:h.host,currentContext:()=>h.protocol.snapshot().state==="failed"?undefined:{binding:h.binding,target:fixtureTarget,captureEpoch:h.json("control.json").captureEpoch}});
  let consumed=0;
  const tick=async()=>{await publisher.poll();await h.protocol.poll();model.refresh(fixtureTarget.sessionId);while(consumed<h.events.length)model.accept(h.binding,h.events[consumed++]!);};
  const drain=async(n=20)=>{for(let i=0;i<n;i++)await tick();};
  const start=async()=>{publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await drain(4);assert.equal(h.protocol.snapshot().state,"active");};
  const close=()=>{publisher.stop();h.protocol.stop();model.dispose();assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);};
  return {...h,publisher,observer,model,tick,drain,start,close};
}
/** Play each original native call/return closure; other events execute while that call is pending. */
async function playNativeCase(h:Awaited<ReturnType<typeof liveModel>>,vector:C4Case) {
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
interface ProjectionVector {sourceCaseId:string;expectedGroups:{provenanceStatus:string;statusLabel:string|null;executedCopyAllowed:boolean;exitCodeNote:string|null}[];expectedEffect:null|{captureStatus?:{state:string;reason:string};historyBoundary?:boolean};literalCopyAssertions?:{requestedCopyValue?:string;executedCopyValue?:string|null}}
const nativeVectors=JSON.parse(readFileSync("test/fixtures/companion/capture-cases.json","utf8")) as {nativeC4:{cases:C4Case[]}};
const projectionVectors=JSON.parse(readFileSync("test/fixtures/companion/copy-cases.json","utf8")) as {c4ProjectionCases:ProjectionVector[]};
describe("native C4 through P1 retained model and closed projection",()=>{
  for(const vector of nativeVectors.nativeC4.cases)it(vector.id,async()=>{
    const h=await liveModel();await h.start();await playNativeCase(h,vector);
    const want=projectionVectors.c4ProjectionCases.find(v=>v.sourceCaseId===vector.id)!;
    const snapshot=h.model.snapshot(fixtureTarget.sessionId);
    const outcomes=snapshot.groups.filter(g=>want.expectedGroups[0]?.provenanceStatus==="none"?g.speaker==="assistant":!["none","notice","suggested","example","code"].includes(g.provenanceStatus));
    assert.deepEqual(outcomes.map(g=>({provenanceStatus:g.provenanceStatus,statusLabel:g.statusLabel})),want.expectedGroups.map(g=>({provenanceStatus:g.provenanceStatus,statusLabel:g.statusLabel})));
    for(let i=0;i<outcomes.length;i++) {
      const group=outcomes[i]!;const effective=group.targets.filter(t=>t.displayLabel==="Effective command");
      assert.equal(effective.length>0,want.expectedGroups[i]!.executedCopyAllowed);
      for(const target of group.targets)assert.equal(h.model.resolveLiteral(fixtureTarget.sessionId,target.targetId,target.targetRevision)?.literal,group.sourceText.slice(target.sourceStart,target.sourceEnd));
    }
    const targets=snapshot.groups.flatMap(g=>g.targets),value=(label:string)=>{const target=targets.find(t=>t.displayLabel===label);return target?h.model.resolveLiteral(fixtureTarget.sessionId,target.targetId,target.targetRevision)?.literal:null;};
    const literals=want.literalCopyAssertions;
    if(literals&&"requestedCopyValue" in literals)assert.equal(value("Requested command"),literals.requestedCopyValue);
    if(literals&&"executedCopyValue" in literals)assert.equal(value("Effective command"),literals.executedCopyValue);
    if(typeof vector.expected.capturedText==="string")assert.ok(snapshot.groups.some(g=>g.sourceText.includes(vector.expected.capturedText as string)));
    if(typeof vector.expected.reportedOutput==="string")assert.ok(snapshot.groups.some(g=>g.speaker==="tool"&&g.sourceText===vector.expected.reportedOutput));
    if(want.expectedEffect?.historyBoundary)assert.equal(snapshot.historyBoundary,true);
    if(want.expectedEffect?.captureStatus)assert.deepEqual(snapshot.captureStatus,want.expectedEffect.captureStatus);
    const serialized=JSON.stringify(snapshot);assert.ok(!serialized.includes("EXCLUDED"));assert.ok(!serialized.includes("PRE-STORAGE TEXT"));
    assert.ok(!/"(?:literal|executionConfirmed|exitCode|sourceShellFamily|executedCopyValue|runAgainEvidenceEligible|toolUseId|rowId|token|context|stdout|stderr|rawOutputPath)":/.test(serialized));
    h.close();
  });
});

const flags={interrupted:false,backgroundTaskId:null,backgroundedByUser:null,backgroundedByTurnAbort:null,backgroundedToDeliverMessage:null,backgroundEndsWithFinalResponse:null,backgroundWakesOwner:null,timedOutAfterMs:null,isImage:null,backgroundArtifactHint:false} as const;
const request=(command="printf shown",toolUseId="call-A",rowId="row-command"):NormalizedObservation=>({kind:"assistantRow",scope,rowId,blocks:[{kind:"bashRequest",index:0,toolUseId,command}]});
const enter=(command="printf shown",toolUseId="call-A"):NormalizedObservation=>({kind:"callEnter",scope,toolUseId,bindingValid:true,command});
const post=(command="printf effective",toolUseId="call-A"):NormalizedObservation=>({kind:"post",scope,toolUseId,responseState:"valid",command,flags});
const result=(toolUseId="call-A",text="Stored output"):NormalizedObservation=>({kind:"storedResult",scope,toolUseId,rowId:"result-"+toolUseId,index:0,isError:false,output:[{kind:"text",text}]});
function permutations<T>(values:T[]):T[][] {return values.length?values.flatMap((value,i)=>permutations(values.filter((_,n)=>n!==i)).map(tail=>[value,...tail])):[[]];}
function commandGroup(h:Awaited<ReturnType<typeof setup>>) {const group=h.snapshot().groups.find(g=>g.targets.some(t=>t.displayLabel==="Requested command"));assert.ok(group);return group;}
describe("retained model reconciliation boundaries",()=>{
  for(const order of permutations([0,1,2,3]))it("joins by identity in arrival order "+order.join(""),async()=>{
    const h=await setup(),events=[request(),enter(),post(),result()];for(const i of order)h.send(events[i]!);
    const group=commandGroup(h);assert.equal(group.provenanceStatus,"completed");
    assert.deepEqual(group.targets.map(t=>literal(h,t)),["printf shown","printf effective"]);h.model.dispose();
  });
  it("invalidates effective revisions on conflict without retargeting old controls",async()=>{
    const h=await setup();for(const e of [request(),enter(),post(),result()])h.send(e);
    const effective=commandGroup(h).targets.find(t=>t.displayLabel==="Effective command")!;
    h.send(post("different"));assert.equal(literal(h,effective),undefined);assert.equal(commandGroup(h).statusLabel,"Conflicting native evidence");
    assert.deepEqual(commandGroup(h).targets.map(t=>literal(h,t)),["printf shown"]);h.model.dispose();
  });
  it("preserves observed entry command separately when native request text differs",async()=>{
    const h=await setup();for(const e of [request("shown"),enter("entered"),post("effective"),result()])h.send(e);
    const group=commandGroup(h);assert.deepEqual(group.targets.map(t=>literal(h,t)),["shown","entered","effective"]);
    assert.deepEqual(group.targets.map(t=>t.displayLabel),["Requested command","Observed request","Effective command"]);h.model.dispose();
  });
  it("retains interleaved explanation and command blocks in source order",async()=>{
    const h=await setup();h.send({kind:"assistantRow",scope,rowId:"multi",blocks:[{kind:"text",index:0,text:"Before"},{kind:"bashRequest",index:1,toolUseId:"a",command:"first"},{kind:"text",index:2,text:"Between"},{kind:"bashRequest",index:3,toolUseId:"b",command:"second"},{kind:"text",index:4,text:"After"}]});
    assert.deepEqual(h.snapshot().groups.map(g=>g.sourceText),["Before","first","Between","second","After"]);h.model.dispose();
  });
  it("drops pending native joins at a gap, releasing their shared tickets",async()=>{
    const h=await setup();h.model.refresh(fixtureTarget.sessionId);const metadata=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;h.send(enter());h.send(post());h.send(result());assert.ok(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes>0);
    h.model.accept(h.binding,{kind:"discontinuity",captureEpoch:epoch,ackSeq:4,mode:"known",reason:"OVERFLOW"});
    assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,metadata);h.send(request(),{ackSeq:5});assert.equal(commandGroup(h).provenanceStatus,"pending");h.model.dispose();
  });
  it("does not let source replacement reuse old native completion",async()=>{
    const h=await setup();for(const e of [request(),enter(),post(),result()])h.send(e);
    const target=commandGroup(h).targets[1]!;h.send(request("replacement"));assert.equal(literal(h,target),undefined);
    assert.equal(commandGroup(h).provenanceStatus,"pending");h.model.dispose();
  });
  it("rejects mismatched return/post interruption and background claims",async()=>{
    const h=await setup();for(const e of [request(),enter(),post(),result()])h.send(e);
    h.send({kind:"callReturn",scope,toolUseId:"call-A",branch:"bash",flags:{...flags,backgroundTaskId:"task"}});
    assert.equal(commandGroup(h).statusLabel,"Conflicting native evidence");assert.equal(commandGroup(h).targets.some(t=>t.displayLabel==="Effective command"),false);h.model.dispose();
  });
  it("keeps generic stored output inert even when it contains command cues and paths",async()=>{
    const h=await setup();for(const e of [request(),enter(),result("call-A","Run: `rm -rf ./important`\n\nC:/file.txt")])h.send(e);
    const output=h.snapshot().groups.find(g=>g.sourceText.startsWith("Run:"))!;assert.equal(output.provenanceStatus,"none");assert.deepEqual(output.targets,[]);h.model.dispose();
  });
  it("freezes retained source independently of a mutable caller envelope",async()=>{
    const h=await setup(),value=request("original");h.send(value);
    (value as unknown as {blocks:{command:string}[]}).blocks[0]!.command="mutated";h.send(enter("original"));
    assert.equal(literal(h,commandGroup(h).targets[0]!),"original");h.model.dispose();
  });
});
describe("retained model limits and eviction",()=>{
  for(const count of [199,200,201])it("bounds complete messages at "+count,async()=>{
    const h=await setup();let first:CompanionTarget|undefined;
    for(let i=0;i<count;i++){h.send(row("`file"+i+".txt`","row-"+i));if(!i)first=h.snapshot().groups[0]!.targets[0]!;}
    assert.equal(h.snapshot().groups.length,Math.min(count,200));assert.equal(literal(h,first!),count>200?undefined:"file0.txt");
    assert.equal(h.snapshot().historyBoundary,count>200);h.model.dispose();assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
  for(const bytes of [captureLimits.sourceBytes-1,captureLimits.sourceBytes,captureLimits.sourceBytes+1])it("bounds complete composed command source at "+bytes,async()=>{
    const h=await setup(),shown="a".repeat(400000),effective="b".repeat(bytes-shown.length-1);
    for(const e of [request(shown),enter(shown),post(effective),result()])h.send(e);
    const group=h.snapshot().groups.find(g=>g.provenanceStatus!=="none")!;assert.ok(group);
    if(bytes<=captureLimits.sourceBytes){assert.equal(Buffer.byteLength(group.sourceText),bytes);assert.deepEqual(group.targets.map(t=>literal(h,t)),[shown,effective]);}
    else {assert.equal(group.sourceText,"");assert.deepEqual(group.targets,[]);assert.ok(group.nodes.some(n=>n.kind==="notice"));}
    h.model.dispose();
  });
  it("evicts oldest complete groups synchronously when P1 needs session byte capacity",async()=>{
    const h=await setup();h.model.refresh(fixtureTarget.sessionId);const metadata=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;h.send(row("`old.txt`"));const old=h.snapshot().groups[0]!.targets[0]!;
    const reservation=h.host.reserveRetention(h.binding,captureLimits.sessionBytes-metadata);assert.ok(reservation);
    assert.equal(literal(h,old),undefined);assert.equal(h.snapshot().historyBoundary,true);
    assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes,captureLimits.sessionBytes);h.host.releaseRetention(reservation);h.model.dispose();
  });
  for(const field of ["modelRevision","nextId","order"])it("detaches authority without wrapping exhausted "+field,async()=>{
    const h=await setup();h.send(row("`old.txt`"));const target=h.snapshot().groups[0]!.targets[0]!;
    (h.model as unknown as Record<string,unknown>)[field]=Number.MAX_SAFE_INTEGER;
    assert.doesNotThrow(()=>h.send(row("`new.txt`","new")));assert.equal(literal(h,target),undefined);
    assert.ok(Number.isSafeInteger(h.model.revision));h.model.dispose();assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
});

function countNodes(nodes:CompanionSnapshot["groups"][number]["nodes"]):number {return nodes.reduce((n,node)=>n+1+("children" in node?countNodes(node.children):0),0);}
describe("retained model actual count and byte ceilings",()=>{
  for(const n of [1999,2000,2001])it("admits targets or complete fallback at "+n,async()=>{
    const h=await setup(),text=Array.from({length:n},(_,i)=>"`f"+i+".txt`").join(" ");h.send(row(text));const group=h.snapshot().groups[0]!;
    assert.equal(group.sourceText,text);assert.equal(group.targets.length,n<=2000?n:0);if(n>2000)assert.ok(group.nodes.some(node=>node.kind==="notice"));h.model.dispose();
  });
  for(const n of [19999,20000,20001])it("funds actual render node counts at "+n,async()=>{
    const h=await setup(),base="z "+"*x* ".repeat(6666).trim(),text=base+(n===20000?" end":n===20001?"\nend":"");h.send(row(text));const group=h.snapshot().groups[0]!;
    assert.equal(group.sourceText,text);assert.equal(countNodes(group.nodes),n<=20000?n:2);assert.equal(group.targets.length,0);h.model.dispose();
  });
  it("evicts complete old source when aggregate targets would exceed 2000",async()=>{
    const h=await setup();h.send(row(Array.from({length:1000},(_,i)=>"`a"+i+".txt`").join(" "),"old"));const old=h.snapshot().groups[0]!.targets[0]!;
    h.send(row(Array.from({length:1001},(_,i)=>"`b"+i+".txt`").join(" "),"new"));assert.equal(literal(h,old),undefined);assert.equal(h.snapshot().groups.length,1);assert.equal(h.snapshot().groups[0]!.targets.length,1001);h.model.dispose();
  });
  it("evicts complete old source when aggregate nodes would exceed 20000",async()=>{
    const h=await setup();h.send(row("old","old"));h.send(row("z "+"*x* ".repeat(6666).trim(),"new"));assert.equal(h.snapshot().groups.length,1);assert.equal(countNodes(h.snapshot().groups[0]!.nodes),19999);h.model.dispose();
  });
  for(const extra of [-1,0,1])it("uses exact P1 session capacity at limit "+extra,async()=>{
    const h=await setup();h.send(row("`old.txt`"));const target=h.snapshot().groups[0]!.targets[0]!,used=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;
    const ticket=h.host.reserveRetention(h.binding,captureLimits.sessionBytes-used+extra);assert.ok(ticket);assert.equal(literal(h,target),extra===1?undefined:"old.txt");
    assert.ok(h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes<=captureLimits.sessionBytes);h.host.releaseRetention(ticket);h.model.dispose();
  });
  for(const pending of [199,200,201])it("bounds pending evidence at "+pending,async()=>{
    const h=await setup();h.model.refresh(fixtureTarget.sessionId);const metadata=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;for(let i=0;i<pending;i++)h.send(post("unmatched","call-"+i));assert.equal(h.snapshot().groups.length,0);
    if(pending===201){assert.equal(h.snapshot().captureStatus.reason,"CAPACITY");assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,metadata);}h.model.dispose();
  });
  it("retains NUL context but never gives it literal Copy authority",async()=>{
    const h=await setup();h.send(row("Before\0 `bad\0.txt` after `good.txt`"));assert.ok(h.snapshot().groups[0]!.sourceText.includes("\0"));assert.deepEqual(h.snapshot().groups[0]!.targets.map(t=>literal(h,t)),["good.txt"]);h.model.dispose();
  });
  it("never re-admits an evicted observation replay with a fresh ticket",async()=>{
    const h=await setup();h.model.refresh(fixtureTarget.sessionId);const metadata=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes,event=h.send(row("`old.txt`"));const reservation=h.host.reserveRetention(h.binding,captureLimits.sessionBytes-metadata);assert.ok(reservation);h.host.releaseRetention(reservation);
    h.send(event.observation,{observationId:event.observationId,ackSeq:event.ackSeq});assert.equal(h.snapshot().groups.length,0);assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,metadata);h.model.dispose();
  });
  it("invalidates authority on contradictory replay of the last admitted observation ID",async()=>{
    const h=await setup(),event=h.send(row("`old.txt`")),target=h.snapshot().groups[0]!.targets[0]!;
    h.send(row("`changed.txt`"),{observationId:event.observationId,ackSeq:event.ackSeq});assert.equal(literal(h,target),undefined);assert.equal(h.snapshot().captureStatus.reason,"GAP");h.model.dispose();
  });
  it("does not let caller mutation corrupt duplicate source tracking",async()=>{
    const h=await setup(),value=request("original");h.send(value);const target=commandGroup(h).targets[0]!;
    (value as unknown as {blocks:{command:string}[]}).blocks[0]!.command="mutated";h.send(request("original"));assert.equal(literal(h,target),"original");h.model.dispose();
  });
});
/** Five managed owners share the actual P1 global ledger and one model eviction order. */
async function multiSession() {
  const targets=new Map<string,ManagedCaptureIdentity>(),contexts=new Map<string,Context>();
  const h=companionHarness({currentTarget:id=>targets.get(id),evictComplete:request=>model?.evictComplete(request)});
  for(let i=0;i<5;i++){const target={...fixtureTarget,sessionId:"session-"+i};targets.set(target.sessionId,target);const value=await h.host.prepare(target.sessionId);assert.ok(value.ok);contexts.set(target.sessionId,{binding:value.value,target,captureEpoch:epoch});}
  const model=createModel({resources:h.host,currentContext:id=>contexts.get(id)});let sequence=0;
  const send=(id:string,text:string)=>{const context=contexts.get(id)!;const retention=h.host.reserveRetention(context.binding,100000);assert.ok(retention);model!.accept(context.binding,{kind:"observation",captureEpoch:epoch,ackSeq:++sequence,observationId:sequence,observation:row(text,id),retention});};
  return {...h,model,contexts,send};
}
describe("retained model cross-session ledger",()=>{
  for(const extra of [-1,0,1])it("evicts globally oldest complete source at 32MiB "+extra,async()=>{
    const h=await multiSession(),held=[];
    for(let i=0;i<4;i++){const ticket=h.host.reserveRetention(h.contexts.get("session-"+i)!.binding,6*1024*1024);assert.ok(ticket);held.push(ticket);}
    h.send("session-1","oldest");h.send("session-0","newer");
    const used=h.host.retentionUsage("session-4").globalBytes,ticket=h.host.reserveRetention(h.contexts.get("session-4")!.binding,captureLimits.globalBytes-used+extra);assert.ok(ticket);held.push(ticket);
    assert.equal(h.model.snapshot("session-1").groups.length,extra===1?0:1);assert.equal(h.model.snapshot("session-0").groups.length,1);
    assert.ok(h.host.retentionUsage("session-4").globalBytes<=captureLimits.globalBytes);for(const value of held)h.host.releaseRetention(value);h.model.dispose();assert.equal(h.host.retentionUsage("session-0").globalBytes,0);
  });
});

describe("retained model failure and change delivery",()=>{
  it("publishes ordered snapshots or bounded exact changes for interleaved source and gaps",async()=>{
    const h=await setup();let visible:CompanionSnapshot["groups"]=[];let history=false;
    h.model.subscribe(batch=>{
      assert.ok(batch.changes.length<=64);
      if(batch.resyncRequired){const snapshot=h.snapshot();visible=snapshot.groups;history=snapshot.historyBoundary;return;}
      const next=[...visible];for(const change of batch.changes){
        if(change.kind==="removeGroup"){const i=next.findIndex(g=>g.groupId===change.groupId);if(i>=0)next.splice(i,1);}
        if(change.kind==="upsertGroup"){const i=next.findIndex(g=>g.groupId===change.group.groupId);if(i>=0)next[i]=change.group;else next.push(change.group);}
        if(change.kind==="historyBoundary")history=change.value;
      }visible=next;
    });
    h.send({kind:"assistantRow",scope,rowId:"multi",blocks:[{kind:"text",index:0,text:"Before"},{kind:"bashRequest",index:1,toolUseId:"call-A",command:"printf shown"},{kind:"text",index:2,text:"After"}]});
    assert.deepEqual(visible,h.snapshot().groups);
    for(const e of [enter(),post(),result()]){h.send(e);assert.deepEqual(visible,h.snapshot().groups);}
    h.model.accept(h.binding,{kind:"discontinuity",captureEpoch:epoch,ackSeq:8,mode:"known",reason:"OVERFLOW"});assert.deepEqual(visible,h.snapshot().groups);assert.equal(history,true);h.model.dispose();
  });
  it("bounds a single large source notification and advances one mutation revision",async()=>{
    const h=await setup();const revisions:number[]=[];h.model.subscribe(batch=>{assert.ok(batch.changes.length<=64);revisions.push(batch.revision);});
    h.send({kind:"assistantRow",scope,rowId:"many",blocks:Array.from({length:65},(_,index)=>({kind:"text" as const,index,text:"block"+index}))});
    assert.equal(h.snapshot().groups.length,65);assert.equal(new Set(revisions).size,1);h.model.dispose();
  });
  it("adopts once and releases every reservation when derived content cannot fit",async()=>{
    const h=await setup();h.model.refresh(fixtureTarget.sessionId);const metadata=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes,pinned=h.host.reserveRetention(h.binding,captureLimits.sessionBytes-captureLimits.sourceBytes-captureLimits.metadataBytes-metadata);assert.ok(pinned);
    h.send(row("x".repeat(captureLimits.sourceBytes)));assert.equal(h.snapshot().groups.length,0);assert.equal(h.snapshot().captureStatus.reason,"CAPACITY");
    assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes,pinned.reservedBytes+metadata);h.host.releaseRetention(pinned);h.model.dispose();
  });
  it("rejects unknown or already released reservations without retaining authority",async()=>{
    const h=await setup();h.model.accept(h.binding,{kind:"observation",captureEpoch:epoch,observationId:1,ackSeq:1,observation:row("`fake.txt`"),retention:{reservedBytes:10000}});
    assert.equal(h.snapshot().groups.length,0);assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);h.model.dispose();
  });
  it("keeps all accepted rows funded after a synchronous consumer disposes the model",async()=>{
    const h=await setup();h.model.subscribe(()=>h.model.dispose());h.send(row("`one.txt`"));assert.equal(h.snapshot().groups.length,0);assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
  it("uses a new managed owner/epoch after replacement without joining old evidence",async()=>{
    const h=await setup();for(const e of [request(),enter(),post(),result()])h.send(e);const target=commandGroup(h).targets[1]!;
    const nextTarget={...fixtureTarget,generation:"new-generation"};h.setTarget(nextTarget);const prepared=await h.host.prepare(fixtureTarget.sessionId);assert.ok(prepared.ok);
    const nextEpoch="b".repeat(32);h.setContext({binding:prepared.value,target:nextTarget,captureEpoch:nextEpoch});h.model.refresh(fixtureTarget.sessionId);assert.equal(literal(h,target),undefined);
    const ticket=h.host.reserveRetention(prepared.value,10000);assert.ok(ticket);h.model.accept(prepared.value,{kind:"observation",captureEpoch:nextEpoch,ackSeq:1,observationId:1,retention:ticket,observation:request("new", "call-A")});
    const group=h.snapshot().groups.find(g=>g.sourceText==="new");assert.ok(group);assert.equal(group.provenanceStatus,"pending");assert.equal(literal(h,group.targets[0]!),"new");h.model.dispose();
  });
});

describe("retained model source admission edges",()=>{
  it("treats duplicate gap boundaries idempotently and rejects pre-gap acknowledgements",async()=>{
    const h=await setup();h.send(row("old"));const gap={kind:"discontinuity" as const,captureEpoch:epoch,ackSeq:100,mode:"known" as const,reason:"OVERFLOW"};
    h.model.accept(h.binding,gap);const revision=h.model.revision;h.model.accept(h.binding,gap);assert.equal(h.model.revision,revision);
    h.send(row("late-old", "late"),{ackSeq:50,observationId:2});assert.deepEqual(h.snapshot().groups.map(g=>g.sourceText),["old"]);h.model.dispose();
  });
  it("releases an incoming completed ticket if the owner provider throws",async()=>{
    const h=await companionHarness(),prepared=await h.host.prepare(fixtureTarget.sessionId);assert.ok(prepared.ok);
    const model=createModel({resources:h.host,currentContext:()=>{throw new Error("owner unavailable");}}),ticket=h.host.reserveRetention(prepared.value,10000);assert.ok(ticket);
    assert.doesNotThrow(()=>model.accept(prepared.value,{kind:"observation",captureEpoch:epoch,observationId:1,ackSeq:1,retention:ticket,observation:row("ignored")}));
    assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);model.dispose();
  });
  for(const n of [captureLimits.sourceBytes-1,captureLimits.sourceBytes,captureLimits.sourceBytes+1])it("retains complete assistant source bytes "+n,async()=>{
    const h=await setup(),text="é".repeat(Math.floor(n/2))+(n%2?"x":"");h.send(row(text));assert.equal(Buffer.byteLength(h.snapshot().groups[0]!.sourceText),n<=captureLimits.sourceBytes?n:0);if(n>captureLimits.sourceBytes)assert.ok(h.snapshot().groups[0]!.nodes.some(node=>node.kind==="notice"));h.model.dispose();
  });
  for(const n of [captureLimits.outputBytes-1,captureLimits.outputBytes,captureLimits.outputBytes+1])it("retains tool output or complete unavailable placeholder at "+n,async()=>{
    const h=await setup();h.send(request());h.send(result("call-A","x".repeat(n)));const output=h.snapshot().groups.find(g=>g.provenanceStatus==="none")!;assert.ok(output);
    assert.equal(output.sourceText.length,n<=captureLimits.outputBytes?n:0);assert.deepEqual(output.targets,[]);if(n>captureLimits.outputBytes)assert.ok(output.nodes.some(node=>node.kind==="notice"));h.model.dispose();
  });
  it("projects the accepted error group descriptors and none of the rejected fixture shapes",async()=>{
    const fixture=JSON.parse(readFileSync("test/fixtures/companion/copy-cases.json","utf8")) as {groupExamples:{id:string;group:Record<string,unknown>;expected:string}[]};
    const h=await setup();for(const event of [request(),enter(),{kind:"failure" as const,scope,toolUseId:"call-A",command:"printf shown",isInterrupt:false}])h.send(event);const group=commandGroup(h);
    for(const sample of fixture.groupExamples.filter(e=>e.expected.startsWith("accept"))) {
      assert.deepEqual(Object.keys(group).sort(),Object.keys(sample.group).sort());assert.equal(group.provenanceStatus,sample.group.provenanceStatus);assert.equal(group.statusLabel,sample.group.statusLabel);
      assert.deepEqual(Object.keys(group.targets[0]!).sort(),Object.keys((sample.group.targets as Record<string,unknown>[])[0]!).sort());
    }
    assert.equal(group.statusLabel,"Tool reported error; execution not confirmed");assert.equal(Object.hasOwn(group,"exitCode"),false);h.model.dispose();
  });
});

describe("retained model funded session lifecycle",()=>{
  it("does not allocate bookkeeping for empty snapshots or ignored-only traffic",async()=>{
    const h=await setup();assert.equal(h.snapshot().groups.length,0);assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
    h.send({kind:"unsupported",scope:{kind:"agent",agentId:"private"},reason:"AGENT_SCOPE"});h.send(row("stale"),{captureEpoch:"b".repeat(32)});assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);h.model.dispose();
  });
  it("funds anti-replay metadata after source eviction and releases it on guarded teardown",async()=>{
    const h=await setup();h.model.refresh(fixtureTarget.sessionId);const metadata=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;assert.ok(metadata>0&&metadata<4096);
    h.send(row("old"));const ticket=h.host.reserveRetention(h.binding,captureLimits.sessionBytes-metadata);assert.ok(ticket);h.host.releaseRetention(ticket);
    assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes,metadata);assert.equal(h.snapshot().groups.length,0);
    assert.equal(h.model.releaseSession({binding:h.binding,target:fixtureTarget,captureEpoch:epoch}),true);assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);h.model.dispose();
  });
  it("reports metadata capacity failure without retaining an unfunded session entry",async()=>{
    const h=await setup(),pinned=h.host.reserveRetention(h.binding,captureLimits.sessionBytes-1),incoming=h.host.reserveRetention(h.binding,1);assert.ok(pinned&&incoming);
    assert.equal(h.model.accept(h.binding,{kind:"observation",captureEpoch:epoch,ackSeq:1,observationId:1,retention:incoming,observation:row("new")}),"capacity");
    assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes,pinned.reservedBytes);assert.equal(h.snapshot().groups.length,0);h.host.releaseRetention(pinned);h.model.dispose();
  });
  it("rejects teardown from a stale managed owner after replacement",async()=>{
    const h=await setup();h.send(row("old"));const old={binding:h.binding,target:fixtureTarget,captureEpoch:epoch};
    const target={...fixtureTarget,generation:"replacement"};h.setTarget(target);const prepared=await h.host.prepare(target.sessionId);assert.ok(prepared.ok);
    const current={binding:prepared.value,target,captureEpoch:"b".repeat(32)};h.setContext(current);h.model.refresh(target.sessionId);
    assert.equal(h.model.releaseSession(old),false);assert.ok(h.host.retentionUsage(target.sessionId).globalBytes>0);
    assert.equal(h.model.releaseSession(current),true);assert.equal(h.host.retentionUsage(target.sessionId).globalBytes,0);h.model.dispose();
  });
  it("releases source and bookkeeping for many sequential distinct managed sessions",async()=>{
    const targets=new Map<string,ManagedCaptureIdentity>(),contexts=new Map<string,Context>();const h=companionHarness({currentTarget:id=>targets.get(id)});
    const model=createModel({resources:h.host,currentContext:id=>contexts.get(id)});
    for(let i=0;i<50;i++){
      const target={...fixtureTarget,sessionId:"sequential-"+i};targets.set(target.sessionId,target);const prepared=await h.host.prepare(target.sessionId);assert.ok(prepared.ok);
      const context={binding:prepared.value,target,captureEpoch:epoch};contexts.set(target.sessionId,context);const ticket=h.host.reserveRetention(context.binding,10000);assert.ok(ticket);
      model.accept(context.binding,{kind:"observation",captureEpoch:epoch,ackSeq:1,observationId:1,retention:ticket,observation:row("source")});assert.ok(h.host.retentionUsage(target.sessionId).globalBytes>0);
      contexts.delete(target.sessionId);assert.equal(model.releaseSession(context),true);assert.equal(h.host.retentionUsage(target.sessionId).globalBytes,0);await h.host.revoke(context.binding);targets.delete(target.sessionId);
    }model.dispose();
  });
  it("never resurrects session state after whole-model disposal",async()=>{
    const h=await setup();h.send(row("old"));h.model.dispose();h.model.refresh(fixtureTarget.sessionId);assert.equal(h.snapshot().captureStatus.state,"retired");assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
});

type ModelBatch=Parameters<Parameters<Model["subscribe"]>[0]>[0];
/** Apply the advertised model handoff, using a fresh snapshot only when explicitly requested. */
function projectionConsumer(model:Model,sessionId=fixtureTarget.sessionId) {
  let projection=model.snapshot(sessionId);const revisions:number[]=[];
  return {revisions,snapshot:()=>projection,accept:(batch:ModelBatch)=>{
    if(batch.sessionId!==sessionId)return;revisions.push(batch.revision);
    if(batch.resyncRequired){projection=model.snapshot(sessionId);return;}
    const groups=[...projection.groups];let historyBoundary=projection.historyBoundary,captureStatus=projection.captureStatus;
    for(const change of batch.changes){
      if(change.kind==="upsertGroup"){const index=groups.findIndex(g=>g.groupId===change.group.groupId);if(index<0)groups.push(change.group);else groups[index]=change.group;}
      else if(change.kind==="removeGroup"){const index=groups.findIndex(g=>g.groupId===change.groupId);if(index>=0)groups.splice(index,1);}
      else if(change.kind==="historyBoundary")historyBoundary=change.value;else captureStatus=change.value;
    }projection={groups,historyBoundary,captureStatus};
  }};
}
describe("model fix1 ordered reentrant notifications",()=>{
  it("I1 keeps both subscribers ordered when the first callback reserves real P1 capacity and evicts its source",async()=>{
    const h=await setup();h.model.refresh(fixtureTarget.sessionId);const metadata=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;
    const first=projectionConsumer(h.model),second=projectionConsumer(h.model);let pin:CaptureRetentionTicket|undefined,target:CompanionTarget|undefined,once=false;
    h.model.subscribe(batch=>{first.accept(batch);if(!once){once=true;target=batch.changes.find(c=>c.kind==="upsertGroup")?.group.targets[0];pin=h.host.reserveRetention(h.binding,captureLimits.sessionBytes-metadata);}});
    h.model.subscribe(second.accept);h.send(row("`evicted.txt`"));
    assert.ok(pin&&target);for(const consumer of [first,second]){
      assert.ok(consumer.revisions.every((revision,i)=>!i||revision>consumer.revisions[i-1]!));
      assert.deepEqual(consumer.snapshot(),h.snapshot());assert.deepEqual(consumer.snapshot().groups,[]);
    }
    assert.equal(literal(h,target),undefined);assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes,captureLimits.sessionBytes);
    h.host.releaseRetention(pin);h.model.dispose();assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
  it("I1 coalesces nested admissions without recursive callbacks and isolates a throwing first subscriber",async()=>{
    const h=await setup(),first=projectionConsumer(h.model),second=projectionConsumer(h.model);let once=false,depth=0,maximumDepth=0;
    h.model.subscribe(batch=>{depth++;maximumDepth=Math.max(maximumDepth,depth);try{first.accept(batch);if(!once){once=true;h.send(row("second","second"));h.send(row("third","third"));throw new Error("consumer failed after admission");}}finally{depth--;}});
    h.model.subscribe(second.accept);h.send(row("first","first"));
    assert.equal(maximumDepth,1);assert.equal(h.model.revision,3);
    for(const consumer of [first,second]){assert.ok(consumer.revisions.every((revision,i)=>!i||revision>consumer.revisions[i-1]!));assert.deepEqual(consumer.snapshot(),h.snapshot());}
    assert.deepEqual(h.snapshot().groups.map(g=>g.sourceText),["first","second","third"]);h.model.dispose();assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
  it("I1 releases deferred teardown metadata only after every subscriber observes the removal",async()=>{
    const h=await setup();const first=projectionConsumer(h.model),second=projectionConsumer(h.model);let once=false,released=false,heldDuringTeardown=0;
    h.model.subscribe(batch=>{first.accept(batch);if(!once){once=true;h.setContext(undefined);released=h.model.releaseSession({binding:h.binding,target:fixtureTarget,captureEpoch:epoch});heldDuringTeardown=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;}});
    h.model.subscribe(second.accept);h.send(row("source"));assert.equal(released,true);assert.ok(heldDuringTeardown>0);
    for(const consumer of [first,second]){assert.ok(consumer.revisions.every((revision,i)=>!i||revision>consumer.revisions[i-1]!));assert.deepEqual(consumer.snapshot().groups,[]);}
    assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);h.model.dispose();
  });
});
/** Flatten renderable text and placeholders in their actual group/node reading order. */
function readingOrder(nodes:CompanionSnapshot["groups"][number]["nodes"]):string[] {
  return nodes.flatMap(node=>"children" in node?readingOrder(node.children):node.kind==="notice"?["[unavailable]"]:node.kind==="text"||node.kind==="code"?[node.text]:[]);
}
describe("model fix1 unsupported source positions",()=>{
  const cases=[
    {name:"text command unsupported text",tokens:["Before","command:A","notice","After"]},
    {name:"leading and interleaved notices with multiple commands",tokens:["notice","command:A","notice","command:B","notice","After"]},
    {name:"adjacent notices on both sides of a command",tokens:["Before","notice","notice","command:A","notice","notice","After"]},
    {name:"safe adjacent text and notice groups",tokens:["notice","notice","Before","notice","After"]},
    {name:"notices between successive commands",tokens:["Before","command:A","notice","command:B","notice"]}
  ];
  for(const vector of cases)it("I2 preserves "+vector.name+" through accepted normalized input",async()=>{
    const h=await setup();const observation={kind:"assistantRow",scope,rowId:"ordered-notices",blocks:vector.tokens.map((token,index)=>token==="notice"?{kind:"unsupported",index}:token.startsWith("command:")?{kind:"bashRequest",index,toolUseId:token,command:"echo "+token.slice(8)}:{kind:"text",index,text:token})};
    const decoded=decodeNormalizedObservation(JSON.stringify(observation));assert.ok(decoded.ok);h.send(decoded.value);
    assert.deepEqual(h.snapshot().groups.flatMap(group=>readingOrder(group.nodes)),vector.tokens.map(token=>token==="notice"?"[unavailable]":token.startsWith("command:")?"echo "+token.slice(8):token));
    assert.equal(h.snapshot().groups.flatMap(group=>group.targets).length,vector.tokens.filter(token=>token.startsWith("command:")).length);
    if(vector.name==="safe adjacent text and notice groups")assert.equal(h.snapshot().groups.length,3);
    h.model.dispose();assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
});

describe("model fix1 reentrant lifecycle parity",()=>{
  for(const retireAgain of [false,true])it("I1 funds replacement "+(retireAgain?"and superseding teardown":"until its latest resync"),async()=>{
    const h=await setup(),first=projectionConsumer(h.model),second=projectionConsumer(h.model);let once=false,initialBytes=0,heldBytes=0;
    h.model.subscribe(batch=>{first.accept(batch);if(!once){
      once=true;initialBytes=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;h.setContext(undefined);
      h.model.releaseSession({binding:h.binding,target:fixtureTarget,captureEpoch:epoch});
      const replacement={binding:h.binding,target:fixtureTarget,captureEpoch:"b".repeat(32)};h.setContext(replacement);
      h.send(row("new","row"),{captureEpoch:replacement.captureEpoch,observationId:1,ackSeq:1});
      if(retireAgain){h.setContext(undefined);h.model.releaseSession(replacement);}
      heldBytes=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;
    }});
    h.model.subscribe(second.accept);h.send(row("old","row"));
    assert.ok(heldBytes>0);assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes,retireAgain?0:initialBytes);
    for(const consumer of [first,second]){
      assert.ok(consumer.revisions.every((revision,i)=>!i||revision>consumer.revisions[i-1]!));
      assert.deepEqual(consumer.snapshot(),retireAgain?{groups:[],historyBoundary:false,captureStatus:{state:"retired",reason:"CHANNEL_RETIRED"}}:h.snapshot());
    }
    assert.deepEqual(h.snapshot().groups.map(g=>g.sourceText),retireAgain?[]:["new"]);h.model.dispose();assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
  it("I1 disposes pending teardown hints without another callback or stranded ticket",async()=>{
    const h=await setup();let calls=0,held=0;
    h.model.subscribe(()=>{calls++;h.setContext(undefined);h.model.releaseSession({binding:h.binding,target:fixtureTarget,captureEpoch:epoch});held=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;h.model.dispose();});
    h.model.subscribe(()=>{calls++;});h.send(row("source"));assert.ok(held>0);assert.equal(calls,1);assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);assert.equal(h.snapshot().captureStatus.state,"retired");
  });
  it("I1 resynchronizes every affected session without reversing either consumer's revisions",async()=>{
    const h=await multiSession(),first=[projectionConsumer(h.model,"session-0"),projectionConsumer(h.model,"session-1")],second=[projectionConsumer(h.model,"session-0"),projectionConsumer(h.model,"session-1")];let once=false;
    h.model.subscribe(batch=>{for(const consumer of first)consumer.accept(batch);if(!once){once=true;h.send("session-1","nested");}});
    h.model.subscribe(batch=>{for(const consumer of second)consumer.accept(batch);});h.send("session-0","outer");
    for(const consumers of [first,second])for(const [index,consumer] of consumers.entries()){
      assert.ok(consumer.revisions.every((revision,i)=>!i||revision>consumer.revisions[i-1]!));assert.deepEqual(consumer.snapshot(),h.model.snapshot("session-"+index));
    }h.model.dispose();assert.equal(h.host.retentionUsage("session-0").globalBytes,0);
  });
});

describe("model fix2 deferred terminal meaning",()=>{
  for(const reentrant of [false,true])it("N1 gives both subscribers retired CHANNEL_RETIRED after "+(reentrant?"callback":"ordinary")+" teardown",async()=>{
    const h=await setup(),first=projectionConsumer(h.model),second=projectionConsumer(h.model);let once=false,released=false,target:CompanionTarget|undefined,heldDuringHint=0;
    h.model.subscribe(batch=>{
      first.accept(batch);target??=batch.changes.find(change=>change.kind==="upsertGroup")?.group.targets[0];
      if(reentrant&&!once){once=true;h.setContext(undefined);released=h.model.releaseSession({binding:h.binding,target:fixtureTarget,captureEpoch:epoch});}
    });
    h.model.subscribe(batch=>{if(batch.resyncRequired)heldDuringHint=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;second.accept(batch);});
    h.send(row("`retired.txt`"));
    if(!reentrant){h.setContext(undefined);released=h.model.releaseSession({binding:h.binding,target:fixtureTarget,captureEpoch:epoch});}
    assert.equal(released,true);assert.ok(target);if(reentrant)assert.ok(heldDuringHint>0);
    const terminal={groups:[],historyBoundary:false,captureStatus:{state:"retired",reason:"CHANNEL_RETIRED"}};
    for(const consumer of [first,second]){
      assert.deepEqual(consumer.snapshot(),terminal);
      assert.ok(consumer.revisions.every((revision,i)=>!i||revision>consumer.revisions[i-1]!));
    }
    assert.equal(literal(h,target),undefined);assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
    // The funded terminal cut is not a permanent tombstone or a change to absent-session reads.
    assert.deepEqual(h.snapshot().captureStatus,{state:"starting",reason:"INITIALIZING"});h.model.dispose();
  });
  it("N1 makes a live replacement supersede the funded retirement cut",async()=>{
    const h=await setup(),first=projectionConsumer(h.model),second=projectionConsumer(h.model);let once=false,terminalDuringCallback:CompanionSnapshot|undefined,held=0;
    h.model.subscribe(batch=>{first.accept(batch);if(!once){
      once=true;h.setContext(undefined);h.model.releaseSession({binding:h.binding,target:fixtureTarget,captureEpoch:epoch});
      terminalDuringCallback=h.snapshot();held=h.host.retentionUsage(fixtureTarget.sessionId).sessionBytes;
      const current={binding:h.binding,target:fixtureTarget,captureEpoch:"b".repeat(32)};h.setContext(current);
      h.send(row("replacement"),{captureEpoch:current.captureEpoch,observationId:1,ackSeq:1});
    }});
    h.model.subscribe(second.accept);h.send(row("old"));
    assert.ok(held>0);assert.deepEqual(terminalDuringCallback,{groups:[],historyBoundary:false,captureStatus:{state:"retired",reason:"CHANNEL_RETIRED"}});
    for(const consumer of [first,second]){assert.deepEqual(consumer.snapshot().captureStatus,{state:"active",reason:null});assert.deepEqual(consumer.snapshot().groups.map(group=>group.sourceText),["replacement"]);}
    h.model.dispose();assert.equal(h.host.retentionUsage(fixtureTarget.sessionId).globalBytes,0);
  });
});
