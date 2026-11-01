import { randomUUID } from "node:crypto";
import type * as vscode from "vscode";
import type { ClaudeCapabilities } from "../launch/claudeCapabilities";
import type { LaunchSpec } from "../launch/launchPlanner";
import type { SessionManager } from "../sessions/sessionManager";
import type { ManagedSessionSnapshot } from "../sessions/sessionTypes";
import { isCanonicalUuid } from "../sessions/resumableSessionValidation";
import { decodeComposerWebviewMessage, type ComposerAction, type ComposerHostMessage } from "../panel/composerProtocol";
import type { ManagedClaudeComposerAdapter } from "./claudeComposerAdapter";
import { ComposerCatalog } from "./composerCatalog";
import { ComposerController, type ComposerSessionContext } from "./composerController";
import { ComposerFiles, type ComposerFilesOptions } from "./composerFiles";
import type { ComposerStore } from "./composerStore";
import type { ComposerTarget, SavedComposerSession } from "./composerTypes";

export interface ComposerRuntimeOptions {
  readonly store:ComposerStore;
  readonly adapter:ManagedClaudeComposerAdapter;
  readonly sessions:Pick<SessionManager,"sessions"|"activeSessionId"|"getLaunchSpec"|"onDidChangeSessions">;
  readonly documentId:()=>string|undefined;
  readonly emit:(message:ComposerHostMessage)=>void;
  readonly getCapabilities:(executable:string)=>Promise<ClaudeCapabilities>;
  readonly expectsReporter:(sessionId:string)=>boolean;
  readonly setFocusContext:(focused:boolean,pickerFocused:boolean)=>PromiseLike<void>;
  readonly configureShortcuts:()=>PromiseLike<unknown>;
  readonly validateRestore:(source:SavedComposerSession)=>Promise<boolean>;
  readonly launchRestore:(source:SavedComposerSession)=>Promise<ManagedSessionSnapshot|undefined>;
  readonly ownsResumable:(uuid:string)=>boolean;
  readonly operationPending:(uuid:string)=>boolean;
  readonly forgetResumable:(uuid:string)=>Promise<void>;
  readonly files:Omit<ComposerFilesOptions,"isCurrent"|"resolveScope">;
  readonly onPromptAccepted?:(sessionId:string)=>void;
  readonly onFailure?:(reason:"bridge"|"restore"|"storage"|"view")=>void;
}
const sameTarget=(a:ComposerTarget|undefined,b:ComposerTarget)=>a?.sessionId===b.sessionId && a.claudeSessionId===b.claudeSessionId && a.generation===b.generation;

/** Host composition only: presentation receives messages, never launch roots or process handles. */
export class ComposerRuntime implements vscode.Disposable {
  readonly controller:ComposerController;
  readonly catalog:ComposerCatalog;
  private readonly files:ComposerFiles;
  private readonly generations=new Map<string,string>();
  private readonly known=new Map<string,ManagedSessionSnapshot>();
  private readonly restoring=new Set<string>();
  private readonly forgetting=new Set<string>();
  private readonly subscription:vscode.Disposable;
  private selectionKey:string|undefined;
  private selectionOperation:Promise<void>=Promise.resolve();
  private closed=false;
  private closeOperation:Promise<void>|undefined;
  private focusOnReady=false;
  private focusedSessionKey:string|undefined;
  private focusOperation:Promise<void>=Promise.resolve();
  private referenceEpoch=0;

  constructor(private readonly options:ComposerRuntimeOptions) {
    this.controller=new ComposerController({store:options.store,adapter:options.adapter,
      resolveSession:id=>this.contextFor(id),liveSessions:()=>options.sessions.sessions.map(s=>this.contextFor(s.id)).filter((s):s is ComposerSessionContext=>s!==undefined),
      documentId:options.documentId,emit:message=>this.emit(message),validateRestore:options.validateRestore,
      launchRestore:async source=>{const session=await options.launchRestore(source);return session===undefined?undefined:this.contextFor(session.id);},
      onAccepted:request=>{if(!this.closed && !request.draft.text.trimStart().startsWith("/"))options.onPromptAccepted?.(request.target.sessionId);}});
    this.catalog=new ComposerCatalog({isCurrent:target=>this.isActive(target),listCommands:target=>options.adapter.listCommands(target)});
    this.files=new ComposerFiles({...options.files,isCurrent:target=>this.isActive(target),resolveScope:target=>{
      const session=options.sessions.sessions.find(s=>s.id===target.sessionId);
      return session===undefined?undefined:{cwd:session.launchedRootPath,roots:[session.launchedRootPath,...session.launchedAddDirPaths]};
    }});
    this.subscription=options.sessions.onDidChangeSessions(()=>this.synchronize());this.synchronize();
  }

  targetFor(sessionId:string):ComposerTarget|undefined {
    if(this.closed)return undefined;
    const session=this.options.sessions.sessions.find(s=>s.id===sessionId);const generation=this.generations.get(sessionId);
    return session===undefined || session.state==="closing" || !isCanonicalUuid(session.claudeSessionId) || generation===undefined?undefined:
      {sessionId,claudeSessionId:session.claudeSessionId,generation};
  }

  contextFor(sessionId:string):ComposerSessionContext|undefined {
    const session=this.options.sessions.sessions.find(s=>s.id===sessionId);const generation=this.generations.get(sessionId);
    if(session===undefined || generation===undefined)return undefined;
    const target=this.targetFor(sessionId);
    return {sessionId,generation,claudeSessionId:session.claudeSessionId,rootId:session.rootId,rootPath:session.launchedRootPath,displayName:session.displayName,
      canSubmit:session.state==="running" && target!==undefined && this.options.adapter.isAvailable(target)};
  }

  async prepareLaunch(spec:LaunchSpec,session:ManagedSessionSnapshot):Promise<LaunchSpec> {
    if(this.closed || !this.options.expectsReporter(session.id))return spec;
    const target=this.targetFor(session.id);if(target===undefined)return spec;
    try {
      const capability=await this.options.getCapabilities(spec.executable);
      if(this.closed || !sameTarget(this.targetFor(session.id),target) || capability.completionReporter!=="available")return spec;
      return await this.options.adapter.prepareLaunch(spec,target,capability.version);
    }catch{this.failure("bridge");return spec;}
  }

  async documentReady():Promise<void> {
    if(this.closed)return;
    await this.setFocus(false,false);await this.refresh(true);
    if(this.focusOnReady){this.focusOnReady=false;await this.command("focus");}
  }

  async documentDisposed():Promise<void> {
    if(this.closed)return;
    await this.setFocus(false,false);await this.controller.flush();
  }

  async command(action:ComposerAction|"toggle"|"focus"|"configureShortcuts"):Promise<void> {
    if(this.closed)return;
    if(action==="configureShortcuts"){await this.options.configureShortcuts();return;}
    const documentId=this.options.documentId();
    if(documentId===undefined){if(action==="focus")this.focusOnReady=true;return;}
    const intendedSessionId=this.options.sessions.activeSessionId;
    const intendedGeneration=intendedSessionId===undefined?undefined:this.generations.get(intendedSessionId);
    await this.refresh();
    if(documentId!==this.options.documentId() || intendedSessionId!==this.options.sessions.activeSessionId
      || (intendedSessionId!==undefined && this.generations.get(intendedSessionId)!==intendedGeneration))return;
    const capability=this.controller.capability;if(capability===undefined)return;
    if(action==="toggle"){this.emit({type:"composerAction",documentId,action});return;}
    if(action==="focus"){
      await this.controller.setVisible(true);
      if(capability.status==="available")this.emit({type:"composerFocus",target:capability.target,documentId,destination:"editor"});return;
    }
    if(capability.status==="available" && this.isActive(capability.target))this.emit({type:"composerAction",target:capability.target,documentId,action});
  }

  async handle(value:unknown):Promise<void> {
    if(this.closed || this.options.documentId()===undefined)return;
    const decoded=decodeComposerWebviewMessage(value);if(!decoded.ok)return;const message=decoded.value;
    if("documentId" in message && message.documentId!==this.options.documentId())return;
    const target=message.type==="composerSubmit"?message.request.target:"target" in message?message.target:undefined;
    if(target!==undefined && !(message.type==="composerDraftChanged"?this.isOwned(target):this.isActive(target)))return;
    switch(message.type){
      case "composerLayoutChanged":await this.controller.updateLayout(message.documentId,{splitRatio:message.splitRatio});break;
      case "composerVisibilityChanged":await this.controller.setVisible(message.visible);break;
      case "composerConfigureShortcuts":await this.options.configureShortcuts();break;
      case "composerDraftChanged":await this.controller.updateDraft(message.target,message.draft);break;
      case "composerValidateReferences":{
        if(this.controller.getDraft(message.target)?.revision!==message.revision)return;
        const epoch=++this.referenceEpoch;
        const results=await this.files.validate(message.target,message.paths,()=>epoch===this.referenceEpoch && message.documentId===this.options.documentId()
          && this.controller.getDraft(message.target)?.revision===message.revision);
        if(results && epoch===this.referenceEpoch && this.isActive(message.target) && message.documentId===this.options.documentId()
          && this.controller.getDraft(message.target)?.revision===message.revision){
          this.emit({type:"composerReferenceValidation",documentId:message.documentId,target:message.target,requestId:message.requestId,revision:message.revision,results});
        }break;
      }
      case "composerSubmit":await this.controller.submit(message.request);break;
      case "composerRequestCatalog": {
        let commands:Awaited<ReturnType<ComposerCatalog["list"]>>=[];let status:"ready"|"unavailable"="ready";
        try{commands=await this.catalog.list(message.target,true);}catch{status="unavailable";}
        if(this.isActive(message.target))this.emit({type:"composerCatalog",target:message.target,requestId:message.requestId,commands,status});break;
      }
      case "composerPickFile":{
        const revision=this.controller.getDraft(message.target)?.revision;if(revision===undefined)return;
        const text=await this.files.pick(message.target);
        if(text!==undefined && this.isActive(message.target))this.emit({type:"composerInsertText",target:message.target,requestId:message.requestId,expectedRevision:revision,text});break;
      }
      case "composerHistorySelected":await this.controller.recallHistory(message.target,message.index,message.mode,message.expectedRevision);break;
      case "composerFavoriteChanged":await this.options.store.setFavorite(message.invocation,message.enabled);await this.refresh(true);break;
      case "composerFocusChanged":await this.setFocus(message.focused,message.pickerFocused);break;
      case "composerRestoreDraft":{
        if(this.restoring.has(message.claudeSessionId) || this.forgetting.has(message.claudeSessionId) || this.options.operationPending(message.claudeSessionId))return;
        this.restoring.add(message.claudeSessionId);
        try{await this.controller.restoreDraft(message.claudeSessionId,message.expectedRevision);await this.refresh(true);}
        catch(error){this.failure("restore");throw error;}finally{this.restoring.delete(message.claudeSessionId);}break;
      }
      // Recovery paging is owned by the provider's eligibility/view snapshot.
      case "composerRequestRecovery":break;
    }
  }

  async forget(uuid:string):Promise<void> {
    if(this.closed || !isCanonicalUuid(uuid) || this.restoring.has(uuid) || this.forgetting.has(uuid) || this.options.operationPending(uuid)
      || this.options.sessions.sessions.some(s=>s.claudeSessionId===uuid)
      || (this.options.store.getRecoverable(uuid)===undefined && !this.options.ownsResumable(uuid)))return;
    this.forgetting.add(uuid);
    try{
      await this.options.forgetResumable(uuid);
      if(this.options.ownsResumable(uuid) || this.options.operationPending(uuid) || this.options.sessions.sessions.some(s=>s.claudeSessionId===uuid))return;
      await this.controller.forget(uuid);
    }finally{this.forgetting.delete(uuid);}
  }

  close():Promise<void> {
    this.closeOperation ??= (async()=>{
      this.closed=true;this.subscription.dispose();this.controller.dispose();await this.controller.flush();await this.options.adapter.close();
      await this.setFocus(false,false);
    })();return this.closeOperation;
  }
  dispose():void {void this.close().catch(()=>this.failure("storage"));}

  private isOwned(target:ComposerTarget):boolean {return !this.closed && sameTarget(this.targetFor(target.sessionId),target);}
  private isActive(target:ComposerTarget):boolean {return this.isOwned(target) && this.options.sessions.activeSessionId===target.sessionId;}
  private setFocus(focused:boolean,pickerFocused:boolean):Promise<void> {
    const operation=this.focusOperation.catch(()=>undefined).then(()=>this.options.setFocusContext(focused,pickerFocused)).then(()=>undefined);
    this.focusOperation=operation;return operation;
  }
  private synchronize():void {
    if(this.closed)return;
    const sessions=this.options.sessions.sessions;
    for(const [id,old] of this.known){
      const current=sessions.find(s=>s.id===id);
      if(current===undefined || current.claudeSessionId!==old.claudeSessionId || current.launchedAt!==old.launchedAt){
        const generation=this.generations.get(id);
        if(isCanonicalUuid(old.claudeSessionId) && generation!==undefined){
          const target={sessionId:id,claudeSessionId:old.claudeSessionId,generation};this.catalog.invalidate(target);
          void this.controller.close(target).catch(()=>this.failure("storage"));
        }
        this.generations.delete(id);this.known.delete(id);
      }
    }
    for(const session of sessions){if(!this.generations.has(session.id))this.generations.set(session.id,randomUUID());this.known.set(session.id,session);}
    void this.refresh().catch(()=>this.failure("view"));
  }
  private refresh(force=false):Promise<void> {
    const id=this.options.sessions.activeSessionId;
    const closing=this.options.sessions.sessions.find(session=>session.id===id)?.state==="closing";
    const context=id===undefined || closing?undefined:this.contextFor(id);const key=JSON.stringify(context);
    const focusedSessionKey=context===undefined?undefined:context.sessionId+":"+context.generation;
    if(focusedSessionKey!==this.focusedSessionKey){
      this.focusedSessionKey=focusedSessionKey;void this.setFocus(false,false).catch(()=>this.failure("view"));
    }
    if(!force && key===this.selectionKey)return this.selectionOperation;
    this.selectionKey=key;
    this.selectionOperation=(context===undefined?this.controller.clearSelection():this.controller.select(context.sessionId,context.generation).then(()=>undefined));
    return this.selectionOperation;
  }
  private emit(message:ComposerHostMessage):void {if(!this.closed && this.options.documentId()!==undefined){try{this.options.emit(message);}catch{this.failure("view");}}}
  private failure(reason:Parameters<NonNullable<ComposerRuntimeOptions["onFailure"]>>[0]):void {try{this.options.onFailure?.(reason);}catch{/* Diagnostics cannot change delivery. */}}
}
