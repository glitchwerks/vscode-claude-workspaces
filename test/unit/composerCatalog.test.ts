import assert from "node:assert/strict";
import { ComposerCatalog, insertInvocation } from "../../src/composer/composerCatalog";
import type { ComposerCommand } from "../../src/composer/composerTypes";
import { composerFirstUuid as id, composerSecondUuid as generation } from "../support/composerHarness";
const target={sessionId:"pty",claudeSessionId:id,generation};
const commands:readonly ComposerCommand[]=[{invocation:"/one:review",description:"Review",source:"plugin",plugin:"one"},{invocation:"/two:review",description:"Review",source:"plugin",plugin:"two"}];
describe("composer command catalog",()=>{
  it("retains exact namespaced invocations and caches by target/generation",async()=>{
    let calls=0;const catalog=new ComposerCatalog({isCurrent:()=>true,listCommands:async()=>{calls++;return commands;}});
    assert.deepEqual(await catalog.list(target),commands);await catalog.list(target);assert.equal(calls,1);
    await catalog.list(target,true);assert.equal(calls,2);
    await catalog.list({...target,generation:id});assert.equal(calls,3);
    assert.equal(Object.isFrozen(await catalog.list(target)),true);
  });
  it("rejects late results after a session/generation change and invalid native items",async()=>{
    let current=true;let resolve!:(items:readonly ComposerCommand[])=>void;
    const catalog=new ComposerCatalog({isCurrent:()=>current,listCommands:()=>new Promise(r=>{resolve=r;})});
    const listing=catalog.list(target);const rejected=assert.rejects(listing,/unavailable/i);current=false;resolve(commands);await rejected;
    const invalid=new ComposerCatalog({isCurrent:()=>true,listCommands:async()=>[{invocation:"/bad command",description:"bad",source:"plugin"}]});
    await assert.rejects(invalid.list(target),/catalog/i);
  });
  it("times out without substituting another invocation or accepting a late cache fill",async()=>{
    let timeout!:(()=>void);let resolve!:(items:readonly ComposerCommand[])=>void;
    const catalog=new ComposerCatalog({isCurrent:()=>true,listCommands:()=>new Promise(r=>{resolve=r;}),schedule:callback=>{timeout=callback;return {dispose:()=>{}};}});
    const listing=catalog.list(target);const rejected=assert.rejects(listing,/unavailable/i);timeout();await rejected;resolve(commands);
  });
  it("prepends an exact invocation, replaces an incomplete first slash token and never sends",()=>{
    assert.deepEqual(insertInvocation("inspect this change",{anchor:0,head:0},"/one:review"),{text:"/one:review inspect this change",selection:{anchor:12,head:12}});
    assert.equal(insertInvocation("/one:rev inspect",{anchor:6,head:6},"/one:review").text,"/one:review inspect");
    assert.equal(insertInvocation("body /other",{anchor:5,head:11},"/two:review").text,"/two:review body /other");
    assert.throws(()=>insertInvocation("text",{anchor:0,head:0},"/wrong\ncommand"),/invocation/i);
  });
  it("does not let an older refresh overwrite the newest catalog snapshot",async()=>{
    const pending:((items:readonly ComposerCommand[])=>void)[]=[];
    const catalog=new ComposerCatalog({isCurrent:()=>true,listCommands:()=>new Promise(r=>pending.push(r))});
    const first=catalog.list(target,true);const latest=catalog.list(target,true);
    pending[1]!(commands);await latest;pending[0]!([{invocation:"/old",description:"Old",source:"builtin"}]);await first;
    assert.deepEqual(await catalog.list(target),commands);
  });
});
