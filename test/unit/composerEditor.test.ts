import assert from "node:assert/strict";
import { undo, redo, insertNewlineAndIndent } from "@codemirror/commands";
import { JSDOM } from "jsdom";
import { createComposerDocument, createComposerEditor, composerEditorKeymap } from "../../src/panel/webview/composer/editor";
import type { DraftState } from "../../src/composer/composerTypes";

describe("composer editor document",()=>{
  it("preserves real editor undo/redo for command, file and recent-prompt replacements",()=>{
    const dom=new JSDOM('<div id="editor"></div>',{pretendToBeVisual:true});
    const globals={window:dom.window,document:dom.window.document,MutationObserver:dom.window.MutationObserver};
    const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
    for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    let editor:ReturnType<typeof createComposerEditor>|undefined;
    try{
      let changes=0;editor=createComposerEditor({parent:dom.window.document.querySelector<HTMLElement>("#editor")!,initialDraft:{revision:0,text:"draft",selection:{anchor:5,head:5}},onChange:()=>{changes++;}});
      let revision=0;
      for(const text of ["/review draft",'draft @"fixture file.txt"',"recalled replacement","draft\nrecalled append"]){
        editor.setDraft({revision:++revision,text,selection:{anchor:text.length,head:text.length}});
        const before=changes;editor.undo();assert.equal(editor.getDraft().text,"draft");assert.equal(changes,before+1);
        editor.redo();assert.equal(editor.getDraft().text,text);
        editor.setDraft({revision:++revision,text:"draft",selection:{anchor:5,head:5}},true);
      }
    }finally{
      editor?.dispose();dom.window.close();
      for(const [key,descriptor] of previous){if(descriptor===undefined)Reflect.deleteProperty(globalThis,key);else Object.defineProperty(globalThis,key,descriptor);}
    }
  });
  it("keeps same-session command insertion undoable without losing preceding edits",()=>{
    const model=createComposerDocument({revision:0,text:"draft",selection:{anchor:5,head:5}},()=>{});
    model.dispatch(model.state.update({changes:{from:5,insert:" text"}}));
    model.setDraft({revision:2,text:"/review draft text",selection:{anchor:8,head:8}});
    assert.equal(undo(model),true);assert.equal(model.getDraft().text,"draft text");
    assert.equal(undo(model),true);assert.equal(model.getDraft().text,"draft");
    assert.equal(redo(model),true);assert.equal(model.getDraft().text,"draft text");
  });
  it("edits multiline Unicode text, selection and undo without depending on DOM geometry",()=>{
    const changes:DraftState[]=[];
    const model=createComposerDocument({revision:1,text:"first",selection:{anchor:5,head:5}},draft=>changes.push(draft));
    model.dispatch(model.state.update({changes:{from:5,insert:"\n😀 second"},selection:{anchor:15}}));
    assert.equal(model.getDraft().text,"first\n😀 second");assert.equal(model.getDraft().revision,2);
    assert.equal(undo(model),true);assert.equal(model.getDraft().text,"first");
    assert.equal(redo(model),true);assert.equal(model.getDraft().text,"first\n😀 second");
    assert.equal(changes.length,3);
  });
  it("keeps host hydration out of change callbacks and isolates session undo history",()=>{
    let changes=0;const initial={revision:1,text:"one",selection:{anchor:3,head:3}};
    const model=createComposerDocument(initial,()=>{changes++;});
    model.dispatch(model.state.update({changes:{from:3,insert:" two"}}));
    model.setDraft({revision:4,text:"other session",selection:{anchor:1,head:5}},true);
    assert.equal(undo(model),false);assert.equal(model.getDraft().revision,4);
    assert.deepEqual(model.getDraft().selection,{anchor:1,head:5});assert.equal(changes,1);
  });
  it("leaves modified shortcuts to native VS Code routing and keeps plain Enter",()=>{
    assert.ok(composerEditorKeymap.some(binding=>binding.key==="Enter"));
    for(const binding of composerEditorKeymap) for(const key of [binding.key,binding.win,binding.mac,binding.linux]) {
      if(key)assert.doesNotMatch(key,/Ctrl-|Mod-|Alt-|Meta-|Cmd-/);
    }
  });
  it("inserts a newline with CodeMirror's Enter command without emitting a send",()=>{
    const drafts:DraftState[]=[];const model=createComposerDocument({revision:1,text:"first",selection:{anchor:5,head:5}},draft=>drafts.push(draft));
    assert.equal(insertNewlineAndIndent(model),true);assert.equal(model.getDraft().text,"first\n");assert.equal(drafts.length,1);
  });
});
