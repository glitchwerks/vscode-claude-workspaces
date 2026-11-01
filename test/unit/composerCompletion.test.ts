import assert from "node:assert/strict";
import { EditorState } from "@codemirror/state";
import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { createComposerCompletionSource } from "../../src/panel/webview/composer/completion";

describe("composer slash completion",()=>{
  it("offers exact effective invocations and replaces the whole command token while preserving arguments",()=>{
    const source=createComposerCompletionSource(()=>[{invocation:"/plugin:review",description:"Review",source:"plugin",plugin:"plugin"},{invocation:"/context",description:"Context",source:"builtin"}]);
    const result=source(new CompletionContext(EditorState.create({doc:"/plugin:re existing arguments"}),10,false)) as CompletionResult;
    assert.ok(result);assert.equal(result.from,0);assert.equal(result.to,10);
    assert.deepEqual(result.options.map(o=>o.label),["/plugin:review"]);
    assert.equal(result.options[0]?.detail,"plugin / plugin");assert.equal(typeof result.options[0]?.apply,"function");
  });
  it("does not offer commands in prose paths, fenced code or when the catalog is unavailable",()=>{
    for(const text of ["see /re","```\n/re\n```","https://example.com/re"]){
      const source=createComposerCompletionSource(()=>[{invocation:"/review",description:"Review",source:"builtin"}]);
      assert.equal(source(new CompletionContext(EditorState.create({doc:text}),text.length,false)),null);
    }
    assert.equal(createComposerCompletionSource(()=>undefined)(new CompletionContext(EditorState.create({doc:"/re"}),3,false)),null);
  });
  it("uses the current catalog after a session switch and offers all invocations after slash",()=>{
    let catalog=[{invocation:"/one",description:"One",source:"builtin"}];
    const source=createComposerCompletionSource(()=>catalog);
    const context=new CompletionContext(EditorState.create({doc:"/"}),1,false);
    assert.deepEqual((source(context) as CompletionResult).options.map(o=>o.label),["/one"]);
    catalog=[{invocation:"/two",description:"Two",source:"builtin"}];
    assert.deepEqual((source(context) as CompletionResult).options.map(o=>o.label),["/two"]);
  });
});
