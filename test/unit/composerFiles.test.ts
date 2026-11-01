import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { ComposerFiles, formatComposerFileReference } from "../../src/composer/composerFiles";
import { composerFirstUuid as id, composerSecondUuid as generation } from "../support/composerHarness";
const target={sessionId:"pty",claudeSessionId:id,generation};
describe("composer file references",()=>{
  it("validates explicit files without a picker and separates missing, excluded and escaped references",async()=>{
    const base=path.resolve(".tmp");await fs.mkdir(base,{recursive:true});const directory=await fs.mkdtemp(path.join(base,"composer-files-"));
    try{
      const root=path.join(directory,"root"),outside=path.join(directory,"outside");await fs.mkdir(root);await fs.mkdir(outside);
      await fs.writeFile(path.join(root,"present.ts"),"");await fs.writeFile(path.join(root,"excluded.ts"),"");
      await fs.symlink(outside,path.join(root,"escape"),process.platform==="win32"?"junction":"dir");
      const files=new ComposerFiles({isCurrent:()=>true,resolveScope:()=>({cwd:root,roots:[root]}),
        findFiles:async()=>{throw new Error("No search during linting");},pick:async()=>{throw new Error("No picker during linting");},isExcluded:file=>file.endsWith("excluded.ts")});
      assert.deepEqual(await files.validate(target,["present.ts","absent.ts","excluded.ts","escape/missing.ts","../outside/secret.ts","present.ts"]),[
        {value:"present.ts",status:"valid"},{value:"absent.ts",status:"missing"},{value:"excluded.ts",status:"unavailable"},
        {value:"escape/missing.ts",status:"unavailable"},{value:"../outside/secret.ts",status:"unavailable"}
      ]);
    }finally{assert.ok(directory.startsWith(base+path.sep));await fs.rm(directory,{recursive:true,force:true});}
  });
  it("withholds validation after session retirement and does not call filesystem APIs for invalid requests",async()=>{
    let current=true,calls=0;const root=path.resolve(".tmp");
    const files=new ComposerFiles({isCurrent:()=>current,resolveScope:()=>({cwd:root,roots:[root]}),findFiles:async()=>[],pick:async()=>undefined,
      realpath:async p=>{calls++;current=false;return p;}});
    assert.equal(await files.validate(target,["present.ts"]),undefined);
    calls=0;assert.equal(await files.validate(target,Array(101).fill("x")),undefined);assert.equal(calls,0);
  });
  it("quotes spaced relative Windows paths and keeps absolute cross-drive references explicit",()=>{
    assert.equal(formatComposerFileReference("C:\\project\\folder name\\file.md","C:\\project","win32"),'@"folder name/file.md"');
    assert.equal(formatComposerFileReference("I:\\shared\\file.md","C:\\project","win32"),'@"I:/shared/file.md"');
    assert.equal(formatComposerFileReference('/root/a"b','/root',"linux"),undefined);
    assert.equal(formatComposerFileReference('/root/a\nb','/root',"linux"),undefined);
  });
  it("bounds root-scoped results, honors exclusions and rejects a symlink escape",async()=>{
    const base=path.resolve(".tmp");await fs.mkdir(base,{recursive:true});const directory=await fs.mkdtemp(path.join(base,"composer-files-"));
    try{
      const root=path.join(directory,"root");const outside=path.join(directory,"outside");await fs.mkdir(root);await fs.mkdir(outside);
      const good=path.join(root,"file name.md");const excluded=path.join(root,"excluded.md");const secret=path.join(outside,"secret.md");
      await Promise.all([fs.writeFile(good,"fixture"),fs.writeFile(excluded,"fixture"),fs.writeFile(secret,"fixture")]);
      await fs.symlink(outside,path.join(root,"escape"),process.platform==="win32"?"junction":"dir");
      let observed:readonly {path:string}[]=[];const calls:{root:string;limit:number}[]=[];
      const files=new ComposerFiles({isCurrent:()=>true,resolveScope:()=>({cwd:root,roots:[root]}),
        findFiles:async(root,limit)=>{calls.push({root,limit});return [good,excluded,path.join(root,"escape","secret.md"),secret];},
        isExcluded:file=>file===excluded,pick:async items=>{observed=items;return items[0]?.path;}});
      assert.equal(await files.pick(target),'@"file name.md"');assert.equal(observed.length,1);assert.equal(observed[0]?.path,good);
      assert.deepEqual(calls,[{root,limit:100}]);
    }finally{
      assert.ok(directory.startsWith(base+path.sep) && path.basename(directory).startsWith("composer-files-"));
      await fs.rm(directory,{recursive:true,force:true});
    }
  });
  it("never returns a forged picker path, a directory or a late selection",async()=>{
    const root=path.resolve(".tmp");let current=true;let selection="forged";
    const files=new ComposerFiles({isCurrent:()=>current,resolveScope:()=>({cwd:root,roots:[root]}),
      findFiles:async()=>[path.join(root,"file.md"),root],realpath:async p=>p,isFile:async p=>p!==root,
      pick:async()=>{if(selection==="late")current=false;return selection;}});
    assert.equal(await files.pick(target),undefined);
    selection="late";assert.equal(await files.pick(target),undefined);
  });
  it("keeps result counts bounded before filesystem validation and handles cancellation/errors",async()=>{
    const root=path.resolve(".tmp");let validations=0;let items=0;
    const files=new ComposerFiles({isCurrent:()=>true,resolveScope:()=>({cwd:root,roots:[root]}),
      findFiles:async()=>Array.from({length:250},(_,n)=>path.join(root,`file-${n}.md`)),
      realpath:async p=>{validations++;return p;},isFile:async()=>true,pick:async rows=>{items=rows.length;return undefined;}});
    assert.equal(await files.pick(target),undefined);assert.equal(items,100);assert.ok(validations<=102);
    const denied=new ComposerFiles({isCurrent:()=>true,resolveScope:()=>({cwd:root,roots:[root]}),findFiles:async()=>{throw new Error("permission");},pick:async()=>{throw new Error("not reached");}});
    assert.equal(await denied.pick(target),undefined);
  });
  it("does not enumerate unrelated roots when the target is stale or unavailable",async()=>{
    let scans=0;
    const files=new ComposerFiles({isCurrent:()=>false,resolveScope:()=>({cwd:"I:/root",roots:["I:/root"]}),findFiles:async()=>{scans++;return [];},pick:async()=>undefined});
    assert.equal(await files.pick(target),undefined);assert.equal(scans,0);
  });
});
