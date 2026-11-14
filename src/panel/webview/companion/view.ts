import type { CompanionGroup, CompanionNode, CompanionSnapshot, CompanionTarget } from "../../../companion/companionTypes";
import type { CompanionHostMessage, CompanionWebviewMessage } from "../../companionProtocol";
import { decodeCompanionHostMessage, decodeCompanionWebviewMessage, decodeCompanionSnapshot, decodeCompanionDelta } from "../../companionProtocol";
import { CopyPreview } from "./copyPreview";

export type CompanionViewMode="companion"|"raw";
export interface CompanionViewOptions {
  readonly viewId?:string;
  /** The renderer's existing legacy-ready UUID; start only after legacy ready was posted. */
  readonly documentId:string;
  readonly postMessage:(message:{type:"companion";payload:CompanionWebviewMessage})=>void;
  /** Visibility/mode notification only. Assembly keeps xterm mounted and does not focus on arrival. */
  readonly onModeChange?:(mode:CompanionViewMode,sessionId:string|undefined)=>void;
  /** Route through the existing renderer link/CSP boundary. No companion link messages. */
  readonly openLink?:(href:string)=>void;
  readonly schedule?:(callback:()=>void,delay:number)=>()=>void;
  readonly sha256?:(text:string)=>Promise<string>;
}
type Bind=Extract<CompanionHostMessage,{kind:"companion.bind"}>;
type Begin=Extract<CompanionHostMessage,{kind:"companion.transferBegin"}>;
interface Pending {begin:Begin;chunks:string[];bytes:number;ended:boolean;validated?:CompanionSnapshot;cancelStep?:()=>void;cancelTotal:()=>void}
interface Memory {mode:CompanionViewMode;scrollTop:number;explicit:boolean}
interface Action {kind:string;projectionId:string;label:string;feedback:HTMLElement;target?:CompanionTarget;invoker?:HTMLElement;reviewId?:string;opened?:boolean}
interface Review {id:string;target:CompanionTarget;preview:CopyPreview;invoker?:HTMLElement}
const initial:CompanionSnapshot={groups:[],historyBoundary:false,captureStatus:{state:"starting",reason:"INITIALIZING"}};

/** Closed host-node renderer and document-scoped atomic transfer receiver. CSS is entry-owned. */
export class CompanionView {
  private readonly document:Document;
  private readonly toolbar:HTMLElement;
  private readonly reading:HTMLElement;
  private readonly notice:HTMLElement;
  private readonly live:HTMLElement;
  private readonly newContent:HTMLButtonElement;
  private readonly companionButton:HTMLButtonElement;
  private readonly rawButton:HTMLButtonElement;
  private readonly respondButton:HTMLButtonElement;
  private readonly escapeButton:HTMLButtonElement;
  private readonly memory=new Map<string,Memory>();
  private readonly rendered=new Map<string,{group:CompanionGroup;element:HTMLElement}>();
  private readonly actions=new Map<number,Action>();
  private readonly invalidTargets=new Map<string,number>();
  private review?:Review;
  private latestReviewRequest=0;
  private binding?:Bind;
  private pending?:Pending;
  private snapshot:CompanionSnapshot=initial;
  private committedProjection?:string;
  private appliedRevision=0;
  private actionId=0;
  private projectionHighWater="0".repeat(32);
  private failures=0;
  private started=false;
  private disposed=false;
  private mode:CompanionViewMode="raw";
  private restoreScroll?:number;
  private hashing?:object;

  constructor(private readonly root:HTMLElement,private readonly options:CompanionViewOptions) {
    this.document=root.ownerDocument;root.classList.add("companion");
    this.toolbar=this.element("div","companion-toolbar");this.toolbar.setAttribute("role","toolbar");this.toolbar.setAttribute("aria-label","Output view and native terminal controls");
    this.companionButton=this.button("Companion",()=>this.setMode("companion"));
    this.rawButton=this.button("Raw",()=>this.native("companion.toggleRaw"));
    this.respondButton=this.button("Respond in terminal",()=>this.native("companion.toggleRaw"));
    this.escapeButton=this.button("Send Escape to selected CLI",()=>this.native("companion.escape"));
    this.toolbar.append(this.companionButton,this.rawButton,this.respondButton,this.escapeButton);
    this.notice=this.element("p","companion-notice");this.notice.setAttribute("role","status");
    this.reading=this.element("div","companion-reading");this.reading.tabIndex=0;this.reading.setAttribute("role","region");this.reading.setAttribute("aria-label","Companion output");
    this.newContent=this.button("New content",()=>{this.reading.scrollTop=this.reading.scrollHeight;this.newContent.hidden=true;});this.newContent.hidden=true;
    this.live=this.element("div","companion-live");this.live.setAttribute("role","status");this.live.setAttribute("aria-live","polite");this.live.setAttribute("aria-atomic","true");
    root.append(this.toolbar,this.notice,this.reading,this.newContent,this.live);this.updateAvailability();
  }

  /** Renderer assembly posts legacy ready first, then calls this idempotent seam. */
  start():void {
    if(this.started||this.disposed)return;
    const payload={v:1,kind:"companion.ready",viewId:this.options.viewId,documentId:this.options.documentId};
    const decoded=decodeCompanionWebviewMessage(payload);if(!decoded.ok)return;
    this.started=true;this.post(decoded.value);
  }

  /** Consume only the nested host payload after the root protocol dispatch. */
  async receive(input:unknown):Promise<void> {
    if(this.disposed||!this.started)return;
    const decoded=decodeCompanionHostMessage(input);
    if(!decoded.ok){
      if(this.matches(input))this.fail("decode");return;
    }
    // Decoders intentionally return original objects. Own the small wire frame across awaits.
    const message=JSON.parse(JSON.stringify(decoded.value)) as CompanionHostMessage;
    if(message.viewId!==this.options.viewId)return;
    if(message.kind==="companion.bind"){
      if(message.documentId!==this.options.documentId)return;
      // Fixed-width lowercase hex preserves host ordinal order without numeric conversion.
      if(message.projectionId<=this.projectionHighWater)return;
      this.projectionHighWater=message.projectionId;
      const sourceChanged=this.binding?.sessionId!==message.sessionId||this.binding.claudeSessionId!==message.claudeSessionId||this.binding.generation!==message.generation;
      this.saveMemory();this.closeReview();this.cancelPending();
      if(sourceChanged){
        // A retry may retain its reading window; a different source owns no committed context yet.
        this.snapshot=initial;this.committedProjection=undefined;this.rendered.clear();this.reading.replaceChildren();
        this.actions.clear();this.latestReviewRequest=0;this.failures=0;this.live.textContent="";this.newContent.hidden=true;
      }
      this.binding=message;this.appliedRevision=0;this.invalidTargets.clear();
      const memory=this.sessionMemory();this.mode=memory.mode;this.restoreScroll=memory.scrollTop;
      if(sourceChanged)this.reading.scrollTop=memory.scrollTop;
      this.updateAvailability();this.options.onModeChange?.(this.mode,message.sessionId);return;
    }
    if(!this.matches(message))return;
    switch(message.kind){
      case "companion.transferBegin":{
        if(this.pending){this.fail("order");return;}
        if(message.mode==="delta"&&(this.committedProjection!==message.projectionId||message.baseRevision!==this.appliedRevision)||message.revision<this.appliedRevision){this.fail("order");return;}
        const pending:Pending={begin:message,chunks:[],bytes:0,ended:false,cancelTotal:this.schedule(()=>this.fail("timeout"),5000)};
        this.pending=pending;this.arm(pending);return;
      }
      case "companion.transferChunk":{
        const p=this.pending;if(!p||p.begin.transferId!==message.transferId)return;
        if(message.chunkIndex<p.chunks.length){if(p.chunks[message.chunkIndex]!==message.data){this.fail("order");return;}this.ack(p);return;}
        if(p.ended||message.chunkIndex!==p.chunks.length||p.chunks.length>=p.begin.chunkCount){this.fail("order");return;}
        if(p.bytes+message.byteLength>p.begin.byteLength){this.fail("capacity");return;}
        p.chunks.push(message.data);p.bytes+=message.byteLength;this.arm(p);this.ack(p);return;
      }
      case "companion.transferEnd":{
        const p=this.pending;if(!p||p.begin.transferId!==message.transferId)return;
        if(p.ended||p.chunks.length!==p.begin.chunkCount||p.bytes!==p.begin.byteLength||!this.sameCut(p.begin,message)){this.fail("order");return;}
        p.ended=true;this.arm(p);
        if(this.hashing){this.fail("capacity");return;}
        const digest={};this.hashing=digest;
        try {
          const text=p.chunks.join("");
          const hash=await this.hash(text);if(this.hashing===digest)this.hashing=undefined;if(this.pending!==p||this.disposed)return;
          if(hash!==p.begin.sha256){this.fail("decode");return;}
          const value:unknown=JSON.parse(text);
          if(p.begin.mode==="snapshot"){
            const snapshot=decodeCompanionSnapshot(value);if(!snapshot.ok){this.fail("decode");return;}p.validated=snapshot.value;
          } else {
            const delta=decodeCompanionDelta(value);if(!delta.ok||p.begin.baseRevision!==this.appliedRevision){this.fail("decode");return;}
            let next=this.snapshot;const groups=[...next.groups];
            for(const change of delta.value.changes){
              if(change.kind==="upsertGroup"){const i=groups.findIndex(g=>g.groupId===change.group.groupId);if(i<0)groups.push(change.group);else groups[i]=change.group;}
              else if(change.kind==="removeGroup"){const i=groups.findIndex(g=>g.groupId===change.groupId);if(i>=0)groups.splice(i,1);}
              else if(change.kind==="captureStatus")next={...next,captureStatus:change.value};
              else next={...next,historyBoundary:change.value};
            }
            const snapshot=decodeCompanionSnapshot({...next,groups});if(!snapshot.ok){this.fail("capacity");return;}p.validated=snapshot.value;
          }
          // Retain bounded chunk evidence until commit for exact duplicate acknowledgements.
          this.post({...this.envelope(),kind:"companion.transferReady",transferId:p.begin.transferId,revision:p.begin.revision,byteLength:p.begin.byteLength,sha256:p.begin.sha256});
        } catch {if(this.pending===p)this.fail("decode");}finally{if(this.hashing===digest)this.hashing=undefined;}return;
      }
      case "companion.transferCommit":{
        const p=this.pending;if(!p||p.begin.transferId!==message.transferId)return;
        if(!p.validated||p.begin.revision!==message.revision||p.begin.mode==="delta"&&p.begin.baseRevision!==this.appliedRevision){this.fail("order");return;}
        this.snapshot=p.validated;this.appliedRevision=message.revision;this.committedProjection=message.projectionId;this.cancelPending();this.failures=0;
        if(this.review&&!this.currentTarget(this.review.target))this.closeReview();
        this.render();return;
      }
      case "companion.transferAbort":if(this.pending?.begin.transferId===message.transferId)this.fail(message.reason==="timeout"?"timeout":"order");return;
      case "companion.reviewOpened":{
        const action=this.actions.get(message.actionId);
        if(!action||action.kind!=="companion.reviewOpen"||action.opened||message.actionId!==this.latestReviewRequest||action.projectionId!==message.projectionId||!action.target||action.target.targetId!==message.targetId||action.target.targetRevision!==message.targetRevision||!this.currentTarget(action.target))return;
        action.opened=true;action.reviewId=message.reviewId;this.closeReview(false);
        const target=action.target;
        const preview=new CopyPreview(this.root,{value:message.value,label:this.targetLabel(target),restoreFocus:()=>{if(action.invoker?.isConnected)action.invoker.focus();else this.reading.focus();},
          copy:value=>this.copyReviewed(value),cancel:()=>this.cancelReview()});
        this.review={id:message.reviewId,target,preview,invoker:action.invoker};return;
      }
      case "companion.reviewInvalidated":if(this.review?.id===message.reviewId){this.closeReview();this.live.textContent="Review unavailable: "+message.reason+".";}return;
      case "companion.actionResult":{
        const action=this.actions.get(message.actionId);if(!action||action.projectionId!==message.projectionId||message.targetId!==undefined&&message.targetId!==action.target?.targetId||message.reviewId!==undefined&&message.reviewId!==action.reviewId)return;
        const text=this.feedback(message.status,action.kind);action.feedback.textContent=text;this.live.textContent=action.label+": "+text;
        if(action.target&&message.status==="stale"&&(message.reason==="SOURCE_CHANGED"||message.reason==="EVICTED")){
          this.invalidTargets.set(action.target.targetId,action.target.targetRevision);if(action.invoker instanceof this.document.defaultView!.HTMLButtonElement)action.invoker.disabled=true;
          if(this.review?.target.targetId===action.target.targetId)this.closeReview();
        }
        if(action.kind==="companion.reviewCopy"&&this.review?.id===action.reviewId){
          if(message.status==="busy")this.review!.preview.setPending(false,text);
          else this.closeReview();
        }
        if((message.status==="stale"||message.status==="unavailable")&&action.kind==="companion.reviewOpen")action.opened=true;
        return;
      }
      default:return;
    }
  }

  /** Local view selection only; the same terminal remains owned by renderer assembly. */
  setMode(mode:CompanionViewMode):void {
    if(this.disposed)return;this.mode=mode;
    if(this.binding){const memory=this.sessionMemory();memory.mode=mode;memory.explicit=true;}
    this.updateMode();this.options.onModeChange?.(mode,this.binding?.sessionId);
    if(mode==="companion"&&this.failures>1&&this.binding){this.failures=0;this.fail("order");}
  }
  /** Session manager calls this when removing a session, so UI memory has the same lifetime. */
  forgetSession(sessionId:string):void {
    this.memory.delete(sessionId);
    if(this.binding?.sessionId!==sessionId)return;
    this.closeReview(false);this.cancelPending();this.binding=undefined;this.committedProjection=undefined;this.appliedRevision=0;this.restoreScroll=undefined;this.updateAvailability();
  }
  dispose():void {if(this.disposed)return;this.saveMemory();this.closeReview(false);this.cancelPending();this.disposed=true;this.root.replaceChildren();this.rendered.clear();this.memory.clear();this.actions.clear();this.invalidTargets.clear();}

  private element<K extends keyof HTMLElementTagNameMap>(tag:K,className=""):HTMLElementTagNameMap[K] {const element=this.document.createElement(tag);element.className=className;return element;}
  private button(label:string,activate:()=>void):HTMLButtonElement {const b=this.element("button");b.type="button";b.textContent=label;b.addEventListener("click",activate);return b;}
  private post(payload:CompanionWebviewMessage):void {if(!this.disposed)this.options.postMessage({type:"companion",payload});}
  private envelope() {const b=this.binding!;return {v:1 as const,viewId:b.viewId,projectionId:b.projectionId,sessionId:b.sessionId,generation:b.generation};}
  private matches(input:unknown):boolean {if(!input||typeof input!=="object"||!this.binding)return false;const p=input as Partial<CompanionHostMessage>,b=this.binding;return p.viewId===b.viewId&&p.projectionId===b.projectionId&&p.sessionId===b.sessionId&&p.generation===b.generation;}
  private nextAction():number|undefined {if(this.actionId===Number.MAX_SAFE_INTEGER){this.live.textContent="Actions unavailable. Reopen the view.";return;}return ++this.actionId;}
  private native(kind:"companion.toggleRaw"|"companion.escape"):void {if(!this.binding||this.disposed)return;const actionId=this.nextAction();if(actionId===undefined)return;if(kind==="companion.toggleRaw")this.setMode("raw");this.record(actionId,{kind,projectionId:this.binding.projectionId,label:kind==="companion.escape"?"Send Escape to selected CLI":"Raw",feedback:this.live});this.post({...this.envelope(),kind,actionId});}
  private schedule(callback:()=>void,delay:number):()=>void {if(this.options.schedule)return this.options.schedule(callback,delay);const timer=setTimeout(callback,delay);return ()=>clearTimeout(timer);}
  private arm(p:Pending):void {p.cancelStep?.();p.cancelStep=this.schedule(()=>{if(this.pending===p)this.fail("timeout");},2000);}
  private cancelPending():void {this.pending?.cancelStep?.();this.pending?.cancelTotal();this.pending=undefined;}
  private sameCut(a:Begin,b:Extract<CompanionHostMessage,{kind:"companion.transferEnd"}>):boolean {return a.revision===b.revision&&a.byteLength===b.byteLength&&a.sha256===b.sha256;}
  private ack(p:Pending):void {this.post({...this.envelope(),kind:"companion.transferAck",transferId:p.begin.transferId,nextChunkIndex:p.chunks.length,byteLength:p.bytes});}
  private fail(reason:"decode"|"order"|"timeout"|"capacity"):void {
    this.closeReview();this.cancelPending();this.notice.textContent="Companion unavailable. "+(this.committedProjection?"Last committed output is retained. ":"")+"Raw and native input remain available.";
    if(this.failures++===0&&this.binding)this.post({...this.envelope(),kind:"companion.resync",appliedRevision:this.appliedRevision,reason});
  }
  private async hash(text:string):Promise<string> {if(this.options.sha256)return this.options.sha256(text);const data=new TextEncoder().encode(text);const hash=await globalThis.crypto.subtle.digest("SHA-256",data);return [...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("");}
  private sessionMemory():Memory {const id=this.binding!.sessionId;let value=this.memory.get(id);if(!value){value={mode:"raw",scrollTop:0,explicit:false};this.memory.set(id,value);}return value;}
  private saveMemory():void {if(this.binding){const m=this.sessionMemory();m.scrollTop=this.reading.scrollTop;m.mode=this.mode;}}
  private updateMode():void {this.root.dataset.mode=this.mode;this.companionButton.setAttribute("aria-pressed",String(this.mode==="companion"));this.rawButton.setAttribute("aria-pressed",String(this.mode==="raw"));}
  private updateAvailability():void {
    const bound=!!this.binding;this.escapeButton.disabled=!bound;this.respondButton.disabled=!bound;this.rawButton.disabled=!bound;
    const current=this.committedProjection===this.binding?.projectionId;
    for(const button of this.reading.querySelectorAll<HTMLButtonElement>("button[data-target-id]"))button.disabled=!current||this.invalidTargets.has(button.dataset.targetId!);
    this.notice.textContent=bound?"Companion unavailable. Raw and native input remain available.":"Companion unavailable. Use the existing terminal.";this.updateMode();
  }
  private render():void {
    const focused=this.document.activeElement,readingHadFocus=!!focused&&this.reading.contains(focused);
    const atEnd=this.reading.scrollHeight-this.reading.scrollTop-this.reading.clientHeight<=24,top=this.reading.scrollTop;
    const groups=new Set(this.snapshot.groups.map(g=>g.groupId));
    for(const [id,revision] of this.invalidTargets)if(!this.snapshot.groups.some(g=>g.targets.some(t=>t.targetId===id&&t.targetRevision===revision)))this.invalidTargets.delete(id);
    for(const [id,entry] of this.rendered)if(!groups.has(id)){entry.element.remove();this.rendered.delete(id);}
    let previous:Element|null=null;
    for(const group of this.snapshot.groups){
      let entry=this.rendered.get(group.groupId);
      if(!entry||entry.group!==group){const element=this.renderGroup(group);if(entry)entry.element.replaceWith(element);entry={group,element};this.rendered.set(group.groupId,entry);}
      const expected:Element|null=previous?previous.nextElementSibling:this.reading.firstElementChild;if(expected!==entry.element)this.reading.insertBefore(entry.element,expected);
      previous=entry.element;
    }
    const memory=this.sessionMemory();if(!memory.explicit)memory.mode=this.snapshot.captureStatus.state==="active"?"companion":"raw";
    if(this.mode!==memory.mode){this.mode=memory.mode;this.updateMode();this.options.onModeChange?.(this.mode,this.binding?.sessionId);}
    this.updateAvailability();this.notice.textContent=(this.snapshot.historyBoundary?"Earlier history is unavailable. ":"")+(this.snapshot.captureStatus.state==="active"?"":"Capture unavailable. Raw and native input remain available.");
    this.reading.scrollTop=this.restoreScroll??(atEnd?this.reading.scrollHeight:top);this.restoreScroll=undefined;this.newContent.hidden=atEnd;this.saveMemory();
    if(readingHadFocus&&!focused!.isConnected)this.reading.focus({preventScroll:true});
  }
  private renderGroup(group:CompanionGroup):HTMLElement {
    const section=this.element("section","companion-group companion-"+group.speaker);section.dataset.groupId=group.groupId;
    section.setAttribute("aria-label",group.speaker==="tool"?"Tool command or output":group.speaker==="notice"?"Capture notice":"Claude explanation");
    if(group.statusLabel){const label=this.element("p","companion-provenance");label.textContent=group.statusLabel;section.append(label);}
    if(group.provenanceStatus==="completed"){const note=this.element("p","companion-secondary");note.textContent="Exit code unavailable";section.append(note);}
    const owners=new Map<string,string>();
    const choose=(nodes:readonly CompanionNode[],target:CompanionTarget):void=>{for(const node of nodes){const span=node.sourceSpan;if(span&&span.start<=target.sourceStart&&span.end>=target.sourceEnd){owners.set(target.targetId,node.nodeId);if("children"in node)choose(node.children,target);}}};
    for(const target of group.targets)choose(group.nodes,target);
    const renderNode=(node:CompanionNode):Node=>{
      let element:HTMLElement;
      switch(node.kind){
        case "text":element=this.element("span");element.textContent=node.text;break;
        case "code":{element=this.element(node.block?"pre":"span",node.block?"companion-code-block":"companion-code-inline");const code=this.element("code");code.textContent=node.text;element.append(code);break;}
        case "softBreak":return this.document.createTextNode("\n");
        case "hardBreak":return this.element("br");
        case "imagePlaceholder":element=this.element("span","companion-image-placeholder");element.textContent="[Image: "+node.alt+"]";break;
        case "notice":element=this.element("p","companion-notice");element.textContent=node.text;break;
        default:{
          const tag=node.kind==="paragraph"?"p":node.kind==="emphasis"?"em":node.kind==="strong"?"strong":node.kind==="blockquote"?"blockquote":node.kind==="listItem"?"li":node.kind==="list"?(node.ordered?"ol":"ul"):node.kind==="heading"?`h${node.level}`:"a";
          element=this.document.createElement(tag);
          if(node.kind==="list"&&node.ordered&&node.startNumber!==null)element.setAttribute("start",String(node.startNumber));
          if(node.kind==="link"&&node.href){const href=node.href;element.setAttribute("href",href);element.addEventListener("click",event=>{event.preventDefault();this.options.openLink?.(href);});}
          for(const child of node.children)element.append(renderNode(child));
        }
      }
      element.dataset.nodeId=node.nodeId;
      const targets=group.targets.filter(t=>owners.get(t.targetId)===node.nodeId).sort((a,b)=>a.sourceEnd-b.sourceEnd);
      if(node.kind==="text"&&node.sourceSpan&&node.text===group.sourceText.slice(node.sourceSpan.start,node.sourceSpan.end)&&targets.length){
        element.replaceChildren();let offset=0;for(const target of targets){const end=target.sourceEnd-node.sourceSpan.start;element.append(this.document.createTextNode(node.text.slice(offset,end)),this.targetControl(target));offset=end;}element.append(this.document.createTextNode(node.text.slice(offset)));
      } else for(const target of targets){const action=this.targetControl(target);if(target.kind!=="path"){const label=this.element("span","companion-target-label");label.textContent=target.displayLabel;element.append(label);}element.append(action);}
      return element;
    };
    const rawFallback=group.targets.length===0&&group.nodes.some(node=>node.kind==="notice"&&node.reason==="UNSUPPORTED_CONTENT");
    for(const node of group.nodes){
      const rendered=renderNode(node);
      // CSS treats a DOM-inserted lone CR as a space; normalize only its bounded display text.
      if(rawFallback&&node.kind==="text"&&node.text===group.sourceText)rendered.textContent=node.text.replace(/\r(?!\n)/g,"\n");
      section.append(rendered);
    }
    return section;
  }
  private targetControl(target:CompanionTarget):HTMLElement {
    const wrapper=this.element("span","companion-target"),button=this.button(target.action==="copy"?"Copy":"Review",()=>{
      if(!this.currentTarget(target))return;const actionId=this.nextAction();if(actionId===undefined)return;
      const feedback=this.element("span","companion-action-feedback");wrapper.append(feedback);
      const kind=target.action==="copy"?"companion.copy":"companion.reviewOpen";
      if(kind==="companion.reviewOpen"){this.latestReviewRequest=actionId;this.closeReview(false);}
      this.record(actionId,{kind,projectionId:this.binding!.projectionId,label:this.targetLabel(target),feedback,target,invoker:button});
      this.post({...this.envelope(),kind,actionId,appliedRevision:this.appliedRevision,targetId:target.targetId,targetRevision:target.targetRevision});
    });button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();});button.dataset.targetId=target.targetId;button.setAttribute("aria-label",this.targetLabel(target));wrapper.append(button);return wrapper;
  }
  private targetLabel(target:CompanionTarget):string {const source=this.snapshot.groups.find(g=>g.groupId===target.groupId)?.sourceText??"";const context=Array.from(source.slice(target.sourceStart,target.sourceEnd)).slice(0,96).join("");return target.accessibleLabel+": "+context;}
  private currentTarget(target:CompanionTarget):boolean {return this.committedProjection===this.binding?.projectionId&&this.invalidTargets.get(target.targetId)!==target.targetRevision&&this.snapshot.groups.some(g=>g.targets.some(t=>t.targetId===target.targetId&&t.targetRevision===target.targetRevision));}
  private record(actionId:number,action:Action):void {this.actions.set(actionId,action);if(this.actions.size>128){const id=this.actions.keys().next().value!,old=this.actions.get(id)!;if(old.feedback!==this.live)old.feedback.remove();this.actions.delete(id);}}
  private copyReviewed(value:string):void {
    const review=this.review;if(!review||!this.currentTarget(review.target))return;const actionId=this.nextAction();if(actionId===undefined)return;
    const feedback=this.element("span","companion-action-feedback");review.invoker?.parentElement?.append(feedback);
    this.record(actionId,{kind:"companion.reviewCopy",projectionId:this.binding!.projectionId,label:this.targetLabel(review.target),feedback,target:review.target,reviewId:review.id});review.preview.setPending(true);
    this.post({...this.envelope(),kind:"companion.reviewCopy",actionId,appliedRevision:this.appliedRevision,reviewId:review.id,targetId:review.target.targetId,targetRevision:review.target.targetRevision,value});
  }
  private cancelReview():void {const review=this.review;if(!review)return;const actionId=this.nextAction();this.closeReview();if(actionId===undefined)return;this.record(actionId,{kind:"companion.reviewCancel",projectionId:this.binding!.projectionId,label:"Review",feedback:this.live,reviewId:review.id});this.post({...this.envelope(),kind:"companion.reviewCancel",actionId,reviewId:review.id});}
  private closeReview(restoreFocus=true):void {const review=this.review;this.review=undefined;review?.preview.close(restoreFocus);}
  private feedback(status:Extract<CompanionHostMessage,{kind:"companion.actionResult"}>["status"],kind:string):string {
    switch(status){
      case "ok":return kind==="companion.reviewOpen"?"Review opened.":kind==="companion.toggleRaw"?"Terminal selected.":"Copied.";
      case "uncertain":return "Copy still pending; completion is uncertain.";
      case "settledAfterUncertain":return "Copy completed after the feedback deadline.";
      case "busy":return "Another copy is pending. Try again after it settles.";
      case "inputSent":return "Native Escape sent; interruption is not confirmed.";
      case "stale":return "Source changed or action expired. Use the current source.";
      case "cancelled":return "Review cancelled.";
      case "duplicateExpired":return "Action expired. Activate the current control again.";
      case "invalid":return "Action rejected.";
      case "unavailable":return "Action unavailable.";
    }
  }
}
