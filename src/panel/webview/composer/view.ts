import {
  COMPOSER_SEND_MIN_VERSION, SPLIT_RATIO_MIN, SPLIT_RATIO_MAX, RECENT_MAX_UTF8_BYTES,
  type ComposerTarget, type DraftState
} from "../../../composer/composerTypes";
import type { ComposerCommand } from "../../../composer/composerTypes";
import { insertInvocation } from "../../../composer/composerCatalog";
import type { ComposerHostMessage, ComposerWebviewMessage } from "../../composerProtocol";
import { createComposerEditor, type ComposerEditor, type ComposerEditorOptions } from "./editor";
import { renderComposerMarkdown, isComposerPreviewLink } from "./markdownPreview";
import { parseComposerReferences } from "./references";

type Hydration=Extract<ComposerHostMessage,{type:"composerHydrate"}>;
export interface ComposerViewOptions {
  readonly parent:HTMLElement;
  readonly documentId:string;
  readonly postMessage:(message:ComposerWebviewMessage)=>void;
  readonly focusTerminal:()=>void;
  readonly createEditor?:(options:ComposerEditorOptions)=>ComposerEditor;
  readonly newRequestId?:()=>string;
  readonly openExternal?:(target:ComposerTarget,uri:string)=>void;
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
    <button type="button" data-composer="recent">Recent</button>
    <button type="button" data-composer="preview" aria-pressed="false">Preview</button>
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
  const show=document.createElement("button");show.type="button";show.className="composer-show";show.dataset.composer="show";
  show.textContent="Show prompt editor";show.hidden=true;options.parent.append(show);
  const editorParent=root.querySelector<HTMLElement>(".composer-editor")!;
  const saveStatus=root.querySelector<HTMLElement>(".composer-save-status")!;
  const delivery=root.querySelector<HTMLElement>(".composer-delivery-status")!;
  const notice=root.querySelector<HTMLElement>(".composer-notice")!;
  const picker=root.querySelector<HTMLElement>(".composer-picker")!;picker.classList.add("composer-popup");
  picker.innerHTML='<div class="composer-picker-tools"><button type="button" data-composer="refreshCatalog">Refresh</button><button type="button" data-composer="closePicker">Close</button></div><input type="search" aria-label="Search skills and commands" placeholder="Search skills and commands"><p class="composer-picker-status" role="status"></p><ul class="composer-command-list"></ul>';
  const pickerSearch=picker.querySelector<HTMLInputElement>("input")!;
  const pickerStatus=picker.querySelector<HTMLElement>(".composer-picker-status")!;
  const commandList=picker.querySelector<HTMLUListElement>("ul")!;
  const preview=document.createElement("article");preview.className="composer-preview";preview.hidden=true;preview.setAttribute("aria-label","Prompt preview");
  editorParent.after(preview);
  const historyPanel=document.createElement("section");historyPanel.className="composer-history composer-popup";historyPanel.hidden=true;historyPanel.setAttribute("aria-label","Recent composer prompts");root.append(historyPanel);
  const send=root.querySelector<HTMLButtonElement>('[data-composer="send"]')!;
  const empty:DraftState={revision:0,text:"",selection:{anchor:0,head:0}};
  let target:ComposerTarget|undefined;
  let canSubmit=false;
  let visible=false;
  let hydrated=false;
  let expanded=false;
  let normalRatio=1/3;
  let pendingSubmission:string|undefined;
  let pendingPromptBytes=0;
  let uncertainText:string|undefined;
  let disposed=false;
  let dragging:number|undefined;
  let favorites:readonly string[]=[];
  let commands:readonly ComposerCommand[]=[];
  let catalogRequestId:string|undefined;
  let catalogReady=false;
  let catalogRequested=false;
  let referenceRequestId:string|undefined;
  let referenceTimer:number|undefined;
  let fileRequestId:string|undefined;
  let recent:readonly string[]=[];
  let previewing=false;
  let positionDetail:(()=>void)|undefined;
  const requestId=()=>options.newRequestId?.() ?? document.defaultView!.crypto.randomUUID();
  const post=(message:ComposerWebviewMessage)=>{if(!disposed)options.postMessage(message);};
  const editor=(options.createEditor ?? createComposerEditor)({parent:editorParent,initialDraft:empty,onChange:draft=>{
    if(target===undefined)return;
    if(draft.text!==uncertainText)uncertainText=undefined;
    saveStatus.textContent="Saving…";post({type:"composerDraftChanged",target,draft});updateSend();scheduleReferences();if(previewing)preview.innerHTML=renderComposerMarkdown(draft.text);
  }});
  function requestCatalog(refresh=false):void {
    if(!target || !canSubmit || (!refresh && catalogRequested))return;
    catalogRequested=true;
    catalogRequestId=requestId();pickerStatus.textContent="Loading skills and commands…";
    post({type:"composerRequestCatalog",target,requestId:catalogRequestId});
  }
  function scheduleReferences():void {
    document.defaultView!.clearTimeout(referenceTimer);referenceRequestId=undefined;
    editor.setReferenceContext({commands:catalogReady?commands:undefined,files:[]});
    if(!target)return;
    const draft=editor.getDraft();const paths=[...new Set(parseComposerReferences(draft.text).filter(r=>r.kind==="file" && r.complete).map(r=>r.value))];
    if(!paths.length)return;
    referenceTimer=document.defaultView!.setTimeout(()=>{
      if(disposed || !target || editor.getDraft().revision!==draft.revision)return;
      referenceRequestId=requestId();post({type:"composerValidateReferences",documentId:options.documentId,target,requestId:referenceRequestId,revision:draft.revision,paths});
    },400);
  }
  const updateSend=()=>{send.disabled=!canSubmit || target===undefined || pendingSubmission!==undefined || !editor.getDraft().text.trim();};
  function applySplit():void {
    options.parent.style.setProperty("--composer-ratio",String(normalRatio));
    options.parent.style.setProperty("--composer-height",expanded?"90%":`${normalRatio*100}%`);
    options.parent.classList.toggle("composer-visible",visible);
    options.parent.classList.toggle("composer-expanded",visible && expanded);
    divider.setAttribute("aria-valuenow",String(Math.round(normalRatio*100)));
    const expand=root.querySelector<HTMLButtonElement>('[data-composer="expand"]')!;
    expand.setAttribute("aria-pressed",String(expanded));expand.textContent=expanded?"Collapse":"Expand";
    expand.title=expanded?"Collapse composer":"Expand composer";
  }
  function setVisible(value:boolean):void {
    const hadFocus=root.contains(document.activeElement);
    visible=value;root.hidden=!value;divider.hidden=!value;show.hidden=value || !hydrated;applySplit();
    if(!value && hadFocus)options.focusTerminal();
    if(!value){picker.hidden=true;historyPanel.hidden=true;}
  }
  function resize(ratio:number):void {
    if(!Number.isFinite(ratio))return;
    normalRatio=Math.round(Math.max(SPLIT_RATIO_MIN,Math.min(SPLIT_RATIO_MAX,ratio))*100)/100;
    expanded=false;applySplit();post({type:"composerLayoutChanged",documentId:options.documentId,splitRatio:normalRatio});
  }
  function submit(explicitRetry=false):void {
    if(target===undefined || !canSubmit || pendingSubmission!==undefined || editor.isComposing() || editor.isCompleting() || !editor.getDraft().text.trim()
      || (uncertainText!==undefined && !explicitRetry))return;
    uncertainText=undefined;
    pendingSubmission=requestId();pendingPromptBytes=new TextEncoder().encode(editor.getDraft().text).length;delivery.textContent="Sending…";updateSend();
    post({type:"composerSubmit",request:{target,submissionId:pendingSubmission,draft:editor.getDraft()}});
  }
  function renderCatalog():void {
    positionDetail=undefined;
    const query=pickerSearch.value.toLowerCase();
    const unavailable=favorites.filter(invocation=>!commands.some(command=>command.invocation===invocation)).map(invocation=>({invocation,description:"Favorite unavailable in this session",source:"unavailable"}));
    const items=[...commands,...unavailable].filter(command=>`${command.invocation} ${command.description} ${command.source} ${"plugin" in command?command.plugin:""}`.toLowerCase().includes(query))
      .sort((a,b)=>Number(favorites.includes(b.invocation))-Number(favorites.includes(a.invocation)) || a.invocation.localeCompare(b.invocation));
    const focusedInvocation=(document.activeElement as HTMLElement|null)?.dataset.invocation;
    commandList.replaceChildren(...items.map((command,index)=>{
      const row=document.createElement("li");const choose=document.createElement("button");choose.type="button";choose.dataset.invocation=command.invocation;
      const label=`${command.invocation} — ${command.description}`;
      const provenance=`${command.source}${"plugin" in command?` / ${command.plugin}`:""}`;
      choose.disabled=command.source==="unavailable";choose.textContent=label;choose.title=`${label}\n${provenance}`;
      const detail=document.createElement("span");detail.className="composer-command-detail";detail.id=`composer-command-${options.documentId}-${index}`;
      detail.setAttribute("role","tooltip");detail.textContent=choose.title;choose.setAttribute("aria-describedby",detail.id);
      const placeDetail=()=>{
        const bounds=choose.getBoundingClientRect();const viewport=document.defaultView!;
        const pickerBounds=picker.getBoundingClientRect();
        detail.hidden=picker.hidden || (pickerBounds.height>0 && (bounds.bottom<pickerBounds.top || bounds.top>pickerBounds.bottom));
        const width=Math.max(0,Math.min(420,viewport.innerWidth-16));detail.style.inlineSize=`${width}px`;
        detail.style.left=`${Math.max(8,Math.min(bounds.left,viewport.innerWidth-width-8))}px`;
        const above=Math.max(0,bounds.top-12),below=Math.max(0,viewport.innerHeight-bounds.bottom-12);
        const placeAbove=above>below;const height=Math.min(240,placeAbove?above:below);
        detail.style.maxBlockSize=`${height}px`;
        detail.style.top=`${placeAbove?Math.max(8,bounds.top-height-4):bounds.bottom+4}px`;
      };
      const showDetail=()=>{positionDetail=placeDetail;placeDetail();};
      choose.addEventListener("focus",showDetail);choose.addEventListener("mouseenter",showDetail);
      const source=document.createElement("small");source.textContent=provenance;source.title=provenance;
      const favorite=document.createElement("button");favorite.type="button";favorite.dataset.favorite=command.invocation;favorite.textContent=favorites.includes(command.invocation)?"★":"☆";
      favorite.setAttribute("aria-label",`${favorites.includes(command.invocation)?"Remove":"Add"} favorite ${command.invocation}`);
      row.append(choose,detail,source,favorite);return row;
    }));
    if(focusedInvocation)commandList.querySelectorAll<HTMLButtonElement>("[data-invocation]").forEach(button=>{if(button.dataset.invocation===focusedInvocation)button.focus();});
  }
  function openCatalog():void {
    if(target===undefined)return;
    historyPanel.hidden=true;
    picker.hidden=false;requestCatalog();renderCatalog();pickerSearch.focus();
  }
  function closePicker():void {positionDetail=undefined;picker.hidden=true;historyPanel.hidden=true;editor.focus();}
  function setPreview(value:boolean):void {
    previewing=value && target!==undefined;preview.hidden=!previewing;editorParent.hidden=previewing || target===undefined;
    root.querySelector<HTMLButtonElement>('[data-composer="preview"]')!.setAttribute("aria-pressed",String(previewing));
    root.querySelector<HTMLButtonElement>('[data-composer="preview"]')!.textContent=previewing?"Edit":"Preview";
    if(previewing)preview.innerHTML=renderComposerMarkdown(editor.getDraft().text);
  }
  function openHistory():void {
    if(target===undefined)return;
    picker.hidden=true;historyPanel.hidden=false;
    const close=document.createElement("button");close.type="button";close.dataset.composer="closePicker";close.textContent="Close recent prompts";
    const list=document.createElement("ul");
    for(const {text,index} of recent.map((text,index)=>({text,index})).reverse()){
      const row=document.createElement("li");const snippet=document.createElement("p");snippet.textContent=text.replace(/\s+/gu," ").slice(0,100);row.append(snippet);
      for(const mode of editor.getDraft().text?["replace","append"] as const:["replace"] as const){
        const button=document.createElement("button");button.type="button";button.dataset.historyIndex=String(index);button.dataset.historyMode=mode;
        button.textContent=editor.getDraft().text?(mode==="replace"?"Replace":"Append"):"Use prompt";row.append(button);
      }
      list.append(row);
    }
    const explanation=document.createElement("p");explanation.textContent=recent.length?"Only accepted prompts sent from this composer appear here.":"No recent prompts. Accepted composer prompts will appear here.";
    historyPanel.replaceChildren(close,explanation,list);close.focus();
  }
  function applyEdit(draft:DraftState):void {
    if(target===undefined)return;
    if(draft.text!==uncertainText)uncertainText=undefined;
    editor.setDraft(draft);saveStatus.textContent="Saving…";post({type:"composerDraftChanged",target,draft});updateSend();scheduleReferences();
  }
  function hydrate(message:Hydration):void {
    hydrated=true;
    normalRatio=message.layout.splitRatio;canSubmit=message.canSubmit;favorites=message.favorites;
    if(message.capability.status==="available" && "session" in message){
      const next=message.capability.target;const same=sameTarget(target,next);const current=editor.getDraft();target=next;
      recent=message.session.recent;
      root.querySelector("strong")!.textContent=message.session.displayName;
      if(!same){pendingSubmission=undefined;uncertainText=undefined;delivery.textContent="";editor.setDraft(message.session.draft,true);saveStatus.textContent="Draft";commands=[];catalogReady=false;catalogRequested=false;catalogRequestId=undefined;fileRequestId=undefined;picker.hidden=true;historyPanel.hidden=true;}
      else if(message.session.draft.revision>current.revision){editor.setDraft(message.session.draft);}
      else if(message.session.draft.revision===current.revision && !sameDraft(current,message.session.draft)){
        // Native acceptance may reserve a revision before a browser edit reaches the host.
        const rebased={...current,revision:current.revision+1};editor.setDraft(rebased);saveStatus.textContent="Saving…";
        post({type:"composerDraftChanged",target,draft:rebased});
      }
      editorParent.hidden=false;notice.textContent=canSubmit?"":`Sending requires Claude CLI ${COMPOSER_SEND_MIN_VERSION} or later. Your draft can still be edited and saved.`;
    }else{
      target=undefined;pendingSubmission=undefined;canSubmit=false;editorParent.hidden=true;commands=[];catalogReady=false;catalogRequested=false;recent=[];catalogRequestId=undefined;fileRequestId=undefined;picker.hidden=true;historyPanel.hidden=true;
      notice.textContent="Use the terminal until this session has a Claude conversation identity. Draft saving and sending are unavailable.";
      saveStatus.textContent="Draft unavailable";delivery.textContent="";
    }
    setPreview(previewing);setVisible(message.visible);updateSend();scheduleReferences();requestCatalog();if(!picker.hidden)renderCatalog();reportFocus();
  }
  const onClick=(event:Event)=>{
    const element=event.target as Element|null;const action=element?.closest<HTMLButtonElement>("[data-composer]")?.dataset.composer;
    const invocation=element?.closest<HTMLButtonElement>("[data-invocation]")?.dataset.invocation;
    const favorite=element?.closest<HTMLButtonElement>("[data-favorite]")?.dataset.favorite;
    const history=element?.closest<HTMLButtonElement>("[data-history-index]");
    if(history && target){
      const mode=history.dataset.historyMode;if(mode!=="replace" && mode!=="append")return;
      post({type:"composerHistorySelected",target,index:Number(history.dataset.historyIndex),mode,expectedRevision:editor.getDraft().revision});
      setPreview(false);closePicker();return;
    }
    if(favorite && target){post({type:"composerFavoriteChanged",target,invocation:favorite,enabled:!favorites.includes(favorite)});return;}
    if(invocation && target && commands.some(command=>command.invocation===invocation)){
      const draft=editor.getDraft();setPreview(false);applyEdit({...insertInvocation(draft.text,draft.selection,invocation),revision:draft.revision+1});closePicker();return;
    }
    switch(action){
      case "send":submit(true);break;
      case "hide":setVisible(false);post({type:"composerVisibilityChanged",documentId:options.documentId,visible:false});break;
      case "expand":expanded=!expanded;applySplit();break;
      case "find":setPreview(false);editor.find();break;
      case "recent":openHistory();break;
      case "preview":picker.hidden=true;historyPanel.hidden=true;setPreview(!previewing);if(!previewing)editor.focus();break;
      case "commands":openCatalog();break;
      case "refreshCatalog":requestCatalog(true);break;
      case "closePicker":closePicker();break;
      case "file":if(target){fileRequestId=requestId();post({type:"composerPickFile",target,requestId:fileRequestId});}break;
      case "shortcuts":post({type:"composerConfigureShortcuts",documentId:options.documentId});break;
    }
  };
  const reportFocus=()=>{
    if(target===undefined)return;
    const focused=root.contains(document.activeElement);const pickerFocused=focused && !!document.activeElement?.closest(".composer-popup");
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
  const onShow=()=>{setVisible(true);post({type:"composerVisibilityChanged",documentId:options.documentId,visible:true});if(target)editor.focus();};
  show.addEventListener("click",onShow);
  const onPickerKey=(event:KeyboardEvent)=>{
    if(event.isComposing || event.ctrlKey || event.altKey || event.metaKey)return;
    if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closePicker();return;}
    const rows=[...commandList.querySelectorAll<HTMLButtonElement>("[data-invocation]:not(:disabled)")];
    const index=rows.findIndex(button=>button===document.activeElement);
    if(event.key==="ArrowDown"||event.key==="ArrowUp"){
      event.preventDefault();if(rows.length)rows[(index+(event.key==="ArrowDown"?1:-1)+rows.length)%rows.length]?.focus();
    }else if(event.key==="Enter" && event.target===pickerSearch){event.preventDefault();rows[0]?.click();}
  };
  const onHistoryKey=(event:KeyboardEvent)=>{if(event.key==="Escape" && !event.isComposing){event.preventDefault();event.stopPropagation();setPreview(false);closePicker();}};
  const onPreviewLink=(event:MouseEvent)=>{
    const link=(event.target as Element|null)?.closest<HTMLAnchorElement>("a[href]");if(!link)return;event.preventDefault();event.stopPropagation();
    const uri=link.getAttribute("href");if(target && uri && isComposerPreviewLink(uri))options.openExternal?.(target,uri);
  };
  preview.addEventListener("click",onPreviewLink);historyPanel.addEventListener("keydown",onHistoryKey);
  pickerSearch.addEventListener("input",renderCatalog);picker.addEventListener("keydown",onPickerKey);
  const repositionDetail=()=>positionDetail?.();
  document.defaultView!.addEventListener("resize",repositionDetail);picker.addEventListener("scroll",repositionDetail);
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
      if(message.type==="composerReset"){
        target=undefined;canSubmit=false;hydrated=false;pendingSubmission=undefined;uncertainText=undefined;catalogRequestId=undefined;fileRequestId=undefined;commands=[];catalogReady=false;catalogRequested=false;recent=[];scheduleReferences();
        setPreview(false);setVisible(false);return;
      }
      if(message.type==="composerAction" && message.action==="toggle"){
        setVisible(!visible);post({type:"composerVisibilityChanged",documentId:options.documentId,visible});if(visible && target)editor.focus();return;
      }
      if(message.type==="composerLayoutStatus"){
        normalRatio=message.layout.splitRatio;applySplit();if(message.status==="error")delivery.textContent="Split size not saved. Try resizing again.";return;
      }
      if(!("target" in message) || message.target===undefined || !sameTarget(target,message.target))return;
      switch(message.type){
        case "composerReferenceValidation":
          if(message.requestId!==referenceRequestId || message.revision!==editor.getDraft().revision)return;
          editor.setReferenceContext({commands:catalogReady?commands:undefined,files:message.results});break;
        case "composerDraftStatus":
          if(message.revision!==editor.getDraft().revision)return;
          saveStatus.textContent={saved:"Saved",saving:"Saving…",unsaved:"Draft",error:"Not saved — retry by editing", "too-large":"Not saved — draft exceeds 1 MiB"}[message.status];break;
        case "composerSubmitResult":
          if(pendingSubmission!==undefined && pendingSubmission!==message.result.submissionId)return;
          if(message.result.status==="unconfirmed")uncertainText=editor.getDraft().text;
          pendingSubmission=undefined;delivery.textContent=message.result.status==="accepted"?(pendingPromptBytes>RECENT_MAX_UTF8_BYTES?"Accepted by Claude. Prompt too large for recent history.":"Accepted by Claude"):message.result.status==="unconfirmed"?"Delivery not confirmed. Check Claude, then click Send or edit the draft before retrying.":message.result.reason==="dialog"?"Claude is showing a dialog. Use the terminal to respond.":message.result.reason==="terminal-draft"?"The terminal already has input. Review it before sending again.":"Not sent. Your draft is retained.";
          updateSend();break;
        case "composerCatalog":
          if(message.requestId!==catalogRequestId)return;
          catalogRequestId=undefined;catalogReady=message.status==="ready";
          commands=message.status==="ready"?message.commands:[];
          pickerStatus.textContent=message.status==="ready"?`${commands.length} skills and commands` : "Commands unavailable. You can still edit the prompt manually.";
          renderCatalog();scheduleReferences();break;
        case "composerInsertText":{
          if(message.requestId!==fileRequestId)return;
          const draft=editor.getDraft();if(draft.revision!==message.expectedRevision)return;
          const from=Math.min(draft.selection.anchor,draft.selection.head),to=Math.max(draft.selection.anchor,draft.selection.head);
          const prefix=from>0 && !/\s/u.test(draft.text[from-1]!)?" ":"";
          const suffix=to<draft.text.length && !/\s/u.test(draft.text[to]!)?" ":"";
          const inserted=prefix+message.text+suffix;const head=from+inserted.length;
          setPreview(false);applyEdit({revision:draft.revision+1,text:draft.text.slice(0,from)+inserted+draft.text.slice(to),selection:{anchor:head,head}});
          fileRequestId=undefined;editor.focus();break;
        }
        case "composerFocus":if(message.destination==="editor"){setVisible(true);editor.focus();}else options.focusTerminal();break;
        case "composerAction":switch(message.action){
          case "submit":submit();break;
          case "pickCommand":openCatalog();break;
          case "find":setPreview(false);editor.find();break;case "replace":setPreview(false);editor.replace();break;case "undo":editor.undo();break;case "redo":editor.redo();break;
        }break;
      }
    },
    dispose(){disposed=true;positionDetail=undefined;document.defaultView!.removeEventListener("resize",repositionDetail);picker.removeEventListener("scroll",repositionDetail);document.defaultView!.clearTimeout(referenceTimer);editor.dispose();root.remove();divider.remove();show.remove();options.parent.classList.remove("composer-visible","composer-expanded");}
  };
}
