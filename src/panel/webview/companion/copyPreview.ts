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
  private pending=false;
  private disposed=false;

  constructor(root:HTMLElement,private readonly options:CopyPreviewOptions) {
    const document=root.ownerDocument;
    this.dialog=document.createElement("dialog");this.dialog.className="companion-review";
    this.dialog.setAttribute("aria-label","Review "+options.label);this.dialog.setAttribute("aria-modal","true");
    const heading=document.createElement("h2");heading.textContent="Review before copying";
    const label=document.createElement("label");label.textContent=options.label;
    this.value=document.createElement("textarea");this.value.value=options.value;this.value.setAttribute("aria-label","Value to copy");this.value.spellcheck=false;
    label.append(this.value);
    this.feedback=document.createElement("p");this.feedback.setAttribute("role","status");
    const controls=document.createElement("div");controls.className="companion-review-actions";
    this.copy=document.createElement("button");this.copy.type="button";this.copy.textContent="Copy";this.copy.setAttribute("aria-label","Copy reviewed value");
    const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancel";
    this.copy.addEventListener("click",()=>{if(this.valid()&&!this.pending&&!this.disposed)options.copy(this.value.value);});
    cancel.addEventListener("click",()=>{if(!this.disposed)options.cancel();});
    this.value.addEventListener("input",()=>this.validate());
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
  private valid():boolean {const value=this.value.value;return value.length<=32768&&!value.includes("\0")&&!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)&&new TextEncoder().encode(value).length<=32768;}
  private validate():void {const valid=this.valid();this.copy.disabled=!valid||this.pending;this.value.setAttribute("aria-invalid",String(!valid));this.feedback.textContent=valid?"":"Use at most 32 KiB of complete text without NUL characters.";}
}
