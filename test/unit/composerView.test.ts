import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { createComposerView } from "../../src/panel/webview/composer/view";
import type { ComposerEditor, ComposerEditorOptions } from "../../src/panel/webview/composer/editor";
import type { ComposerHostMessage, ComposerWebviewMessage } from "../../src/panel/composerProtocol";
import type { DraftState } from "../../src/composer/composerTypes";
import { composerFirstUuid as id, composerSecondUuid as second, composerSession } from "../support/composerHarness";

const target={sessionId:"pty-one",claudeSessionId:id,generation:second};
const hydration:Extract<ComposerHostMessage,{type:"composerHydrate"}>={type:"composerHydrate",capability:{status:"available",target},session:composerSession(),visible:true,layout:{splitRatio:0.4},favorites:[],canSubmit:true};
function harness(){
  const dom=new JSDOM('<div id="parent"></div><button id="terminal">Terminal</button>');const document=dom.window.document;
  const messages:ComposerWebviewMessage[]=[];let options!:ComposerEditorOptions;let draft!:DraftState;let composing=false;let commands=0;
  const input=document.createElement("textarea");
  const editor:ComposerEditor={setDraft:(value)=>{draft=value;input.value=value.text;},getDraft:()=>draft,focus:()=>input.focus(),isComposing:()=>composing,
    find:()=>{commands++;},replace:()=>{commands++;},undo:()=>{commands++;},redo:()=>{commands++;},dispose:()=>input.remove()};
  const parent=document.querySelector<HTMLElement>("#parent")!;
  const view=createComposerView({parent,documentId:id,postMessage:m=>messages.push(m),focusTerminal:()=>document.querySelector<HTMLButtonElement>("#terminal")!.focus(),
    createEditor:o=>{options=o;draft=o.initialDraft;o.parent.append(input);return editor;},newRequestId:()=>second});
  view.hydrate(hydration);
  return {dom,document,parent,input,view,messages,editor,setComposing:(value:boolean)=>{composing=value;},edit:(text:string,revision:number)=>{draft={revision,text,selection:{anchor:0,head:text.length}};input.value=text;options.onChange(draft);},get commands(){return commands;}};
}
describe("embedded composer view",()=>{
  it("sends once through the native command, suppresses repeat/IME and keeps Enter local",()=>{
    const h=harness();h.view.handleHostMessage({type:"composerAction",documentId:id,target,action:"submit"});
    h.view.handleHostMessage({type:"composerAction",documentId:id,target,action:"submit"});
    assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,1);
    h.view.handleHostMessage({type:"composerSubmitResult",target,result:{status:"rejected",submissionId:second,reason:"dialog"}});
    h.setComposing(true);h.view.handleHostMessage({type:"composerAction",documentId:id,target,action:"submit"});
    assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,1);
    const event=new h.dom.window.KeyboardEvent("keydown",{key:"Enter",bubbles:true,cancelable:true});h.input.dispatchEvent(event);
    assert.equal(event.defaultPrevented,false);assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,1);
  });
  it("hides and shows without changing the draft, and rejects stale command documents",()=>{
    const h=harness();h.edit("keep me",2);
    h.view.handleHostMessage({type:"composerAction",documentId:second,action:"toggle"});assert.equal(h.parent.querySelector<HTMLElement>(".composer-pane")!.hidden,false);
    h.view.handleHostMessage({type:"composerAction",documentId:id,action:"toggle"});assert.equal(h.parent.querySelector<HTMLElement>(".composer-pane")!.hidden,true);
    h.view.handleHostMessage({type:"composerAction",documentId:id,action:"toggle"});assert.equal(h.editor.getDraft().text,"keep me");
  });
  it("does not pull focus or rebuild the editor for status and background messages",()=>{
    const h=harness();h.input.focus();h.view.handleHostMessage({type:"composerDraftStatus",target,revision:1,status:"saved"});
    assert.equal(h.document.activeElement,h.input);assert.equal(h.input.isConnected,true);
    h.document.querySelector<HTMLButtonElement>("#terminal")!.focus();h.view.hydrate(hydration);
    assert.equal(h.document.activeElement?.id,"terminal");
  });
  it("retains newer edits and rebases an equal-revision host clear conflict",()=>{
    const h=harness();h.edit("new local text",2);
    h.view.hydrate({...hydration,session:composerSession(id,"",2)});
    assert.equal(h.editor.getDraft().text,"new local text");assert.equal(h.editor.getDraft().revision,3);
    assert.ok(h.messages.some(m=>m.type==="composerDraftChanged" && m.draft.revision===3 && m.draft.text==="new local text"));
  });
  it("isolates stale targets and disables send for unsupported capability",()=>{
    const h=harness();h.view.hydrate({...hydration,canSubmit:false});
    h.view.handleHostMessage({type:"composerAction",documentId:id,target,action:"submit"});assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);
    assert.match(h.parent.textContent??"",/2\.1\.299/);
    h.view.hydrate({type:"composerHydrate",capability:{status:"unavailable",sessionId:"no-id",generation:second,reason:"unsupported-identity"},visible:true,layout:{splitRatio:0.4},favorites:[],canSubmit:false});
    h.view.handleHostMessage({type:"composerDraftStatus",target,revision:1,status:"saved"});
    assert.match(h.parent.textContent??"",/terminal/i);assert.equal(h.parent.querySelector<HTMLButtonElement>('[data-composer="send"]')!.disabled,true);
  });
  it("resizes with the keyboard, reports failed persistence and restores the normal split after expansion",()=>{
    const h=harness();const divider=h.parent.querySelector<HTMLElement>('[role="separator"]')!;
    divider.dispatchEvent(new h.dom.window.KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true,cancelable:true}));
    const layout=h.messages.find(m=>m.type==="composerLayoutChanged");assert.ok(layout?.type==="composerLayoutChanged");assert.equal(layout.splitRatio,0.45);
    h.view.handleHostMessage({type:"composerLayoutStatus",documentId:id,layout:{splitRatio:0.4},status:"error"});assert.match(h.parent.textContent??"",/split.*not saved/i);
    const expand=h.parent.querySelector<HTMLButtonElement>('[data-composer="expand"]')!;expand.click();expand.click();
    assert.equal(h.parent.style.getPropertyValue("--composer-ratio"),"0.4");
    h.view.hydrate({...hydration,layout:{splitRatio:0.6}});assert.equal(h.parent.style.getPropertyValue("--composer-ratio"),"0.6");
  });
  it("keeps unconfirmed delivery visible and does not change or retry the text",()=>{
    const h=harness();h.view.handleHostMessage({type:"composerSubmitResult",target,result:{status:"unconfirmed",submissionId:second}});
    assert.match(h.parent.textContent??"",/not confirmed/i);assert.equal(h.editor.getDraft().text,"first draft");
    assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);
  });
  it("routes writing commands without submitting and reports picker/editor focus",()=>{
    const h=harness();h.input.focus();
    for(const action of ["find","replace","undo","redo"] as const)h.view.handleHostMessage({type:"composerAction",documentId:id,target,action});
    assert.equal(h.commands,4);assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);
    assert.ok(h.messages.some(m=>m.type==="composerFocusChanged" && m.focused && !m.pickerFocused));
  });
  it("bounds pointer resizing and stops changing the split after the drag ends",()=>{
    const h=harness();const divider=h.parent.querySelector<HTMLElement>('[role="separator"]')!;
    h.parent.getBoundingClientRect=()=>({top:0,bottom:500,height:500,left:0,right:500,width:500,x:0,y:0,toJSON:()=>({})});
    const pointer=(type:string,clientY:number)=>{const event=new h.dom.window.MouseEvent(type,{clientY,bubbles:true,cancelable:true});Object.defineProperty(event,"pointerId",{value:1});divider.dispatchEvent(event);};
    pointer("pointerdown",250);pointer("pointermove",-100);pointer("pointerup",-100);pointer("pointermove",490);
    const layouts=h.messages.filter(m=>m.type==="composerLayoutChanged");assert.equal(layouts.length,1);
    assert.equal(layouts[0]?.splitRatio,0.75);
  });
});
