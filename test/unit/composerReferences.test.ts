import assert from "node:assert/strict";
import { parseComposerReferences } from "../../src/panel/webview/composer/references";
import { annotateComposerReferences } from "../../src/panel/webview/composer/referenceDecorations";

describe("composer reference tokens",()=>{
  it("flags only confirmed invalid references and leaves unavailable catalogs and files advisory",()=>{
    const text='/unknown @"gone.ts" @"denied.ts"';
    const known=annotateComposerReferences(text,{commands:[],files:[{value:"gone.ts",status:"missing"},{value:"denied.ts",status:"unavailable"}]});
    assert.deepEqual(known.map(a=>a.invalid),[true,true,false]);
    assert.match(known[0]!.message,/Unknown/);assert.match(known[1]!.message,/not found/);
    assert.equal(annotateComposerReferences('/unknown ',{commands:undefined,files:[]})[0]?.invalid,false);
    assert.equal(annotateComposerReferences('/partial',{commands:[],files:[]})[0]?.invalid,false);
    assert.equal(annotateComposerReferences('/review ',{commands:[{invocation:"/review",description:"Review",source:"builtin"}],files:[]})[0]?.recognized,true);
  });
  it("finds the leading native invocation and quoted/unquoted paths without changing offsets",()=>{
    const text='/one:review inspect @"folder name/a.ts" and @src\\main.ts next';
    assert.deepEqual(parseComposerReferences(text),[
      {from:0,to:11,kind:"command",value:"/one:review",complete:true},
      {from:20,to:39,kind:"file",value:"folder name/a.ts",complete:true},
      {from:44,to:56,kind:"file",value:"src\\main.ts",complete:true}
    ]);
  });
  it("ignores prose slash paths, emails, URLs and references in Markdown code",()=>{
    assert.deepEqual(parseComposerReferences('See /review https://example.com/@x mail@host.test `@inline`\n```ts\n@fenced\n```\n~~~\n@other\n~~~'),[]);
    assert.deepEqual(parseComposerReferences('`multiline\n@inside-code\n` then @"real.ts"'),[{from:31,to:41,kind:"file",value:"real.ts",complete:true}]);
  });
  it("keeps unfinished tokens non-final and resumes after fenced code",()=>{
    assert.deepEqual(parseComposerReferences('/'),[{from:0,to:1,kind:"command",value:"/",complete:false}]);
    assert.deepEqual(parseComposerReferences('```\n@skip\n```\n@"open'),[{from:14,to:20,kind:"file",value:"open",complete:false}]);
    assert.deepEqual(parseComposerReferences('@next'),[{from:0,to:5,kind:"file",value:"next",complete:false}]);
  });
  it("bounds references and accepts a large draft without scanning unbounded input",()=>{
    assert.equal(parseComposerReferences('@x '.repeat(500)).length,100);
    assert.deepEqual(parseComposerReferences('x'.repeat(1_048_577)),[]);
  });
  it("uses UTF-16 offsets and does not treat an escaped at-sign as a reference",()=>{
    assert.deepEqual(parseComposerReferences('😀 \\@skip @"a.ts"'),[{from:10,to:17,kind:"file",value:"a.ts",complete:true}]);
  });
});
