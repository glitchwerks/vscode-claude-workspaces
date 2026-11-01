import path from "node:path";
import { lstat } from "node:fs/promises";
import { Minimatch } from "minimatch";

const matchers=new Map<string,Minimatch>();
function matcher(pattern:string):Minimatch {
  const cached=matchers.get(pattern);if(cached)return cached;
  const result=new Minimatch(pattern,{dot:true,nocase:process.platform==="win32",nonegate:true,nocomment:true,noext:true,braceExpandMax:256});
  matchers.set(pattern,result);if(matchers.size>128)matchers.delete(matchers.keys().next().value!);return result;
}
async function siblingExists(file:string):Promise<boolean> {
  try{await lstat(file);return true;}catch(error){
    if(typeof error==="object" && error!==null && "code" in error && ["ENOENT","ENOTDIR"].includes(String(error.code)))return false;
    throw error;
  }
}
/** Root-relative files.exclude rules, including excluded ancestors and sibling clauses. */
export async function isComposerFileExcluded(file:string,root:string,patterns:Readonly<Record<string,unknown>>,exists:(file:string)=>Promise<boolean>=siblingExists):Promise<boolean> {
  const relative=path.relative(root,file).replace(/\\/gu,"/");
  if(relative===".." || relative.startsWith("../") || path.isAbsolute(relative))return true;
  const segments=relative.split("/");
  const prefixes=segments.map((_,index)=>segments.slice(0,index+1).join("/"));
  for(const [pattern,rule] of Object.entries(patterns)){
    if(rule===false || rule===undefined)continue;
    if(pattern.length>4096)throw new Error("Exclusion pattern unavailable.");
    const glob=matcher(pattern);const matched=prefixes.filter(prefix=>glob.match(prefix));if(!matched.length)continue;
    if(rule===true)return true;
    if(typeof rule==="object" && rule!==null && "when" in rule && typeof rule.when==="string"){
      for(const prefix of matched){
        const candidate=path.join(root,...prefix.split("/"));
        const sibling=rule.when.replaceAll("$(basename)",path.basename(candidate,path.extname(candidate)));
        if(!sibling || /[\\/]/u.test(sibling) || sibling==="." || sibling==="..")throw new Error("Exclusion condition unavailable.");
        if(await exists(path.join(path.dirname(candidate),sibling)))return true;
      }
    }
  }
  return false;
}
