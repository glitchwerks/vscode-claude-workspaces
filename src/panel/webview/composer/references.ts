/** Browser-safe tokenization shared by coloring, validation and completion. */
export interface ComposerReference {
  readonly from:number;
  readonly to:number;
  readonly kind:"command"|"file";
  readonly value:string;
  readonly complete:boolean;
}
import { COMPOSER_REFERENCE_LIMIT } from "../../../composer/composerReferences";
export function parseComposerReferences(text:string):readonly ComposerReference[] {
  if(text.length>1_048_576)return [];
  const result:ComposerReference[]=[];
  // Index complete delimiter runs once; unmatched lengths must not rescan the suffix.
  const runs=new Map<number,number[]>();const nextRun=new Map<number,number>();
  for(const match of text.matchAll(/`+/gu)){const length=match[0].length;const positions=runs.get(length);if(positions)positions.push(match.index);else runs.set(length,[match.index]);}
  // Skip URL bodies and Markdown destinations without rescanning prefixes per token.
  const exclusions=text.matchAll(/(?::\/\/|\]\(\s*<?)[^\s<>\x60]*/giu);
  let excluded=exclusions.next();
  let offset=0;let inlineUntil=0;let fence:{character:string;length:number}|undefined;
  for(const line of text.split(/(?<=\n)/u)){
    const marker=/^ {0,3}(`{3,}|~{3,})(.*)/u.exec(line);
    if(fence){if(marker && marker[1]![0]===fence.character && marker[1]!.length>=fence.length && !marker[2]!.trim())fence=undefined;offset+=line.length;continue;}
    if(marker && inlineUntil<=offset){fence={character:marker[1]![0]!,length:marker[1]!.length};offset+=line.length;continue;}
    for(let i=0;i<line.length && result.length<COMPOSER_REFERENCE_LIMIT;i++){
      if(offset+i<inlineUntil){i=Math.min(line.length,inlineUntil-offset)-1;continue;}
      if(line[i]==="`"){
        let end=i+1;while(line[end]==="`")end++;
        const length=end-i;const positions=runs.get(length)!;let next=nextRun.get(length)??0;
        while(next<positions.length && positions[next]!<=offset+i)next++;
        nextRun.set(length,next);const close=positions[next]??-1;
        inlineUntil=close<0?offset+line.length:close+length;i=Math.min(line.length,inlineUntil-offset)-1;continue;
      }
      while(!excluded.done && excluded.value.index+excluded.value[0].length<=offset+i)excluded=exclusions.next();
      if(!excluded.done && excluded.value.index<=offset+i){i=Math.min(line.length,excluded.value.index+excluded.value[0].length-offset)-1;continue;}
      if(line[i]==="/" && (i===0 || /[\s([{]/u.test(line[i-1]!))){
        let end=i+1;
        while(end<line.length && !/[\s\x60<>"()[\]{} ,;!?]/u.test(line[end]!))end++;
        const value=line.slice(i,end);
        if(value.length<=256 && !value.slice(1).includes("/") && !value.includes("\\") && ![...value].some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127)){
          result.push({from:offset+i,to:offset+end,kind:"command",value,complete:value.length>1 && offset+end<text.length});
        }
        i=Math.max(i,end-1);continue;
      }
      if(line[i]!=="@" || (i>0 && !/[\s([{]/u.test(line[i-1]!)))continue;
      const quoted=line[i+1]==='"';const start=i+(quoted?2:1);let end=start;
      while(end<line.length && (quoted?!/["\r\n]/u.test(line[end]!):!/[\s`<>"()[\]{}]/u.test(line[end]!)))end++;
      const closed=quoted && line[end]==='"';const to=end+(closed?1:0);const value=line.slice(start,end);
      if(value.length>0 && value.length<=4092 && ![...value].some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127))result.push({from:offset+i,to:offset+to,kind:"file",value,complete:quoted?closed:end<line.length});
      i=Math.max(i,to-1);
    }
    if(result.length>=COMPOSER_REFERENCE_LIMIT)break;
    offset+=line.length;
  }
  return result;
}
