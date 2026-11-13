import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import type { CompanionGroup, CompanionNode, CompanionSnapshot } from "../../src/companion/companionTypes";
import { CompanionModel } from "../../src/companion/companionModel";
import { companionHarness, fixtureTarget } from "../support/companionHarness";
import { decodeCompanionHostMessage, decodeCompanionWebviewMessage, decodeCompanionSnapshot, decodeCompanionDelta } from "../../src/panel/companionProtocol";

interface RootVector {id:string;direction:string;wire:string;expected:{accepted:boolean}}
interface GroupVector {id:string;group:CompanionGroup;expected:string}
const fixture=JSON.parse(readFileSync(resolve(__dirname,"../../../test/fixtures/companion/copy-cases.json"),"utf8")) as {
  viewRootExamples:RootVector[];viewGroupExamples:GroupVector[];
  viewStatusLabelPairs:{provenanceStatus:CompanionGroup["provenanceStatus"];statusLabel:string|null}[];
};
const positive=fixture.viewRootExamples.filter(v=>v.expected.accepted);
const payload=(kind:string):Record<string,unknown>=>JSON.parse(positive.find(v=>JSON.parse(v.wire).payload.kind===kind)!.wire).payload as Record<string,unknown>;
const host=decodeCompanionHostMessage,web=decodeCompanionWebviewMessage;
const group=():CompanionGroup=>({groupId:"g",captureEpoch:"a".repeat(32),sourceRevision:1,speaker:"assistant",sourceText:"text",nodes:[{kind:"text",nodeId:"n",sourceSpan:{start:0,end:4},text:"text"}],targets:[],provenanceStatus:"none",statusLabel:null});
const snapshot=(groups:readonly CompanionGroup[]=[group()]):CompanionSnapshot=>({groups,historyBoundary:false,captureStatus:{state:"active",reason:null}});
const clone=<T>(value:T):T=>structuredClone(value);
function rejected(value:{ok:boolean}):void {assert.equal(value.ok,false);}

describe("closed companion direction dictionaries",()=>{
  for(const vector of positive)it("decodes exact payload "+vector.id,()=>{
    const value=JSON.parse(vector.wire).payload as unknown;
    const decoder=vector.direction==="host-to-view"?host:web;
    assert.deepEqual(decoder(value),{ok:true,value});
    rejected((vector.direction==="host-to-view"?web:host)(value));
  });
  for(const vector of positive)it("rejects extra/missing/malformed fields for "+vector.id,()=>{
    const value=JSON.parse(vector.wire).payload as Record<string,unknown>;
    const decoder=vector.direction==="host-to-view"?host:web;
    rejected(decoder({...value,run:true}));
    for(const key of Object.keys(value)){
      const missing={...value};delete missing[key];rejected(decoder(missing));
      rejected(decoder({...value,[key]:{}}));
    }
  });
  it("rejects unsupported values without throwing or accepting root envelopes",()=>{
    for(const value of [null,[],1,"text",undefined,{v:1,kind:"companion.run",viewId:"a".repeat(32)},JSON.parse(positive[0]!.wire)]){
      rejected(host(value));rejected(web(value));
    }
  });
  it("bounds opaque IDs in UTF8 and rejects malformed scalars and canonical IDs",()=>{
    const value=payload("companion.copy");
    assert.equal(web({...value,sessionId:"é".repeat(64),generation:"g".repeat(128),targetId:"t".repeat(128)}).ok,true);
    for(const [key,bad] of [["sessionId","é".repeat(65)],["sessionId",""],["generation","g".repeat(129)],["targetId","t".repeat(129)],["viewId","A".repeat(32)],["projectionId","a".repeat(31)],["sessionId","\ud800"],["targetId","a\0b"]])rejected(web({...value,[key as string]:bad}));
    for(const documentId of ["88888888-8888-4888-8888-88888888888X","88888888-8888-4888-8888-888888888888 ","" ])rejected(web({...payload("companion.ready"),documentId}));
  });
  it("accepts safe revision boundaries and rejects invalid revision/action numbers",()=>{
    const value=payload("companion.copy");
    assert.equal(web({...value,appliedRevision:0,targetRevision:Number.MAX_SAFE_INTEGER,actionId:Number.MAX_SAFE_INTEGER}).ok,true);
    for(const key of ["appliedRevision","targetRevision","actionId"])for(const number of [-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])rejected(web({...value,[key]:number}));
    for(const key of ["targetRevision","actionId"])rejected(web({...value,[key]:0}));
  });
  it("checks chunk scalar/byte/index bounds and the entire future root message size",()=>{
    const value=payload("companion.transferChunk");
    assert.equal(host({...value,data:"é".repeat(32768),byteLength:65536,chunkIndex:8191}).ok,true);
    for(const fields of [{data:"",byteLength:0},{data:"x",byteLength:2},{data:"x".repeat(65537),byteLength:65537},{data:"\ud800",byteLength:3},{chunkIndex:8192},{chunkIndex:-1}])rejected(host({...value,...fields}));
    const boundary={...value,data:"\u0001".repeat(43639)+"a",byteLength:43640};
    assert.equal(Buffer.byteLength(JSON.stringify({type:"companion",payload:boundary})),262144);
    assert.equal(host(boundary).ok,true);
    rejected(host({...boundary,data:(boundary.data)+"a",byteLength:43641}));
  });
  it("checks transfer declaration relationships without claiming receiver order/hash authority",()=>{
    const value=payload("companion.transferBegin");
    assert.equal(host({...value,byteLength:8388608,chunkCount:8192}).ok,true);
    assert.equal(host({...value,mode:"delta",baseRevision:0,revision:1}).ok,true);
    for(const fields of [{mode:"snapshot",baseRevision:0},{mode:"delta",baseRevision:null},{mode:"delta",baseRevision:1},{mode:"delta",baseRevision:2},{chunkCount:0},{chunkCount:8193},{byteLength:8388609},{byteLength:0},{chunkCount:99,byteLength:98},{sha256:"A".repeat(64)}])rejected(host({...value,...fields}));
    for(const kind of ["companion.transferEnd","companion.transferReady"]){const decoder=kind.endsWith("End")?host:web;rejected(decoder({...payload(kind),byteLength:8388609}));}
    assert.equal(web({...payload("companion.transferAck"),nextChunkIndex:8192,byteLength:8388608}).ok,true);
    rejected(web({...payload("companion.transferAck"),nextChunkIndex:8193}));
  });
  it("keeps Review values literal and bounded, excluding NUL and invalid scalar values",()=>{
    for(const kind of ["companion.reviewOpened","companion.reviewCopy"]){
      const value=payload(kind),decoder=kind.endsWith("Opened")?host:web;
      const changed=(text:string)=>({...value,value:text,...(kind.endsWith("Opened")?{byteLength:Buffer.byteLength(text)}:{})});
      assert.equal(decoder(changed("é".repeat(16384))).ok,true);
      for(const text of ["é".repeat(16385),"a\0b","\udfff"])rejected(decoder(changed(text)));
      if(kind.endsWith("Opened"))rejected(decoder({...value,byteLength:1}));
    }
  });
  it("checks bounded action status/reason enums and optional relevant IDs",()=>{
    const value=payload("companion.actionResult");
    for(const [status,reason] of [["ok",null],["invalid","INVALID_MESSAGE"],["stale","SOURCE_CHANGED"],["busy","COPY_PENDING"],["unavailable","EXPIRED_REVIEW"],["cancelled",null],["duplicateExpired","EXPIRED_ACTION"],["inputSent",null],["uncertain",null],["settledAfterUncertain",null]])assert.equal(host({...value,status,reason}).ok,true);
    assert.equal(host({...value,targetId:"T",reviewId:"a".repeat(32)}).ok,true);
    for(const fields of [{status:"ran"},{reason:"anything"},{reviewId:"wrong"},{targetId:""},{targetId:null},{value:"clipboard"}])rejected(host({...value,...fields}));
    for(const [kind,key] of [["companion.transferAbort","reason"],["companion.reviewInvalidated","reason"],["companion.resync","reason"]])rejected((kind==="companion.resync"?web:host)({...payload(kind!),[key!]:"arbitrary"}));
  });
});

describe("closed logical companion projections",()=>{
  for(const vector of fixture.viewGroupExamples)it("validates selected group "+vector.id,()=>{
    assert.equal(decodeCompanionSnapshot(snapshot([vector.group])).ok,vector.expected.startsWith("accept"));
  });
  for(const pair of fixture.viewStatusLabelPairs)it("accepts fixed "+pair.provenanceStatus+" / "+pair.statusLabel,()=>{
    assert.equal(decodeCompanionSnapshot(snapshot([{...group(),...pair}])).ok,true);
  });
  it("validates complete snapshots and ordered four-member deltas without projecting malformed entries",()=>{
    const value=snapshot();assert.deepEqual(decodeCompanionSnapshot(value),{ok:true,value});
    const delta={changes:[{kind:"upsertGroup",group:group()},{kind:"removeGroup",groupId:"g"},{kind:"historyBoundary",value:true},{kind:"captureStatus",value:{state:"unavailable",reason:"GAP"}}]};
    assert.deepEqual(decodeCompanionDelta(delta),{ok:true,value:delta});
    for(const invalid of [{...value,extra:true},{...value,captureStatus:{state:"active"}},{...value,groups:[group(),{}]}, {...value,historyBoundary:0}])rejected(decodeCompanionSnapshot(invalid));
    for(const invalid of [{changes:[{kind:"upsertGroup",group:{}}]},{changes:[{kind:"removeGroup",groupId:"g",extra:1}]},{changes:[{kind:"historyBoundary",value:0}]},{changes:[{kind:"captureStatus",value:{state:"unknown",reason:null}}]},{changes:[{kind:"run"}]},{changes:Array(65).fill(delta.changes[2])}])rejected(decodeCompanionDelta(invalid));
    assert.equal(decodeCompanionDelta({changes:Array(64).fill(delta.changes[2])}).ok,true);
  });
  it("checks exact logical/group/target/node dictionaries and capture status enums",()=>{
    const g=group();
    for(const key of Object.keys(g)){const bad={...g} as Record<string,unknown>;delete bad[key];rejected(decodeCompanionSnapshot(snapshot([bad as unknown as CompanionGroup])));}
    rejected(decodeCompanionSnapshot(snapshot([{...g,run:true} as CompanionGroup])));
    for(const captureStatus of [{state:"active",reason:"anything"},{state:"other",reason:null},{state:"active",reason:null,extra:true}])rejected(decodeCompanionSnapshot({...snapshot(),captureStatus}));
    for(const node of [{...g.nodes[0],extra:true},{kind:"text",nodeId:"n",text:"text"},{kind:"imagePlaceholder",nodeId:"n",sourceSpan:null,alt:"a",src:"https://a"}])rejected(decodeCompanionSnapshot(snapshot([{...g,nodes:[node as CompanionNode]}])));
  });
  it("checks spans, unique identities, same-group references, scalar boundaries and path Review restrictions",()=>{
    const g=clone(fixture.viewGroupExamples[0]!.group),t=g.targets[0]!;
    assert.equal(decodeCompanionSnapshot(snapshot([g])).ok,true);
    for(const patch of [{groupId:"other"},{sourceStart:-1},{sourceEnd:g.sourceText.length+1},{sourceStart:3,sourceEnd:2},{targetRevision:0},{kind:"command",action:"review"},{literal:"injected"}])rejected(decodeCompanionSnapshot(snapshot([{...g,targets:[{...t,...patch} as typeof t]}])));
    const code=g.nodes[0]!;
    rejected(decodeCompanionSnapshot(snapshot([{...g,nodes:[{...code,targetId:"missing"} as CompanionNode]}])));
    rejected(decodeCompanionSnapshot(snapshot([{...g,nodes:[{...code,sourceSpan:{start:0,end:g.sourceText.length+1}}]}])));
    rejected(decodeCompanionSnapshot(snapshot([{...g,targets:[t,t]}])));
    rejected(decodeCompanionSnapshot(snapshot([g,g])));
    rejected(decodeCompanionSnapshot(snapshot([{...g,nodes:[code,code]}])));
    const emoji={...g,sourceText:"😀",nodes:[],targets:[{...t,sourceStart:1,sourceEnd:2}]};rejected(decodeCompanionSnapshot(snapshot([emoji])));
    const p={...t,kind:"path" as const,action:"review" as const};assert.equal(decodeCompanionSnapshot(snapshot([{...g,targets:[p]}])).ok,true);
    rejected(decodeCompanionSnapshot(snapshot([{...g,sourceText:"x".repeat(32769),nodes:[],targets:[{...p,sourceStart:0,sourceEnd:32769}]}])));
    rejected(decodeCompanionSnapshot(snapshot([{...g,sourceText:"a\0b",nodes:[],targets:[{...t,sourceStart:0,sourceEnd:3}]}])));
    const context={...group(),sourceText:"a\0b",nodes:[{kind:"text" as const,nodeId:"n",sourceSpan:{start:0,end:3},text:"a\0b"}]};
    assert.deepEqual(decodeCompanionSnapshot(snapshot([context])),{ok:true,value:snapshot([context])});
  });
  it("keeps links inert and image shapes resource-free while accepting every node union",()=>{
    const span={start:0,end:4},text=group().nodes[0]!;
    const nodes:CompanionNode[]=[text,...(["paragraph","emphasis","strong","blockquote","listItem"] as const).map((kind,i)=>({kind,nodeId:"p"+i,sourceSpan:span,children:[{...text,nodeId:"child"+i}]})),{kind:"list",nodeId:"list",sourceSpan:span,ordered:true,startNumber:1,children:[]},{kind:"heading",nodeId:"head",sourceSpan:span,level:6,children:[]},{kind:"code",nodeId:"code",sourceSpan:span,text:"text",language:null,block:false,targetId:null},{kind:"softBreak",nodeId:"soft",sourceSpan:span},{kind:"hardBreak",nodeId:"hard",sourceSpan:span},{kind:"link",nodeId:"link",sourceSpan:span,href:"https://example.com/path",children:[]},{kind:"imagePlaceholder",nodeId:"image",sourceSpan:span,alt:"alt"},{kind:"notice",nodeId:"notice",sourceSpan:null,reason:"GAP",text:"Capture notice"}];
    assert.equal(decodeCompanionSnapshot(snapshot([{...group(),nodes}])).ok,true);
    const link=nodes.find(n=>n.kind==="link")!;
    for(const href of ["javascript:alert(1)","data:text/plain,x","file:///C:/x","https://user:password@example.com","https://x/"+"a".repeat(2048)])rejected(decodeCompanionSnapshot(snapshot([{...group(),nodes:[{...link,href} as CompanionNode]}])));
    assert.equal(decodeCompanionSnapshot(snapshot([{...group(),nodes:[{...link,href:null} as CompanionNode]}])).ok,true);
    for(const node of [{kind:"heading",level:7,children:[]},{kind:"list",ordered:true,startNumber:0,children:[]},{kind:"notice",reason:"arbitrary",text:"notice"},{kind:"imagePlaceholder",alt:"a".repeat(257)}])rejected(decodeCompanionSnapshot(snapshot([{...group(),nodes:[{nodeId:"n",sourceSpan:span,...node} as CompanionNode]}])));
    const parent:CompanionNode={kind:"paragraph",nodeId:"p",sourceSpan:{start:1,end:3},children:[text]};rejected(decodeCompanionSnapshot(snapshot([{...group(),nodes:[parent]}])));
  });
  it("bounds short labels/languages, sources and null host-notice epochs",()=>{
    const g=group();
    assert.equal(decodeCompanionSnapshot(snapshot([{...g,sourceText:"x".repeat(1048576),nodes:[]}])).ok,true);
    rejected(decodeCompanionSnapshot(snapshot([{...g,sourceText:"x".repeat(1048577),nodes:[]}])));
    assert.equal(decodeCompanionSnapshot(snapshot([{...g,speaker:"tool",sourceText:"x".repeat(262144),nodes:[]}])).ok,true);
    rejected(decodeCompanionSnapshot(snapshot([{...g,speaker:"tool",sourceText:"x".repeat(262145),nodes:[]}])));
    assert.equal(decodeCompanionSnapshot(snapshot([{...g,speaker:"notice",captureEpoch:null}])).ok,true);
    rejected(decodeCompanionSnapshot(snapshot([{...g,captureEpoch:null}])));
    rejected(decodeCompanionSnapshot(snapshot([{...g,sourceText:"\ud800"}])));
    const t=fixture.viewGroupExamples[0]!.group.targets[0]!;
    rejected(decodeCompanionSnapshot(snapshot([{...fixture.viewGroupExamples[0]!.group,targets:[{...t,accessibleLabel:"é".repeat(129)}]}])));
    rejected(decodeCompanionSnapshot(snapshot([{...g,nodes:[{kind:"code",nodeId:"n",sourceSpan:{start:0,end:4},text:"text",block:true,language:"x".repeat(257),targetId:null}]}])));
  });
  it("bounds recursive depth, aggregate nodes, targets and complete message groups",()=>{
    const deep=(depth:number):CompanionNode=>depth===1?{...group().nodes[0],nodeId:"n1"} as CompanionNode:{kind:"paragraph",nodeId:"n"+depth,sourceSpan:{start:0,end:4},children:[deep(depth-1)]};
    assert.equal(decodeCompanionSnapshot(snapshot([{...group(),nodes:[deep(32)]}])).ok,true);
    rejected(decodeCompanionSnapshot(snapshot([{...group(),nodes:[deep(33)]}])));
    const nodes=Array.from({length:20000},(_,i)=>({...group().nodes[0],nodeId:"node"+i} as CompanionNode));
    assert.equal(decodeCompanionSnapshot(snapshot([{...group(),nodes}])).ok,true);
    rejected(decodeCompanionSnapshot(snapshot([{...group(),nodes:[...nodes,{...nodes[0],nodeId:"extra"} as CompanionNode]}])));
    const t=fixture.viewGroupExamples[0]!.group.targets[0]!;
    const targets=Array.from({length:2000},(_,i)=>({...t,groupId:"g",targetId:"target"+i,sourceEnd:4}));
    assert.equal(decodeCompanionSnapshot(snapshot([{...group(),targets}])).ok,true);
    rejected(decodeCompanionSnapshot(snapshot([{...group(),targets:[...targets,{...targets[0]!,targetId:"extra"}]}])));
    const groups=Array.from({length:200},(_,i)=>({...group(),groupId:"g"+i,nodes:[]}));
    assert.equal(decodeCompanionSnapshot(snapshot(groups)).ok,true);
    rejected(decodeCompanionSnapshot(snapshot([...groups,{...group(),groupId:"extra"}])));
  });
  it("enforces serialized logical bytes at 8 MiB, including JSON escaping",()=>{
    const groups=Array.from({length:8},(_,i)=>({...group(),groupId:"g"+i,sourceText:"x".repeat(1048576),nodes:[]}));
    const overhead=Buffer.byteLength(JSON.stringify(snapshot(groups)))-8*1048576;
    groups[7]!.sourceText=groups[7]!.sourceText.slice(overhead);
    assert.equal(Buffer.byteLength(JSON.stringify(snapshot(groups))),8388608);
    assert.equal(decodeCompanionSnapshot(snapshot(groups)).ok,true);
    groups[7]!.sourceText+="x";rejected(decodeCompanionSnapshot(snapshot(groups)));
    rejected(decodeCompanionSnapshot(snapshot([{...group(),sourceText:"\u0001".repeat(1048576),nodes:[{...group().nodes[0],sourceSpan:{start:0,end:1048576},text:"\u0001".repeat(1048576)} as CompanionNode]}])));
  });
  it("runs emitted decoder code in a browser-like global without Node imports or Buffer",()=>{
    const exports:Record<string,unknown>={};
    const source=readFileSync(resolve(__dirname,"../../src/panel/companionProtocol.js"),"utf8");
    runInNewContext(source,{exports,TextEncoder,URL});
    const decode=exports.decodeCompanionWebviewMessage as typeof web;
    assert.deepEqual(JSON.parse(JSON.stringify(decode(payload("companion.ready")))),{ok:true,value:payload("companion.ready")});
  });
  it("accepts real P2 snapshots and mutation batches without importing host code in the decoder",async()=>{
    const harness=companionHarness({evictComplete:request=>model.evictComplete(request)});
    const prepared=await harness.host.prepare(fixtureTarget.sessionId);assert.ok(prepared.ok);
    const binding=prepared.value,captureEpoch="a".repeat(32);
    const model=new CompanionModel({resources:harness.host,currentContext:()=>({binding,target:fixtureTarget,captureEpoch})});
    const batches:unknown[]=[];model.subscribe(batch=>batches.push({changes:batch.changes}));
    try{
      const source="Before\0 context.\n\nRun: "+"\x60"+"echo café"+"\x60"+"\n\n[link](https://example.com) ![alt](https://image)";
      const retention=harness.host.reserveRetention(binding,1048576+32768);assert.ok(retention);
      model.accept(binding,{kind:"observation",captureEpoch,observationId:1,ackSeq:1,observation:{kind:"assistantRow",scope:{kind:"main"},rowId:"row",blocks:[{kind:"text",index:0,text:source}]},retention});
      const value=model.snapshot(fixtureTarget.sessionId);assert.equal(value.groups.length,1);assert.equal(value.groups[0]!.targets.length,1);
      assert.deepEqual(decodeCompanionSnapshot(value),{ok:true,value});
      for(const batch of batches)assert.deepEqual(decodeCompanionDelta(batch),{ok:true,value:batch});
    }finally{model.dispose();}
  });
});


describe("companion protocol boundary regressions",()=>{
  it("uses the canonical legacy UUID version and variant for document pairing",()=>{
    for(const documentId of ["88888888-8888-0888-8888-888888888888","88888888-8888-4888-0888-888888888888"]){
      rejected(web({...payload("companion.ready"),documentId}));
      rejected(host({...payload("companion.bind"),documentId}));
    }
  });
  it("accepts an empty child list at node depth 32 without allowing a node at depth 33",()=>{
    const nest=(depth:number):CompanionNode=>({kind:"paragraph",nodeId:"d"+depth,sourceSpan:{start:0,end:4},children:depth===1?[]:[nest(depth-1)]});
    assert.equal(decodeCompanionSnapshot(snapshot([{...group(),nodes:[nest(32)]}])).ok,true);
    rejected(decodeCompanionSnapshot(snapshot([{...group(),nodes:[nest(33)]}])));
  });
  it("rejects a declared transfer that cannot fit inside its chunk count",()=>{
    rejected(host({...payload("companion.transferBegin"),chunkCount:1,byteLength:65537}));
    assert.equal(host({...payload("companion.transferBegin"),chunkCount:1,byteLength:65536}).ok,true);
  });
  it("rejects a code button whose source span does not contain the referenced target",()=>{
    const g=fixture.viewGroupExamples[0]!.group;
    rejected(decodeCompanionSnapshot(snapshot([{...g,nodes:[{...g.nodes[0],sourceSpan:{start:1,end:g.sourceText.length}} as CompanionNode]}])));
  });
  it("keeps tool output text within 256 KiB but accepts P2 tool-speaker command groups at 1 MiB",()=>{
    const text="x".repeat(262145),g={...group(),speaker:"tool" as const,sourceText:""};
    rejected(decodeCompanionSnapshot(snapshot([{...g,nodes:[{kind:"text",nodeId:"n",sourceSpan:{start:0,end:0},text}]}])));
    const command={...g,sourceText:"x".repeat(1048576),nodes:[],provenanceStatus:"pending" as const,statusLabel:"Requested by Claude; execution not confirmed"};
    assert.equal(decodeCompanionSnapshot(snapshot([command])).ok,true);
    rejected(decodeCompanionSnapshot(snapshot([{...command,sourceText:command.sourceText+"x"}])));
  });
  it("rejects sparse arrays and keeps repeated complete group revisions ordered in deltas",()=>{
    rejected(decodeCompanionSnapshot({...snapshot(),groups:Array(1)}));
    rejected(decodeCompanionSnapshot(snapshot([{...group(),nodes:Array(1) as CompanionNode[]}])));
    rejected(decodeCompanionDelta({changes:Array(1)}));
    const delta={changes:[{kind:"upsertGroup",group:group()},{kind:"upsertGroup",group:{...group(),sourceRevision:2}}]};
    assert.deepEqual(decodeCompanionDelta(delta),{ok:true,value:delta});
  });
});
