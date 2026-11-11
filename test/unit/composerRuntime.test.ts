import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import type * as vscode from "vscode";
import { ComposerRuntime } from "../../src/composer/composerRuntime";
import type { ComposerFilesOptions } from "../../src/composer/composerFiles";
import { ComposerStore } from "../../src/composer/composerStore";
import { createClaudeComposerAdapter, supportsComposerVersion, type ManagedClaudeComposerAdapter } from "../../src/composer/claudeComposerAdapter";
import type { ComposerCommand, ComposerTarget, SubmitRequest, NativeComposerDraft } from "../../src/composer/composerTypes";
import type { ComposerHostMessage } from "../../src/panel/composerProtocol";
import type { LaunchSpec } from "../../src/launch/launchPlanner";
import { SessionManager } from "../../src/sessions/sessionManager";
import type { ManagedSessionSnapshot } from "../../src/sessions/sessionTypes";
import { OutputLogger } from "../../src/logging/outputLogger";
import { ComposerBroker, type ComposerTransport, type BridgeBinding } from "../../src/composer/composerBroker";
import { FakeManagedPtyFactory } from "../support/fakeManagedPty";
import { composerFirstUuid as first, composerSecondUuid as second, ComposerMemento, composerSession } from "../support/composerHarness";

const documentId="33333333-3333-4333-8333-333333333333";
const requestId="44444444-4444-4444-8444-444444444444";
async function harness(version="2.1.299",files:Partial<ComposerFilesOptions>={},initiallyReady=true,adapterFactory?:(resolve:(id:string)=>ComposerTarget|undefined)=>Promise<ManagedClaudeComposerAdapter>) {
  const state=new ComposerMemento();const store=new ComposerStore(state);const factory=new FakeManagedPtyFactory();
  const root=path.resolve(".tmp/runtime-root");
  const spec:LaunchSpec={executable:"fixture-claude",args:[],env:{KEEP:"original"},cwd:root,root:{id:"root",label:"Fixture",uri:{fsPath:root,scheme:"file"} as vscode.Uri},importedRoots:[],skippedImportIds:[]};
  const messages:ComposerHostMessage[]=[];const submitted:SubmitRequest[]=[];const accepted:string[]=[];const bindings=new Map<string,ComposerTarget>();
  const focusContexts:Array<readonly [boolean,boolean]>=[];
  const viewFocusContexts:Array<boolean|undefined>=[];
  let ids=0;let keybindings=0;let currentDocument:string|undefined=documentId;let allowed=true;
  let restoreHook:((session:ManagedSessionSnapshot)=>Promise<void>)|undefined;
  let listCommands:()=>Promise<readonly ComposerCommand[]>=async()=>[{invocation:"/context",description:"Context",source:"builtin"}];
  const ready=new Set<string>();const availabilityListeners=new Set<()=>void>();
  let readDraft:(target:ComposerTarget)=>Promise<NativeComposerDraft|undefined>=async()=>undefined;
  let clearDraft:(target:ComposerTarget,source:NativeComposerDraft,stillCurrent?:()=>boolean)=>Promise<boolean>=async()=>false;
  const fakeAdapter:ManagedClaudeComposerAdapter & {onDidChangeAvailability:(listener:()=>void)=>{dispose:()=>void}}={
    onDidChangeAvailability:listener=>{availabilityListeners.add(listener);return {dispose:()=>{availabilityListeners.delete(listener);}};},
    readDraft:target=>readDraft(target),clearDraft:(target,source,stillCurrent)=>clearDraft(target,source,stillCurrent),
    prepareLaunch:async(spec,target,nativeVersion)=>{if(!supportsComposerVersion(nativeVersion))return spec;bindings.set(target.sessionId,target);if(initiallyReady)ready.add(target.sessionId);return {...spec,env:{...spec.env,COMPOSER_FIXTURE:"prepared"}};},
    isAvailable:target=>ready.has(target.sessionId) && JSON.stringify(bindings.get(target.sessionId))===JSON.stringify(target),
    listCommands:async()=>listCommands(),submit:async request=>{submitted.push(request);return {status:"accepted",submissionId:request.submissionId,revision:request.draft.revision};},
    disposeSession:async target=>{bindings.delete(target.sessionId);},close:async()=>{bindings.clear();}
  };
  const adapter:ManagedClaudeComposerAdapter=adapterFactory===undefined?fakeAdapter:await adapterFactory(id=>runtime?.targetFor(id));
  const manager:SessionManager=new SessionManager({ptyFactory:factory,createId:()=>`pty-${++ids}`,now:()=>0,logger:new OutputLogger({name:"Fixture",append:()=>{},appendLine:()=>{},replace:()=>{},clear:()=>{},show:()=>{},hide:()=>{},dispose:()=>{}}),notifications:{notify:()=>{}},
    prepareLaunch:(spec,session)=>runtime.prepareLaunch(spec,session),beforeTerminate:()=>runtime.controller.flush()});
  const runtime:ComposerRuntime=new ComposerRuntime({store,adapter,sessions:manager,documentId:()=>currentDocument,emit:message=>messages.push(message),
    getCapabilities:async()=>({sessionPersistence:true,settingsFile:true,completionReporter:"available",version}),expectsReporter:()=>true,
    setFocusContext:async(focused,picker,viewFocused?:boolean)=>{focusContexts.push([focused,picker]);viewFocusContexts.push(viewFocused);},configureShortcuts:async()=>{keybindings++;},
    validateRestore:async()=>allowed,launchRestore:async()=>{const session=await manager.launch(spec,{claudeSessionId:second});if(session)await restoreHook?.(session);return session;},
    ownsResumable:()=>false,operationPending:()=>false,forgetResumable:async()=>{},onPromptAccepted:sessionId=>accepted.push(sessionId),
    files:{findFiles:async()=>[],pick:async()=>undefined,...files}});
  return {runtime,manager,store,state,factory,messages,submitted,accepted,bindings,spec,focusContexts,viewFocusContexts,setReadDraft:(fn:typeof readDraft)=>{readDraft=fn;},setClearDraft:(fn:typeof clearDraft)=>{clearDraft=fn;},
    markReady:(sessionId:string)=>{ready.add(sessionId);for(const listener of availabilityListeners)listener();},
    setCatalog:(fn:typeof listCommands)=>{listCommands=fn;},setRootAllowed:(value:boolean)=>{allowed=value;},setDocument:(value:string|undefined)=>{currentDocument=value;},
    setRestoreHook:(hook:typeof restoreHook)=>{restoreHook=hook;},
    get keybindings(){return keybindings;},async close(){await runtime.close();manager.dispose();store.dispose();}};
}
const draft=(text:string)=>({revision:1,text,selection:{anchor:0,head:text.length}});

describe("composer host composition",()=>{
  it("captures after late native readiness without reopening the editor",async function(){
    this.timeout(8_000);
    const h=await harness("2.1.322",{},false);let reads=0,clears=0;
    h.setReadDraft(async()=>{reads++;return {text:"native startup",cursor:14};});
    h.setClearDraft(async(target,source,stillCurrent)=>{
      assert.equal(h.store.get(target.claudeSessionId)?.draft.text,source.text,"The editor copy must be durable before native clear");
      clears++;return stillCurrent?.()??false;
    });
    try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
      await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:true});
      await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(reads,0,"Host binding must not consume the native read deadline during startup");
      h.markReady(session.id);
      for(let tick=0;tick<30 && clears===0;tick++)await new Promise<void>(resolve=>setImmediate(resolve));
      assert.equal(h.runtime.controller.getDraft(h.runtime.targetFor(session.id)!)?.text,"native startup");
      assert.equal(reads,1);assert.equal(clears,1);
      h.markReady(session.id);await new Promise<void>(resolve=>setImmediate(resolve));
      assert.equal(reads,1,"Duplicate readiness cannot start another capture");assert.equal(clears,1);
    }finally{await h.close();}
  });

  it("composes a delayed authenticated ready frame through the real adapter into one startup capture",async function(){
    this.timeout(10_000);
    const storageRoot=path.resolve(".tmp/227-runtime-readiness");await mkdir(storageRoot,{recursive:true});
    const storage=await mkdtemp(path.join(storageRoot,"composition-"));
    let binding:BridgeBinding|undefined;let reads=0,clears=0,keys=0;
    let realAdapter:ManagedClaudeComposerAdapter|undefined;
    let h:Awaited<ReturnType<typeof harness>>|undefined;
    try{
      h=await harness("2.1.322",{},false,async resolve=>{
        realAdapter=await createClaudeComposerAdapter({storagePath:storage,platform:"win32",resolveTarget:resolve,
          writeQueue:async()=>{keys++;},transportFactory:async current=>{
            binding=current;
            return {close:async()=>{},exchange:async(request,prepared)=>{
              const identity={protocol:1,token:request.token,requestId:request.requestId,target:request.target};
              if(request.operation==="readDraft"){reads++;return {...identity,kind:"draft",draft:{text:"native startup",cursor:14}};}
              assert.equal(request.operation,"clearDraft");assert.equal(h!.store.get(first)?.draft.text,"native startup");
              await prepared({...identity,kind:"prepared",queueBinding:"clear-paste"});clears++;
              return {...identity,kind:"draftCleared",cleared:true};
            }};
          }});
        return realAdapter;
      });
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
      await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:true});assert.ok(binding);assert.ok(realAdapter);
      assert.equal(h.factory.spawnedSpecs[0]?.env.CLAUDE_WORKSPACES_COMPOSER_CHANNEL,binding.directory,"Binding injection precedes native readiness");
      await writeFile(path.join(binding.directory,"native-ready.json"),JSON.stringify({protocol:1,token:binding.token,target:{...binding.target,generation:second},kind:"ready"}));
      await delay(5_100);assert.equal(realAdapter.isAvailable(binding.target),false);assert.equal(reads,0);
      const ready={protocol:1,token:binding.token,target:binding.target,kind:"ready"};
      await writeFile(path.join(binding.directory,"native-ready.json"),JSON.stringify(ready));
      for(let tick=0;tick<200 && clears===0;tick++)await delay(5);
      assert.equal(realAdapter.isAvailable(binding.target),true);assert.equal(reads,1);assert.equal(clears,1);assert.equal(keys,1);
      assert.equal(h.runtime.controller.getDraft(binding.target)?.text,"native startup");
      assert.ok(h.messages.some(message=>message.type==="composerImportStatus" && message.status==="moved"));
      await writeFile(path.join(binding.directory,"native-ready.json"),JSON.stringify(ready));await delay(300);
      assert.equal(reads,1);assert.equal(clears,1);assert.equal(keys,1);
    }finally{
      await h?.close();
      assert.ok(path.resolve(storage).startsWith(storageRoot+path.sep) && path.basename(storage).startsWith("composition-"));
      await rm(storage,{recursive:true,force:true});
    }
  });
  for(const change of ["typed then empty","empty revision"] as const){
    it(`does not revive capture after ${change} before readiness while persistence is held`,async()=>{
      const h=await harness("2.1.322",{},false);let reads=0;const pending:Promise<unknown>[]=[];
      h.setReadDraft(async()=>{reads++;return {text:"native source",cursor:13};});
      const held=h.state.holdNextWrite();
      try{
        const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
        await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:true});const target=h.runtime.targetFor(session.id)!;
        pending.push(h.runtime.handle({type:"composerDraftChanged",target,draft:change==="typed then empty"?draft("temporary"):{revision:1,text:"",selection:{anchor:0,head:0}}}));
        pending.push(h.runtime.controller.flush());await held.started;
        if(change==="typed then empty")pending.push(h.runtime.handle({type:"composerDraftChanged",target,draft:{revision:2,text:"",selection:{anchor:0,head:0}}}));
        h.markReady(session.id);for(let tick=0;tick<30;tick++)await new Promise<void>(resolve=>setImmediate(resolve));
        assert.equal(reads,0,"Readiness must not create a new capture intent from an edited empty draft");
        assert.equal(h.runtime.controller.getDraft(target)?.text,"");
        h.manager.rename(session.id,"Metadata refresh");await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(reads,0);
        held.release();await Promise.all(pending);
        await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:false});
        await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:true});
        assert.equal(reads,1,"An explicit later show creates a fresh capture intent");
      }finally{held.release();await Promise.all(pending);await h.close();}
    });
  }
  it("does not revive capture when an empty revision arrives during readiness selection",async()=>{
    const h=await harness("2.1.322",{},false);let reads=0;
    h.setReadDraft(async()=>{reads++;return {text:"native source",cursor:13};});
    try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
      await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:true});const target=h.runtime.targetFor(session.id)!;
      h.markReady(session.id);
      const saving=h.runtime.handle({type:"composerDraftChanged",target,draft:{revision:1,text:"",selection:{anchor:0,head:0}}});
      for(let tick=0;tick<30;tick++)await new Promise<void>(resolve=>setImmediate(resolve));
      assert.equal(reads,0,"The original capture baseline must be checked where native capture begins");
      assert.deepEqual(h.runtime.controller.getDraft(target),{revision:1,text:"",selection:{anchor:0,head:0}});
      await h.runtime.controller.flush();await saving;
    }finally{await h.close();}
  });
  it("keeps a hidden startup capture canceled and rearms only on an explicit later show",async()=>{
    const h=await harness("2.1.322",{},false);let reads=0;h.setReadDraft(async()=>{reads++;return {text:"native source",cursor:13};});
    try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
      await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:true});
      await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:false});h.markReady(session.id);
      for(let tick=0;tick<20;tick++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(reads,0);
      await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:true});assert.equal(reads,1);
    }finally{await h.close();}
  });
  it("captures only the newly selected visible empty target when readiness arrives out of order",async()=>{
    const h=await harness("2.1.322",{},false);const reads:string[]=[];
    h.setReadDraft(async target=>{reads.push(target.sessionId);return {text:"native source",cursor:13};});
    try{
      const one=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(one);await h.runtime.documentReady();
      await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:true});
      const two=await h.manager.launch(h.spec,{claudeSessionId:second});assert.ok(two);
      h.markReady(one.id);await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(reads,[]);
      h.markReady(two.id);for(let tick=0;tick<20;tick++)await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(reads,[two.id]);
      h.manager.activate(one.id);for(let tick=0;tick<20;tick++)await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(reads,[two.id,one.id]);
    }finally{await h.close();}
  });
  it("does not revive a retired document capture and accepts a fresh document intent",async()=>{
    const h=await harness("2.1.322",{},false);let reads=0;h.setReadDraft(async()=>{reads++;return {text:"native source",cursor:13};});
    try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
      await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:true});h.setDocument(undefined);await h.runtime.documentDisposed();h.markReady(session.id);
      for(let tick=0;tick<20;tick++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(reads,0);
      h.setDocument(second);await h.runtime.documentReady();for(let tick=0;tick<20;tick++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(reads,1);
    }finally{await h.close();}
  });
  it("does not rearm a changed document solely because native availability refreshes",async()=>{
    const h=await harness("2.1.322",{},false);let reads=0;h.setReadDraft(async()=>{reads++;return {text:"native source",cursor:13};});
    try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
      await h.runtime.handle({type:"composerVisibilityChanged",documentId,visible:true});h.setDocument(second);h.markReady(session.id);
      for(let tick=0;tick<20;tick++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(reads,0,"Only a new document-ready intent may rearm capture");
      await h.runtime.documentReady();for(let tick=0;tick<20;tick++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(reads,1);
    }finally{await h.close();}
  });
  it("ignores readiness from an exited process and captures the replacement generation once",async()=>{
    const h=await harness("2.1.322",{},false);const reads:string[]=[];h.setReadDraft(async target=>{reads.push(target.sessionId);return {text:"native source",cursor:13};});
    try{
      const old=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(old);await h.runtime.documentReady();const oldTarget=h.runtime.targetFor(old.id)!;
      h.factory.ptys[0]!.emitExit({exitCode:0});await new Promise<void>(resolve=>setImmediate(resolve));
      const replacement=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(replacement);assert.notEqual(h.runtime.targetFor(replacement.id)?.generation,oldTarget.generation);
      h.markReady(old.id);await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(reads,[]);
      h.markReady(replacement.id);for(let tick=0;tick<20;tick++)await new Promise<void>(resolve=>setImmediate(resolve));assert.deepEqual(reads,[replacement.id]);
    }finally{await h.close();}
  });
  it("preserves an in-flight native move across same-target metadata refresh after readiness",async()=>{
    const h=await harness("2.1.322",{},false);let reads=0,clears=0;let entered!:()=>void,release!:()=>void;
    const started=new Promise<void>(resolve=>{entered=resolve;});const gate=new Promise<void>(resolve=>{release=resolve;});
    h.setReadDraft(async()=>{reads++;return {text:"native source",cursor:13};});
    h.setClearDraft(async(target,source,stillCurrent)=>{assert.equal(h.store.get(target.claudeSessionId)?.draft.text,source.text);entered();await gate;clears++;return stillCurrent?.()??false;});
    try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();h.markReady(session.id);await started;
      h.manager.rename(session.id,"Metadata only");await new Promise<void>(resolve=>setImmediate(resolve));release();
      for(let tick=0;tick<20;tick++)await new Promise<void>(resolve=>setImmediate(resolve));assert.equal(reads,1);assert.equal(clears,1);
      assert.ok(h.messages.some(message=>message.type==="composerImportStatus" && message.status==="moved"));
    }finally{release();await h.close();}
  });
  it("focuses the shown editor while its native draft read is held",async()=>{
    const h=await harness();let release!:(value:NativeComposerDraft|undefined)=>void;
    const held=new Promise<NativeComposerDraft|undefined>(resolve=>{release=resolve;});
    try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
      h.setReadDraft(()=>held);h.messages.length=0;const focusing=h.runtime.command("focus");
      await new Promise<void>(resolve=>setImmediate(resolve));
      assert.ok(h.messages.some(m=>m.type==="composerFocus" && m.destination==="editor"),"Focus must not wait for a native bridge response");
      release(undefined);await focusing;
    }finally{release(undefined);await h.close();}
  });
  it("tracks document-only terminal focus without a canonical session and ignores retired documents",async()=>{
    const h=await harness();try{
      await h.runtime.documentReady();
      const message={type:"composerFocusChanged",documentId,focused:false,pickerFocused:false,viewFocused:true};
      await h.runtime.handle(message);assert.equal(h.viewFocusContexts.at(-1),true);
      assert.deepEqual(h.focusContexts.at(-1),[false,false]);
      h.setDocument(second);await h.runtime.documentReady();
      await h.runtime.handle(message);assert.equal(h.viewFocusContexts.at(-1),false);
    }finally{await h.close();}
  });
  it("owns native view focus for terminal focus and clears it when the document retires",async()=>{
    const h=await harness();try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
      const target=h.runtime.targetFor(session.id)!;
      await h.runtime.handle({type:"composerFocusChanged",target,documentId,focused:false,pickerFocused:false,viewFocused:true});
      assert.equal(h.viewFocusContexts.at(-1),true);assert.deepEqual(h.focusContexts.at(-1),[false,false]);
      h.setDocument(undefined);await h.runtime.documentDisposed();assert.equal(h.viewFocusContexts.at(-1),false);
    }finally{await h.close();}
  });
  it("discards in-flight validation when the document or draft changes",async()=>{
    for(const change of ["document","draft"]){
      let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
      let fileChecks=0;
      const h=await harness("2.1.299",{realpath:async p=>{await gate;return p;},isFile:async()=>{fileChecks++;return true;}});
      try{
        const one=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(one);await h.runtime.documentReady();const target=h.runtime.targetFor(one.id)!;
        await h.runtime.handle({type:"composerDraftChanged",target,draft:draft('@"present.ts"')});
        const checking=h.runtime.handle({type:"composerValidateReferences",target,documentId,requestId,revision:1,paths:["present.ts"]});
        if(change==="document")h.setDocument(second);
        else await h.runtime.handle({type:"composerDraftChanged",target,draft:{...draft("newer"),revision:2}});
        release();await checking;assert.equal(h.messages.some(m=>m.type==="composerReferenceValidation"),false);assert.equal(fileChecks,0);
      }finally{release();await h.close();}
    }
  });
  it("returns reference validation only for the requesting current document and draft revision",async()=>{
    const h=await harness("2.1.299",{realpath:async p=>p,isFile:async()=>true});
    try{
      const one=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(one);await h.runtime.documentReady();const target=h.runtime.targetFor(one.id)!;
      await h.runtime.handle({type:"composerDraftChanged",target,draft:draft('@"present.ts"')});
      await h.runtime.handle({type:"composerValidateReferences",target,documentId,requestId,revision:1,paths:["present.ts"]});
      const result=h.messages.filter(m=>m.type==="composerReferenceValidation").at(-1);
      assert.deepEqual(result && result.results,[{value:"present.ts",status:"valid"}]);
      h.messages.length=0;
      await h.runtime.handle({type:"composerValidateReferences",target,documentId,requestId,revision:0,paths:["present.ts"]});
      await h.runtime.handle({type:"composerValidateReferences",target,documentId:first,requestId,revision:1,paths:["present.ts"]});
      assert.equal(h.messages.some(m=>m.type==="composerReferenceValidation"),false);
    }finally{await h.close();}
  });
  it("shows native catalog failures as unavailable while accepting authenticated empty catalogs",async()=>{
    const h=await harness();try{
      const one=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(one);await h.runtime.documentReady();const target=h.runtime.targetFor(one.id)!;
      const broker=new ComposerBroker({resolveTarget:id=>h.runtime.targetFor(id)});
      const transport:ComposerTransport={exchange:async()=>{throw new Error("Controlled native transport failure");},close:async()=>{}};
      broker.register(target,"a".repeat(64),transport,async()=>{});h.setCatalog(()=>broker.listCommands(target));
      await h.runtime.handle({type:"composerRequestCatalog",target,requestId});
      const failed=h.messages.filter(m=>m.type==="composerCatalog").at(-1);assert.equal(failed?.status,"unavailable");
      transport.exchange=async message=>({protocol:1,token:message.token,requestId:message.requestId,target:message.target,kind:"catalog",commands:[]});
      await h.runtime.handle({type:"composerRequestCatalog",target,requestId});
      const empty=h.messages.filter(m=>m.type==="composerCatalog").at(-1);assert.equal(empty?.status,"ready");assert.deepEqual(empty?.commands,[]);await broker.close();
    }finally{await h.close();}
  });
  it("does not retarget a native Send intent across an awaited session refresh",async()=>{
    const h=await harness();let release:(()=>void)|undefined;
    try{
      const one=await h.manager.launch(h.spec,{claudeSessionId:first});const two=await h.manager.launch(h.spec,{claudeSessionId:second});assert.ok(one && two);
      h.manager.activate(one.id);await h.runtime.documentReady();const target=h.runtime.targetFor(one.id)!;
      const held=h.state.holdNextWrite();release=held.release;
      const updating=h.runtime.handle({type:"composerDraftChanged",target,draft:draft("session A draft")});
      const flushing=h.runtime.controller.flush();await held.started;
      h.manager.rename(one.id,"Renamed A");const sending=h.runtime.command("submit");h.manager.activate(two.id);
      held.release();await Promise.all([updating,flushing,sending]);await new Promise<void>(resolve=>setImmediate(resolve));
      assert.equal(h.messages.some(message=>message.type==="composerAction" && message.action==="submit"),false);
      assert.equal(h.submitted.length,0);assert.deepEqual(h.factory.ptys.flatMap(pty=>pty.writes),[]);
    }finally{release?.();await h.close();}
  });
  it("retains outgoing-editor edits that arrive while a session switch is waiting for storage",async()=>{
    const h=await harness();let release:(()=>void)|undefined;
    try{
      const one=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(one);await h.runtime.documentReady();const target=h.runtime.targetFor(one.id)!;
      const edit=h.runtime.handle({type:"composerDraftChanged",target,draft:draft("first edit")});
      const held=h.state.holdNextWrite();release=held.release;
      await h.manager.launch(h.spec,{claudeSessionId:second});await held.started;
      const late=h.runtime.handle({type:"composerDraftChanged",target,draft:{...draft("typed while outgoing editor was displayed"),revision:2}});
      held.release();await Promise.all([edit,late]);await h.runtime.documentReady();await h.runtime.controller.flush();
      assert.equal(h.store.get(first)?.draft.text,"typed while outgoing editor was displayed");
    }finally{release?.();await h.close();}
  });
  it("clears composer shortcut contexts when the focused session retires",async()=>{
    const h=await harness();try{
      const one=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(one);await h.runtime.documentReady();const target=h.runtime.targetFor(one.id)!;
      await h.runtime.handle({type:"composerFocusChanged",target,documentId,focused:true,pickerFocused:false,viewFocused:true});
      assert.deepEqual(h.focusContexts.at(-1),[true,false]);
      await h.manager.close(one.id);h.factory.ptys[0]!.emitExit({exitCode:0});
      await new Promise<void>(resolve=>setImmediate(resolve));
      assert.deepEqual(h.focusContexts.at(-1),[false,false]);
    }finally{await h.close();}
  });
  it("flushes a retired renderer while keeping the live session adapter available",async()=>{
    const h=await harness();try{const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
      const target=h.runtime.targetFor(session.id)!;await h.runtime.handle({type:"composerDraftChanged",target,draft:draft("retired document")});
      h.setDocument(undefined);await (h.runtime as ComposerRuntime & {documentDisposed():Promise<void>}).documentDisposed();
      assert.equal(h.store.get(first)?.draft.text,"retired document");assert.ok(h.bindings.has(session.id));
    }finally{await h.close();}
  });
  it("prepares the owned launch and routes native commands without raw terminal input",async()=>{
    const h=await harness();try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();
      const target=h.runtime.targetFor(session.id);assert.ok(target);
      assert.equal(h.factory.spawnedSpecs[0]?.env.COMPOSER_FIXTURE,"prepared");assert.equal(h.manager.getLaunchSpec(session.id),h.spec);
      await h.runtime.command("submit");assert.ok(h.messages.some(m=>m.type==="composerAction" && m.action==="submit"));
      assert.deepEqual(h.factory.ptys[0]?.writes,[]);await h.runtime.command("configureShortcuts");assert.equal(h.keybindings,1);
    }finally{await h.close();}
  });
  it("keeps ordinary terminal input available when the launch has no UUID",async()=>{
    const h=await harness();try{
      const session=await h.manager.launch(h.spec);assert.ok(session);await h.runtime.documentReady();
      const hydrate=h.messages.find(m=>m.type==="composerHydrate");assert.ok(hydrate?.type==="composerHydrate");assert.equal(hydrate.capability.status,"unavailable");
      h.manager.write(session.id,"native input");assert.deepEqual(h.factory.ptys[0]?.writes,["native input"]);assert.equal(h.bindings.size,0);
    }finally{await h.close();}
  });
  it("persists legacy-version drafts but withholds automatic submission",async()=>{
    const h=await harness("2.1.287");try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();const target=h.runtime.targetFor(session.id);assert.ok(target);
      const updating=h.runtime.handle({type:"composerDraftChanged",target,draft:draft("legacy draft")});await h.runtime.controller.flush();await updating;
      await h.runtime.handle({type:"composerSubmit",request:{target,submissionId:requestId,draft:draft("legacy draft")}});
      assert.equal(h.store.get(first)?.draft.text,"legacy draft");assert.equal(h.submitted.length,0);assert.equal(h.factory.spawnedSpecs[0]?.env.COMPOSER_FIXTURE,undefined);
    }finally{await h.close();}
  });
  it("records one accepted ordinary prompt event for duplicate submit intents",async()=>{
    const h=await harness();try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();const target=h.runtime.targetFor(session.id);assert.ok(target);
      const updating=h.runtime.handle({type:"composerDraftChanged",target,draft:draft("ordinary prompt")});await h.runtime.controller.flush();await updating;
      const message={type:"composerSubmit",request:{target,submissionId:requestId,draft:draft("ordinary prompt")}} as const;
      await Promise.all([h.runtime.handle(message),h.runtime.handle(message)]);
      assert.equal(h.submitted.length,1);assert.deepEqual(h.accepted,[session.id]);assert.equal(h.store.get(first)?.draft.text,"");
    }finally{await h.close();}
  });
  it("drops a catalog reply after the user selects another session",async()=>{
    const h=await harness();try{
      const one=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(one);await h.runtime.documentReady();const target=h.runtime.targetFor(one.id);assert.ok(target);
      let resolve!:(items:Awaited<ReturnType<typeof h.runtime.catalog.list>>)=>void;
      h.setCatalog(()=>new Promise(r=>{resolve=r;}));const listing=h.runtime.handle({type:"composerRequestCatalog",target,requestId});
      await h.manager.launch(h.spec,{claudeSessionId:second});await h.runtime.documentReady();resolve([]);await listing;
      assert.equal(h.messages.filter(m=>m.type==="composerCatalog").length,0);
    }finally{await h.close();}
  });
  it("flushes on close and gives a resumed UUID a fresh owned generation",async()=>{
    const h=await harness();try{
      const one=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(one);await h.runtime.documentReady();const original=h.runtime.targetFor(one.id);assert.ok(original);
      const updating=h.runtime.handle({type:"composerDraftChanged",target:original,draft:draft("retain after exit")});await h.manager.close(one.id);await updating;
      await h.runtime.documentReady();assert.equal(h.runtime.controller.capability,undefined,"closing sessions must not leave an editable stale pane");
      assert.equal(h.store.get(first)?.draft.text,"retain after exit");h.factory.ptys[0]!.emitExit({exitCode:0});
      const resumed=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(resumed);await h.runtime.documentReady();
      assert.notEqual(h.runtime.targetFor(resumed.id)?.generation,original.generation);assert.equal(h.runtime.controller.getDraft(h.runtime.targetFor(resumed.id)!)?.text,"retain after exit");
    }finally{await h.close();}
  });
  it("restores a retained draft through the validated fresh launch and refuses live Forget",async()=>{
    const h=await harness();try{
      await h.store.saveDraft({...composerSession(),rootId:"root",rootPath:h.spec.cwd});h.setRootAllowed(false);
      await assert.rejects(h.runtime.handle({type:"composerRestoreDraft",documentId,claudeSessionId:first,expectedRevision:1}));assert.equal(h.manager.sessions.length,0);
      h.setRootAllowed(true);await h.runtime.handle({type:"composerRestoreDraft",documentId,claudeSessionId:first,expectedRevision:1});
      await h.runtime.documentReady();assert.equal(h.store.get(first),undefined);assert.equal(h.store.get(second)?.draft.text,"first draft");
      const target=h.runtime.targetFor(h.manager.activeSessionId!);assert.ok(target);assert.equal(h.runtime.controller.getDraft(target)?.text,"first draft");
      await h.runtime.forget(second);assert.equal(h.store.get(second)?.draft.text,"first draft");
    }finally{await h.close();}
  });
  it("rechecks the restore root after the fresh launch has yielded",async()=>{
    const h=await harness();try{
      await h.store.saveDraft({...composerSession(),rootId:"root",rootPath:h.spec.cwd});
      h.setRestoreHook(async()=>{h.setRootAllowed(false);});
      await assert.rejects(h.runtime.handle({type:"composerRestoreDraft",documentId,claudeSessionId:first,expectedRevision:1}),/root/i);
      assert.equal(h.store.get(first)?.draft.text,"first draft");assert.equal(h.store.get(second),undefined);
    }finally{await h.close();}
  });
  it("preserves both drafts if the user types in the fresh destination during transfer",async()=>{
    const h=await harness();try{
      await h.store.saveDraft({...composerSession(),rootId:"root",rootPath:h.spec.cwd});
      let held!:ReturnType<ComposerMemento["holdNextWrite"]>;let signal!:()=>void;const prepared=new Promise<void>(resolve=>{signal=resolve;});
      h.setRestoreHook(async()=>{await h.runtime.documentReady();held=h.state.holdNextWrite();signal();});
      const restoring=h.runtime.handle({type:"composerRestoreDraft",documentId,claudeSessionId:first,expectedRevision:1});
      const rejected=assert.rejects(restoring,/changed|unavailable/i);await prepared;await held.started;
      const target=h.runtime.targetFor(h.manager.activeSessionId!);assert.ok(target);
      const updating=h.runtime.handle({type:"composerDraftChanged",target,draft:draft("typed during restore")});held.release();
      await rejected;await h.runtime.controller.flush();await updating;
      assert.equal(h.store.get(first)?.draft.text,"first draft");assert.equal(h.store.get(second)?.draft.text,"typed during restore");
    }finally{await h.close();}
  });
  it("retires native routing as soon as shutdown begins, while the final save is held",async()=>{
    const h=await harness();try{
      const session=await h.manager.launch(h.spec,{claudeSessionId:first});assert.ok(session);await h.runtime.documentReady();const target=h.runtime.targetFor(session.id);assert.ok(target);
      const held=h.state.holdNextWrite();const updating=h.runtime.handle({type:"composerDraftChanged",target,draft:draft("last edit")});
      const closing=h.runtime.close();await held.started;
      try{assert.equal(h.runtime.targetFor(session.id),undefined);}finally{held.release();}
      await closing;await updating;
      assert.equal(h.store.get(first)?.draft.text,"last edit");
    }finally{await h.close();}
  });
});
