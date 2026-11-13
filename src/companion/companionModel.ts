import { createHash } from "node:crypto";
import { extractCompanionContent } from "./companionContent";
import { captureLimits } from "./companionTypes";
import type { CaptureBinding, ManagedCaptureIdentity, NormalizedObservation, CompanionGroup, CompanionNode, CompanionContentNode, CompanionTarget, CompanionSnapshot, CompanionChange, CompanionCaptureStatus, CompanionProvenance, BashFlags } from "./companionTypes";
import type { CompanionCapture, CaptureSourceEvent, CaptureRetentionTicket } from "./companionCapture";

/** Supplied by the owning host, never reconstructed from native observation fields. */
export interface CompanionModelContext {readonly binding:CaptureBinding;readonly target:ManagedCaptureIdentity;readonly captureEpoch:string}
export interface CompanionModelOptions {
  readonly resources:Pick<CompanionCapture,"reserveRetention"|"resizeRetention"|"releaseRetention"|"retentionUsage">;
  readonly currentContext:(sessionId:string)=>CompanionModelContext|undefined;
}
export interface CompanionModelBatch {readonly sessionId:string;readonly revision:number;readonly changes:readonly CompanionChange[];readonly resyncRequired:boolean}
type PendingChange = Exclude<CompanionChange,{kind:"upsertGroup"}>|{kind:"upsertGroup";groupId:string};
interface Mutation {before:Map<string,string[]>;changes:Map<string,PendingChange[]>;resync:Set<string>}
class MetadataCapacity extends Error {}
interface Session {ticket:CaptureRetentionTicket;context:CompanionModelContext;boundary:number;lastObservation:number;lastAck:number;lastGapAck:number;lastFingerprint:string;historyBoundary:boolean;status:CompanionCaptureStatus}
interface Retained {
  key:string;sessionId:string;epoch:string;boundary:number;ticket:CaptureRetentionTicket;
  observation:NormalizedObservation;groups:readonly CompanionGroup[];current:boolean;
  order:number;blockIndex:number;groupIndices?:number[];facts?:Map<string,NormalizedObservation>;conflict?:boolean;request?:{rowKey:string;index:number;command:string};
}
/** Freeze snapshots at admission; callers never hold mutable host authority. */
function freeze<T>(value:T):T {
  if(value!==null&&typeof value==="object"){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
}
function sameTarget(a:ManagedCaptureIdentity,b:ManagedCaptureIdentity):boolean {
  return a.sessionId===b.sessionId&&a.claudeSessionId===b.claudeSessionId&&a.generation===b.generation;
}
function nodeCount(nodes:readonly CompanionNode[]):number {return nodes.reduce((n,node)=>n+1+("children" in node?nodeCount(node.children):0),0);}

/**
 * One owner coordinates all sessions; P1 remains the only byte-retention ledger.
 * Feed only completed events from the corresponding actual P1 owner. The binding
 * and currentContext provider belong to the host; decoded/native data cannot mint them.
 */
export class CompanionModel {
  private readonly sessions=new Map<string,Session>();
  private readonly retained=new Map<string,Retained>();
  private readonly adopted=new WeakSet<CaptureRetentionTicket>();
  private readonly listeners=new Set<(batch:CompanionModelBatch)=>void>();
  private modelRevision=0;
  private nextId=0;
  private order=0;
  private mutation:Mutation|undefined;
  private delivering=false;
  // At most one ID/revision per funded live or retiring session; no source payload is deferred.
  private readonly pendingNotifications=new Map<string,number>();
  private readonly retiringNotifications=new Map<string,CaptureRetentionTicket>();
  private disposed=false;
  private exhausted=false;
  private readonly protectedKeys=new Set<string>();
  constructor(private readonly options:CompanionModelOptions) {}
  get revision():number {return this.modelRevision;}
  private id(prefix:string):string {if(this.nextId===Number.MAX_SAFE_INTEGER)throw new Error("revision exhausted");return prefix+"-"+(++this.nextId);}
  private context(sessionId:string):CompanionModelContext|undefined {try{return this.options.currentContext(sessionId);}catch{return undefined;}}
  /** Context pointers remain host-owned; copied identity strings and fixed bookkeeping are funded here. */
  private metadataBytes(context:CompanionModelContext):number {return 1024+Buffer.byteLength(JSON.stringify([context.target,context.captureEpoch]));}
  private updateContext(sessionId:string,session:Session,context:CompanionModelContext):void {
    if(!this.options.resources.resizeRetention(session.ticket,this.metadataBytes(context))){this.dropSession(sessionId);throw new MetadataCapacity();}
    session.context={...context,target:{...context.target}};session.lastObservation=0;session.lastAck=0;session.lastGapAck=-1;session.lastFingerprint="";
  }
  private session(sessionId:string):Session|undefined {
    const context=this.context(sessionId);
    if(!context||context.target.sessionId!==sessionId||!sameTarget(context.binding.marker,context.target)||! /^[a-f0-9]{32}$/.test(context.captureEpoch))return undefined;
    let session=this.sessions.get(sessionId);
    if(!session){
      const ticket=this.options.resources.reserveRetention(context.binding,this.metadataBytes(context));if(!ticket)throw new MetadataCapacity();
      session={ticket,context:{...context,target:{...context.target}},boundary:0,lastObservation:0,lastAck:0,lastGapAck:-1,lastFingerprint:"",historyBoundary:false,status:{state:"active",reason:null}};this.sessions.set(sessionId,session);}
    return session;
  }
  /** Invalidate immediately when the caller's managed owner or epoch changes. */
  refresh(sessionId:string):"ready"|"capacity" {
    if(this.disposed)return "ready";if(this.exhausted)return "capacity";const owner=this.begin();try{this.refreshCurrent(sessionId);return "ready";}catch(error){if(error instanceof MetadataCapacity)return "capacity";throw error;}finally{this.finish(owner);}
  }
  private refreshCurrent(sessionId:string):void {
    const session=this.sessions.get(sessionId)??this.session(sessionId);if(!session)return;
    const now=this.context(sessionId);
    if(!now||now.binding!==session.context.binding||!sameTarget(now.target,session.context.target)||!sameTarget(now.binding.marker,now.target)) {
      if(session.status.reason!=="IDENTITY_CHANGED")this.boundary(sessionId,"IDENTITY_CHANGED");
      if(now&&sameTarget(now.binding.marker,now.target)&&now.target.sessionId===sessionId&&/^[a-f0-9]{32}$/.test(now.captureEpoch)){this.updateContext(sessionId,session,now);}
    } else if(now.captureEpoch!==session.context.captureEpoch) {
      this.boundary(sessionId,"GAP");this.updateContext(sessionId,session,now);
    }
  }
  private groups(sessionId:string):CompanionGroup[] {
    return [...this.retained.values()].filter(r=>r.sessionId===sessionId).flatMap(r=>r.groups.map((group,i)=>({group,order:r.order,index:r.groupIndices?.[i]??r.blockIndex}))).sort((a,b)=>a.order-b.order||a.index-b.index).map(item=>item.group);
  }
  /** Mutations coalesce synchronously, retaining IDs only, never an unfunded source history. */
  private begin():boolean {
    if(this.mutation)return false;
    this.mutation={before:new Map([...this.sessions.keys()].map(id=>[id,this.groups(id).map(g=>g.groupId)])),changes:new Map(),resync:new Set()};return true;
  }
  private finish(owner:boolean):void {
    if(!owner)return;const mutation=this.mutation;this.mutation=undefined;
    if(!mutation?.changes.size||this.disposed)return;
    if(this.exhausted||this.modelRevision===Number.MAX_SAFE_INTEGER){this.exhaust();return;}
    const revision=++this.modelRevision;
    if(this.delivering){for(const sessionId of mutation.changes.keys())this.deferResync(sessionId);return;}
    this.delivering=true;
    try {
      for(const [sessionId,pending] of mutation.changes) {
        if(this.disposed)break;
        if(this.modelRevision!==revision&&this.deferResync(sessionId))continue;
        const groups=this.groups(sessionId),byId=new Map(groups.map(g=>[g.groupId,g]));let resyncRequired=mutation.resync.has(sessionId);
        const order=[...(mutation.before.get(sessionId)??[])],changes:CompanionChange[]=[];
        for(const change of pending){
          if(change.kind==="upsertGroup"){const group=byId.get(change.groupId);if(!group){resyncRequired=true;continue;}if(!order.includes(group.groupId))order.push(group.groupId);changes.push({kind:"upsertGroup",group});}
          else {changes.push(change);if(change.kind==="removeGroup"){const i=order.indexOf(change.groupId);if(i>=0)order.splice(i,1);}}
        }
        if(JSON.stringify(order)!==JSON.stringify(groups.map(g=>g.groupId)))resyncRequired=true;
        this.deliver(freeze({sessionId,revision,changes:resyncRequired?[]:changes,resyncRequired}));
      }
      // Nested changes coalesce to latest-snapshot hints, drained without recursive callbacks.
      while(this.pendingNotifications.size&&!this.disposed) {
        const [sessionId,queuedRevision]=this.pendingNotifications.entries().next().value!;
        this.pendingNotifications.delete(sessionId);
        this.deliver(freeze({sessionId,revision:Math.max(queuedRevision,this.modelRevision),changes:[],resyncRequired:true}));
        if(!this.pendingNotifications.has(sessionId))this.releaseRetiringNotification(sessionId);
      }
    } finally {
      this.delivering=false;
      for(const sessionId of this.retiringNotifications.keys())if(!this.pendingNotifications.has(sessionId))this.releaseRetiringNotification(sessionId);
    }
  }
  /** Session metadata's fixed allowance funds one deferred ID/revision, including teardown. */
  private deferResync(sessionId:string):boolean {
    if(!this.sessions.has(sessionId)&&!this.retiringNotifications.has(sessionId))return false;
    this.pendingNotifications.set(sessionId,this.modelRevision);return true;
  }
  private deliver(batch:CompanionModelBatch):void {
    for(const listener of this.listeners) {
      if(this.disposed)return;
      try{listener(batch);}catch{/* Consumers cannot unwind source ownership. */}
      // A quota reservation can synchronously evict this borrowed payload. Never send it afterward.
      if(this.modelRevision!==batch.revision&&this.deferResync(batch.sessionId))return;
    }
  }
  private releaseRetiringNotification(sessionId:string):void {
    const ticket=this.retiringNotifications.get(sessionId);if(!ticket)return;
    this.retiringNotifications.delete(sessionId);this.options.resources.releaseRetention(ticket);
  }
  private publish(sessionId:string,changes:CompanionChange[]):void {
    if(!changes.length)return;const owner=this.begin(),mutation=this.mutation!;
    const pending=mutation.changes.get(sessionId)??[];mutation.changes.set(sessionId,pending);
    for(const change of changes){if(pending.length===64){mutation.resync.add(sessionId);break;}pending.push(change.kind==="upsertGroup"?{kind:change.kind,groupId:change.group.groupId}:change);}
    this.finish(owner);
  }
  private boundary(sessionId:string,reason:"GAP"|"IDENTITY_CHANGED"|"CAPACITY"):void {
    const session=this.sessions.get(sessionId);if(!session)return;
    if(session.boundary===Number.MAX_SAFE_INTEGER){this.exhaust();return;}
    session.boundary++;session.historyBoundary=true;session.status={state:"unavailable",reason};
    for(const record of [...this.retained.values()])if(record.sessionId===sessionId){
      if(record.facts&&!record.request){this.remove(record);continue;}
      record.current=false;record.facts=undefined;record.groups=record.groups.map(group=>freeze({...group,targets:[],nodes:group.nodes.map(node=>this.inert(node))}));
      this.fund(record);
    }
    this.publish(sessionId,[...this.groups(sessionId).map(group=>({kind:"upsertGroup" as const,group})),{kind:"historyBoundary",value:true},{kind:"captureStatus",value:session.status}]);
  }
  /** Adopt only an actual delivered reservation; repeated ticket identities never release live data. */
  accept(binding:CaptureBinding,event:CaptureSourceEvent):"handled"|"capacity" {
    const owner=this.begin();try{this.admit(binding,event);return this.exhausted?"capacity":"handled";}catch(error){
      if(error instanceof MetadataCapacity){if(event.kind==="observation")this.options.resources.releaseRetention(event.retention);return "capacity";}throw error;
    }finally{this.finish(owner);}
  }
  private admit(binding:CaptureBinding,event:CaptureSourceEvent):void {
    if(event.kind==="observation"&&this.adopted.has(event.retention))return;
    if(event.kind==="observation")this.adopted.add(event.retention);
    const sessionId=binding.marker.sessionId;
    const release=()=>{if(event.kind==="observation")this.options.resources.releaseRetention(event.retention);};
    if(this.disposed||this.exhausted){release();return;}
    if([this.modelRevision,this.nextId,this.order].some(n=>n>=Number.MAX_SAFE_INTEGER)){release();this.exhaust();return;}
    const now=this.context(sessionId);
    if(!now||now.binding!==binding||!sameTarget(now.target,binding.marker)||now.captureEpoch!==event.captureEpoch||
      event.kind==="observation"&&(event.observation.kind==="unsupported"||event.observation.kind==="assistantRow"&&!event.observation.blocks.length)){release();return;}
    // Exact-ticket validation precedes any persistent bookkeeping. Final source/evidence costs are funded synchronously below.
    if(event.kind==="observation"&&!this.options.resources.resizeRetention(event.retention,1)){release();return;}
    if(this.refresh(sessionId)==="capacity")throw new MetadataCapacity();const session=this.session(sessionId);
    if(!session||!now||now.binding!==binding||!sameTarget(now.target,binding.marker)||now.captureEpoch!==event.captureEpoch){release();return;}
    if(event.kind==="discontinuity"){
      if(!Number.isSafeInteger(event.ackSeq)||event.ackSeq<session.lastAck||event.ackSeq<=session.lastGapAck)return;
      session.lastAck=event.ackSeq;session.lastGapAck=event.ackSeq;this.boundary(sessionId,"GAP");return;
    }
    if(!Number.isSafeInteger(event.observationId)||event.observationId<1||!Number.isSafeInteger(event.ackSeq)||event.ackSeq<1){release();return;}
    const fingerprint=createHash("sha256").update(JSON.stringify(event.observation)).digest("hex");
    if(event.observationId<=session.lastObservation||event.ackSeq<=session.lastAck){
      release();if(event.observationId===session.lastObservation&&fingerprint!==session.lastFingerprint)this.boundary(sessionId,"GAP");return;
    }
    session.lastObservation=event.observationId;session.lastAck=event.ackSeq;session.lastFingerprint=fingerprint;
    const observation=freeze(structuredClone(event.observation));
    if(observation.kind==="unsupported"){release();return;}
    if(observation.kind!=="assistantRow"){this.evidence(binding,{...event,observation},session);return;}
    const key=JSON.stringify([sessionId,event.captureEpoch,session.boundary,"row",observation.rowId]);
    const previous=this.retained.get(key);
    if(previous&&JSON.stringify(previous.observation)===JSON.stringify(observation)){release();return;}
    try {
      const groups:CompanionGroup[]=[],groupIndices:number[]=[];let adjacent=false;
      for(const block of observation.blocks) {
        if(block.kind==="bashRequest"){adjacent=false;continue;}
        if(block.kind==="text"){groups.push(this.contentGroup(block.text,event.captureEpoch));groupIndices.push(block.index);}
        else {
          // A command is a source-order barrier, even though its group is built in the second pass.
          const notice=this.contentGroup("",event.captureEpoch,true),prior=adjacent?groups.pop():undefined;
          groups.push(prior?freeze({...prior,nodes:[...prior.nodes,...notice.nodes]}):notice);if(!prior)groupIndices.push(block.index);
        }
        adjacent=true;
      }
      if(!groups.length&&!observation.blocks.some(b=>b.kind==="bashRequest")){release();return;}
      const record:Retained={key,sessionId,epoch:event.captureEpoch,boundary:session.boundary,ticket:event.retention,observation,groups,groupIndices,current:true,order:previous?.order??++this.order,blockIndex:0};
      if(previous)this.remove(previous);
      this.retained.set(key,record);this.protectedKeys.add(key);
      if(!this.fund(record)){this.remove(record);this.boundary(sessionId,"CAPACITY");return;}
      for(const block of observation.blocks)if(block.kind==="bashRequest")this.request(binding,record,block.toolUseId,block.index,block.command);
      if(!session.historyBoundary)session.status={state:"active",reason:null};
      const changes:CompanionChange[]=[...(previous?.groups??[]).map(group=>({kind:"removeGroup" as const,groupId:group.groupId})),...[record,...[...this.retained.values()].filter(r=>r.request?.rowKey===key)].flatMap(r=>r.groups).map(group=>({kind:"upsertGroup" as const,group})),{kind:"captureStatus",value:session.status}];
      this.publish(sessionId,changes);
    } catch {const failed=this.retained.get(key);if(failed)this.remove(failed);release();this.boundary(sessionId,"CAPACITY");}
    finally {this.protectedKeys.delete(key);}
  }

  private inert(node:CompanionNode):CompanionNode {
    if(node.kind==="code")return {...node,targetId:null};
    if("children" in node)return {...node,children:node.children.map(child=>this.inert(child))};return node;
  }
  private callKey(sessionId:string,epoch:string,boundary:number,toolUseId:string):string {return JSON.stringify([sessionId,epoch,boundary,"call",toolUseId]);}
  private remove(record:Retained):void {
    for(const child of [...this.retained.values()])if(child.request?.rowKey===record.key)this.remove(child);
    this.retained.delete(record.key);this.options.resources.releaseRetention(record.ticket);
  }
  private exhaust():void {
    this.exhausted=true;
    for(const record of this.retained.values()){record.current=false;record.groups=record.groups.map(group=>freeze({...group,targets:[],nodes:group.nodes.map(node=>this.inert(node))}));}
    for(const session of this.sessions.values()){session.historyBoundary=true;session.status={state:"unavailable",reason:"CAPACITY"};}
  }
  private totals(sessionId:string) {
    const records=[...this.retained.values()].filter(r=>r.sessionId===sessionId),groups=records.flatMap(r=>r.groups);
    return {messages:groups.length,nodes:groups.reduce((n,g)=>n+nodeCount(g.nodes),0),targets:groups.reduce((n,g)=>n+g.targets.length,0),pending:records.filter(r=>r.facts&&!r.request).length};
  }
  private oldest(sessionId?:string):Retained|undefined {
    return [...this.retained.values()].filter(r=>r.observation.kind==="assistantRow"&&(!sessionId||r.sessionId===sessionId)&&!this.protectedKeys.has(r.key)).sort((a,b)=>a.order-b.order)[0];
  }
  private evict(record:Retained):void {
    const groups=[record,...[...this.retained.values()].filter(r=>r.request?.rowKey===record.key)].flatMap(r=>r.groups);
    this.remove(record);const session=this.sessions.get(record.sessionId);if(session)session.historyBoundary=true;
    this.publish(record.sessionId,[...groups.map(g=>({kind:"removeGroup" as const,groupId:g.groupId})),{kind:"historyBoundary",value:true}]);
  }
  /** Serialized private facts, original strings, composed nodes and descriptors all spend the held ticket. */
  private fund(record:Retained):boolean {
    const rootKey=record.request?.rowKey??record.key,already=this.protectedKeys.has(rootKey);this.protectedKeys.add(rootKey);
    try {
      for(;;){const counts=this.totals(record.sessionId);if(counts.messages<=captureLimits.retainedMessages&&counts.nodes<=captureLimits.sessionNodes&&counts.targets<=captureLimits.sessionTargets&&counts.pending<=captureLimits.retainedMessages)break;
        const oldest=this.oldest(record.sessionId);if(!oldest)return false;this.evict(oldest);
      }
      const bytes=Buffer.byteLength(JSON.stringify({key:record.key,observation:record.observation,facts:record.facts?[...record.facts.values()]:[],request:record.request,groups:record.groups,groupIndices:record.groupIndices}))+512;
      if(!this.options.resources.resizeRetention(record.ticket,1))return false;
      this.evictComplete({sessionId:record.sessionId,bytes:bytes-1,sessionAvailable:0,globalAvailable:0});
      return this.options.resources.resizeRetention(record.ticket,bytes);
    } finally {if(!already)this.protectedKeys.delete(rootKey);}
  }
  /** A request supplies source, not proof; pending native facts may predate it. */
  private request(binding:CaptureBinding,row:Retained,toolUseId:string,index:number,command:string):void {
    const key=this.callKey(row.sessionId,row.epoch,row.boundary,toolUseId);let record=this.retained.get(key);
    if(!record) {
      const ticket=this.options.resources.reserveRetention(binding,1);if(!ticket)throw new Error("capacity");
      record={key,sessionId:row.sessionId,epoch:row.epoch,boundary:row.boundary,ticket,observation:{kind:"callEnter",scope:{kind:"main"},toolUseId,bindingValid:false,command:null},groups:[],current:true,order:row.order,blockIndex:index,facts:new Map()};
      this.retained.set(key,record);
    }
    if(record.request&&(record.request.rowKey!==row.key||record.request.index!==index||record.request.command!==command))record.conflict=true;
    record.request={rowKey:row.key,index,command};record.order=row.order;record.blockIndex=index;
    this.reconcile(record);if(!this.fund(record)){this.remove(record);throw new Error("capacity");}
  }
  private evidence(binding:CaptureBinding,event:Extract<CaptureSourceEvent,{kind:"observation"}>,session:Session):void {
    const observation=event.observation;if(!("toolUseId" in observation)){this.options.resources.releaseRetention(event.retention);return;}
    const key=this.callKey(binding.marker.sessionId,event.captureEpoch,session.boundary,observation.toolUseId);
    let record=this.retained.get(key);const facts=record?.facts??new Map<string,NormalizedObservation>();
    const prior=facts.get(observation.kind);
    if(prior&&JSON.stringify(prior)===JSON.stringify(observation)){this.options.resources.releaseRetention(event.retention);return;}
    if(record){this.options.resources.releaseRetention(event.retention);if(prior)record.conflict=true;}
    else {record={key,sessionId:binding.marker.sessionId,epoch:event.captureEpoch,boundary:session.boundary,ticket:event.retention,observation,groups:[],current:true,order:++this.order,blockIndex:0,facts};this.retained.set(key,record);}
    // One first fact per closed kind plus a conflict bit bounds contradictory replay metadata.
    if(!prior)facts.set(observation.kind,observation);
    try {
      const before=record.groups;this.reconcile(record);
      if(!this.fund(record)){this.remove(record);this.boundary(record.sessionId,"CAPACITY");return;}
      if(before!==record.groups)this.publish(record.sessionId,[...before.map(g=>({kind:"removeGroup" as const,groupId:g.groupId})),...record.groups.map(group=>({kind:"upsertGroup" as const,group}))]);
    } catch {this.remove(record);this.boundary(record.sessionId,"CAPACITY");}
  }
  /** Full C4 predicates; text, output prose and return refs are never authority. */
  private outcome(record:Retained):{status:CompanionProvenance;label:string;effective:string|null} {
    const facts=record.facts!,enter=facts.get("callEnter"),post=facts.get("post"),result=facts.get("storedResult"),returned=facts.get("callReturn"),failure=facts.get("failure"),denied=facts.get("permissionDenied");
    const answer=(status:CompanionProvenance,label:string,effective:string|null=null)=>({status,label,effective});
    const unknown=(conflict=false)=>answer("unknown",conflict?"Conflicting native evidence":"Outcome unknown");
    if(record.conflict)return unknown(true);
    if(enter?.kind!=="callEnter"||!enter.bindingValid)return answer("pending","Requested by Claude; execution not confirmed");
    const flags:BashFlags[]=[];
    if(post?.kind==="post"&&post.responseState==="valid")flags.push(post.flags);
    if(returned?.kind==="callReturn"&&returned.branch==="bash")flags.push(returned.flags);
    const background=(f:BashFlags)=>!!f.backgroundTaskId||!!f.backgroundedByUser||!!f.backgroundedByTurnAbort||!!f.backgroundedToDeliverMessage||!!f.backgroundEndsWithFinalResponse||!!f.backgroundWakesOwner||f.backgroundArtifactHint;
    if(flags.length===2&&(flags[0]!.interrupted!==flags[1]!.interrupted||flags[0]!.backgroundTaskId!==flags[1]!.backgroundTaskId))return unknown(true);
    if((denied&&post)||flags.some(f=>f.interrupted&&background(f)))return unknown(true);
    if(flags.some(f=>background(f)&&!f.backgroundTaskId))return unknown();
    if(flags.some(f=>f.interrupted)||failure?.kind==="failure"&&failure.isInterrupt===true)return answer("interrupted","Interruption reported; execution not confirmed");
    if(denied)return answer("denied","Permission denied; execution not confirmed");
    if(failure||returned?.kind==="callReturn"&&returned.branch==="error"||result?.kind==="storedResult"&&result.isError===true) {
      if(post)return unknown(true);
      return answer("tool-error","Tool reported error; execution not confirmed");
    }
    if(post?.kind==="post"&&post.responseState==="valid") {
      if(!result)return answer("pending","Awaiting stored result; execution not confirmed");
      if(result.kind!=="storedResult"||result.isError!==false)return unknown();
      return post.flags.backgroundTaskId?answer("backgrounded","Claude started this / Backgrounded (last reported)",post.command):answer("completed","Claude ran this / Tool completed",post.command);
    }
    if(returned?.kind==="callReturn"&&returned.branch==="deny")return answer("unknown","Execution not confirmed");
    if(result||post)return unknown();
    return answer("pending","Requested by Claude; execution not confirmed");
  }
  private reconcile(record:Retained):void {
    if(!record.request)return;
    const outcome=this.outcome(record),requested=record.request.command,effective=outcome.effective;
    // Display assembly may insert LF separators; each target still slices its own original native literal.
    const entry=record.facts?.get("callEnter");
    const observed=entry?.kind==="callEnter"&&entry.bindingValid&&entry.command!==requested?entry.command:null;
    const literals=[{literal:requested,label:"Requested command"},...(observed===null?[]:[{literal:observed,label:"Observed request"}]),...(effective===null?[]:[{literal:effective,label:"Effective command"}])];
    let sourceText="";const starts:number[]=[];for(const value of literals){const duplicate=literals.findIndex(other=>other.literal===value.literal);
      if(duplicate<starts.length){starts.push(starts[duplicate]!);continue;}starts.push(sourceText.length+(sourceText?1:0));sourceText+=(sourceText?"\n":"")+value.literal;}
    const old=record.groups[0];
    const result=record.facts?.get("storedResult");
    const signature=createHash("sha256").update(JSON.stringify([sourceText,outcome,result])).digest("hex");
    // Preserve IDs/revisions when new evidence leaves the actual presentation and targets unchanged.
    if(old&&record.groups.length&&signature===this.signatures.get(record))return;
    this.signatures.set(record,signature);
    const groupId=old?.groupId??this.id("g"),sourceRevision=(old?.sourceRevision??0)+1;
    if(!Number.isSafeInteger(sourceRevision))throw new Error("revision exhausted");
    const targets:CompanionTarget[]=[],nodes:CompanionNode[]=[];
    const add=(literal:string,start:number,label:string)=>{
      const targetId=literal&&!literal.includes("\0")?this.id("t"):null;
      if(targetId)targets.push({targetId,targetRevision:sourceRevision,groupId,sourceStart:start,sourceEnd:start+literal.length,kind:"command",action:"copy",displayLabel:label,accessibleLabel:"Copy "+label.toLowerCase()});
      nodes.push({kind:"code",nodeId:this.id("n"),sourceSpan:{start,end:start+literal.length},text:literal,language:"bash",block:true,targetId});
    };
    if(Buffer.byteLength(sourceText)>captureLimits.sourceBytes){sourceText="";nodes.push({kind:"notice",nodeId:this.id("n"),sourceSpan:null,reason:"RENDER_LIMIT",text:"Complete command group unavailable."});}
    else literals.forEach((value,i)=>add(value.literal,starts[i]!,value.label));
    const group=freeze({groupId,captureEpoch:record.epoch,sourceRevision,speaker:"tool" as const,sourceText,nodes,targets,provenanceStatus:outcome.status,statusLabel:outcome.label});
    const output=result?.kind==="storedResult"?result.output.map(block=>this.contentGroup(block.kind==="text"?block.text:"",record.epoch,block.kind==="unavailable","tool")):[];
    record.groups=freeze([group,...output]);
  }
  private readonly signatures=new WeakMap<Retained,string>();

  private contentGroup(text:string,epoch:string,unsupported=false,sourceKind:"assistant"|"tool"="assistant"):CompanionGroup {
    const content=extractCompanionContent(text,{sourceKind}),groupId=this.id("g");
    const candidates=sourceKind==="tool"?[]:content.targets;
    const targets=candidates.map(candidate=>({targetId:this.id("t"),targetRevision:1,groupId,sourceStart:candidate.sourceStart,sourceEnd:candidate.sourceEnd,
      kind:candidate.kind,action:candidate.action,accessibleLabel:candidate.accessibleLabel,displayLabel:candidate.displayLabel}));
    const nodes:CompanionNode[]=unsupported?[{kind:"notice",nodeId:this.id("n"),sourceSpan:null,reason:"UNSUPPORTED_CONTENT",text:"Content unavailable."}]:content.nodes.map(node=>this.node(node,targets));
    const provenanceStatus=candidates.length===1?candidates[0]!.provenanceStatus:"none";
    const statusLabel=provenanceStatus==="none"?null:provenanceStatus==="suggested"?"Suggested command":provenanceStatus==="example"?"Command shown by Claude":"Code shown by Claude";
    return freeze({groupId,captureEpoch:epoch,sourceRevision:1,speaker:sourceKind,sourceText:content.sourceText,nodes,targets,provenanceStatus,statusLabel});
  }
  private node(node:CompanionContentNode,targets:readonly CompanionTarget[]):CompanionNode {
    const nodeId=this.id("n");
    if(node.kind==="code") {const {targetIndex,...fields}=node;return {...fields,nodeId,targetId:targetIndex===null?null:targets[targetIndex]?.targetId??null};}
    if("children" in node)return {...node,nodeId,children:node.children.map(child=>this.node(child,targets))};
    return {...node,nodeId};
  }
  /**
   * Closed immutable VW payload. P3 carries revision separately and owns/funds any
   * asynchronous snapshot pin; this model keeps no transfer or catch-up history.
   */
  snapshot(sessionId:string):CompanionSnapshot {
    if(this.sessions.has(sessionId))this.refresh(sessionId);const session=this.sessions.get(sessionId);
    // The existing retirement ticket funds this terminal cut until deferred fan-out completes.
    // A live replacement wins; after release, the ordinary absent-session fallback is unchanged.
    return freeze({groups:this.groups(sessionId),historyBoundary:session?.historyBoundary??false,
      captureStatus:session?.status??(this.disposed||this.retiringNotifications.has(sessionId)?{state:"retired",reason:"CHANNEL_RETIRED"}:{state:"starting",reason:"INITIALIZING"})});
  }
  /** Resolve only the exact live target revision, independent of unrelated model revisions. */
  resolveLiteral(sessionId:string,targetId:string,targetRevision:number):Readonly<{literal:string;action:"copy"|"review"}>|undefined {
    if(this.disposed)return undefined;if(this.sessions.has(sessionId))this.refresh(sessionId);
    for(const record of this.retained.values())if(record.sessionId===sessionId&&record.current)for(const group of record.groups) {
      const target=group.targets.find(t=>t.targetId===targetId&&t.targetRevision===targetRevision);
      if(target)return Object.freeze({literal:group.sourceText.slice(target.sourceStart,target.sourceEnd),action:target.action});
    }
    return undefined;
  }
  /**
   * Synchronous borrowed references only. P3 must reserve in the same P1 ledger
   * before retaining/serializing a snapshot or change beyond this callback.
   * resyncRequired is host-local and must never be serialized as a VW field.
   */
  subscribe(listener:(batch:CompanionModelBatch)=>void):()=>void {this.listeners.add(listener);return ()=>{this.listeners.delete(listener);};}
  /** Synchronous callback seam for P1's shared capacity admission. */
  evictComplete(request:Readonly<{sessionId:string;bytes:number;sessionAvailable:number;globalAvailable:number}>):void {const owner=this.begin();try{this.evictForBytes(request);}finally{this.finish(owner);}}
  private evictForBytes(request:Readonly<{sessionId:string;bytes:number}>):void {
    for(;;){const usage=this.options.resources.retentionUsage(request.sessionId);
      const sessionFull=usage.sessionBytes+request.bytes>captureLimits.sessionBytes,globalFull=usage.globalBytes+request.bytes>captureLimits.globalBytes;
      if(!sessionFull&&!globalFull)return;
      const oldest=this.oldest(sessionFull?request.sessionId:undefined);if(!oldest)return;this.evict(oldest);
    }
  }
  private dropSession(sessionId:string):void {
    const groups=this.groups(sessionId);for(const record of [...this.retained.values()])if(record.sessionId===sessionId)this.remove(record);
    const session=this.sessions.get(sessionId);this.sessions.delete(sessionId);
    if(session){
      if(this.delivering){this.releaseRetiringNotification(sessionId);this.retiringNotifications.set(sessionId,session.ticket);}
      else this.options.resources.releaseRetention(session.ticket);
    }
    this.publish(sessionId,[...groups.map(group=>({kind:"removeGroup" as const,groupId:group.groupId})),{kind:"historyBoundary",value:false},{kind:"captureStatus",value:{state:"retired",reason:"CHANNEL_RETIRED"}}]);
  }
  /** Host teardown must name the exact bound owner/target/epoch; stale teardown cannot erase a replacement. */
  releaseSession(context:CompanionModelContext):boolean {
    const id=context.target.sessionId,session=this.sessions.get(id),now=this.context(id);
    if(!session||session.context.binding!==context.binding||session.context.captureEpoch!==context.captureEpoch||!sameTarget(session.context.target,context.target)||
      now&&(now.binding!==context.binding||now.captureEpoch!==context.captureEpoch||!sameTarget(now.target,context.target)))return false;
    const owner=this.begin();try{this.dropSession(id);return true;}finally{this.finish(owner);}
  }
  /** Release retained host values on extension disposal; captured text is never replayed. */
  dispose():void {if(this.disposed)return;this.disposed=true;for(const record of this.retained.values())this.options.resources.releaseRetention(record.ticket);this.retained.clear();for(const session of this.sessions.values())this.options.resources.releaseRetention(session.ticket);this.sessions.clear();for(const sessionId of this.retiringNotifications.keys())this.releaseRetiringNotification(sessionId);this.pendingNotifications.clear();this.listeners.clear();}
}
