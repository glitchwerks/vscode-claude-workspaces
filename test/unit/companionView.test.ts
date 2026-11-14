import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import type { CompanionSnapshot, CompanionTarget, CompanionChange, NormalizedObservation } from "../../src/companion/companionTypes";
import type { CompanionHostMessage, CompanionWebviewMessage } from "../../src/panel/companionProtocol";
import { decodeCompanionWebviewMessage } from "../../src/panel/companionProtocol";
import { CompanionModel } from "../../src/companion/companionModel";
import { captureLimits } from "../../src/companion/companionTypes";
import { CompanionRuntime } from "../../src/companion/companionRuntime";
import type { CaptureBinding } from "../../src/companion/companionTypes";
import type { CaptureProtocol } from "../../src/companion/companionCapture";
import type { LaunchSpec } from "../../src/launch/launchPlanner";
import type { ManagedSessionSnapshot } from "../../src/sessions/sessionTypes";
import { companionHarness, CaptureFixtureClock, CaptureFixtureFileSystem, fixtureTarget, nativeCaptureHarness } from "../support/companionHarness";

type Wrapper={type:"companion";payload:CompanionWebviewMessage};
interface Options {
  viewId?:string;documentId:string;postMessage:(message:Wrapper)=>void;
  onModeChange?:(mode:"companion"|"raw",sessionId:string|undefined)=>void;
  openLink?:(href:string)=>void;
  schedule?:(callback:()=>void,delay:number)=>()=>void;
  sha256?:(text:string)=>Promise<string>;
}
interface View {
  start():void;receive(payload:unknown):Promise<void>;dispose():void;
  setMode(mode:"companion"|"raw"):void;forgetSession(sessionId:string):void;
}
const viewId="1".repeat(32),projectionId="1".padStart(32,"0"),documentId="11111111-1111-4111-8111-111111111111";
const identity={v:1 as const,viewId,projectionId,sessionId:fixtureTarget.sessionId,generation:fixtureTarget.generation};
const bind={...identity,kind:"companion.bind" as const,documentId,claudeSessionId:fixtureTarget.claudeSessionId,modelRevision:0};
const empty:CompanionSnapshot={groups:[],historyBoundary:false,captureStatus:{state:"active",reason:null}};
function setup(options:Partial<Options>={}) {
  const path=resolve("out/src/panel/webview/companion/view.js");
  assert.ok(existsSync(path),"companion component must expose a closed atomic browser receiver");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const loaded=require(path) as {CompanionView:new(root:HTMLElement,options:Options)=>View};
  const dom=new JSDOM("<!doctype html><button id='outside'>Editor</button><main></main>"),root=dom.window.document.querySelector("main")!;
  const messages:Wrapper[]=[],modes:{mode:string;sessionId:string|undefined}[]=[],links:string[]=[],clock=new CaptureFixtureClock();
  const view=new loaded.CompanionView(root,{viewId,documentId,postMessage:message=>{assert.deepEqual(Object.keys(message),["type","payload"]);assert.equal(message.type,"companion");assert.ok(decodeCompanionWebviewMessage(message.payload).ok);messages.push(message);},
    onModeChange:(mode,sessionId)=>modes.push({mode,sessionId}),openLink:href=>links.push(href),schedule:clock.schedule,
    sha256:async text=>createHash("sha256").update(text).digest("hex"),...options});
  const buttons=()=>[...root.querySelectorAll<HTMLButtonElement>("button")];
  const button=(name:string)=>{const found=buttons().find(b=>b.getAttribute("aria-label")===name||b.textContent===name);assert.ok(found,"button "+name);return found;};
  const payloads=()=>messages.map(m=>m.payload);
  return {dom,root,view,messages,modes,links,clock,button,buttons,payloads};
}
let transferCounter=0;
async function transfer(h:ReturnType<typeof setup>,value:CompanionSnapshot|{changes:readonly CompanionChange[]},revision=1,options:{base?:number;commit?:boolean;identity?:typeof identity;parts?:string[]}={}) {
  const envelope=options.identity??identity,text=JSON.stringify(value),transferId=(++transferCounter).toString(16).padStart(32,"0");
  const cut={transferId,revision,byteLength:Buffer.byteLength(text),sha256:createHash("sha256").update(text).digest("hex")};
  const parts=options.parts??[text];
  const begin={...envelope,kind:"companion.transferBegin" as const,...cut,chunkCount:parts.length,...(options.base===undefined?{mode:"snapshot" as const,baseRevision:null}:{mode:"delta" as const,baseRevision:options.base})};
  await h.view.receive(begin);
  const chunk=(index:number,data=parts[index]!)=>({...envelope,kind:"companion.transferChunk" as const,transferId,chunkIndex:index,data,byteLength:Buffer.byteLength(data)});
  for(let i=0;i<parts.length;i++)await h.view.receive(chunk(i));
  const end={...envelope,kind:"companion.transferEnd" as const,...cut},commit={...envelope,kind:"companion.transferCommit" as const,transferId,revision};
  await h.view.receive(end);if(options.commit!==false)await h.view.receive(commit);
  return {begin,chunk,end,commit};
}
async function sourceModel(text:string) {
  const h=companionHarness(),prepared=await h.host.prepare(fixtureTarget.sessionId);assert.ok(prepared.ok);
  const binding=prepared.value,epoch="a".repeat(32);
  const model=new CompanionModel({resources:h.host,currentContext:()=>({binding,target:fixtureTarget,captureEpoch:epoch})});let seq=0;
  const send=(observation:NormalizedObservation)=>{
    const retention=h.host.reserveRetention(binding,captureLimits.sourceBytes+captureLimits.metadataBytes);assert.ok(retention);
    model.accept(binding,{kind:"observation",captureEpoch:epoch,ackSeq:++seq,observationId:seq,observation,retention});
  };
  send({kind:"assistantRow",scope:{kind:"main"},rowId:"row-A",blocks:[{kind:"text",index:0,text}]});
  return {model,send,snapshot:()=>model.snapshot(fixtureTarget.sessionId),dispose:()=>model.dispose()};
}
function actionButton(h:ReturnType<typeof setup>,target:CompanionTarget) {const button=[...h.root.querySelectorAll<HTMLButtonElement>("[data-target-id]")].find(b=>b.dataset.targetId===target.targetId);assert.ok(button,"source-adjacent action for "+target.targetId);return button;}

describe("companion component bootstrap and atomic reading window",()=>{
  it("uses the supplied legacy UUID and host lease; missing bootstrap manufactures nothing",()=>{
    const h=setup();assert.deepEqual(h.messages,[]);h.view.start();h.view.start();
    assert.deepEqual(h.payloads(),[{v:1,kind:"companion.ready",viewId,documentId}]);h.view.dispose();
    const missing=setup({viewId:undefined});missing.view.start();assert.deepEqual(missing.messages,[]);missing.view.dispose();
  });
  it("keeps partial content invisible and renders full safe context only after commit",async()=>{
    const source="# Context\n\nBefore **bold** C:/repo/a.txt after.\n\n1. First\n2. Second\n\nRun:\n```sh\nprintf 'café'\n```\n\n<script>alert(1)</script>\n\n[docs](https://example.com) ![remote](https://example.com/x.png)\n\nEnd";
    const m=await sourceModel(source),h=setup();h.view.start();await h.view.receive(bind);
    const t=await transfer(h,m.snapshot(),1,{commit:false});assert.equal(h.root.querySelector("h1"),null);
    assert.ok(h.payloads().some(p=>p.kind==="companion.transferReady"));await h.view.receive(t.commit);
    assert.equal(h.root.querySelector("h1")?.textContent,"Context");assert.equal(h.root.querySelectorAll("li").length,2);
    assert.ok(h.root.textContent!.indexOf("Before")<h.root.textContent!.indexOf("printf"));assert.ok(h.root.textContent!.includes("End"));
    assert.equal(h.root.querySelector("script,img"),null);assert.ok(h.root.textContent!.includes("<script>"));
    h.root.querySelector<HTMLAnchorElement>("a")!.click();assert.deepEqual(h.links,["https://example.com"]);
    const target=m.snapshot().groups[0]!.targets.find(t=>t.action==="copy")!;actionButton(h,target).click();const message=h.payloads().at(-1)!;
    assert.equal(message.kind,"companion.copy");assert.ok(!("value"in message));
    assert.deepEqual(message,{...identity,kind:"companion.copy",actionId:1,appliedRevision:1,targetId:target.targetId,targetRevision:target.targetRevision});
    m.dispose();h.view.dispose();
  });
  it("rejects mismatched document binds and keeps native actions independent of hydration",async()=>{
    const h=setup();h.view.start();await h.view.receive({...bind,documentId:"22222222-2222-4222-8222-222222222222"});
    h.button("Send Escape to selected CLI").click();assert.equal(h.payloads().length,1);
    await h.view.receive(bind);h.button("Send Escape to selected CLI").click();h.button("Respond in terminal").click();
    assert.deepEqual(h.payloads().slice(1),[{...identity,kind:"companion.escape",actionId:1},{...identity,kind:"companion.toggleRaw",actionId:2}]);h.view.dispose();
  });
});

describe("companion complete raw-source fallback presentation",()=>{
  for(const {name,source,display} of [
    {name:"LF-only Markdown table",source:"| Column | Value |\n| --- | --- |\n| a | b |",display:"| Column | Value |\n| --- | --- |\n| a | b |"},
    {name:"CR-separated indented text",source:"first\r  indented\rthird",display:"first\n  indented\nthird"},
    {name:"CRLF-only Markdown table",source:"| Column | Value |\r\n| --- | --- |\r\n| a | b |",display:"| Column | Value |\r\n| --- | --- |\r\n| a | b |"},
    {name:"mixed line endings",source:"first\r\n  second\rthird\n    fourth",display:"first\r\n  second\nthird\n    fourth"},
    {name:"long repeated CR",source:"line\r".repeat(4096)+"end",display:"line\n".repeat(4096)+"end"}
  ])it("preserves readable bounded raw fallback for "+name,async()=>{
    const m=await sourceModel(source),h=setup();
    try{
      const style=h.dom.window.document.createElement("style");
      style.textContent=readFileSync("src/panel/webview/styles.css","utf8")+"\n"+readFileSync("src/panel/webview/companion/styles.css","utf8");
      h.dom.window.document.head.append(style);
      h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());
      const retained=m.snapshot().groups[0]!,projected=(h.view as unknown as {snapshot:CompanionSnapshot}).snapshot.groups[0]!;
      for(const group of [retained,projected]){
        assert.ok(group.nodes.some(n=>n.kind==="notice"&&n.reason==="UNSUPPORTED_CONTENT"));
        assert.deepEqual(group.targets,[]);
        assert.equal(group.sourceText,source,"display conversion leaves source authority untouched");
        const raw=group.nodes[0]!;assert.equal(raw.kind,"text");if(raw.kind==="text")assert.equal(raw.text,source,"projected and retained text keep original line endings");
      }
      const fallback=h.root.querySelector(".companion-group > span[data-node-id]");
      assert.ok(fallback,"complete raw source is visible in its top-level fallback element");
      assert.equal(fallback.textContent,display,"only lone CR uses its newline-equivalent display representation");
      assert.equal(fallback.childNodes.length,1,"long raw lines remain a single bounded text node");
      assert.equal(fallback.firstChild?.nodeType,h.dom.window.Node.TEXT_NODE);
      assert.equal(h.dom.window.getComputedStyle(fallback).whiteSpace,"pre-wrap","fallback preserves displayed line breaks and indentation while wrapping");
    }finally{h.view.dispose();m.dispose();h.dom.window.close();}
  });
});

async function reviewFixture(candidate="$HOME/a") {
  const m=await sourceModel("Before `$HOME/a` after"),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());
  const target=m.snapshot().groups[0]!.targets[0]!,invoker=actionButton(h,target);invoker.focus();invoker.click();
  const request=h.payloads().at(-1)!;assert.equal(request.kind,"companion.reviewOpen");assert.ok("actionId"in request);
  const opened={...identity,kind:"companion.reviewOpened" as const,actionId:request.actionId,reviewId:"e".repeat(32),targetId:target.targetId,targetRevision:target.targetRevision,value:candidate,byteLength:Buffer.byteLength(candidate)};
  await h.view.receive(opened);return {m,h,target,invoker,opened};
}
describe("companion local editable Review and correlated feedback",()=>{
  it("edits only the host candidate and emits a closed ReviewCopy without native submission",async()=>{
    const {h,m,target,opened}=await reviewFixture(),textarea=h.root.querySelector("textarea")!;assert.ok(textarea,"explicit editable Review");
    assert.equal(textarea.value,"$HOME/a");assert.equal(h.dom.window.document.activeElement,textarea);
    textarea.value=" C:/literal edited.txt \n";textarea.dispatchEvent(new h.dom.window.Event("input",{bubbles:true}));h.button("Copy reviewed value").click();
    assert.deepEqual(h.payloads().at(-1),{...identity,kind:"companion.reviewCopy",actionId:2,appliedRevision:1,reviewId:opened.reviewId,targetId:target.targetId,targetRevision:target.targetRevision,value:textarea.value});
    assert.equal(h.payloads().filter(p=>p.kind==="companion.escape"||p.kind==="companion.toggleRaw").length,0);
    await h.view.receive({...identity,kind:"companion.actionResult",actionId:2,status:"busy",reason:"COPY_PENDING",targetId:target.targetId,reviewId:opened.reviewId});
    assert.ok(h.root.querySelector("textarea"));h.button("Copy reviewed value").click();const retry=h.payloads().at(-1)!;assert.equal("actionId"in retry&&retry.actionId,3);
    await h.view.receive({...identity,kind:"companion.actionResult",actionId:3,status:"ok",reason:null,targetId:target.targetId,reviewId:opened.reviewId});
    assert.equal(h.root.querySelector("textarea"),null);assert.equal(h.dom.window.document.activeElement,actionButton(h,target));h.view.dispose();m.dispose();
  });
  it("handles local Escape once and restores focus without touching editor Escape",async()=>{
    const {h,m,invoker}=await reviewFixture(),textarea=h.root.querySelector("textarea")!;assert.ok(textarea);
    let bubbled=0;h.dom.window.document.addEventListener("keydown",()=>bubbled++);
    textarea.dispatchEvent(new h.dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
    assert.equal(h.root.querySelector("textarea"),null);assert.equal(h.dom.window.document.activeElement,invoker);assert.equal(bubbled,0);
    assert.equal(h.payloads().at(-1)?.kind,"companion.reviewCancel");h.dom.window.document.getElementById("outside")!.dispatchEvent(new h.dom.window.KeyboardEvent("keydown",{key:"Escape",bubbles:true}));assert.equal(bubbled,1);
    h.view.dispose();m.dispose();
  });
  for(const reason of ["sourceChanged","evicted","reset","closed","expired"] as const)it("closes a stale Review on "+reason,async()=>{
    const {h,m,opened}=await reviewFixture();assert.ok(h.root.querySelector("textarea"));await h.view.receive({...identity,kind:"companion.reviewInvalidated",reviewId:opened.reviewId,reason});
    assert.equal(h.root.querySelector("textarea"),null);assert.ok(h.root.textContent!.includes("Review"));h.view.dispose();m.dispose();
  });
  it("rejects unsolicited Review responses, prevents duplicate reopening and closes on rebind",async()=>{
    const {h,m,opened}=await reviewFixture();h.button("Cancel").click();await h.view.receive(opened);assert.equal(h.root.querySelector("textarea"),null);
    await h.view.receive({...opened,actionId:999,reviewId:"d".repeat(32)});assert.equal(h.root.querySelector("textarea"),null);
    h.view.dispose();m.dispose();const second=await reviewFixture();await second.h.view.receive({...bind,projectionId:"8".repeat(32)});assert.equal(second.h.root.querySelector("textarea"),null);second.h.view.dispose();second.m.dispose();
  });
  it("enforces UTF8/scalar/NUL Review limits and traps Tab locally",async()=>{
    const {h,m}=await reviewFixture(),textarea=h.root.querySelector("textarea")!;assert.ok(textarea);
    for(const value of ["a".repeat(32769),"😀".repeat(8193),"\0","\ud800"]){textarea.value=value;textarea.dispatchEvent(new h.dom.window.Event("input"));assert.equal(h.button("Copy reviewed value").disabled,true);}
    textarea.value="a".repeat(32768);textarea.dispatchEvent(new h.dom.window.Event("input"));assert.equal(h.button("Copy reviewed value").disabled,false);
    h.button("Cancel").focus();h.button("Cancel").dispatchEvent(new h.dom.window.KeyboardEvent("keydown",{key:"Tab",bubbles:true,cancelable:true}));assert.equal(h.dom.window.document.activeElement,textarea);
    h.view.dispose();m.dispose();
  });
  it("keeps uncertain and late clipboard feedback attached to its original action",async()=>{
    const m=await sourceModel("`a.txt` and `b.txt`"),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());const [a,b]=m.snapshot().groups[0]!.targets;
    actionButton(h,a!).click();await h.view.receive({...identity,kind:"companion.actionResult",actionId:1,targetId:a!.targetId,status:"uncertain",reason:null});
    actionButton(h,b!).click();await h.view.receive({...identity,kind:"companion.actionResult",actionId:2,targetId:b!.targetId,status:"busy",reason:"COPY_PENDING"});
    await h.view.receive({...identity,kind:"companion.actionResult",actionId:1,targetId:a!.targetId,status:"settledAfterUncertain",reason:null});
    assert.ok(actionButton(h,a!).parentElement!.textContent!.includes("completed after"));assert.ok(actionButton(h,b!).parentElement!.textContent!.includes("pending"));
    assert.ok(h.root.querySelector('[aria-live="polite"]')!.textContent!.includes(a!.accessibleLabel));h.view.dispose();m.dispose();
  });
});

describe("companion closed transfer lifecycle",()=>{
  it("acks identical duplicates without appending and aborts conflicting or future chunks",async()=>{
    const h=setup();h.view.start();await h.view.receive(bind);const text=JSON.stringify(empty),parts=[text.slice(0,20),text.slice(20)];
    const t=await transfer(h,empty,1,{parts,commit:false});const ack=h.payloads().filter(p=>p.kind==="companion.transferAck").at(-1)!;
    await h.view.receive(t.chunk(0));assert.deepEqual(h.payloads().at(-1),ack);
    await h.view.receive(t.commit);assert.equal(h.payloads().filter(p=>p.kind==="companion.resync").length,0);
    const u=await transfer(h,empty,2,{commit:false});await h.view.receive(u.chunk(0,"different"));
    assert.equal(h.payloads().at(-1)?.kind,"companion.resync");h.view.dispose();
  });
  for(const fault of ["hash","end","future","wrong-base","schema","oversize","unicode","unknown-key","early-commit"] as const)it("preserves the previous committed window on "+fault,async()=>{
    const m=await sourceModel("Before `one.txt` after"),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());
    const previous=h.root.querySelector(".companion-reading")!.textContent;
    const text=JSON.stringify(empty),id="f".repeat(32),hash=createHash("sha256").update(text).digest("hex");
    const begin={...identity,kind:"companion.transferBegin",transferId:id,revision:2,byteLength:Buffer.byteLength(text),sha256:hash,mode:"snapshot",baseRevision:null,chunkCount:1};
    if(fault==="wrong-base"){await h.view.receive({...begin,mode:"delta",baseRevision:99,revision:100});}
    else if(fault==="oversize")await h.view.receive({...begin,byteLength:8388609});
    else {
      const content=fault==="schema"?JSON.stringify({...empty,extra:true}):text;
      const cut={...begin,byteLength:Buffer.byteLength(content),sha256:fault==="hash"?"0".repeat(64):createHash("sha256").update(content).digest("hex")};
      await h.view.receive(cut);
      if(fault==="early-commit")await h.view.receive({...identity,kind:"companion.transferCommit",transferId:id,revision:2});
      else {
        await h.view.receive({...identity,kind:"companion.transferChunk",transferId:id,chunkIndex:fault==="future"?1:0,data:fault==="unicode"?"\ud800":content,byteLength:Buffer.byteLength(fault==="unicode"?"\ud800":content),...(fault==="unknown-key"?{extra:true}:{})});
        await h.view.receive({...identity,kind:"companion.transferEnd",transferId:id,revision:2,byteLength:cut.byteLength,sha256:fault==="end"?"0".repeat(64):cut.sha256});
      }
    }
    assert.equal(h.root.querySelector(".companion-reading")!.textContent,previous);assert.equal(h.payloads().filter(p=>p.kind==="companion.resync").length,1);
    h.view.dispose();m.dispose();
  });
  it("applies ordered deltas only at the exact base and keeps unrelated targets current",async()=>{
    const m=await sourceModel("`one.txt`"),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());
    const target=m.snapshot().groups[0]!.targets[0]!;await transfer(h,{changes:[{kind:"historyBoundary",value:true}]},2,{base:1});
    actionButton(h,target).click();const p=h.payloads().at(-1)!;assert.equal(p.kind,"companion.copy");assert.equal("appliedRevision"in p&&p.appliedRevision,2);
    await transfer(h,{changes:[{kind:"removeGroup",groupId:target.groupId}]},3,{base:2});assert.equal(h.root.querySelectorAll("[data-target-id]").length,0);
    h.view.dispose();m.dispose();
  });
  it("times out lost chunks and stops automatic resync after one failed retry",async()=>{
    const h=setup();h.view.start();await h.view.receive(bind);const text=JSON.stringify(empty),cut={transferId:"a".repeat(32),revision:1,byteLength:Buffer.byteLength(text),sha256:createHash("sha256").update(text).digest("hex"),chunkCount:1,mode:"snapshot",baseRevision:null};
    await h.view.receive({...identity,kind:"companion.transferBegin",...cut});h.clock.advance(2000);h.clock.fireDue();assert.equal(h.payloads().filter(p=>p.kind==="companion.resync").length,1);
    const next={...identity,projectionId:"3".repeat(32)};await h.view.receive({...bind,...next});await h.view.receive({...next,kind:"companion.transferBegin",...cut});
    h.clock.advance(2000);h.clock.fireDue();assert.equal(h.payloads().filter(p=>p.kind==="companion.resync").length,1);assert.ok(h.root.textContent!.includes("unavailable"));
    h.button("Send Escape to selected CLI").click();assert.equal(h.payloads().at(-1)?.kind,"companion.escape");h.view.dispose();
  });
  it("discards a late hash result after rebinding or disposal",async()=>{
    let finish:((value:string)=>void)|undefined;const h=setup({sha256:()=>new Promise(resolveHash=>{finish=resolveHash;})});h.view.start();await h.view.receive(bind);
    const pending=transfer(h,empty,1,{commit:false});await new Promise<void>(resolveTick=>setImmediate(resolveTick));assert.ok(finish);
    await h.view.receive({...bind,projectionId:"4".repeat(32)});finish!(createHash("sha256").update(JSON.stringify(empty)).digest("hex"));await pending;
    assert.equal(h.payloads().filter(p=>p.kind==="companion.transferReady").length,0);h.view.dispose();assert.equal(h.clock.pendingDelays().length,0);
  });
  it("bounds unresolved hashing across repeated projection replacement",async()=>{
    const finishes:((hash:string)=>void)[]=[],h=setup({sha256:()=>new Promise(resolveHash=>finishes.push(resolveHash))});h.view.start();await h.view.receive(bind);
    const first=transfer(h,empty,1,{commit:false});await flush();const next={...identity,projectionId:"9".repeat(32)};await h.view.receive({...bind,...next});const second=transfer(h,empty,1,{identity:next,commit:false});await flush();
    const calls=finishes.length;for(const finish of finishes)finish(createHash("sha256").update(JSON.stringify(empty)).digest("hex"));await Promise.all([first,second]);assert.equal(calls,1,"only one unresolved digest may retain serialized source");h.view.dispose();
  });
});

type PathVector={id:string;input?:string;inputPattern?:{prefix:string;repeat:string;count:number};expected:{action:string;sourceStart:number;sourceEnd:number;literal:string}[]};
const copyFixture=JSON.parse(readFileSync("test/fixtures/companion/copy-cases.json","utf8")) as {cases:PathVector[];c4ProjectionCases:{sourceCaseId:string;expectedGroups:{provenanceStatus:string;statusLabel:string|null;executedCopyAllowed:boolean}[];expectedEffect:{historyBoundary?:boolean;captureStatus?:unknown}|null}[]};
describe("approved PC29 through retained model, protocol and source-position DOM",()=>{
  for(const vector of copyFixture.cases)it(vector.id,async()=>{
    const source=vector.input??vector.inputPattern!.prefix+vector.inputPattern!.repeat.repeat(vector.inputPattern!.count),m=await sourceModel(source),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());
    const targets=m.snapshot().groups.flatMap(g=>g.targets).filter(t=>t.kind==="path");assert.equal(targets.length,vector.expected.length);
    for(const [i,target] of targets.entries()){
      const expected=vector.expected[i]!,button=actionButton(h,target);assert.equal(button.textContent,expected.action==="copy"?"Copy":"Review");
      const owner=button.closest<HTMLElement>("[data-node-id]")!;assert.ok(owner,"path action is adjacent to its actual source node");assert.ok(owner.textContent!.length>button.textContent!.length);
      assert.ok(button.getAttribute("aria-label")!.startsWith(target.accessibleLabel+": "));
      button.click();const p=h.payloads().at(-1)!;assert.equal(p.kind,expected.action==="copy"?"companion.copy":"companion.reviewOpen");assert.ok("targetId"in p);assert.equal(p.targetId,target.targetId);assert.equal(p.targetRevision,target.targetRevision);assert.ok(!("value"in p));
      assert.equal(m.model.resolveLiteral(fixtureTarget.sessionId,target.targetId,target.targetRevision)?.literal,expected.literal);
    }
    assert.equal(h.payloads().filter(p=>p.kind==="companion.escape"||p.kind==="companion.toggleRaw").length,0);h.view.dispose();m.dispose();
  });
});

type Native=Record<string,unknown>;
type Next=((input:Native)=>Promise<unknown>)&{origin?:{plugin:string;tier:string}};
interface Sink {window():number;enqueue(value:NormalizedObservation,window:number):boolean;gap(reason:string):void;nativeStart(id:unknown,source:unknown):void;nativeEnd(id:unknown):void;imageGuard(id:string,safe?:boolean):boolean}
interface Publisher extends Sink {poll():Promise<void>;stop():void}
interface Observer {observe(event:string,input:Native,next:Next):Promise<unknown>}
interface C4Event {event:string;input?:Native;returned?:unknown;nextOrigin?:{plugin:string;tier:string};forToolUseId?:string;sourceEnvelope?:Native;nativeReturn?:unknown}
interface C4Case {id:string;events:C4Event[]}
/** Execute the committed producer/helper graph through real P1 admission and retained model. */
async function nativeModel() {
  const h=await nativeCaptureHarness();
  const load=async(name:string)=>import("data:text/javascript;base64,"+Buffer.from(readFileSync("media/attention/hooks/companion/"+name+".js","utf8")).toString("base64"));
  const publisher=(await load("filePublisher") as {createFilePublisher(driver:unknown,environment:unknown):Publisher}).createFilePublisher(h.driver,h.environment);
  const observer=(await load("observer") as {createCaptureObserver(sink:Sink):Observer}).createCaptureObserver(publisher);
  const model=new CompanionModel({resources:h.host,currentContext:()=>h.protocol.snapshot().state==="failed"?undefined:{binding:h.binding,target:fixtureTarget,captureEpoch:h.json("control.json").captureEpoch}});let consumed=0;
  const drain=async(n=20)=>{for(let i=0;i<n;i++){await publisher.poll();await h.protocol.poll();model.refresh(fixtureTarget.sessionId);while(consumed<h.events.length)model.accept(h.binding,h.events[consumed++]!);}};
  publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await drain(4);assert.equal(h.protocol.snapshot().state,"active");
  return {...h,publisher,observer,model,drain,dispose:()=>{publisher.stop();h.protocol.stop();model.dispose();}};
}
async function playNative(h:Awaited<ReturnType<typeof nativeModel>>,vector:C4Case) {
  const pending:{id:unknown;finish:(value:unknown)=>void;promise:Promise<unknown>}[]=[];
  for(const event of vector.events){
    if(event.event==="tool.call:return") {const call=pending.find(c=>c.id===event.forToolUseId)!;assert.ok(call);pending.splice(pending.indexOf(call),1);call.finish(event.returned);assert.equal(await call.promise,event.returned);await h.drain();continue;}
    if(event.event==="observer-contract"){
      const core={plugin:"engine",tier:"core"};
      for(let i=0;i<70;i++)await h.observer.observe("session.append",{uuid:"row-A",door:"response",origin:{kind:"model"},message:{type:"assistant",role:"assistant",content:[]}},Object.assign(async()=>({uuid:"row-A",message:{type:"assistant",role:"assistant",content:[{type:"text",text:"queued"}]}}),{origin:core}));
      assert.equal(await h.observer.observe("tool.call",{tool:"Bash",tool_use_id:"call-A",command:"printf source"},Object.assign(async()=>event.nativeReturn,{origin:core})),event.nativeReturn);await h.drain();continue;
    }
    const input=structuredClone(event.input??{}),before=structuredClone(input);
    if(event.event==="tool.call"){
      let finish!:(value:unknown)=>void;const promise=h.observer.observe(event.event,input,Object.assign(async()=>new Promise(resolveReturn=>{finish=resolveReturn;}),{origin:event.nextOrigin}));pending.push({id:input.tool_use_id,finish,promise});
    } else if(event.sourceEnvelope){
      let finish!:(value:unknown)=>void;const promise=h.observer.observe(event.event,input,async()=>new Promise(resolveReturn=>{finish=resolveReturn;}));h.publisher.nativeStart(fixtureTarget.claudeSessionId,"compact");await h.drain(8);finish(event.returned);assert.equal(await promise,event.returned);
    } else assert.equal(await h.observer.observe(event.event,input,async()=>event.returned),event.returned);
    assert.deepEqual(input,before);await h.drain();
  }
  for(const call of pending){const result={};call.finish(result);assert.equal(await call.promise,result);}await h.drain();
}
const nativeCases=JSON.parse(readFileSync("test/fixtures/companion/capture-cases.json","utf8")) as {nativeC4:{cases:C4Case[]}};
describe("all 32 original C4 producer cases through protocol and companion DOM",()=>{
  for(const vector of nativeCases.nativeC4.cases)it(vector.id,async()=>{
    const model=await nativeModel();await playNative(model,vector);const snapshot=model.model.snapshot(fixtureTarget.sessionId),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,snapshot);
    const want=copyFixture.c4ProjectionCases.find(v=>v.sourceCaseId===vector.id)!;
    const outcomes=snapshot.groups.filter(g=>want.expectedGroups[0]?.provenanceStatus==="none"?g.speaker==="assistant":!["none","notice","suggested","example","code"].includes(g.provenanceStatus));
    assert.deepEqual(outcomes.map(g=>[g.provenanceStatus,g.statusLabel]),want.expectedGroups.map(g=>[g.provenanceStatus,g.statusLabel]));
    for(const [i,group] of outcomes.entries()){
      const section=[...h.root.querySelectorAll<HTMLElement>("[data-group-id]")].find(e=>e.dataset.groupId===group.groupId)!;assert.ok(section);
      if(group.statusLabel)assert.ok(section.textContent!.includes(group.statusLabel));
      assert.equal(section.textContent!.includes("Exit code unavailable"),group.provenanceStatus==="completed");
      const effective=group.targets.filter(t=>t.displayLabel==="Effective command");assert.equal(effective.length>0,want.expectedGroups[i]!.executedCopyAllowed);
      for(const target of group.targets){const button=actionButton(h,target);button.click();const p=h.payloads().at(-1)!;assert.ok("targetId"in p);assert.equal(p.targetId,target.targetId);assert.ok(!("value"in p));}
    }
    assert.equal(h.buttons().some(b=>/^(Run|Run again|Allow|Deny|Submit)$/.test(b.textContent!)),false);
    if(want.expectedEffect?.historyBoundary)assert.ok(h.root.textContent!.includes("Earlier history"));
    h.view.dispose();model.dispose();
  });
});

describe("companion reading state and action lifetimes",()=>{
  it("reports session-memory mode and capture admission through one local mode callback without focus theft",async()=>{
    const h=setup(),m=await sourceModel("context");h.view.start();const outside=h.dom.window.document.getElementById("outside")!;outside.focus();await h.view.receive(bind);
    assert.deepEqual(h.modes.at(-1),{mode:"raw",sessionId:fixtureTarget.sessionId});await transfer(h,m.snapshot());assert.deepEqual(h.modes.at(-1),{mode:"companion",sessionId:fixtureTarget.sessionId});
    const b={...identity,projectionId:"b".repeat(32),sessionId:"managed-B"};await h.view.receive({...bind,...b});assert.deepEqual(h.modes.at(-1),{mode:"raw",sessionId:"managed-B"});assert.equal(h.dom.window.document.activeElement,outside);h.view.dispose();m.dispose();
  });
  it("keeps focus and older scroll while marking new content; follows only at the end",async()=>{
    const m=await sourceModel("`a.txt`"),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());const reading=h.root.querySelector<HTMLElement>(".companion-reading")!;
    Object.defineProperties(reading,{scrollHeight:{value:1000,configurable:true},clientHeight:{value:100,configurable:true}});reading.scrollTop=80;
    const target=m.snapshot().groups[0]!.targets[0]!,button=actionButton(h,target);button.focus();await transfer(h,{changes:[{kind:"historyBoundary",value:true}]},2,{base:1});
    assert.equal(h.dom.window.document.activeElement,button);assert.equal(reading.scrollTop,80);assert.equal(h.button("New content").hidden,false);
    h.button("New content").click();assert.equal(reading.scrollTop,1000);assert.equal(h.button("New content").hidden,true);h.view.dispose();m.dispose();
  });
  it("restores per-session mode and scroll, forgets removed sessions and keeps counters monotonic",async()=>{
    const m=await sourceModel("`a.txt`"),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());h.view.setMode("companion");
    const reading=h.root.querySelector<HTMLElement>(".companion-reading")!;reading.scrollTop=75;h.button("Send Escape to selected CLI").click();
    const b={...identity,projectionId:"b".repeat(32),sessionId:"managed-B"};await h.view.receive({...bind,...b});await transfer(h,empty,1,{identity:b});h.view.setMode("raw");
    const a={...identity,projectionId:"c".repeat(32)};await h.view.receive({...bind,...a});await transfer(h,m.snapshot(),1,{identity:a});
    assert.equal(h.root.dataset.mode,"companion");assert.equal(reading.scrollTop,75);h.button("Send Escape to selected CLI").click();const p=h.payloads().at(-1)!;assert.ok("actionId"in p);assert.equal(p.actionId,2);
    h.view.forgetSession("managed-B");h.view.dispose();m.dispose();
  });
  it("keeps repeated copies separately correlated and stale source feedback disables the old control",async()=>{
    const m=await sourceModel("`a.txt`"),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());const target=m.snapshot().groups[0]!.targets[0]!,button=actionButton(h,target);button.click();button.click();
    await h.view.receive({...identity,kind:"companion.actionResult",actionId:2,targetId:target.targetId,status:"busy",reason:"COPY_PENDING"});
    await h.view.receive({...identity,kind:"companion.actionResult",actionId:1,targetId:target.targetId,status:"settledAfterUncertain",reason:null});
    assert.ok(button.parentElement!.textContent!.includes("pending"));assert.ok(button.parentElement!.textContent!.includes("completed after"));
    button.click();await h.view.receive({...identity,kind:"companion.actionResult",actionId:3,targetId:target.targetId,status:"stale",reason:"SOURCE_CHANGED"});assert.equal(button.disabled,true);h.view.dispose();m.dispose();
  });
  it("ignores already retired bind IDs and does not let late projection frames replace the current window",async()=>{
    const h=setup();h.view.start();await h.view.receive(bind);await transfer(h,empty);const next={...identity,projectionId:"b".repeat(32)};await h.view.receive({...bind,...next});await transfer(h,empty,1,{identity:next});await h.view.receive(bind);
    h.button("Send Escape to selected CLI").click();const p=h.payloads().at(-1)!;assert.ok("projectionId"in p);assert.equal(p.projectionId,next.projectionId);h.view.dispose();
  });
  it("R2 rejects unseen older binds after more than 128 new binds, with constant identity state",async()=>{
    const h=setup();h.view.start();
    for(let ordinal=2;ordinal<=140;ordinal+=2)await h.view.receive({...bind,projectionId:ordinal.toString(16).padStart(32,"0")});
    for(let ordinal=141;ordinal<=280;ordinal++)await h.view.receive({...bind,projectionId:ordinal.toString(16).padStart(32,"0")});
    await h.view.receive({...bind,projectionId:"3".padStart(32,"0")});await h.view.receive(bind);
    h.button("Send Escape to selected CLI").click();const p=h.payloads().at(-1)!;assert.ok("projectionId"in p);assert.equal(p.projectionId,(280).toString(16).padStart(32,"0"));
    h.view.forgetSession(fixtureTarget.sessionId);await h.view.receive({...bind,projectionId:(279).toString(16).padStart(32,"0")});assert.equal(h.button("Send Escape to selected CLI").disabled,true);h.view.dispose();
  });
  it("R2 treats matching current binds as idempotent without losing partial chunks or Review",async()=>{
    const h=setup();h.view.start();await h.view.receive(bind);const text=JSON.stringify(empty),t=await transfer(h,empty,1,{commit:false});await h.view.receive(bind);await h.view.receive(t.commit);
    assert.equal(h.payloads().filter(p=>p.kind==="companion.resync").length,0);assert.ok(text.length>0);h.view.dispose();
    const r=await reviewFixture();const textarea=r.h.root.querySelector("textarea");await r.h.view.receive(bind);assert.equal(r.h.root.querySelector("textarea"),textarea);r.h.view.dispose();r.m.dispose();
  });
  it("detaches a removed selected session without sending IDs or stealing focus",async()=>{
    const {h,m}=await reviewFixture();h.view.forgetSession(fixtureTarget.sessionId);assert.equal(h.root.querySelector("textarea"),null);const count=h.messages.length;
    h.button("Send Escape to selected CLI").click();assert.equal(h.messages.length,count);assert.equal(h.button("Send Escape to selected CLI").disabled,true);h.view.dispose();m.dispose();
  });
  it("preserves an edited Review across unrelated revisions",async()=>{
    const {h,m}=await reviewFixture(),textarea=h.root.querySelector("textarea")!;textarea.value="untouched local edit";
    await transfer(h,{changes:[{kind:"historyBoundary",value:true}]},2,{base:1});assert.equal(h.root.querySelector("textarea"),textarea);assert.equal(textarea.value,"untouched local edit");h.view.dispose();m.dispose();
  });
  it("restores local reading focus when a source removal invalidates the open Review",async()=>{
    const {h,m,target}=await reviewFixture();await transfer(h,{changes:[{kind:"removeGroup",groupId:target.groupId}]},2,{base:1});assert.equal(h.root.querySelector("textarea"),null);assert.equal(h.dom.window.document.activeElement,h.root.querySelector(".companion-reading"));h.view.dispose();m.dispose();
  });
  it("closes the original projection without letting a late result claim a new action succeeded",async()=>{
    const m=await sourceModel("`a.txt`"),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());actionButton(h,m.snapshot().groups[0]!.targets[0]!).click();
    const next={...identity,projectionId:"b".repeat(32)};await h.view.receive({...bind,...next});assert.equal(actionButton(h,m.snapshot().groups[0]!.targets[0]!).disabled,true);
    const feedback=h.root.querySelector('[aria-live="polite"]')!.textContent;await h.view.receive({...identity,kind:"companion.actionResult",actionId:1,status:"ok",reason:null});assert.equal(h.root.querySelector('[aria-live="polite"]')!.textContent,feedback);h.view.dispose();m.dispose();
  });
  it("does not wrap the document action counter or emit exhausted IDs",async()=>{
    const h=setup();h.view.start();await h.view.receive(bind);(h.view as unknown as {actionId:number}).actionId=Number.MAX_SAFE_INTEGER-1;
    h.button("Send Escape to selected CLI").click();h.button("Send Escape to selected CLI").click();const actions=h.payloads().filter(p=>"actionId"in p);assert.equal(actions.length,1);assert.equal("actionId"in actions[0]!&&actions[0].actionId,Number.MAX_SAFE_INTEGER);assert.ok(h.root.textContent!.includes("Reopen"));h.view.dispose();
  });
  it("places nested, quoted and inline path controls at the corresponding source positions",async()=>{
    const m=await sourceModel("Before **C:/a.txt** after 'C:/b path.txt' then `C:/c.txt` end."),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());
    const text=h.root.querySelector(".companion-reading")!.textContent!;assert.match(text,/Before C:\/a.txtCopy after 'C:\/b path.txtCopy' then C:\/c.txtCopy end/);h.view.dispose();m.dispose();
  });
});

async function flush():Promise<void> {for(let i=0;i<12;i++)await new Promise<void>(resolveTick=>setImmediate(resolveTick));}
describe("actual runtime and component callback interoperability",()=>{
  for(const captured of [false,true])it("uses actual host-issued identities, clipboard and same-session native seams with capture "+captured,async()=>{
    const fs=new CaptureFixtureFileSystem(),clock=new CaptureFixtureClock(),copied:string[]=[],native:{id:string;value:string}[]=[],raw:string[]=[],sent:Wrapper[]=[];
    const carrier:{view?:View}={};let entropy=0;
    const runtime=new CompanionRuntime({capture:{storageRoot:fs.root,fs,coordinator:fs.coordinator,processId:4242,probeProcess:()=>{},randomBytes:size=>Buffer.alloc(size,++entropy)},
      currentTarget:()=>fixtureTarget,runningTarget:()=>fixtureTarget,now:clock.now,schedule:clock.schedule,
      capability:()=>({platform:"win32",arch:"x64",remoteName:null,vscodeVersion:"1.128.0",cliVersion:"fixture",cliBuild:"synthetic",pluginAvailable:true,schemaVersion:1}),
      qualifiedBuilds:captured?[{platform:"win32",arch:"x64",cliVersion:"fixture",cliBuild:"synthetic",schemaVersion:1,adapterId:"synthetic",receipt:"synthetic fixture only"}]:[],
      clipboard:async value=>{copied.push(value);},revealRaw:target=>raw.push(target.sessionId),writeInput:(id,value)=>native.push({id,value}),
      emit:message=>carrier.view?.receive(message.payload)});
    let binding:CaptureBinding|undefined,protocol:CaptureProtocol|undefined;
    const prepare=runtime.resources.prepare.bind(runtime.resources),start=runtime.resources.startProtocol.bind(runtime.resources);
    runtime.resources.prepare=async id=>{const result=await prepare(id);if(result.ok)binding=result.value;return result;};
    runtime.resources.startProtocol=async(owner,options)=>{const result=await start(owner,{...options,autoPoll:false});if(result.ok)protocol=result.value;return result;};
    await runtime.prepareLaunch({executable:"claude",args:[],cwd:"C:/workspace",env:{},root:{id:"root",label:"Root",uri:{fsPath:"C:/workspace"}},importedRoots:[],skippedImportIds:[]} as unknown as LaunchSpec,{id:fixtureTarget.sessionId,claudeSessionId:fixtureTarget.claudeSessionId,state:"starting"} as ManagedSessionSnapshot);
    if(captured){
      assert.ok(binding);assert.ok(protocol);const owner=binding;
      const json=()=>JSON.parse(fs.entries.get(resolve(owner.directory,"control.json"))!.data.toString()) as Record<string,unknown>;
      const pair=(name:string,value:unknown)=>{const data=JSON.stringify(value);fs.put(resolve(owner.directory,name+".upload"),"file",data);fs.put(resolve(owner.directory,name+".ready"),"file",JSON.stringify({v:1,basename:name+".upload",byteLength:Buffer.byteLength(data)}));};
      const envelope={v:1,token:owner.token,...fixtureTarget};
      pair("request."+String(json().offerId),{...envelope,kind:"epochRequest",offerId:json().offerId,predecessorEpoch:null,nativeSessionId:fixtureTarget.claudeSessionId,reason:"initial"});await protocol.poll();
      pair("activate."+String(json().captureEpoch),{...envelope,kind:"epochActivate",captureEpoch:json().captureEpoch,grantId:json().grantId,nativeSessionId:fixtureTarget.claudeSessionId});await protocol.poll();
      const text=JSON.stringify({kind:"assistantRow",scope:{kind:"main"},rowId:"row",blocks:[{kind:"text",index:0,text:"Before `C:/exact path/a.txt` after `$HOME/x`."}]});
      pair("frame."+String(json().captureEpoch)+".1",{...envelope,kind:"observationChunk",captureEpoch:json().captureEpoch,seq:1,observationId:1,chunkIndex:0,chunkCount:1,totalByteLength:Buffer.byteLength(text),byteLength:Buffer.byteLength(text),data:text});await protocol.poll();
    }
    const lease=runtime.openDocument();runtime.selectSession(fixtureTarget.sessionId);
    const h=setup({viewId:lease.viewId,postMessage:message=>{assert.ok(decodeCompanionWebviewMessage(message.payload).ok);sent.push(message);lease.receive(message.payload);}});carrier.view=h.view;
    lease.legacyReady(documentId);h.view.start();await flush();
    assert.equal(sent[0]!.payload.viewId,lease.viewId);if(captured)assert.ok(sent.some(m=>m.payload.kind==="companion.transferReady"));
    if(captured){
      const targets=runtime.model.snapshot(fixtureTarget.sessionId).groups.flatMap(g=>g.targets),copy=targets.find(t=>t.action==="copy")!,review=targets.find(t=>t.action==="review")!;
      actionButton(h,copy).click();await flush();assert.deepEqual(copied,["C:/exact path/a.txt"]);
      actionButton(h,review).click();await flush();const textarea=h.root.querySelector("textarea")!;assert.equal(textarea.value,"$HOME/x");textarea.value="literal reviewed";textarea.dispatchEvent(new h.dom.window.Event("input"));h.button("Copy reviewed value").click();await flush();assert.deepEqual(copied,["C:/exact path/a.txt","literal reviewed"]);
    }else assert.equal(h.root.dataset.mode,"raw");
    h.button("Respond in terminal").click();h.button("Send Escape to selected CLI").click();await flush();assert.deepEqual(raw,[fixtureTarget.sessionId]);assert.deepEqual(native,[{id:fixtureTarget.sessionId,value:"\u001b"}]);
    assert.equal(sent.filter(m=>m.payload.kind==="companion.resync").length,0);h.view.dispose();lease.dispose();await runtime.close();
  });
});

/** Actual native producer/P1/runtime/view with a queued, explicitly deliverable test carrier. */
async function composedView(source:string) {
  const fs=new CaptureFixtureFileSystem(),clock=new CaptureFixtureClock(),copied:string[]=[],native:{id:string;value:string}[]=[],raw:string[]=[],sent:Wrapper[]=[],host:CompanionHostMessage[]=[];
  const targets=new Map([[fixtureTarget.sessionId,fixtureTarget]]),pending:{payload:CompanionHostMessage;settle:()=>void}[]=[];let entropy=0,renewals=0;
  const runtime=new CompanionRuntime({capture:{storageRoot:fs.root,fs,coordinator:fs.coordinator,processId:4242,probeProcess:()=>{},randomBytes:size=>Buffer.alloc(size,++entropy)},
    currentTarget:id=>targets.get(id),runningTarget:id=>targets.get(id),now:clock.now,schedule:clock.schedule,
    capability:()=>({platform:"win32",arch:"x64",remoteName:null,vscodeVersion:"1.128.0",cliVersion:"fixture",cliBuild:"synthetic",pluginAvailable:true,schemaVersion:1}),
    qualifiedBuilds:[{platform:"win32",arch:"x64",cliVersion:"fixture",cliBuild:"synthetic",schemaVersion:1,adapterId:"synthetic",receipt:"synthetic fixture only"}],
    clipboard:async value=>{copied.push(value);},revealRaw:target=>raw.push(target.sessionId),writeInput:(id,value)=>native.push({id,value}),renewDocument:()=>{renewals++;},
    emit:message=>{host.push(message.payload);return new Promise<void>(settle=>pending.push({payload:message.payload,settle}));}});
  let binding:CaptureBinding|undefined,protocol:CaptureProtocol|undefined;
  const prepare=runtime.resources.prepare.bind(runtime.resources),start=runtime.resources.startProtocol.bind(runtime.resources);
  runtime.resources.prepare=async id=>{const result=await prepare(id);if(result.ok)binding=result.value;return result;};
  runtime.resources.startProtocol=async(owner,options)=>{const result=await start(owner,{...options,autoPoll:false});if(result.ok)protocol=result.value;return result;};
  await runtime.prepareLaunch({executable:"claude",args:[],cwd:"C:/workspace",env:{},root:{id:"root",label:"Root",uri:{fsPath:"C:/workspace"}},importedRoots:[],skippedImportIds:[]} as unknown as LaunchSpec,{id:fixtureTarget.sessionId,claudeSessionId:fixtureTarget.claudeSessionId,state:"starting"} as ManagedSessionSnapshot);
  assert.ok(binding);assert.ok(protocol);
  const driver={fs:{
    list:async(path:string)=>{const listing=await fs.list(resolve(path),257);return listing.names.map(name=>{const entry=fs.entries.get(resolve(path,name))!;return {name,kind:entry.info.kind==="directory"?"dir":entry.info.kind,size:entry.info.bytes,isLink:entry.info.kind==="link",mtimeMs:0};});},
    exists:async(path:string)=>fs.entries.has(resolve(path)),stat:async(path:string)=>{const info=await fs.stat(resolve(path));return {kind:info.kind==="directory"?"dir":info.kind,size:info.bytes,isLink:info.kind==="link",mtimeMs:0,realPath:resolve(path)};},
    read:async(path:string)=>(await fs.read(resolve(path),Number.MAX_SAFE_INTEGER)).toString(),write:async(path:string,text:string)=>{fs.put(resolve(path),"file",text);}},
    clock:{now:async()=>clock.now(),after:(ms:number,callback:()=>void)=>({cancel:clock.schedule(callback,ms)})}};
  const load=async(name:string)=>import("data:text/javascript;base64,"+Buffer.from(readFileSync("media/attention/hooks/companion/"+name+".js","utf8")).toString("base64"));
  const publisher=(await load("filePublisher") as {createFilePublisher(driver:unknown,environment:unknown):Publisher}).createFilePublisher(driver,{CLAUDE_WORKSPACES_CAPTURE_DIR:binding.directory,CLAUDE_WORKSPACES_CAPTURE_TOKEN:binding.token,CLAUDE_WORKSPACES_CAPTURE_SESSION_ID:fixtureTarget.sessionId,CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID:fixtureTarget.claudeSessionId,CLAUDE_WORKSPACES_CAPTURE_GENERATION:fixtureTarget.generation});
  const observer=(await load("observer") as {createCaptureObserver(sink:Sink):Observer}).createCaptureObserver(publisher);
  const capture=async()=>{for(let i=0;i<20;i++){await publisher.poll();await protocol!.poll();}};
  publisher.nativeStart(fixtureTarget.claudeSessionId,"startup");await capture();assert.equal(protocol.snapshot().state,"active");
  const returned={uuid:"row-A",message:{type:"assistant",role:"assistant",content:[{type:"text",text:source}]}};
  assert.equal(await observer.observe("session.append",{uuid:"row-A",door:"response",origin:{kind:"model"},message:{type:"assistant",role:"assistant",content:[]}},Object.assign(async()=>returned,{origin:{plugin:"engine",tier:"core"}})),returned);await capture();
  const lease=runtime.openDocument();runtime.selectSession(fixtureTarget.sessionId);
  const h=setup({viewId:lease.viewId,postMessage:message=>{assert.ok(decodeCompanionWebviewMessage(message.payload).ok);sent.push(message);lease.receive(message.payload);}});
  const deliver=async(payload:CompanionHostMessage)=>h.view.receive(payload);
  const pump=async(holdBind=false)=>{
    let held:CompanionHostMessage|undefined;await flush();
    while(pending.length){const frame=pending.shift()!;if(holdBind&&frame.payload.kind==="companion.bind"){held=frame.payload;holdBind=false;}else await deliver(frame.payload);frame.settle();await flush();}
    return held;
  };
  lease.legacyReady(documentId);h.view.start();await pump();
  const rebind=()=>{runtime.selectSession(undefined);runtime.selectSession(fixtureTarget.sessionId);};
  const lastBind=()=>{const value=[...host].reverse().find(m=>m.kind==="companion.bind");assert.ok(value);return value;};
  return {h,runtime,lease,host,sent,copied,native,raw,pending,pump,deliver,rebind,lastBind,renewals:()=>renewals,targets,
    dispose:async()=>{publisher.stop();protocol!.stop();h.view.dispose();lease.dispose();for(const frame of pending.splice(0))frame.settle();await runtime.close();}};
}

describe("Review literal line-ending fidelity through actual runtime clipboard",()=>{
  for(const candidate of ["$HOME/a\r\nb","$HOME/a\nb","$HOME/a\r\nb\nc\r\nd"]){
    for(const edit of ["untouched","before","after","middle"] as const)it(JSON.stringify(candidate)+" "+edit,async()=>{
      const c=await composedView("Before `"+candidate+"` after."),target=c.runtime.model.snapshot(fixtureTarget.sessionId).groups.flatMap(g=>g.targets).find(t=>t.action==="review")!;assert.ok(target);
      assert.equal(c.runtime.model.resolveLiteral(fixtureTarget.sessionId,target.targetId,target.targetRevision)?.literal,candidate);
      actionButton(c.h,target).click();await c.pump();const textarea=c.h.root.querySelector("textarea")!;assert.equal(textarea.value,candidate.replace(/\r\n?|\n/g,"\n"));
      let expected=candidate;
      if(edit!=="untouched"){
        if(edit==="before"){textarea.value="NEW\n"+textarea.value;expected="NEW\n"+candidate;}
        else if(edit==="after"){textarea.value+="\nNEW";expected=candidate+"\nNEW";}
        else {textarea.value=textarea.value.replace("a","EDIT");expected=candidate.replace("a","EDIT");}
        textarea.dispatchEvent(new c.h.dom.window.Event("input"));
      }
      c.h.button("Copy reviewed value").click();const request=c.sent.at(-1)!.payload;assert.equal(request.kind,"companion.reviewCopy");assert.equal(request.value,expected);await c.pump();assert.deepEqual(c.copied,[expected]);assert.deepEqual(c.native,[]);await c.dispose();
    });
  }
  for(const extra of [1,2,3])it("validates actual retained CRLF bytes at32KiB "+(extra-2),async()=>{
    const candidate="$HOME/"+"a".repeat(32758)+"\r\n",c=await composedView("`"+candidate+"`"),target=c.runtime.model.snapshot(fixtureTarget.sessionId).groups.flatMap(g=>g.targets).find(t=>t.action==="review")!;assert.ok(target);
    actionButton(c.h,target).click();await c.pump();const textarea=c.h.root.querySelector("textarea")!;textarea.value="x".repeat(extra)+textarea.value;textarea.dispatchEvent(new c.h.dom.window.Event("input"));
    const button=c.h.button("Copy reviewed value");assert.equal(button.disabled,extra===3);button.click();await c.pump();assert.deepEqual(c.copied,extra===3?[]:["x".repeat(extra)+candidate]);await c.dispose();
  });
});

describe("supplied CR Review candidate through real editable component emissions",()=>{
  for(const candidate of ["$HOME/a\rb","$HOME/a\r\nb\rc\nd"])for(const edit of ["untouched","before","after","middle"] as const)it(JSON.stringify(candidate)+" "+edit,async()=>{
    const {h,m}=await reviewFixture(candidate),textarea=h.root.querySelector("textarea")!;let expected=candidate;
    if(edit!=="untouched"){
      if(edit==="before"){textarea.value="NEW\n"+textarea.value;expected="NEW\n"+candidate;}
      else if(edit==="after"){textarea.value+="\nNEW";expected=candidate+"\nNEW";}
      else {textarea.value=textarea.value.replace("a","EDIT");expected=candidate.replace("a","EDIT");}
      textarea.dispatchEvent(new h.dom.window.Event("input"));
    }
    h.button("Copy reviewed value").click();const p=h.payloads().at(-1)!;assert.equal(p.kind,"companion.reviewCopy");assert.equal(p.value,expected);h.view.dispose();m.dispose();
  });
  for(const source of ["`$HOME/a\rb`","`$HOME/a\r\nb\rc\nd`"])it("records unchanged P2 unsupported boundary for "+JSON.stringify(source),async()=>{
    const m=await sourceModel(source);assert.equal(m.snapshot().groups.flatMap(g=>g.targets).length,0);assert.ok(m.snapshot().groups.some(g=>g.nodes.some(n=>n.kind==="notice"&&n.reason==="UNSUPPORTED_CONTENT")));m.dispose();
  });
  it("uses beforeinput selection to preserve the correct adjacent original line break",async()=>{
    const {h,m}=await reviewFixture("$HOME/a\r\n\nb"),textarea=h.root.querySelector("textarea")!;textarea.setSelectionRange(7,8);textarea.dispatchEvent(new h.dom.window.InputEvent("beforeinput",{inputType:"deleteContentForward",bubbles:true}));
    textarea.value="$HOME/a\nb";textarea.dispatchEvent(new h.dom.window.InputEvent("input",{inputType:"deleteContentForward",bubbles:true}));h.button("Copy reviewed value").click();const p=h.payloads().at(-1)!;assert.equal(p.kind,"companion.reviewCopy");assert.equal(p.value,"$HOME/a\nb");h.view.dispose();m.dispose();
  });
  it("preserves an original CR when inserting an adjacent new LF",async()=>{
    const {h,m}=await reviewFixture("$HOME/a\rb"),textarea=h.root.querySelector("textarea")!;textarea.setSelectionRange(7,7);textarea.dispatchEvent(new h.dom.window.InputEvent("beforeinput",{inputType:"insertText",data:"\n",bubbles:true}));
    textarea.value="$HOME/a\n\nb";textarea.dispatchEvent(new h.dom.window.InputEvent("input",{inputType:"insertText",data:"\n",bubbles:true}));h.button("Copy reviewed value").click();const p=h.payloads().at(-1)!;assert.equal(p.kind,"companion.reviewCopy");assert.equal(p.value,"$HOME/a\n\rb");h.view.dispose();m.dispose();
  });
  for(const committed of [false,true])it("only applies selected line-break replacement after an actual input event: "+committed,async()=>{
    const {h,m}=await reviewFixture("$HOME/a\r\nb\rc"),textarea=h.root.querySelector("textarea")!;textarea.setSelectionRange(7,8);textarea.dispatchEvent(new h.dom.window.InputEvent("beforeinput",{inputType:"insertText",data:"\n",bubbles:true,cancelable:true}));
    if(committed)textarea.dispatchEvent(new h.dom.window.InputEvent("input",{inputType:"insertText",data:"\n",bubbles:true}));
    h.button("Copy reviewed value").click();const p=h.payloads().at(-1)!;assert.equal(p.kind,"companion.reviewCopy");assert.equal(p.value,committed?"$HOME/a\nb\rc":"$HOME/a\r\nb\rc");h.view.dispose();m.dispose();
  });
  it("keeps scalar boundaries intact while replacing a surrogate-pair character",async()=>{
    const {h,m}=await reviewFixture("$HOME/😀\r\nx"),textarea=h.root.querySelector("textarea")!;textarea.value=textarea.value.replace("😀","😃");textarea.dispatchEvent(new h.dom.window.Event("input"));h.button("Copy reviewed value").click();const p=h.payloads().at(-1)!;assert.equal(p.kind,"companion.reviewCopy");assert.equal(p.value,"$HOME/😃\r\nx");h.view.dispose();m.dispose();
  });
  it("preserves untouched breaks through disjoint edits while a byte-oversized draft is repaired",async()=>{
    const candidate="$HOME/a\r\nb\rc\nd"+"é".repeat(16000),{h,m}=await reviewFixture(candidate),textarea=h.root.querySelector("textarea")!;
    textarea.value="x".repeat(1000)+textarea.value;textarea.dispatchEvent(new h.dom.window.Event("input"));assert.equal(h.button("Copy reviewed value").disabled,true);
    textarea.value=textarea.value.replace("/a","/A");textarea.dispatchEvent(new h.dom.window.Event("input"));textarea.value=textarea.value.replace("d","D");textarea.dispatchEvent(new h.dom.window.Event("input"));
    textarea.value=textarea.value.slice(1000);textarea.dispatchEvent(new h.dom.window.Event("input"));assert.equal(h.button("Copy reviewed value").disabled,false);h.button("Copy reviewed value").click();const p=h.payloads().at(-1)!;assert.equal(p.kind,"companion.reviewCopy");assert.equal(p.value,candidate.replace("/a","/A").replace("d","D"));h.view.dispose();m.dispose();
  });
});

describe("source actions never activate their Markdown link",()=>{
  for(const source of ["[**C:/a.txt**](https://example.com)","[`$HOME/a`](https://example.com)"])for(const detail of [0,1])it(source+" click detail "+detail,async()=>{
    const m=await sourceModel(source),h=setup();h.view.start();await h.view.receive(bind);await transfer(h,m.snapshot());const target=m.snapshot().groups[0]!.targets[0]!;assert.ok(target);
    const button=actionButton(h,target),activation=new h.dom.window.MouseEvent("click",{bubbles:true,cancelable:true,detail});button.dispatchEvent(activation);
    assert.equal(h.payloads().at(-1)?.kind,target.action==="copy"?"companion.copy":"companion.reviewOpen");assert.deepEqual(h.links,[]);assert.equal(activation.defaultPrevented,true);
    const anchor=h.root.querySelector("a")!,ordinary=new h.dom.window.MouseEvent("click",{bubbles:true,cancelable:true,detail:1});anchor.dispatchEvent(ordinary);assert.deepEqual(h.links,["https://example.com"]);assert.equal(ordinary.defaultPrevented,true);h.view.dispose();m.dispose();
  });
});

describe("composed healthy runtime-to-view R2 carrier",()=>{
  it("rejects unseen/old/wrong binds after >128 healthy commits and preserves duplicate/exhaustion/native authority",async function(){
    this.timeout(15000);const c=await composedView("Before `C:/exact path/a.txt` after `$HOME/x`."),first=c.lastBind();
    c.rebind();const unseen=await c.pump(true);assert.ok(unseen&&unseen.kind==="companion.bind");
    for(let i=0;i<130;i++){c.rebind();await c.pump();const current=c.lastBind();assert.equal(c.h.root.dataset.mode,"companion");assert.ok(c.h.root.textContent!.includes("Before"));assert.ok(c.host.some(m=>m.kind==="companion.transferCommit"&&m.projectionId===current.projectionId));}
    const previous=c.lastBind(),reading=c.h.root.querySelector(".companion-reading")!.textContent,target=c.runtime.model.snapshot(fixtureTarget.sessionId).groups.flatMap(g=>g.targets).find(t=>t.action==="copy")!;
    assert.equal(previous.sessionId,unseen.sessionId);assert.equal(previous.modelRevision,unseen.modelRevision);
    for(const payload of [unseen,first])await c.deliver(payload);
    c.rebind();const forthcoming=c.lastBind();
    for(const payload of [{...forthcoming,viewId:"0".repeat(32)},{...forthcoming,documentId:"22222222-2222-4222-8222-222222222222"}])await c.deliver(payload);
    assert.equal(c.h.root.querySelector(".companion-reading")!.textContent,reading);c.h.button("Send Escape to selected CLI").click();const rejected=c.sent.at(-1)!.payload;assert.ok("projectionId"in rejected);assert.equal(rejected.projectionId,previous.projectionId);assert.deepEqual(c.native,[]);
    const partialBegins=c.host.filter(m=>m.kind==="companion.transferBegin").length;c.lease.receive({v:1,kind:"companion.ready",viewId:c.lease.viewId,documentId});assert.equal(c.host.filter(m=>m.kind==="companion.transferBegin").length,partialBegins);
    await c.pump();const current=c.lastBind();assert.equal(current.projectionId,forthcoming.projectionId);assert.ok(c.host.some(m=>m.kind==="companion.transferCommit"&&m.projectionId===current.projectionId),"same-pair duplicate retains partial transfer state");
    actionButton(c.h,target).click();const action=c.sent.at(-1)!.payload;assert.ok("projectionId"in action);assert.equal(action.projectionId,current.projectionId);await c.pump();assert.deepEqual(c.copied,["C:/exact path/a.txt"]);
    const begins=c.host.filter(m=>m.kind==="companion.transferBegin").length;c.lease.receive({v:1,kind:"companion.ready",viewId:c.lease.viewId,documentId});await c.pump();assert.equal(c.lastBind().projectionId,current.projectionId);assert.equal(c.host.filter(m=>m.kind==="companion.transferBegin").length,begins);
    c.lease.receive(action);await c.pump();assert.equal(c.copied.length,1,"duplicate ready retains action high-water");
    const state=(c.runtime as unknown as {document:{projectionOrdinal:number}}).document;state.projectionOrdinal=Number.MAX_SAFE_INTEGER;
    // Resync has no action fields; use the exact current host envelope.
    c.lease.receive({v:1,viewId:current.viewId,projectionId:current.projectionId,sessionId:current.sessionId,generation:current.generation,kind:"companion.resync",appliedRevision:0,reason:"decode"});await c.pump();assert.equal(c.renewals(),1);assert.equal(state.projectionOrdinal,Number.MAX_SAFE_INTEGER);
    actionButton(c.h,target).click();await c.pump();assert.equal(c.copied.length,1);c.h.button("Respond in terminal").click();c.h.button("Send Escape to selected CLI").click();await c.pump();assert.deepEqual(c.raw,[fixtureTarget.sessionId]);assert.deepEqual(c.native,[{id:fixtureTarget.sessionId,value:"\u001b"}]);
    const other={...fixtureTarget,sessionId:"managed-B",generation:"generation-B"};c.targets.set(other.sessionId,other);c.runtime.selectSession(other.sessionId);c.h.button("Send Escape to selected CLI").click();actionButton(c.h,target).click();await c.pump();assert.equal(c.native.length,1);assert.equal(c.copied.length,1);assert.equal(c.host.filter(m=>m.kind==="companion.transferBegin").length,begins);assert.equal(c.renewals(),1);await c.dispose();
  });
});
