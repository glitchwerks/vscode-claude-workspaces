import assert from "node:assert/strict";
import path from "node:path";
import { isComposerFileExcluded } from "../../src/composer/composerFileExclusions";

describe("composer workspace exclusions",()=>{
  const root=path.resolve(".tmp/exclusion-root");
  it("matches configured glob and ancestor-folder exclusions without checking existence",async()=>{
    let checks=0;const exists=async()=>{checks++;return false;};
    assert.equal(await isComposerFileExcluded(path.join(root,"hidden","missing.ts"),root,{hidden:true},exists),true);
    assert.equal(await isComposerFileExcluded(path.join(root,"src","file.ts"),root,{"**/*.{js,ts}":true},exists),true);
    assert.equal(await isComposerFileExcluded(path.join(root,"src","file.ts"),root,{"**/*.ts":false},exists),false);
    assert.equal(checks,0);
  });
  it("honors sibling conditions without treating a missing sibling as an unconditional exclusion",async()=>{
    const calls:string[]=[];const exists=async(file:string)=>{calls.push(file);return file===path.join(root,"source.ts");};
    assert.equal(await isComposerFileExcluded(path.join(root,"source.js"),root,{"**/*.js":{when:"$(basename).ts"}},exists),true);
    assert.equal(await isComposerFileExcluded(path.join(root,"manual.js"),root,{"**/*.js":{when:"$(basename).ts"}},exists),false);
    assert.deepEqual(calls,[path.join(root,"source.ts"),path.join(root,"manual.ts")]);
  });
});
