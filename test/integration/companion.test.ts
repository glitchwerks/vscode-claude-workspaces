import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { ClaudeCapabilityProbe, type ClaudeCapabilities } from "../../src/launch/claudeCapabilities";
import type { LaunchSpec } from "../../src/launch/launchPlanner";
import { resolve } from "node:path";
import type { CaptureBinding } from "../../src/companion/companionTypes";
import type { CaptureProtocol } from "../../src/companion/companionCapture";
import { activateWithDependencies, deactivate, type ExtensionActivationDependencies } from "../../src/extension";
import { ComposerRuntime } from "../../src/composer/composerRuntime";
import type { CompanionRuntimeOptions } from "../../src/companion/companionRuntime";
import { captureEnvironmentKeys } from "../../src/companion/companionTypes";
import type { ManagedPtyFactory } from "../../src/launch/managedPty";
import { FakeManagedPty, FakeManagedPtyFactory } from "../support/fakeManagedPty";
import { MemoryMemento } from "../support/memoryMemento";
import { OutputLogger } from "../../src/logging/outputLogger";
import assert from "node:assert/strict";
import * as vscode from "vscode";
import { JSDOM } from "jsdom";
import { CompanionRuntime } from "../../src/companion/companionRuntime";
import { SessionPanelProvider, type SessionPanelActions } from "../../src/panel/sessionPanelProvider";
import { createSessionRenderer, type RendererTerminal, type RendererWindow } from "../../src/panel/webview/renderer";
import type { HostMessage } from "../../src/panel/protocol";
import type { ManagedSessionSnapshot, SessionDataEvent } from "../../src/sessions/sessionTypes";
import type { ResumableSessionSnapshot } from "../../src/sessions/resumableSessionStore";
import { CaptureFixtureClock, CaptureFixtureFileSystem, fixtureTarget } from "../support/companionHarness";

const documentId="88888888-8888-4888-8888-888888888888";
const secondDocumentId="99999999-9999-4999-8999-999999999999";
const terminalFont={fontFamily:"monospace",fontSize:14,letterSpacing:0,lineHeight:1};
const settle=async()=>{for(let i=0;i<12;i++)await new Promise<void>(resolve=>setImmediate(resolve));};
const session:ManagedSessionSnapshot={id:fixtureTarget.sessionId,claudeSessionId:fixtureTarget.claudeSessionId,rootId:"root",displayName:"Fixture",ordinalWithinRoot:1,state:"running",activity:"idle",hasUnreadResponse:false,launchedImportIds:[],launchedAddDirPaths:[],launchedRootLabel:"Fixture",launchedRootPath:"C:/fixture",launchedAt:1};

/** Real provider/runtime, with only VS Code transport and resource/clock boundaries injected. */
function panelHarness(selected=true,qualified=false) {
  const fs=new CaptureFixtureFileSystem(),clock=new CaptureFixtureClock();
  const changes=new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>(), data=new vscode.EventEmitter<SessionDataEvent>(), saved=new vscode.EventEmitter<readonly ResumableSessionSnapshot[]>();
  let sessions:readonly ManagedSessionSnapshot[]=selected?[session]:[],active=selected?session.id:undefined;
  // The runtime emitter closes over the provider installed below.
  // eslint-disable-next-line prefer-const
  let provider:SessionPanelProvider;
  const writes:string[]=[],raw:string[]=[],posted:HostMessage[]=[],visibility:boolean[]=[];
  const runtime=new CompanionRuntime({capture:{storageRoot:fs.root,fs,coordinator:fs.coordinator},
    currentTarget:id=>sessions.some(s=>s.id===id)?fixtureTarget:undefined,
    runningTarget:id=>sessions.some(s=>s.id===id&&s.state==="running")?fixtureTarget:undefined,
    capability:()=>({platform:"win32",arch:"x64",remoteName:null,vscodeVersion:"1.128.0",cliVersion:"fixture",cliBuild:"synthetic",pluginAvailable:true,schemaVersion:1}),
    qualifiedBuilds:qualified?[{platform:"win32",arch:"x64",cliVersion:"fixture",cliBuild:"synthetic",schemaVersion:1,adapterId:"synthetic",receipt:"synthetic test only"}]:[],
    clipboard:value=>vscode.env.clipboard.writeText(value),
    now:clock.now,schedule:clock.schedule,
    emit:message=>(provider as SessionPanelProvider & {postCompanion(message:HostMessage):PromiseLike<unknown>|void}).postCompanion(message),
    renewDocument:()=>(provider as SessionPanelProvider & {renewCompanionDocument():void}).renewCompanionDocument(),
    writeInput:(_id,text)=>writes.push(text),revealRaw:target=>{raw.push(target.sessionId);provider.focusSession(target.sessionId);}});
  const actions:SessionPanelActions={input:(_id,text)=>{writes.push(text);},resize:()=>{},selectSession:()=>{},renameSession:()=>{},newSession:()=>{},newInFolder:()=>{},resumeSession:()=>{},forgetSession:()=>{},closeSession:()=>{},restartFresh:()=>{},previousSession:()=>{},nextSession:()=>{},configureWorkspace:()=>{}};
  provider=new SessionPanelProvider({onDidChangeVisibility:value=>visibility.push(value),extensionUri:vscode.Uri.file(__dirname),terminalFont,actions,
    sessions:{get sessions(){return sessions;},get activeSessionId(){return active;},onDidChangeSessions:changes.event,onDidReceiveData:data.event},
    resumableSessions:{sessions:[],onDidChangeSessions:saved.event},...{companion:runtime}});
  runtime.selectSession(active);
  const openView=(onHtml?:(html:string,receive:(message:unknown)=>void)=>void)=>{
    const callbacks:((message:unknown)=>void)[]=[];
    let current:((message:unknown)=>void)|undefined,html="",installs=0;
    const disposed=new vscode.EventEmitter<void>(),visibility=new vscode.EventEmitter<void>();
    let deliver:(message:HostMessage)=>PromiseLike<unknown>=async()=>true;
    const receive=(message:unknown)=>current?.(message);
    const view={visible:true,webview:{cspSource:"vscode-webview://fixture",
      get html(){return html;},set html(value:string){html=value;installs++;onHtml?.(value,receive);},
      asWebviewUri:(uri:vscode.Uri)=>uri,
      onDidReceiveMessage:(callback:(message:unknown)=>void)=>{callbacks.push(callback);current=callback;return {dispose:()=>{if(current===callback)current=undefined;}};},
      postMessage:(message:HostMessage)=>{posted.push(message);return deliver(message);}},
      onDidDispose:disposed.event,onDidChangeVisibility:visibility.event} as unknown as vscode.WebviewView;
    provider.resolveWebviewView(view);
    return {view,receive,callbacks,disposed,visibility,get html(){return html;},get installs(){return installs;},
      setDeliver:(fn:typeof deliver)=>{deliver=fn;},
      viewId:()=>new JSDOM(html).window.document.querySelector("#app")!.getAttribute("data-companion-view-id")};
  };
  return {provider,runtime,fs,clock,posted,writes,raw,visibility,openView,
    select:(value:boolean)=>{sessions=value?[session]:[];active=value?session.id:undefined;changes.fire(sessions);runtime.refresh();runtime.selectSession(active);},
    close:async()=>{provider.dispose();await runtime.close();changes.dispose();data.dispose();saved.dispose();}};
}
function ready(view:ReturnType<ReturnType<typeof panelHarness>["openView"]>,id=documentId) {
  view.receive({type:"ready",documentId:id});
  view.receive({type:"companion",payload:{v:1,kind:"companion.ready",viewId:view.viewId(),documentId:id}});
}
function binds(messages:HostMessage[]) {
  return messages.flatMap(m=>m.type==="companion"&&m.payload.kind==="companion.bind"?[m.payload]:[]);
}

describe("companion provider assembly",()=>{
  it("installs a host HTML lease and its listener before synchronous browser ready",async()=>{
    const h=panelHarness();
    try {
      const v=h.openView((html,receive)=>{
        const viewId=new JSDOM(html).window.document.querySelector("#app")!.getAttribute("data-companion-view-id");
        receive({type:"ready",documentId});receive({type:"companion",payload:{v:1,kind:"companion.ready",viewId,documentId}});
      });
      assert.match(v.viewId()??"",/^[a-f0-9]{32}$/);await settle();
      assert.equal(binds(h.posted).length,1);assert.equal(binds(h.posted)[0]!.viewId,v.viewId());
      assert.equal(binds(h.posted)[0]!.documentId,documentId);
      assert.equal(h.posted.filter(m=>m.type==="hydrate").length,1);
    } finally {await h.close();}
  });
  it("renews HTML once for a different registered UUID and rejects queued and saved old callbacks",async()=>{
    const h=panelHarness();try{
      const v=h.openView();ready(v);await settle();const first=v.viewId(),callback=v.callbacks[0]!;
      ready(v,secondDocumentId);await settle();assert.equal(v.installs,2);assert.notEqual(v.viewId(),first);
      const before=h.posted.length;
      callback({type:"ready",documentId});callback({type:"input",sessionId:session.id,data:"stale",isPromptSubmission:false});
      callback({type:"companion",payload:{v:1,kind:"companion.ready",viewId:first,documentId:secondDocumentId}});await settle();
      assert.equal(h.posted.length,before);assert.equal(h.writes.length,0);assert.equal(v.installs,2);
      ready(v);await settle();const binding=binds(h.posted).at(-1)!;assert.equal(binding.viewId,v.viewId());
      ready(v);await settle();assert.equal(v.installs,2);assert.equal(binds(h.posted).at(-1)!.projectionId,binding.projectionId);
      v.disposed.fire();ready(v);await settle();assert.equal(v.installs,2);
    }finally{await h.close();}
  });
  it("pairs early ready once, expires it without extending duplicates, and never invents an unselected tuple",async()=>{
    const h=panelHarness(false);try{
      const v=h.openView(),payload={v:1,kind:"companion.ready",viewId:v.viewId(),documentId};
      v.receive({type:"companion",payload});await settle();h.clock.advance(1999);
      v.receive({type:"companion",payload});await settle();h.clock.advance(1);h.clock.fireDue();
      v.receive({type:"ready",documentId});await settle();assert.equal(binds(h.posted).length,0);
      h.select(true);await settle();assert.equal(binds(h.posted).length,0);
      v.receive({type:"companion",payload});await settle();assert.equal(binds(h.posted).length,1);
      assert.equal(v.installs,1);
    }finally{await h.close();}
  });
  it("returns the exact platform post promise without a source queue",async()=>{
    const h=panelHarness();try{
      const v=h.openView();ready(v);await settle();
      const pending=new Promise<boolean>(()=>{});v.setDeliver(()=>pending);
      const binding=binds(h.posted)[0]!;
      const message:HostMessage={type:"companion",payload:binding};
      const post=(h.provider as SessionPanelProvider & {postCompanion(m:HostMessage):PromiseLike<unknown>|void}).postCompanion(message);
      assert.equal(post,pending);v.disposed.fire();assert.equal(h.posted.at(-1),message);
    }finally{await h.close();}
  });
  it("shows truthful unavailable status with real runtime, HTML bootstrap and renderer before any capture event",async()=>{
    const h=panelHarness();let renderer:ReturnType<typeof createSessionRenderer>|undefined;
    try{
      const v=h.openView(),dom=new JSDOM(v.html,{pretendToBeVisual:true});
      const writes:string[]=[];let focused=0;
      const terminal:RendererTerminal={open:parent=>{parent.tabIndex=0;},write:text=>writes.push(text),paste:()=>{},dispose:()=>{},focus:()=>{focused++;},onData:()=>{},onResize:()=>{},updateTheme:()=>{}};
      const messages:unknown[]=[];
      renderer=createSessionRenderer({document:dom.window.document,documentId,companionViewId:v.viewId()??undefined,
        window:dom.window as unknown as RendererWindow,postMessage:message=>{messages.push(message);v.receive(message);},
        terminalFactory:{create:()=>terminal},fitTerminal:()=>{}});
      v.setDeliver(message=>Promise.resolve(renderer!.handleMessage(message)));await settle();
      assert.equal(binds(h.posted).length,1);
      assert.match(dom.window.document.querySelector(".companion-notice")!.textContent!,/unavailable/i);
      assert.equal(dom.window.document.querySelector<HTMLElement>(".terminal-stage")!.hidden,false);
      const buttons=[...dom.window.document.querySelectorAll<HTMLButtonElement>(".companion-toolbar button")];
      buttons.find(b=>b.textContent==="Send Escape to selected CLI")!.click();await settle();assert.deepEqual(h.writes,["\u001b"]);
      buttons.find(b=>b.textContent==="Respond in terminal")!.click();await settle();assert.deepEqual(h.raw,[session.id]);assert.ok(focused>0);
      assert.equal(v.installs,1);assert.equal(messages.filter(m=>(m as {type:string}).type==="input").length,0);
    }finally{renderer?.dispose();await h.close();}
  });
});

/** Activation with real manager/composer/runtime and fake PTY; no CLI, disk or auth probe. */
async function activationHarness(qualified=true, factory?:ManagedPtyFactory, failure?:"commands"|"view", configure:(dependencies:ExtensionActivationDependencies)=>ExtensionActivationDependencies=dependencies=>dependencies) {
  const fs=new CaptureFixtureFileSystem(),clock=new CaptureFixtureClock(),ptys=new FakeManagedPtyFactory();
  const handlers=new Map<string,()=>unknown>();let provider:vscode.WebviewViewProvider|undefined;
  let signal:((value:"SIGINT"|"SIGTERM")=>void)|undefined;const reemitted:string[]=[];
  const state=new MemoryMemento(),root=vscode.Uri.file("C:/fixture");
  const context={subscriptions:[],workspaceState:state,extensionUri:root,globalStorageUri:root} as unknown as vscode.ExtensionContext;
  const dependencies:ExtensionActivationDependencies & {companion:Partial<CompanionRuntimeOptions>}={
    companion:{capture:{storageRoot:fs.root,fs,coordinator:fs.coordinator,probeProcess:()=>{}},now:clock.now,schedule:clock.schedule,
      capability:()=>({platform:"win32",arch:"x64",remoteName:null,vscodeVersion:"1.128.0",cliVersion:"fixture",cliBuild:"synthetic",pluginAvailable:true,schemaVersion:1}),
      qualifiedBuilds:qualified?[{platform:"win32",arch:"x64",cliVersion:"fixture",cliBuild:"synthetic",schemaVersion:1,adapterId:"synthetic",receipt:"synthetic test only"}]:[]},
    composerAdapter:{prepareLaunch:async spec=>spec,isAvailable:()=>false,listCommands:async()=>[],submit:async request=>({status:"rejected",submissionId:request.submissionId,reason:"unavailable"}),disposeSession:async()=>{},close:async()=>{}},
    ptyFactory:factory??ptys,createClaudeSessionId:()=>fixtureTarget.claudeSessionId,
    claudeCapabilities:{get:async()=>({sessionPersistence:true,settingsFile:false})},
    attentionHost:{platform:"linux",processId:process.pid},
    logger:new OutputLogger({name:"Companion fixture",append:()=>{},appendLine:()=>{},replace:()=>{},clear:()=>{},hide:()=>{},show:()=>{},dispose:()=>{}}),
    commands:{executeCommand:async()=>{},registerCommand:(id,handler)=>{if(failure==="commands")throw new Error("synthetic activation failure");handlers.set(id,handler);return {dispose:()=>{}};}},
    workspace:{workspaceFile:vscode.Uri.file("C:/fixture/workspace.code-workspace"),workspaceFolders:[{name:"Fixture",index:0,uri:root}],
      onDidChangeWorkspaceFolders:()=>({dispose:()=>{}}),getConfiguration:()=>({get:<T>(_key:string,fallback?:T)=>fallback as T})},
    setup:{ensureConfigured:async()=>({schemaVersion:1,configuredRoots:[root.toString(true)],importsByRoot:{[root.toString(true)]:[]}}),configure:async()=>{}},
    availability:{timeoutMs:100,maxConcurrency:1,maxOutstandingProbes:1,totalTimeoutMs:1000,isAvailable:async()=>true},
    notifications:{showWarningMessage:async()=>undefined,showErrorMessage:async()=>undefined},
    lifecycle:{onTerminationSignal:listener=>{signal=listener;return {dispose:()=>{signal=undefined;}};},schedule:()=>({dispose:()=>{}}),reemit:value=>{reemitted.push(value);}},
    views:{registerWebviewViewProvider:(_id,value)=>{if(failure==="view")throw new Error("synthetic activation failure");provider=value;return {dispose:()=>{}};}},terminalFont
  };
  const api=await activateWithDependencies(context,configure(dependencies));
  return {api,fs,clock,ptys,provider,handlers,reemitted,signal:()=>signal?.("SIGTERM"),
    close:async()=>{clock.advance(2000);clock.fireDue();const closing=deactivate();await settle();clock.advance(2000);clock.fireDue();await closing;context.subscriptions.forEach(item=>item.dispose());}};
}

describe("companion activation assembly",()=>{
  it("exposes immutable numeric retention observations only through trusted activation",async()=>{
    const original=CompanionRuntime.prototype.prepareLaunch;const runtimes:CompanionRuntime[]=[];let managedSessionId:string|undefined;
    CompanionRuntime.prototype.prepareLaunch=async function(spec,snapshot){runtimes.push(this);managedSessionId=snapshot.id;return original.call(this,spec,snapshot);};
    let h:Awaited<ReturnType<typeof activationHarness>>|undefined;
    try {
      h=await activationHarness();
      assert.deepEqual(h.api.companionQualificationUsage(),{managedSessions:0,globalRetentionBytes:0,maxManagedSessionRetentionBytes:0});
      await h.api.launchController.launch({rootMode:"default"});const runtime=runtimes[0];assert.ok(managedSessionId);assert.ok(runtime);
      const prepared=await runtime.resources.prepare(managedSessionId);assert.ok(prepared.ok);
      const before=h.api.companionQualificationUsage();const ticket=runtime.resources.reserveRetention(prepared.value,1234);assert.ok(ticket);
      const held=h.api.companionQualificationUsage();
      assert.deepEqual(held,{managedSessions:1,globalRetentionBytes:before.globalRetentionBytes+1234,maxManagedSessionRetentionBytes:before.maxManagedSessionRetentionBytes+1234});
      assert.equal(Object.isFrozen(held),true);assert.equal(Reflect.set(held,"globalRetentionBytes",0),false);
      assert.ok(Object.values(held).every(value=>typeof value==="number"));
      runtime.resources.releaseRetention(ticket);
      assert.deepEqual(h.api.companionQualificationUsage(),before);assert.equal(held.globalRetentionBytes,before.globalRetentionBytes+1234,"earlier snapshots must not mutate");
      await runtime.resources.revoke(prepared.value);
    } finally {CompanionRuntime.prototype.prepareLaunch=original;await h?.close();}
  });
  it("composes after composer and strips inherited case aliases at the actual final factory seam",async()=>{
    const original=ComposerRuntime.prototype.prepareLaunch;
    ComposerRuntime.prototype.prepareLaunch=async function(spec,snapshot){
      const prepared=await original.call(this,spec,snapshot);
      return {...prepared,env:{...prepared.env,claude_workspaces_capture_token:"poison",CLAUDE_WORKSPACES_CAPTURE_DIR:"inherited",AUTH_FIXTURE:"unchanged",COMPOSER_PREPARED:"yes"}};
    };
    let h:Awaited<ReturnType<typeof activationHarness>>|undefined;
    try{
      h=await activationHarness();await h.api.launchController.launch({rootMode:"default"});
      const spec=h.ptys.spawnedSpecs[0]!;assert.ok(spec);
      assert.equal(spec.env.COMPOSER_PREPARED,"yes");assert.equal(spec.env.AUTH_FIXTURE,"unchanged");
      const keys=Object.keys(spec.env).filter(key=>key.toUpperCase().startsWith("CLAUDE_WORKSPACES_CAPTURE_"));
      assert.deepEqual(keys.sort(),[...captureEnvironmentKeys].sort());
      assert.notEqual(spec.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,"poison");
      assert.equal(spec.env.CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID,fixtureTarget.claudeSessionId);
      assert.equal([...h.fs.entries.keys()].filter(p=>/companion-[a-f0-9]{32}$/.test(p)).length,1);
      await h.ptys.ptys[0]!.terminate();await settle();
      assert.equal([...h.fs.entries.keys()].filter(p=>/companion-[a-f0-9]{32}$/.test(p)).length,1,"terminate settlement is not exit proof");
      h.ptys.ptys[0]!.emitExit({exitCode:0});await settle();
      assert.equal([...h.fs.entries.keys()].filter(p=>/companion-[a-f0-9]{32}$/.test(p)).length,0);
    }finally{ComposerRuntime.prototype.prepareLaunch=original;await h?.close();}
  });
  it("keeps the activation-local observer alive for a factory result after deactivation clears global slots",async()=>{
    let fulfill:((pty:FakeManagedPty)=>void)|undefined;const pty=new FakeManagedPty();
    const h=await activationHarness(true,{spawn:()=>new Promise(resolve=>{fulfill=resolve;})});
    const original=CompanionRuntime.prototype.observeSpawn;let observed=0;
    CompanionRuntime.prototype.observeSpawn=async function(base,spec){observed++;return original.call(this,base,spec);};
    try{
      const launching=h.api.launchController.launch({rootMode:"default"});await settle();assert.ok(fulfill);
      const closing=deactivate();await settle();h.clock.advance(2000);h.clock.fireDue();await closing;
      fulfill(pty);await launching;assert.equal(observed,1);assert.equal(pty.terminated,true);
      assert.equal([...h.fs.entries.keys()].filter(p=>/companion-[a-f0-9]{32}$/.test(p)).length,1,"late resolution cannot manufacture exit");
    }finally{CompanionRuntime.prototype.observeSpawn=original;await h.close();}
  });
  it("begins capture shutdown before manager termination for early signals",async()=>{
    const h=await activationHarness();const order:string[]=[];
    const begin=CompanionRuntime.prototype.beginShutdown;
    CompanionRuntime.prototype.beginShutdown=function(){order.push("capture");begin.call(this);};
    try{
      await h.api.launchController.launch({rootMode:"default"});const pty=h.ptys.ptys[0]!;
      pty.terminate=async()=>{order.push("terminate");pty.emitExit({exitCode:0});};
      h.signal();await settle();h.clock.advance(2000);h.clock.fireDue();await settle();
      assert.equal(order[0],"capture");assert.ok(order.includes("terminate"));assert.deepEqual(h.reemitted,["SIGTERM"]);
    }finally{CompanionRuntime.prototype.beginShutdown=begin;await h.close();}
  });
});

describe("companion activation failure cleanup",()=>{
  for(const stage of ["commands","view"] as const)it("closes capture when "+stage+" registration rejects",async()=>{
    const begin=CompanionRuntime.prototype.beginShutdown,close=CompanionRuntime.prototype.close;
    let begun=0,closed=0;
    CompanionRuntime.prototype.beginShutdown=function(){begun++;begin.call(this);};
    CompanionRuntime.prototype.close=function(){closed++;return close.call(this);};
    try{
      await assert.rejects(activationHarness(true,undefined,stage),/synthetic activation failure/);
      assert.ok(begun>0,"capture authority must be revoked before disposing failed activation");
      assert.ok(closed>0,"failed activation must drain the capture owner");
    }finally{CompanionRuntime.prototype.beginShutdown=begin;CompanionRuntime.prototype.close=close;await deactivate();}
  });
});

/** Publish complete source through actual P1 admission/frames, then use the managed PTY exit seam. */
async function capturedPanel() {
  const h=panelHarness(true,true);let binding:CaptureBinding|undefined,protocol:CaptureProtocol|undefined;
  const prepare=h.runtime.resources.prepare.bind(h.runtime.resources),start=h.runtime.resources.startProtocol.bind(h.runtime.resources);
  h.runtime.resources.prepare=async id=>{const result=await prepare(id);if(result.ok)binding=result.value;return result;};
  h.runtime.resources.startProtocol=async (owner,options)=>{const result=await start(owner,{...options,autoPoll:false});if(result.ok)protocol=result.value;return result;};
  const prepared=await h.runtime.prepareLaunch({executable:"fixture",args:[],cwd:"C:/fixture",env:{},root:{id:"root",label:"Fixture",uri:vscode.Uri.file("C:/fixture")},importedRoots:[],skippedImportIds:[]},session);
  assert.ok(binding);assert.ok(protocol);const owner=binding,driver=protocol,pty=new FakeManagedPty();
  assert.equal(await h.runtime.observeSpawn({spawn:async spec=>{assert.equal(spec,prepared);return pty;}},prepared),pty);
  const json=(name:string)=>JSON.parse(h.fs.entries.get(resolve(owner.directory,name))!.data.toString());
  const pair=(name:string,value:unknown)=>{const text=JSON.stringify(value);h.fs.put(resolve(owner.directory,name+".upload"),"file",text);h.fs.put(resolve(owner.directory,name+".ready"),"file",JSON.stringify({v:1,basename:name+".upload",byteLength:Buffer.byteLength(text)}));};
  const envelope={v:1,token:owner.token,...fixtureTarget};
  pair("request."+json("control.json").offerId,{...envelope,kind:"epochRequest",offerId:json("control.json").offerId,predecessorEpoch:null,nativeSessionId:fixtureTarget.claudeSessionId,reason:"initial"});await driver.poll();
  const epoch=json("control.json").captureEpoch;
  pair("activate."+epoch,{...envelope,kind:"epochActivate",captureEpoch:epoch,grantId:json("control.json").grantId,nativeSessionId:fixtureTarget.claudeSessionId});await driver.poll();
  const data=JSON.stringify({kind:"assistantRow",scope:{kind:"main"},rowId:"integration-row",blocks:[{kind:"text",index:0,text:"Open `C:/exact path/a.txt` then review `$HOME/x`."}]});
  pair("frame."+epoch+".1",{...envelope,kind:"observationChunk",captureEpoch:epoch,seq:1,observationId:1,chunkIndex:0,chunkCount:1,totalByteLength:Buffer.byteLength(data),byteLength:Buffer.byteLength(data),data});await driver.poll();
  return {...h,pty,close:async()=>{pty.emitExit({exitCode:0});await settle();await h.close();}};
}

describe("companion source-to-platform assembly",()=>{
  it("copies exact source and explicit Review through real clipboard read-back without native/composer submission",async()=>{
    const previous=await vscode.env.clipboard.readText(),h=await capturedPanel();
    let renderer:ReturnType<typeof createSessionRenderer>|undefined;
    try{
      const v=h.openView(),dom=new JSDOM(v.html,{pretendToBeVisual:true});
      let terminalElement:HTMLElement|undefined;const terminalWrites:string[]=[];
      const terminal:RendererTerminal={open:parent=>{terminalElement=parent;parent.tabIndex=0;},write:text=>terminalWrites.push(text),paste:()=>{},dispose:()=>{},focus:()=>terminalElement?.focus(),onData:()=>{},onResize:()=>{},updateTheme:()=>{}};
      renderer=createSessionRenderer({document:dom.window.document,documentId,companionViewId:v.viewId()??undefined,window:dom.window as unknown as RendererWindow,
        postMessage:message=>v.receive(message),terminalFactory:{create:()=>terminal},fitTerminal:()=>{},
        createComposer:options=>{const pane=dom.window.document.createElement("section");pane.className="composer-pane";const input=dom.window.document.createElement("textarea");input.value="unchanged native draft";pane.append(input);options.parent.append(pane);return {hydrate:()=>{},handleHostMessage:()=>{},focusEditor:()=>input.focus(),setVisible:()=>{},dispose:()=>{}};}});
      v.setDeliver(message=>Promise.resolve(renderer!.handleMessage(message)));await settle();
      const document=dom.window.document,stage=document.querySelector<HTMLElement>(".terminal-stage")!,draft=document.querySelector<HTMLTextAreaElement>(".composer-pane textarea")!;
      const targets=[...document.querySelectorAll<HTMLButtonElement>("[data-target-id]")];
      assert.equal(targets.length,2);assert.equal(stage.hidden,true,"successful admission defaults to companion");
      const element=terminalElement;draft.focus();renderer.handleMessage({type:"sessionData",sessionId:session.id,data:"native output"});
      assert.deepEqual(terminalWrites,["native output"]);assert.equal(document.activeElement,draft);
      targets.find(button=>button.textContent==="Copy")!.click();await settle();
      assert.equal(await vscode.env.clipboard.readText(),"C:/exact path/a.txt");
      targets.find(button=>button.textContent==="Review")!.click();await settle();
      const review=document.querySelector<HTMLTextAreaElement>(".companion-review textarea")!;assert.ok(review);
      review.value=" reviewed literal\n";review.dispatchEvent(new dom.window.Event("input"));
      document.querySelector<HTMLButtonElement>('[aria-label="Copy reviewed value"]')!.click();await settle();
      assert.equal(await vscode.env.clipboard.readText()," reviewed literal\n");assert.deepEqual(h.writes,[]);
      assert.equal(draft.value,"unchanged native draft");
      [...document.querySelectorAll<HTMLButtonElement>("button")].find(button=>button.textContent==="Raw")!.click();await settle();
      assert.equal(stage.hidden,false);assert.equal(terminalElement,element);assert.equal(element?.isConnected,true);
      assert.equal(v.installs,1);assert.deepEqual(h.writes,[]);
    }finally{renderer?.dispose();await h.close();await vscode.env.clipboard.writeText(previous);}
  });
  it("keeps actual pending provider source posts charged after HTML disposal until carrier settlement",async()=>{
    const h=await capturedPanel();let complete:(()=>void)|undefined;
    try{
      const v=h.openView();v.setDeliver(message=>message.type==="companion"&&message.payload.kind==="companion.transferChunk"?new Promise<void>(resolve=>{complete=resolve;}):Promise.resolve());
      ready(v);await settle();assert.ok(complete);
      v.disposed.fire();h.runtime.model.dispose();
      assert.ok(h.runtime.resources.retentionUsage(session.id).globalBytes>0);
      complete();await settle();assert.equal(h.runtime.resources.retentionUsage(session.id).globalBytes,0);
    }finally{complete?.();await h.close();}
  });
});

describe("companion shutdown failure ordering",()=>{
  it("awaits manager termination even if composer close rejects",async()=>{
    const h=await activationHarness(false);await h.api.launchController.launch({rootMode:"default"});
    let release:(()=>void)|undefined;h.ptys.ptys[0]!.terminate=()=>new Promise<void>(resolve=>{release=resolve;});
    const close=ComposerRuntime.prototype.close;ComposerRuntime.prototype.close=async()=>{throw new Error("synthetic close failure");};
    let settled=false;
    const closing=deactivate().catch(()=>{}).finally(()=>{settled=true;});
    try{
      await settle();assert.ok(release);assert.equal(settled,false,"capture/composer failure cannot abandon manager termination");
      release();await closing;
    }finally{release?.();ComposerRuntime.prototype.close=close;await closing;await h.close();}
  });
});

describe("companion inactive native activation",()=>{
  it("removes all inherited capture aliases while preserving unrelated final composer environment",async()=>{
    const original=ComposerRuntime.prototype.prepareLaunch;
    ComposerRuntime.prototype.prepareLaunch=async function(spec,snapshot){
      const value=await original.call(this,spec,snapshot);
      return {...value,env:{...value.env,CLAUDE_WORKSPACES_CAPTURE_TOKEN:"old",claude_workspaces_capture_dir:"old",AUTH_FIXTURE:"retained"}};
    };
    const h=await activationHarness(false);
    try{
      await h.api.launchController.launch({rootMode:"default"});const env=h.ptys.spawnedSpecs[0]!.env;
      assert.equal(Object.keys(env).some(key=>captureEnvironmentKeys.some(field=>field===key.toUpperCase())),false);
      assert.equal(env.AUTH_FIXTURE,"retained");
    }finally{ComposerRuntime.prototype.prepareLaunch=original;await h.close();}
  });
  it("binds native controls independently of composer availability and sends one validated Escape through the manager",async()=>{
    const h=await activationHarness(false);
    try{
      await h.api.launchController.launch({rootMode:"default"});
      const received=new vscode.EventEmitter<unknown>(),disposed=new vscode.EventEmitter<void>(),posted:HostMessage[]=[];
      const view={visible:true,webview:{html:"",cspSource:"vscode-webview://fixture",asWebviewUri:(uri:vscode.Uri)=>uri,onDidReceiveMessage:received.event,
        postMessage:async(message:HostMessage)=>{posted.push(message);return true;}},onDidDispose:disposed.event,onDidChangeVisibility:new vscode.EventEmitter<void>().event} as unknown as vscode.WebviewView;
      await h.provider!.resolveWebviewView(view,{} as vscode.WebviewViewResolveContext,{} as vscode.CancellationToken);
      const viewId=new JSDOM(view.webview.html).window.document.querySelector("#app")!.getAttribute("data-companion-view-id");
      received.fire({type:"ready",documentId});received.fire({type:"companion",payload:{v:1,kind:"companion.ready",viewId,documentId}});await settle();
      const binding=binds(posted)[0];assert.ok(binding);
      const payload={v:1,kind:"companion.escape",viewId,projectionId:binding.projectionId,sessionId:binding.sessionId,generation:binding.generation,actionId:1};
      received.fire({type:"companion",payload});received.fire({type:"companion",payload});await settle();
      assert.deepEqual(h.ptys.ptys[0]!.writes,["\u001b"]);
      const results=posted.flatMap(message=>message.type==="companion"&&message.payload.kind==="companion.actionResult"?[message.payload]:[]);
      assert.equal(results[0]!.status,"inputSent");
      assert.equal(results.some(result=>(result.status as string)==="interrupted"),false);
      await h.handlers.get("claudeWorkspaces.closeSession")!();
      received.fire({type:"companion",payload:{...payload,actionId:2}});await settle();assert.deepEqual(h.ptys.ptys[0]!.writes,["\u001b"]);
      received.dispose();disposed.dispose();
    }finally{await h.close();}
  });
});

describe("companion document callback ownership",()=>{
  it("pairs a current early ready but rejects wrong view/document binds and queued actions from replaced HTML",async()=>{
    const h=panelHarness();try{
      const old=h.openView(),viewId=old.viewId();
      old.receive({type:"companion",payload:{v:1,kind:"companion.ready",viewId:"0".repeat(32),documentId}});
      old.receive({type:"companion",payload:{v:1,kind:"companion.ready",viewId,documentId}});
      await settle();assert.equal(binds(h.posted).length,0);
      old.receive({type:"ready",documentId:secondDocumentId});await settle();assert.equal(binds(h.posted).length,0);
      old.receive({type:"ready",documentId});await settle();assert.equal(binds(h.posted).length,1);
      old.receive({type:"input",sessionId:session.id,data:"queued old input",isPromptSubmission:false});
      const current=h.openView();await settle();assert.equal(h.writes.length,0);assert.notEqual(current.viewId(),viewId);
      ready(current);await settle();const count=binds(h.posted).length;
      old.callbacks[0]!({type:"companion",payload:{v:1,kind:"companion.ready",viewId:current.viewId(),documentId}});
      await settle();assert.equal(binds(h.posted).length,count);
      (current.view as unknown as {visible:boolean}).visible=false;current.visibility.fire();
      (current.view as unknown as {visible:boolean}).visible=true;current.visibility.fire();assert.equal(current.installs,1);
      assert.deepEqual(h.visibility.slice(-2),[false,true]);
    }finally{await h.close();}
  });
});


/** Exercise the default capability callback with synthetic probes and an actual private hook directory. */
async function metadataHarness(get:(executable:string)=>Promise<ClaudeCapabilities>, options:{empty?:boolean;hooks?:boolean;fresh?:boolean}={}) {
  const scratch=resolve(__dirname,"../../../.tmp");await mkdir(scratch,{recursive:true});
  const directory=await mkdtemp(resolve(scratch,"companion-metadata-"));
  try {
    const h=await activationHarness(false,undefined,undefined,dependencies=>({...dependencies,
      claudeCapabilities:options.fresh?undefined:{get:executable=>executable==="claude"?Promise.resolve({sessionPersistence:true,settingsFile:false}):get(executable)},
      attentionNotifications:{notify:()=>{}},isWindowFocused:()=>true,
      attentionChannelFactory:async()=>options.hooks===false?{status:"disabled",reason:"non-windows"}:{status:"ready",channel:{id:documentId,path:directory,close:async()=>{},dispose:()=>{}}},
      companion:{...dependencies.companion!,capability:undefined,
        qualifiedBuilds:options.empty?[]:[{platform:"win32",arch:"x64",cliVersion:"2.1.317",cliBuild:"2.1.317",schemaVersion:1,adapterId:"synthetic",receipt:"synthetic metadata test only"}]}
    }));
    return {...h,close:async()=>{try{await h.close();}finally{await rm(directory,{recursive:true,force:true});}}};
  }catch(error){await rm(directory,{recursive:true,force:true});throw error;}
}
const availableRelease=(version:string):ClaudeCapabilities=>({sessionPersistence:true,settingsFile:false,completionReporter:"available",version});

describe("companion production metadata assembly",()=>{
  const original=ComposerRuntime.prototype.prepareLaunch;
  beforeEach(()=>{ComposerRuntime.prototype.prepareLaunch=async function(spec,snapshot){
    const composed=await original.call(this,spec,snapshot);
    return {...composed,executable:"capture-a",env:{...composed.env,claude_workspaces_capture_token:"stale",AUTH_FIXTURE:"untouched"}};
  };});
  afterEach(()=>{ComposerRuntime.prototype.prepareLaunch=original;});
  it("admits the exact observed release through the default callback and clears metadata after preparation",async()=>{
    const calls:string[]=[];const h=await metadataHarness(async executable=>{calls.push(executable);return availableRelease("2.1.317");});
    const prepare=CompanionRuntime.prototype.prepareLaunch;let captured:{runtime:CompanionRuntime;spec:LaunchSpec;snapshot:ManagedSessionSnapshot}|undefined;
    CompanionRuntime.prototype.prepareLaunch=async function(spec,snapshot){captured={runtime:this,spec,snapshot};return prepare.call(this,spec,snapshot);};
    try{await h.api.launchController.launch({rootMode:"default"});assert.deepEqual(calls,["capture-a"]);
      assert.ok(h.ptys.spawnedSpecs[0]!.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN);assert.equal(h.ptys.spawnedSpecs[0]!.env.AUTH_FIXTURE,"untouched");
      assert.ok(captured);const replay=await prepare.call(captured.runtime,captured.spec,captured.snapshot);
      assert.equal(replay.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,undefined,"the exact spec does not retain probe authority after preparation");
    }finally{CompanionRuntime.prototype.prepareLaunch=prepare;await h.close();}
  });
  for(const [label,result] of [
    ["mismatched release",availableRelease("2.1.318")],
    ["missing release",{sessionPersistence:true,settingsFile:false,completionReporter:"available"}],
    ["invalid release",availableRelease(" 2.1.317")],
    ["different source spelling",availableRelease("02.1.317")],
    ["unavailable native module",{...availableRelease("2.1.317"),completionReporter:"disabled"}],
    ["probe rejection",undefined]
  ] as const)it("keeps ordinary launch and removes capture aliases for "+label,async()=>{
    let calls=0;const h=await metadataHarness(async()=>{calls++;if(!result)throw new Error("synthetic probe failure");return result;});
    try{await h.api.launchController.launch({rootMode:"default"});assert.equal(calls,1);assert.equal(h.ptys.spawnedSpecs.length,1);
      assert.equal(Object.keys(h.ptys.spawnedSpecs[0]!.env).some(key=>key.toUpperCase().startsWith("CLAUDE_WORKSPACES_CAPTURE_")),false);
      assert.equal(h.ptys.spawnedSpecs[0]!.env.AUTH_FIXTURE,"untouched");
    }finally{await h.close();}
  });
  it("observes successive release changes instead of retaining a previously admitted release",async()=>{
    let calls=0;const h=await metadataHarness(async()=>availableRelease(++calls===1?"2.1.317":"2.1.318"));
    try{await h.api.launchController.launch({rootMode:"default"});await h.api.launchController.launch({rootMode:"default"});
      assert.equal(calls,2);assert.ok(h.ptys.spawnedSpecs[0]!.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN);
      assert.equal(h.ptys.spawnedSpecs[1]!.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,undefined);
    }finally{await h.close();}
  });
  it("keeps interleaved final executable metadata on its own spec",async()=>{
    let index=0;ComposerRuntime.prototype.prepareLaunch=async function(spec,snapshot){const composed=await original.call(this,spec,snapshot);return {...composed,executable:++index===1?"capture-a":"capture-b"};};
    let release:((value:ClaudeCapabilities)=>void)|undefined;const calls:string[]=[];
    const h=await metadataHarness(async executable=>{calls.push(executable);return executable==="capture-a"?new Promise(resolve=>{release=resolve;}):availableRelease("2.1.318");});
    try{const first=h.api.launchController.launch({rootMode:"default"});await settle();assert.ok(release);
      await h.api.launchController.launch({rootMode:"default"});release(availableRelease("2.1.317"));await first;
      assert.deepEqual(calls,["capture-a","capture-b"]);assert.equal(h.ptys.spawnedSpecs.find(s=>s.executable==="capture-b")!.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,undefined);
      assert.ok(h.ptys.spawnedSpecs.find(s=>s.executable==="capture-a")!.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN);
    }finally{release?.(availableRelease("2.1.317"));await h.close();}
  });
  for(const options of [{empty:true},{hooks:false}])it("skips fresh metadata when capture cannot be admitted "+JSON.stringify(options),async()=>{
    let calls=0;const h=await metadataHarness(async()=>{calls++;return availableRelease("2.1.317");},options);
    try{await h.api.launchController.launch({rootMode:"default"});assert.equal(calls,0);assert.equal(h.ptys.spawnedSpecs.length,1);
      assert.equal(h.ptys.spawnedSpecs[0]!.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,undefined);
    }finally{await h.close();}
  });
  it("does not admit or spawn a session closed while its fresh probe is pending",async()=>{
    let release:((value:ClaudeCapabilities)=>void)|undefined;
    const h=await metadataHarness(()=>new Promise(resolve=>{release=resolve;}));
    try{const launching=h.api.launchController.launch({rootMode:"default"});await settle();assert.ok(release);
      await h.handlers.get("claudeWorkspaces.closeSession")!();release(availableRelease("2.1.317"));await launching;
      assert.equal(h.ptys.spawnedSpecs.length,0);assert.equal([...h.fs.entries.keys()].filter(p=>/companion-[a-f0-9]{32}$/.test(p)).length,0);
    }finally{release?.(availableRelease("2.1.317"));await h.close();}
  });
  it("creates a fresh production probe per final launch rather than reusing the activation cache",async()=>{
    const get=ClaudeCapabilityProbe.prototype.get,instances:ClaudeCapabilityProbe[]=[];
    ClaudeCapabilityProbe.prototype.get=async function(executable){if(executable==="capture-a")instances.push(this);return availableRelease("2.1.317");};
    let h:Awaited<ReturnType<typeof metadataHarness>>|undefined;
    try{h=await metadataHarness(async()=>{throw new Error("unused injected probe");},{fresh:true});
      await h.api.launchController.launch({rootMode:"default"});await h.api.launchController.launch({rootMode:"default"});
      assert.equal(instances.length,2);assert.notEqual(instances[0],instances[1]);
    }finally{ClaudeCapabilityProbe.prototype.get=get;await h?.close();}
  });
  it("rejects metadata if the managed generation changes while probing",async()=>{
    let release:((value:ClaudeCapabilities)=>void)|undefined,retarget=false;
    const targetFor=ComposerRuntime.prototype.targetFor;
    ComposerRuntime.prototype.targetFor=function(id){const target=targetFor.call(this,id);return target&&retarget?{...target,generation:"replacement-generation"}:target;};
    let h:Awaited<ReturnType<typeof metadataHarness>>|undefined;
    try{h=await metadataHarness(()=>new Promise(resolve=>{release=resolve;}));
      const launching=h.api.launchController.launch({rootMode:"default"});await settle();assert.ok(release);
      retarget=true;release(availableRelease("2.1.317"));await launching;
      assert.equal(h.ptys.spawnedSpecs.length,1);assert.equal(h.ptys.spawnedSpecs[0]!.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,undefined);
      assert.equal([...h.fs.entries.keys()].filter(p=>/companion-[a-f0-9]{32}$/.test(p)).length,0);
    }finally{release?.(availableRelease("2.1.317"));ComposerRuntime.prototype.targetFor=targetFor;await h?.close();}
  });

  it("skips metadata on an unsupported actual host architecture",async()=>{
    const descriptor=Object.getOwnPropertyDescriptor(process,"arch")!;let calls=0;
    const h=await metadataHarness(async()=>{calls++;return availableRelease("2.1.317");});
    try{Object.defineProperty(process,"arch",{...descriptor,value:"arm64"});
      await h.api.launchController.launch({rootMode:"default"});assert.equal(calls,0);assert.equal(h.ptys.spawnedSpecs.length,1);
      assert.equal(h.ptys.spawnedSpecs[0]!.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,undefined);
    }finally{Object.defineProperty(process,"arch",descriptor);await h.close();}
  });
  it("clears per-spec metadata when runtime preparation rejects",async()=>{
    const prepare=CompanionRuntime.prototype.prepareLaunch;let captured:{runtime:CompanionRuntime;spec:LaunchSpec;snapshot:ManagedSessionSnapshot}|undefined;
    const h=await metadataHarness(async()=>availableRelease("2.1.317"));
    CompanionRuntime.prototype.prepareLaunch=async function(spec,snapshot){captured={runtime:this,spec,snapshot};throw new Error("synthetic preparation failure");};
    try{await h.api.launchController.launch({rootMode:"default"});assert.ok(captured);assert.equal(h.ptys.spawnedSpecs.length,0);
      const replay=await prepare.call(captured.runtime,captured.spec,captured.snapshot);
      assert.equal(replay.env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,undefined);
    }finally{CompanionRuntime.prototype.prepareLaunch=prepare;await h.close();}
  });

});
