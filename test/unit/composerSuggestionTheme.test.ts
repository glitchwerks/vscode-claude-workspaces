import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { createComposerEditor } from "../../src/panel/webview/composer/editor";

describe("composer suggestion theme",()=>{
  it("uses VS Code colors for the actual completion list, selected row and description",async()=>{
    const css=readFileSync(resolve("src/panel/webview/composer/styles.css"),"utf8");
    const dom=new JSDOM('<div class="composer-editor"></div>',{pretendToBeVisual:true});
    const globals={window:dom.window,document:dom.window.document,MutationObserver:dom.window.MutationObserver,
      Window:dom.window.Window,getComputedStyle:dom.window.getComputedStyle.bind(dom.window)};
    const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
    for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    dom.window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
    dom.window.Range.prototype.getBoundingClientRect=()=>new dom.window.DOMRect(0,0,1,16);
    let editor:ReturnType<typeof createComposerEditor>|undefined;
    try{
      editor=createComposerEditor({parent:dom.window.document.querySelector<HTMLElement>(".composer-editor")!,
        initialDraft:{revision:0,text:"/c",selection:{anchor:2,head:2}},onChange:()=>{}});
      editor.focus();editor.setReferenceContext({commands:[{invocation:"/context",description:"Context information",source:"builtin"}],files:[]});
      const deadline=Date.now()+1500;
      while(!dom.window.document.querySelector(".cm-completionInfo") && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
      // CodeMirror prepends its style module. Mount app CSS afterward so JSDOM's
      // stylesheet order agrees with the browser DOM cascade.
      const stylesheet=dom.window.document.createElement("style");stylesheet.textContent=css;
      dom.window.document.head.append(stylesheet);
      for(const selector of [".cm-tooltip-autocomplete",".cm-completionInfo"]){
        const popup=dom.window.document.querySelector(selector);assert.ok(popup,`Expected ${selector}`);
        const style=dom.window.getComputedStyle(popup);
        assert.match(style.backgroundColor,/var\(--vscode-editorSuggestWidget-background/i);
        assert.match(style.color,/var\(--vscode-editorSuggestWidget-foreground/i);
      }
      const selected=dom.window.document.querySelector(".cm-tooltip-autocomplete [aria-selected=true]");assert.ok(selected);
      const style=dom.window.getComputedStyle(selected);
      assert.match(style.backgroundColor,/var\(--vscode-editorSuggestWidget-selectedBackground/i);
      assert.match(style.color,/var\(--vscode-editorSuggestWidget-selectedForeground/i);
      assert.equal(editor.getDraft().text,"/c");
    }finally{
      editor?.dispose();dom.window.close();
      for(const [key,descriptor] of previous){if(descriptor===undefined)Reflect.deleteProperty(globalThis,key);else Object.defineProperty(globalThis,key,descriptor);}
    }
  });
});
