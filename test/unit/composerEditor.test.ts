import assert from "node:assert/strict";
import { undo, redo, insertNewlineAndIndent } from "@codemirror/commands";
import { createComposerDocument, composerEditorKeymap } from "../../src/panel/webview/composer/editor";
import type { DraftState } from "../../src/composer/composerTypes";

describe("composer editor document",()=>{
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
