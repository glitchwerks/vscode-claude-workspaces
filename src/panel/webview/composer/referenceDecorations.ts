import { StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, hoverTooltip, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import type { ComposerCommand } from "../../../composer/composerTypes";
import type { ComposerFileValidation } from "../../../composer/composerReferences";
import { parseComposerReferences } from "./references";

export interface ComposerReferenceContext {
  readonly commands:readonly ComposerCommand[]|undefined;
  readonly files:readonly ComposerFileValidation[];
}
export function annotateComposerReferences(text:string,context:ComposerReferenceContext) {
  const commands=new Map(context.commands?.map(command=>[command.invocation,command]));
  const files=new Map(context.files.map(file=>[file.value,file.status]));
  return parseComposerReferences(text).map(reference=>{
    const command=reference.kind==="command"?commands.get(reference.value):undefined;
    const fileStatus=reference.kind==="file"?files.get(reference.value):undefined;
    const invalid=reference.complete && (reference.kind==="command"?context.commands!==undefined && command===undefined:fileStatus==="missing");
    const message=reference.kind==="command"?(invalid?`Unknown skill or command: ${reference.value}`:command?.description ?? "Command catalog unavailable or invocation incomplete")
      :invalid?`File not found: ${reference.value}`:fileStatus==="valid"?reference.value:"File reference not verified";
    return {reference,recognized:reference.kind==="command"?command!==undefined:true,invalid,message};
  });
}
export const composerReferenceContext=StateEffect.define<ComposerReferenceContext>();
const contextField=StateField.define<ComposerReferenceContext>({
  create:()=>({commands:undefined,files:[]}),
  update(value,transaction){
    if(transaction.docChanged)value={...value,files:[]};
    for(const effect of transaction.effects)if(effect.is(composerReferenceContext))value=effect.value;
    return value;
  }
});
function decorations(view:EditorView):DecorationSet {
  const annotations=annotateComposerReferences(view.state.doc.toString(),view.state.field(contextField));
  return Decoration.set(annotations.map(({reference,recognized,invalid,message})=>Decoration.mark({
    class:`cm-composer-reference${recognized?` cm-composer-${reference.kind}`:""}${invalid?" cm-composer-reference-invalid":""}`,
    attributes:{title:message,"data-reference-kind":reference.kind}
  }).range(reference.from,reference.to)),true);
}
export const composerReferenceExtensions:Extension=[contextField,ViewPlugin.fromClass(class {
  decorations:DecorationSet;
  constructor(view:EditorView){this.decorations=decorations(view);}
  update(update:ViewUpdate){if(update.docChanged || update.transactions.some(t=>t.effects.some(e=>e.is(composerReferenceContext))))this.decorations=decorations(update.view);}
},{decorations:plugin=>plugin.decorations}),hoverTooltip((view,pos)=>{
  const found=annotateComposerReferences(view.state.doc.toString(),view.state.field(contextField)).find(item=>item.reference.from<=pos && item.reference.to>=pos);
  if(!found)return null;
  return {pos:found.reference.from,end:found.reference.to,above:true,create(){const dom=view.dom.ownerDocument.createElement("div");dom.className="composer-reference-tooltip";dom.textContent=found.message;dom.setAttribute("role","tooltip");return {dom};}};
}),EditorView.baseTheme({
  ".cm-composer-command":{color:"var(--vscode-symbolIcon-functionForeground, var(--vscode-textLink-foreground))"},
  ".cm-composer-file":{color:"var(--vscode-symbolIcon-fileForeground, var(--vscode-textLink-foreground))"},
  ".cm-composer-reference-invalid":{textDecoration:"underline wavy var(--vscode-editorWarning-foreground)",textUnderlineOffset:"3px"},
  ".composer-reference-tooltip":{padding:"6px 8px",maxWidth:"420px",overflowWrap:"anywhere",color:"var(--vscode-editorHoverWidget-foreground)",backgroundColor:"var(--vscode-editorHoverWidget-background)"}
})];
