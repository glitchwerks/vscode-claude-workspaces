import assert from "node:assert/strict";
import { ComposerController, type ComposerSessionContext } from "../../src/composer/composerController";
import { ComposerStore } from "../../src/composer/composerStore";
import type { ComposerHostMessage } from "../../src/panel/composerProtocol";
import type { SubmitRequest, SubmitResult, NativeComposerDraft, ComposerTarget } from "../../src/composer/composerTypes";
import { composerFirstUuid as id, composerSecondUuid as second, composerSession, ComposerMemento } from "../support/composerHarness";

const generation="33333333-3333-4333-8333-333333333333";
const nextGeneration="44444444-4444-4444-8444-444444444444";
const requestId="55555555-5555-4555-8555-555555555555";
const target={sessionId:"pty-one",claudeSessionId:id,generation};
function deferred<T>() {let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>{resolve=r;});return {promise,resolve};}
async function harness() {
  const state=new ComposerMemento();const store=new ComposerStore(state);
  await store.saveDraft(composerSession());
  const contexts=new Map<string,ComposerSessionContext>([[target.sessionId,{...target,rootId:"root-one",rootPath:"I:/fixture",displayName:"Fixture",canSubmit:true}]]);
  const messages:ComposerHostMessage[]=[];const calls:SubmitRequest[]=[];const timers=new Set<()=>void>();
  let send=(request:SubmitRequest):Promise<SubmitResult>=>Promise.resolve({status:"accepted",submissionId:request.submissionId,revision:request.draft.revision});
  let read=async():Promise<NativeComposerDraft|undefined>=>undefined;
  let clear=async(source:NativeComposerDraft,stillCurrent?:()=>boolean):Promise<boolean>=>{void source;void stillCurrent;return false;};
  const reads:string[]=[];const clears:NativeComposerDraft[]=[];
  let restoreAllowed=true;let restoreCount=0;
  const restored={sessionId:"pty-restored",claudeSessionId:second,generation:nextGeneration,rootId:"root-one",rootPath:"I:/fixture",displayName:"Restored",canSubmit:true};
  let documentId:string|undefined=id;
  const controller=new ComposerController({store,adapter:{readDraft:async t=>{reads.push(t.sessionId);return read();},clearDraft:async(_t:ComposerTarget,source:NativeComposerDraft,stillCurrent?:()=>boolean)=>{clears.push(source);return clear(source,stillCurrent);},listCommands:async()=>[],submit:r=>{calls.push(r);return send(r);},disposeSession:async()=>{}},
    resolveSession:sessionId=>contexts.get(sessionId),documentId:()=>documentId,emit:message=>messages.push(message),
    liveSessions:()=>[...contexts.values()],
    schedule:callback=>{timers.add(callback);return {dispose:()=>{timers.delete(callback);}};},
    validateRestore:async()=>restoreAllowed,launchRestore:async()=>{restoreCount++;contexts.set(restored.sessionId,restored);return restored;}});
  await controller.select(target.sessionId,generation);
  return {state,store,contexts,messages,calls,timers,controller,restored,reads,clears,setDocument:(value:string|undefined)=>{documentId=value;},setRead:(fn:typeof read)=>{read=fn;},setClear:(fn:typeof clear)=>{clear=fn;},setSend:(fn:typeof send)=>{send=fn;},setRestoreAllowed:(v:boolean)=>{restoreAllowed=v;},get restoreCount(){return restoreCount;}};
}
const draft=(text:string,revision:number)=>({revision,text,selection:{anchor:0,head:text.length}});
const request=(revision=1,text="first draft",submissionId=requestId):SubmitRequest=>({target,submissionId,draft:draft(text,revision)});
async function waitForSend(h:Awaited<ReturnType<typeof harness>>):Promise<void> {
  for(let tick=0;tick<20 && h.calls.length===0;tick++)await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(h.calls.length,1,"the native request must be in flight before the race is introduced");
}

describe("composer controller",()=>{
  it("finishes moving the saved native text when only the editor caret changes during clear preparation",async()=>{
    const h=await harness();void h.controller.updateDraft(target,draft("",2));await h.controller.flush();h.setRead(async()=>({text:"source",cursor:6}));
    const entered=deferred<void>(),release=deferred<void>();let deleted=false;
    h.setClear(async(_source,stillCurrent)=>{entered.resolve();await release.promise;deleted=stillCurrent?.()??false;return deleted;});
    const showing=h.controller.setVisible(true);await entered.promise;
    void h.controller.updateDraft(target,{revision:4,text:"source",selection:{anchor:2,head:2}});await h.controller.flush();
    release.resolve();await showing;assert.equal(deleted,true);assert.equal(h.store.get(id)?.draft.text,"source");assert.deepEqual(h.controller.getDraft(target)?.selection,{anchor:2,head:2});
    assert.ok(h.messages.some(m=>m.type==="composerImportStatus" && m.revision===4 && m.status==="moved"));
  });
  it("finishes moving unchanged text when only its selection changes during storage",async()=>{
    const h=await harness();void h.controller.updateDraft(target,draft("",2));await h.controller.flush();h.setRead(async()=>({text:"source",cursor:6}));h.setClear(async()=>true);
    const held=h.state.holdNextWrite();const showing=h.controller.setVisible(true);await held.started;
    void h.controller.updateDraft(target,{revision:4,text:"source",selection:{anchor:1,head:4}});held.release();await showing;await h.controller.flush();
    assert.equal(h.clears.length,1);assert.equal(h.store.get(id)?.draft.text,"source");assert.deepEqual(h.controller.getDraft(target)?.selection,{anchor:1,head:4});
  });

  it("moves native input into an empty shown editor only after durable storage",async()=>{
    const h=await harness();void h.controller.updateDraft(target,draft("",2));await h.controller.flush();
    const source={text:"native\n😀 input",cursor:7};h.setRead(async()=>source);h.setClear(async()=>true);
    const held=h.state.holdNextWrite();const showing=h.controller.setVisible(true);await held.started;
    assert.equal(h.controller.getDraft(target)?.text,source.text);assert.deepEqual(h.controller.getDraft(target)?.selection,{anchor:7,head:7});
    assert.equal(h.clears.length,0,"Native source survives until storage acknowledges the editor copy");
    held.release();await showing;
    assert.equal(h.store.get(id)?.draft.text,source.text);assert.deepEqual(h.clears,[source]);assert.deepEqual(h.store.get(id)?.recent,[]);
  });
  it("retains the native source when saving the imported draft fails",async()=>{
    const h=await harness();void h.controller.updateDraft(target,draft("",2));await h.controller.flush();
    h.setRead(async()=>({text:"source",cursor:6}));h.state.failNext=true;
    await h.controller.setVisible(true);assert.equal(h.clears.length,0);assert.equal(h.controller.getDraft(target)?.text,"source");
    assert.equal(h.store.get(id)?.draft.text,"");
  });
  it("does not replace editor typing that arrives while the native read is pending",async()=>{
    const h=await harness();void h.controller.updateDraft(target,draft("",2));await h.controller.flush();
    const held=deferred<NativeComposerDraft|undefined>();h.setRead(()=>held.promise);
    const showing=h.controller.setVisible(true);void h.controller.updateDraft(target,draft("new typing",3));
    held.resolve({text:"old native",cursor:10});await showing;await h.controller.flush();
    assert.equal(h.controller.getDraft(target)?.text,"new typing");assert.equal(h.clears.length,0);
  });
  it("deduplicates a show and expansion during an outstanding native read",async()=>{
    const h=await harness();void h.controller.updateDraft(target,draft("",2));await h.controller.flush();
    const held=deferred<NativeComposerDraft|undefined>();h.setRead(()=>held.promise);h.setClear(async()=>true);
    const one=h.controller.setVisible(true),two=h.controller.setVisible(true);
    held.resolve({text:"source",cursor:6});await Promise.all([one,two]);assert.equal(h.reads.length,1);assert.equal(h.clears.length,1);
  });
  it("leaves native input untouched for nonempty or unsupported editors",async()=>{
    const h=await harness();h.setRead(async()=>({text:"source",cursor:6}));await h.controller.setVisible(true);assert.equal(h.reads.length,0);
    void h.controller.updateDraft(target,draft("",2));await h.controller.flush();
    h.contexts.set(target.sessionId,{...h.contexts.get(target.sessionId)!,canSubmit:false});await h.controller.setVisible(true);assert.equal(h.reads.length,0);
  });
  it("ignores native read results after hiding, changing tabs or restarting a session",async()=>{
    for(const change of ["hide","tab","generation","document"]){
      const h=await harness();void h.controller.updateDraft(target,draft("",2));await h.controller.flush();
      const held=deferred<NativeComposerDraft|undefined>();h.setRead(()=>held.promise);const showing=h.controller.setVisible(true);
      if(change==="hide")await h.controller.setVisible(false);
      if(change==="tab"){h.contexts.set(h.restored.sessionId,h.restored);await h.controller.select(h.restored.sessionId,nextGeneration);}
      if(change==="document")h.setDocument(undefined);
      if(change==="generation")h.contexts.set(target.sessionId,{...h.contexts.get(target.sessionId)!,generation:nextGeneration});
      held.resolve({text:"source",cursor:6});await showing;assert.equal(h.clears.length,0);assert.equal(h.store.get(id)?.draft.text,"");
    }
  });
  it("cancels native clear preparation after hiding, document retirement, typing or tab changes",async()=>{
    for(const change of ["hide","document","typing","tab"]){
      const h=await harness();void h.controller.updateDraft(target,draft("",2));await h.controller.flush();h.setRead(async()=>({text:"source",cursor:6}));
      const started=deferred<void>(),held=deferred<void>();let deleted=false;
      h.setClear(async(_source,stillCurrent)=>{started.resolve();await held.promise;deleted=stillCurrent?.()??true;return deleted;});
      const showing=h.controller.setVisible(true);await started.promise;
      if(change==="hide")await h.controller.setVisible(false);
      if(change==="document")h.setDocument(undefined);
      if(change==="typing"){void h.controller.updateDraft(target,draft("replacement",4));await h.controller.flush();}
      if(change==="tab"){h.setRead(async()=>undefined);h.contexts.set(h.restored.sessionId,h.restored);await h.controller.select(h.restored.sessionId,nextGeneration);}
      held.resolve();await showing;assert.equal(deleted,false,change);
    }
  });
  it("does not clear the native source when typing or the selected session changes during the durable save",async()=>{
    for(const change of ["typing","tab"]){
      const h=await harness();void h.controller.updateDraft(target,draft("",2));await h.controller.flush();h.setRead(async()=>({text:"source",cursor:6}));
      const held=h.state.holdNextWrite();const showing=h.controller.setVisible(true);await held.started;
      if(change==="typing")void h.controller.updateDraft(target,draft("newer editor",4));
      else{h.setRead(async()=>undefined);h.contexts.set(h.restored.sessionId,h.restored);await h.controller.select(h.restored.sessionId,nextGeneration);}
      held.release();await showing;await h.controller.flush();assert.equal(h.clears.length,0);
    }
  });

  it("selects and hydrates the next tab while the previous draft storage write is held",async()=>{
    const h=await harness();const held=h.state.holdNextWrite();
    const saving=h.controller.updateDraft(target,draft("preserved in memory",2));
    const flushing=h.controller.flush();await held.started;
    h.contexts.set(h.restored.sessionId,h.restored);
    try{
      void h.controller.select(h.restored.sessionId,nextGeneration);
      await new Promise<void>(resolve=>setImmediate(resolve));
      const hydration=h.messages.filter(m=>m.type==="composerHydrate").at(-1);
      assert.ok(hydration?.type==="composerHydrate" && hydration.capability.status==="available");
      assert.equal(hydration.capability.target.sessionId,h.restored.sessionId);
    }finally{held.release();await flushing;await saving;}
    await h.controller.select(target.sessionId,generation);
    assert.equal(h.controller.getDraft(target)?.text,"preserved in memory");
  });
  it("keeps recovery stable while autosaving either owned live tab",async()=>{
    const h=await harness();let changes=0;h.store.onDidChangeRecovery(()=>{changes++;});
    void h.controller.updateDraft(target,draft("active live draft",2));await h.controller.flush();
    assert.equal(changes,0);
    h.contexts.set(h.restored.sessionId,h.restored);await h.controller.select(h.restored.sessionId,nextGeneration);
    void h.controller.updateDraft(target,draft("background live draft",3));await h.controller.flush();
    assert.equal(changes,0);assert.equal(h.store.get(id)?.draft.text,"background live draft");
  });
  it("invalidates recovery if the saving launch retires during storage even when its UUID stays live",async()=>{
    const h=await harness();let changes=0;h.store.onDidChangeRecovery(()=>{changes++;});
    const held=h.state.holdNextWrite();const saving=h.controller.updateDraft(target,draft("last source draft",2));
    const flushing=h.controller.flush();await held.started;
    h.contexts.delete(target.sessionId);const replacement={...h.restored,claudeSessionId:id};h.contexts.set(replacement.sessionId,replacement);
    const selecting=h.controller.select(replacement.sessionId,replacement.generation);held.release();await flushing;await saving;await selecting;
    assert.equal(changes,1);assert.equal(h.store.get(id)?.draft.text,"last source draft");
  });
  it("reports a correlated rejection when typing changes during send preflight",async()=>{
    const h=await harness();const held=h.state.holdNextWrite();
    const saving=h.controller.updateDraft(target,draft("sending",2));
    const sending=h.controller.submit(request(2,"sending"));await held.started;
    const newer=h.controller.updateDraft(target,draft("keep typing",3));held.release();
    await saving;await newer;
    assert.equal((await sending).status,"rejected");assert.equal(h.calls.length,0);
    assert.ok(h.messages.some(m=>m.type==="composerSubmitResult" && m.result.submissionId===requestId && m.result.status==="rejected"));
  });
  it("reports rejected oversized sends so the editor can leave Sending state",async()=>{
    const h=await harness();const text="x".repeat(1_048_577);
    void h.controller.updateDraft(target,draft(text,2));await h.controller.flush();
    await h.controller.submit(request(2,text));
    assert.ok(h.messages.some(m=>m.type==="composerSubmitResult" && m.result.submissionId===requestId && m.result.status==="rejected"));
    assert.equal(h.calls.length,0);
  });
  it("refreshes visible recent history while preserving the next prompt",async()=>{
    const h=await harness();const ack=deferred<SubmitResult>();h.setSend(()=>ack.promise);
    const sending=h.controller.submit(request());await waitForSend(h);
    void h.controller.updateDraft(target,draft("next prompt",2));await h.controller.flush();h.messages.length=0;
    ack.resolve({status:"accepted",submissionId:requestId,revision:1});await sending;
    const hydrated=h.messages.find(m=>m.type==="composerHydrate");
    assert.ok(hydrated?.type==="composerHydrate" && "session" in hydrated);
    assert.deepEqual(hydrated.session.recent,["first draft"]);assert.equal(hydrated.session.draft.text,"next prompt");
  });
  it("clears an accepted draft after retrying an older failed durable revision",async()=>{
    const h=await harness();h.state.failNext=true;
    const saving=h.controller.updateDraft(target,draft("accepted revision",2));await h.controller.flush();
    assert.equal(await saving,"failed");assert.equal(h.store.get(id)?.draft.revision,1);
    assert.equal((await h.controller.submit(request(2,"accepted revision"))).status,"accepted");
    assert.equal(h.controller.getDraft(target)?.text,"");assert.equal(h.store.get(id)?.draft.text,"");
    assert.deepEqual(h.store.get(id)?.recent,["accepted revision"]);
  });
  it("debounces drafts and flushes the previous session before switching",async()=>{
    const h=await harness();const saving=h.controller.updateDraft(target,draft("newer draft",2));
    assert.equal(h.store.get(id)?.draft.revision,1);assert.equal(h.timers.size,1);
    h.contexts.set("pty-two",{...h.restored});
    await h.controller.select(h.restored.sessionId,nextGeneration);
    assert.equal(await saving,"saved");assert.equal(h.store.get(id)?.draft.text,"newer draft");
    await h.controller.select(target.sessionId,generation);
    const hydrate=h.messages.filter(m=>m.type==="composerHydrate").at(-1);
    assert.ok(hydrate?.type==="composerHydrate" && hydrate.capability.status==="available" && "session" in hydrate);
    assert.equal(hydrate.session.draft.text,"newer draft");
  });
  it("preserves newer typing when an older send is accepted",async()=>{
    const h=await harness();const ack=deferred<SubmitResult>();h.setSend(()=>ack.promise);
    const sending=h.controller.submit(request());
    await waitForSend(h);
    const saving=h.controller.updateDraft(target,draft("newer draft",2));await h.controller.flush();await saving;
    ack.resolve({status:"accepted",submissionId:requestId,revision:1});await sending;
    assert.equal(h.store.get(id)?.draft.revision,2);assert.equal(h.store.get(id)?.draft.text,"newer draft");
    assert.deepEqual(h.store.get(id)?.recent,["first draft"]);
  });
  it("clears an unchanged accepted draft once, deduplicating the submission ID",async()=>{
    const h=await harness();const first=h.controller.submit(request());const duplicate=h.controller.submit(request());
    assert.deepEqual(await first,await duplicate);assert.equal(h.calls.length,1);
    assert.equal(h.store.get(id)?.draft.text,"");assert.deepEqual(h.store.get(id)?.recent,["first draft"]);
    assert.equal((await h.controller.submit(request(1,"different"))).status,"rejected");
  });
  it("ignores an old acknowledgment after the same UUID gets a new live generation",async()=>{
    const h=await harness();const ack=deferred<SubmitResult>();h.setSend(()=>ack.promise);
    const sending=h.controller.submit(request());await waitForSend(h);
    h.contexts.set(target.sessionId,{...h.contexts.get(target.sessionId)!,generation:nextGeneration});
    await h.controller.select(target.sessionId,nextGeneration);
    ack.resolve({status:"accepted",submissionId:requestId,revision:1});await sending;
    assert.equal(h.store.get(id)?.draft.text,"first draft");assert.deepEqual(h.store.get(id)?.recent,[]);
  });
  it("does not recreate a forgotten record from a delayed save or acknowledgment",async()=>{
    const h=await harness();const hold=h.state.holdNextWrite();
    const saving=h.controller.updateDraft(target,draft("newer",2));const flushing=h.controller.flush();await hold.started;
    const forgetting=h.controller.forget(id);hold.release();await flushing;await saving;await forgetting;
    assert.equal(h.store.get(id),undefined);
    assert.equal((await h.controller.submit(request())).status,"rejected");
  });
  it("hydrates unavailable identities without creating a record or sending",async()=>{
    const h=await harness();h.contexts.set(target.sessionId,{...h.contexts.get(target.sessionId)!,claudeSessionId:null});
    assert.equal((await h.controller.select(target.sessionId,generation)).status,"unavailable");
    assert.equal(await h.controller.updateDraft(target,draft("no",2)),"stale");
    assert.equal((await h.controller.submit(request())).status,"rejected");assert.equal(h.calls.length,0);
    const message=h.messages.at(-1);assert.ok(message?.type==="composerHydrate");
    assert.equal(message.canSubmit,false);assert.equal("session" in message,false);
  });
  it("keeps draft persistence available when automatic sending is unsupported",async()=>{
    const h=await harness();h.contexts.set(target.sessionId,{...h.contexts.get(target.sessionId)!,canSubmit:false});
    assert.equal((await h.controller.select(target.sessionId,generation)).status,"available");
    const saving=h.controller.updateDraft(target,draft("legacy draft",2));await h.controller.flush();assert.equal(await saving,"saved");
    assert.equal((await h.controller.submit(request(2,"legacy draft"))).status,"rejected");assert.equal(h.calls.length,0);
  });
  it("retains unconfirmed text and cancels sends queued before the uncertain outcome",async()=>{
    const h=await harness();const ack=deferred<SubmitResult>();h.setSend(()=>ack.promise);
    const first=h.controller.submit(request());const queued=h.controller.submit(request(1,"first draft",second));
    await waitForSend(h);ack.resolve({status:"unconfirmed",submissionId:requestId});
    assert.equal((await first).status,"unconfirmed");assert.equal((await queued).status,"rejected");assert.equal(h.calls.length,1);
    assert.equal(h.store.get(id)?.draft.text,"first draft");assert.deepEqual(h.store.get(id)?.recent,[]);
    h.setSend(async r=>({status:"rejected",submissionId:r.submissionId,reason:"terminal-draft"}));
    await h.controller.submit(request(1,"first draft",nextGeneration));assert.equal(h.calls.length,2);
  });
  it("reports accepted delivery plus storage error when local history/clear fails",async()=>{
    const h=await harness();h.setSend(async r=>{h.state.failNext=true;return {status:"accepted",submissionId:r.submissionId,revision:r.draft.revision};});
    assert.equal((await h.controller.submit(request())).status,"accepted");
    assert.equal(h.store.getRecoverable(id)?.draft.text,"first draft");assert.equal(h.calls.length,1);
    assert.ok(h.messages.some(m=>m.type==="composerDraftStatus" && m.status==="error"));
  });
  it("flushes a closing session even after its live context disappears",async()=>{
    const h=await harness();const saving=h.controller.updateDraft(target,draft("last draft",2));h.contexts.delete(target.sessionId);
    await h.controller.close(target);assert.equal(await saving,"saved");assert.equal(h.store.get(id)?.draft.text,"last draft");
  });
  it("validates current document and split bounds, reporting failed writes accurately",async()=>{
    const h=await harness();assert.equal(await h.controller.updateLayout(second,{splitRatio:0.4},requestId),"failed");
    assert.equal(await h.controller.updateLayout(id,{splitRatio:NaN},requestId),"failed");
    assert.equal(await h.controller.updateLayout(id,{splitRatio:0.4},requestId),"saved");h.state.failNext=true;
    assert.equal(await h.controller.updateLayout(id,{splitRatio:0.5},requestId),"failed");assert.equal(h.store.getLayout().splitRatio,0.4);
    assert.equal(new ComposerStore(h.state).getLayout().splitRatio,0.4);
  });
  it("rejects invalid layout correlation and echoes valid save request identity",async()=>{
    const h=await harness();try{
      assert.equal(await h.controller.updateLayout(id,{splitRatio:0.4},"invalid"),"failed");
      await h.controller.updateLayout(id,{splitRatio:0.4},requestId);
      assert.deepEqual(h.messages.filter(m=>m.type==="composerLayoutStatus").at(-1),{type:"composerLayoutStatus",documentId:id,requestId,layout:{splitRatio:0.4},status:"saved"});
      h.state.failNext=true;await h.controller.updateLayout(id,{splitRatio:0.5},second);
      assert.deepEqual(h.messages.filter(m=>m.type==="composerLayoutStatus").at(-1),{type:"composerLayoutStatus",documentId:id,requestId:second,layout:{splitRatio:0.4},status:"error"});
    }finally{h.controller.dispose();h.store.dispose();}
  });
  it("retains correlation and the final ratio across delayed serialized layout writes",async()=>{
    const h=await harness();const gate=h.state.holdNextWrite();
    try{
      const first=h.controller.updateLayout(id,{splitRatio:0.402},requestId);await gate.started;
      const last=h.controller.updateLayout(id,{splitRatio:0.438},second);gate.release();await Promise.all([first,last]);
      const replies=h.messages.filter(m=>m.type==="composerLayoutStatus");
      assert.deepEqual(replies.map(m=>m.requestId),[requestId,second]);assert.equal(replies.at(-1)?.layout.splitRatio,0.438);
      assert.equal(new ComposerStore(h.state).getLayout().splitRatio,0.438);
    }finally{gate.release();h.controller.dispose();h.store.dispose();}
  });
  it("retains oversize editable drafts with an explicit too-large status and no send",async()=>{
    const h=await harness();const text="x".repeat(1_048_577);const saving=h.controller.updateDraft(target,draft(text,2));await h.controller.flush();
    assert.equal(await saving,"too-large");assert.equal(h.store.getRecoverable(id)?.draft.text,text);
    assert.equal((await h.controller.submit(request(2,text))).status,"rejected");assert.equal(h.calls.length,0);
  });
  it("restores only a nonlive expected revision through a validated root and durable destination",async()=>{
    const h=await harness();await assert.rejects(h.controller.restoreDraft(id,1),/live/i);
    h.contexts.clear();h.setRestoreAllowed(false);await assert.rejects(h.controller.restoreDraft(id,1),/root/i);assert.equal(h.restoreCount,0);
    h.setRestoreAllowed(true);await assert.rejects(h.controller.restoreDraft(id,0),/revision/i);
    const first=h.controller.restoreDraft(id,1);const duplicate=h.controller.restoreDraft(id,1);await first;await duplicate;
    assert.equal(h.restoreCount,1);assert.equal(h.store.get(id),undefined);assert.equal(h.store.get(second)?.draft.text,"first draft");
  });
  it("keeps the restore source when destination storage fails",async()=>{
    const h=await harness();h.contexts.clear();h.state.failNext=true;
    await assert.rejects(h.controller.restoreDraft(id,1));assert.equal(h.store.get(id)?.draft.text,"first draft");assert.equal(h.store.get(second),undefined);
  });
  it("preserves typing that arrives during the accepted-draft clear write",async()=>{
    const h=await harness();const ack=deferred<SubmitResult>();h.setSend(()=>ack.promise);
    const sending=h.controller.submit(request());await waitForSend(h);
    // Pause the clear after history has committed, without replacing the store.
    const original=h.store.recordAccepted.bind(h.store);let held:ReturnType<ComposerMemento["holdNextWrite"]>|undefined;
    h.store.recordAccepted=async(...args)=>{await original(...args);held=h.state.holdNextWrite();};
    ack.resolve({status:"accepted",submissionId:requestId,revision:1});
    while(held===undefined) await new Promise<void>(resolve=>setImmediate(resolve));
    await held.started;const saving=h.controller.updateDraft(target,draft("typed during clear",2));held.release();
    await sending;await h.controller.flush();await saving;
    assert.equal(h.store.get(id)?.draft.text,"typed during clear");assert.equal(h.store.get(id)?.draft.revision,2);
  });
  it("does not publish accepted history after the generation changes during its storage write",async()=>{
    const h=await harness();const ack=deferred<SubmitResult>();h.setSend(()=>ack.promise);
    const sending=h.controller.submit(request());await waitForSend(h);
    const held=h.state.holdNextWrite();ack.resolve({status:"accepted",submissionId:requestId,revision:1});await held.started;
    h.contexts.set(target.sessionId,{...h.contexts.get(target.sessionId)!,generation:nextGeneration});
    const selecting=h.controller.select(target.sessionId,nextGeneration);held.release();await sending;await selecting;
    assert.deepEqual(h.store.get(id)?.recent,[]);assert.equal(h.store.get(id)?.draft.text,"first draft");
  });
  it("keeps rejected native outcomes and adapter exceptions out of accepted history",async()=>{
    const h=await harness();h.setSend(async r=>({status:"rejected",submissionId:r.submissionId,reason:"dialog"}));
    assert.equal((await h.controller.submit(request())).status,"rejected");
    h.setSend(async()=>{throw new Error("Private transport failure");});
    assert.equal((await h.controller.submit(request(1,"first draft",second))).status,"unconfirmed");
    assert.equal(h.store.get(id)?.draft.text,"first draft");assert.deepEqual(h.store.get(id)?.recent,[]);
  });
  it("keeps a failed closing-session draft in recovery until it can be saved",async()=>{
    const h=await harness();h.state.failNext=true;
    const saving=h.controller.updateDraft(target,draft("recover me",2));h.contexts.clear();await h.controller.close(target);
    assert.equal(await saving,"failed");assert.equal(h.store.getRecoverable(id)?.draft.text,"recover me");
    assert.equal(h.store.recoveryPage().rows[0]?.storageStatus,"error");
    await h.controller.restoreDraft(id,2);assert.equal(h.store.get(second)?.draft.text,"recover me");
  });
  it("hydrates the saved/error status from actual durability rather than draft presence",async()=>{
    const h=await harness();
    assert.ok(h.messages.some(m=>m.type==="composerDraftStatus" && m.status==="saved" && m.revision===1));
    h.state.failNext=true;const saving=h.controller.updateDraft(target,draft("not durable",2));await h.controller.flush();await saving;
    await h.controller.select(target.sessionId,generation);
    assert.deepEqual(h.messages.at(-1),{type:"composerDraftStatus",target,revision:2,status:"error"});
  });
  it("recalls only accepted composer history with an explicit Replace/Append revision guard",async()=>{
    const h=await harness();await h.store.recordAccepted(id,second,"accepted earlier");
    await h.controller.select(target.sessionId,generation);
    assert.equal(await h.controller.recallHistory(target,0,"replace",0),"stale");
    const recalling=h.controller.recallHistory(target,0,"append",1);await h.controller.flush();assert.equal(await recalling,"saved");
    assert.equal(h.store.get(id)?.draft.text,"first draft\naccepted earlier");assert.equal(h.calls.length,0);
    const replacing=h.controller.recallHistory(target,0,"replace",2);await h.controller.flush();await replacing;
    assert.equal(h.store.get(id)?.draft.text,"accepted earlier");assert.equal(h.calls.length,0);
    assert.equal(await h.controller.recallHistory(target,9,"replace",3),"stale");
  });
  it("hydrates only the newest rapid selection and resets when no session remains",async()=>{
    const h=await harness();h.contexts.set(h.restored.sessionId,h.restored);h.messages.length=0;
    await Promise.all([h.controller.select(target.sessionId,generation),h.controller.select(h.restored.sessionId,nextGeneration)]);
    const hydrations=h.messages.filter(m=>m.type==="composerHydrate");assert.equal(hydrations.length,1);
    assert.ok(hydrations[0]?.type==="composerHydrate" && hydrations[0].capability.status==="available");
    assert.equal(hydrations[0].capability.target.sessionId,h.restored.sessionId);
    await h.controller.clearSelection();assert.equal(h.controller.capability,undefined);
    assert.deepEqual(h.messages.at(-1),{type:"composerReset",documentId:id});
  });
});
