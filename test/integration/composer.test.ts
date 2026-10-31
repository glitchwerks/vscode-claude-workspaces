import assert from "node:assert/strict";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as vscode from "vscode";
import { ComposerStore } from "../../src/composer/composerStore";
import { ComposerController, type ComposerSessionContext } from "../../src/composer/composerController";
import { COMPOSER_STATE_KEY, type RecoveryCursor } from "../../src/composer/composerTypes";
import { SessionPanelProvider, type SessionPanelActions } from "../../src/panel/sessionPanelProvider";
import type { ComposerHostMessage } from "../../src/panel/composerProtocol";
import type { ManagedSessionSnapshot, SessionDataEvent } from "../../src/sessions/sessionTypes";
import type { ResumableSessionSnapshot } from "../../src/sessions/resumableSessionStore";
import { ComposerMemento, composerSession } from "../support/composerHarness";
import { activateWithDependencies, deactivate, type ExtensionActivationDependencies } from "../../src/extension";
import type { ManagedClaudeComposerAdapter } from "../../src/composer/claudeComposerAdapter";
import type { ComposerTarget } from "../../src/composer/composerTypes";
import { FakeManagedPtyFactory } from "../support/fakeManagedPty";
import { OutputLogger } from "../../src/logging/outputLogger";

const doc="11111111-1111-4111-8111-111111111111";
const uuid=(index:number)=>`00000000-0000-4000-8000-${String(index).padStart(12,"0")}`;
const settle=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

describe("composer provider integration",()=>{
  it("keeps issued recovery pages and the webview snapshot during live autosaves",async()=>{
    const h=fixture();const context:ComposerSessionContext={sessionId:"live",claudeSessionId:uuid(1),generation:uuid(999),rootId:"root-one",rootPath:"I:/fixture",displayName:"Fixture",canSubmit:true};
    const controller=new ComposerController({store:h.store,resolveSession:id=>id==="live"?context:undefined,liveSessions:()=>[context],documentId:()=>doc,emit:()=>{},
      adapter:{listCommands:async()=>[],submit:async request=>({status:"rejected",submissionId:request.submissionId,reason:"unavailable"}),disposeSession:async()=>{}},validateRestore:async()=>false,launchRestore:async()=>undefined});
    try{
      h.live([{id:"live",claudeSessionId:uuid(1),rootId:"root-one",displayName:"Fixture",ordinalWithinRoot:1,state:"running",activity:"idle",hasUnreadResponse:false,launchedImportIds:[],launchedAddDirPaths:[],launchedRootLabel:"Fixture",launchedRootPath:"I:/fixture",launchedAt:1}]);
      await controller.select("live",context.generation);const target={sessionId:"live",claudeSessionId:uuid(1),generation:context.generation};
      const v=h.view();v.received.fire({type:"ready",documentId:doc});await settle();
      const first=await h.request(v);assert.ok(first?.page.nextCursor);const invalidations=v.posted.filter(m=>m.type==="composerRecoveryInvalidated").length;
      for(let revision=2;revision<=4;revision++){
        const saving=controller.updateDraft(target,{revision,text:`live draft ${revision}`,selection:{anchor:0,head:0}});await controller.flush();assert.equal(await saving,"saved");
      }
      assert.equal(v.posted.filter(m=>m.type==="composerRecoveryInvalidated").length,invalidations,"live typing must not reset recovery and make the browser refetch");
      const next=await h.request(v,first.page.nextCursor);assert.equal(next?.page.revision,first.page.revision);
      assert.deepEqual(next?.page.rows.map(row=>row.claudeSessionId),[uuid(101),uuid(102),uuid(103)]);
    }finally{await controller.flush();controller.dispose();h.dispose();}
  });
  function fixture(count=103){
    const state=new ComposerMemento();
    void state.update(COMPOSER_STATE_KEY,{schemaVersion:1,sessions:Array.from({length:count},(_,i)=>composerSession(uuid(i+1))),favorites:[],layout:{splitRatio:0.4},forgotten:[],accepted:{}});
    const store=new ComposerStore(state);
    const changed=new vscode.EventEmitter<readonly ManagedSessionSnapshot[]>();
    const data=new vscode.EventEmitter<SessionDataEvent>();
    const resumableChanged=new vscode.EventEmitter<readonly ResumableSessionSnapshot[]>();
    let sessions:readonly ManagedSessionSnapshot[]=[];let resumables:readonly ResumableSessionSnapshot[]=[];
    const handled:unknown[]=[];let ready=0;let retired=0;
    const composer={store,handle:async(message:unknown)=>{handled.push(message);},ready:async()=>{ready++;},viewDisposed:()=>{retired++;}};
    const actions:SessionPanelActions={input:()=>{},resize:()=>{},selectSession:()=>{},renameSession:()=>{},newSession:()=>{},newInFolder:()=>{},resumeSession:()=>{},forgetSession:id=>store.forget(id),closeSession:()=>{},restartFresh:()=>{},previousSession:()=>{},nextSession:()=>{},configureWorkspace:()=>{}};
    const provider=new SessionPanelProvider({extensionUri:vscode.Uri.file(__dirname),sessions:{get sessions(){return sessions;},activeSessionId:undefined,onDidChangeSessions:changed.event,onDidReceiveData:data.event},
      resumableSessions:{get sessions(){return resumables;},onDidChangeSessions:resumableChanged.event},actions,...{composer},terminalFont:{fontFamily:"monospace",fontSize:14,letterSpacing:0,lineHeight:1}});
    function view(){
      const posted:ComposerHostMessage[]=[];const received=new vscode.EventEmitter<unknown>();const disposed=new vscode.EventEmitter<void>();const visibility=new vscode.EventEmitter<void>();
      const webview={cspSource:"vscode-webview://test",html:"",asWebviewUri:(uri:vscode.Uri)=>uri,onDidReceiveMessage:received.event,postMessage:async(message:ComposerHostMessage)=>{posted.push(message);return true;}};
      provider.resolveWebviewView({webview,visible:true,onDidDispose:disposed.event,onDidChangeVisibility:visibility.event} as unknown as vscode.WebviewView);
      return {posted,received,disposed};
    }
    const page=(v:ReturnType<typeof view>)=>v.posted.filter(m=>m.type==="composerRecoveryPage").at(-1) as Extract<ComposerHostMessage,{type:"composerRecoveryPage"}>|undefined;
    const request=async(v:ReturnType<typeof view>,cursor?:RecoveryCursor)=>{v.received.fire({type:"composerRequestRecovery",documentId:doc,requestId:doc,...(cursor?{cursor}:{})});await settle();return page(v);};
    return {store,provider,view,request,handled,get ready(){return ready;},get retired(){return retired;},
      live:(next:readonly ManagedSessionSnapshot[])=>{sessions=next;changed.fire(next);},
      resumable:(next:readonly ResumableSessionSnapshot[])=>{resumables=next;resumableChanged.fire(next);},
      dispose:()=>{provider.dispose();store.dispose();changed.dispose();data.dispose();resumableChanged.dispose();}};
  }

  it("pages all draft-only records at startup without exporting text",async()=>{
    const h=fixture();try{const v=h.view();v.received.fire({type:"ready",documentId:doc});await settle();
      assert.equal(h.ready,1);assert.ok(v.posted.some(m=>m.type==="composerRecoveryInvalidated"));
      const first=await h.request(v);assert.ok(first);assert.equal(first.page.rows.length,100);assert.ok(first.page.nextCursor);
      assert.equal(first.actions.every(a=>a==="restoreDraft"),true);assert.equal(JSON.stringify(first).includes("first draft"),false);
      const second=await h.request(v,first.page.nextCursor);assert.equal(second?.page.rows.length,3);assert.equal(second?.page.nextCursor,undefined);
    }finally{h.dispose();}
  });

  it("invalidates cursors when eligibility or live ownership changes without a store write",async()=>{
    const h=fixture();try{const v=h.view();v.received.fire({type:"ready",documentId:doc});await settle();const first=await h.request(v);assert.ok(first?.page.nextCursor);
      h.resumable([{claudeSessionId:uuid(1),rootId:"root-one",rootLabel:"Fixture",rootPath:"I:/fixture",displayName:"Fixture",createdAt:new Date(0).toISOString(),lastLaunchedAt:new Date(0).toISOString()}]);
      const refreshed=await h.request(v);assert.ok(refreshed);assert.notEqual(refreshed.page.revision,first.page.revision);assert.equal(refreshed.actions[0],"resume");
      const before=v.posted.filter(m=>m.type==="composerRecoveryPage").length;await h.request(v,first.page.nextCursor);
      assert.equal(v.posted.filter(m=>m.type==="composerRecoveryPage").length,before);
      h.live([{id:"live",claudeSessionId:uuid(1),rootId:"root-one",displayName:"Fixture",ordinalWithinRoot:1,state:"running",activity:"idle",hasUnreadResponse:false,launchedImportIds:[],launchedAddDirPaths:[],launchedRootLabel:"Fixture",launchedRootPath:"I:/fixture",launchedAt:1}]);
      const live=await h.request(v);assert.equal(live?.page.rows.some(r=>r.claudeSessionId===uuid(1)),false);
    }finally{h.dispose();}
  });

  it("rejects stale restores and retired documents and removes forgotten draft rows",async()=>{
    const h=fixture(2);try{const old=h.view();old.received.fire({type:"ready",documentId:doc});await settle();
      old.received.fire({type:"composerRestoreDraft",documentId:doc,claudeSessionId:uuid(1),expectedRevision:99});
      old.received.fire({type:"composerRestoreDraft",documentId:doc,claudeSessionId:uuid(999),expectedRevision:1});await settle();assert.equal(h.handled.length,0);
      old.received.fire({type:"composerRestoreDraft",documentId:doc,claudeSessionId:uuid(1),expectedRevision:1});await settle();assert.equal(h.handled.length,1);
      const next=h.view();assert.equal(h.retired,1);old.received.fire({type:"composerRestoreDraft",documentId:doc,claudeSessionId:uuid(2),expectedRevision:1});await settle();assert.equal(h.handled.length,1);
      next.received.fire({type:"ready",documentId:doc});await settle();next.received.fire({type:"forgetSession",claudeSessionId:uuid(1)});await settle();
      const page=await h.request(next);assert.deepEqual(page?.page.rows.map(r=>r.claudeSessionId),[uuid(2)]);
    }finally{h.dispose();}
  });
});

describe("composer activation composition",()=>{
  it("owns native command routing, session drafts and split state across activation and resume",async()=>{
    const directory=await mkdtemp(path.join(tmpdir(),"claude-composer-activation-"));
    const state=new ComposerMemento();const root=vscode.Uri.file(directory);let context:vscode.ExtensionContext|undefined;
    const open=async()=>{
      const bindings=new Map<string,ComposerTarget>();const prepared:string[]=[];
      const adapter:ManagedClaudeComposerAdapter={prepareLaunch:async(spec,target,version)=>{assert.equal(version,"2.1.299");prepared.push(target.sessionId);bindings.set(target.sessionId,target);return spec;},isAvailable:target=>bindings.get(target.sessionId)?.generation===target.generation,
        listCommands:async()=>[],submit:async request=>({status:"rejected",submissionId:request.submissionId,reason:"dialog"}),disposeSession:async target=>{bindings.delete(target.sessionId);},close:async()=>{bindings.clear();}};
      const ptys=new FakeManagedPtyFactory();const handlers=new Map<string,()=>unknown>();const commands:string[]=[];let provider:vscode.WebviewViewProvider|undefined;let nextId=0;
      context={subscriptions:[],workspaceState:state,globalStorageUri:root,extensionUri:vscode.Uri.file(path.resolve(__dirname,"../../.."))} as unknown as vscode.ExtensionContext;
      const dependencies:ExtensionActivationDependencies & {composerAdapter:ManagedClaudeComposerAdapter}={composerAdapter:adapter,ptyFactory:ptys,
        logger:new OutputLogger({name:"Composer test",append:()=>{},appendLine:()=>{},replace:()=>{},clear:()=>{},hide:()=>{},show:()=>{},dispose:()=>{}}),
        createClaudeSessionId:()=>uuid(++nextId),claudeCapabilities:{get:async()=>({sessionPersistence:true,settingsFile:true,completionReporter:"available",version:"2.1.299"})},
        attentionHost:{platform:"win32",processId:process.pid},attentionNotifications:{notify:()=>{}},
        commands:{executeCommand:async id=>{commands.push(id);},registerCommand:(id,handler)=>{handlers.set(id,handler);return {dispose:()=>{handlers.delete(id);}};}},
        workspace:{workspaceFile:vscode.Uri.file(path.join(directory,"group.code-workspace")),workspaceFolders:[{name:"Fixture",index:0,uri:root}],onDidChangeWorkspaceFolders:()=>({dispose:()=>{}})},
        setup:{ensureConfigured:async()=>({schemaVersion:1,configuredRoots:[root.toString()],importsByRoot:{[root.toString()]:[]}}),configure:async()=>{}},
        availability:{timeoutMs:100,maxConcurrency:1,maxOutstandingProbes:1,totalTimeoutMs:1000,isAvailable:async()=>true},
        views:{registerWebviewViewProvider:(_id,p)=>{provider=p;return {dispose:()=>{}};}},terminalFont:{fontFamily:"monospace",fontSize:14,letterSpacing:0,lineHeight:1}};
      const api=await activateWithDependencies(context,dependencies);
      const posted:ComposerHostMessage[]=[];const received=new vscode.EventEmitter<unknown>();const disposed=new vscode.EventEmitter<void>();
      const view={visible:true,webview:{cspSource:"vscode-webview://test",html:"",asWebviewUri:(uri:vscode.Uri)=>uri,onDidReceiveMessage:received.event,postMessage:async(message:ComposerHostMessage)=>{posted.push(message);return true;}},onDidDispose:disposed.event,onDidChangeVisibility:new vscode.EventEmitter<void>().event} as unknown as vscode.WebviewView;
      provider!.resolveWebviewView(view,{} as vscode.WebviewViewResolveContext,{} as vscode.CancellationToken);
      received.fire({type:"ready",documentId:doc});await settle();
      const hydration=()=>posted.filter((m):m is Extract<ComposerHostMessage,{type:"composerHydrate"}>=>m.type==="composerHydrate").at(-1);
      const wait=async(predicate:()=>boolean)=>{const deadline=Date.now()+3000;while(!predicate()){assert.ok(Date.now()<deadline,"Composer wiring did not settle");await new Promise(resolve=>setTimeout(resolve,5));}};
      return {api,ptys,handlers,commands,prepared,posted,received,hydration,wait,async close(){await deactivate();context!.subscriptions.forEach(item=>item.dispose());context=undefined;received.dispose();disposed.dispose();}};
    };
    try{
      const h=await open();await h.api.launchController.launch({rootMode:"default"});await h.wait(()=>h.hydration()?.capability.status==="available");
      const first=h.hydration()!;assert.equal(first.capability.status,"available");if(first.capability.status!=="available")throw Error("missing identity");
      assert.equal(first.canSubmit,true);assert.equal(h.prepared.length,1);
      h.received.fire({type:"composerDraftChanged",target:first.capability.target,draft:{revision:1,text:"first session draft",selection:{anchor:4,head:4}}});
      await h.handlers.get("claudeWorkspaces.composer.toggle")!();assert.ok(h.posted.some(m=>m.type==="composerAction" && m.action==="toggle"));
      await h.handlers.get("claudeWorkspaces.composer.submit")!();assert.deepEqual(h.ptys.ptys[0]!.writes,[]);
      await h.api.launchController.launch({rootMode:"default"});await h.wait(()=>h.hydration()?.capability.status==="available" && (h.hydration()!.capability as {target:ComposerTarget}).target.claudeSessionId===uuid(2));
      const second=h.hydration()!;if(second.capability.status!=="available")throw Error("missing identity");
      h.received.fire({type:"composerDraftChanged",target:second.capability.target,draft:{revision:1,text:"second session draft",selection:{anchor:0,head:0}}});
      h.received.fire({type:"composerLayoutChanged",documentId:doc,splitRatio:0.4});await settle();await h.close();
      const restoredStore=new ComposerStore(state);assert.equal(restoredStore.get(uuid(1))?.draft.text,"first session draft");assert.equal(restoredStore.get(uuid(2))?.draft.text,"second session draft");assert.equal(restoredStore.getLayout().splitRatio,0.4);restoredStore.dispose();
      const next=await open();await next.api.launchController.resumeSession(uuid(1));await next.wait(()=>next.hydration()?.capability.status==="available");
      const restored=next.hydration()!;if(restored.capability.status!=="available")throw Error("missing identity");
      assert.ok("session" in restored);assert.notEqual(restored.capability.target.generation,first.capability.target.generation);assert.equal(restored.session.draft.text,"first session draft");assert.equal(restored.session.draft.selection.head,4);assert.equal(restored.layout.splitRatio,0.4);
      await next.handlers.get("claudeWorkspaces.closeSession")!();next.ptys.ptys[0]!.emitExit({exitCode:0});
      await next.api.launchController.forgetSession(uuid(1));
      const forgotten=new ComposerStore(state);assert.equal(forgotten.get(uuid(1)),undefined,"Forget from recovery notifications must also remove composer state");forgotten.dispose();await next.close();
    }finally{
      await deactivate();context?.subscriptions.forEach(item=>item.dispose());
      assert.equal(path.dirname(directory),path.resolve(tmpdir()));assert.ok(path.basename(directory).startsWith("claude-composer-activation-"));await rm(directory,{recursive:true,force:true});
    }
  });
});
