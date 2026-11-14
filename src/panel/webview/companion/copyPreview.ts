export interface CopyPreviewOptions {
  readonly value:string;
  readonly label:string;
  readonly restoreFocus:()=>void;
  readonly copy:(value:string)=>void;
  readonly cancel:()=>void;
}

/** Local editable Review. Its only outbound value is an explicit Copy activation. */
export class CopyPreview {
  private readonly dialog:HTMLDialogElement;
  private readonly value:HTMLTextAreaElement;
  private readonly copy:HTMLButtonElement;
  private readonly feedback:HTMLElement;
  private literal:string;
  private editor:string;
  private candidate?:string;
  private beforeEdit?:{editor:string;start:number;end:number};
  private pending=false;
  private disposed=false;

  constructor(root:HTMLElement,private readonly options:CopyPreviewOptions) {
    const document=root.ownerDocument;
    this.dialog=document.createElement("dialog");this.dialog.className="companion-review";
    this.dialog.setAttribute("aria-label","Review "+options.label);this.dialog.setAttribute("aria-modal","true");
    const heading=document.createElement("h2");heading.textContent="Review before copying";
    const label=document.createElement("label");label.textContent=options.label;
    this.value=document.createElement("textarea");this.value.value=options.value;this.value.maxLength=32768;this.value.setAttribute("aria-label","Value to copy");this.value.spellcheck=false;
    const admitted=this.validLiteral(options.value);this.literal=admitted?options.value:"";this.editor=admitted?this.value.value:"";this.candidate=admitted?options.value:undefined;
    label.append(this.value);
    this.feedback=document.createElement("p");this.feedback.setAttribute("role","status");
    const controls=document.createElement("div");controls.className="companion-review-actions";
    this.copy=document.createElement("button");this.copy.type="button";this.copy.textContent="Copy";this.copy.setAttribute("aria-label","Copy reviewed value");
    const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancel";
    this.copy.addEventListener("click",()=>{this.captureEdit();if(this.valid()&&!this.pending&&!this.disposed)options.copy(this.candidate!);});
    cancel.addEventListener("click",()=>{if(!this.disposed)options.cancel();});
    this.value.addEventListener("beforeinput",event=>{
      this.beforeEdit=undefined;const editor=this.value.value;if(editor.length>32768||!/^insert|^delete/.test(event.inputType))return;
      let start=this.value.selectionStart,end=this.value.selectionEnd;
      if(start===end&&event.inputType==="deleteContentBackward")start=Math.max(0,start-1);
      if(start===end&&event.inputType==="deleteContentForward")end=Math.min(editor.length,end+1);
      if(this.splitScalar(editor,start))start--;if(this.splitScalar(editor,end))end++;
      this.beforeEdit={editor,start,end};
    });
    this.value.addEventListener("input",()=>{this.captureEdit(true);this.validate();});
    this.dialog.addEventListener("cancel",event=>{event.preventDefault();event.stopPropagation();if(!this.disposed)options.cancel();});
    this.dialog.addEventListener("keydown",event=>{
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();options.cancel();return;}
      if(event.key!=="Tab")return;
      const focusable=[this.value,...(!this.copy.disabled?[this.copy]:[]),cancel],first=focusable[0]!,last=focusable.at(-1)!;
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    });
    controls.append(this.copy,cancel);this.dialog.append(heading,label,this.feedback,controls);root.append(this.dialog);
    this.validate();
    if(typeof this.dialog.showModal==="function")this.dialog.showModal();else this.dialog.setAttribute("open","");
    this.value.focus();
  }

  /** A busy host result permits a new action ID while retaining the exact edited candidate. */
  setPending(pending:boolean,message=""):void {this.pending=pending;this.validate();if(message)this.feedback.textContent=message;}
  close(restoreFocus=true):void {if(this.disposed)return;this.disposed=true;if(typeof this.dialog.close==="function")this.dialog.close();this.dialog.remove();if(restoreFocus)this.options.restoreFocus();}
  /** Preserve raw unchanged spans; newly authored editor breaks use LF. No EOL conversion. */
  private captureEdit(fromInput=false):void {
    const next=this.value.value,before=fromInput?this.beforeEdit:undefined;this.beforeEdit=undefined;
    if(next.length>32768){this.candidate=undefined;return;}
    let prefix=0,suffix=0;
    if(before?.editor===this.editor&&next.startsWith(this.editor.slice(0,before.start))&&next.endsWith(this.editor.slice(before.end))&&next.length>=before.start+this.editor.length-before.end){
      prefix=before.start;suffix=this.editor.length-before.end;
    } else {
      // Fallback for edits without beforeinput: one deterministic minimal replacement.
      while(prefix<next.length&&prefix<this.editor.length&&next[prefix]===this.editor[prefix])prefix++;
      if(this.splitScalar(next,prefix))prefix--;
      while(suffix<next.length-prefix&&suffix<this.editor.length-prefix&&next[next.length-1-suffix]===this.editor[this.editor.length-1-suffix])suffix++;
      if(this.splitScalar(next,next.length-suffix)||this.splitScalar(this.editor,this.editor.length-suffix))suffix--;
    }
    // One normalized UTF16 boundary per editor unit; CRLF/CR each display as one LF.
    const offsets=[0];for(let i=0;i<this.literal.length;){i+=this.literal[i]==="\r"&&this.literal[i+1]==="\n"?2:1;offsets.push(i);}
    const literal=this.literal.slice(0,offsets[prefix])+next.slice(prefix,next.length-suffix)+this.literal.slice(offsets[this.editor.length-suffix]);
    this.candidate=this.validLiteral(literal)?literal:undefined;
    // Track byte-invalid drafts too, so repair/disjoint edits retain untouched breaks.
    // Editor units stay <=32K; only original CRLFs add raw units (at most another32K).
    this.literal=literal;this.editor=next;
  }
  private splitScalar(text:string,offset:number):boolean {return offset>0&&offset<text.length&&/[\uD800-\uDBFF]/.test(text[offset-1]!)&&/[\uDC00-\uDFFF]/.test(text[offset]!);}
  private validLiteral(value:string):boolean {return value.length<=32768&&!value.includes("\0")&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)&&new TextEncoder().encode(value).length<=32768;}
  private valid():boolean {return this.candidate!==undefined&&this.validLiteral(this.candidate);}
  private validate():void {const valid=this.valid();this.copy.disabled=!valid||this.pending;this.value.setAttribute("aria-invalid",String(!valid));this.feedback.textContent=valid?"":"Use at most 32 KiB of complete text without NUL characters.";}
}
