import { createHash } from "node:crypto";
import type * as vscode from "vscode";
import { isCanonicalUuid } from "../sessions/resumableSessionValidation";
import {
  validComposerDraft, validComposerLayout, validComposerSubmit,
  type ComposerHostMessage
} from "../panel/composerProtocol";
import type { ComposerStore } from "./composerStore";
import {
  SAVE_DEBOUNCE_MS, MAX_DRAFT_UTF8_BYTES,
  type ClaudeComposerAdapter, type ComposerCapability, type ComposerLayout, type ComposerTarget,
  type DraftState, type SavedComposerSession, type SaveResult, type SubmitRequest, type SubmitResult
} from "./composerTypes";

export interface ComposerSessionContext {
  readonly sessionId:string; readonly generation:string; readonly claudeSessionId:string|null;
  readonly rootId:string; readonly rootPath:string; readonly displayName:string; readonly canSubmit:boolean;
}
export interface ComposerControllerOptions {
  readonly store:ComposerStore;
  readonly adapter:ClaudeComposerAdapter;
  readonly resolveSession:(sessionId:string)=>ComposerSessionContext|undefined;
  readonly liveSessions:()=>readonly ComposerSessionContext[];
  readonly documentId:()=>string|undefined;
  readonly emit:(message:ComposerHostMessage)=>void;
  readonly schedule?:(callback:()=>void,delayMs:number)=>vscode.Disposable;
  readonly validateRestore:(source:SavedComposerSession)=>Promise<boolean>;
  readonly launchRestore:(source:SavedComposerSession)=>Promise<ComposerSessionContext|undefined>;
  readonly onAccepted?:(request:SubmitRequest)=>void;
}
interface Working {
  readonly target:ComposerTarget;
  session:SavedComposerSession;
}
interface PendingSave {
  readonly promise:Promise<SaveResult>;
  readonly resolve:(result:SaveResult)=>void;
  timer:vscode.Disposable;
}
const sameTarget=(a:ComposerTarget,b:ComposerTarget)=>a.sessionId===b.sessionId && a.claudeSessionId===b.claudeSessionId && a.generation===b.generation;
const sameDraft=(a:DraftState,b:DraftState)=>a.revision===b.revision && a.text===b.text && a.selection.anchor===b.selection.anchor && a.selection.head===b.selection.head;
const snapshot=(draft:DraftState):DraftState=>Object.freeze({...draft,selection:Object.freeze({...draft.selection})});

/** Host-owned drafts and delivery state; callbacks remain scoped to their launch generation. */
export class ComposerController implements vscode.Disposable {
  private readonly working=new Map<string,Working>();
  private readonly pending=new Map<string,PendingSave>();
  private readonly writing=new Set<Promise<unknown>>();
  private readonly submissions=new Map<string,{fingerprint:string;promise:Promise<SubmitResult>}>();
  private readonly sendChains=new Map<string,Promise<unknown>>();
  private readonly uncertainties=new Map<string,number>();
  private readonly restorations=new Map<string,Promise<void>>();
  private active:ComposerCapability|undefined;
  private visible=true;
  private disposed=false;
  private selectionEpoch=0;

  constructor(private readonly options:ComposerControllerOptions) {}

  async select(sessionId:string,generation:string):Promise<ComposerCapability> {
    if (!isCanonicalUuid(generation) || !sessionId) { throw new TypeError("Invalid composer live identity."); }
    const epoch=++this.selectionEpoch;
    await this.flush();
    if(this.disposed || epoch!==this.selectionEpoch)return {status:"unavailable",sessionId,generation,reason:"unsupported-identity"};
    const context=this.options.resolveSession(sessionId);
    if (this.disposed || context?.generation!==generation || !isCanonicalUuid(context.claudeSessionId)
      || this.options.store.isForgotten(context.claudeSessionId)) {
      const capability:ComposerCapability={status:"unavailable",sessionId,generation,reason:"unsupported-identity"};
      this.active=capability;this.hydrate();return capability;
    }
    const target:ComposerTarget=Object.freeze({sessionId,claudeSessionId:context.claudeSessionId,generation});
    const cached=this.working.get(target.claudeSessionId);
    if (cached===undefined || !sameTarget(cached.target,target)) {
      const stored=this.options.store.getRecoverable(target.claudeSessionId);
      this.working.set(target.claudeSessionId,{target,session:Object.freeze({
        claudeSessionId:target.claudeSessionId,rootId:context.rootId,rootPath:context.rootPath,displayName:context.displayName,
        draft:stored?.draft ?? snapshot({revision:0,text:"",selection:{anchor:0,head:0}}),recent:stored?.recent ?? Object.freeze([])
      })});
    } else {
      const stored=this.options.store.getRecoverable(target.claudeSessionId);
      cached.session=Object.freeze({...cached.session,rootId:context.rootId,rootPath:context.rootPath,displayName:context.displayName,
        ...(stored!==undefined && stored.draft.revision>cached.session.draft.revision ? {draft:stored.draft} : {}),
        recent:this.options.store.getRecoverable(target.claudeSessionId)?.recent ?? Object.freeze([])});
    }
    this.active={status:"available",target};this.hydrate();return this.active;
  }

  get capability():ComposerCapability|undefined {return this.active;}
  async clearSelection():Promise<void> {
    const epoch=++this.selectionEpoch;await this.flush();
    if(this.disposed || epoch!==this.selectionEpoch)return;
    this.active=undefined;const documentId=this.options.documentId();
    if(documentId!==undefined)this.emit({type:"composerReset",documentId});
  }
  getDraft(target:ComposerTarget):DraftState|undefined {return this.current(target)?.session.draft;}

  updateDraft(target:ComposerTarget,draft:DraftState):Promise<SaveResult> {
    const current=this.current(target);
    if (current===undefined || !validComposerDraft(draft)) return Promise.resolve("stale");
    if (draft.revision<current.session.draft.revision || (draft.revision===current.session.draft.revision && !sameDraft(draft,current.session.draft))) return Promise.resolve("stale");
    current.session=Object.freeze({...current.session,draft:snapshot(draft)});
    this.emit({type:"composerDraftStatus",target,revision:draft.revision,status:"saving"});
    const existing=this.pending.get(target.claudeSessionId);
    if (existing!==undefined) {existing.timer.dispose();existing.timer=this.schedule(()=>{void this.save(target.claudeSessionId);});return existing.promise;}
    let resolve!:(result:SaveResult)=>void;
    const promise=new Promise<SaveResult>(r=>{resolve=r;});
    const timer=this.schedule(()=>{void this.save(target.claudeSessionId);});
    this.pending.set(target.claudeSessionId,{promise,resolve,timer});return promise;
  }

  submit(request:SubmitRequest):Promise<SubmitResult> {
    const rejected=():SubmitResult=>({status:"rejected",submissionId:request.submissionId,reason:"unavailable"});
    if (!validComposerSubmit(request)) return Promise.resolve(rejected());
    const key=`${request.target.claudeSessionId}:${request.target.generation}:${request.submissionId}`;
    const fingerprint=createHash("sha256").update(JSON.stringify(request)).digest("hex");
    const existing=this.submissions.get(key);
    if (existing!==undefined) return existing.fingerprint===fingerprint ? existing.promise : Promise.resolve({status:"rejected",submissionId:request.submissionId,reason:"invalid"});
    if (this.current(request.target,true)===undefined || !this.options.resolveSession(request.target.sessionId)?.canSubmit) return Promise.resolve(rejected());
    const frozen:SubmitRequest=Object.freeze({...request,target:Object.freeze({...request.target}),draft:snapshot(request.draft)});
    const uuid=request.target.claudeSessionId;
    const uncertainty=this.uncertainties.get(uuid) ?? 0;
    const promise=(this.sendChains.get(uuid) ?? Promise.resolve()).then(()=>this.performSubmit(frozen,uncertainty));
    this.sendChains.set(uuid,promise.catch(()=>undefined));this.submissions.set(key,{fingerprint,promise});return promise;
  }

  async updateLayout(documentId:string,layout:ComposerLayout):Promise<"saved"|"failed"> {
    if (this.disposed || documentId!==this.options.documentId() || !validComposerLayout(layout)) return "failed";
    let status:"saved"|"error"="saved";
    try {await this.options.store.setLayout(layout);} catch {status="error";}
    if (documentId===this.options.documentId()) this.emit({type:"composerLayoutStatus",documentId,layout:this.options.store.getLayout(),status});
    return status==="saved" ? "saved":"failed";
  }

  async setVisible(visible:boolean):Promise<void> {if(!visible) await this.flush();this.visible=visible;this.hydrate();}

  recallHistory(target:ComposerTarget,index:number,mode:"replace"|"append",expectedRevision:number):Promise<SaveResult> {
    const current=this.current(target,true);
    const recent=this.options.store.get(target.claudeSessionId)?.recent;
    if(current===undefined || !Number.isSafeInteger(index) || index<0 || recent?.[index]===undefined || current.session.draft.revision!==expectedRevision
      || (mode!=="replace" && mode!=="append"))return Promise.resolve("stale");
    const text=mode==="replace"?recent[index]!:current.session.draft.text+(current.session.draft.text?"\n":"")+recent[index]!;
    const result=this.updateDraft(target,{revision:expectedRevision+1,text,selection:{anchor:text.length,head:text.length}});
    this.hydrate();return result;
  }

  async close(target:ComposerTarget):Promise<void> {
    await this.flush();await this.options.adapter.disposeSession(target);
    const current=this.working.get(target.claudeSessionId);
    if (current!==undefined && sameTarget(current.target,target)) this.working.delete(target.claudeSessionId);
    if (this.active?.status==="available" && sameTarget(this.active.target,target)) this.active=undefined;
  }

  async forget(uuid:string):Promise<void> {
    // Store tombstones synchronously, before pending or externally held writes finish.
    const forgetting=this.options.store.forget(uuid);
    const pending=this.pending.get(uuid);pending?.timer.dispose();this.pending.delete(uuid);pending?.resolve("forgotten");
    this.working.delete(uuid);await forgetting;
  }

  restoreDraft(uuid:string,expectedRevision:number):Promise<void> {
    const existing=this.restorations.get(uuid);if(existing!==undefined)return existing;
    const operation=this.performRestore(uuid,expectedRevision);
    this.restorations.set(uuid,operation);
    void operation.finally(()=>{this.restorations.delete(uuid);}).catch(()=>undefined);
    return operation;
  }

  async flush():Promise<void> {
    do {
      await Promise.all([...this.pending.keys()].map(uuid=>this.save(uuid)));
      await Promise.all([...this.writing]);
    } while(this.pending.size>0 || this.writing.size>0);
    await this.options.store.flush();
  }

  dispose():void {
    if(this.disposed)return;
    // Flush is started before suppressing host messages; normal shutdown awaits flush separately.
    void this.flush();this.disposed=true;
  }

  private schedule(callback:()=>void):vscode.Disposable {
    if(this.options.schedule!==undefined)return this.options.schedule(callback,SAVE_DEBOUNCE_MS);
    const timer=setTimeout(callback,SAVE_DEBOUNCE_MS);return {dispose:()=>clearTimeout(timer)};
  }
  private current(target:ComposerTarget,requireActive=false):Working|undefined {
    if(this.disposed || this.options.store.isForgotten(target.claudeSessionId))return undefined;
    const live=this.options.resolveSession(target.sessionId);
    const working=this.working.get(target.claudeSessionId);
    if(live?.generation!==target.generation || live.claudeSessionId!==target.claudeSessionId || working===undefined || !sameTarget(working.target,target))return undefined;
    if(requireActive && (this.active?.status!=="available" || !sameTarget(this.active.target,target)))return undefined;
    return working;
  }
  private save(uuid:string):Promise<SaveResult> {
    const pending=this.pending.get(uuid);if(pending===undefined)return Promise.resolve("stale");
    pending.timer.dispose();this.pending.delete(uuid);
    const working=this.working.get(uuid);
    if(working===undefined){pending.resolve("forgotten");return pending.promise;}
    const session=working.session;const target=working.target;
    const operation=this.options.store.saveDraft(session,()=>this.current(target)!==undefined).then(result=>{
      pending.resolve(result);
      this.emit({type:"composerDraftStatus",target,revision:session.draft.revision,status:result==="saved"?"saved":result==="too-large"?"too-large":"error"});
      return result;
    });
    this.writing.add(operation);void operation.finally(()=>this.writing.delete(operation)).catch(()=>undefined);return operation;
  }
  private async performSubmit(request:SubmitRequest,uncertainty:number):Promise<SubmitResult> {
    const {target,submissionId,draft}=request;const uuid=target.claudeSessionId;
    const rejected:SubmitResult={status:"rejected",submissionId,reason:"unavailable"};
    await this.flush();
    const current=this.current(target);
    if(current===undefined || !this.options.resolveSession(target.sessionId)?.canSubmit || !sameDraft(current.session.draft,draft)
      || !draft.text.trim() || Buffer.byteLength(draft.text,"utf8")>MAX_DRAFT_UTF8_BYTES || (this.uncertainties.get(uuid)??0)!==uncertainty) {
      this.emit({type:"composerSubmitResult",target,result:rejected});return rejected;
    }
    let result:SubmitResult;
    try {result=await this.options.adapter.submit(request);} catch {result={status:"unconfirmed",submissionId};}
    if(result.submissionId!==submissionId || (result.status==="accepted" && result.revision!==draft.revision)) result={status:"unconfirmed",submissionId};
    if(result.status==="unconfirmed")this.uncertainties.set(uuid,uncertainty+1);
    if(result.status==="accepted" && this.current(target)!==undefined) {
      try {this.options.onAccepted?.(request);}catch{ /* Activity observers cannot change accepted delivery. */ }
      try {
        // A previously failed save may now be recoverable; accepted delivery never becomes rejected.
        if(this.options.store.get(uuid)?.draft.revision!==current.session.draft.revision) {
          if(await this.options.store.saveDraft(current.session)!=="saved")throw new Error("Composer storage unavailable.");
        }
        await this.options.store.recordAccepted(uuid,submissionId,draft.text,()=>this.current(target)!==undefined);
        const unchanged=()=>{const value=this.current(target);return value!==undefined && sameDraft(value.session.draft,draft);};
        const cleared=await this.options.store.clearAcceptedDraft(uuid,draft.revision,unchanged);
        const latest=this.current(target);
        const stored=this.options.store.get(uuid);
        if(latest!==undefined && stored!==undefined) {
          latest.session=Object.freeze({...latest.session,recent:stored.recent,...(cleared?{draft:stored.draft}:{})});
          if(cleared)this.emit({type:"composerDraftStatus",target,revision:stored.draft.revision,status:"saved"});
          if(this.active?.status==="available" && sameTarget(this.active.target,target))this.hydrate();
        }
      } catch {this.emit({type:"composerDraftStatus",target,revision:draft.revision,status:"error"});}
    }
    this.emit({type:"composerSubmitResult",target,result});return result;
  }
  private async performRestore(uuid:string,expectedRevision:number):Promise<void> {
    await this.flush();
    const source=this.options.store.getRecoverable(uuid);
    if(!isCanonicalUuid(uuid) || source?.draft.revision!==expectedRevision)throw new Error("Composer draft revision changed.");
    const live=()=>this.options.liveSessions().some(s=>s.claudeSessionId===uuid);
    if(live())throw new Error("Composer draft is live.");
    if(!await this.options.validateRestore(source))throw new Error("Composer draft root is unavailable.");
    if(this.options.store.getRecoverable(uuid)?.draft.revision!==expectedRevision || live() || this.options.store.isForgotten(uuid))throw new Error("Composer draft revision changed.");
    // A failed draft must first become durable before a new session is launched.
    if(this.options.store.get(uuid)?.draft.revision!==expectedRevision && await this.options.store.saveDraft(source)!=="saved")throw new Error("Composer source storage unavailable.");
    const destination=await this.options.launchRestore(source);
    if(destination===undefined || !isCanonicalUuid(destination.claudeSessionId))throw new Error("Composer draft launch unavailable.");
    if(!await this.options.validateRestore(source))throw new Error("Composer draft root changed during launch.");
    const destinationUuid=destination.claudeSessionId;
    const empty:DraftState={revision:0,text:"",selection:{anchor:0,head:0}};
    const destinationUnchanged=()=>{
      const draft=this.working.get(destinationUuid)?.session.draft;
      return draft===undefined || sameDraft(draft,empty);
    };
    await this.options.store.transferDraft(uuid,{claudeSessionId:destinationUuid,rootId:destination.rootId,rootPath:destination.rootPath,displayName:destination.displayName,draft:source.draft,recent:[]},expectedRevision,destinationUnchanged);
    this.working.delete(uuid);
    const working=this.working.get(destinationUuid);const stored=this.options.store.get(destinationUuid);
    if(working!==undefined && stored!==undefined && destinationUnchanged()){
      working.session=stored;
      if(this.active?.status==="available" && sameTarget(this.active.target,working.target))this.hydrate();
    }
  }
  private hydrate():void {
    if(this.active===undefined)return;
    const common={visible:this.visible,layout:this.options.store.getLayout(),favorites:this.options.store.favorites};
    if(this.active.status==="unavailable")this.emit({type:"composerHydrate",capability:this.active,...common,canSubmit:false});
    else {
      const working=this.current(this.active.target);
      if(working!==undefined){
        this.emit({type:"composerHydrate",capability:this.active,session:working.session,...common,canSubmit:this.options.resolveSession(this.active.target.sessionId)?.canSubmit===true});
        const draft=working.session.draft;
        const durable=this.options.store.get(this.active.target.claudeSessionId)?.draft;
        const recoverable=this.options.store.getRecoverable(this.active.target.claudeSessionId)?.draft;
        const status=durable!==undefined && sameDraft(durable,draft)?"saved"
          :Buffer.byteLength(draft.text,"utf8")>MAX_DRAFT_UTF8_BYTES?"too-large"
          :recoverable!==undefined && sameDraft(recoverable,draft)?"error":"unsaved";
        this.emit({type:"composerDraftStatus",target:this.active.target,revision:draft.revision,status});
      }
    }
  }
  private emit(message:ComposerHostMessage):void {if(!this.disposed)this.options.emit(message);}
}
