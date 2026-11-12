import { randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, realpath, opendir, mkdir, open, rename, unlink, rmdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import type { Stats } from "node:fs";
import { captureEnvironmentKeys, captureLimits, decodeOwnershipMarker, decodeCaptureControl, decodeCaptureData, decodeUploadMarker, decodeNormalizedObservation } from "./companionTypes";
import type { CaptureBinding, ManagedCaptureIdentity, OwnershipMarker, CaptureHostControl, CaptureReasonCode, CaptureEpochRequest, CaptureAck, NormalizedObservation, ObservationChunk } from "./companionTypes";

export interface CaptureFileInfo {
  readonly identity:string;
  readonly kind:"file"|"directory"|"link"|"other";
  readonly bytes:number;
  readonly links:number;
}
export interface CaptureFileSystem {
  stat(path:string):Promise<CaptureFileInfo>;
  realpath(path:string):Promise<string>;
  list(path:string,limit:number):Promise<{names:string[];truncated:boolean}>;
  mkdir(path:string):Promise<void>;
  read(path:string,maxBytes:number):Promise<Uint8Array>;
  writeExclusive(path:string,data:Uint8Array):Promise<CaptureFileInfo>;
  rename(from:string,to:string):Promise<void>;
  unlink(path:string):Promise<void>;
  rmdir(path:string):Promise<void>;
}
export type CaptureResourceDiagnostic = "capture-unavailable"|"cleanup"|"cleanup-capacity";
export type CaptureResourceResult<T=void> = {readonly ok:true;readonly value:T} |
  {readonly ok:false;readonly reason:CaptureResourceDiagnostic};
export interface CaptureHostOptions {
  readonly now?:()=>number;
  readonly schedule?:(callback:()=>void,delay:number)=>()=>void;
  readonly storageRoot:string;
  readonly currentTarget:(sessionId:string)=>Readonly<ManagedCaptureIdentity>|undefined;
  readonly fs?:CaptureFileSystem;
  readonly randomBytes?:(size:number)=>Buffer;
  readonly processId?:number;
  readonly probeProcess?:(pid:number)=>void;
  readonly yieldControl?:()=>Promise<void>;
  readonly deadlineMs?:number;
  readonly evictComplete?:(request:Readonly<{sessionId:string;bytes:number;sessionAvailable:number;globalAvailable:number}>)=>void;
  readonly diagnostic?:(reason:CaptureResourceDiagnostic)=>void;
}
export interface CaptureReservation {readonly bytes:number;readonly files:number}

/** Compare stable filesystem object identities, never just a pathname. */
function fileInfo(stat:Stats):CaptureFileInfo {
  return {identity:`${stat.dev}:${stat.ino}:${stat.birthtimeMs}`,bytes:stat.size,links:stat.nlink,
    kind:stat.isSymbolicLink()?"link":stat.isDirectory()?"directory":stat.isFile()?"file":"other"};
}
/** Node implementation bounds enumeration and reads before allocating content buffers. */
export const nodeCaptureFileSystem:CaptureFileSystem={
  stat:async path=>fileInfo(await lstat(path)), realpath,
  async list(path,limit) {
    const directory=await opendir(path);const names:string[]=[];
    try {
      for(let index=0;index<limit;index++) {const entry=await directory.read();if(!entry)return {names,truncated:false};names.push(entry.name);}
      return {names,truncated:(await directory.read())!==null};
    } finally {await directory.close();}
  },
  mkdir:async path=>{await mkdir(path,{mode:0o700});},
  async read(path,maxBytes) {
    const before=await lstat(path);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.size>maxBytes)throw new Error("unsafe file");
    const handle=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));
    try {
      const after=await handle.stat();if(fileInfo(before).identity!==fileInfo(after).identity||!after.isFile()||after.size>maxBytes)throw new Error("changed file");
      const buffer=Buffer.alloc(maxBytes+1);let bytes=0;
      while(bytes<buffer.length) {const chunk=await handle.read(buffer,bytes,buffer.length-bytes,null);if(!chunk.bytesRead)break;bytes+=chunk.bytesRead;}
      if(bytes>maxBytes)throw new Error("oversize");return buffer.subarray(0,bytes);
    } finally {await handle.close();}
  },
  async writeExclusive(path,data) {
    const handle=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
    try {await handle.writeFile(data);return fileInfo(await handle.stat());} finally {await handle.close();}
  },
  rename,unlink,rmdir
};

class ResourceFailure extends Error {constructor(readonly reason:CaptureResourceDiagnostic){super(reason);}}
interface Work {readonly until:number;expired:boolean}
interface Owner {
  readonly binding:CaptureBinding;
  readonly directoryInfo:CaptureFileInfo;
  readonly markerInfo:CaptureFileInfo;
  readonly abort:AbortController;
  exposed:boolean;revoked:boolean;exit:boolean;removed:boolean;
  cleanup?:Promise<CaptureResourceResult>;
}
interface ReservationState {readonly owner:Owner;readonly value:CaptureReservation}
interface Mutation {readonly directory:string;readonly bytes:number;readonly files:number;readonly temporary?:string}
interface TemporaryFile {readonly directory:string;readonly info:CaptureFileInfo}
interface LockWaiter {readonly until:number;readonly grant:()=>void;readonly expire:()=>void;readonly timer:()=>void}
const ok:CaptureResourceResult={ok:true,value:undefined};
const markerKeys=["v","kind","hostId","processId","channelId","sessionId","claudeSessionId","generation"] as const;
function sameMarker(a:OwnershipMarker,b:OwnershipMarker):boolean {return markerKeys.every(key=>a[key]===b[key]);}
function sameTarget(a:ManagedCaptureIdentity,b:ManagedCaptureIdentity|undefined):boolean {
  return !!b&&a.sessionId===b.sessionId&&a.claudeSessionId===b.claudeSessionId&&a.generation===b.generation;
}
function code(error:unknown):unknown {return error!==null&&typeof error==="object"&&"code" in error?error.code:undefined;}
/** Closed direct-child names; sequence syntax and safe integer checks are both required. */
function allowedName(name:string):boolean {
  if(["ownership.json","control.json","ack.json","control.json.tmp","ack.json.tmp"].includes(name))return true;
  if(/^(request|activate)\.[a-f0-9]{32}\.(upload|ready)$/.test(name))return true;
  const match=/^frame\.[a-f0-9]{32}\.([1-9][0-9]*)\.(upload|ready|committed)$/.exec(name);
  return !!match&&Number.isSafeInteger(Number(match[1]));
}
function regular(info:CaptureFileInfo):boolean {return info.kind==="file"&&info.links===1;}

/** Host resource owner; only exact returned bindings confer authority. */
export class CompanionCapture {
  private readonly fs:CaptureFileSystem;
  private readonly entropy:(size:number)=>Buffer;
  private readonly root:string;
  private readonly hostId:string;
  private readonly owners=new Map<CaptureBinding,Owner>();
  private readonly protocols=new Map<CaptureBinding,Promise<CaptureResourceResult<CaptureProtocol>>>();
  private readonly reservations=new Map<CaptureReservation,ReservationState>();
  private readonly retained=new Map<CaptureRetentionTicket,{sessionId:string;bytes:number}>();
  private readonly retainedSessions=new Map<string,number>();
  private retainedBytes=0;
  private evicting=false;
  private rootIdentity:string|undefined;
  private busy=false;
  private readonly waiters:LockWaiter[]=[];
  private readonly pendingMutations=new Set<Mutation>();
  private readonly mutationSettlements=new Map<Mutation,Promise<void>>();
  private readonly temporaryFiles=new Map<string,TemporaryFile>();
  constructor(private readonly options:CaptureHostOptions) {
    this.fs=options.fs??nodeCaptureFileSystem;this.entropy=options.randomBytes??randomBytes;
    this.root=resolve(options.storageRoot);this.hostId=this.entropy(16).toString("hex");
  }
  private now():number {return (this.options.now??Date.now)();}
  private schedule(callback:()=>void,delay:number):()=>void {
    if(this.options.schedule)return this.options.schedule(callback,delay);
    const timer=setTimeout(callback,delay);return ()=>clearTimeout(timer);
  }
  /** Queueing and I/O share the caller's original finite deadline. */
  private deadline():number {return this.now()+Math.min(captureLimits.transactionMs,Math.max(1,this.options.deadlineMs??captureLimits.transactionMs));}
  private async acquire(until:number):Promise<void> {
    if(until<=this.now())throw new ResourceFailure("cleanup");
    if(!this.busy){this.busy=true;return;}
    if(this.waiters.length>=captureLimits.storageFiles)throw new ResourceFailure("cleanup-capacity");
    await new Promise<void>((grant,reject)=>{
      const expire=()=>{
        const index=this.waiters.indexOf(waiter);if(index>=0)this.waiters.splice(index,1);
        reject(new ResourceFailure("cleanup"));
      };
      const waiter:LockWaiter={until,grant,expire,timer:this.schedule(expire,Math.max(1,until-this.now()))};
      this.waiters.push(waiter);
    });
  }
  private releaseLock():void {
    for(;;) {
      const next=this.waiters.shift();if(!next){this.busy=false;return;}
      next.timer();
      if(next.until<=this.now()){next.expire();continue;}
      next.grant();return;
    }
  }
  private async run<T>(reason:CaptureResourceDiagnostic,body:(work:Work)=>Promise<T>,until=this.deadline()):Promise<CaptureResourceResult<T>> {
    let acquired=false;
    const work:Work={until,expired:false};
    try {
      await this.acquire(until);acquired=true;
      if(this.now()>=until)throw new ResourceFailure("cleanup");
      return {ok:true,value:await body(work)};
    }
    catch(error) {return this.failure(error instanceof ResourceFailure?error.reason:reason);}
    finally {if(acquired)this.releaseLock();}
  }
  private failure(reason:CaptureResourceDiagnostic):{ok:false;reason:CaptureResourceDiagnostic} {
    try {this.options.diagnostic?.(reason);} catch { /* Diagnostics cannot affect native continuation. */ }
    return {ok:false,reason};
  }
  private available(directory:string):void {
    if([...this.pendingMutations].some(mutation=>mutation.directory===directory))throw new ResourceFailure("cleanup");
  }
  /** A deadline ends our wait. Pending mutations retain their own directory and capacity charge. */
  private async io<T>(work:Work,operation:()=>Promise<T>,mutation?:Mutation):Promise<T> {
    if(mutation)this.available(mutation.directory);
    const remaining=work.until-this.now();if(work.expired||remaining<=0)throw new ResourceFailure("cleanup");
    let timer:(()=>void)|undefined;
    if(mutation)this.pendingMutations.add(mutation);
    const pending=Promise.resolve().then(operation).then(value=>{
      if(mutation?.temporary)this.temporaryFiles.set(mutation.temporary,{directory:mutation.directory,info:value as CaptureFileInfo});
      if(mutation){this.pendingMutations.delete(mutation);this.mutationSettlements.delete(mutation);}
      return value;
    },error=>{if(mutation){this.pendingMutations.delete(mutation);this.mutationSettlements.delete(mutation);}throw error;});
    if(mutation)this.mutationSettlements.set(mutation,pending.then(()=>{},()=>{}));
    try {
      return await Promise.race([pending,new Promise<never>((_,reject)=>{
        timer=this.schedule(()=>{work.expired=true;reject(new ResourceFailure("cleanup"));},remaining);
      })]);
    } finally {timer?.();}
  }
  /** Check every ancestor so a canonical final path cannot hide an intermediate link. */
  private async rootSafe(work:Work):Promise<void> {
    if(!isAbsolute(this.options.storageRoot))throw new ResourceFailure("capture-unavailable");
    let path=this.root;
    for(;;) {
      const stat=await this.io(work,()=>this.fs.stat(path));
      if(stat.kind!=="directory")throw new ResourceFailure("capture-unavailable");
      if(path===this.root) {
        if(this.rootIdentity&&this.rootIdentity!==stat.identity)throw new ResourceFailure("capture-unavailable");
        this.rootIdentity=stat.identity;
      }
      if(await this.io(work,()=>this.fs.realpath(path))!==path)throw new ResourceFailure("capture-unavailable");
      const parent=dirname(path);if(parent===path)break;path=parent;
    }
  }
  private async directorySafe(work:Work,path:string,expected?:CaptureFileInfo):Promise<CaptureFileInfo> {
    await this.rootSafe(work);
    if(dirname(path)!==this.root||!/^companion-[a-f0-9]{32}$/.test(basename(path)))throw new ResourceFailure("capture-unavailable");
    const stat=await this.io(work,()=>this.fs.stat(path));
    if(stat.kind!=="directory"||(expected&&stat.identity!==expected.identity)||await this.io(work,()=>this.fs.realpath(path))!==path)
      throw new ResourceFailure("capture-unavailable");
    return stat;
  }
  private async checkedFile(work:Work,directory:string,name:string,expected?:CaptureFileInfo):Promise<CaptureFileInfo> {
    if(!allowedName(name))throw new ResourceFailure("capture-unavailable");
    const path=resolve(directory,name);const stat=await this.io(work,()=>this.fs.stat(path));
    if(!regular(stat)||(expected&&stat.identity!==expected.identity)||await this.io(work,()=>this.fs.realpath(path))!==path)
      throw new ResourceFailure("capture-unavailable");
    return stat;
  }
  private async marker(work:Work,directory:string,expectedInfo?:CaptureFileInfo):Promise<{marker:OwnershipMarker;info:CaptureFileInfo}> {
    const info=await this.checkedFile(work,directory,"ownership.json",expectedInfo);
    if(info.bytes>captureLimits.ownershipBytes)throw new ResourceFailure("capture-unavailable");
    const decoded=decodeOwnershipMarker(await this.io(work,()=>this.fs.read(resolve(directory,"ownership.json"),captureLimits.ownershipBytes)),basename(directory));
    if(!decoded.ok)throw new ResourceFailure("capture-unavailable");
    await this.checkedFile(work,directory,"ownership.json",info);
    return {marker:decoded.value,info};
  }
  private held(binding:CaptureBinding):Owner {
    const owner=this.owners.get(binding);if(!owner||owner.removed)throw new ResourceFailure("capture-unavailable");return owner;
  }
  private async checkOwner(work:Work,owner:Owner,active:boolean):Promise<void> {
    try {
      if(owner.removed||(active&&(owner.revoked||!sameTarget(owner.binding.marker,this.options.currentTarget(owner.binding.marker.sessionId)))))throw new ResourceFailure("capture-unavailable");
      await this.directorySafe(work,owner.binding.directory,owner.directoryInfo);
      const actual=await this.marker(work,owner.binding.directory,owner.markerInfo);
      if(!sameMarker(owner.binding.marker,actual.marker))throw new ResourceFailure("capture-unavailable");
      if(active&&(owner.revoked||!sameTarget(owner.binding.marker,this.options.currentTarget(owner.binding.marker.sessionId))))throw new ResourceFailure("capture-unavailable");
    } catch(error) {
      // A proven identity/path mismatch is permanent; inability to inspect it is not new authority.
      if((error instanceof ResourceFailure&&error.reason==="capture-unavailable")||code(error)==="ENOENT") {
        owner.revoked=true;owner.abort.abort();
      }
      throw error;
    }
  }
  /** Create a fresh channel; a failed late operation leaves only retained, non-adoptable files. */
  async prepare(sessionId:string):Promise<CaptureResourceResult<CaptureBinding>> {
    return this.run("capture-unavailable",async work=>{
      const current=this.options.currentTarget(sessionId);
      if(!current||current.sessionId!==sessionId)throw new ResourceFailure("capture-unavailable");
      const target=Object.freeze({sessionId:current.sessionId,claudeSessionId:current.claudeSessionId,generation:current.generation});
      await this.rootSafe(work);
      await this.capacity(work,captureLimits.ownershipBytes,1,undefined,1);
      for(let attempt=0;attempt<8;attempt++) {
        const channelId=this.entropy(16).toString("hex");const directory=resolve(this.root,"companion-"+channelId);
        const marker=Object.freeze({v:1,kind:"claude-workspaces-companion",hostId:this.hostId,processId:this.options.processId??process.pid,channelId,...target} as const);
        const data=Buffer.from(JSON.stringify(marker));
        if(!decodeOwnershipMarker(data,basename(directory)).ok)throw new ResourceFailure("capture-unavailable");
        try {await this.io(work,()=>this.fs.mkdir(directory),{directory,bytes:0,files:0});} catch(error) {if(code(error)==="EEXIST")continue;throw error;}
        const directoryInfo=await this.directorySafe(work,directory);
        let owner:Owner|undefined;
        try {
          await this.io(work,()=>this.fs.writeExclusive(resolve(directory,"ownership.json"),data),{directory,bytes:data.byteLength,files:1});
          const actual=await this.marker(work,directory);
          if(!sameMarker(marker,actual.marker))throw new ResourceFailure("capture-unavailable");
          const binding=Object.freeze({directory,marker,token:this.entropy(32).toString("base64url")}) as CaptureBinding;
          owner={binding,directoryInfo,markerInfo:actual.info,abort:new AbortController(),exposed:false,revoked:false,exit:false,removed:false};
          this.owners.set(binding,owner);
          if(!sameTarget(target,this.options.currentTarget(sessionId)))throw new ResourceFailure("capture-unavailable");
          return binding;
        } catch(error) {
          if(!work.expired) {
            if(owner) {owner.revoked=true;owner.abort.abort();await this.cleanup(work,owner);}
            else {
              // Exclusive creation identity alone permits only an empty unpublished rollback.
              await this.directorySafe(work,directory,directoryInfo);
              const children=await this.io(work,()=>this.fs.list(directory,1));
              if(!children.truncated&&!children.names.length)await this.io(work,()=>this.fs.rmdir(directory),{directory,bytes:0,files:0});
            }
          }
          throw error;
        }
      }
      throw new ResourceFailure("cleanup-capacity");
    });
  }
  /** Admit only the held owner, current managed target and unchanged regular marker. */
  async validateOwner(binding:CaptureBinding):Promise<CaptureResourceResult> {
    return this.active(binding,async()=>{});
  }
  /** Runtime calls synchronously immediately before entering the underlying factory. */
  markProducerExposed(binding:CaptureBinding):boolean {
    const owner=this.owners.get(binding);
    if(!owner||owner.removed||owner.revoked||owner.exposed||!sameTarget(binding.marker,this.options.currentTarget(binding.marker.sessionId)))return false;
    if([...this.pendingMutations].some(mutation=>mutation.directory===binding.directory))return false;
    owner.exposed=true;return true;
  }
  /** Owner lifetime cancellation; epoch and transaction cancellation remain separate. */
  signal(binding:CaptureBinding):AbortSignal|undefined {return this.owners.get(binding)?.abort.signal;}
  /** Revoke synchronously before considering unpublished rollback or confirmed-exit cleanup. */
  async revoke(binding:CaptureBinding):Promise<CaptureResourceResult> {
    const owner=this.owners.get(binding);if(!owner)return this.failure("capture-unavailable");
    owner.revoked=true;owner.abort.abort();
    if(owner.removed)return ok;
    if(owner.exposed&&!owner.exit)return ok;
    if(owner.cleanup)return owner.cleanup;
    owner.cleanup=this.cleanupAfterContent(owner);
    const result=await owner.cleanup;owner.cleanup=undefined;return result;
  }
  /** Only the runtime-held object is accepted; this callback cannot throw into PTY delivery. */
  confirmManagedPtyExit(binding:CaptureBinding):void {
    try {
      const owner=this.owners.get(binding);if(!owner||owner.removed||owner.exit)return;
      owner.exit=true;void this.revoke(binding).catch(()=>{this.failure("cleanup");});
    } catch {this.failure("cleanup");}
  }
  /** Await already-started cleanup, without creating another timer, retry or authority. */
  async settled(binding:CaptureBinding):Promise<void> {await this.owners.get(binding)?.cleanup;}
  /** One coalesced cleanup waits for stopped content work within the same overall deadline. */
  private async cleanupAfterContent(owner:Owner):Promise<CaptureResourceResult> {
    const until=this.deadline();
    // A revoked owner cannot launch more mutations. At most one settlement wait is needed.
    for(let attempt=0;attempt<2;attempt++) {
      const result=await this.run("cleanup",async work=>{
        const pending=[...this.pendingMutations].filter(mutation=>mutation.directory===owner.binding.directory);
        if(pending.length)return {wait:Promise.all(pending.map(mutation=>this.mutationSettlements.get(mutation)!)).then(()=>{})};
        await this.cleanup(work,owner);return {wait:undefined};
      },until);
      if(!result.ok)return result;
      if(!result.value.wait)return ok;
      try {await this.io({until,expired:false},()=>result.value.wait!);}
      catch {return this.failure("cleanup");}
    }
    return this.failure("cleanup");
  }
  private async children(work:Work,directory:string):Promise<Map<string,CaptureFileInfo>> {
    const list=await this.io(work,()=>this.fs.list(directory,captureLimits.cleanupEntries));
    if(list.truncated)throw new ResourceFailure("cleanup-capacity");
    const children=new Map<string,CaptureFileInfo>();
    for(const name of list.names)children.set(name,await this.checkedFile(work,directory,name));
    return children;
  }
  private async remove(work:Work,directory:string,directoryInfo:CaptureFileInfo,expected:OwnershipMarker,markerInfo:CaptureFileInfo):Promise<void> {
    this.available(directory);
    const children=await this.children(work,directory);
    if(!children.has("ownership.json"))throw new ResourceFailure("cleanup");
    const names=[...children.keys()].filter(n=>n!=="ownership.json");names.push("ownership.json");
    for(const name of names) {
      await this.directorySafe(work,directory,directoryInfo);
      if(!sameMarker((await this.marker(work,directory,markerInfo)).marker,expected))throw new ResourceFailure("cleanup");
      const current=await this.io(work,()=>this.fs.list(directory,captureLimits.cleanupEntries));
      if(current.truncated||current.names.length!==children.size||current.names.some(child=>!children.has(child)))
        throw new ResourceFailure("cleanup");
      await this.checkedFile(work,directory,name,children.get(name));
      await this.io(work,()=>this.fs.unlink(resolve(directory,name)),{directory,bytes:children.get(name)!.bytes,files:1});
      children.delete(name);
    }
    await this.directorySafe(work,directory,directoryInfo);
    await this.io(work,()=>this.fs.rmdir(directory),{directory,bytes:0,files:0});
  }
  private async cleanup(work:Work,owner:Owner):Promise<void> {
    if(!owner.revoked||!owner.abort.signal.aborted||(owner.exposed&&!owner.exit))throw new ResourceFailure("cleanup");
    await this.checkOwner(work,owner,false);
    await this.remove(work,owner.binding.directory,owner.directoryInfo,owner.binding.marker,owner.markerInfo);
    owner.removed=true;
    for(const [value,state] of this.reservations)if(state.owner===owner)this.reservations.delete(value);
    for(const [path,file] of this.temporaryFiles)if(file.directory===owner.binding.directory)this.temporaryFiles.delete(path);
    this.owners.delete(owner.binding);this.protocols.delete(owner.binding);
  }
  /** Lost owners are previous candidates: only ESRCH, never an age/host-ID mismatch, proves death. */
  async sweep():Promise<CaptureResourceResult> {
    return this.run("cleanup",async work=>{
      await this.rootSafe(work);
      const list=await this.io(work,()=>this.fs.list(this.root,captureLimits.cleanupEntries));
      for(const name of list.names) {
        if(!/^companion-[a-f0-9]{32}$/.test(name))continue;
        const directory=resolve(this.root,name);
        if([...this.owners.values()].some(owner=>owner.binding.directory===directory&&!owner.removed))continue;
        try {
          const directoryInfo=await this.directorySafe(work,directory);const actual=await this.marker(work,directory);
          let dead=false;
          try {(this.options.probeProcess??(pid=>{process.kill(pid,0);}))(actual.marker.processId);} catch(error) {dead=code(error)==="ESRCH";}
          if(dead)await this.remove(work,directory,directoryInfo,actual.marker,actual.info);
        } catch(error) {
          if(work.expired)throw error;
          if(error instanceof ResourceFailure&&error.reason==="cleanup-capacity")this.failure("cleanup-capacity");
          else if(!(error instanceof ResourceFailure)&&code(error)!=="ENOENT")this.failure("cleanup");
        }
        await this.io(work,this.options.yieldControl??(()=>new Promise<void>(resolveYield=>setImmediate(resolveYield))));
      }
      if(list.truncated)throw new ResourceFailure("cleanup-capacity");
    });
  }
  private async capacity(work:Work,extraBytes:number,extraFiles:number,stagingOwner?:Owner,extraDirectories=0):Promise<void> {
    // Snapshot before scanning: settlement can only make this charge more conservative.
    const pending=[...this.pendingMutations];
    const root=await this.io(work,()=>this.fs.list(this.root,captureLimits.cleanupEntries));
    if(root.truncated)throw new ResourceFailure("cleanup-capacity");
    let bytes=extraBytes;let files=extraFiles;
    const absentDirectories=new Set(pending.filter(mutation=>!root.names.includes(basename(mutation.directory))).map(mutation=>mutation.directory));
    if(root.names.length+absentDirectories.size+extraDirectories>captureLimits.cleanupEntries)throw new ResourceFailure("cleanup-capacity");
    for(const mutation of pending){bytes+=mutation.bytes;files+=mutation.files;}
    for(const state of this.reservations.values()) {bytes+=state.value.bytes;files+=state.value.files;}
    for(const name of root.names) {
      if(!/^companion-[a-f0-9]{32}$/.test(name))continue;
      const directory=resolve(this.root,name);
      try {
        await this.directorySafe(work,directory);
        const children=await this.io(work,()=>this.fs.list(directory,captureLimits.cleanupEntries));
        if(children.truncated)throw new ResourceFailure("cleanup-capacity");
        const staged=new Set<string>();
        const held=[...this.reservations.values()].filter(state=>state.owner.binding.directory===directory);
        let stagedBytes=held.reduce((sum,state)=>sum+state.value.bytes,stagingOwner?.binding.directory===directory?extraBytes:0);
        const stagedCount=held.length+(stagingOwner?.binding.directory===directory?1:0);
        for(const child of children.names) {
          // Even invalid regular files consume capacity; unknown descendants cannot be bounded.
          if(basename(child)!==child)throw new ResourceFailure("cleanup-capacity");
          const info=await this.io(work,()=>this.fs.stat(resolve(directory,child)));
          if(!regular(info)||!Number.isSafeInteger(info.bytes)||info.bytes<0)throw new ResourceFailure("cleanup-capacity");
          bytes+=info.bytes;files++;
          if(allowedName(child)&&/\.(upload|ready)$/.test(child)) {
            staged.add(child.replace(/\.(upload|ready)$/, ""));stagedBytes+=info.bytes;
          }
          if(bytes>captureLimits.storageBytes||files>captureLimits.storageFiles)throw new ResourceFailure("cleanup-capacity");
        }
        if(staged.size+stagedCount>captureLimits.stagedTransactions||stagedBytes>captureLimits.stagedBytes)throw new ResourceFailure("cleanup-capacity");
      } catch {throw new ResourceFailure("cleanup-capacity");}
    }
    if(bytes>captureLimits.storageBytes||files>captureLimits.storageFiles)throw new ResourceFailure("cleanup-capacity");
  }
  /** Transaction failures preserve ownership; the epoch consumer cancels its own failed work. */
  private async active<T>(binding:CaptureBinding,body:(work:Work,owner:Owner)=>Promise<T>):Promise<CaptureResourceResult<T>> {
    return this.run("capture-unavailable",async work=>{
      const owner=this.held(binding);
      await this.checkOwner(work,owner,true);this.available(binding.directory);return await body(work,owner);
    });
  }
  /** Reserve staged transport conservatively in addition to all bytes/files currently on disk. */
  async reserve(binding:CaptureBinding,bytes:number,files:number):Promise<CaptureResourceResult<CaptureReservation>> {
    // Capacity refusal must leave existing reservations releasable and the owner usable.
    return this.run("cleanup-capacity",async work=>{
      const owner=this.held(binding);
      await this.checkOwner(work,owner,true);
      this.available(binding.directory);
      if(!Number.isSafeInteger(bytes)||bytes<0||!Number.isSafeInteger(files)||files<1)throw new ResourceFailure("cleanup-capacity");
      const held=[...this.reservations.values()].filter(state=>state.owner===owner);
      if(held.length>=captureLimits.stagedTransactions||held.reduce((sum,state)=>sum+state.value.bytes,bytes)>captureLimits.stagedBytes)
        throw new ResourceFailure("cleanup-capacity");
      await this.capacity(work,bytes,files,owner);
      const value=Object.freeze({bytes,files});this.reservations.set(value,{owner,value});return value;
    });
  }
  /** Release only a held ticket; disk usage is always rescanned and never inferred from release. */
  release(reservation:CaptureReservation):void {this.reservations.delete(reservation);}
  /** Promote only a host-computed frame name under the same owner; existing destinations are retained. */
  async promoteFrame(binding:CaptureBinding,epoch:string,sequence:number):Promise<CaptureResourceResult> {
    return this.active(binding,async(work,owner)=>{
      if(!/^[a-f0-9]{32}$/.test(epoch)||!Number.isSafeInteger(sequence)||sequence<1)throw new ResourceFailure("capture-unavailable");
      const upload=`frame.${epoch}.${sequence}.upload`;const committed=`frame.${epoch}.${sequence}.committed`;
      const from=resolve(binding.directory,upload);const to=resolve(binding.directory,committed);
      const info=await this.checkedFile(work,binding.directory,upload);
      await this.capacity(work,0,0);await this.checkOwner(work,owner,true);
      try {await this.io(work,()=>this.fs.stat(to));throw new ResourceFailure("capture-unavailable");}
      catch(error) {if(code(error)!=="ENOENT")throw error;}
      await this.checkedFile(work,binding.directory,upload,info);
      await this.io(work,()=>this.fs.rename(from,to),{directory:binding.directory,bytes:info.bytes,files:1});
      await this.checkOwner(work,owner,true);
    });
  }
  /** Only initial confirmed ENOENT is not-ready; other errors fail the transaction, not the owner. */
  async readOptionalFile(binding:CaptureBinding,name:string,maxBytes:number):Promise<CaptureResourceResult<Uint8Array|undefined>> {
    return this.readOwnedFile(binding,name,maxBytes,true);
  }
  /** Read a mandatory closed child under an active exact owner, with a preallocation byte limit. */
  async readFile(binding:CaptureBinding,name:string,maxBytes:number):Promise<CaptureResourceResult<Uint8Array>> {
    return this.readOwnedFile(binding,name,maxBytes,false) as Promise<CaptureResourceResult<Uint8Array>>;
  }
  private async readOwnedFile(binding:CaptureBinding,name:string,maxBytes:number,optional:boolean):Promise<CaptureResourceResult<Uint8Array|undefined>> {
    return this.active(binding,async(work,owner)=>{
      if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>captureLimits.frameBytes)throw new ResourceFailure("capture-unavailable");
      await this.capacity(work,0,0);
      let info:CaptureFileInfo;
      try {info=await this.checkedFile(work,binding.directory,name);}
      catch(error) {
        if(!optional||code(error)!=="ENOENT")throw error;
        await this.checkOwner(work,owner,true);return undefined;
      }
      if(info.bytes>maxBytes)throw new ResourceFailure("capture-unavailable");
      const data=await this.io(work,()=>this.fs.read(resolve(binding.directory,name),maxBytes));
      await this.checkOwner(work,owner,true);await this.checkedFile(work,binding.directory,name,info);
      return data;
    });
  }
  /** Reconcile only a temporary file whose exact creation handle completed under this owner. */
  private async clearTemporary(work:Work,owner:Owner,name:string):Promise<void> {
    const directory=owner.binding.directory;const path=resolve(directory,name);const held=this.temporaryFiles.get(path);
    if(!held)return;
    this.available(directory);await this.checkOwner(work,owner,true);
    let info:CaptureFileInfo;
    try {info=await this.checkedFile(work,directory,name,held.info);}
    catch(error) {if(code(error)!=="ENOENT")throw error;this.temporaryFiles.delete(path);return;}
    await this.io(work,()=>this.fs.unlink(path),{directory,bytes:info.bytes,files:1});
    this.temporaryFiles.delete(path);
  }
  /** Fixed metadata replacement charges both the old file and temporary new file until rename. */
  async writeMetadata(binding:CaptureBinding,name:"control.json"|"ack.json",data:Uint8Array,current:()=>boolean=()=>true,published?:()=>void):Promise<CaptureResourceResult> {
    return this.active(binding,async(work,owner)=>{
      if((name!=="control.json"&&name!=="ack.json")||data.byteLength>captureLimits.controlBytes)throw new ResourceFailure("capture-unavailable");
      if(!current())throw new ResourceFailure("cleanup");
      const temp=name+".tmp";const tempPath=resolve(binding.directory,temp);const path=resolve(binding.directory,name);
      await this.clearTemporary(work,owner,temp);
      let previous:CaptureFileInfo|undefined;
      try {previous=await this.checkedFile(work,binding.directory,name);} catch(error) {if(code(error)!=="ENOENT")throw error;}
      await this.capacity(work,data.byteLength,1);
      await this.checkOwner(work,owner,true);
      await this.io(work,()=>this.fs.writeExclusive(tempPath,Buffer.from(data)),{directory:binding.directory,bytes:data.byteLength,files:1,temporary:tempPath});
      const created=await this.checkedFile(work,binding.directory,temp);
      await this.checkOwner(work,owner,true);
      if(previous)await this.checkedFile(work,binding.directory,name,previous);
      else {
        try {await this.io(work,()=>this.fs.stat(path));throw new ResourceFailure("capture-unavailable");}
        catch(error) {if(code(error)!=="ENOENT")throw error;}
      }
      await this.checkedFile(work,binding.directory,temp,created);
      if(!current())throw new ResourceFailure("cleanup");
      await this.io(work,()=>this.fs.rename(tempPath,path),{directory:binding.directory,bytes:created.bytes,files:1});
      published?.();this.temporaryFiles.delete(tempPath);
      await this.checkOwner(work,owner,true);
    });
  }
  /** Active transaction retirement never includes ownership/control authority files. */
  async retireFiles(binding:CaptureBinding,names:readonly string[]):Promise<CaptureResourceResult> {
    return this.active(binding,async(work,owner)=>{
      if(names.length>captureLimits.cleanupEntries||new Set(names).size!==names.length||
        names.some(name=>!allowedName(name)||! /^(request|activate|frame)\./.test(name)))throw new ResourceFailure("capture-unavailable");
      const files=new Map<string,CaptureFileInfo>();
      for(const name of names)files.set(name,await this.checkedFile(work,binding.directory,name));
      for(const [name,info] of files) {
        await this.checkOwner(work,owner,true);await this.checkedFile(work,binding.directory,name,info);
        await this.io(work,()=>this.fs.unlink(resolve(binding.directory,name)),{directory:binding.directory,bytes:info.bytes,files:1});
      }
    });
  }
  /** Reserve shared source/derived retention; complete-group eviction is supplied by the model. */
  reserveRetention(binding:CaptureBinding,bytes:number):CaptureRetentionTicket|undefined {
    const owner=this.owners.get(binding);
    if(!owner||owner.revoked||owner.removed||!sameTarget(binding.marker,this.options.currentTarget(binding.marker.sessionId))||
      !Number.isSafeInteger(bytes)||bytes<1||bytes>captureLimits.sessionBytes||this.evicting)return undefined;
    const sessionId=binding.marker.sessionId;
    if(!this.retentionRoom(sessionId,bytes)) {
      this.evicting=true;
      try {const usage=this.retentionUsage(sessionId);void Promise.resolve(this.options.evictComplete?.(Object.freeze({sessionId,bytes,
        sessionAvailable:captureLimits.sessionBytes-usage.sessionBytes,globalAvailable:captureLimits.globalBytes-usage.globalBytes}))).catch(()=>{this.failure("capture-unavailable");});}
      catch {this.failure("capture-unavailable");}finally{this.evicting=false;}
    }
    if(owner.revoked||owner.removed||!sameTarget(binding.marker,this.options.currentTarget(sessionId))||!this.retentionRoom(sessionId,bytes))return undefined;
    const ticket=Object.freeze({reservedBytes:bytes});this.retained.set(ticket,{sessionId,bytes});
    this.retainedBytes+=bytes;this.retainedSessions.set(sessionId,(this.retainedSessions.get(sessionId)??0)+bytes);return ticket;
  }
  private retentionRoom(sessionId:string,bytes:number):boolean {
    return (this.retainedSessions.get(sessionId)??0)+bytes<=captureLimits.sessionBytes&&this.retainedBytes+bytes<=captureLimits.globalBytes;
  }
  /** Transfer/shrink a held ticket after serialized assembly release, or account derived text. */
  resizeRetention(ticket:CaptureRetentionTicket,bytes:number):boolean {
    const held=this.retained.get(ticket);if(!held||!Number.isSafeInteger(bytes)||bytes<1)return false;
    const delta=bytes-held.bytes;if(delta>0&&!this.retentionRoom(held.sessionId,delta))return false;
    held.bytes=bytes;this.retainedBytes+=delta;this.retainedSessions.set(held.sessionId,(this.retainedSessions.get(held.sessionId)??0)+delta);return true;
  }
  /** Release only the exact ticket; repeated/forged releases have no effect. */
  releaseRetention(ticket:CaptureRetentionTicket):void {
    const held=this.retained.get(ticket);if(!held)return;this.retained.delete(ticket);this.retainedBytes-=held.bytes;
    const remaining=(this.retainedSessions.get(held.sessionId)??0)-held.bytes;
    if(remaining)this.retainedSessions.set(held.sessionId,remaining);else this.retainedSessions.delete(held.sessionId);
  }
  /** Credential-free shared accounting totals. */
  retentionUsage(sessionId:string) {return Object.freeze({sessionBytes:this.retainedSessions.get(sessionId)??0,globalBytes:this.retainedBytes});}
  /** Bounded exact-owner enumeration for protocol staging/obsolete transaction cleanup. */
  async transactionFiles(binding:CaptureBinding):Promise<CaptureResourceResult<readonly string[]>> {
    return this.active(binding,async(work,owner)=>{
      const children=await this.children(work,binding.directory);await this.checkOwner(work,owner,true);
      return Object.freeze([...children.keys()].filter(name=>/^(request|activate|frame)\./.test(name)));
    });
  }
  /** Inspect a write-once pair in one resource deadline; only an authorized complete frame is promoted. */
  async inspectTransaction(binding:CaptureBinding,base:string,admit:(upload:Uint8Array,ready:Uint8Array)=>boolean,current:()=>boolean=()=>true):Promise<CaptureResourceResult<CaptureTransaction>> {
    return this.active(binding,async(work,owner)=>{
      if(!allowedName(base+".upload"))throw new ResourceFailure("capture-unavailable");
      await this.capacity(work,0,0);
      const held=new Map<string,{info:CaptureFileInfo;data:Uint8Array}>();
      for(const suffix of ["upload","ready"]) {
        const name=base+"."+suffix;let info:CaptureFileInfo;
        try {info=await this.checkedFile(work,binding.directory,name);}catch(error){if(code(error)==="ENOENT")continue;throw error;}
        const limit=suffix==="ready"||!base.startsWith("frame.")?captureLimits.controlBytes:captureLimits.frameBytes;
        if(info.bytes>limit)continue;
        const data=await this.io(work,()=>this.fs.read(resolve(binding.directory,name),limit));held.set(suffix,{info,data});
      }
      await this.checkOwner(work,owner,true);
      for(const [suffix,file] of held) {
        const name=base+"."+suffix;await this.checkedFile(work,binding.directory,name,file.info);
        const repeated=await this.io(work,()=>this.fs.read(resolve(binding.directory,name),file.data.length||1));
        if(!Buffer.from(repeated).equals(Buffer.from(file.data)))throw new ResourceFailure("cleanup");
      }
      const upload=held.get("upload")?.data;const ready=held.get("ready")?.data;
      if(upload&&ready&&admit(upload,ready)&&base.startsWith("frame.")) {
        await this.checkOwner(work,owner,true);
        const to=resolve(binding.directory,base+".committed");
        try {await this.io(work,()=>this.fs.stat(to));throw new ResourceFailure("capture-unavailable");}catch(error){if(code(error)!=="ENOENT")throw error;}
        if(!current())throw new ResourceFailure("cleanup");
        await this.io(work,()=>this.fs.rename(resolve(binding.directory,base+".upload"),to),
          {directory:binding.directory,bytes:upload.byteLength,files:1});
        await this.checkOwner(work,owner,true);
        await this.checkedFile(work,binding.directory,base+".committed",held.get("upload")!.info);
        const committed=await this.io(work,()=>this.fs.read(to,captureLimits.frameBytes));
        if(!Buffer.from(committed).equals(Buffer.from(upload)))throw new ResourceFailure("cleanup");
        return {upload:committed,ready,promoted:true};
      }
      return {upload,ready,promoted:false};
    });
  }
  /** Start at most one protocol for this exact owner; no wire record can restore it. */
  startProtocol(binding:CaptureBinding,options:CaptureProtocolOptions={}):Promise<CaptureResourceResult<CaptureProtocol>> {
    const owner=this.owners.get(binding);if(!owner||owner.removed||owner.revoked)return Promise.resolve(this.failure("capture-unavailable"));
    const existing=this.protocols.get(binding);if(existing)return existing;
    const pending=this.openProtocol(binding,options);this.protocols.set(binding,pending);return pending;
  }
  private async openProtocol(binding:CaptureBinding,options:CaptureProtocolOptions):Promise<CaptureResourceResult<CaptureProtocol>> {
    const valid=await this.validateOwner(binding);if(!valid.ok)return valid;
    const protocol=new OwnedCaptureProtocol(this,binding,options,()=>this.entropy(16).toString("hex"));
    const result=await protocol.initialize();if(!result.ok)return result;
    return {ok:true,value:protocol};
  }
  /** Overlay only literal capture fields; never carry an inherited or revoked binding. */
  environment(inherited:Readonly<Record<string,string|undefined>>,binding?:CaptureBinding):Record<string,string|undefined> {
    const environment={...inherited};for(const key of captureEnvironmentKeys)delete environment[key];
    const owner=binding&&this.owners.get(binding);
    if(owner&&!owner.revoked&&!owner.removed&&sameTarget(owner.binding.marker,this.options.currentTarget(owner.binding.marker.sessionId))) {
      const {directory,token,marker}=owner.binding;
      const values=[directory,token,marker.sessionId,marker.claudeSessionId,marker.generation];
      captureEnvironmentKeys.forEach((key,index)=>{environment[key]=values[index];});
    }
    return environment;
  }
}


export interface CaptureTransaction {readonly upload:Uint8Array|undefined;readonly ready:Uint8Array|undefined;readonly promoted:boolean}
/** Host scheduler injection is trusted and never sourced from producer metadata. */
export interface CaptureProtocolOptions {
  readonly now?:()=>number;
  readonly autoPoll?:boolean;
  readonly schedule?:(callback:()=>void,delay:number)=>()=>void;
  readonly onEvent?:(event:CaptureSourceEvent)=>unknown;
}
class ProtocolFailure extends Error {constructor(readonly reason:CaptureReasonCode){super(reason);}}
/** One protocol per exact resource owner, with separate epoch and owner lifetimes. */
export type CaptureProtocol=Pick<OwnedCaptureProtocol,"poll"|"snapshot"|"stop">;
class OwnedCaptureProtocol {
  private control:CaptureHostControl;
  private ackSeq=0;
  private gaps=0;
  private retiring:CaptureReasonCode|undefined;
  private lastBoundaryEpoch:string|undefined;
  private stopped=false;
  private cancelTimer:(()=>void)|undefined;
  private worked=false;
  private inflight:Promise<void>|undefined;
  private handshakeUntil:number|undefined;
  private healthAt=0;
  private eligible=false;
  private assembly:CaptureAssembly|undefined;
  private lastObservationId=0;
  private afterGap=false;
  private request:CaptureEpochRequest|undefined;
  private readonly abandoned=new Set<string>();
  private readonly partials=new Map<string,{started:number;authenticated:boolean}>();
  constructor(private readonly resources:CompanionCapture,private readonly binding:CaptureBinding,
    private readonly options:CaptureProtocolOptions,private readonly nonce:()=>string) {
    const {sessionId,claudeSessionId,generation}=binding.marker;
    this.control=Object.freeze({v:1,kind:"control",token:binding.token,sessionId,claudeSessionId,generation,
      controlRevision:1,state:"offered",offerId:nonce(),captureEpoch:null,grantId:null,predecessorEpoch:null,
      reasonCode:null,recoveriesRemaining:1,lastRetired:null});
    resources.signal(binding)?.addEventListener("abort",()=>this.stop(),{once:true});
  }
  private now():number {return (this.options.now??Date.now)();}
  private live():boolean {return !this.stopped&&!this.resources.signal(this.binding)?.aborted;}
  private envelope() {const {sessionId,claudeSessionId,generation}=this.binding.marker;return {v:1 as const,token:this.binding.token,sessionId,claudeSessionId,generation};}
  private authentic(value:unknown):value is Record<string,unknown> {
    if(!value||typeof value!=="object"||Array.isArray(value))return false;
    const v=value as Record<string,unknown>;const expected=this.envelope();
    if(v.v!==1||v.sessionId!==expected.sessionId||v.claudeSessionId!==expected.claudeSessionId||v.generation!==expected.generation||typeof v.token!=="string")return false;
    const token=Buffer.from(v.token);const held=Buffer.from(expected.token);
    return token.length===held.length&&timingSafeEqual(token,held);
  }
  private parse(data:Uint8Array):unknown {try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(data));}catch{return undefined;}}
  private member(base:string,v:Record<string,unknown>):boolean {
    if(base.startsWith("request."))return v.offerId===base.slice(8)&&(v.offerId===this.control.offerId||((this.control.state==="active"||this.control.state==="granted")&&v.offerId===this.control.grantId));
    if(base.startsWith("activate."))return v.captureEpoch===base.slice(9)&&v.captureEpoch===this.control.captureEpoch&&
      (this.control.state==="granted"||this.control.state==="active");
    const parts=base.split(".");return this.control.state==="active"&&v.captureEpoch===this.control.captureEpoch&&v.captureEpoch===parts[1]&&
      !(typeof v.seq==="number"&&Number.isSafeInteger(v.seq)&&v.seq>0&&v.seq<=this.ackSeq);
  }
  private expired():CaptureReasonCode|undefined {
    if(this.handshakeUntil!==undefined&&this.now()>=this.handshakeUntil)return "HANDSHAKE_TIMEOUT";
    if(this.control.state==="active"&&this.now()-this.healthAt>=captureLimits.healthMs)return "TRANSACTION_TIMEOUT";
    if(this.assembly&&(this.now()-this.assembly.started>=captureLimits.assemblyAbsoluteMs||
      this.now()-this.assembly.progress>=captureLimits.assemblyProgressMs))return "TRANSACTION_TIMEOUT";
    if([...this.partials.values()].some(p=>p.authenticated&&this.now()-p.started>=captureLimits.transactionMs))return "TRANSACTION_TIMEOUT";
    return undefined;
  }
  private async metadata(name:"control.json"|"ack.json",value:unknown,retiring=false):Promise<number> {
    const current=()=>this.live()&&(retiring||!this.expired());
    if(!current())throw new ProtocolFailure(this.expired()??"CHANNEL_RETIRED");let visibleAt=this.now();
    const result=await this.resources.writeMetadata(this.binding,name,Buffer.from(JSON.stringify(value)),current,()=>{visibleAt=this.now();});
    if(!current()||!result.ok)throw new ProtocolFailure(this.expired()??"TRANSACTION_TIMEOUT");return visibleAt;
  }
  private async replace(patch:Partial<CaptureHostControl>):Promise<number> {
    if(this.control.controlRevision===Number.MAX_SAFE_INTEGER){this.stop();throw new ProtocolFailure("CHANNEL_RETIRED");}
    const next=Object.freeze({...this.control,...patch,controlRevision:this.control.controlRevision+1});
    const visibleAt=await this.metadata("control.json",next,next.state==="retired"||next.state==="failed");this.control=next;return visibleAt;
  }
  private async ack(epoch:string,seq:number,reason?:CaptureReasonCode):Promise<void> {
    const ack:CaptureAck=reason?{...this.envelope(),kind:"ack",captureEpoch:epoch,ackSeq:seq,disposition:"retired",reasonCode:reason}:
      {...this.envelope(),kind:"ack",captureEpoch:epoch,ackSeq:seq,disposition:"continue"};
    await this.metadata("ack.json",ack,reason!==undefined);
  }
  /** Execute one bounded host poll. Concurrent calls share the same work, with no queued polls. */
  poll():Promise<void> {
    if(!this.live())return Promise.resolve();if(this.inflight)return this.inflight;
    this.cancelTimer?.();this.cancelTimer=undefined;this.worked=false;
    this.inflight=this.tick().catch(async error=>{
      if(this.live())try{await this.retire(error instanceof ProtocolFailure?error.reason:"TRANSACTION_TIMEOUT");}catch{this.stop();}
    }).finally(()=>{this.inflight=undefined;this.arm(this.worked?captureLimits.busyPollMs:captureLimits.idlePollMs);});return this.inflight;
  }
  private async tick():Promise<void> {
    const owned=await this.resources.validateOwner(this.binding);if(!this.live())return;
    const expiry=this.expired();if(expiry){await this.retire(expiry);return;}
    // Fair-lock contention and transient inspection failure are not proof of source loss.
    if(!owned.ok)return;
    const files=await this.resources.transactionFiles(this.binding);if(!this.live())return;if(!files.ok)return;
    const bases=[...new Set(files.value.map(name=>name.replace(/\.(upload|ready|committed)$/, "")))];
    for(const base of this.partials.keys())if(!bases.includes(base))this.partials.delete(base);
    for(const base of this.abandoned)if(!bases.includes(base))this.abandoned.delete(base);
    bases.sort((a,b)=>{const rank=(s:string)=>s.startsWith("request.")?0:s.startsWith("activate.")?1:2;return rank(a)-rank(b)||Number(a.split(".")[2])-Number(b.split(".")[2]);});
    this.worked=bases.length>0;
    for(const base of bases.filter(base=>!this.abandoned.has(base)).slice(0,captureLimits.stagedTransactions)) {
      if(!this.live())return;
      if(!this.filenameMember(base)){await this.clean(base);continue;}
      if(!this.partials.has(base))this.partials.set(base,{started:this.now(),authenticated:false});
      let current=false;let incompleteMarker=false;let invalid:CaptureReasonCode|undefined;
      const pair=await this.resources.inspectTransaction(this.binding,base,(upload,ready)=>{
        const raw=this.parse(upload);current=this.authentic(raw)&&this.member(base,raw);if(!current||!this.live())return false;
        if(this.now()-this.partials.get(base)!.started>=captureLimits.transactionMs){invalid="TRANSACTION_TIMEOUT";return false;}
        // Stable reads do not prove that a paused write-once marker is complete.
        if(this.parse(ready)===undefined){incompleteMarker=true;return false;}
        const marker=decodeUploadMarker(ready,base+".upload");
        if(!marker.ok){invalid="SCHEMA_REJECTED";return false;}
        if(marker.value.byteLength!==upload.byteLength){invalid="CONTENT_REJECTED";return false;}
        return true;
      },()=>this.live()&&!this.expired());
      if(!this.live())return;
      const expired=this.expired();if(expired)throw new ProtocolFailure(expired);
      if(!pair.ok){await this.partial(base,current);continue;}
      const raw=pair.value.upload&&this.parse(pair.value.upload);
      current=this.authentic(raw)&&this.member(base,raw);
      if(!pair.value.upload||!pair.value.ready||incompleteMarker) {
        await this.partial(base,current);
        continue;
      }
      this.partials.delete(base);
      if(!current){await this.clean(base);continue;}
      if(invalid)throw new ProtocolFailure(base.startsWith("frame.")||invalid==="TRANSACTION_TIMEOUT"?invalid:"CONTROL_REJECTED");
      if(base.startsWith("frame."))await this.data(pair.value.upload,base);
      else await this.command(pair.value.upload);
      await this.clean(base);
      if(this.snapshot().state==="retired"||this.snapshot().state==="failed")return;
    }
  }
  private filenameMember(base:string):boolean {
    const state=this.control.state;if(state==="failed")return false;
    if(base.startsWith("request."))return base.slice(8)===this.control.offerId||((state==="active"||state==="granted")&&base.slice(8)===this.control.grantId);
    if(base.startsWith("activate."))return (state==="active"||state==="granted")&&base.slice(9)===this.control.captureEpoch;
    const parts=base.split(".");return state==="active"&&parts[1]===this.control.captureEpoch&&Number(parts[2])>this.ackSeq;
  }
  private async partial(base:string,authenticated:boolean):Promise<void> {
    const pending=this.partials.get(base)??{started:this.now(),authenticated:false};pending.authenticated ||= authenticated;
    this.partials.set(base,pending);
    if(this.now()-pending.started>=captureLimits.transactionMs){await this.clean(base);if(pending.authenticated)throw new ProtocolFailure("TRANSACTION_TIMEOUT");}
  }
  private async clean(base:string):Promise<void> {
    this.partials.delete(base);const files=await this.resources.transactionFiles(this.binding);if(!this.live())return;
    if(!files.ok){this.abandoned.add(base);return;}
    const names=files.value.filter(name=>name.startsWith(base+"."));
    if(names.length&&!(await this.resources.retireFiles(this.binding,names)).ok)this.abandoned.add(base);
  }
  private async command(data:Uint8Array):Promise<void> {
    const decoded=decodeCaptureControl(data);if(!decoded.ok)throw new ProtocolFailure("CONTROL_REJECTED");
    const v=decoded.value;if(v.kind!=="epochRequest"&&v.kind!=="epochActivate")throw new ProtocolFailure("CONTROL_REJECTED");
    if(v.nativeSessionId!==this.binding.marker.claudeSessionId){await this.retire("IDENTITY_CHANGED");return;}
    if(v.kind==="epochActivate") {
      if(v.grantId!==this.control.grantId)throw new ProtocolFailure("CONTROL_REJECTED");
      if(this.control.state==="active")return;
      await this.replace({state:"active",offerId:this.nonce(),reasonCode:null,recoveriesRemaining:1});
      this.handshakeUntil=undefined;this.healthAt=this.now();this.eligible=true;return;
    }
    if(v.offerId===this.control.grantId) {
      if(this.request&&Object.keys(v).every(key=>v[key as keyof CaptureEpochRequest]===this.request![key as keyof CaptureEpochRequest]))return;
      throw new ProtocolFailure("CONTROL_REJECTED");
    }
    const state=this.control.state;
    if(!((state==="offered"&&v.reason==="initial"&&v.predecessorEpoch===null)||
      (state==="active"&&v.reason==="native-reset"&&v.predecessorEpoch===this.control.captureEpoch)||
      (state==="retired"&&v.reason==="recover"&&v.predecessorEpoch===this.control.captureEpoch&&this.control.recoveriesRemaining===1)))
      throw new ProtocolFailure("CONTROL_REJECTED");
    const predecessor=this.control.captureEpoch;
    if(state==="active") {this.handshakeUntil=this.now()+captureLimits.handshakeMs;await this.retire("CHANNEL_RETIRED",true);}
    const epoch=this.nonce();await this.ack(epoch,0);
    await this.replace({state:"granted",captureEpoch:epoch,offerId:null,grantId:v.offerId,predecessorEpoch:predecessor,
      reasonCode:null,recoveriesRemaining:state==="retired"?0:1});
    this.partials.clear();this.ackSeq=0;this.request=v;this.eligible=state==="active";this.lastObservationId=0;this.afterGap=false;
  }
  private emit(event:CaptureSourceEvent):void {
    if(!this.live())return;
    try {void Promise.resolve(this.options.onEvent?.(Object.freeze(event))).catch(()=>{});}catch { /* Admission is committed; observers cannot replay it. */ }
  }
  private discardAssembly():void {
    if(this.assembly)this.resources.releaseRetention(this.assembly.ticket);this.assembly=undefined;
  }
  private async chunk(value:ObservationChunk):Promise<{observation:NormalizedObservation;retention:CaptureRetentionTicket}|undefined> {
    let assembly=this.assembly;
    if(!assembly) {
      if(value.chunkIndex!==0||!(this.afterGap?value.observationId>this.lastObservationId:value.observationId===this.lastObservationId+1))
        throw new ProtocolFailure("SCHEMA_REJECTED");
      const epoch=this.control.captureEpoch;
      const ticket=this.resources.reserveRetention(this.binding,value.totalByteLength+captureLimits.sourceBytes+captureLimits.metadataBytes);
      // Eviction is synchronous but may stop this protocol without revoking its owner.
      if(!this.live()||this.control.state!=="active"||this.control.captureEpoch!==epoch||epoch!==value.captureEpoch) {
        if(ticket)this.resources.releaseRetention(ticket);
        throw new ProtocolFailure("CHANNEL_RETIRED");
      }
      if(!ticket)throw new ProtocolFailure("CONTENT_REJECTED");
      assembly={id:value.observationId,count:value.chunkCount,total:value.totalByteLength,index:0,bytes:0,parts:[],ticket,
        started:this.now(),progress:this.now()};this.assembly=assembly;this.lastObservationId=value.observationId;
    }
    if(value.observationId!==assembly.id||value.chunkCount!==assembly.count||value.totalByteLength!==assembly.total||value.chunkIndex!==assembly.index)
      throw new ProtocolFailure("SCHEMA_REJECTED");
    if(assembly.bytes+value.byteLength>assembly.total)throw new ProtocolFailure("CONTENT_REJECTED");
    assembly.parts.push(value.data);assembly.bytes+=value.byteLength;assembly.index++;assembly.progress=this.now();
    if(assembly.index!==assembly.count)return undefined;
    if(assembly.bytes!==assembly.total)throw new ProtocolFailure("CONTENT_REJECTED");
    // At most one bounded complete observation is decoded between event-loop yields.
    await new Promise<void>(resolveYield=>setImmediate(resolveYield));if(!this.live())throw new ProtocolFailure("CHANNEL_RETIRED");
    const decoded=decodeNormalizedObservation(assembly.parts.join(""));
    assembly.parts.length=0;if(!decoded.ok)throw new ProtocolFailure(decoded.reason);
    // Serialized text is released before the retained decoded ticket can fund derived model text.
    if(!this.resources.resizeRetention(assembly.ticket,captureLimits.sourceBytes+captureLimits.metadataBytes))throw new ProtocolFailure("CONTENT_REJECTED");
    return {observation:decoded.value,retention:assembly.ticket};
  }
  private async data(data:Uint8Array,base:string):Promise<void> {
    const decoded=decodeCaptureData(data);if(!decoded.ok)throw new ProtocolFailure(decoded.reason);
    const value=decoded.value;if(value.seq!==Number(base.split(".")[2])||value.seq!==this.ackSeq+1)throw new ProtocolFailure("SCHEMA_REJECTED");
    let complete:{observation:NormalizedObservation;retention:CaptureRetentionTicket}|undefined;
    if(value.kind==="observationChunk")complete=await this.chunk(value);
    const next=value.kind==="gap"?value.coversThrough:value.seq;
    await this.ack(value.captureEpoch,next);this.ackSeq=next;
    if(value.kind==="heartbeat")this.healthAt=this.now();
    if(value.kind==="gap") {
      this.discardAssembly();this.afterGap=true;this.gaps++;
      this.emit({kind:"discontinuity",captureEpoch:value.captureEpoch,ackSeq:next,mode:value.mode,reason:value.reason});
    } else if(complete) {
      this.assembly=undefined;this.afterGap=false;
      this.emit({kind:"observation",captureEpoch:value.captureEpoch,observationId:(value as ObservationChunk).observationId,
        ackSeq:next,...complete});
    }
    if(next===Number.MAX_SAFE_INTEGER||(complete&&this.lastObservationId===Number.MAX_SAFE_INTEGER))await this.retire("CHANNEL_RETIRED");
  }
  private async retire(reason:CaptureReasonCode,renewal=false):Promise<void> {
    this.discardAssembly();this.partials.clear();
    const epoch=this.control.captureEpoch;const boundary=epoch&&this.lastBoundaryEpoch!==epoch;
    this.retiring=reason;
    if(boundary){this.lastBoundaryEpoch=epoch;this.gaps++;this.emit({kind:"discontinuity",captureEpoch:epoch,ackSeq:this.ackSeq,mode:"unknown",reason});}
    const canRecover=reason!=="IDENTITY_CHANGED"&&this.eligible;
    if(epoch)await this.ack(epoch,this.ackSeq,reason);
    const lastRetired=epoch?Object.freeze({captureEpoch:epoch,ackSeq:this.ackSeq,reasonCode:reason}):this.control.lastRetired;
    const visibleAt=await this.replace({state:canRecover?"retired":"failed",offerId:canRecover?this.nonce():null,
      reasonCode:reason,lastRetired,recoveriesRemaining:canRecover?1:0});
    this.retiring=undefined;
    this.eligible=false;if(!renewal)this.handshakeUntil=canRecover?visibleAt+captureLimits.handshakeMs:undefined;
    const files=await this.resources.transactionFiles(this.binding);
    if(this.live()&&files.ok) {
      const obsolete=files.value.filter(name=>!this.filenameMember(name.replace(/\.(upload|ready|committed)$/, "")));
      if(obsolete.length)await this.resources.retireFiles(this.binding,obsolete);
    }
  }
  /** Credential-free status for the eventual runtime/model consumer. */
  snapshot() {return Object.freeze({state:this.retiring?(this.eligible&&this.retiring!=="IDENTITY_CHANGED"?"retired" as const:"failed" as const):this.control.state,captureEpoch:this.control.captureEpoch,ackSeq:this.ackSeq,
    reasonCode:this.retiring??this.control.reasonCode,controlRevision:this.control.controlRevision,gaps:this.gaps,stopped:this.stopped});}
  /** Stop protocol scheduling independently of native process lifetime. */
  stop():void {
    if(this.stopped)return;
    const epoch=this.control.captureEpoch;const boundary=epoch&&this.lastBoundaryEpoch!==epoch;
    this.stopped=true;this.retiring=undefined;this.cancelTimer?.();this.cancelTimer=undefined;this.partials.clear();this.abandoned.clear();this.discardAssembly();
    this.control=Object.freeze({...this.control,state:"failed",offerId:null,reasonCode:"CHANNEL_RETIRED"});
    if(boundary){this.lastBoundaryEpoch=epoch;this.gaps++;try{void Promise.resolve(this.options.onEvent?.(Object.freeze({kind:"discontinuity",captureEpoch:epoch,
      ackSeq:this.ackSeq,mode:"unknown",reason:"CHANNEL_RETIRED"}))).catch(()=>{});}catch{ /* Shutdown cannot throw into native delivery. */ }}
  }
  private arm(delay:number):void {
    this.cancelTimer?.();this.cancelTimer=undefined;
    if(this.options.autoPoll===false||!this.live()||this.control.state==="failed")return;
    const callback=()=>{this.cancelTimer=undefined;void this.poll();};
    if(this.options.schedule)this.cancelTimer=this.options.schedule(callback,delay);
    else {const timer=setTimeout(callback,delay);timer.unref();this.cancelTimer=()=>clearTimeout(timer);}
  }
  /** Publish initial offer before starting its visibility deadline. */
  async initialize():Promise<CaptureResourceResult> {
    let visibleAt=this.now();
    const result=await this.resources.writeMetadata(this.binding,"control.json",Buffer.from(JSON.stringify(this.control)),()=>this.live(),()=>{visibleAt=this.now();});
    if(result.ok&&this.live()){this.handshakeUntil=visibleAt+captureLimits.handshakeMs;this.arm(captureLimits.idlePollMs);}
    else this.stop();return result;
  }
}

export interface CaptureRetentionTicket {readonly reservedBytes:number}
export type CaptureSourceEvent =
  {readonly kind:"observation";readonly captureEpoch:string;readonly observationId:number;readonly ackSeq:number;
    readonly observation:NormalizedObservation;readonly retention:CaptureRetentionTicket} |
  {readonly kind:"discontinuity";readonly captureEpoch:string;readonly ackSeq:number;readonly mode:"known"|"unknown";
    readonly reason:string};

interface CaptureAssembly {
  readonly id:number;readonly count:number;readonly total:number;readonly ticket:CaptureRetentionTicket;
  readonly started:number;progress:number;index:number;bytes:number;parts:string[];
}
