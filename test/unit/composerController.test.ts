import assert from "node:assert/strict";
import { ComposerController, type ComposerSessionContext } from "../../src/composer/composerController";
import { ComposerStore } from "../../src/composer/composerStore";
import type { ComposerHostMessage } from "../../src/panel/composerProtocol";
import type { SubmitRequest, SubmitResult } from "../../src/composer/composerTypes";
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
  let restoreAllowed=true;let restoreCount=0;
  const restored={sessionId:"pty-restored",claudeSessionId:second,generation:nextGeneration,rootId:"root-one",rootPath:"I:/fixture",displayName:"Restored",canSubmit:true};
  const controller=new ComposerController({store,adapter:{listCommands:async()=>[],submit:r=>{calls.push(r);return send(r);},disposeSession:async()=>{}},
    resolveSession:sessionId=>contexts.get(sessionId),documentId:()=>id,emit:message=>messages.push(message),
    liveSessions:()=>[...contexts.values()],
    schedule:callback=>{timers.add(callback);return {dispose:()=>{timers.delete(callback);}};},
    validateRestore:async()=>restoreAllowed,launchRestore:async()=>{restoreCount++;contexts.set(restored.sessionId,restored);return restored;}});
  await controller.select(target.sessionId,generation);
  return {state,store,contexts,messages,calls,timers,controller,restored,setSend:(fn:typeof send)=>{send=fn;},setRestoreAllowed:(v:boolean)=>{restoreAllowed=v;},get restoreCount(){return restoreCount;}};
}
const draft=(text:string,revision:number)=>({revision,text,selection:{anchor:0,head:text.length}});
const request=(revision=1,text="first draft",submissionId=requestId):SubmitRequest=>({target,submissionId,draft:draft(text,revision)});
async function waitForSend(h:Awaited<ReturnType<typeof harness>>):Promise<void> {
  for(let tick=0;tick<20 && h.calls.length===0;tick++)await new Promise<void>(resolve=>setImmediate(resolve));
  assert.equal(h.calls.length,1,"the native request must be in flight before the race is introduced");
}

describe("composer controller",()=>{
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
    const h=await harness();assert.equal(await h.controller.updateLayout(second,{splitRatio:0.4}),"failed");
    assert.equal(await h.controller.updateLayout(id,{splitRatio:NaN}),"failed");
    assert.equal(await h.controller.updateLayout(id,{splitRatio:0.4}),"saved");h.state.failNext=true;
    assert.equal(await h.controller.updateLayout(id,{splitRatio:0.5}),"failed");assert.equal(h.store.getLayout().splitRatio,0.4);
    assert.equal(new ComposerStore(h.state).getLayout().splitRatio,0.4);
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
});
