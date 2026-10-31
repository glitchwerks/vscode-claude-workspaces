import {
  COMPOSER_SEND_MIN_VERSION, SPLIT_RATIO_MIN, SPLIT_RATIO_MAX,
  type ComposerTarget, type DraftState
} from "../../../composer/composerTypes";
import type { ComposerHostMessage, ComposerWebviewMessage } from "../../composerProtocol";
import { createComposerEditor, type ComposerEditor, type ComposerEditorOptions } from "./editor";

type Hydration=Extract<ComposerHostMessage,{type:"composerHydrate"}>;
export interface ComposerViewOptions {
  readonly parent:HTMLElement;
  readonly documentId:string;
  readonly postMessage:(message:ComposerWebviewMessage)=>void;
  readonly focusTerminal:()=>void;
  readonly createEditor?:(options:ComposerEditorOptions)=>ComposerEditor;
  readonly newRequestId?:()=>string;
}
export interface ComposerView {
  hydrate(message:Hydration):void;
  handleHostMessage(message:ComposerHostMessage):void;
  focusEditor():void;
  setVisible(visible:boolean):void;
  dispose():void;
}
const sameTarget=(a:ComposerTarget|undefined,b:ComposerTarget)=>a?.sessionId===b.sessionId && a.claudeSessionId===b.claudeSessionId && a.generation===b.generation;
const sameDraft=(a:DraftState,b:DraftState)=>a.text===b.text && a.selection.anchor===b.selection.anchor && a.selection.head===b.selection.head;

/** One stable pane below the terminal; status/output never takes focus. */
export function createComposerView(options:ComposerViewOptions):ComposerView {
  const document=options.parent.ownerDocument;
  const root=document.createElement("section");root.className="composer-pane";root.hidden=true;root.setAttribute("aria-label","Prompt composer");
  root.innerHTML=`<header class="composer-toolbar"><strong>Prompt</strong><div class="composer-tools">
    <button type="button" data-composer="commands">Skills / commands</button>
    <button type="button" data-composer="file">@ File</button>
    <button type="button" data-composer="find">Find</button>
    <button type="button" data-composer="shortcuts" title="Customize composer keyboard shortcuts">Shortcuts</button>
    <button type="button" data-composer="expand" aria-pressed="false" title="Expand composer">Expand</button>
    <button type="button" data-composer="hide" title="Hide composer">Hide</button>
  </div></header><p class="composer-notice" role="status"></p>
  <div class="composer-editor"></div><div class="composer-picker" hidden></div>
  <footer class="composer-footer"><span class="composer-save-status" role="status">Draft</span>
    <span class="composer-delivery-status" role="status"></span><button type="button" data-composer="send" disabled>Send</button></footer>`;
  const divider=document.createElement("div");divider.className="composer-divider";divider.hidden=true;divider.tabIndex=0;
  divider.setAttribute("role","separator");divider.setAttribute("aria-label","Resize prompt composer");divider.setAttribute("aria-orientation","horizontal");
  divider.setAttribute("aria-valuemin",String(SPLIT_RATIO_MIN*100));divider.setAttribute("aria-valuemax",String(SPLIT_RATIO_MAX*100));
  options.parent.append(divider,root);
  const editorParent=root.querySelector<HTMLElement>(".composer-editor")!;
  const saveStatus=root.querySelector<HTMLElement>(".composer-save-status")!;
  const delivery=root.querySelector<HTMLElement>(".composer-delivery-status")!;
  const notice=root.querySelector<HTMLElement>(".composer-notice")!;
  const send=root.querySelector<HTMLButtonElement>('[data-composer="send"]')!;
  const empty:DraftState={revision:0,text:"",selection:{anchor:0,head:0}};
  let target:ComposerTarget|undefined;
  let canSubmit=false;
  let visible=false;
  let expanded=false;
  let normalRatio=1/3;
  let pendingSubmission:string|undefined;
  let disposed=false;
  let dragging:number|undefined;
  const requestId=()=>options.newRequestId?.() ?? document.defaultView!.crypto.randomUUID();
  const post=(message:ComposerWebviewMessage)=>{if(!disposed)options.postMessage(message);};
  const editor=(options.createEditor ?? createComposerEditor)({parent:editorParent,initialDraft:empty,onChange:draft=>{
    if(target===undefined)return;
    saveStatus.textContent="Saving…";post({type:"composerDraftChanged",target,draft});updateSend();
  }});
  const updateSend=()=>{send.disabled=!canSubmit || target===undefined || pendingSubmission!==undefined || !editor.getDraft().text.trim();};
  function applySplit():void {
    options.parent.style.setProperty("--composer-ratio",String(normalRatio));
    options.parent.style.setProperty("--composer-height",expanded?"90%":`${normalRatio*100}%`);
    options.parent.classList.toggle("composer-visible",visible);
    options.parent.classList.toggle("composer-expanded",visible && expanded);
    divider.setAttribute("aria-valuenow",String(Math.round(normalRatio*100)));
    root.querySelector<HTMLButtonElement>('[data-composer="expand"]')!.setAttribute("aria-pressed",String(expanded));
  }
  function setVisible(value:boolean):void {
    const hadFocus=root.contains(document.activeElement);
    visible=value;root.hidden=!value;divider.hidden=!value;applySplit();
    if(!value && hadFocus)options.focusTerminal();
  }
  function resize(ratio:number):void {
    if(!Number.isFinite(ratio))return;
    normalRatio=Math.round(Math.max(SPLIT_RATIO_MIN,Math.min(SPLIT_RATIO_MAX,ratio))*100)/100;
    expanded=false;applySplit();post({type:"composerLayoutChanged",documentId:options.documentId,splitRatio:normalRatio});
  }
  function submit():void {
    if(target===undefined || !canSubmit || pendingSubmission!==undefined || editor.isComposing() || !editor.getDraft().text.trim())return;
    pendingSubmission=requestId();delivery.textContent="Sending…";updateSend();
    post({type:"composerSubmit",request:{target,submissionId:pendingSubmission,draft:editor.getDraft()}});
  }
  function hydrate(message:Hydration):void {
    normalRatio=message.layout.splitRatio;canSubmit=message.canSubmit;
    if(message.capability.status==="available" && "session" in message){
      const next=message.capability.target;const same=sameTarget(target,next);const current=editor.getDraft();target=next;
      if(!same){pendingSubmission=undefined;delivery.textContent="";editor.setDraft(message.session.draft,true);saveStatus.textContent="Draft";}
      else if(message.session.draft.revision>current.revision){editor.setDraft(message.session.draft);}
      else if(message.session.draft.revision===current.revision && !sameDraft(current,message.session.draft)){
        // Native acceptance may reserve a revision before a browser edit reaches the host.
        const rebased={...current,revision:current.revision+1};editor.setDraft(rebased);saveStatus.textContent="Saving…";
        post({type:"composerDraftChanged",target,draft:rebased});
      }
      editorParent.hidden=false;notice.textContent=canSubmit?"":`Sending requires Claude CLI ${COMPOSER_SEND_MIN_VERSION} or later. Your draft can still be edited and saved.`;
    }else{
      target=undefined;pendingSubmission=undefined;canSubmit=false;editorParent.hidden=true;
      notice.textContent="Use the terminal until this session has a Claude conversation identity. Draft saving and sending are unavailable.";
      saveStatus.textContent="Draft unavailable";delivery.textContent="";
    }
    setVisible(message.visible);updateSend();
  }
  const onClick=(event:Event)=>{
    const element=event.target as Element|null;const action=element?.closest<HTMLButtonElement>("[data-composer]")?.dataset.composer;
    switch(action){
      case "send":submit();break;
      case "hide":setVisible(false);post({type:"composerVisibilityChanged",documentId:options.documentId,visible:false});break;
      case "expand":expanded=!expanded;applySplit();break;
      case "find":editor.find();break;
      case "commands":if(target)post({type:"composerRequestCatalog",target,requestId:requestId()});break;
      case "file":if(target)post({type:"composerPickFile",target,requestId:requestId()});break;
      case "shortcuts":post({type:"composerConfigureShortcuts",documentId:options.documentId});break;
    }
  };
  const reportFocus=()=>{
    if(target===undefined)return;
    const focused=root.contains(document.activeElement);const pickerFocused=focused && !!document.activeElement?.closest(".composer-picker");
    post({type:"composerFocusChanged",target,documentId:options.documentId,focused,pickerFocused});
  };
  const onFocusOut=()=>{queueMicrotask(reportFocus);};
  const onDividerKey=(event:KeyboardEvent)=>{
    const delta=event.key==="ArrowUp"?0.05:event.key==="ArrowDown"?-0.05:0;
    if(delta!==0){event.preventDefault();resize(normalRatio+delta);}
    else if(event.key==="Home"||event.key==="End"){event.preventDefault();resize(event.key==="Home"?SPLIT_RATIO_MIN:SPLIT_RATIO_MAX);}
  };
  const onPointerDown=(event:PointerEvent)=>{dragging=event.pointerId;divider.setPointerCapture?.(event.pointerId);event.preventDefault();};
  const onPointerMove=(event:PointerEvent)=>{
    if(dragging!==event.pointerId)return;
    const bounds=options.parent.getBoundingClientRect();if(bounds.height>0)resize((bounds.bottom-event.clientY)/bounds.height);
  };
  const onPointerUp=()=>{dragging=undefined;};
  root.addEventListener("click",onClick);root.addEventListener("focusin",reportFocus);root.addEventListener("focusout",onFocusOut);
  divider.addEventListener("keydown",onDividerKey);divider.addEventListener("pointerdown",onPointerDown);divider.addEventListener("pointermove",onPointerMove);
  divider.addEventListener("pointerup",onPointerUp);divider.addEventListener("pointercancel",onPointerUp);
  return {
    hydrate,setVisible,
    focusEditor(){if(target!==undefined){setVisible(true);post({type:"composerVisibilityChanged",documentId:options.documentId,visible:true});editor.focus();}},
    handleHostMessage(message){
      if(disposed)return;
      if(message.type==="composerHydrate"){hydrate(message);return;}
      if("documentId" in message && message.documentId!==options.documentId)return;
      if(message.type==="composerAction" && message.action==="toggle"){
        setVisible(!visible);post({type:"composerVisibilityChanged",documentId:options.documentId,visible});if(visible && target)editor.focus();return;
      }
      if(message.type==="composerLayoutStatus"){
        normalRatio=message.layout.splitRatio;applySplit();if(message.status==="error")delivery.textContent="Split size not saved. Try resizing again.";return;
      }
      if(!("target" in message) || message.target===undefined || !sameTarget(target,message.target))return;
      switch(message.type){
        case "composerDraftStatus":
          if(message.revision!==editor.getDraft().revision)return;
          saveStatus.textContent={saved:"Saved",saving:"Saving…",unsaved:"Draft",error:"Not saved — retry by editing", "too-large":"Not saved — draft exceeds 1 MiB"}[message.status];break;
        case "composerSubmitResult":
          if(pendingSubmission!==undefined && pendingSubmission!==message.result.submissionId)return;
          pendingSubmission=undefined;delivery.textContent=message.result.status==="accepted"?"Accepted by Claude":message.result.status==="unconfirmed"?"Delivery not confirmed. Check Claude before sending again.":message.result.reason==="dialog"?"Claude is showing a dialog. Use the terminal to respond.":message.result.reason==="terminal-draft"?"The terminal already has input. Review it before sending again.":"Not sent. Your draft is retained.";
          updateSend();break;
        case "composerFocus":if(message.destination==="editor"){setVisible(true);editor.focus();}else options.focusTerminal();break;
        case "composerAction":switch(message.action){
          case "submit":submit();break;
          case "pickCommand":if(target)post({type:"composerRequestCatalog",target,requestId:requestId()});break;
          case "find":editor.find();break;case "replace":editor.replace();break;case "undo":editor.undo();break;case "redo":editor.redo();break;
        }break;
      }
    },
    dispose(){disposed=true;editor.dispose();root.remove();divider.remove();options.parent.classList.remove("composer-visible","composer-expanded");}
  };
}
