import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { validComposerTarget } from "../panel/composerProtocol";
import { FILE_RESULT_LIMIT, type ComposerTarget } from "./composerTypes";

export interface ComposerFileScope {readonly cwd:string;readonly roots:readonly string[];}
export interface ComposerFileItem {readonly label:string;readonly description:string;readonly path:string;}
export interface ComposerFilesOptions {
  readonly isCurrent:(target:ComposerTarget)=>boolean;
  readonly resolveScope:(target:ComposerTarget)=>ComposerFileScope|undefined;
  /** Host search uses RelativePattern and workspace files.exclude; never enumerate globally. */
  readonly findFiles:(root:string,limit:number)=>Promise<readonly string[]>;
  readonly pick:(items:readonly ComposerFileItem[])=>Promise<string|undefined>;
  readonly isExcluded?:(file:string,root:string)=>boolean;
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
          if(!path.isAbsolute(file) || !inside(root.original,file) || this.options.isExcluded?.(file,root.original))continue;
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
      if(!roots.some(root=>inside(root.original,selected) && inside(root.resolved,finalPath) && !this.options.isExcluded?.(selected,root.original)) || !await fileCheck(selected) || !this.options.isCurrent(target))return undefined;
      return formatComposerFileReference(selected,scope.cwd);
    } catch {return undefined;}
  }
}
