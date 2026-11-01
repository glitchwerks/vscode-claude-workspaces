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
  const leading=/^\s*(\/[^\s`]*)(?=\s|$)/u.exec(text);
  if(leading && leading[1]!.length<=256){const value=leading[1]!;const from=leading[0].length-value.length;
    result.push({from,to:from+value.length,kind:"command",value,complete:value.length>1 && from+value.length<text.length});}
  let offset=0;let inlineUntil=0;let fence:{character:string;length:number}|undefined;
  for(const line of text.split(/(?<=\n)/u)){
    const marker=/^ {0,3}(`{3,}|~{3,})(.*)/u.exec(line);
    if(fence){if(marker && marker[1]![0]===fence.character && marker[1]!.length>=fence.length && !marker[2]!.trim())fence=undefined;offset+=line.length;continue;}
    if(marker && inlineUntil<=offset){fence={character:marker[1]![0]!,length:marker[1]!.length};offset+=line.length;continue;}
    for(let i=0;i<line.length && result.length<COMPOSER_REFERENCE_LIMIT;i++){
      if(offset+i<inlineUntil){i=Math.min(line.length,inlineUntil-offset)-1;continue;}
      if(line[i]==="`"){
        let end=i+1;while(line[end]==="`")end++;
        const ticks=line.slice(i,end);let close=text.indexOf(ticks,offset+end);
        while(close>=0 && (text[close-1]==="`" || text[close+ticks.length]==="`"))close=text.indexOf(ticks,close+ticks.length);
        inlineUntil=close<0?offset+line.length:close+ticks.length;i=Math.min(line.length,inlineUntil-offset)-1;continue;
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
