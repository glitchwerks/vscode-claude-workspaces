import { isCanonicalUuid } from "../sessions/resumableSessionValidation";
import {
  isDraftState, SPLIT_RATIO_MIN, SPLIT_RATIO_MAX, RECENT_MAX_ITEMS, RECENT_MAX_UTF8_BYTES,
  type ComposerCapability, type ComposerCommand, type ComposerLayout, type ComposerTarget,
  type DraftState, type RecoveryCursor, type RecoveryPage, type SavedComposerSession,
  type SubmitRequest, type SubmitResult
} from "../composer/composerTypes";
import type { DecodeResult } from "./protocol";
import { validReferencePaths, type ComposerFileValidation } from "../composer/composerReferences";

export type ComposerWebviewMessage =
  | {readonly type:"composerVisibilityChanged"; readonly documentId:string; readonly visible:boolean}
  | {readonly type:"composerConfigureShortcuts"; readonly documentId:string}
  | {readonly type:"composerValidateReferences"; readonly documentId:string; readonly target:ComposerTarget; readonly requestId:string; readonly revision:number; readonly paths:readonly string[]}
  | {readonly type:"composerLayoutChanged"; readonly documentId:string; readonly splitRatio:number}
  | {readonly type:"composerRequestRecovery"; readonly documentId:string; readonly requestId:string; readonly cursor?:RecoveryCursor}
  | {readonly type:"composerRestoreDraft"; readonly documentId:string; readonly claudeSessionId:string; readonly expectedRevision:number}
  | {readonly type:"composerDraftChanged"; readonly target:ComposerTarget; readonly draft:DraftState}
  | {readonly type:"composerSubmit"; readonly request:SubmitRequest}
  | {readonly type:"composerRequestCatalog" | "composerPickFile"; readonly target:ComposerTarget; readonly requestId:string}
  | {readonly type:"composerHistorySelected"; readonly target:ComposerTarget; readonly index:number; readonly mode:"replace"|"append"; readonly expectedRevision:number}
  | {readonly type:"composerFavoriteChanged"; readonly target:ComposerTarget; readonly invocation:string; readonly enabled:boolean}
  | {readonly type:"composerFocusChanged"; readonly target?:ComposerTarget; readonly documentId:string; readonly focused:boolean; readonly pickerFocused:boolean;readonly viewFocused:boolean};

type Hydration = Readonly<{visible:boolean; layout:ComposerLayout; favorites:readonly string[]}> & (
  | Readonly<{capability:Extract<ComposerCapability,{status:"available"}>; session:SavedComposerSession; canSubmit:boolean}>
  | Readonly<{capability:Extract<ComposerCapability,{status:"unavailable"}>; canSubmit:false}>
);
export type ComposerAction = "submit"|"pickCommand"|"find"|"replace"|"undo"|"redo";
export type ComposerHostMessage =
  | {readonly type:"composerReferenceValidation"; readonly documentId:string; readonly target:ComposerTarget; readonly requestId:string; readonly revision:number; readonly results:readonly ComposerFileValidation[]}
  | {readonly type:"composerReset"; readonly documentId:string}
  | ({readonly type:"composerHydrate"} & Hydration)
  | {readonly type:"composerLayoutStatus"; readonly documentId:string; readonly layout:ComposerLayout; readonly status:"saved"|"error"}
  | {readonly type:"composerRecoveryInvalidated"; readonly documentId:string; readonly revision:number}
  | {readonly type:"composerRecoveryPage"; readonly documentId:string; readonly requestId:string; readonly page:RecoveryPage; readonly actions:readonly ("resume"|"restoreDraft")[]}
  | {readonly type:"composerDraftStatus"; readonly target:ComposerTarget; readonly revision:number; readonly status:"saving"|"saved"|"unsaved"|"error"|"too-large"}
  | {readonly type:"composerSubmitResult"; readonly target:ComposerTarget; readonly result:SubmitResult}
  | {readonly type:"composerCatalog"; readonly target:ComposerTarget; readonly requestId:string; readonly commands:readonly ComposerCommand[]; readonly status:"ready"|"unavailable"}
  | {readonly type:"composerInsertText"; readonly target:ComposerTarget; readonly requestId:string; readonly expectedRevision:number; readonly text:string}
  | {readonly type:"composerFocus"; readonly target:ComposerTarget; readonly documentId:string; readonly destination:"editor"|"terminal"}
  | {readonly type:"composerAction"; readonly documentId:string; readonly action:"toggle"; readonly target?:ComposerTarget}
  | {readonly type:"composerAction"; readonly documentId:string; readonly action:ComposerAction; readonly target:ComposerTarget};

type RecordValue = Record<string, unknown>;
export function composerRecord(value:unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function composerExact(value:RecordValue, required:readonly string[], optional:readonly string[]=[]):boolean {
  return required.every(k=>Object.hasOwn(value,k)) && Object.keys(value).every(k=>required.includes(k)||optional.includes(k));
}
const integer = (value:unknown):value is number => typeof value==="number" && Number.isSafeInteger(value) && value>=0;
const text = (value:unknown):value is string => typeof value==="string" && value.length>0 && value.length<=4096;
export const validComposerInvocation = (value:unknown):value is string => typeof value==="string" && /^\/\S{1,255}$/u.test(value)
  && ![...value].some(character=>character.charCodeAt(0)<32 || character.charCodeAt(0)===127);
export function validComposerDraft(value:unknown):value is DraftState {
  return isDraftState(value) && composerRecord(value) && composerExact(value,["revision","text","selection"])
    && composerRecord(value.selection) && composerExact(value.selection,["anchor","head"]);
}
export function validComposerTarget(value:unknown):value is ComposerTarget {
  return composerRecord(value) && composerExact(value,["sessionId","claudeSessionId","generation"])
    && text(value.sessionId) && value.sessionId.length<=256 && isCanonicalUuid(value.claudeSessionId) && isCanonicalUuid(value.generation);
}
export function validComposerLayout(value:unknown):value is ComposerLayout {
  return composerRecord(value) && composerExact(value,["splitRatio"]) && typeof value.splitRatio==="number"
    && Number.isFinite(value.splitRatio) && value.splitRatio>=SPLIT_RATIO_MIN && value.splitRatio<=SPLIT_RATIO_MAX;
}
function cursor(value:unknown):value is RecoveryCursor {
  return composerRecord(value) && composerExact(value,["revision","afterUuid"]) && integer(value.revision) && isCanonicalUuid(value.afterUuid);
}
function saved(value:unknown):value is SavedComposerSession {
  return composerRecord(value) && composerExact(value,["claudeSessionId","rootId","rootPath","displayName","draft","recent"])
    && isCanonicalUuid(value.claudeSessionId) && text(value.rootId) && text(value.rootPath) && text(value.displayName)
    && validComposerDraft(value.draft) && Array.isArray(value.recent) && value.recent.length<=RECENT_MAX_ITEMS
    && value.recent.every(v=>typeof v==="string")
    && value.recent.reduce((size:number,v:string)=>size+new TextEncoder().encode(v).length,0)<=RECENT_MAX_UTF8_BYTES;
}
function recovery(value:unknown):value is RecoveryPage {
  return composerRecord(value) && composerExact(value,["revision","rows"],["nextCursor"])
    && integer(value.revision) && Array.isArray(value.rows) && value.rows.length<=100 && value.rows.every(row=>
      composerRecord(row) && composerExact(row,["claudeSessionId","rootId","rootPath","displayName","draftRevision"],["storageStatus"])
      && isCanonicalUuid(row.claudeSessionId) && text(row.rootId) && text(row.rootPath) && text(row.displayName)
      && integer(row.draftRevision) && (!Object.hasOwn(row,"storageStatus") || row.storageStatus==="error"))
    && (!Object.hasOwn(value,"nextCursor") || (cursor(value.nextCursor) && value.nextCursor.revision===value.revision));
}
export function validComposerCommand(value:unknown):value is ComposerCommand {
  return composerRecord(value) && composerExact(value,["invocation","description","source"],["plugin"])
    && validComposerInvocation(value.invocation) && typeof value.description==="string" && value.description.length<=4096
    && text(value.source) && (!Object.hasOwn(value,"plugin") || text(value.plugin));
}
export function validComposerSubmit(value:unknown):value is SubmitRequest {
  return composerRecord(value) && composerExact(value,["target","submissionId","draft"])
    && validComposerTarget(value.target) && isCanonicalUuid(value.submissionId) && validComposerDraft(value.draft);
}
function result(value:unknown):value is SubmitResult {
  if (!composerRecord(value) || !isCanonicalUuid(value.submissionId)) return false;
  switch(value.status) {
    case "accepted":return composerExact(value,["status","submissionId","revision"]) && integer(value.revision);
    case "rejected":return composerExact(value,["status","submissionId","reason"]) && ["unavailable","dialog","terminal-draft","invalid"].includes(String(value.reason));
    case "unconfirmed":return composerExact(value,["status","submissionId"]);
    default:return false;
  }
}
function decode<T>(value:unknown, valid:(v:RecordValue)=>boolean):DecodeResult<T> {
  return composerRecord(value) && valid(value) ? {ok:true,value:value as T} : {ok:false,error:"Invalid composer message."};
}

/** Browser-safe, exact-key codec: no Node APIs or executable/path authority. */
export function decodeComposerWebviewMessage(value:unknown):DecodeResult<ComposerWebviewMessage> {
  return decode(value,v=> {
    const target=()=>validComposerTarget(v.target);
    switch(v.type) {
      case "composerVisibilityChanged":return composerExact(v,["type","documentId","visible"]) && isCanonicalUuid(v.documentId) && typeof v.visible==="boolean";
      case "composerConfigureShortcuts":return composerExact(v,["type","documentId"]) && isCanonicalUuid(v.documentId);
      case "composerValidateReferences":return composerExact(v,["type","documentId","target","requestId","revision","paths"]) && isCanonicalUuid(v.documentId) && target() && isCanonicalUuid(v.requestId) && integer(v.revision) && validReferencePaths(v.paths);
      case "composerLayoutChanged":return composerExact(v,["type","documentId","splitRatio"]) && isCanonicalUuid(v.documentId) && validComposerLayout({splitRatio:v.splitRatio});
      case "composerRequestRecovery":return composerExact(v,["type","documentId","requestId"],["cursor"]) && isCanonicalUuid(v.documentId) && isCanonicalUuid(v.requestId) && (!Object.hasOwn(v,"cursor") || cursor(v.cursor));
      case "composerRestoreDraft":return composerExact(v,["type","documentId","claudeSessionId","expectedRevision"]) && isCanonicalUuid(v.documentId) && isCanonicalUuid(v.claudeSessionId) && integer(v.expectedRevision);
      case "composerDraftChanged":return composerExact(v,["type","target","draft"]) && target() && validComposerDraft(v.draft);
      case "composerSubmit":return composerExact(v,["type","request"]) && validComposerSubmit(v.request);
      case "composerRequestCatalog":case "composerPickFile":return composerExact(v,["type","target","requestId"]) && target() && isCanonicalUuid(v.requestId);
      case "composerHistorySelected":return composerExact(v,["type","target","index","mode","expectedRevision"]) && target() && integer(v.index) && v.index<RECENT_MAX_ITEMS && integer(v.expectedRevision) && (v.mode==="replace" || v.mode==="append");
      case "composerFavoriteChanged":return composerExact(v,["type","target","invocation","enabled"]) && target() && validComposerInvocation(v.invocation) && typeof v.enabled==="boolean";
      case "composerFocusChanged":return composerExact(v,["type","documentId","focused","pickerFocused","viewFocused"],["target"])
        && (Object.hasOwn(v,"target")?target():v.focused===false && v.pickerFocused===false)
        && isCanonicalUuid(v.documentId) && typeof v.focused==="boolean" && typeof v.pickerFocused==="boolean" && typeof v.viewFocused==="boolean";
      default:return false;
    }
  });
}

export function decodeComposerHostMessage(value:unknown):DecodeResult<ComposerHostMessage> {
  return decode(value,v=> {
    const target=()=>validComposerTarget(v.target);
    const document=()=>isCanonicalUuid(v.documentId);
    switch(v.type) {
      case "composerReferenceValidation":return composerExact(v,["type","documentId","target","requestId","revision","results"]) && document() && target() && isCanonicalUuid(v.requestId) && integer(v.revision)
        && Array.isArray(v.results) && v.results.length<=100 && v.results.every(item=>composerRecord(item) && composerExact(item,["value","status"]) && validReferencePaths([item.value]) && ["valid","missing","unavailable"].includes(String(item.status)));
      case "composerReset":return composerExact(v,["type","documentId"]) && document();
      case "composerHydrate": {
        if (!composerRecord(v.capability) || typeof v.visible!=="boolean" || !validComposerLayout(v.layout)
          || !Array.isArray(v.favorites) || !v.favorites.every(validComposerInvocation)) return false;
        const c=v.capability;
        if(c.status==="available") return composerExact(v,["type","capability","session","visible","layout","favorites","canSubmit"])
          && composerExact(c,["status","target"]) && validComposerTarget(c.target) && saved(v.session)
          && v.session.claudeSessionId===c.target.claudeSessionId && typeof v.canSubmit==="boolean";
        return composerExact(v,["type","capability","visible","layout","favorites","canSubmit"])
          && composerExact(c,["status","sessionId","generation","reason"]) && c.status==="unavailable" && text(c.sessionId)
          && isCanonicalUuid(c.generation) && c.reason==="unsupported-identity" && v.canSubmit===false;
      }
      case "composerLayoutStatus":return composerExact(v,["type","documentId","layout","status"]) && document() && validComposerLayout(v.layout) && (v.status==="saved"||v.status==="error");
      case "composerRecoveryInvalidated":return composerExact(v,["type","documentId","revision"]) && document() && integer(v.revision);
      case "composerRecoveryPage":return composerExact(v,["type","documentId","requestId","page","actions"]) && document() && isCanonicalUuid(v.requestId) && recovery(v.page) && Array.isArray(v.actions) && v.actions.length===v.page.rows.length && v.actions.every(a=>a==="resume"||a==="restoreDraft");
      case "composerDraftStatus":return composerExact(v,["type","target","revision","status"]) && target() && integer(v.revision) && ["saving","saved","unsaved","error","too-large"].includes(String(v.status));
      case "composerSubmitResult":return composerExact(v,["type","target","result"]) && target() && result(v.result);
      case "composerCatalog":return composerExact(v,["type","target","requestId","commands","status"]) && target() && isCanonicalUuid(v.requestId) && Array.isArray(v.commands) && v.commands.length<=1000 && v.commands.every(validComposerCommand) && (v.status==="ready"||v.status==="unavailable");
      case "composerInsertText":return composerExact(v,["type","target","requestId","expectedRevision","text"]) && target() && isCanonicalUuid(v.requestId) && integer(v.expectedRevision) && typeof v.text==="string" && v.text.length<=4096;
      case "composerFocus":return composerExact(v,["type","target","documentId","destination"]) && target() && document() && (v.destination==="editor"||v.destination==="terminal");
      case "composerAction":return document() && (v.action==="toggle"
        ? composerExact(v,["type","documentId","action"],["target"]) && (!Object.hasOwn(v,"target") || target())
        : composerExact(v,["type","documentId","action","target"]) && target() && ["submit","pickCommand","find","replace","undo","redo"].includes(String(v.action)));
      default:return false;
    }
  });
}
