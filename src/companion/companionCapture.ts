import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, realpath, opendir, mkdir, open, rename, unlink, rmdir } from "node:fs/promises";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import type { Stats } from "node:fs";
import { captureEnvironmentKeys, captureLimits, decodeOwnershipMarker } from "./companionTypes";
import type { CaptureBinding, ManagedCaptureIdentity, OwnershipMarker } from "./companionTypes";

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
  writeExclusive(path:string,data:Uint8Array):Promise<void>;
  rename(from:string,to:string):Promise<void>;
  unlink(path:string):Promise<void>;
  rmdir(path:string):Promise<void>;
}
export type CaptureResourceDiagnostic = "capture-unavailable"|"cleanup"|"cleanup-capacity";
export type CaptureResourceResult<T=void> = {readonly ok:true;readonly value:T} |
  {readonly ok:false;readonly reason:CaptureResourceDiagnostic};
export interface CaptureHostOptions {
  readonly storageRoot:string;
  readonly currentTarget:()=>Readonly<ManagedCaptureIdentity>|undefined;
  readonly fs?:CaptureFileSystem;
  readonly randomBytes?:(size:number)=>Buffer;
  readonly processId?:number;
  readonly probeProcess?:(pid:number)=>void;
  readonly yieldControl?:()=>Promise<void>;
  readonly deadlineMs?:number;
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
    try {await handle.writeFile(data);} finally {await handle.close();}
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
  private readonly reservations=new Map<CaptureReservation,ReservationState>();
  private rootIdentity:string|undefined;
  private busy=false;
  private idle:Promise<void>=Promise.resolve();
  private uncertain=false;
  constructor(private readonly options:CaptureHostOptions) {
    this.fs=options.fs??nodeCaptureFileSystem;this.entropy=options.randomBytes??randomBytes;
    this.root=resolve(options.storageRoot);this.hostId=this.entropy(16).toString("hex");
  }
  /** One finite operation owns the accounting lock; contenders fail visibly without queuing. */
  private deadline():number {return Date.now()+Math.min(captureLimits.transactionMs,Math.max(1,this.options.deadlineMs??captureLimits.transactionMs));}
  private async run<T>(reason:CaptureResourceDiagnostic,body:(work:Work)=>Promise<T>,until=this.deadline()):Promise<CaptureResourceResult<T>> {
    if(this.busy)return this.failure(reason);
    this.busy=true;
    let release!:()=>void;this.idle=new Promise<void>(resolveIdle=>{release=resolveIdle;});
    const work:Work={until,expired:false};
    try {return {ok:true,value:await body(work)};}
    catch(error) {return this.failure(error instanceof ResourceFailure?error.reason:reason);}
    finally {this.busy=false;release();}
  }
  private failure(reason:CaptureResourceDiagnostic):{ok:false;reason:CaptureResourceDiagnostic} {
    try {this.options.diagnostic?.(reason);} catch { /* Diagnostics cannot affect native continuation. */ }
    return {ok:false,reason};
  }
  /** A deadline ends our wait, never the underlying OS operation. Late mutations poison capacity. */
  private async io<T>(work:Work,operation:()=>Promise<T>,mutation=false):Promise<T> {
    if(mutation&&this.uncertain)throw new ResourceFailure("cleanup-capacity");
    const remaining=work.until-Date.now();if(work.expired||remaining<=0)throw new ResourceFailure("cleanup");
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      return await Promise.race([operation(),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>{work.expired=true;if(mutation)this.uncertain=true;reject(new ResourceFailure("cleanup"));},remaining);
      })]);
    } finally {if(timer)clearTimeout(timer);}
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
    if(owner.removed||(active&&(owner.revoked||!sameTarget(owner.binding.marker,this.options.currentTarget()))))throw new ResourceFailure("capture-unavailable");
    await this.directorySafe(work,owner.binding.directory,owner.directoryInfo);
    const actual=await this.marker(work,owner.binding.directory,owner.markerInfo);
    if(!sameMarker(owner.binding.marker,actual.marker))throw new ResourceFailure("capture-unavailable");
    if(active&&(owner.revoked||!sameTarget(owner.binding.marker,this.options.currentTarget())))throw new ResourceFailure("capture-unavailable");
  }
  /** Create a fresh channel; a failed late operation leaves only retained, non-adoptable files. */
  async prepare():Promise<CaptureResourceResult<CaptureBinding>> {
    return this.run("capture-unavailable",async work=>{
      const current=this.options.currentTarget();if(!current)throw new ResourceFailure("capture-unavailable");
      const target=Object.freeze({sessionId:current.sessionId,claudeSessionId:current.claudeSessionId,generation:current.generation});
      await this.rootSafe(work);
      await this.capacity(work,captureLimits.ownershipBytes,1);
      for(let attempt=0;attempt<8;attempt++) {
        const channelId=this.entropy(16).toString("hex");const directory=resolve(this.root,"companion-"+channelId);
        const marker=Object.freeze({v:1,kind:"claude-workspaces-companion",hostId:this.hostId,processId:this.options.processId??process.pid,channelId,...target} as const);
        const data=Buffer.from(JSON.stringify(marker));
        if(!decodeOwnershipMarker(data,basename(directory)).ok)throw new ResourceFailure("capture-unavailable");
        try {await this.io(work,()=>this.fs.mkdir(directory),true);} catch(error) {if(code(error)==="EEXIST")continue;throw error;}
        const directoryInfo=await this.directorySafe(work,directory);
        let owner:Owner|undefined;
        try {
          await this.io(work,()=>this.fs.writeExclusive(resolve(directory,"ownership.json"),data),true);
          const actual=await this.marker(work,directory);
          if(!sameMarker(marker,actual.marker))throw new ResourceFailure("capture-unavailable");
          const binding=Object.freeze({directory,marker,token:this.entropy(32).toString("base64url")}) as CaptureBinding;
          owner={binding,directoryInfo,markerInfo:actual.info,abort:new AbortController(),exposed:false,revoked:false,exit:false,removed:false};
          this.owners.set(binding,owner);
          if(!sameTarget(target,this.options.currentTarget()))throw new ResourceFailure("capture-unavailable");
          return binding;
        } catch(error) {
          if(!work.expired) {
            if(owner) {owner.revoked=true;owner.abort.abort();await this.cleanup(work,owner);}
            else {
              // Exclusive creation identity alone permits only an empty unpublished rollback.
              await this.directorySafe(work,directory,directoryInfo);
              const children=await this.io(work,()=>this.fs.list(directory,1));
              if(!children.truncated&&!children.names.length)await this.io(work,()=>this.fs.rmdir(directory),true);
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
    if(!owner||owner.removed||owner.revoked||owner.exposed||!sameTarget(binding.marker,this.options.currentTarget()))return false;
    owner.exposed=true;return true;
  }
  /** Content pollers and transaction callbacks subscribe to this owner-scoped cancellation. */
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
    try {if(this.busy)await this.io({until,expired:false},()=>this.idle);}
    catch {return this.failure("cleanup");}
    return this.run("cleanup",async work=>{await this.cleanup(work,owner);},until);
  }
  private async children(work:Work,directory:string):Promise<Map<string,CaptureFileInfo>> {
    const list=await this.io(work,()=>this.fs.list(directory,captureLimits.cleanupEntries));
    if(list.truncated)throw new ResourceFailure("cleanup-capacity");
    const children=new Map<string,CaptureFileInfo>();
    for(const name of list.names)children.set(name,await this.checkedFile(work,directory,name));
    return children;
  }
  private async remove(work:Work,directory:string,directoryInfo:CaptureFileInfo,expected:OwnershipMarker,markerInfo:CaptureFileInfo):Promise<void> {
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
      await this.io(work,()=>this.fs.unlink(resolve(directory,name)),true);
      children.delete(name);
    }
    await this.directorySafe(work,directory,directoryInfo);
    await this.io(work,()=>this.fs.rmdir(directory),true);
  }
  private async cleanup(work:Work,owner:Owner):Promise<void> {
    if(!owner.revoked||!owner.abort.signal.aborted||(owner.exposed&&!owner.exit))throw new ResourceFailure("cleanup");
    await this.checkOwner(work,owner,false);
    await this.remove(work,owner.binding.directory,owner.directoryInfo,owner.binding.marker,owner.markerInfo);
    owner.removed=true;
    for(const [value,state] of this.reservations)if(state.owner===owner)this.reservations.delete(value);
    this.owners.delete(owner.binding);
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
  private async capacity(work:Work,extraBytes:number,extraFiles:number,stagingOwner?:Owner):Promise<void> {
    if(this.uncertain)throw new ResourceFailure("cleanup-capacity");
    const root=await this.io(work,()=>this.fs.list(this.root,captureLimits.cleanupEntries));
    if(root.truncated)throw new ResourceFailure("cleanup-capacity");
    let bytes=extraBytes;let files=extraFiles;
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
  /** Failure closes content admission, without turning a mismatch into deletion authority. */
  private async active<T>(binding:CaptureBinding,body:(work:Work,owner:Owner)=>Promise<T>):Promise<CaptureResourceResult<T>> {
    return this.run("capture-unavailable",async work=>{
      const owner=this.held(binding);
      try {await this.checkOwner(work,owner,true);return await body(work,owner);}
      catch(error) {owner.revoked=true;owner.abort.abort();throw error;}
    });
  }
  /** Reserve staged transport conservatively in addition to all bytes/files currently on disk. */
  async reserve(binding:CaptureBinding,bytes:number,files:number):Promise<CaptureResourceResult<CaptureReservation>> {
    // Capacity refusal must leave existing reservations releasable and the owner usable.
    return this.run("cleanup-capacity",async work=>{
      const owner=this.held(binding);
      try {await this.checkOwner(work,owner,true);} catch(error) {owner.revoked=true;owner.abort.abort();throw error;}
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
      await this.io(work,()=>this.fs.rename(from,to),true);
      await this.checkOwner(work,owner,true);
    });
  }
  /** Only an initial confirmed ENOENT is not-ready; owner, lock and deadline failures still revoke. */
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
  /** Fixed metadata replacement charges both the old file and temporary new file until rename. */
  async writeMetadata(binding:CaptureBinding,name:"control.json"|"ack.json",data:Uint8Array):Promise<CaptureResourceResult> {
    return this.active(binding,async(work,owner)=>{
      if((name!=="control.json"&&name!=="ack.json")||data.byteLength>captureLimits.controlBytes)throw new ResourceFailure("capture-unavailable");
      const temp=name+".tmp";const tempPath=resolve(binding.directory,temp);const path=resolve(binding.directory,name);
      let previous:CaptureFileInfo|undefined;
      try {previous=await this.checkedFile(work,binding.directory,name);} catch(error) {if(code(error)!=="ENOENT")throw error;}
      await this.capacity(work,data.byteLength,1);
      await this.checkOwner(work,owner,true);
      await this.io(work,()=>this.fs.writeExclusive(tempPath,Buffer.from(data)),true);
      const created=await this.checkedFile(work,binding.directory,temp);
      await this.checkOwner(work,owner,true);
      if(previous)await this.checkedFile(work,binding.directory,name,previous);
      else {
        try {await this.io(work,()=>this.fs.stat(path));throw new ResourceFailure("capture-unavailable");}
        catch(error) {if(code(error)!=="ENOENT")throw error;}
      }
      await this.checkedFile(work,binding.directory,temp,created);
      await this.io(work,()=>this.fs.rename(tempPath,path),true);
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
        await this.io(work,()=>this.fs.unlink(resolve(binding.directory,name)),true);
      }
    });
  }
  /** Overlay only literal capture fields; never carry an inherited or revoked binding. */
  environment(inherited:Readonly<Record<string,string|undefined>>,binding?:CaptureBinding):Record<string,string|undefined> {
    const environment={...inherited};for(const key of captureEnvironmentKeys)delete environment[key];
    const owner=binding&&this.owners.get(binding);
    if(owner&&!owner.revoked&&!owner.removed&&sameTarget(owner.binding.marker,this.options.currentTarget())) {
      const {directory,token,marker}=owner.binding;
      const values=[directory,token,marker.sessionId,marker.claudeSessionId,marker.generation];
      captureEnvironmentKeys.forEach((key,index)=>{environment[key]=values[index];});
    }
    return environment;
  }
}
