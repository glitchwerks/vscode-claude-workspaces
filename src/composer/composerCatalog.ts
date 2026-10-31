import type * as vscode from "vscode";
import { validComposerCommand, validComposerDraft, validComposerInvocation, validComposerTarget } from "../panel/composerProtocol";
import { CATALOG_TIMEOUT_MS, type ComposerCommand, type ComposerTarget } from "./composerTypes";

export interface ComposerCatalogOptions {
  readonly isCurrent:(target:ComposerTarget)=>boolean;
  readonly listCommands:(target:ComposerTarget)=>Promise<readonly ComposerCommand[]>;
  readonly schedule?:(callback:()=>void,delayMs:number)=>vscode.Disposable;
}
/** Caches only authenticated effective invocations, never guesses a skill discriminator. */
export class ComposerCatalog {
  private readonly cache=new Map<string,readonly ComposerCommand[]>();
  private readonly epochs=new Map<string,symbol>();
  constructor(private readonly options:ComposerCatalogOptions) {}
  async list(target:ComposerTarget,refresh=false):Promise<readonly ComposerCommand[]> {
    if(!validComposerTarget(target) || !this.options.isCurrent(target))throw new Error("Composer catalog unavailable.");
    const key=JSON.stringify(target);
    const cached=this.cache.get(key);if(!refresh && cached!==undefined)return cached;
    const epoch=Symbol();this.epochs.set(key,epoch);
    let timer:vscode.Disposable|undefined;
    const deadline=new Promise<never>((_,reject)=>{
      const expire=()=>reject(new Error("Composer catalog unavailable."));
      if(this.options.schedule)timer=this.options.schedule(expire,CATALOG_TIMEOUT_MS);
      else {const handle=setTimeout(expire,CATALOG_TIMEOUT_MS);timer={dispose:()=>clearTimeout(handle)};}
    });
    try {
      const items=await Promise.race([this.options.listCommands(target),deadline]);
      if(!this.options.isCurrent(target))throw new Error("Composer catalog unavailable.");
      if(!Array.isArray(items) || items.length>1000 || !items.every(validComposerCommand))throw new Error("Invalid composer catalog.");
      const result=Object.freeze(items.map(item=>Object.freeze({...item})));
      if(this.epochs.get(key)===epoch){
        this.cache.delete(key);this.cache.set(key,result);
        while(this.cache.size>32){const oldest=this.cache.keys().next().value;if(oldest!==undefined){this.cache.delete(oldest);this.epochs.delete(oldest);}}
      }
      return result;
    } finally {timer?.dispose();if(this.epochs.get(key)===epoch)this.epochs.delete(key);}
  }
  invalidate(target:ComposerTarget):void {const key=JSON.stringify(target);this.cache.delete(key);this.epochs.delete(key);}
}

/** Native skill syntax must be first; choosing an invocation never executes it. */
export function insertInvocation(text:string,selection:{readonly anchor:number;readonly head:number},invocation:string):{
  text:string;selection:{anchor:number;head:number}
} {
  if(!validComposerInvocation(invocation) || !validComposerDraft({text,selection,revision:0}))throw new TypeError("Invalid composer invocation or selection.");
  const first=text.match(/^\s*\/\S*/u);
  const body=first===null?text:text.slice(first[0].length).replace(/^\s+/u,"");
  const prefix=`${invocation} `;
  return {text:prefix+body,selection:{anchor:prefix.length,head:prefix.length}};
}
