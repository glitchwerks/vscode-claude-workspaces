import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { validComposerTarget } from "../panel/composerProtocol";
import { FILE_RESULT_LIMIT, type ComposerTarget } from "./composerTypes";
import { validReferencePaths, type ComposerFileValidation } from "./composerReferences";

export interface ComposerFileScope {readonly cwd:string;readonly roots:readonly string[];}
export interface ComposerFileItem {readonly label:string;readonly description:string;readonly path:string;}
export interface ComposerFilesOptions {
  readonly isCurrent:(target:ComposerTarget)=>boolean;
  readonly resolveScope:(target:ComposerTarget)=>ComposerFileScope|undefined;
  /** Host search uses RelativePattern and workspace files.exclude; never enumerate globally. */
  readonly findFiles:(root:string,limit:number)=>Promise<readonly string[]>;
  readonly pick:(items:readonly ComposerFileItem[])=>Promise<string|undefined>;
  readonly isExcluded?:(file:string,root:string)=>boolean|Promise<boolean>;
  readonly realpath?:(file:string)=>Promise<string>;
  readonly isFile?:(file:string)=>Promise<boolean>;
}
function inside(root:string,file:string):boolean {
  const relative=path.relative(root,file);
  return relative==="" || (!path.isAbsolute(relative) && relative!==".." && !relative.startsWith(`..${path.sep}`));
}
/** Uses the native quoted @path syntax without shell evaluation or file uploads. */
export function formatComposerFileReference(file:string,cwd:string,platform:NodeJS.Platform=process.platform):string|undefined {
  const paths=platform==="win32"?path.win32:path.posix;
  const relative=paths.relative(cwd,file).replace(/\\/g,"/");
  if(!relative || relative.length>4092 || [...relative].some(c=>c==='"' || c.charCodeAt(0)<32 || c.charCodeAt(0)===127))return undefined;
  return `@"${relative}"`;
}

/** Bounds search/results and validates canonical root membership again after user selection. */
export class ComposerFiles {
  constructor(private readonly options:ComposerFilesOptions) {}
  /** Checks only explicit references and never enumerates or reads file contents. */
  async validate(target:ComposerTarget,values:readonly string[],stillCurrent:()=>boolean=()=>true):Promise<readonly ComposerFileValidation[]|undefined> {
    const current=()=>this.options.isCurrent(target) && stillCurrent();
    if(!validComposerTarget(target) || !validReferencePaths(values) || !current())return undefined;
    const scope=this.options.resolveScope(target);if(!scope || !path.isAbsolute(scope.cwd))return undefined;
    const canonical=this.options.realpath ?? realpath;
    const fileCheck=this.options.isFile ?? (async(file:string)=>(await stat(file)).isFile());
    const roots:{original:string;resolved:string}[]=[];
    for(const root of scope.roots){
      if(!path.isAbsolute(root))continue;
      try{roots.push({original:root,resolved:await canonical(root)});}catch{/* An inaccessible root provides no validation authority. */}
      if(!current())return undefined;
    }
    const result:ComposerFileValidation[]=[];
    for(const value of new Set(values)){
      if(!current())return undefined;
      const file=path.resolve(scope.cwd,value);
      const candidates:typeof roots=[];
      for(const root of roots){
        if(!inside(root.original,file))continue;
        try{if(!await this.options.isExcluded?.(file,root.original))candidates.push(root);}catch{/* Unavailable exclusion rules provide no validation authority. */}
        if(!current())return undefined;
      }
      let status:ComposerFileValidation["status"]="unavailable";
      if(candidates.length){
        try{
          const resolved=await canonical(file);
          if(!current())return undefined;
          if(candidates.some(root=>inside(root.resolved,resolved)))status=await fileCheck(file)?"valid":"missing";
        }catch(error){
          if(typeof error==="object" && error!==null && "code" in error && (error.code==="ENOENT" || error.code==="ENOTDIR")){
            // A missing leaf beyond an escaping symlink is not inside the permitted root.
            let ancestor=path.dirname(file);
            for(let depth=0;depth<32 && candidates.some(root=>inside(root.original,ancestor));depth++){
              if(!current())return undefined;
              try{const resolved=await canonical(ancestor);if(candidates.some(root=>inside(root.resolved,resolved)))status="missing";break;}
              catch(parentError){
                if(typeof parentError!=="object" || parentError===null || !("code" in parentError) || !["ENOENT","ENOTDIR"].includes(String(parentError.code)))break;
              }
              const parent=path.dirname(ancestor);if(parent===ancestor)break;ancestor=parent;
            }
          }
        }
      }
      if(!current())return undefined;
      result.push({value,status});
    }
    return result;
  }
  async pick(target:ComposerTarget):Promise<string|undefined> {
    if(!validComposerTarget(target) || !this.options.isCurrent(target))return undefined;
    const scope=this.options.resolveScope(target);if(scope===undefined)return undefined;
    const canonical=this.options.realpath ?? realpath;
    const fileCheck=this.options.isFile ?? (async(file:string)=>(await stat(file)).isFile());
    try {
      const roots: {original:string;resolved:string}[]=[];
      for(const root of scope.roots){if(!path.isAbsolute(root))return undefined;roots.push({original:root,resolved:await canonical(root)});}
      if(roots.length===0 || !path.isAbsolute(scope.cwd) || !this.options.isCurrent(target))return undefined;
      const cwd=await canonical(scope.cwd);if(!roots.some(root=>inside(root.resolved,cwd)))return undefined;
      const items:ComposerFileItem[]=[];const seen=new Set<string>();
      for(const root of roots){
        const remaining=FILE_RESULT_LIMIT-items.length;if(remaining===0)break;
        const candidates=(await this.options.findFiles(root.original,remaining)).slice(0,remaining);
        if(!this.options.isCurrent(target))return undefined;
        for(const file of candidates){
          if(!path.isAbsolute(file) || !inside(root.original,file) || await this.options.isExcluded?.(file,root.original))continue;
          try {
            const resolved=await canonical(file);
            if(!inside(root.resolved,resolved) || seen.has(resolved) || !await fileCheck(file))continue;
            seen.add(resolved);items.push(Object.freeze({label:path.basename(file),description:path.relative(root.original,file),path:file}));
          } catch { /* A vanished or unreadable candidate is not eligible. */ }
        }
      }
      if(items.length===0 || !this.options.isCurrent(target))return undefined;
      const selected=await this.options.pick(Object.freeze(items));
      if(selected===undefined || !items.some(item=>item.path===selected) || !this.options.isCurrent(target))return undefined;
      const finalPath=await canonical(selected);
      let permitted=false;
      for(const root of roots)if(inside(root.original,selected) && inside(root.resolved,finalPath) && !await this.options.isExcluded?.(selected,root.original))permitted=true;
      if(!permitted || !await fileCheck(selected) || !this.options.isCurrent(target))return undefined;
      return formatComposerFileReference(selected,scope.cwd);
    } catch {return undefined;}
  }
}
