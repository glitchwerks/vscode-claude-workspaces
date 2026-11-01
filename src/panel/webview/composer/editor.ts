import { EditorState, type Transaction } from "@codemirror/state";
import { EditorView, keymap, drawSelection, type KeyBinding } from "@codemirror/view";
import { defaultKeymap, history, undo, redo, isolateHistory } from "@codemirror/commands";
import { search, openSearchPanel } from "@codemirror/search";
import { markdown } from "@codemirror/lang-markdown";
import { isDraftState, type DraftState } from "../../../composer/composerTypes";
import { composerReferenceContext, composerReferenceExtensions, type ComposerReferenceContext } from "./referenceDecorations";
import { autocompletion, completionKeymap, completionStatus, closeCompletion, startCompletion } from "@codemirror/autocomplete";
import { createComposerCompletionSource } from "./completion";

/** Modified keys/chords belong to the customizable native command registry. */
export const composerEditorKeymap:readonly KeyBinding[]=defaultKeymap.filter(binding=>
  [binding.key,binding.mac,binding.win,binding.linux].every(key=>!key || !/Ctrl-|Mod-|Alt-|Meta-|Cmd-/.test(key))
  && binding.key!=="Tab");

export interface ComposerDocument {
  readonly state:EditorState;
  dispatch(transaction:Transaction):void;
  getDraft():DraftState;
  setDraft(draft:DraftState,resetHistory?:boolean):void;
}

/** The actual CodeMirror document/history model can be tested without browser geometry. */
export function createComposerDocument(initial:DraftState,onChange:(draft:DraftState)=>void):ComposerDocument {
  let revision=initial.revision;
  const create=(draft:DraftState)=>EditorState.create({doc:draft.text,selection:draft.selection,extensions:[history(),markdown()]});
  let state=create(initial);
  const model:ComposerDocument={
    get state(){return state;},
    dispatch(transaction){
      state=transaction.state;
      if(transaction.docChanged || transaction.selection!==undefined){revision++;onChange(model.getDraft());}
    },
    getDraft(){const selection=state.selection.main;return {revision,text:state.doc.toString(),selection:{anchor:selection.anchor,head:selection.head}};},
    setDraft(draft,resetHistory=false){
      if(!isDraftState(draft))throw new TypeError("Invalid composer draft.");
      const current=model.getDraft();
      if(!resetHistory && current.text===draft.text && current.selection.anchor===draft.selection.anchor && current.selection.head===draft.selection.head){revision=draft.revision;return;}
      revision=draft.revision;state=resetHistory?create(draft):state.update({changes:{from:0,to:state.doc.length,insert:draft.text},selection:draft.selection,annotations:isolateHistory.of("full")}).state;
    }
  };
  return model;
}

export interface ComposerEditorOptions {
  readonly parent:HTMLElement;
  readonly initialDraft:DraftState;
  readonly onChange:(draft:DraftState)=>void;
}
export interface ComposerEditor {
  setReferenceContext(context:ComposerReferenceContext):void;
  setDraft(draft:DraftState,resetHistory?:boolean):void;
  getDraft():DraftState;
  focus():void;
  isComposing():boolean;
  isCompleting():boolean;
  find():void;
  replace():void;
  undo():void;
  redo():void;
  dispose():void;
}

/** Stable editor DOM; host hydration never focuses the editor or sends a prompt. */
export function createComposerEditor(options:ComposerEditorOptions):ComposerEditor {
  let revision=options.initialDraft.revision;
  let hydrating=false;
  let context:ComposerReferenceContext={commands:undefined,files:[]};
  const completionKeys=completionKeymap.filter(binding=>["Escape","ArrowDown","ArrowUp","PageDown","PageUp","Enter"].includes(binding.key??"")).map(binding=>({...binding,stopPropagation:true}));
  const extensions=[history(),markdown(),drawSelection(),search({top:true}),keymap.of([...completionKeys,...composerEditorKeymap]),EditorView.lineWrapping,composerReferenceExtensions,
    autocompletion({override:[createComposerCompletionSource(()=>context.commands)],defaultKeymap:false,activateOnTyping:true,interactionDelay:0}),
    EditorView.contentAttributes.of({"aria-label":"Prompt draft","spellcheck":"false"}),
    EditorView.domEventHandlers({keydown(event,view){
      if(event.isComposing || event.keyCode===229 || view.composing)event.stopPropagation();
      return false;
    }}),
    EditorView.updateListener.of(update=>{
      if(!hydrating && (update.docChanged || update.selectionSet)){
        revision++;options.onChange(read());
      }
    }),
    EditorView.theme({
      "&":{height:"100%",backgroundColor:"var(--vscode-editor-background)",color:"var(--vscode-editor-foreground)",fontSize:"var(--vscode-editor-font-size, 13px)"},
      ".cm-scroller":{overflow:"auto",fontFamily:"var(--vscode-editor-font-family, monospace)"},
      ".cm-content":{padding:"8px 10px",minHeight:"100%"},
      ".cm-cursor":{borderLeftColor:"var(--vscode-editorCursor-foreground)"},
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":{backgroundColor:"var(--vscode-editor-selectionBackground)"},
      ".cm-panels":{backgroundColor:"var(--vscode-editorWidget-background)",color:"var(--vscode-editorWidget-foreground)"},
      ".cm-textfield":{backgroundColor:"var(--vscode-input-background)",color:"var(--vscode-input-foreground)",border:"1px solid var(--vscode-input-border, transparent)"},
      "&.cm-focused":{outline:"none"}
    })
  ];
  const state=(draft:DraftState)=>EditorState.create({doc:draft.text,selection:draft.selection,extensions});
  const view=new EditorView({parent:options.parent,state:state(options.initialDraft)});
  function read():DraftState {const selection=view.state.selection.main;return {revision,text:view.state.doc.toString(),selection:{anchor:selection.anchor,head:selection.head}};}
  return {
    setReferenceContext(value){
      const changed=context.commands!==value.commands;context=value;
      if(changed)closeCompletion(view);
      view.dispatch({effects:composerReferenceContext.of(value)});
      if(changed && view.hasFocus && value.commands!==undefined)startCompletion(view);
    },
    setDraft(draft,resetHistory=false){
      if(!isDraftState(draft))throw new TypeError("Invalid composer draft.");
      const current=read();revision=draft.revision;
      if(!resetHistory && current.text===draft.text && current.selection.anchor===draft.selection.anchor && current.selection.head===draft.selection.head)return;
      hydrating=true;
      try{
        if(resetHistory)view.setState(state(draft));
        else view.dispatch({changes:{from:0,to:view.state.doc.length,insert:draft.text},selection:draft.selection,annotations:isolateHistory.of("full")});
      }finally{hydrating=false;}
    },
    getDraft:read,focus:()=>view.focus(),isComposing:()=>view.composing,isCompleting:()=>completionStatus(view.state)!==null,
    find:()=>{openSearchPanel(view);},
    replace:()=>{openSearchPanel(view);view.dom.querySelector<HTMLInputElement>('input[name="replace"]')?.focus();},
    undo:()=>{undo(view);},redo:()=>{redo(view);},dispose:()=>view.destroy()
  };
}
