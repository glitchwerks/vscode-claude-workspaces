import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as codec from "../../src/companion/companionTypes";
import { companionHarness, CaptureFixtureFileSystem, fixtureTarget, diskCompanionHarness } from "../support/companionHarness";
import { lstat, readFile, writeFile, symlink, link } from "node:fs/promises";
import { CompanionCapture } from "../../src/companion/companionCapture";
import type { CaptureResourceResult } from "../../src/companion/companionCapture";
import type { CaptureBinding } from "../../src/companion/companionTypes";

function accepted<T>(result:CaptureResourceResult<T>):T {
  assert.equal(result.ok,true,JSON.stringify(result));
  if(!result.ok) throw new Error("expected accepted operation");
  return result.value;
}

describe("companion owned resources",()=>{
  it("creates exclusive private ownership and removes inherited capture keys on an inactive overlay",async()=>{
    const {host,fs}=companionHarness();
    const binding=accepted(await host.prepare());
    assert.ok(Object.isFrozen(binding)&&Object.isFrozen(binding.marker));
    assert.match(binding.directory,/companion-[a-f0-9]{32}$/);
    assert.match(binding.token,/^[A-Za-z0-9_-]{43}$/);
    const marker=JSON.parse(Buffer.from(await fs.read(resolve(binding.directory,"ownership.json"),1024)).toString());
    assert.deepEqual(marker,{v:1,kind:"claude-workspaces-companion",hostId:"01".repeat(16),processId:4242,channelId:"02".repeat(16),...fixtureTarget});
    const inherited={AUTH:"private-auth",UNRELATED:"keep",...Object.fromEntries(codec.captureEnvironmentKeys.map(key=>[key,"inherited"]))};
    assert.deepEqual(host.environment(inherited),{AUTH:"private-auth",UNRELATED:"keep"});
    const env=host.environment(inherited,binding);
    assert.equal(env.CLAUDE_WORKSPACES_CAPTURE_TOKEN,binding.token);
    assert.equal(env.AUTH,"private-auth");
    assert.equal(codec.decodeCaptureLaunchBinding(env).ok,true);
    assert.equal((await host.validateOwner({...binding} as CaptureBinding)).ok,false);
    assert.equal(host.markProducerExposed({...binding} as CaptureBinding),false);
  });
  it("unpublished cancellation deletes only the held owner and aborts content work first",async()=>{
    const {host,fs}=companionHarness();const binding=accepted(await host.prepare());
    let stopped=false;host.signal(binding)!.addEventListener("abort",()=>{stopped=true;});
    fs.before=(operation)=>{if(operation==="unlink")assert.equal(stopped,true);};
    accepted(await host.revoke(binding));
    assert.equal(fs.entries.has(binding.directory),false);
    assert.deepEqual(host.environment({KEEP:"yes"},binding),{KEEP:"yes"});
  });
  it("exposure latches once and revocation retains until exact binding exit confirmation",async()=>{
    const {host,fs}=companionHarness();const binding=accepted(await host.prepare());
    assert.equal(host.markProducerExposed(binding),true);
    assert.equal(host.markProducerExposed(binding),false);
    accepted(await host.revoke(binding));assert.equal(fs.entries.has(binding.directory),true);
    host.confirmManagedPtyExit({...binding} as CaptureBinding);await host.settled(binding);
    assert.equal(fs.entries.has(binding.directory),true);
    host.confirmManagedPtyExit(binding);await host.settled(binding);
    assert.equal(fs.entries.has(binding.directory),false);
    assert.doesNotThrow(()=>host.confirmManagedPtyExit(binding));
  });
  it("exit before revocation cleans only its retired generation",async()=>{
    const {host,fs,setTarget}=companionHarness();const old=accepted(await host.prepare());host.markProducerExposed(old);
    setTarget({...fixtureTarget,generation:"generation-B"});const current=accepted(await host.prepare());
    host.confirmManagedPtyExit(old);await host.settled(old);
    assert.equal(fs.entries.has(old.directory),false);assert.equal(fs.entries.has(current.directory),true);
    accepted(await host.validateOwner(current));
  });
  it("rechecks managed identity after asynchronous creation without adopting a replacement target",async()=>{
    const {host,fs,setTarget}=companionHarness();
    fs.before=(op)=>{if(op==="write")setTarget({...fixtureTarget,generation:"changed"});};
    assert.equal((await host.prepare()).ok,false);
    assert.equal([...fs.entries.keys()].filter(p=>p.includes("companion-01")||p.includes("companion-02")).length,0);
  });
  it("uses fresh IDs on collisions and never adopts existing files",async()=>{
    const {host,fs}=companionHarness();const collision=resolve(fs.root,"companion-"+"02".repeat(16));
    fs.put(collision,"directory");fs.put(resolve(collision,"private"),"file","sentinel");
    const b=accepted(await host.prepare());assert.notEqual(b.directory,collision);
    assert.equal(Buffer.from(await fs.read(resolve(collision,"private"),99)).toString(),"sentinel");
  });
  for(const item of JSON.parse(readFileSync(resolve(__dirname,"../../../test/fixtures/companion/capture-cases.json"),"utf8")).ownershipExamples as {
    id:string;operation:string;markerSerialized:string|null;context:{directoryBasename:string;markerBytesBase64?:string;linkedAncestor:boolean;markerIsLinkOrReparse:boolean};expected:{admit:boolean}
  }[]) {
    if(item.operation!=="admit-current")continue;
    it(item.id+" applies marker/path input to actual owner admission",async()=>{
      let random=0;const {host,fs}=companionHarness({randomBytes:size=>Buffer.alloc(size,++random===1?0xcc:random===2?parseInt(item.context.directoryBasename.slice(-2),16):0xee)});
      const binding=accepted(await host.prepare());const path=resolve(binding.directory,"ownership.json");
      fs.overwrite(path,item.context.markerBytesBase64?Buffer.from(item.context.markerBytesBase64,"base64"):item.markerSerialized!);
      if(item.context.linkedAncestor)fs.put(fs.root,"link","",resolve(fs.root,"elsewhere"));
      if(item.context.markerIsLinkOrReparse)fs.put(path,"link");
      assert.equal((await host.validateOwner(binding)).ok,item.expected.admit,item.id);
      assert.equal(fs.calls.filter(c=>c.operation==="unlink").length,0);
    });
  }
  for(const outcome of ["ESRCH","success","EPERM","EIO"]) {
    it("sweeps lost ownership only with ESRCH: "+outcome,async()=>{
      const {host,fs}=companionHarness();const binding=accepted(await host.prepare());
      const lost=new CompanionCapture({storageRoot:fs.root,fs,currentTarget:()=>fixtureTarget,probeProcess:pid=>{
        assert.equal(pid,4242);if(outcome!=="success")throw Object.assign(new Error("private probe"),{code:outcome});
      }});
      accepted(await lost.sweep());assert.equal(fs.entries.has(binding.directory),outcome!=="ESRCH");
    });
  }
  for(const name of ["unknown.txt","nested","frame."+"a".repeat(32)+".01.upload","frame."+"a".repeat(32)+".9007199254740992.upload"]) {
    it("prevalidates the entire child set before deleting: "+name,async()=>{
      const {host,fs}=companionHarness();const binding=accepted(await host.prepare());
      fs.put(resolve(binding.directory,"control.json"),"file","{}");
      fs.put(resolve(binding.directory,name),name==="nested"?"directory":"file","sentinel");
      await host.revoke(binding);
      assert.equal(fs.calls.filter(c=>c.operation==="unlink").length,0);
      assert.equal(fs.entries.has(resolve(binding.directory,"control.json")),true);
    });
  }
  it("validates all eight identity fields and rejects replacement marker inode",async()=>{
    for(const change of [{v:2},{kind:"other"},{hostId:"f".repeat(32)},{processId:4243},{channelId:"e".repeat(32)},
      {sessionId:"other"},{claudeSessionId:"22222222-2222-4222-8222-222222222222"},{generation:"other"}]) {
      const {host,fs}=companionHarness();const binding=accepted(await host.prepare());
      fs.overwrite(resolve(binding.directory,"ownership.json"),JSON.stringify({...binding.marker,...change}));
      assert.equal((await host.validateOwner(binding)).ok,false);
      await host.revoke(binding);assert.equal(fs.entries.has(binding.directory),true);
    }
    const {host,fs}=companionHarness();const binding=accepted(await host.prepare());
    fs.put(resolve(binding.directory,"ownership.json"),"file",JSON.stringify(binding.marker));
    assert.equal((await host.validateOwner(binding)).ok,false);
  });
  it("rejects a linked or redirected root before creating a channel",async()=>{
    for(const kind of ["link","directory"] as const) {
      const fs=new CaptureFixtureFileSystem();fs.put(fs.root,kind,"",resolve(fs.root,"redirect"));
      const host=new CompanionCapture({storageRoot:fs.root,fs,currentTarget:()=>fixtureTarget});
      assert.equal((await host.prepare()).ok,false);assert.equal(fs.calls.some(c=>c.operation==="mkdir"),false);
    }
  });
});

describe("companion resource budgets and controlled I/O",()=>{
  it("treats only confirmed ENOENT as not ready during an optional poll",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());
    const name=`request.${"a".repeat(32)}.ready`;
    assert.deepEqual(await host.readOptionalFile(b,name,4096),{ok:true,value:undefined});
    assert.equal(host.signal(b)!.aborted,false);
    fs.put(resolve(b.directory,name),"file","ready");
    const result=accepted(await host.readOptionalFile(b,name,4096));assert.equal(Buffer.from(result!).toString(),"ready");
    for(const error of ["EACCES","EIO"]) {
      const h=companionHarness();const owner=accepted(await h.host.prepare());
      h.fs.before=(op,path)=>{if(op==="stat"&&path.endsWith(name))throw Object.assign(new Error("private-error"),{code:error});};
      assert.equal((await h.host.readOptionalFile(owner,name,4096)).ok,false);
      assert.equal(h.host.signal(owner)!.aborted,true);
    }
    fs.overwrite(resolve(b.directory,"ownership.json"),"{}");
    assert.equal((await host.readOptionalFile(b,name,4096)).ok,false);assert.equal(host.signal(b)!.aborted,true);
    const slow=companionHarness({deadlineMs:15});const owner=accepted(await slow.host.prepare());
    let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});
    slow.fs.before=async(op,path)=>{if(op==="stat"&&path.endsWith(name))await gate;};
    const timedOut=await slow.host.readOptionalFile(owner,name,4096);
    assert.deepEqual(timedOut,{ok:false,reason:"cleanup"});assert.equal(slow.host.signal(owner)!.aborted,true);
    finish();await new Promise<void>(r=>setImmediate(r));
  });
  it("counts staged files together with held reservations for the same channel",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());
    for(let index=1;index<=7;index++)fs.put(resolve(b.directory,`frame.${"a".repeat(32)}.${index}.upload`),"file","x");
    accepted(await host.reserve(b,1,1));assert.equal((await host.reserve(b,1,1)).ok,false);
  });
  it("stops callbacks when reservation admission discovers a changed owner",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());const signal=host.signal(b)!;
    fs.overwrite(resolve(b.directory,"ownership.json"),"{}");
    assert.equal((await host.reserve(b,1,1)).ok,false);assert.equal(signal.aborted,true);
  });
  it("latches exit during in-flight content I/O, then cleans after the stopped operation settles",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());host.markProducerExposed(b);
    fs.put(resolve(b.directory,"ack.json"),"file","ack");
    let finish!:()=>void;let started!:()=>void;
    const gate=new Promise<void>(r=>{finish=r;});const entered=new Promise<void>(r=>{started=r;});
    fs.before=async(op,path)=>{if(op==="read"&&path.endsWith("ack.json")){started();await gate;}};
    const read=host.readFile(b,"ack.json",4096);await entered;
    host.confirmManagedPtyExit(b);assert.equal(host.signal(b)!.aborted,true);finish();
    assert.equal((await read).ok,false);await host.settled(b);assert.equal(fs.entries.has(b.directory),false);
  });
  it("promotes a host-computed frame once without overwriting a destination or accepting a path",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());const epoch="a".repeat(32);
    const upload=`frame.${epoch}.1.upload`;const committed=`frame.${epoch}.1.committed`;
    fs.put(resolve(b.directory,upload),"file","original");
    accepted(await host.promoteFrame(b,epoch,1));
    assert.equal(fs.entries.has(resolve(b.directory,upload)),false);
    assert.equal(Buffer.from(await fs.read(resolve(b.directory,committed),99)).toString(),"original");
    fs.put(resolve(b.directory,upload),"file","replacement");
    assert.equal((await host.promoteFrame(b,epoch,1)).ok,false);
    assert.equal(Buffer.from(await fs.read(resolve(b.directory,committed),99)).toString(),"original");
    for(const [e,seq] of [["../x",1],[epoch,0],[epoch,1.5],[epoch,Number.MAX_SAFE_INTEGER+1]] as const)
      assert.equal((await host.promoteFrame(b,e,seq)).ok,false);
  });
  it("bounds staged reservations and only releases exact held tickets",async()=>{
    const {host}=companionHarness();const binding=accepted(await host.prepare());
    const tickets=[];
    for(let index=0;index<8;index++)tickets.push(accepted(await host.reserve(binding,262144,2)));
    assert.equal((await host.reserve(binding,1,1)).ok,false);
    host.release({...tickets[0]!});assert.equal((await host.reserve(binding,1,1)).ok,false);
    host.release(tickets[0]!);accepted(await host.reserve(binding,262144,2));
    assert.equal((await host.reserve(binding,-1,1)).ok,false);
    assert.equal((await host.reserve({...binding} as CaptureBinding,1,1)).ok,false);
  });
  it("charges retained channels and their metadata against exact global byte and file boundaries",async()=>{
    for(const mode of ["bytes","files"]) {
      const {host,fs}=companionHarness();const binding=accepted(await host.prepare());
      const marker=fs.entries.get(resolve(binding.directory,"ownership.json"))!;
      if(mode==="bytes") {
        const path=resolve(binding.directory,"control.json");fs.put(path,"file");
        const file=fs.entries.get(path)!;file.info={...file.info,bytes:33554432-marker.info.bytes-1};
      } else {
        for(let index=1;index<=254;index++)fs.put(resolve(binding.directory,`frame.${"a".repeat(32)}.${index}.committed`),"file");
      }
      const ticket=accepted(await host.reserve(binding,1,1));
      assert.equal((await host.reserve(binding,1,1)).ok,false);
      host.release(ticket);
      if(mode==="files")fs.put(resolve(binding.directory,"ack.json"),"file");
      host.markProducerExposed(binding);await host.revoke(binding);
      assert.equal((await host.prepare()).ok,false,"a fresh channel must not bypass retained usage");
    }
  });
  it("rejects excess staged bytes and invalid numeric reservations before touching files",async()=>{
    const {host}=companionHarness();const b=accepted(await host.prepare());
    for(const bytes of [2097153,-1,Infinity,NaN,1.5])assert.equal((await host.reserve(b,bytes,1)).ok,false);
    for(const files of [0,-1,Infinity,1.5])assert.equal((await host.reserve(b,1,files)).ok,false);
    accepted(await host.reserve(b,2097152,2));assert.equal((await host.reserve(b,1,1)).ok,false);
  });
  it("writes metadata atomically and retires only validated transaction children",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());
    accepted(await host.writeMetadata(b,"control.json",Buffer.from("first")));
    accepted(await host.writeMetadata(b,"control.json",Buffer.from("second")));
    assert.equal(Buffer.from(accepted(await host.readFile(b,"control.json",4096))).toString(),"second");
    assert.equal(fs.entries.has(resolve(b.directory,"control.json.tmp")),false);
    const frame="frame."+"a".repeat(32)+".1.upload";
    fs.put(resolve(b.directory,frame),"file","payload");
    accepted(await host.retireFiles(b,[frame]));assert.equal(fs.entries.has(resolve(b.directory,frame)),false);
    for(const name of ["ownership.json","../outside","control.json","frame."+"a".repeat(32)+".0.upload"])assert.equal((await host.retireFiles(b,[name])).ok,false);
    assert.equal(fs.entries.has(resolve(b.directory,"ownership.json")),true);
    assert.equal((await host.writeMetadata(b,"ack.json",Buffer.alloc(4097))).ok,false);
    assert.equal((await host.readFile(b,"../outside",100)).ok,false);
  });
  it("stops content callbacks after marker mismatch and leaves transaction files untouched",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());const signal=host.signal(b)!;
    fs.overwrite(resolve(b.directory,"ownership.json"),JSON.stringify({...b.marker,generation:"replacement"}));
    const name="frame."+"a".repeat(32)+".1.upload";fs.put(resolve(b.directory,name),"file","private");
    assert.equal((await host.retireFiles(b,[name])).ok,false);
    assert.equal(signal.aborted,true);assert.equal(fs.entries.has(resolve(b.directory,name)),true);
  });
  it("retains a late exclusive creation, blocks fresh capacity, and returns only bounded diagnostics",async()=>{
    let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});
    const {host,fs,diagnostics}=companionHarness({deadlineMs:15});
    fs.before=async operation=>{if(operation==="mkdir")await gate;};
    assert.equal((await host.prepare()).ok,false);finish();await new Promise<void>(r=>setImmediate(r));
    const directories=[...fs.entries.keys()].filter(p=>/companion-[a-f0-9]{32}$/.test(p));
    assert.equal(directories.length,1);assert.equal((await host.prepare()).ok,false);
    assert.ok(diagnostics.every(d=>["cleanup","capture-unavailable","cleanup-capacity"].includes(d)));
  });
  it("retains late metadata writes after timeout without retry or accounting release",async()=>{
    const {host,fs}=companionHarness({deadlineMs:20});const b=accepted(await host.prepare());
    let finish!:()=>void;const gate=new Promise<void>(r=>{finish=r;});
    fs.before=async(op,path)=>{if(op==="write"&&path.endsWith("ack.json.tmp"))await gate;};
    assert.equal((await host.writeMetadata(b,"ack.json",Buffer.from("private-data"))).ok,false);
    finish();await new Promise<void>(r=>setImmediate(r));
    assert.equal(fs.entries.has(resolve(b.directory,"ack.json.tmp")),true);
    assert.equal(fs.entries.has(resolve(b.directory,"ack.json")),false);
    assert.equal((await host.prepare()).ok,false);
    await host.revoke(b);assert.equal(fs.entries.has(b.directory),true,"uncertain mutation cannot race channel deletion");
    assert.equal(fs.calls.filter(c=>c.operation==="write"&&c.path.endsWith("ack.json.tmp")).length,1);
  });
  it("refuses admission when a producer exceeds staged transaction or byte capacity",async()=>{
    for(const boundary of ["transactions","bytes"]) {
      const {host,fs}=companionHarness();const b=accepted(await host.prepare());
      const name=`frame.${"a".repeat(32)}.1.upload`;
      fs.put(resolve(b.directory,name),"file","frame");
      if(boundary==="transactions") {
        for(let index=2;index<=9;index++)fs.put(resolve(b.directory,`frame.${"a".repeat(32)}.${index}.ready`),"file","marker");
      } else {
        const entry=fs.entries.get(resolve(b.directory,name))!;entry.info={...entry.info,bytes:2097153};
      }
      assert.equal((await host.readFile(b,name,262144)).ok,false);
      assert.equal(fs.entries.has(resolve(b.directory,name)),true);
    }
  });
});

describe("companion cleanup adversaries",()=>{
  it("removes every closed child family with ownership last and nonrecursive directory deletion",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());
    const data=JSON.parse(readFileSync(resolve(__dirname,"../../../test/fixtures/companion/capture-cases.json"),"utf8")) as {resourceCleanupNames:string[]};
    for(const name of data.resourceCleanupNames)fs.put(resolve(b.directory,name),"file","inert");
    accepted(await host.revoke(b));assert.equal(fs.entries.has(b.directory),false);
    const unlinks=fs.calls.filter(c=>c.operation==="unlink");
    assert.equal(unlinks.at(-1)?.path,resolve(b.directory,"ownership.json"));
    assert.equal(fs.calls.at(-1)?.operation,"rmdir");
  });
  for(const item of JSON.parse(readFileSync(resolve(__dirname,"../../../test/fixtures/companion/capture-cases.json"),"utf8")).ownershipExamples as {
    id:string;operation:string;markerSerialized:string|null;context:{directoryBasename:string;rootEntryIndex:number;childCount:number;
      children:{name:string;regular:boolean;linkOrReparse:boolean}[];markerStillMatchesAtDelete:boolean;firstUnlinkResult:string;pidProbe:string};
    expected:{deleteDirectory:boolean;diagnostic:string|null}
  }[]) {
    if(item.operation!=="cleanup-previous")continue;
    it(item.id+" sweeps actual fixture files with the authored PID/child inputs",async()=>{
      const fs=new CaptureFixtureFileSystem();const context=item.context;
      for(let index=0;index<context.rootEntryIndex;index++)fs.put(resolve(fs.root,"foreign-"+index),"file");
      const directory=resolve(fs.root,context.directoryBasename);fs.put(directory,"directory");
      for(const child of context.children) {
        if(child.name==="ownership.json"&&item.markerSerialized===null)continue;
        fs.put(resolve(directory,child.name),child.linkOrReparse?"link":child.regular?"file":"directory",
          child.name==="ownership.json"?item.markerSerialized!:"inert");
      }
      for(let index=context.children.length;index<context.childCount;index++)
        fs.put(resolve(directory,`frame.${"a".repeat(32)}.${index}.upload`),"file");
      let markerReads=0;
      fs.before=(operation,path)=>{
        if(operation==="read"&&path.endsWith("ownership.json")&&++markerReads===2&&!context.markerStillMatchesAtDelete)
          fs.overwrite(path,JSON.stringify({...JSON.parse(item.markerSerialized!),generation:"changed"}));
        if(operation==="unlink"&&context.firstUnlinkResult!=="ok")throw Object.assign(new Error("fixture lock"),{code:"EACCES"});
      };
      const diagnostics:string[]=[];
      const host=new CompanionCapture({storageRoot:fs.root,fs,currentTarget:()=>fixtureTarget,diagnostic:reason=>diagnostics.push(reason),
        probeProcess:pid=>{assert.equal(pid,4243);if(context.pidProbe!=="success")throw Object.assign(new Error("fixture probe"),{code:context.pidProbe});}});
      await host.sweep();assert.equal(!fs.entries.has(directory),item.expected.deleteDirectory);
      assert.deepEqual(diagnostics,item.expected.diagnostic?[item.expected.diagnostic]:[]);
    });
  }
  it("stops if a new unknown child appears after whole-set validation",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());let reads=0;
    fs.before=(op,path)=>{if(op==="read"&&path.endsWith("ownership.json")&&++reads===2)fs.put(resolve(b.directory,"private-extra"),"file","untouched");};
    await host.revoke(b);assert.equal(fs.calls.some(c=>c.operation==="unlink"),false);
  });
  it("stops before the first unlink when the marker changes during whole-set validation",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());
    fs.put(resolve(b.directory,"control.json"),"file","control");
    fs.before=(op,path)=>{if(op==="stat"&&path.endsWith("control.json"))fs.overwrite(resolve(b.directory,"ownership.json"),JSON.stringify({...b.marker,generation:"changed"}));};
    await host.revoke(b);assert.equal(fs.calls.some(c=>c.operation==="unlink"),false);
  });
  it("stops on replacement children after a partial cleanup and keeps marker last",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());
    fs.put(resolve(b.directory,"control.json"),"file","first");fs.put(resolve(b.directory,"ack.json"),"file","second");
    fs.before=(op,path)=>{if(op==="unlink"&&path.endsWith("control.json"))fs.put(resolve(b.directory,"ack.json"),"link");};
    await host.revoke(b);
    assert.equal(fs.entries.has(resolve(b.directory,"control.json")),false);
    assert.equal(fs.entries.has(resolve(b.directory,"ack.json")),true);
    assert.equal(fs.entries.has(resolve(b.directory,"ownership.json")),true);
  });
  it("keeps unknown descendants, linked files and hard links untouched",async()=>{
    for(const kind of ["link","directory","hardlink"]) {
      const {host,fs}=companionHarness();const b=accepted(await host.prepare());const child=resolve(b.directory,"ack.json");
      fs.put(child,kind==="hardlink"?"file":kind as "link"|"directory","private");
      if(kind==="hardlink"){const e=fs.entries.get(child)!;e.info={...e.info,links:2};}
      await host.revoke(b);assert.equal(fs.calls.some(c=>c.operation==="unlink"),false);
    }
  });
  it("rolls back an empty exclusive directory when marker creation fails before writing",async()=>{
    const {host,fs}=companionHarness();fs.before=op=>{if(op==="write")throw Object.assign(new Error("private lock"),{code:"EBUSY"});};
    assert.equal((await host.prepare()).ok,false);
    assert.equal([...fs.entries.keys()].some(p=>/companion-[a-f0-9]{32}$/.test(p)),false);
  });
  it("stops locked cleanup without retries and does not expose raw filesystem errors",async()=>{
    const {host,fs,diagnostics}=companionHarness();const b=accepted(await host.prepare());
    fs.before=op=>{if(op==="unlink")throw Object.assign(new Error("PRIVATE_TOKEN_AND_PATH"),{code:"EBUSY"});};
    assert.deepEqual(await host.revoke(b),{ok:false,reason:"cleanup"});
    assert.equal(fs.calls.filter(c=>c.operation==="unlink").length,1);
    assert.ok(diagnostics.every(d=>!d.includes("PRIVATE")));assert.equal(fs.entries.has(b.directory),true);
  });
  it("bounds root and child enumeration and yields between eligible prior candidates",async()=>{
    const {host,fs}=companionHarness();const b=accepted(await host.prepare());
    let yields=0;const sweeper=new CompanionCapture({storageRoot:fs.root,fs,currentTarget:()=>fixtureTarget,yieldControl:async()=>{yields++;},probeProcess:()=>{}});
    for(let index=0;index<256;index++)fs.put(resolve(fs.root,"unrelated-"+index),"file");
    assert.deepEqual(await sweeper.sweep(),{ok:false,reason:"cleanup-capacity"});assert.equal(yields,1);
    for(let index=0;index<256;index++)fs.put(resolve(b.directory,`frame.${"a".repeat(32)}.${index+1}.upload`),"file");
    assert.equal((await host.revoke(b)).ok,false);assert.equal(fs.calls.some(c=>c.operation==="unlink"),false);
  });
  it("stops collision attempts at eight without adopting a directory",async()=>{
    const fs=new CaptureFixtureFileSystem();const path=resolve(fs.root,"companion-"+"a".repeat(32));fs.put(path,"directory");
    const host=new CompanionCapture({storageRoot:fs.root,fs,currentTarget:()=>fixtureTarget,randomBytes:size=>Buffer.alloc(size,0xaa)});
    assert.equal((await host.prepare()).ok,false);assert.equal(fs.calls.filter(c=>c.operation==="mkdir").length,8);
    assert.equal(fs.entries.has(path),true);
  });
});

describe("companion real Node filesystem smoke",()=>{
  it("creates regular private files, atomically writes metadata, promotes and retires a frame, then cleans on exit",async()=>{
    const h=await diskCompanionHarness();
    try {
      const b=accepted(await h.host.prepare());accepted(await h.host.validateOwner(b));
      const path=resolve(b.directory,"ownership.json");const stat=await lstat(path);
      assert.equal(stat.isFile(),true);assert.equal(stat.isSymbolicLink(),false);
      if(process.platform!=="win32")assert.equal(stat.mode&0o777,0o600);
      assert.equal((await readFile(path)).includes(Buffer.from(b.token)),false);
      accepted(await h.host.writeMetadata(b,"ack.json",Buffer.from("ack")));
      assert.equal(Buffer.from(accepted(await h.host.readFile(b,"ack.json",4096))).toString(),"ack");
      const epoch="a".repeat(32);const upload=`frame.${epoch}.1.upload`;const committed=`frame.${epoch}.1.committed`;
      await writeFile(resolve(b.directory,upload),"frame");accepted(await h.host.promoteFrame(b,epoch,1));
      accepted(await h.host.retireFiles(b,[committed]));h.host.markProducerExposed(b);await h.host.revoke(b);
      assert.equal((await lstat(b.directory)).isDirectory(),true);
      h.host.confirmManagedPtyExit(b);await h.host.settled(b);
      await assert.rejects(lstat(b.directory),{code:"ENOENT"});
    } finally {await h.dispose();}
  });
  it("rejects real junction roots and hard-linked marker authority",async()=>{
    const h=await diskCompanionHarness();
    try {
      const junction=resolve(h.root,"redirect");await symlink(h.root,junction,process.platform==="win32"?"junction":"dir");
      const redirected=new CompanionCapture({storageRoot:junction,currentTarget:()=>fixtureTarget});
      assert.equal((await redirected.prepare()).ok,false);
      const b=accepted(await h.host.prepare());await link(resolve(b.directory,"ownership.json"),resolve(h.root,"marker-copy"));
      assert.equal((await h.host.validateOwner(b)).ok,false);
      await h.host.revoke(b);assert.equal((await lstat(b.directory)).isDirectory(),true);
    } finally {await h.dispose();}
  });
});

interface WireCase {
  id: string;
  frames: string[];
  expected: { disposition: string; reasonCode?: string; observations?: unknown[] };
}
const fixture = JSON.parse(readFileSync(resolve(__dirname, "../../../test/fixtures/companion/capture-cases.json"), "utf8")) as {
  wireExamples: WireCase[];
  ownershipExamples: { id: string; markerSerialized: string; context: {directoryBasename: string} }[];
  bindingExamples: {id:string;environment:Record<string,unknown>}[];
  nativeReturnExamples: {id:string;expected:unknown}[];
  nativeDenyPipelines: WireCase[];
};
const envelope = {v:1, token:"A".repeat(43), sessionId:"managed-A",
  claudeSessionId:"11111111-1111-4111-8111-111111111111", generation:"generation-A"};
const epoch = "a".repeat(32);
const hex = "b".repeat(32);
const main = {kind:"main"};
const enter = {kind:"callEnter",scope:main,toolUseId:"call-A",bindingValid:true,command:"雪 🚀\nquoted"};
const flags = {interrupted:false,backgroundTaskId:null,backgroundedByUser:null,
  backgroundedByTurnAbort:null,backgroundedToDeliverMessage:null,backgroundEndsWithFinalResponse:null,
  backgroundWakesOwner:null,timedOutAfterMs:null,isImage:false,backgroundArtifactHint:false};
const rejection = (reason = "SCHEMA_REJECTED") => ({ok:false,reason});
const observation = (value: unknown) => codec.decodeNormalizedObservation(JSON.stringify(value));
const frame = (value: unknown) => codec.decodeCaptureData(JSON.stringify(value));

describe("companion capture closed codecs", () => {
  it("decodes all native-return projections and serialized withholding pipelines without execution inference", () => {
    for (const item of fixture.nativeReturnExamples) assert.deepEqual(observation(item.expected),{ok:true,value:item.expected},item.id);
    for (const item of fixture.nativeDenyPipelines) {
      const values = item.frames.map(data => {
        const decoded = codec.decodeCaptureData(data);
        assert.equal(decoded.ok,true,item.id);
        if (!decoded.ok || decoded.value.kind !== "observationChunk") assert.fail("expected a normalized chunk");
        const result = codec.decodeNormalizedObservation(decoded.value.data);
        assert.equal(result.ok,true,item.id);
        if (!result.ok) assert.fail("expected a valid normalized observation");
        return result.value;
      });
      assert.deepEqual(values,item.expected.observations);
    }
    const multi = fixture.wireExamples.find(c=>c.id==="W18")!;
    const pieces = multi.frames.map(data => {
      const result = codec.decodeCaptureData(data);
      if (!result.ok || result.value.kind !== "observationChunk") assert.fail("expected a valid chunk");
      return result.value.data;
    });
    assert.deepEqual(codec.decodeNormalizedObservation(pieces.join("")),{ok:true,value:multi.expected.observations![0]});
  });
  it("accepts metadata at 32 KiB and rejects the next byte independently of source text", () => {
    const blocks = Array.from({length:937},(_,index)=>({kind:"unsupported",index}));
    // The compact row with rowId='r' is 32755 bytes; only the ID length changes.
    for (const length of [13,14,15]) {
      const result = observation({kind:"assistantRow",scope:main,rowId:"r".repeat(length),blocks});
      if (length <= 14) assert.equal(result.ok,true);
      else assert.deepEqual(result,rejection("CONTENT_REJECTED"));
    }
  });
  it("accounts for JSON escaping in the serialized frame cap", () => {
    const base = {...envelope,kind:"observationChunk",captureEpoch:epoch,seq:1,observationId:1,chunkIndex:0,chunkCount:1};
    const accepted = {...base,totalByteLength:40000,byteLength:40000,data:"\u0001".repeat(40000)};
    assert.equal(frame(accepted).ok,true);
    assert.deepEqual(frame({...base,totalByteLength:65536,byteLength:65536,data:"\u0001".repeat(65536)}),rejection("CONTENT_REJECTED"));
    assert.equal(frame({...base,chunkCount:8192,totalByteLength:6324224,byteLength:1,data:"x"}).ok,true);
    assert.deepEqual(frame({...base,totalByteLength:6324225,byteLength:1,data:"x",chunkCount:8192}),rejection("CONTENT_REJECTED"));
  });
  it("decodes the five literal launch keys without granting directory ownership", () => {
    const good = fixture.bindingExamples[0]!;
    assert.deepEqual(codec.decodeCaptureLaunchBinding({...good.environment,UNRELATED:"preserve"}),{ok:true,value:{
      directory:"C:/synthetic/capture/channel-A",token:"A".repeat(43),sessionId:"managed-A",
      claudeSessionId:envelope.claudeSessionId,generation:"generation-A"}});
    for (const index of [1,2]) assert.deepEqual(codec.decodeCaptureLaunchBinding(fixture.bindingExamples[index]!.environment),rejection());
    assert.equal(codec.decodeCaptureLaunchBinding(fixture.bindingExamples[3]!.environment).ok,true);
    for (const key of Object.keys(good.environment)) {
      assert.deepEqual(codec.decodeCaptureLaunchBinding({...good.environment,[key]:undefined}),rejection());
    }
    for (const directory of ["C:relative","../channel","C:/ok\u0000bad","C:/\ud800"])
      assert.deepEqual(codec.decodeCaptureLaunchBinding({...good.environment,CLAUDE_WORKSPACES_CAPTURE_DIR:directory}),rejection());
  });
  it("rejects missing and extra keys at every normalized union boundary", () => {
    for (const item of fixture.wireExamples.filter(c=>/^(W0[1-9]|W1[0-4]|W43|W44)$/.test(c.id))) {
      const value = item.expected.observations![0] as Record<string,unknown>;
      assert.deepEqual(observation({...value,runEligible:true}),rejection());
      for (const key of Object.keys(value)) assert.deepEqual(observation({...value,[key]:undefined}),rejection());
    }
    for (const change of [
      {blocks:[{kind:"text",index:0,text:"",hidden:true}]},
      {blocks:[{kind:"bashRequest",index:0,toolUseId:"t"}]},
      {blocks:[{kind:"unsupported",index:0,text:"private"}]},
      {blocks:[null]}, {blocks:{}}, {blocks:[{kind:"text",index:0,text:7}]}
    ]) assert.deepEqual(observation({kind:"assistantRow",scope:main,rowId:"r",...change}),rejection());
    for (const output of [[{kind:"text",text:"",raw:"private"}],[{kind:"unavailable",reason:"MEDIA",text:"private"}],
      [{kind:"unavailable",reason:"OTHER"}],[null],{}]) {
      assert.deepEqual(observation({kind:"storedResult",scope:main,rowId:"r",index:0,toolUseId:"t",isError:false,output}),rejection());
    }
  });
  for (const item of fixture.wireExamples.filter(c => /^(W0[1-9]|W1[0-7]|W43|W44)$/.test(c.id))) {
    it(item.id + " decodes the exact outer member and normalized content", () => {
      const decoded = codec.decodeCaptureData(item.frames[0]!);
      assert.equal(decoded.ok, true);
      if (!decoded.ok) return;
      assert.deepEqual(decoded.value, JSON.parse(item.frames[0]!));
      if (decoded.value.kind === "observationChunk") {
        assert.deepEqual(codec.decodeNormalizedObservation(decoded.value.data),
          {ok:true,value:item.expected.observations![0]});
      }
    });
  }
  for (const id of ["W19","W20","W21","W22","W23","W24","W25"]) {
    const item = fixture.wireExamples.find(c => c.id === id)!;
    it(id + " rejects the outer member with the selected reason", () => {
      assert.deepEqual(codec.decodeCaptureData(item.frames[0]!), rejection(item.expected.reasonCode));
    });
  }
  for (const id of ["W26","W27","W28","W29","W30","W31","W32","W33","W34","W35","W36","W45","W46"]) {
    const item = fixture.wireExamples.find(c => c.id === id)!;
    it(id + " rejects malformed/private normalized membership", () => {
      const value = JSON.parse(item.frames[0]!) as {data:string};
      assert.deepEqual(codec.decodeNormalizedObservation(value.data), rejection(item.expected.reasonCode));
    });
  }
  it("preserves scalar newline and non-ASCII content and freezes nested snapshots", () => {
    const result = observation(enter);
    assert.deepEqual(result, {ok:true,value:enter});
    if (!result.ok) return;
    assert.ok(Object.isFrozen(result.value));
    assert.ok(Object.isFrozen(result.value.scope));
    assert.throws(() => Object.assign(result.value.scope, {kind:"agent"}));
  });
  it("uses fatal UTF-8 decoding and rejects unpaired surrogates", () => {
    for (const data of [Buffer.from([0xff]), Buffer.from([0xed,0xa0,0x80]), "{", "null", "[]"]) {
      assert.deepEqual(codec.decodeNormalizedObservation(data), rejection());
    }
    assert.deepEqual(observation({...enter,command:"\ud800"}), rejection("CONTENT_REJECTED"));
    assert.deepEqual(observation({...enter,toolUseId:"\udfff"}), rejection("CONTENT_REJECTED"));
    assert.deepEqual(codec.decodeNormalizedObservation(Buffer.from(JSON.stringify(enter),"utf8")),{ok:true,value:enter});
    assert.deepEqual(codec.decodeNormalizedObservation(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify(enter))])),rejection());
  });
  it("keeps source strings inert and rejects private nested keys and omitted fields", () => {
    assert.equal(observation({...enter,command:'{"kind":"run","token":"PRIVATE"}'}).ok,true);
    for (const change of [{scope:{kind:"main",agentId:null}},{scope:{kind:"agent",agentId:"worker"}},
      {exitCode:0},{command:undefined}]) assert.deepEqual(observation({...enter,...change}), rejection());
  });
  it("requires ascending unique safe original indices", () => {
    const row = {kind:"assistantRow",scope:main,rowId:"r",blocks:[{kind:"text",index:0,text:""},{kind:"unsupported",index:2}]};
    assert.equal(observation(row).ok,true);
    for (const index of [0,-1,0.5,Number.MAX_SAFE_INTEGER+1]) {
      assert.deepEqual(observation({...row,blocks:[row.blocks[0],{kind:"unsupported",index}]}), rejection());
    }
  });
  it("enforces nullable/boolean branch combinations without truthiness", () => {
    assert.equal(observation({...enter,bindingValid:false,command:null}).ok,true);
    for (const change of [{bindingValid:"true"},{bindingValid:false},{command:null}]) {
      assert.deepEqual(observation({...enter,...change}), rejection());
    }
    for (const branch of ["deny","error","unknown"]) {
      assert.equal(observation({kind:"callReturn",scope:main,toolUseId:"t",branch,flags:null}).ok,true);
      assert.deepEqual(observation({kind:"callReturn",scope:main,toolUseId:"t",branch,flags}), rejection());
    }
    for (const change of [{backgroundEndsWithFinalResponse:false},{backgroundWakesOwner:false},
      {timedOutAfterMs:-1},{timedOutAfterMs:"1"},{backgroundedByUser:1},{isImage:undefined}]) {
      assert.deepEqual(observation({kind:"post",scope:main,toolUseId:"t",command:"",responseState:"valid",flags:{...flags,...change}}), rejection());
    }
    assert.equal(observation({kind:"post",scope:main,toolUseId:"t",command:"",responseState:"valid",flags:{...flags,timedOutAfterMs:0.5,backgroundWakesOwner:true}}).ok,true);
    assert.deepEqual(observation({kind:"post",scope:main,toolUseId:"t",command:null,responseState:"valid",flags}),rejection());
    assert.deepEqual(observation({kind:"post",scope:main,toolUseId:"t",command:null,responseState:"invalid",flags}),rejection());
  });
  it("enforces scope/reason membership and opaque native-ID byte boundaries", () => {
    assert.equal(observation({...enter,toolUseId:"雪".repeat(85)+"a"}).ok,true);
    for (const toolUseId of ["", "雪".repeat(86)]) {
      assert.deepEqual(observation({...enter,toolUseId}),rejection("CONTENT_REJECTED"));
    }
    for (const value of [
      {kind:"unsupported",scope:main,reason:"AGENT_SCOPE"},
      {kind:"unsupported",scope:{kind:"agent",agentId:"a"},reason:"PLUGIN_ORIGIN"},
      {kind:"unsupported",scope:{kind:"agent",agentId:null},reason:"AGENT_SCOPE"}
    ]) assert.deepEqual(observation(value),rejection());
  });
  it("enforces aggregate assistant source and command UTF-8 budgets", () => {
    for (const delta of [-1,0,1]) {
      const command = "é".repeat(524287)+"x".repeat(2+delta);
      assert.equal(observation({...enter,command}).ok,delta<=0);
      const value = {kind:"assistantRow",scope:main,rowId:"r",blocks:[
        {kind:"text",index:0,text:command},{kind:"bashRequest",index:1,toolUseId:"t",command:"x"}]};
      assert.equal(observation(value).ok,delta<0);
    }
    assert.deepEqual(observation({...enter,command:"x".repeat(1048577)}),rejection("CONTENT_REJECTED"));
  });
  it("enforces complete stored-output UTF-8 budget across ordered blocks", () => {
    for (const delta of [-1,0,1]) {
      const value = {kind:"storedResult",scope:main,rowId:"r",index:0,toolUseId:"t",isError:null,
        output:[{kind:"text",text:"é".repeat(131071)},{kind:"text",text:"x".repeat(2+delta)}]};
      assert.equal(observation(value).ok,delta<=0);
    }
  });
  it("rejects excess metadata, oversized arrays and serialized observations", () => {
    const row = {kind:"assistantRow",scope:main,rowId:"r",blocks:Array.from({length:20000},(_,index)=>({kind:"unsupported",index}))};
    assert.deepEqual(observation(row),rejection("CONTENT_REJECTED"));
    assert.deepEqual(observation({...row,blocks:[...row.blocks,{kind:"unsupported",index:20000}]}),rejection("CONTENT_REJECTED"));
    assert.deepEqual(codec.decodeNormalizedObservation(" ".repeat(6324225)),rejection("CONTENT_REJECTED"));
  });
  it("enforces frame lengths, safe integers and scalar chunk boundaries", () => {
    const value = {...envelope,kind:"observationChunk",captureEpoch:epoch,seq:1,observationId:1,chunkIndex:0,chunkCount:1,totalByteLength:8,byteLength:8,data:"雪🚀\n"};
    assert.equal(frame(value).ok,true);
    for (const change of [{seq:0},{seq:1.5},{seq:Number.MAX_SAFE_INTEGER+1},{captureEpoch:epoch.toUpperCase()},
      {chunkCount:8193},{chunkIndex:-1},{chunkCount:0},{byteLength:0}]) {
      assert.deepEqual(frame({...value,...change}),rejection());
    }
    assert.deepEqual(frame({...value,byteLength:7}),rejection("CONTENT_REJECTED"));
    assert.deepEqual(frame({...value,totalByteLength:9}),rejection("CONTENT_REJECTED"));
    assert.deepEqual(frame({...value,data:"\ud800",byteLength:3}),rejection("CONTENT_REJECTED"));
    for (const size of [65535,65536,65537]) {
      assert.equal(frame({...value,totalByteLength:size,byteLength:size,data:"x".repeat(size)}).ok,size<=65536);
    }
    assert.deepEqual(codec.decodeCaptureData(" ".repeat(262145)),rejection("CONTENT_REJECTED"));
  });
  it("decodes eight ownership fields and checks the computed directory suffix", () => {
    const good = fixture.ownershipExamples[0]!;
    assert.deepEqual(codec.decodeOwnershipMarker(good.markerSerialized,good.context.directoryBasename),{ok:true,value:JSON.parse(good.markerSerialized)});
    for (const id of ["O03","O04","O05","O06","O07"]) {
      const item=fixture.ownershipExamples.find(c=>c.id===id)!;
      assert.equal(codec.decodeOwnershipMarker(item.markerSerialized,item.context.directoryBasename).ok,false,id);
    }
    const marker = JSON.parse(good.markerSerialized);
    for (const change of [{hostId:"C".repeat(32)},{processId:0},{sessionId:""},{generation:"a".repeat(129)},
      {claudeSessionId:"11111111-1111-4111-8111-11111111111A"},{kind:"composer"},{v:2}]) {
      assert.equal(codec.decodeOwnershipMarker(JSON.stringify({...marker,...change}),good.context.directoryBasename).ok,false);
    }
    assert.equal(codec.decodeOwnershipMarker(good.markerSerialized,"../"+good.context.directoryBasename).ok,false);
    assert.equal(codec.decodeOwnershipMarker(good.markerSerialized.padEnd(1024),good.context.directoryBasename).ok,true);
    assert.equal(codec.decodeOwnershipMarker(good.markerSerialized.padEnd(1025),good.context.directoryBasename).ok,false);
  });
  it("decodes closed control, request, activation and acknowledgements", () => {
    const records = [
      {...envelope,kind:"control",controlRevision:1,state:"offered",offerId:hex,captureEpoch:null,grantId:null,predecessorEpoch:null,reasonCode:null,recoveriesRemaining:1,lastRetired:null},
      {...envelope,kind:"epochRequest",offerId:hex,predecessorEpoch:null,nativeSessionId:envelope.claudeSessionId,reason:"initial"},
      {...envelope,kind:"epochActivate",captureEpoch:epoch,grantId:hex,nativeSessionId:envelope.claudeSessionId},
      {...envelope,kind:"ack",captureEpoch:epoch,disposition:"continue",ackSeq:0},
      {...envelope,kind:"ack",captureEpoch:epoch,disposition:"retired",ackSeq:4,reasonCode:"SCHEMA_REJECTED"}
    ];
    for (const value of records) {
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify(value)),{ok:true,value});
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...value,private:true})),rejection());
      const missing = {...value,token:undefined};
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify(missing)),rejection());
    }
    for (const reasonCode of ["SCHEMA_REJECTED","CONTENT_REJECTED","IDENTITY_CHANGED","TRANSACTION_TIMEOUT","CHANNEL_RETIRED","CONTROL_REJECTED","HANDSHAKE_TIMEOUT"]) {
      assert.equal(codec.decodeCaptureControl(JSON.stringify({...records[4],reasonCode})).ok,true);
      assert.equal(codec.decodeCaptureControl(JSON.stringify({...records[0],lastRetired:{captureEpoch:epoch,ackSeq:0,reasonCode}})).ok,true);
    }
    for (const change of [{token:"+".repeat(43)},{sessionId:"é".repeat(65)},{generation:""},{v:"1"}]) {
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[1],...change})),rejection());
    }
    for (const change of [{ackSeq:-1},{ackSeq:Number.MAX_SAFE_INTEGER+1},{reasonCode:null},{reasonCode:"OTHER"}]) {
      assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[4],...change})),rejection());
    }
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[3],reasonCode:null})),rejection());
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[0],lastRetired:{captureEpoch:epoch,ackSeq:0,reasonCode:null}})),rejection());
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify({...records[0],lastRetired:[]})),rejection());
    assert.equal(codec.decodeCaptureControl(JSON.stringify(records[0]).padEnd(4096)).ok,true);
    assert.deepEqual(codec.decodeCaptureControl(JSON.stringify(records[0]).padEnd(4097)),rejection());
  });
  it("validates ready marker against a host-computed upload name", () => {
    const basename = "frame."+epoch+".1.upload";
    const value = {v:1,basename,byteLength:15};
    assert.deepEqual(codec.decodeUploadMarker(JSON.stringify(value),basename),{ok:true,value});
    for (const change of [{v:undefined},{basename:"../"+basename},{basename:basename.replace(".1.",".01.")},
      {byteLength:0},{byteLength:1.1},{byteLength:Number.MAX_SAFE_INTEGER+1},{extra:true}]) {
      assert.deepEqual(codec.decodeUploadMarker(JSON.stringify({...value,...change}),basename),rejection());
    }
    for (const kind of ["request","activate"]) {
      const name = kind+"."+hex+".upload";
      assert.equal(codec.decodeUploadMarker(JSON.stringify({v:1,basename:name,byteLength:1}),name).ok,true);
    }
    assert.equal(codec.decodeUploadMarker(JSON.stringify(value).padEnd(4096),basename).ok,true);
    assert.deepEqual(codec.decodeUploadMarker(JSON.stringify(value),"frame."+epoch+".9007199254740992.upload"),rejection());
    assert.deepEqual(codec.decodeUploadMarker(JSON.stringify(value).padEnd(4097),basename),rejection());
  });
});
