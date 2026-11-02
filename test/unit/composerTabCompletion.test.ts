import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { EditorView } from "@codemirror/view";
import { closeCompletion, selectedCompletion } from "@codemirror/autocomplete";
import { createComposerEditor } from "../../src/panel/webview/composer/editor";
import type { DraftState } from "../../src/composer/composerTypes";

async function withEditor(run:(h:{editor:ReturnType<typeof createComposerEditor>;view:EditorView;document:Document;press:(init:KeyboardEventInit)=>KeyboardEvent;forwarded:()=>number})=>void|Promise<void>){
  const dom=new JSDOM('<button>Before</button><div id="editor"></div><button>After</button>',{pretendToBeVisual:true});
  const globals={window:dom.window,document:dom.window.document,MutationObserver:dom.window.MutationObserver,
    Window:dom.window.Window,getComputedStyle:dom.window.getComputedStyle.bind(dom.window)};
  const previous=new Map(Object.keys(globals).map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  for(const [key,value] of Object.entries(globals))Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
  dom.window.Range.prototype.getClientRects=()=>[] as unknown as DOMRectList;
  dom.window.Range.prototype.getBoundingClientRect=()=>new dom.window.DOMRect(0,0,1,16);
  let editor:ReturnType<typeof createComposerEditor>|undefined;
  try{
    let forwarded=0;dom.window.document.addEventListener("keydown",()=>{forwarded++;});
    const changes:DraftState[]=[];
    editor=createComposerEditor({parent:dom.window.document.querySelector<HTMLElement>("#editor")!,
      initialDraft:{revision:0,text:"/con argument",selection:{anchor:4,head:4}},onChange:draft=>changes.push(draft)});
    const view=EditorView.findFromDOM(dom.window.document.querySelector<HTMLElement>(".cm-editor")!)!;
    editor.focus();editor.setReferenceContext({commands:[{invocation:"/context",description:"Context",source:"builtin"}],files:[]});
    const deadline=Date.now()+1000;
    while(selectedCompletion(view.state)===null && Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,5));
    assert.equal(selectedCompletion(view.state)?.label,"/context","Expected a selected suggestion before pressing a key");
    const press=(init:KeyboardEventInit)=>{const event=new dom.window.KeyboardEvent("keydown",{bubbles:true,cancelable:true,...init});view.contentDOM.dispatchEvent(event);return event;};
    await run({editor,view,document:dom.window.document,press,forwarded:()=>forwarded});
  }finally{
    editor?.dispose();dom.window.close();
    for(const [key,descriptor] of previous){if(descriptor===undefined)Reflect.deleteProperty(globalThis,key);else Object.defineProperty(globalThis,key,descriptor);}
  }
}

describe("composer completion keyboard handling",()=>{
  for(const key of ["Tab","Enter"]){
    it(`accepts the selected suggestion with ${key}, preserving focus, arguments and one-step undo`,async()=>{
      await withEditor(({editor,view,document,press,forwarded})=>{
        const event=press({key,code:key});
        assert.equal(event.defaultPrevented,true,`${key} must be owned by the selected suggestion`);
        assert.equal(forwarded(),0);assert.equal(document.activeElement,view.contentDOM);
        assert.equal(editor.getDraft().text,"/context argument");
        assert.deepEqual(editor.getDraft().selection,{anchor:9,head:9});
        editor.undo();assert.equal(editor.getDraft().text,"/con argument");
        editor.redo();assert.equal(editor.getDraft().text,"/context argument");
      });
    });
  }
  it("leaves Tab available for focus navigation when suggestions are closed",async()=>{
    await withEditor(({editor,view,press,forwarded})=>{
      closeCompletion(view);const before=editor.getDraft();
      assert.equal(press({key:"Tab",code:"Tab"}).defaultPrevented,false);
      assert.equal(forwarded(),1);assert.deepEqual(editor.getDraft(),before);
    });
  });
  it("does not intercept Shift+Tab or modified Tab bindings while suggestions are open",async()=>{
    await withEditor(({editor,press,forwarded})=>{
      const before=editor.getDraft();
      for(const modifier of [{shiftKey:true},{ctrlKey:true},{altKey:true},{metaKey:true}]){
        assert.equal(press({key:"Tab",code:"Tab",...modifier}).defaultPrevented,false);
      }
      assert.equal(forwarded(),4);assert.deepEqual(editor.getDraft(),before);
    });
  });
  for(const signal of ["event flag","key code 229"]){
    it(`does not accept a suggestion during IME composition signaled by ${signal}`,async()=>{
      await withEditor(({editor,press})=>{
        const before=editor.getDraft();press({key:"Tab",code:"Tab",
          ...(signal==="event flag"?{isComposing:true}:signal==="key code 229"?{keyCode:229}:{})});
        assert.deepEqual(editor.getDraft(),before);
      });
    });
  }
});
