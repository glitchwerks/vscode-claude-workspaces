import assert from "node:assert/strict";
import { decodeHostMessage, decodeWebviewMessage } from "../../src/panel/protocol";
import { decodeComposerHostMessage, decodeComposerWebviewMessage } from "../../src/panel/composerProtocol";
import { composerFirstUuid as id, composerSecondUuid as second, composerSession } from "../support/composerHarness";

const target = {sessionId:"pty-one",claudeSessionId:id,generation:second};
const draft = composerSession().draft;
const page = {revision:0,rows:[{claudeSessionId:id,rootId:"root-one",rootPath:"I:/fixture",displayName:"Fixture",draftRevision:1}]};
const browser = [
  {type:"composerValidateReferences",documentId:id,target,requestId:second,revision:1,paths:["src/file.ts"]},
  {type:"composerVisibilityChanged",documentId:id,visible:false},
  {type:"composerConfigureShortcuts",documentId:id},
  {type:"composerLayoutChanged",documentId:id,splitRatio:0.4},
  {type:"composerRequestRecovery",documentId:id,requestId:second},
  {type:"composerRequestRecovery",documentId:id,requestId:second,cursor:{revision:1,afterUuid:id}},
  {type:"composerRestoreDraft",documentId:id,claudeSessionId:second,expectedRevision:1},
  {type:"composerDraftChanged",target,draft},
  {type:"composerSubmit",request:{target,submissionId:id,draft}},
  {type:"composerRequestCatalog",target,requestId:id},
  {type:"composerPickFile",target,requestId:id},
  {type:"composerHistorySelected",target,index:0,mode:"append",expectedRevision:1},
  {type:"composerFavoriteChanged",target,invocation:"/fixture:review",enabled:true},
  {type:"composerFocusChanged",target,documentId:id,focused:true,pickerFocused:false,viewFocused:true}
];
const host = [
  {type:"composerLayoutStatus",documentId:id,layout:{splitRatio:0.4},status:"saved"},
  {type:"composerRecoveryInvalidated",documentId:id,revision:1},
  {type:"composerRecoveryPage",documentId:id,requestId:id,page,actions:["restoreDraft"]},
  {type:"composerHydrate",capability:{status:"available",target},session:composerSession(),visible:true,layout:{splitRatio:0.4},favorites:["/context"],canSubmit:true},
  {type:"composerHydrate",capability:{status:"unavailable",sessionId:"pty-one",generation:second,reason:"unsupported-identity"},visible:true,layout:{splitRatio:0.4},favorites:[],canSubmit:false},
  {type:"composerDraftStatus",target,revision:1,status:"error"},
  {type:"composerDraftStatus",target,revision:0,status:"unsaved"},
  {type:"composerSubmitResult",target,result:{status:"accepted",submissionId:id,revision:1}},
  {type:"composerSubmitResult",target,result:{status:"rejected",submissionId:id,reason:"dialog"}},
  {type:"composerSubmitResult",target,result:{status:"unconfirmed",submissionId:id}},
  {type:"composerCatalog",target,requestId:id,commands:[{invocation:"/context",description:"Context",source:"builtin"}],status:"ready"},
  {type:"composerInsertText",target,requestId:id,expectedRevision:1,text:"@\"file name.md\""},
  {type:"composerFocus",target,documentId:id,destination:"terminal"},
  {type:"composerAction",documentId:id,action:"toggle"},
  {type:"composerAction",target,documentId:id,action:"submit"},
  {type:"composerReset",documentId:id}
  ,{type:"composerReferenceValidation",documentId:id,target,requestId:second,revision:1,results:[{value:"src/file.ts",status:"missing"}]}
];

describe("closed composer protocol", () => {
  it("accepts document-only terminal focus but rejects targetless editor focus and invalid view flags",()=>{
    const message={type:"composerFocusChanged",documentId:id,focused:false,pickerFocused:false,viewFocused:true};
    assert.equal(decodeComposerWebviewMessage(message).ok,true);
    for(const extra of [{focused:true},{pickerFocused:true},{viewFocused:"true"},{viewFocused:undefined}]){
      assert.equal(decodeComposerWebviewMessage({...message,...extra}).ok,false);
    }
  });
  for (const message of browser) it(`decodes browser ${message.type} through both boundaries`, () => {
    assert.deepEqual(decodeComposerWebviewMessage(message),{ok:true,value:message});
    assert.equal(decodeWebviewMessage(message).ok,true);
    assert.equal(decodeComposerWebviewMessage({...message,extra:"forbidden"}).ok,false);
  });
  for (const message of host) it(`decodes host ${message.type} through both boundaries`, () => {
    assert.deepEqual(decodeComposerHostMessage(message),{ok:true,value:message});
    assert.equal(decodeHostMessage(message).ok,true);
    assert.equal(decodeComposerHostMessage({...message,extra:"forbidden"}).ok,false);
  });
  it("rejects nested unknowns, impossible identities, indices, selections and capabilities", () => {
    const invalid = [
      {type:"composerDraftChanged",target:{...target,rootPath:"I:/escape"},draft},
      {type:"composerDraftChanged",target:{...target,claudeSessionId:"PTY"},draft},
      {type:"composerDraftChanged",target,draft:{...draft,selection:{anchor:-1,head:0}}},
      {type:"composerDraftChanged",target,draft:{...draft,selection:{anchor:0,head:0,path:"escape"}}},
      {type:"composerHistorySelected",target,index:Infinity,mode:"replace",expectedRevision:1},
      {type:"composerFavoriteChanged",target,invocation:"/review\n/run",enabled:true},
      {type:"composerLayoutChanged",documentId:id,splitRatio:NaN},
      {type:"composerLayoutChanged",documentId:"stale",splitRatio:0.4},
      {type:"composerLayoutChanged",documentId:id,splitRatio:0.9}
    ];
    for (const message of invalid) assert.equal(decodeComposerWebviewMessage(message).ok,false);
    assert.equal(decodeComposerHostMessage({...host[4],canSubmit:true}).ok,false);
    assert.equal(decodeComposerHostMessage({...host[4],session:composerSession()}).ok,false);
    assert.equal(decodeComposerHostMessage({...host[2],actions:[]}).ok,false);
    assert.equal(decodeComposerHostMessage({type:"composerAction",documentId:id,action:"submit"}).ok,false);
    assert.equal(decodeComposerWebviewMessage({type:"composerExecute",path:"anything"}).ok,false);
  });
  it("routes oversized editable text to explicit host storage status instead of silently dropping edits", () => {
    const text="x".repeat(1_048_577);
    assert.equal(decodeWebviewMessage({type:"composerDraftChanged",target,draft:{revision:2,text,selection:{anchor:0,head:text.length}}}).ok,true);
  });
  it("rejects oversized and malformed validation requests and unknown result statuses",()=>{
    const request={type:"composerValidateReferences",documentId:id,target,requestId:second,revision:1,paths:["file.ts"]};
    for(const paths of [Array(101).fill("file.ts"),[""],["bad\0path"],["x".repeat(4093)]])assert.equal(decodeComposerWebviewMessage({...request,paths}).ok,false);
    assert.equal(decodeComposerHostMessage({type:"composerReferenceValidation",documentId:id,target,requestId:second,revision:1,results:[{value:"file.ts",status:"guessed"}]}).ok,false);
  });
});
