import assert from "node:assert/strict";
import path from "node:path";
import type * as vscode from "vscode";
import { ComposerRuntime } from "../../src/composer/composerRuntime";
import { ComposerStore } from "../../src/composer/composerStore";
import { supportsComposerVersion, type ManagedClaudeComposerAdapter } from "../../src/composer/claudeComposerAdapter";
import type { ComposerCommand, ComposerTarget, SubmitRequest } from "../../src/composer/composerTypes";
import type { ComposerHostMessage } from "../../src/panel/composerProtocol";
import type { LaunchSpec } from "../../src/launch/launchPlanner";
import { SessionManager } from "../../src/sessions/sessionManager";
import type { ManagedSessionSnapshot } from "../../src/sessions/sessionTypes";
import { OutputLogger } from "../../src/logging/outputLogger";
import { FakeManagedPtyFactory } from "../support/fakeManagedPty";
import { composerFirstUuid as first, composerSecondUuid as second, ComposerMemento, composerSession } from "../support/composerHarness";

const documentId="33333333-3333-4333-8333-333333333333";
const requestId="44444444-4444-4444-8444-444444444444";
async function harness(version="2.1.299") {
  const state=new ComposerMemento();const store=new ComposerStore(state);const factory=new FakeManagedPtyFactory();
  const root=path.resolve(".tmp/runtime-root");
  const spec:LaunchSpec={executable:"fixture-claude",args:[],env:{KEEP:"original"},cwd:root,root:{id:"root",label:"Fixture",uri:{fsPath:root,scheme:"file"} as vscode.Uri},importedRoots:[],skippedImportIds:[]};
  const messages:ComposerHostMessage[]=[];const submitted:SubmitRequest[]=[];const accepted:string[]=[];const bindings=new Map<string,ComposerTarget>();
  let ids=0;let keybindings=0;let currentDocument:string|undefined=documentId;let allowed=true;
  let restoreHook:((session:ManagedSessionSnapshot)=>Promise<void>)|undefined;
  let listCommands:()=>Promise<readonly ComposerCommand[]>=async()=>[{invocation:"/context",description:"Context",source:"builtin"}];
  const adapter:ManagedClaudeComposerAdapter={
    prepareLaunch:async(spec,target,nativeVersion)=>{if(!supportsComposerVersion(nativeVersion))return spec;bindings.set(target.sessionId,target);return {...spec,env:{...spec.env,COMPOSER_FIXTURE:"prepared"}};},
    isAvailable:target=>JSON.stringify(bindings.get(target.sessionId))===JSON.stringify(target),
    listCommands:async()=>listCommands(),submit:async request=>{submitted.push(request);return {status:"accepted",submissionId:request.submissionId,revision:request.draft.revision};},
    disposeSession:async target=>{bindings.delete(target.sessionId);},close:async()=>{bindings.clear();}
  };
  const manager:SessionManager=new SessionManager({ptyFactory:factory,createId:()=>`pty-${++ids}`,now:()=>0,logger:new OutputLogger({name:"Fixture",append:()=>{},appendLine:()=>{},replace:()=>{},clear:()=>{},show:()=>{},hide:()=>{},dispose:()=>{}}),notifications:{notify:()=>{}},
    prepareLaunch:(spec,session)=>runtime.prepareLaunch(spec,session),beforeTerminate:()=>runtime.controller.flush()});
  const runtime:ComposerRuntime=new ComposerRuntime({store,adapter,sessions:manager,documentId:()=>currentDocument,emit:message=>messages.push(message),
    getCapabilities:async()=>({sessionPersistence:true,settingsFile:true,completionReporter:"available",version}),expectsReporter:()=>true,
    setFocusContext:async()=>{},configureShortcuts:async()=>{keybindings++;},
    validateRestore:async()=>allowed,launchRestore:async()=>{const session=await manager.launch(spec,{claudeSessionId:second});if(session)await restoreHook?.(session);return session;},
    ownsResumable:()=>false,operationPending:()=>false,forgetResumable:async()=>{},onPromptAccepted:sessionId=>accepted.push(sessionId),
    files:{findFiles:async()=>[],pick:async()=>undefined}});
  return {runtime,manager,store,state,factory,messages,submitted,accepted,bindings,spec,
    setCatalog:(fn:typeof listCommands)=>{listCommands=fn;},setRootAllowed:(value:boolean)=>{allowed=value;},setDocument:(value:string|undefined)=>{currentDocument=value;},
    setRestoreHook:(hook:typeof restoreHook)=>{restoreHook=hook;},
    get keybindings(){return keybindings;},async close(){await runtime.close();manager.dispose();store.dispose();}};
}
const draft=(text:string)=>({revision:1,text,selection:{anchor:0,head:text.length}});

describe("composer host composition",()=>{
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
