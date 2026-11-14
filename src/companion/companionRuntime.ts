import type { Disposable } from "vscode";
import { createHash, randomBytes } from "node:crypto";
import type { LaunchSpec } from "../launch/launchPlanner";
import type { ManagedPty, ManagedPtyFactory } from "../launch/managedPty";
import type { ManagedSessionSnapshot } from "../sessions/sessionTypes";
import { CompanionCapture } from "./companionCapture";
import type { CaptureHostOptions, CaptureProtocol, CaptureRetentionTicket, CaptureSourceEvent } from "./companionCapture";
import { CompanionModel } from "./companionModel";
import type { CompanionModelContext, CompanionModelBatch } from "./companionModel";
import { decodeCompanionWebviewMessage, decodeCompanionSnapshot, decodeCompanionDelta, decodeCompanionHostMessage, companionProtocolLimits as limits } from "../panel/companionProtocol";
import type { CompanionHostMessage, CompanionWebviewMessage, CompanionActionStatus, CompanionActionReason } from "../panel/companionProtocol";
import { assessCaptureCapability } from "./companionCapabilities";
import type { CaptureCapabilityMetadata, CaptureQualification } from "./companionCapabilities";
import type { CaptureBinding, ManagedCaptureIdentity, CompanionSnapshot, CompanionChange } from "./companionTypes";

/** Trusted activation seams. None of these callbacks accepts authority from a view or environment. */
export interface CompanionRuntimeOptions {
  readonly capture:Omit<CaptureHostOptions,"currentTarget"|"evictComplete">;
  readonly currentTarget:(sessionId:string)=>Readonly<ManagedCaptureIdentity>|undefined;
  readonly capability:(spec:LaunchSpec)=>CaptureCapabilityMetadata;
  readonly qualifiedBuilds?:readonly CaptureQualification[];
  readonly now?:()=>number;
  readonly schedule?:(callback:()=>void,delay:number)=>()=>void;
  readonly diagnostic?:(reason:"capture-unavailable"|"cleanup")=>void;
  readonly emit?:(message:{readonly type:"companion";readonly payload:CompanionHostMessage})=>void|PromiseLike<unknown>;
  readonly renewDocument?:()=>void;
  readonly runningTarget?:(sessionId:string)=>Readonly<ManagedCaptureIdentity>|undefined;
  readonly clipboard?:(value:string)=>PromiseLike<void>;
  readonly revealRaw?:(target:Readonly<ManagedCaptureIdentity>)=>void;
  readonly writeInput?:(sessionId:string,data:"\u001b")=>void;
}
/** The provider captures this object in one HTML-generation listener, never a later global slot. */
export interface CompanionDocument {
  readonly viewId:string;
  legacyReady(documentId:string):void;
  receive(payload:unknown):void;
  dispose():void;
}
type Envelope={v:1;viewId:string;projectionId:string;sessionId:string;generation:string};
type HostBody<T=CompanionHostMessage>=T extends CompanionHostMessage?Omit<T,keyof Envelope>:never;
interface DocumentState {
  readonly viewId:string;readonly legacy:Set<string>;documentId?:string;
  pending?:{documentId:string;cancel:()=>void};projection?:Projection;closed:boolean;retries:number;
  highWater:number;results:Map<number,ActionRecord>;review?:Review;retiredReviews:Map<string,"expired"|"sourceChanged"|"evicted"|"reset"|"closed"|"consumed">;
  projectionOrdinal:number;renewRequested:boolean;
}
type Action=Extract<CompanionWebviewMessage,{actionId:number}>;
type Result=Extract<CompanionHostMessage,{kind:"companion.actionResult"}>;
interface ActionRecord {readonly fingerprint:string;result:Result}
interface Review {id:string;targetId:string;targetRevision:number;projectionId:string;cancel:()=>void}
interface ClipboardWrite {document:DocumentState;record:ActionRecord;ticket:CaptureRetentionTicket;uncertain:boolean;cancel:()=>void}
interface Transfer {
  id:string;text:string;revision:number;mode:"snapshot"|"delta";baseRevision:number|null;
  bytes:number;hash:string;offsets:number[];index:number;received:number;ended:boolean;
  targets:Map<string,{revision:number;groupId:string;visibleSince:number}>;cancel?:()=>void;
}
interface Projection {
  readonly document:DocumentState;readonly envelope:Envelope;readonly target:Readonly<ManagedCaptureIdentity>;
  ticket?:CaptureRetentionTicket;transfer?:Transfer;committed?:number;
  intervals:readonly (readonly [number,number])[];
  targets:Map<string,{revision:number;groupId:string;visibleSince:number}>;pending:{change:CompanionChange;text:string}[];pendingBytes:number;pendingRevision:number;
  cancelHydration?:()=>void;unavailable:boolean;
  postBytes:number;disposed:boolean;
}
const documentUuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
// Fixed allowance for 128 result fingerprints/envelopes, 128 UUIDs, tombstones and lease bookkeeping.
const projectionMetadataBytes=192*1024;
interface LaunchLease {
  readonly binding:CaptureBinding;
  readonly target:Readonly<ManagedCaptureIdentity>;
  protocol?:CaptureProtocol;
  context?:CompanionModelContext;
  entered:boolean;
  retired:boolean;
  sealed:boolean;
  exitSeen:boolean;
  subscription?:Disposable;
  cancelDeadline?:()=>void;
}
const sameTarget=(a:Readonly<ManagedCaptureIdentity>|undefined,b:Readonly<ManagedCaptureIdentity>)=>
  a?.sessionId===b.sessionId&&a.claudeSessionId===b.claudeSessionId&&a.generation===b.generation;

/** Record reservation origin at allocation, not by probing held-ticket membership or byte totals. */
class RuntimeResources extends CompanionCapture {
  private readonly origins=new WeakMap<CaptureRetentionTicket,CaptureBinding>();
  override reserveRetention(binding:CaptureBinding,bytes:number):CaptureRetentionTicket|undefined {
    const ticket=super.reserveRetention(binding,bytes);if(ticket)this.origins.set(ticket,binding);return ticket;
  }
  owns(binding:CaptureBinding,ticket:CaptureRetentionTicket):boolean {return this.origins.get(ticket)===binding;}
}

/** Activation-local host owner; SessionManager remains the sole process and input owner. */
export class CompanionRuntime {
  readonly resources:CompanionCapture;
  readonly model:CompanionModel;
  private readonly ledger:RuntimeResources;
  private readonly delivered=new WeakSet<CaptureRetentionTicket>();
  private readonly specs=new WeakMap<LaunchSpec,LaunchLease>();
  private readonly leases=new Set<LaunchLease>();
  private readonly current=new Map<string,LaunchLease>();
  private readonly preparing=new Map<string,object>();
  private shuttingDown=false;
  private closed=false;
  private closePromise:Promise<void>|undefined;
  private finishClose:(()=>void)|undefined;
  private document:DocumentState|undefined;
  private selected:string|undefined;
  private clipboardWrite:ClipboardWrite|undefined;
  constructor(private readonly options:CompanionRuntimeOptions) {
    this.ledger=new RuntimeResources({...options.capture,currentTarget:id=>this.target(id),evictComplete:request=>this.model.evictComplete(request)});
    this.resources=this.ledger;
    this.model=new CompanionModel({resources:this.ledger,currentContext:id=>this.context(id)});
    this.model.subscribe(batch=>this.changed(batch));
  }
  private nonce():string {return randomBytes(16).toString("hex");}
  private emit(projection:Projection,body:HostBody):void {
    if(this.document!==projection.document||projection.document.closed)return;
    const payload={...projection.envelope,...body} as CompanionHostMessage;
    if(!decodeCompanionHostMessage(payload).ok){this.diagnostic("capture-unavailable");return;}
    const sourceBearing=payload.kind==="companion.transferChunk"||payload.kind==="companion.reviewOpened";
    const charge=sourceBearing?Buffer.byteLength(JSON.stringify({type:"companion",payload}))*2:0;
    projection.postBytes+=charge;
    if(charge&&!this.funded(projection)){projection.postBytes-=charge;this.failTransfer(projection,"capacity");return;}
    const release=()=>{projection.postBytes-=charge;if(projection.disposed&&projection.postBytes===0){if(projection.ticket)this.resources.releaseRetention(projection.ticket);projection.ticket=undefined;}else if(charge)this.funded(projection);};
    try{
      const sent=this.options.emit?.({type:"companion",payload});
      if(sent)void Promise.resolve(sent).then(release,()=>{release();this.diagnostic("capture-unavailable");});else release();
    }catch{release();this.diagnostic("capture-unavailable");}
  }
  /** Install a fresh host-issued HTML lease; replacement revokes every old closure. */
  openDocument():CompanionDocument {
    if(this.document)this.disposeDocument(this.document);
    const document:DocumentState={viewId:this.nonce(),legacy:new Set(),closed:this.shuttingDown,retries:0,highWater:0,results:new Map(),retiredReviews:new Map(),projectionOrdinal:0,renewRequested:false};this.document=document;
    return Object.freeze({viewId:document.viewId,legacyReady:(id:string)=>this.legacyReady(document,id),
      receive:(payload:unknown)=>this.receive(document,payload),dispose:()=>this.disposeDocument(document)});
  }
  private legacyReady(document:DocumentState,id:string):void {
    if(document!==this.document||document.closed||!documentUuid.test(id))return;
    if(!document.legacy.has(id)&&document.legacy.size>=128)return;document.legacy.add(id);
    if(document.pending?.documentId===id){document.pending.cancel();document.pending=undefined;this.ready(document,id);}
  }
  private ready(document:DocumentState,id:string):void {
    if(!document.legacy.has(id)){
      if(!document.pending)document.pending={documentId:id,cancel:this.schedule(()=>{document.pending=undefined;},2000)};return;
    }
    if(document.documentId&&document.documentId!==id){this.disposeDocument(document);try{this.options.renewDocument?.();}catch{this.diagnostic("capture-unavailable");}return;}
    if(document.documentId===id&&document.projection){this.bindMessage(document.projection);return;}
    document.documentId=id;document.retries=0;this.bind(document);
  }
  /** The session ID comes from the trusted manager selection, never from a wire destination. */
  selectSession(sessionId:string|undefined):void {
    this.selected=sessionId;const document=this.document;if(!document||document.closed)return;
    const target=sessionId?this.target(sessionId):undefined;
    if(document.projection&&target&&sameTarget(target,document.projection.target)&&!document.projection.unavailable)return;
    document.retries=0;this.bind(document);
  }
  private bindMessage(p:Projection):void {
    this.emit(p,{kind:"companion.bind",documentId:p.document.documentId!,claudeSessionId:p.target.claudeSessionId,modelRevision:this.model.revision});
  }
  private bind(document:DocumentState,cut?:{snapshot:CompanionSnapshot;revision:number}):void {
    const target=this.selected?this.target(this.selected):undefined;
    if(!document.closed&&document.documentId&&target&&!this.shuttingDown&&document.projectionOrdinal>=Number.MAX_SAFE_INTEGER){
      const p=document.projection;
      if(p){
        const transferId=p.transfer?.id;
        p.unavailable=true;this.disposeProjection(p);p.committed=undefined;
        // Native-only fallback may retain an existing selected tuple, never manufacture a new one.
        if(!sameTarget(target,p.target))document.projection=undefined;
        if(transferId)this.emit(p,{kind:"companion.transferAbort",transferId,reason:"capacity"});
      }
      if(!document.renewRequested){document.renewRequested=true;try{this.options.renewDocument?.();}catch{this.diagnostic("capture-unavailable");}}return;
    }
    if(document.projection)this.disposeProjection(document.projection);
    document.projection=undefined;
    if(document.closed||!document.documentId||!target||this.shuttingDown)return;
    // Nonsecret host correlation ID: a strictly increasing ordinal within this HTML lease.
    // Consume before admission so quota failure can never reuse an emitted/retired identity.
    const projectionId=(++document.projectionOrdinal).toString(16).padStart(32,"0");
    const p:Projection={document,target:Object.freeze({...target}),envelope:{v:1,viewId:document.viewId,projectionId,sessionId:target.sessionId,generation:target.generation},
      targets:new Map(),intervals:[],pending:[],pendingBytes:0,pendingRevision:0,unavailable:false,postBytes:0,disposed:false};document.projection=p;
    const binding=this.current.get(target.sessionId)?.binding;
    if(binding)p.ticket=this.resources.reserveRetention(binding,projectionMetadataBytes);
    this.bindMessage(p);
    if(this.modelCapacity(this.model.refresh(target.sessionId),target.sessionId))return;
    if(!p.ticket){p.unavailable=true;return;}
    // Borrow and freeze the cut in this synchronous stack, including retiring notifications.
    const snapshot=cut?.snapshot??this.model.snapshot(target.sessionId),revision=cut?.revision??this.model.revision;
    if(this.modelCapacity()||p.disposed||document.projection!==p)return;
    p.cancelHydration=this.schedule(()=>this.failTransfer(p,"timeout"),5000);
    this.transfer(p,{groups:snapshot.groups,historyBoundary:snapshot.historyBoundary,captureStatus:snapshot.captureStatus},revision,"snapshot");
  }
  private disposeDocument(document:DocumentState):void {
    if(document.closed)return;document.pending?.cancel();document.pending=undefined;
    if(document.projection)this.invalidateReview(document.projection,"closed");
    if(document.projection)this.disposeProjection(document.projection);document.projection=undefined;document.closed=true;document.legacy.clear();
    document.results.clear();document.retiredReviews.clear();
  }
  private disposeProjection(p:Projection):void {
    if(p.disposed)return;p.disposed=true;
    this.invalidateReview(p,"reset");
    p.transfer?.cancel?.();p.cancelHydration?.();p.transfer=undefined;p.pending=[];p.targets.clear();p.intervals=[];
    if(p.postBytes)this.funded(p);else {if(p.ticket)this.resources.releaseRetention(p.ticket);p.ticket=undefined;}
  }
  /** Capacity is session-local; exhaustion also makes the selected session's actual refresh fail. */
  private modelCapacity(result?:"ready"|"handled"|"capacity",sessionId?:string):boolean {
    if(result!=="capacity"&&this.model.revision<Number.MAX_SAFE_INTEGER)return false;
    let p=this.document?.projection;
    if(result==="capacity"&&this.model.revision<Number.MAX_SAFE_INTEGER&&p&&p.target.sessionId!==sessionId){
      const selectedId=p.target.sessionId,selectedResult=this.model.refresh(selectedId);
      // A background quota failure cannot revoke a healthy projection. No global failure latch or retry loop.
      if(this.model.revision<Number.MAX_SAFE_INTEGER&&(selectedResult!=="capacity"||this.document?.projection?.target.sessionId!==selectedId))return true;
      p=this.document?.projection;
    }
    if(p&&!p.unavailable){
      p.unavailable=true;
      if(p.transfer)this.emit(p,{kind:"companion.transferAbort",transferId:p.transfer.id,reason:"capacity"});
      this.disposeProjection(p);p.committed=undefined;p.pendingBytes=0;p.pendingRevision=0;
    }
    return true;
  }
  private funded(p:Projection):boolean {
    // JSON and in-flight post serialization both count. No old source group is pinned after this stack.
    // Each disjoint numeric interval costs 64 bytes; coalesce only actually consecutive commits.
    const bytes=p.disposed?p.postBytes:projectionMetadataBytes+p.intervals.length*64+p.targets.size*320+(p.transfer?(p.transfer.bytes*2+limits.messageBytes+p.transfer.targets.size*320):0)+p.pendingBytes*2+p.postBytes;
    return !!p.ticket&&this.resources.resizeRetention(p.ticket,bytes);
  }
  private transfer(p:Projection,value:CompanionSnapshot|{changes:readonly CompanionChange[]},revision:number,mode:"snapshot"|"delta"):void {
    if(this.modelCapacity(this.model.refresh(p.target.sessionId),p.target.sessionId)||p.unavailable||p.disposed||p.document.projection!==p)return;
    const decoded=mode==="snapshot"?decodeCompanionSnapshot(value):decodeCompanionDelta(value);if(!decoded.ok){this.failTransfer(p,"decode");return;}
    const text=JSON.stringify(value),bytes=Buffer.byteLength(text);
    const targets=new Map(p.targets);
    if("groups" in value){targets.clear();for(const group of value.groups)for(const target of group.targets)targets.set(target.targetId,{revision:target.targetRevision,groupId:group.groupId,visibleSince:revision});}
    else for(const change of value.changes){
      const groupId=change.kind==="upsertGroup"?change.group.groupId:change.kind==="removeGroup"?change.groupId:undefined;
      if(groupId)for(const [id,held] of targets)if(held.groupId===groupId)targets.delete(id);
      if(change.kind==="upsertGroup")for(const target of change.group.targets){const prior=p.targets.get(target.targetId);targets.set(target.targetId,{revision:target.targetRevision,groupId:change.group.groupId,visibleSince:prior?.revision===target.targetRevision?prior.visibleSince:revision});}
    }
    // Source eligibility is checked again in the model, including removed targets.
    const offsets=[0];let chunkBytes=0,escapedBytes=0;
    for(let i=0;i<text.length;){const scalar=String.fromCodePoint(text.codePointAt(i)!);const size=Buffer.byteLength(scalar),escaped=Buffer.byteLength(JSON.stringify(scalar))-2;
      if(chunkBytes+size>limits.chunkBytes||escapedBytes+escaped>limits.messageBytes-2048){offsets.push(i);chunkBytes=0;escapedBytes=0;}
      chunkBytes+=size;escapedBytes+=escaped;i+=scalar.length;
    }offsets.push(text.length);
    p.transfer={id:this.nonce(),text,revision,mode,baseRevision:mode==="snapshot"?null:p.committed!,bytes,hash:createHash("sha256").update(text).digest("hex"),offsets,index:0,received:0,ended:false,targets};
    if(offsets.length-1>limits.chunkCount||!this.funded(p)){this.failTransfer(p,"capacity");return;}
    const t=p.transfer;
    this.emit(p,{kind:"companion.transferBegin",transferId:t.id,revision,byteLength:bytes,sha256:t.hash,chunkCount:offsets.length-1,
      ...(mode==="snapshot"?{mode,baseRevision:null}:{mode,baseRevision:p.committed!})});this.sendChunk(p);
  }
  private sendChunk(p:Projection):void {
    if(this.modelCapacity(this.model.refresh(p.target.sessionId),p.target.sessionId)||p.disposed||p.document.projection!==p)return;
    const t=p.transfer;if(!t)return;t.cancel?.();t.cancel=this.schedule(()=>this.failTransfer(p,"timeout"),2000);
    if(t.index===t.offsets.length-1){t.ended=true;this.emit(p,{kind:"companion.transferEnd",transferId:t.id,revision:t.revision,byteLength:t.bytes,sha256:t.hash});return;}
    const data=t.text.slice(t.offsets[t.index],t.offsets[t.index+1]);
    this.emit(p,{kind:"companion.transferChunk",transferId:t.id,chunkIndex:t.index,data,byteLength:Buffer.byteLength(data)});
  }
  private failTransfer(p:Projection,reason:"decode"|"order"|"timeout"|"capacity"):void {
    if(p.document.projection!==p||p.unavailable)return;
    if(p.transfer)this.emit(p,{kind:"companion.transferAbort",transferId:p.transfer.id,reason});
    const document=p.document;
    if(document.retries++<1){this.bind(document);return;}
    this.disposeProjection(p);p.unavailable=true;
  }
  private changed(batch:CompanionModelBatch):void {
    if(this.modelCapacity())return;
    const p=this.document?.projection;if(!p||p.unavailable||p.target.sessionId!==batch.sessionId)return;
    // Initial reserve can synchronously evict. Its snapshot is taken after admission, so no cut is pending yet.
    if(!p.ticket)return;
    // Capture the immutable borrowed cut before any scheduling, reservation, or subscriber can advance it.
    const snapshot=this.model.snapshot(batch.sessionId),revision=this.model.revision;
    if(this.modelCapacity()||p.disposed||p.document.projection!==p)return;
    const review=p.document.review;
    if(review&&!this.model.resolveLiteral(p.target.sessionId,review.targetId,review.targetRevision))this.invalidateReview(p,"sourceChanged");
    if(this.modelCapacity()||p.disposed||p.document.projection!==p)return;
    if(batch.resyncRequired){if(p.document.retries++<1)this.bind(p.document,{snapshot,revision});else this.failTransfer(p,"capacity");return;}
    const changes=[...p.pending];
    for(const change of batch.changes){
      if(change.kind==="upsertGroup"){const i=changes.findIndex(c=>c.change.kind==="upsertGroup"&&c.change.group.groupId===change.group.groupId);if(i>=0)changes.splice(i,1);}
      changes.push({change,text:JSON.stringify(change)});
    }
    const bytes=changes.reduce((n,c)=>n+Buffer.byteLength(c.text),0);
    if(changes.length>64||bytes>1048576){this.failTransfer(p,"capacity");return;}
    p.pending=changes;p.pendingBytes=bytes;p.pendingRevision=revision;
    if(!this.funded(p)){this.failTransfer(p,"capacity");return;}
    if(!p.transfer&&p.committed!==undefined)this.catchUp(p);
  }
  private catchUp(p:Projection):void {
    if(!p.pending.length)return;const changes=p.pending.map(c=>c.change),revision=p.pendingRevision;
    p.pending=[];p.pendingBytes=0;this.transfer(p,{changes},revision,"delta");
  }
  private receive(document:DocumentState,payload:unknown):void {
    if(document!==this.document||document.closed)return;
    const decoded=decodeCompanionWebviewMessage(payload);
    if(!decoded.ok){
      // Correlate only a safe current host envelope, never a guessed destination or arbitrary action ID.
      const p=document.projection;
      if(p&&payload&&typeof payload==="object"){
        const raw=payload as Record<string,unknown>;
        if(Object.entries(p.envelope).every(([key,value])=>raw[key]===value)&&typeof raw.actionId==="number"&&Number.isSafeInteger(raw.actionId)&&raw.actionId>0){
          document.highWater=Math.max(document.highWater,raw.actionId);
          this.emit(p,{kind:"companion.actionResult",actionId:raw.actionId,status:"invalid",reason:"INVALID_MESSAGE"});
        }
      }return;
    }const message=decoded.value;
    if(message.viewId!==document.viewId)return;
    if(message.kind==="companion.ready"){this.ready(document,message.documentId);return;}
    const p=document.projection;if(!p)return;
    if("actionId" in message){this.action(p,message);return;}
    if(message.projectionId!==p.envelope.projectionId||message.sessionId!==p.target.sessionId||message.generation!==p.target.generation||!sameTarget(this.target(p.target.sessionId),p.target))return;
    if(message.kind==="companion.resync"){if(document.retries++<1)this.bind(document);else this.failTransfer(p,"capacity");return;}
    if(message.kind!=="companion.transferAck"&&message.kind!=="companion.transferReady")return;
    if(this.modelCapacity(this.model.refresh(p.target.sessionId),p.target.sessionId)||p.disposed||document.projection!==p)return;
    const t=p.transfer;if(!t||message.transferId!==t.id)return;
    if(message.kind==="companion.transferAck"){
      if(message.nextChunkIndex===t.index&&message.byteLength===t.received)return;
      const next=t.received+Buffer.byteLength(t.text.slice(t.offsets[t.index],t.offsets[t.index+1]));
      if(t.ended||message.nextChunkIndex!==t.index+1||message.byteLength!==next){this.failTransfer(p,"order");return;}
      t.index++;t.received=next;this.sendChunk(p);return;
    }
    if(!t.ended||message.revision!==t.revision||message.byteLength!==t.bytes||message.sha256!==t.hash){this.failTransfer(p,"decode");return;}
    const prior=p.intervals,tail=prior.at(-1);
    p.intervals=tail&&tail[1]+1===t.revision?[...prior.slice(0,-1),[tail[0],t.revision]]:[...prior,[t.revision,t.revision]];
    // Fund exact membership before Commit becomes visible; keep the transfer pinned during admission.
    if(!this.funded(p)){p.intervals=prior;this.failTransfer(p,"capacity");return;}
    if(this.modelCapacity()||p.disposed||document.projection!==p||p.transfer!==t)return;
    t.cancel?.();p.cancelHydration?.();p.cancelHydration=undefined;p.committed=t.revision;p.targets=t.targets;p.transfer=undefined;
    this.emit(p,{kind:"companion.transferCommit",transferId:t.id,revision:t.revision});this.funded(p);this.catchUp(p);
  }
  private result(p:Projection,record:ActionRecord,status:CompanionActionStatus,reason:CompanionActionReason|null=null):void {
    record.result={...record.result,status,reason};this.postResult(p.document,record.result);
  }
  private postResult(document:DocumentState,result:Result):void {
    if(this.document!==document||document.closed||document.projection?.envelope.projectionId!==result.projectionId)return;
    try{void Promise.resolve(this.options.emit?.({type:"companion",payload:result})).catch(()=>this.diagnostic("capture-unavailable"));}catch{this.diagnostic("capture-unavailable");}
  }
  /** Recheck every mutable authority after model/resource calls that can synchronously notify the host. */
  private actionAuthority(p:Projection,message:Extract<Action,{targetId:string}>,review:Review|undefined):boolean {
    if(this.modelCapacity(this.model.refresh(p.target.sessionId),p.target.sessionId))return false;
    const visible=p.targets.get(message.targetId);
    return this.document===p.document&&!p.document.closed&&p.document.projection===p&&!p.disposed&&!p.unavailable&&!!p.ticket&&
      sameTarget(this.target(p.target.sessionId),p.target)&&p.committed!==undefined&&message.appliedRevision<=this.model.revision&&
      p.intervals.some(([start,end])=>message.appliedRevision>=start&&message.appliedRevision<=end)&&
      visible?.revision===message.targetRevision&&message.appliedRevision>=visible.visibleSince&&
      (message.kind!=="companion.reviewCopy"||!!review&&p.document.review===review&&review.projectionId===p.envelope.projectionId&&
        review.id===message.reviewId&&review.targetId===message.targetId&&review.targetRevision===message.targetRevision);
  }
  private action(p:Projection,message:Action):void {
    const document=p.document;
    // Sorted closed fields make object-key order irrelevant, without retaining any submitted literal.
    const fingerprint=createHash("sha256").update(JSON.stringify(Object.keys(message).sort().map(key=>[key,message[key as keyof Action]]))).digest("hex");
    const prior=document.results.get(message.actionId);
    if(prior){if(prior.fingerprint===fingerprint)this.postResult(document,prior.result);else this.emit(p,{kind:"companion.actionResult",actionId:message.actionId,status:"invalid",reason:"INVALID_MESSAGE"});return;}
    if(message.actionId<=document.highWater){this.emit(p,{kind:"companion.actionResult",actionId:message.actionId,status:"duplicateExpired",reason:"EXPIRED_ACTION"});return;}
    document.highWater=message.actionId;
    const record:ActionRecord={fingerprint,result:{...p.envelope,kind:"companion.actionResult",actionId:message.actionId,status:"busy",reason:"COPY_PENDING",
      ...("targetId" in message?{targetId:message.targetId}:{}),...("reviewId" in message?{reviewId:message.reviewId}:{})}};
    document.results.set(message.actionId,record);if(document.results.size>128)document.results.delete(document.results.keys().next().value!);
    if(message.projectionId!==p.envelope.projectionId||message.sessionId!==p.target.sessionId||message.generation!==p.target.generation||!sameTarget(this.target(p.target.sessionId),p.target)){
      this.result(p,record,"stale","WRONG_BINDING");return;
    }
    if(message.kind==="companion.escape"||message.kind==="companion.toggleRaw"){
      try{
        if(!sameTarget(this.options.runningTarget?.(p.target.sessionId),p.target)){this.result(p,record,"stale","WRONG_BINDING");return;}
        if(message.kind==="companion.escape"){
          if(!this.options.writeInput){this.result(p,record,"unavailable","NOT_READY");return;}
          this.options.writeInput(p.target.sessionId,"\u001b");this.result(p,record,"inputSent");
        }else{
          if(!this.options.revealRaw){this.result(p,record,"unavailable","NOT_READY");return;}
          this.options.revealRaw(p.target);this.result(p,record,"ok");
        }
      }catch{this.result(p,record,"unavailable","PLATFORM_ERROR");}return;
    }
    if(this.modelCapacity(this.model.refresh(p.target.sessionId),p.target.sessionId)){this.result(p,record,"unavailable","NOT_READY");return;}
    if(message.kind==="companion.reviewCancel"){
      if(document.review?.id!==message.reviewId){this.reviewFailure(p,record,message.reviewId);return;}
      this.consumeReview(document);this.result(p,record,"cancelled");return;
    }
    if(message.kind==="companion.reviewCopy"&&(document.review?.id!==message.reviewId||document.review.targetId!==message.targetId||document.review.targetRevision!==message.targetRevision)){
      this.reviewFailure(p,record,message.reviewId);return;
    }
    if(!("targetId" in message))return;
    if(p.committed===undefined||p.unavailable||!p.intervals.some(([start,end])=>message.appliedRevision>=start&&message.appliedRevision<=end)||message.appliedRevision>this.model.revision){this.result(p,record,"unavailable","NOT_READY");return;}
    const visible=p.targets.get(message.targetId);
    if(visible?.revision!==message.targetRevision||message.appliedRevision<visible.visibleSince){this.result(p,record,"stale","SOURCE_CHANGED");return;}
    const review=message.kind==="companion.reviewCopy"?document.review:undefined;
    const source=this.model.resolveLiteral(p.target.sessionId,message.targetId,message.targetRevision);
    if(!this.actionAuthority(p,message,review)){this.result(p,record,"stale","RESET");return;}
    if(!source){this.result(p,record,"stale","SOURCE_CHANGED");return;}
    if(message.kind==="companion.reviewOpen"){
      if(source.action!=="review"){this.result(p,record,"invalid","INVALID_MESSAGE");return;}
      this.invalidateReview(p,"reset");const id=this.nonce();
      document.review={id,targetId:message.targetId,targetRevision:message.targetRevision,projectionId:p.envelope.projectionId,cancel:this.schedule(()=>this.invalidateReview(p,"expired"),300000)};
      this.emit(p,{kind:"companion.reviewOpened",actionId:message.actionId,reviewId:id,targetId:message.targetId,targetRevision:message.targetRevision,value:source.literal,byteLength:Buffer.byteLength(source.literal)});
      this.result(p,record,"ok");return;
    }
    if(message.kind==="companion.copy"&&source.action!=="copy"||message.kind==="companion.reviewCopy"&&source.action!=="review"){
      this.result(p,record,"invalid","INVALID_MESSAGE");return;
    }
    if(this.clipboardWrite){this.result(p,record,"busy","COPY_PENDING");return;}
    if(!this.options.clipboard){this.result(p,record,"unavailable","NOT_READY");return;}
    const value=message.kind==="companion.reviewCopy"?message.value:source.literal;
    if(value.includes("\0")||/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)){this.result(p,record,"invalid","INVALID_MESSAGE");return;}
    const binding=this.current.get(p.target.sessionId)?.binding,ticket=binding&&this.resources.reserveRetention(binding,Math.max(1,Buffer.byteLength(value)));
    if(!ticket){this.result(p,record,"unavailable","NOT_READY");return;}
    // Reservation and resolution may each reenter: a surviving literal cannot revive a retired projection/Review.
    if(!this.actionAuthority(p,message,review)){
      this.resources.releaseRetention(ticket);this.result(p,record,"stale","RESET");return;
    }
    const currentSource=this.model.resolveLiteral(p.target.sessionId,message.targetId,message.targetRevision);
    if(!this.actionAuthority(p,message,review)||currentSource?.literal!==source.literal||currentSource.action!==source.action){
      this.resources.releaseRetention(ticket);this.result(p,record,"stale","SOURCE_CHANGED");return;
    }
    if(this.clipboardWrite){this.resources.releaseRetention(ticket);this.result(p,record,"busy","COPY_PENDING");return;}
    if(message.kind==="companion.reviewCopy")this.consumeReview(document);
    const pending:ClipboardWrite={document,record,ticket,uncertain:false,cancel:()=>{}};this.clipboardWrite=pending;
    pending.cancel=this.schedule(()=>{if(this.clipboardWrite!==pending)return;pending.uncertain=true;record.result={...record.result,status:"uncertain",reason:null};this.postResult(document,record.result);},2000);
    try {void Promise.resolve(this.options.clipboard(value)).then(()=>this.settleClipboard(pending,true),()=>this.settleClipboard(pending,false));}
    catch{this.settleClipboard(pending,false);}
  }
  private settleClipboard(pending:ClipboardWrite,success:boolean):void {
    if(this.clipboardWrite!==pending)return;this.clipboardWrite=undefined;pending.cancel();this.resources.releaseRetention(pending.ticket);
    pending.record.result={...pending.record.result,status:success?(pending.uncertain?"settledAfterUncertain":"ok"):"unavailable",reason:success?null:"PLATFORM_ERROR"};
    this.postResult(pending.document,pending.record.result);
  }
  private rememberReview(document:DocumentState,id:string,reason:DocumentState["retiredReviews"] extends Map<string,infer R>?R:never):void {
    document.retiredReviews.set(id,reason);if(document.retiredReviews.size>128)document.retiredReviews.delete(document.retiredReviews.keys().next().value!);
  }
  private consumeReview(document:DocumentState):void {
    const review=document.review;if(!review)return;review.cancel();document.review=undefined;this.rememberReview(document,review.id,"consumed");
  }
  private invalidateReview(p:Projection,reason:"sourceChanged"|"evicted"|"reset"|"closed"|"expired"):void {
    const review=p.document.review;if(!review||review.projectionId!==p.envelope.projectionId)return;
    review.cancel();p.document.review=undefined;this.rememberReview(p.document,review.id,reason);this.emit(p,{kind:"companion.reviewInvalidated",reviewId:review.id,reason});
  }
  private reviewFailure(p:Projection,record:ActionRecord,id:string):void {
    const reason=p.document.retiredReviews.get(id);
    this.result(p,record,reason==="expired"?"unavailable":"stale",reason==="sourceChanged"?"SOURCE_CHANGED":reason==="evicted"?"EVICTED":reason==="reset"?"RESET":"EXPIRED_REVIEW");
  }
  private context(id:string):CompanionModelContext|undefined {
    const lease=this.current.get(id),epoch=lease?.protocol?.snapshot().captureEpoch;
    if(!lease||lease.retired||!epoch||!sameTarget(this.target(id),lease.target))return undefined;
    return lease.context={binding:lease.binding,target:lease.target,captureEpoch:epoch};
  }
  private source(lease:LaunchLease,event:CaptureSourceEvent,model:CompanionModel,resources:RuntimeResources):void {
    if(event.kind==="observation"){
      if(!resources.owns(lease.binding,event.retention)||this.delivered.has(event.retention))return;
      this.delivered.add(event.retention);
    }
    if(lease.retired||this.closed||this.current.get(lease.target.sessionId)!==lease){
      if(event.kind==="observation")resources.releaseRetention(event.retention);return;
    }
    const context=this.context(lease.target.sessionId);
    try {this.modelCapacity(model.refresh(lease.target.sessionId),lease.target.sessionId);this.modelCapacity(model.accept(lease.binding,event),lease.target.sessionId);}
    catch {
      // Roll back the exact consumer owner before releasing the delivery. A later context is never removed.
      if(context)model.releaseSession(context);
      if(event.kind==="observation")resources.releaseRetention(event.retention);
      this.diagnostic("capture-unavailable");
    }
  }
  private target(id:string):Readonly<ManagedCaptureIdentity>|undefined {
    try{const target=this.options.currentTarget(id);return target?.sessionId===id?target:undefined;}catch{return undefined;}
  }
  private diagnostic(reason:"capture-unavailable"|"cleanup"):void {try{this.options.diagnostic?.(reason);}catch{/* Diagnostics never own native continuation. */}}
  private schedule(callback:()=>void,delay:number):()=>void {
    if(this.options.schedule)return this.options.schedule(callback,delay);
    const timer=setTimeout(callback,delay);timer.unref();return ()=>clearTimeout(timer);
  }
  private inactive(spec:LaunchSpec):LaunchSpec {return Object.freeze({...spec,env:Object.freeze(this.resources.environment(spec.env))});}
  /** Freeze the managed tuple before I/O and associate only the exact final returned spec object. */
  async prepareLaunch(spec:LaunchSpec,session:ManagedSessionSnapshot):Promise<LaunchSpec> {
    const current=this.target(session.id);
    if(this.shuttingDown||!current||current.claudeSessionId!==session.claudeSessionId)return this.inactive(spec);
    const target=Object.freeze({...current});
    try {if(!assessCaptureCapability(this.options.capability(spec),this.options.qualifiedBuilds).available)return this.inactive(spec);}
    catch {this.diagnostic("capture-unavailable");return this.inactive(spec);}
    const intent={};this.preparing.set(target.sessionId,intent);
    try {
    const prior=this.current.get(target.sessionId);if(prior)this.retire(prior);
    const prepared=await this.resources.prepare(target.sessionId);
    if(!prepared.ok)return this.inactive(spec);
    const lease:LaunchLease={binding:prepared.value,target,entered:false,retired:false,sealed:false,exitSeen:false};
    this.leases.add(lease);
    if(this.shuttingDown||this.preparing.get(target.sessionId)!==intent||!sameTarget(this.target(target.sessionId),target)){this.retire(lease);return this.inactive(spec);}
    this.current.set(target.sessionId,lease);
    const model=this.model,resources=this.ledger;
    const started=await this.resources.startProtocol(lease.binding,{now:this.options.now,schedule:this.options.schedule,onEvent:event=>this.source(lease,event,model,resources)});
    if(!started.ok||this.shuttingDown||lease.retired||this.preparing.get(target.sessionId)!==intent||!sameTarget(this.target(target.sessionId),target)){this.retire(lease);return this.inactive(spec);}
    lease.protocol=started.value;
    const result=Object.freeze({...spec,env:Object.freeze(this.resources.environment(spec.env,lease.binding))});
    this.specs.set(result,lease);return result;
    }finally{if(this.preparing.get(target.sessionId)===intent)this.preparing.delete(target.sessionId);}
  }
  /** One-use factory facade; returned PTY and rejection identities remain exactly native. */
  async observeSpawn(base:ManagedPtyFactory,spec:LaunchSpec):Promise<ManagedPty> {
    const lease=this.specs.get(spec);
    if(!lease||lease.entered||lease.retired||this.shuttingDown||!sameTarget(this.target(lease.target.sessionId),lease.target)){
      if(lease)this.retire(lease);return base.spawn(this.inactive(spec));
    }
    lease.entered=true;
    if(!this.resources.markProducerExposed(lease.binding)){this.retire(lease);return base.spawn(this.inactive(spec));}
    let pty:ManagedPty;
    try {pty=await base.spawn(spec);}catch(error){this.retire(lease);throw error;}
    if(this.closed||lease.sealed)return pty;
    try {
      const subscription=pty.onExit(()=>{
        if(lease.sealed||lease.exitSeen)return;lease.exitSeen=true;
        try{
          try{this.resources.confirmManagedPtyExit(lease.binding);}catch{this.diagnostic("cleanup");}
          this.retire(lease);
        }catch{this.diagnostic("cleanup");}finally{this.seal(lease);}
      });
      // Buffered replay may have sealed this lease synchronously during registration.
      if(lease.exitSeen||lease.sealed){try{subscription.dispose();}catch{this.diagnostic("cleanup");}}
      else lease.subscription=subscription;
    }catch{this.diagnostic("capture-unavailable");this.retire(lease);}
    return pty;
  }
  private retire(lease:LaunchLease):void {
    if(lease.retired)return;lease.retired=true;
    if(lease.context)this.model.releaseSession(lease.context);
    if(this.current.get(lease.target.sessionId)===lease)this.current.delete(lease.target.sessionId);
    void this.resources.revoke(lease.binding).catch(()=>this.diagnostic("cleanup"));
    if(!lease.entered||lease.exitSeen)this.seal(lease);
    else lease.cancelDeadline=this.schedule(()=>this.seal(lease),2000);
  }
  private seal(lease:LaunchLease):void {
    if(lease.sealed)return;lease.sealed=true;lease.cancelDeadline?.();lease.cancelDeadline=undefined;
    try{lease.subscription?.dispose();}catch{this.diagnostic("cleanup");}lease.subscription=undefined;
    this.leases.delete(lease);if(this.shuttingDown&&!this.leases.size)this.finishClose?.();
  }
  /** Call synchronously on trusted managed-session changes; removal is never exit proof. */
  refresh():void {
    for(const lease of this.leases){if(!sameTarget(this.target(lease.target.sessionId),lease.target))this.retire(lease);else this.modelCapacity(this.model.refresh(lease.target.sessionId),lease.target.sessionId);}
    const document=this.document,target=this.selected?this.target(this.selected):undefined;
    if(document&&(!document.projection||!target||!sameTarget(target,document.projection.target)))this.selectSession(this.selected);
  }
  /** Revoke content before manager termination, retaining bounded exit observations. */
  beginShutdown():void {if(this.shuttingDown)return;this.shuttingDown=true;if(this.document)this.disposeDocument(this.document);for(const lease of this.leases)this.retire(lease);this.model.dispose();}
  /** One overall deadline, independent of terminate settlement or cleanup I/O completion. */
  close():Promise<void> {
    if(this.closePromise)return this.closePromise;this.beginShutdown();
    this.closePromise=new Promise(resolveClose=>{
      let cancel:(()=>void)|undefined;
      this.finishClose=()=>{if(this.closed)return;this.closed=true;cancel?.();for(const lease of this.leases)this.seal(lease);resolveClose();};
      if(!this.leases.size)this.finishClose();else cancel=this.schedule(()=>this.finishClose?.(),2000);
    });return this.closePromise;
  }
}
