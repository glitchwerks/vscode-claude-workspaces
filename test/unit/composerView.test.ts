import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createComposerView } from "../../src/panel/webview/composer/view";
import type { ComposerEditor, ComposerEditorOptions } from "../../src/panel/webview/composer/editor";
import type { ComposerHostMessage, ComposerWebviewMessage } from "../../src/panel/composerProtocol";
import type { DraftState } from "../../src/composer/composerTypes";
import { composerFirstUuid as id, composerSecondUuid as second, composerSession } from "../support/composerHarness";

const target={sessionId:"pty-one",claudeSessionId:id,generation:second};
const hydration:Extract<ComposerHostMessage,{type:"composerHydrate"}>={type:"composerHydrate",capability:{status:"available",target},session:composerSession(),visible:true,layout:{splitRatio:0.4},favorites:[],canSubmit:true};
function harness(){
  const dom=new JSDOM('<div id="parent"></div><button id="terminal">Terminal</button>');const document=dom.window.document;
  const messages:ComposerWebviewMessage[]=[];const links:string[]=[];let options!:ComposerEditorOptions;let draft!:DraftState;let composing=false;let commands=0;
  const input=document.createElement("textarea");
  const editor:ComposerEditor={setDraft:(value)=>{draft=value;input.value=value.text;},getDraft:()=>draft,focus:()=>input.focus(),isComposing:()=>composing,
    find:()=>{commands++;},replace:()=>{commands++;},undo:()=>{commands++;},redo:()=>{commands++;},dispose:()=>input.remove()};
  const parent=document.querySelector<HTMLElement>("#parent")!;
  const view=createComposerView({parent,documentId:id,postMessage:m=>messages.push(m),focusTerminal:()=>document.querySelector<HTMLButtonElement>("#terminal")!.focus(),
    createEditor:o=>{options=o;draft=o.initialDraft;o.parent.append(input);return editor;},newRequestId:()=>second,openExternal:(_target,uri)=>links.push(uri)});
  view.hydrate(hydration);
  return {dom,document,parent,input,view,messages,editor,links,setComposing:(value:boolean)=>{composing=value;},edit:(text:string,revision:number)=>{draft={revision,text,selection:{anchor:0,head:text.length}};input.value=text;options.onChange(draft);},get commands(){return commands;}};
}
describe("embedded composer view",()=>{
  it("uses the shared button dimensions for composer toolbar and send actions",()=>{
    const h=harness();const style=h.document.createElement("style");
    style.textContent=readFileSync(resolve("src/panel/webview/styles.css"),"utf8")+readFileSync(resolve("src/panel/webview/composer/styles.css"),"utf8");h.document.head.append(style);
    const reference=h.document.createElement("button");reference.textContent="Existing action";h.document.body.append(reference);
    const expected=h.dom.window.getComputedStyle(reference);
    for(const selector of ['[data-composer="expand"]','[data-composer="send"]']){
      const actual=h.dom.window.getComputedStyle(h.parent.querySelector(selector)!);
      assert.equal(actual.borderRadius,expected.borderRadius);assert.equal(actual.paddingBlockStart,expected.paddingBlockStart);
      assert.equal(actual.lineHeight,expected.lineHeight);
    }
  });
  it("keeps complete long skill labels available for search, hover, focus and insertion",()=>{
    const h=harness();h.parent.querySelector<HTMLButtonElement>('[data-composer="commands"]')!.click();
    const invocation="/plugin:"+"long-name-".repeat(20)+"unique-tail";
    const description="Very long description ".repeat(40);
    h.view.handleHostMessage({type:"composerCatalog",target,requestId:second,status:"ready",commands:[{invocation,description,source:"plugin",plugin:"long-plugin"}]});
    const search=h.parent.querySelector<HTMLInputElement>(".composer-picker input")!;search.value="unique-tail";search.dispatchEvent(new h.dom.window.Event("input"));
    const choose=h.parent.querySelector<HTMLButtonElement>("[data-invocation]")!;
    assert.ok(choose.title.includes(invocation));assert.ok(choose.title.includes(description));
    const detail=h.document.getElementById(choose.getAttribute("aria-describedby")!);
    assert.equal(detail?.getAttribute("role"),"tooltip");assert.ok(detail?.textContent?.includes(description));
    choose.focus();assert.equal(h.document.activeElement,choose);choose.click();
    assert.equal(h.editor.getDraft().text,invocation+" first draft");assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);
  });
  it("reports actual focus for the new target after session hydration",()=>{
    const h=harness();h.input.focus();h.messages.length=0;
    const next={...target,sessionId:"pty-two",claudeSessionId:second};
    h.view.hydrate({...hydration,capability:{status:"available",target:next},session:composerSession(second)});
    const focus=h.messages.filter(message=>message.type==="composerFocusChanged").at(-1);
    assert.ok(focus);assert.deepEqual(focus.target,next);assert.equal(focus.focused,true);assert.equal(focus.pickerFocused,false);
  });
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
  it("leaves a visible Show prompt editor action while hidden",()=>{
    const h=harness();h.input.focus();h.view.handleHostMessage({type:"composerAction",documentId:id,action:"toggle"});
    const show=h.parent.querySelector<HTMLButtonElement>('[data-composer="show"]');assert.ok(show);assert.equal(show.hidden,false);
    assert.equal(h.document.activeElement?.id,"terminal");show.click();assert.equal(show.hidden,true);
    assert.equal(h.document.activeElement,h.input);assert.equal(h.editor.getDraft().text,"first draft");
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
    const expand=h.parent.querySelector<HTMLButtonElement>('[data-composer="expand"]')!;
    assert.equal(expand.textContent,"Expand");expand.click();
    assert.equal(expand.textContent,"Collapse");assert.match(expand.title,/Collapse/);assert.equal(expand.getAttribute("aria-pressed"),"true");
    h.view.setVisible(false);h.view.setVisible(true);assert.equal(expand.textContent,"Collapse");expand.click();
    assert.equal(expand.textContent,"Expand");assert.match(expand.title,/Expand/);assert.equal(expand.getAttribute("aria-pressed"),"false");
    assert.equal(h.parent.style.getPropertyValue("--composer-ratio"),"0.4");
    h.view.hydrate({...hydration,layout:{splitRatio:0.6}});assert.equal(h.parent.style.getPropertyValue("--composer-ratio"),"0.6");
  });
  it("keeps unconfirmed delivery visible and does not change or retry the text",()=>{
    const h=harness();h.view.handleHostMessage({type:"composerSubmitResult",target,result:{status:"unconfirmed",submissionId:second}});
    assert.match(h.parent.textContent??"",/not confirmed/i);assert.equal(h.editor.getDraft().text,"first draft");
    assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);
  });
  it("does not let a held native send shortcut retry unconfirmed delivery",()=>{
    const h=harness();h.view.handleHostMessage({type:"composerAction",documentId:id,target,action:"submit"});
    h.view.handleHostMessage({type:"composerSubmitResult",target,result:{status:"unconfirmed",submissionId:second}});
    h.view.handleHostMessage({type:"composerAction",documentId:id,target,action:"submit"});
    assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,1);
    h.parent.querySelector<HTMLButtonElement>('[data-composer="send"]')!.click();
    assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,2);
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
  it("searches namespaced skills/commands and inserts one at the beginning without sending",()=>{
    const h=harness();h.parent.querySelector<HTMLButtonElement>('[data-composer="commands"]')!.click();
    const request=h.messages.find(m=>m.type==="composerRequestCatalog");assert.ok(request?.type==="composerRequestCatalog");
    h.view.handleHostMessage({type:"composerCatalog",target,requestId:request.requestId,status:"ready",commands:[
      {invocation:"/one:review",description:"Review",source:"plugin",plugin:"one"},{invocation:"/two:review",description:"Review",source:"plugin",plugin:"two"}]});
    const search=h.parent.querySelector<HTMLInputElement>(".composer-picker input")!;search.value="two:";search.dispatchEvent(new h.dom.window.Event("input",{bubbles:true}));
    const rows=h.parent.querySelectorAll<HTMLButtonElement>("[data-invocation]");assert.equal(rows.length,1);rows[0]!.click();
    assert.equal(h.editor.getDraft().text,"/two:review first draft");assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);
    assert.equal(h.document.activeElement,h.input);
  });
  it("retains unavailable favorites, does not substitute names and keeps manual editing usable",()=>{
    const h=harness();h.view.hydrate({...hydration,favorites:["/missing:review"]});
    h.parent.querySelector<HTMLButtonElement>('[data-composer="commands"]')!.click();
    h.view.handleHostMessage({type:"composerCatalog",target,requestId:second,status:"unavailable",commands:[]});
    assert.match(h.parent.textContent??"",/missing:review.*unavailable/i);
    assert.equal(h.parent.querySelector<HTMLButtonElement>("[data-invocation]")!.disabled,true);
    h.parent.querySelector<HTMLButtonElement>("[data-favorite]")!.click();
    assert.ok(h.messages.some(m=>m.type==="composerFavoriteChanged" && m.invocation==="/missing:review" && !m.enabled));
    h.edit("manual /missing:review",2);assert.equal(h.editor.getDraft().text,"manual /missing:review");
    assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);
  });
  it("ignores stale catalogs and file insertions after edits or session changes",()=>{
    const h=harness();h.parent.querySelector<HTMLButtonElement>('[data-composer="commands"]')!.click();
    h.view.handleHostMessage({type:"composerCatalog",target:{...target,generation:id},requestId:second,status:"ready",commands:[{invocation:"/wrong",description:"Wrong",source:"plugin"}]});
    assert.equal(h.parent.querySelectorAll("[data-invocation]").length,0);
    h.parent.querySelector<HTMLButtonElement>('[data-composer="file"]')!.click();h.edit("newer draft",2);
    h.view.handleHostMessage({type:"composerInsertText",target,requestId:second,expectedRevision:1,text:'@"file name.md"'});
    assert.equal(h.editor.getDraft().text,"newer draft");
    h.view.handleHostMessage({type:"composerInsertText",target,requestId:second,expectedRevision:2,text:'@"file name.md"'});
    assert.equal(h.editor.getDraft().text,'@"file name.md"');assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);
  });
  it("previews the source without changing selection or undo, and routes safe links to the host",()=>{
    const h=harness();h.edit('# Draft\n\n[docs](https://example.com/docs)\n\n![image](https://example.com/secret.png)',2);
    const before=h.editor.getDraft();h.parent.querySelector<HTMLButtonElement>('[data-composer="preview"]')!.click();
    assert.equal(h.parent.querySelector(".composer-preview h1")?.textContent,"Draft");assert.equal(h.parent.querySelectorAll(".composer-preview img").length,0);
    let forwarded=0;h.dom.window.addEventListener("click",event=>{if((event.target as Element|null)?.closest("a[href]"))forwarded++;});
    h.parent.querySelector<HTMLAnchorElement>(".composer-preview a")!.click();assert.deepEqual(h.links,["https://example.com/docs"]);assert.equal(forwarded,0,"the outer webview must not open the same link a second time");
    h.parent.querySelector<HTMLButtonElement>('[data-composer="preview"]')!.click();assert.deepEqual(h.editor.getDraft(),before);
    assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);
  });
  it("resets the closed-session UI without deleting or replacing the saved source",()=>{
    const h=harness();h.view.handleHostMessage({type:"composerReset",documentId:id});
    assert.equal(h.parent.querySelector<HTMLElement>(".composer-pane")!.hidden,true);
    assert.equal(h.parent.querySelector<HTMLButtonElement>('[data-composer="show"]')!.hidden,true);
    h.view.handleHostMessage({type:"composerAction",documentId:id,target,action:"submit"});assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);
    h.view.hydrate(hydration);assert.equal(h.editor.getDraft().text,"first draft");
  });
  it("offers explicit Replace/Append history choices and never sends on recall",()=>{
    const h=harness();h.view.hydrate({...hydration,session:{...composerSession(),recent:["accepted earlier"]}});
    h.parent.querySelector<HTMLButtonElement>('[data-composer="recent"]')!.click();
    assert.match(h.parent.querySelector(".composer-history")?.textContent??"",/Replace.*Append/);
    h.parent.querySelector<HTMLButtonElement>('[data-history-mode="append"]')!.click();
    assert.ok(h.messages.some(m=>m.type==="composerHistorySelected" && m.index===0 && m.mode==="append" && m.expectedRevision===1));
    assert.equal(h.messages.filter(m=>m.type==="composerSubmit").length,0);assert.equal(h.editor.getDraft().text,"first draft");
  });
  it("explains accepted prompts omitted from bounded recent history without truncating the draft",()=>{
    const h=harness();const text="x".repeat(262_145);h.edit(text,2);
    h.view.handleHostMessage({type:"composerAction",target,documentId:id,action:"submit"});
    h.view.handleHostMessage({type:"composerSubmitResult",target,result:{status:"accepted",submissionId:second,revision:2}});
    assert.match(h.parent.textContent??"",/too large for recent history/i);assert.equal(h.editor.getDraft().text,text);
  });
});
