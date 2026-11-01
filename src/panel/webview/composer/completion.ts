import { insertCompletionText, type CompletionSource } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { ComposerCommand } from "../../../composer/composerTypes";
import { parseComposerReferences } from "./references";

/** Suggest only authenticated native invocations at Claude's leading-command position. */
export function createComposerCompletionSource(readCatalog:()=>readonly ComposerCommand[]|undefined):CompletionSource {
  return context=>{
    const commands=readCatalog();if(commands===undefined || context.state.selection.main.empty===false)return null;
    const reference=parseComposerReferences(context.state.doc.toString()).find(r=>r.kind==="command" && r.from<context.pos && r.to>=context.pos);
    if(!reference)return null;
    const prefix=context.state.sliceDoc(reference.from,context.pos).toLowerCase();
    const options=commands.filter(command=>command.invocation.toLowerCase().startsWith(prefix)).map(command=>({
      label:command.invocation,type:"function",detail:`${command.source}${command.plugin?` / ${command.plugin}`:""}`,info:command.description,
      apply(view:EditorView){
        const current=parseComposerReferences(view.state.doc.toString()).find(r=>r.kind==="command" && r.from===reference.from);
        if(!current || !readCatalog()?.some(c=>c.invocation===command.invocation))return;
        const suffix=view.state.sliceDoc(current.to,current.to+1);
        const text=command.invocation+(suffix && /\s/u.test(suffix)?"":" ");
        const transaction=insertCompletionText(view.state,text,current.from,current.to);
        view.dispatch({...transaction,selection:{anchor:current.from+command.invocation.length+1},userEvent:"input.complete"});
      }
    }));
    return options.length?{from:reference.from,to:reference.to,options}:null;
  };
}
