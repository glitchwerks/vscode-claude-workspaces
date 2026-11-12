import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { CompanionCapture } from "../../src/companion/companionCapture";
import type { CaptureFileInfo, CaptureFileSystem, CaptureRootCoordinator, CaptureHostOptions, CaptureProtocolOptions, CaptureSourceEvent } from "../../src/companion/companionCapture";
import type { ManagedCaptureIdentity } from "../../src/companion/companionTypes";

/** Fixture exclusion at the OS seam; quota/lifetime policy remains the real resource manager. */
export class CaptureFixtureCoordinator implements CaptureRootCoordinator {
  private readonly held=new Set<string>();
  async tryAcquire(identity:string) {
    if(this.held.has(identity))return undefined;
    this.held.add(identity);let released=false;
    return {release:async()=>{if(!released){released=true;this.held.delete(identity);}}};
  }
}
interface Entry {info:CaptureFileInfo;data:Buffer;resolved?:string}
/** In-memory filesystem below the same host I/O seam used by Node production. */
export class CaptureFixtureFileSystem implements CaptureFileSystem {
  readonly coordinator=new CaptureFixtureCoordinator();
  readonly entries=new Map<string,Entry>();
  readonly calls:{operation:string;path:string}[]=[];
  before:((operation:string,path:string)=>void|Promise<void>)|undefined;
  private nextIdentity=0;
  constructor(readonly root=resolve(".tmp/companion-fixture")) {
    let path=root;
    for (;;) { this.put(path,"directory"); const parent=dirname(path); if(parent===path) break; path=parent; }
  }
  /** Seed fixture bytes without invoking the host implementation. */
  put(path:string,kind:CaptureFileInfo["kind"],data:string|Buffer="",resolved?:string):void {
    const bytes=Buffer.from(data);
    this.entries.set(path,{info:{identity:String(++this.nextIdentity),kind,bytes:bytes.length,links:1},data:bytes,resolved});
  }
  /** Mutate the content of the same regular file, as a writer with an open handle can. */
  overwrite(path:string,data:string|Buffer):void {
    const entry=this.get(path);entry.data=Buffer.from(data);entry.info={...entry.info,bytes:entry.data.length};
  }
  private get(path:string):Entry {const e=this.entries.get(path);if(!e) throw Object.assign(new Error("fixture missing"),{code:"ENOENT"});return e;}
  private async step(operation:string,path:string):Promise<void> {this.calls.push({operation,path});await this.before?.(operation,path);}
  async stat(path:string):Promise<CaptureFileInfo> {await this.step("stat",path);return {...this.get(path).info};}
  async realpath(path:string):Promise<string> {await this.step("realpath",path);return this.get(path).resolved??path;}
  async list(path:string,limit:number):Promise<{names:string[];truncated:boolean}> {
    await this.step("list",path);this.get(path);
    const names=[...this.entries.keys()].filter(p=>p!==path&&dirname(p)===path).map(p=>p.slice(path.length+1));
    return {names:names.slice(0,limit),truncated:names.length>limit};
  }
  async mkdir(path:string):Promise<void> {await this.step("mkdir",path);if(this.entries.has(path)) throw Object.assign(new Error("collision"),{code:"EEXIST"});this.get(dirname(path));this.put(path,"directory");}
  async read(path:string,maxBytes:number):Promise<Uint8Array> {await this.step("read",path);const e=this.get(path);if(e.data.length>maxBytes) throw new Error("oversize");return Buffer.from(e.data);}
  async writeExclusive(path:string,data:Uint8Array):Promise<CaptureFileInfo> {await this.step("write",path);if(this.entries.has(path)) throw Object.assign(new Error("collision"),{code:"EEXIST"});this.get(dirname(path));this.put(path,"file",Buffer.from(data));return {...this.get(path).info};}
  async rename(from:string,to:string):Promise<void> {await this.step("rename",from);const entry=this.get(from);this.entries.set(to,entry);this.entries.delete(from);}
  async unlink(path:string):Promise<void> {await this.step("unlink",path);if(this.get(path).info.kind!=="file") throw new Error("not regular");this.entries.delete(path);}
  async rmdir(path:string):Promise<void> {await this.step("rmdir",path);if([...this.entries.keys()].some(p=>p!==path&&dirname(p)===path)) throw new Error("not empty");this.entries.delete(path);}
}
export const fixtureTarget:Readonly<ManagedCaptureIdentity>=Object.freeze({sessionId:"managed-A",claudeSessionId:"11111111-1111-4111-8111-111111111111",generation:"generation-A"});
/** Deterministic entropy and process probes never escape the fixture. */
export function companionHarness(overrides:Partial<CaptureHostOptions>={}) {
  const fs=new CaptureFixtureFileSystem();
  const targets=new Map<string,Readonly<ManagedCaptureIdentity>>([[fixtureTarget.sessionId,fixtureTarget]]);
  let random=0;
  const diagnostics:string[]=[];
  const host=new CompanionCapture({storageRoot:fs.root,fs,coordinator:fs.coordinator,currentTarget:sessionId=>targets.get(sessionId),processId:4242,
    randomBytes:size=>Buffer.alloc(size,++random),probeProcess:()=>{},diagnostic:reason=>diagnostics.push(reason),...overrides});
  return {host,fs,diagnostics,setTarget:(value:Readonly<ManagedCaptureIdentity>|undefined,sessionId=value?.sessionId??fixtureTarget.sessionId)=>{
    if(value)targets.set(sessionId,value);else targets.delete(sessionId);
  }};
}

/** Real Node filesystem smoke fixtures stay under the task-owned project temporary directory. */
export async function diskCompanionHarness() {
  const parent=resolve(".tmp/013-release-215/222");
  await mkdir(parent,{recursive:true});
  const root=await mkdtemp(resolve(parent,"capture-smoke-"));
  const host=new CompanionCapture({storageRoot:root,coordinator:new CaptureFixtureCoordinator(),currentTarget:()=>fixtureTarget});
  return {host,root,dispose:async()=>{
    if(dirname(root)!==parent||!root.startsWith(resolve(parent,"capture-smoke-")))throw new Error("unsafe fixture cleanup");
    await rm(root,{recursive:true,force:true});
  }};
}

/** Deterministic host protocol clock; filesystem deadlines remain real resource deadlines. */
export class CaptureFixtureClock {
  time=0;
  readonly now=()=>this.time;
  private readonly timers=new Map<object,{at:number;callback:()=>void}>();
  readonly schedule=(callback:()=>void,delay:number)=>{const key={};this.timers.set(key,{at:this.time+delay,callback});return ()=>{this.timers.delete(key);};};
  pendingDelays():number[] {return [...this.timers.values()].map(timer=>timer.at-this.time);}
  fireDue():void {for(const [key,timer] of [...this.timers])if(timer.at<=this.time){this.timers.delete(key);timer.callback();}}
  advance(milliseconds:number):void {this.time+=milliseconds;}
}
/** Publish producer pairs through the filesystem seam, without bypassing host admission. */
export async function protocolHarness(options:CaptureProtocolOptions={},resources:Partial<CaptureHostOptions>={}) {
  const h=companionHarness(resources);const result=await h.host.prepare("managed-A");
  if(!result.ok)throw new Error("fixture preparation failed");const binding=result.value;
  const events:CaptureSourceEvent[]=[];
  const clock=new CaptureFixtureClock();const started=await h.host.startProtocol(binding,{now:clock.now,schedule:clock.schedule,autoPoll:false,onEvent:event=>events.push(event),...options});
  if(!started.ok)throw new Error("fixture protocol failed");const protocol=started.value;
  const envelope={v:1,token:binding.token,...fixtureTarget};
  const json=(name:string)=>JSON.parse(h.fs.entries.get(resolve(binding.directory,name))!.data.toString());
  const pair=(base:string,value:unknown,marker:unknown=undefined)=>{
    const bytes=Buffer.from(JSON.stringify(value));h.fs.put(resolve(binding.directory,base+".upload"),"file",bytes);
    h.fs.put(resolve(binding.directory,base+".ready"),"file",JSON.stringify(marker??{v:1,basename:base+".upload",byteLength:bytes.length}));
  };
  const request=async(reason="initial",extra:Record<string,unknown>={})=>{
    const c=json("control.json");const value={...envelope,kind:"epochRequest",offerId:c.offerId,
      predecessorEpoch:reason==="initial"?null:c.captureEpoch,nativeSessionId:fixtureTarget.claudeSessionId,reason,...extra};
    pair("request."+String(value.offerId),value);await protocol.poll();return value;
  };
  const activate=async()=>{const c=json("control.json");pair("activate."+c.captureEpoch,{...envelope,kind:"epochActivate",
    captureEpoch:c.captureEpoch,grantId:c.grantId,nativeSessionId:fixtureTarget.claudeSessionId});await protocol.poll();};
  const active=async()=>{await request();await activate();if(protocol.snapshot().state!=="active")throw new Error("fixture activation failed");};
  const frame=async(seq:number,body:Record<string,unknown>={kind:"heartbeat"})=>{
    const value={...envelope,captureEpoch:json("control.json").captureEpoch,seq,...body};
    pair("frame."+String(value.captureEpoch)+"."+seq,value);await protocol.poll();
  };
  const observation=async(seq:number,id:number,data:unknown)=>{const text=JSON.stringify(data);await frame(seq,{kind:"observationChunk",
    observationId:id,chunkIndex:0,chunkCount:1,totalByteLength:Buffer.byteLength(text),byteLength:Buffer.byteLength(text),data:text});};
  const chunks=(data:unknown,split:number)=>{const text=JSON.stringify(data);return [text.slice(0,split),text.slice(split)].map((part,index)=>({kind:"observationChunk",
    observationId:1,chunkIndex:index,chunkCount:2,totalByteLength:Buffer.byteLength(text),byteLength:Buffer.byteLength(part),data:part}));};
  return {...h,binding,clock,protocol,envelope,json,pair,request,activate,active,frame,observation,chunks,events};
}

/** Native SDK-shaped filesystem/clock capabilities backed by the real host fixture files. */
export async function nativeCaptureHarness() {
  const h=await protocolHarness();
  const writes:{path:string;text:string}[]=[];
  let beforeWrite:((path:string,text:string)=>void|Promise<void>)|undefined;
  const driver={
    fs:{
      list:async(path:string)=>{const listing=await h.fs.list(resolve(path),257);return listing.names.map(name=>{const entry=h.fs.entries.get(resolve(path,name))!;return {name,kind:entry.info.kind==="directory"?"dir":entry.info.kind,size:entry.info.bytes,isLink:entry.info.kind==="link",mtimeMs:0};});},
      exists:async(path:string)=>h.fs.entries.has(resolve(path)),
      stat:async(path:string)=>{const value=await h.fs.stat(resolve(path));return {kind:value.kind==="directory"?"dir":value.kind,size:value.bytes,isLink:value.kind==="link",mtimeMs:0,realPath:resolve(path)};},
      read:async(path:string)=>(await h.fs.read(resolve(path),Number.MAX_SAFE_INTEGER)).toString(),
      write:async(path:string,text:string)=>{writes.push({path:resolve(path),text});await beforeWrite?.(resolve(path),text);h.fs.put(resolve(path),"file",text);}
    },
    clock:{now:async()=>h.clock.now(),after:(ms:number,callback:()=>void)=>({cancel:h.clock.schedule(callback,ms)})}
  };
  const environment={CLAUDE_WORKSPACES_CAPTURE_DIR:h.binding.directory,CLAUDE_WORKSPACES_CAPTURE_TOKEN:h.binding.token,
    CLAUDE_WORKSPACES_CAPTURE_SESSION_ID:fixtureTarget.sessionId,CLAUDE_WORKSPACES_CAPTURE_CLAUDE_SESSION_ID:fixtureTarget.claudeSessionId,
    CLAUDE_WORKSPACES_CAPTURE_GENERATION:fixtureTarget.generation};
  return {...h,driver,environment,writes,setBeforeWrite:(fn:typeof beforeWrite)=>{beforeWrite=fn;}};
}

/** Real disposable Node hosts; IPC belongs to this test harness, never the capture transport. */
export function captureHostProcess(root:string,electron?:string) {
  const modulePath=require.resolve("../../src/companion/companionCapture");
  const script=`
    if(process.argv[3])Object.defineProperty(process.versions,"electron",{value:process.argv[3]});
    const {CompanionCapture}=require(process.argv[1]);
    const host=new CompanionCapture({storageRoot:process.argv[2],currentTarget:()=>({sessionId:"managed-A",claudeSessionId:"11111111-1111-4111-8111-111111111111",generation:"generation-A"})});
    let binding;
    process.on("message",async ({id,command})=>{
      try {
        const result=command==="prepare"?await host.prepare("managed-A"):await host.revoke(binding);
        if(command==="prepare"&&result.ok)binding=result.value;
        process.send({id,ok:result.ok,directory:binding?.directory});
      } catch {process.send({id,ok:false});}
    });
    process.send({ready:true});
  `;
  const child=spawn(process.execPath,["-e",script,modulePath,root,electron??""],{stdio:["ignore","ignore","ignore","ipc"]});
  const ready=new Promise<void>((resolveReady,reject)=>{
    const timer=setTimeout(()=>reject(new Error("capture host fixture startup deadline")),5000);
    child.once("message",()=>{clearTimeout(timer);resolveReady();});child.once("error",error=>{clearTimeout(timer);reject(error);});
  });
  let next=0;
  return {child,ready,request:async(command:"prepare"|"cleanup")=>{
    await ready;const id=++next;
    return new Promise<{ok:boolean;directory?:string}>((resolveReply,reject)=>{
      const timer=setTimeout(()=>{child.removeListener("message",receive);reject(new Error("capture host fixture deadline"));},5000);
      const receive=(message:unknown)=>{const reply=message as {id:number;ok:boolean;directory?:string};if(reply.id===id){clearTimeout(timer);child.removeListener("message",receive);resolveReply(reply);}};
      child.on("message",receive);child.send({id,command});
    });
  },stop:async()=>{if(child.exitCode!==null||child.signalCode!==null)return;await new Promise<void>(resolveExit=>{child.once("exit",()=>resolveExit());child.kill();});}};
}
