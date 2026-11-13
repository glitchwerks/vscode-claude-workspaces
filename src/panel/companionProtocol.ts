import type { DecodeResult } from "./protocol";
import type { CompanionChange, CompanionGroup, CompanionSnapshot } from "../companion/companionTypes";

/** VW v1 limits; asynchronous transfer and retained-source accounting belong to the host. */
export const companionProtocolLimits=Object.freeze({messageBytes:262144,chunkBytes:65536,chunkCount:8192,
  logicalBytes:8388608,groups:200,nodes:20000,targets:2000,changes:64,sourceBytes:1048576,
  toolBytes:262144,reviewBytes:32768,idBytes:128,labelBytes:256,hrefBytes:2048,depth:32});
interface ViewEnvelope {readonly v:1;readonly viewId:string}
interface ProjectionEnvelope extends ViewEnvelope {readonly projectionId:string;readonly sessionId:string;readonly generation:string}
interface TargetAction {readonly actionId:number;readonly appliedRevision:number;readonly targetId:string;readonly targetRevision:number}
interface TransferIdentity {readonly transferId:string}
interface TransferCut extends TransferIdentity {readonly revision:number;readonly byteLength:number;readonly sha256:string}
export type CompanionActionStatus="ok"|"invalid"|"stale"|"busy"|"unavailable"|"cancelled"|"duplicateExpired"|"inputSent"|"uncertain"|"settledAfterUncertain";
export type CompanionActionReason="SOURCE_CHANGED"|"EVICTED"|"RESET"|"DOCUMENT_CLOSED"|"WRONG_BINDING"|"INVALID_MESSAGE"|"NOT_READY"|"COPY_PENDING"|"PLATFORM_ERROR"|"EXPIRED_ACTION"|"EXPIRED_REVIEW";
/** Closed host payloads; the root protocol supplies the single type/payload wrapper. */
export type CompanionHostMessage=ProjectionEnvelope & (
  {readonly kind:"companion.bind";readonly documentId:string;readonly claudeSessionId:string;readonly modelRevision:number} |
  ({readonly kind:"companion.transferBegin";readonly chunkCount:number} & TransferCut &
    ({readonly mode:"snapshot";readonly baseRevision:null}|{readonly mode:"delta";readonly baseRevision:number})) |
  ({readonly kind:"companion.transferChunk";readonly chunkIndex:number;readonly data:string;readonly byteLength:number} & TransferIdentity) |
  ({readonly kind:"companion.transferEnd"} & TransferCut) |
  ({readonly kind:"companion.transferCommit";readonly revision:number} & TransferIdentity) |
  ({readonly kind:"companion.transferAbort";readonly reason:"stale"|"order"|"decode"|"timeout"|"capacity"|"closed"} & TransferIdentity) |
  {readonly kind:"companion.reviewOpened";readonly actionId:number;readonly reviewId:string;readonly targetId:string;readonly targetRevision:number;readonly value:string;readonly byteLength:number} |
  {readonly kind:"companion.reviewInvalidated";readonly reviewId:string;readonly reason:"sourceChanged"|"evicted"|"reset"|"closed"|"expired"} |
  {readonly kind:"companion.actionResult";readonly actionId:number;readonly status:CompanionActionStatus;readonly reason:CompanionActionReason|null;readonly targetId?:string;readonly reviewId?:string}
);
/** Closed browser payloads; structural acceptance grants no binding or action authority. */
export type CompanionWebviewMessage=(ViewEnvelope & {readonly kind:"companion.ready";readonly documentId:string}) | (ProjectionEnvelope & (
  {readonly kind:"companion.resync";readonly appliedRevision:number;readonly reason:"decode"|"order"|"timeout"|"capacity"} |
  ({readonly kind:"companion.transferAck";readonly nextChunkIndex:number;readonly byteLength:number} & TransferIdentity) |
  ({readonly kind:"companion.transferReady"} & TransferCut) |
  ({readonly kind:"companion.copy"|"companion.reviewOpen"} & TargetAction) |
  ({readonly kind:"companion.reviewCopy";readonly reviewId:string;readonly value:string} & TargetAction) |
  {readonly kind:"companion.reviewCancel";readonly actionId:number;readonly reviewId:string} |
  {readonly kind:"companion.toggleRaw"|"companion.escape";readonly actionId:number}
));
/** Ordered, atomic logical changes; applying base revisions is a receiver responsibility. */
export interface CompanionDelta {readonly changes:readonly CompanionChange[]}
type Dictionary=Record<string,unknown>;
const limits=companionProtocolLimits;
const encoder=new TextEncoder();
const common=["v","kind","viewId"];
const projection=[...common,"projectionId","sessionId","generation"];
const targetAction=["actionId","appliedRevision","targetId","targetRevision"];
const cut=["transferId","revision","byteLength","sha256"];
const statuses=["ok","invalid","stale","busy","unavailable","cancelled","duplicateExpired","inputSent","uncertain","settledAfterUncertain"];
const reasons=["SOURCE_CHANGED","EVICTED","RESET","DOCUMENT_CLOSED","WRONG_BINDING","INVALID_MESSAGE","NOT_READY","COPY_PENDING","PLATFORM_ERROR","EXPIRED_ACTION","EXPIRED_REVIEW"];
const captureReasons=[null,"INITIALIZING","UNSUPPORTED_BUILD","CAPACITY","GAP","IDENTITY_CHANGED","CHANNEL_RETIRED","CONTROL_REJECTED","HANDSHAKE_TIMEOUT","SCHEMA_REJECTED","CONTENT_REJECTED","TRANSACTION_TIMEOUT"];
const labels:Readonly<Record<string,readonly (string|null)[]>>={none:[null],suggested:["Suggested command"],example:["Command shown by Claude"],code:["Code shown by Claude"],
  pending:["Requested by Claude; execution not confirmed","Awaiting stored result; execution not confirmed"],completed:["Claude ran this / Tool completed"],
  backgrounded:["Claude started this / Backgrounded (last reported)"],interrupted:["Interruption reported; execution not confirmed"],denied:["Permission denied; execution not confirmed"],
  "tool-error":["Tool reported error; execution not confirmed"],unknown:["Execution not confirmed","Conflicting native evidence","Outcome unknown"],notice:["Capture notice"]};
function record(value:unknown):value is Dictionary {return value!==null&&typeof value==="object"&&!Array.isArray(value);}
function exact(value:unknown,keys:readonly string[]):value is Dictionary {
  return record(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
}
function integer(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):value is number {
  return typeof value==="number"&&Number.isSafeInteger(value)&&value>=min&&value<=max;
}
function scalar(value:string):boolean {return !/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value);}
function bounded(value:unknown,max:number,min=0):value is string {
  return typeof value==="string"&&value.length<=max&&scalar(value)&&encoder.encode(value).length>=min&&encoder.encode(value).length<=max;
}
function opaque(value:unknown):value is string {return bounded(value,limits.idBytes,1)&&!value.includes("\0");}
function hex32(value:unknown):value is string {return typeof value==="string"&&/^[a-f0-9]{32}$/.test(value);}
function uuid(value:unknown):boolean {return typeof value==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value);}
function sha256(value:unknown):boolean {return typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);}
function member(value:unknown,values:readonly unknown[]):boolean {return values.includes(value);}
function requireValid(valid:unknown):asserts valid {if(!valid)throw new Error("Invalid companion schema or content bounds.");}
function array(value:unknown,max:number):asserts value is unknown[] {
  requireValid(Array.isArray(value)&&value.length<=max);
  for(let i=0;i<value.length;i++)requireValid(Object.hasOwn(value,i));
}
/** Count exact JSON bytes incrementally; never allocate a second unbounded logical history. */
function serializedBound(value:unknown,max:number):void {
  let total=0;
  const add=(amount:number)=>{total+=amount;requireValid(total<=max);};
  const visit=(entry:unknown,depth:number):void=>{
    requireValid(depth<=96);
    if(entry===null||typeof entry==="boolean"||typeof entry==="number"||typeof entry==="string"){
      requireValid(typeof entry!=="number"||Number.isFinite(entry));
      add(encoder.encode(JSON.stringify(entry)).length);return;
    }
    requireValid(record(entry)||Array.isArray(entry));
    add(2);
    if(Array.isArray(entry))for(let i=0;i<entry.length;i++){if(i)add(1);visit(entry[i],depth+1);}
    else {let first=true;for(const [key,child] of Object.entries(entry)){if(!first)add(1);first=false;add(encoder.encode(JSON.stringify(key)).length+1);visit(child,depth+1);}}
  };
  visit(value,0);
}
function decode<T>(value:unknown,validate:(v:unknown)=>void):DecodeResult<T> {
  try {validate(value);return {ok:true,value:value as T};}
  catch {return {ok:false,error:"Invalid companion schema or content bounds."};}
}
function projected(value:Dictionary):boolean {
  return value.v===1&&hex32(value.viewId)&&hex32(value.projectionId)&&opaque(value.sessionId)&&opaque(value.generation);
}
function targetFields(value:Dictionary):boolean {
  return integer(value.actionId,1)&&integer(value.appliedRevision)&&opaque(value.targetId)&&integer(value.targetRevision,1);
}
function transferCut(value:Dictionary):boolean {
  return hex32(value.transferId)&&integer(value.revision)&&integer(value.byteLength,1,limits.logicalBytes)&&sha256(value.sha256);
}
function reviewValue(value:unknown):value is string {return bounded(value,limits.reviewBytes)&&!value.includes("\0");}
/** Reject oversized serialized root envelopes even when a decoded chunk is within 64 KiB. */
function messageBound(value:unknown):void {serializedBound({type:"companion",payload:value},limits.messageBytes);}
/** Validate one host payload, without advancing transfer, document or action state. */
export function decodeCompanionHostMessage(value:unknown):DecodeResult<CompanionHostMessage> {
  return decode(value,v=>{
    requireValid(record(v)&&projected(v));
    switch(v.kind){
      case "companion.bind":requireValid(exact(v,[...projection,"documentId","claudeSessionId","modelRevision"])&&uuid(v.documentId)&&opaque(v.claudeSessionId)&&integer(v.modelRevision));break;
      case "companion.transferBegin":
        requireValid(exact(v,[...projection,...cut,"mode","baseRevision","chunkCount"])&&transferCut(v)&&integer(v.chunkCount,1,limits.chunkCount)&&
          (v.mode==="snapshot"?v.baseRevision===null:v.mode==="delta"&&integer(v.baseRevision)&&integer(v.revision)&&v.revision>v.baseRevision)&&
          integer(v.byteLength)&&v.byteLength>=v.chunkCount&&v.byteLength<=v.chunkCount*limits.chunkBytes);break;
      case "companion.transferChunk":
        requireValid(exact(v,[...projection,"transferId","chunkIndex","data","byteLength"])&&hex32(v.transferId)&&integer(v.chunkIndex,0,limits.chunkCount-1)&&
          bounded(v.data,limits.chunkBytes,1)&&integer(v.byteLength,1,limits.chunkBytes)&&encoder.encode(v.data).length===v.byteLength);break;
      case "companion.transferEnd":requireValid(exact(v,[...projection,...cut])&&transferCut(v));break;
      case "companion.transferCommit":requireValid(exact(v,[...projection,"transferId","revision"])&&hex32(v.transferId)&&integer(v.revision));break;
      case "companion.transferAbort":requireValid(exact(v,[...projection,"transferId","reason"])&&hex32(v.transferId)&&member(v.reason,["stale","order","decode","timeout","capacity","closed"]));break;
      case "companion.reviewOpened":
        requireValid(exact(v,[...projection,"actionId","reviewId","targetId","targetRevision","value","byteLength"])&&integer(v.actionId,1)&&hex32(v.reviewId)&&opaque(v.targetId)&&
          integer(v.targetRevision,1)&&reviewValue(v.value)&&integer(v.byteLength,0,limits.reviewBytes)&&encoder.encode(v.value).length===v.byteLength);break;
      case "companion.reviewInvalidated":requireValid(exact(v,[...projection,"reviewId","reason"])&&hex32(v.reviewId)&&member(v.reason,["sourceChanged","evicted","reset","closed","expired"]));break;
      case "companion.actionResult":
        requireValid(exact(v,[...projection,"actionId","status","reason",...(Object.hasOwn(v,"targetId")?["targetId"]:[]),...(Object.hasOwn(v,"reviewId")?["reviewId"]:[])])&&
          integer(v.actionId,1)&&member(v.status,statuses)&&(v.reason===null||member(v.reason,reasons))&&
          (!Object.hasOwn(v,"targetId")||opaque(v.targetId))&&(!Object.hasOwn(v,"reviewId")||hex32(v.reviewId)));break;
      default:requireValid(false);
    }
    messageBound(v);
  });
}
/** Validate one browser payload; IDs remain untrusted until the host checks its current binding. */
export function decodeCompanionWebviewMessage(value:unknown):DecodeResult<CompanionWebviewMessage> {
  return decode(value,v=>{
    requireValid(record(v));
    if(v.kind==="companion.ready")requireValid(exact(v,[...common,"documentId"])&&v.v===1&&hex32(v.viewId)&&uuid(v.documentId));
    else {
      requireValid(projected(v));
      switch(v.kind){
        case "companion.resync":requireValid(exact(v,[...projection,"appliedRevision","reason"])&&integer(v.appliedRevision)&&member(v.reason,["decode","order","timeout","capacity"]));break;
        case "companion.transferAck":requireValid(exact(v,[...projection,"transferId","nextChunkIndex","byteLength"])&&hex32(v.transferId)&&integer(v.nextChunkIndex,0,limits.chunkCount)&&integer(v.byteLength,0,limits.logicalBytes));break;
        case "companion.transferReady":requireValid(exact(v,[...projection,...cut])&&transferCut(v));break;
        case "companion.copy":case "companion.reviewOpen":requireValid(exact(v,[...projection,...targetAction])&&targetFields(v));break;
        case "companion.reviewCopy":requireValid(exact(v,[...projection,...targetAction,"reviewId","value"])&&targetFields(v)&&hex32(v.reviewId)&&reviewValue(v.value));break;
        case "companion.reviewCancel":requireValid(exact(v,[...projection,"actionId","reviewId"])&&integer(v.actionId,1)&&hex32(v.reviewId));break;
        case "companion.toggleRaw":case "companion.escape":requireValid(exact(v,[...projection,"actionId"])&&integer(v.actionId,1));break;
        default:requireValid(false);
      }
    }
    messageBound(v);
  });
}
interface Counts {nodes:number;targets:number;groups:Set<string>;nodeIds:Set<string>;targetIds:Set<string>}
function counts():Counts {return {nodes:0,targets:0,groups:new Set(),nodeIds:new Set(),targetIds:new Set()};}
function unique(value:unknown,seen:Set<string>):asserts value is string {requireValid(opaque(value)&&!seen.has(value));seen.add(value);}
/** UTF16 source offsets may not cut a Unicode scalar in half. */
function offset(value:number,text:string):boolean {return value===0||value===text.length||!(/[\uD800-\uDBFF]/.test(text[value-1]!)&&/[\uDC00-\uDFFF]/.test(text[value]!));}
function span(value:unknown,text:string,parent:{start:number;end:number}|null):value is {start:number;end:number} {
  return exact(value,["start","end"])&&integer(value.start,0,text.length)&&integer(value.end,value.start,text.length)&&offset(value.start,text)&&offset(value.end,text)&&
    (parent===null||(value.start>=parent.start&&value.end<=parent.end));
}
function captureStatus(value:unknown):void {
  requireValid(exact(value,["state","reason"])&&member(value.state,["starting","active","unavailable","retired","unsupported"])&&member(value.reason,captureReasons));
}
function allowedLink(value:unknown):boolean {
  if(value===null)return true;
  if(!bounded(value,limits.hrefBytes,1)||value.includes("\0"))return false;
  try{const url=new URL(value);return member(url.protocol,["http:","https:"])&&!url.username&&!url.password;}catch{return false;}
}
function nodes(value:unknown,g:CompanionGroup,state:Counts,depth:number,parent:{start:number;end:number}|null,targetSpans:Map<string,{start:number;end:number;copy:boolean}>):void {
  array(value,limits.nodes);requireValid(value.length===0||depth<=limits.depth);
  for(const node of value){
    requireValid(record(node));unique(node.nodeId,state.nodeIds);requireValid(++state.nodes<=limits.nodes);
    requireValid(node.sourceSpan===null?node.kind==="notice":span(node.sourceSpan,g.sourceText,parent));
    const keys=["kind","nodeId","sourceSpan"];
    const children=()=>nodes(node.children,g,state,depth+1,node.sourceSpan as {start:number;end:number},targetSpans);
    switch(node.kind){
      case "text":requireValid(exact(node,[...keys,"text"])&&bounded(node.text,sourceLimit(g.speaker,g.provenanceStatus)));break;
      case "paragraph":case "emphasis":case "strong":case "blockquote":case "listItem":requireValid(exact(node,[...keys,"children"]));children();break;
      case "list":requireValid(exact(node,[...keys,"children","ordered","startNumber"])&&typeof node.ordered==="boolean"&&(node.startNumber===null||integer(node.startNumber,1)));children();break;
      case "heading":requireValid(exact(node,[...keys,"children","level"])&&integer(node.level,1,6));children();break;
      case "code":{requireValid(exact(node,[...keys,"text","language","block","targetId"])&&bounded(node.text,sourceLimit(g.speaker,g.provenanceStatus))&&
        (node.language===null||bounded(node.language,limits.labelBytes))&&typeof node.block==="boolean"&&(node.targetId===null||opaque(node.targetId)&&targetSpans.has(node.targetId)));
        // Code keeps a raw retained slice: inline delimiters and structural fence newlines
        // may surround it. Review may display that complete raw spelling, without parsing it again.
        requireValid(record(node.sourceSpan));
        const sourceSpan=node.sourceSpan as {start:number;end:number};
        requireValid(g.sourceText.slice(sourceSpan.start,sourceSpan.end).includes(node.text as string));
        if(node.targetId!==null){
          const target=targetSpans.get(node.targetId as string)!;
          requireValid(sourceSpan.start<=target.start&&sourceSpan.end>=target.end);
          if(target.copy)requireValid(node.text===g.sourceText.slice(target.start,target.end));
        }break;}
      case "softBreak":case "hardBreak":requireValid(exact(node,keys));break;
      case "link":requireValid(exact(node,[...keys,"children","href"])&&allowedLink(node.href));children();break;
      case "imagePlaceholder":requireValid(exact(node,[...keys,"alt"])&&bounded(node.alt,limits.labelBytes));break;
      case "notice":requireValid(exact(node,[...keys,"reason","text"])&&member(node.reason,["GAP","HISTORY_EVICTED","CAPTURE_UNAVAILABLE","UNSUPPORTED_CONTENT","RENDER_LIMIT"])&&bounded(node.text,limits.labelBytes));break;
      default:requireValid(false);
    }
  }
}
/** P2 represents native command outcomes as tool-speaker groups, distinct from tool output. */
function sourceLimit(speaker:unknown,provenance:unknown):number {
  const commandGroup=speaker==="tool"&&member(provenance,["pending","completed","backgrounded","interrupted","denied","tool-error","unknown"]);
  return speaker==="tool"&&!commandGroup?limits.toolBytes:limits.sourceBytes;
}
function group(value:unknown,state:Counts):void {
  requireValid(exact(value,["groupId","captureEpoch","sourceRevision","speaker","sourceText","nodes","targets","provenanceStatus","statusLabel"]));
  unique(value.groupId,state.groups);
  requireValid(member(value.speaker,["assistant","tool","notice"])&&(hex32(value.captureEpoch)||value.captureEpoch===null&&value.speaker==="notice")&&integer(value.sourceRevision));
  requireValid(typeof value.provenanceStatus==="string"&&Object.hasOwn(labels,value.provenanceStatus)&&labels[value.provenanceStatus]!.includes(value.statusLabel as string|null));
  requireValid(bounded(value.sourceText,sourceLimit(value.speaker,value.provenanceStatus)));
  array(value.targets,limits.targets);
  const localTargets=new Map<string,{start:number;end:number;copy:boolean}>();
  for(const target of value.targets){
    requireValid(exact(target,["targetId","targetRevision","groupId","sourceStart","sourceEnd","kind","action","accessibleLabel","displayLabel"]));
    unique(target.targetId,state.targetIds);requireValid(++state.targets<=limits.targets);
    requireValid(integer(target.targetRevision,1)&&target.groupId===value.groupId&&span({start:target.sourceStart,end:target.sourceEnd},value.sourceText,null)&&
      member(target.kind,["command","code","path"])&&member(target.action,["copy","review"])&&
      bounded(target.accessibleLabel,limits.labelBytes)&&bounded(target.displayLabel,limits.labelBytes));
    localTargets.set(target.targetId,{start:target.sourceStart as number,end:target.sourceEnd as number,copy:target.action==="copy"});
    const literal=value.sourceText.slice(target.sourceStart as number,target.sourceEnd as number);
    requireValid(!literal.includes("\0")&&(target.kind!=="path"&&target.action!=="review"||bounded(literal,limits.reviewBytes)));
  }
  nodes(value.nodes,value as unknown as CompanionGroup,state,1,null,localTargets);
}
/** Validate a complete immutable model snapshot without admitting transfer or capture state. */
export function decodeCompanionSnapshot(value:unknown):DecodeResult<CompanionSnapshot> {
  return decode(value,v=>{
    requireValid(exact(v,["groups","historyBoundary","captureStatus"])&&typeof v.historyBoundary==="boolean");
    captureStatus(v.captureStatus);array(v.groups,limits.groups);
    const state=counts();for(const entry of v.groups)group(entry,state);
    serializedBound(v,limits.logicalBytes);
  });
}
/** Validate complete ordered changes; current appliedRevision and source ownership stay external. */
export function decodeCompanionDelta(value:unknown):DecodeResult<CompanionDelta> {
  return decode(value,v=>{
    requireValid(exact(v,["changes"]));array(v.changes,limits.changes);
    let totalNodes=0,totalTargets=0;
    for(const change of v.changes){
      requireValid(record(change));
      switch(change.kind){
        case "upsertGroup":{
          requireValid(exact(change,["kind","group"]));
          // Ordered replacements can reuse the same group's IDs in a later change.
          const state=counts();group(change.group,state);totalNodes+=state.nodes;totalTargets+=state.targets;
          requireValid(totalNodes<=limits.nodes&&totalTargets<=limits.targets);break;
        }
        case "removeGroup":requireValid(exact(change,["kind","groupId"])&&opaque(change.groupId));break;
        case "historyBoundary":requireValid(exact(change,["kind","value"])&&typeof change.value==="boolean");break;
        case "captureStatus":requireValid(exact(change,["kind","value"]));captureStatus(change.value);break;
        default:requireValid(false);
      }
    }
    serializedBound(v,limits.logicalBytes);
  });
}
