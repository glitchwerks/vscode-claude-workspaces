import type MarkdownItConstructor from "markdown-it" with {"resolution-mode":"import"};
import { captureLimits } from "./companionTypes";
import type { CompanionContentNode, CompanionExtractedContent, CompanionLiteralCandidate } from "./companionTypes";
// Match the existing CJS bridge: markdown-it's CJS declaration imports ESM types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MarkdownIt=require("markdown-it") as typeof MarkdownItConstructor;
const markdown=new MarkdownIt({html:false,linkify:false,typographer:false,maxNesting:33});
const fieldLimits=Object.freeze({shortTextBytes:256,hrefBytes:2048,depth:32,pathBytes:32768});
const shellLanguages=new Set(["sh","bash","zsh","shell","powershell","pwsh","ps1","cmd","bat"]);
const scalar=(text:string):boolean=>!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(text);
const explicit=/^(?:[A-Za-z]:[\\/]|[\\/]{2}|\/(?!\/)|\.{1,2}[\\/]|~[\\/])/;
const uri=/^(?:[A-Za-z][A-Za-z\d+.-]*:\/\/|mailto:|www\.)/i;
const ambiguous=(value:string):boolean=>/[.,;:!?)\]}>"']$|[[\](){}<>"']|:\d+(?::\d+)?$|\$|%[^%]+%|^\\\\[?.]\\|\\["']|\\[!#*+\-._`]/.test(value);
const uncertainLiteral=(value:string):boolean=>/\$|%[^%]+%|^\\\\[?.]\\|\\["'!#*+\-._`]|&(?:#\d+|#x[\da-f]+|[a-z]+);/i.test(value);
const pathForm=(value:string):boolean=>!uri.test(value)&&(/^(?:[A-Za-z]:[\\/]|\/(?!\/)|\/\/[^/\s"']+\/[^/\s"']|\\\\[^\\\s"']+\\[^\\\s"']|\.{1,2}[\\/]|~[\\/])/.test(value)||/^[^\s/\\]+[/\\][^/\\]+/.test(value));
const quotedPath=(value:string):boolean=>!uri.test(value)&&(pathForm(value)||/^[^\s/\\]+\.[^\d\s.][^\s]*$/.test(value));
const cue=(prefix:string):boolean=>/(?:^|\r?\n)[ \t]*(?:Run:|Run this command:|Execute:)[ \t]*$/.test(prefix);
/** Lower budgets let the retained model spend only its remaining session capacity. */
export interface CompanionContentOptions {readonly sourceKind?:"assistant"|"tool";readonly maxNodes?:number;readonly maxTargets?:number;readonly maxDepth?:number}
/** Freeze bounded output recursively; callers cannot alter a retained literal after validation. */
function freeze<T>(value:T):T {
  if(value!==null&&typeof value==="object"){for(const child of Object.values(value))freeze(child);Object.freeze(value);}return value;
}
/** Only host-controlled HTTP(S) link handling may consume these URLs. */
function allowedLink(href:string):string|null {
  if(!scalar(href)||href.includes("\0")||Buffer.byteLength(href,"utf8")>fieldLimits.hrefBytes)return null;
  try{const url=new URL(href);return ["https:","http:"].includes(url.protocol)&&!url.username&&!url.password?href:null;}catch{return null;}
}
/** Extract complete bounded source and literal actions, without native or retention authority. */
export function extractCompanionContent(sourceText:string,options:CompanionContentOptions={}):CompanionExtractedContent {
  const sourceBytes=Buffer.byteLength(sourceText,"utf8");
  const sourceLimit=options.sourceKind==="tool"?captureLimits.outputBytes:captureLimits.sourceBytes;
  if(!scalar(sourceText)||sourceBytes>sourceLimit){
    const reason=sourceBytes>sourceLimit?"SOURCE_TOO_LARGE":"INVALID_SOURCE";
    const nodes:CompanionContentNode[]=[{kind:"notice",sourceSpan:null,reason:"UNSUPPORTED_CONTENT",text:"Source unavailable."}];
    return freeze({sourceText:"",sourceBytes:0,derivedBytes:Buffer.byteLength(JSON.stringify(nodes))+2,nodes,targets:[],unavailableReason:reason});
  }
  const budget=(value:number|undefined,max:number):number=>value===undefined?max:Number.isSafeInteger(value)&&value>=0?Math.min(value,max):0;
  const maxNodes=budget(options.maxNodes,captureLimits.sessionNodes),maxTargets=budget(options.maxTargets,captureLimits.sessionTargets),maxDepth=budget(options.maxDepth,fieldLimits.depth);
  const targets:CompanionLiteralCandidate[]=[];let nodeCount=0;let unavailableReason:CompanionExtractedContent["unavailableReason"]=null;
  const span=(start:number,end:number)=>({start,end});
  const boundedText=(text:string,max:number):boolean=>scalar(text)&&Buffer.byteLength(text,"utf8")<=max;
  const boundary=(offset:number):boolean=>Number.isSafeInteger(offset)&&offset>=0&&offset<=sourceText.length&&!/[\uDC00-\uDFFF]/.test(sourceText[offset]??"");
  /** Check every emitted field here; descendant depth is validated on the complete tree. */
  const node=(value:CompanionContentNode):CompanionContentNode=>{
    if(++nodeCount>maxNodes)throw "RENDER_LIMIT";
    const s=value.sourceSpan;
    if(s&&(!boundary(s.start)||!boundary(s.end)||s.start>s.end))throw "UNSUPPORTED_CONTENT";
    if((value.kind==="imagePlaceholder"&&!boundedText(value.alt,fieldLimits.shortTextBytes))||
      (value.kind==="notice"&&!boundedText(value.text,fieldLimits.shortTextBytes))||
      (value.kind==="code"&&(!boundedText(value.text,sourceLimit)||(value.language!==null&&!boundedText(value.language,fieldLimits.shortTextBytes))))||
      (value.kind==="text"&&!boundedText(value.text,sourceLimit))||
      (value.kind==="link"&&value.href!==null&&!boundedText(value.href,fieldLimits.hrefBytes)))throw "UNSUPPORTED_CONTENT";
    return value;
  };
  const add=(start:number,end:number,kind:CompanionLiteralCandidate["kind"],action:CompanionLiteralCandidate["action"],suggested=false):number|null=>{
    const literal=sourceText.slice(start,end),utf8Bytes=Buffer.byteLength(literal,"utf8");
    if(!literal||!scalar(literal)||literal.includes("\0"))return null;
    if(utf8Bytes>(kind==="path"||action==="review"?fieldLimits.pathBytes:sourceLimit)){unavailableReason="CANDIDATE_TOO_LARGE";return null;}
    if(targets.length>=maxTargets)throw "RENDER_LIMIT";
    const provenanceStatus=kind==="path"?"none":kind==="code"?"code":suggested?"suggested":"example";
    const displayLabel=kind==="path"?(action==="review"?"Review path":"Copy path"):kind==="code"?"Code shown by Claude":suggested?"Suggested command":"Command shown by Claude";
    const accessibleLabel=kind==="path"?displayLabel:`Copy ${kind}`;
    if(!boundedText(displayLabel,fieldLimits.shortTextBytes)||!boundedText(accessibleLabel,fieldLimits.shortTextBytes))throw "UNSUPPORTED_CONTENT";
    targets.push({sourceStart:start,sourceEnd:end,literal,utf8Bytes,kind,action,provenanceStatus,displayLabel,accessibleLabel});return targets.length-1;
  };
  /** The same endpoint rules cover plain prose and candidates crossing inline markup. */
  const candidateEnd=(raw:string,start:number,masks?:Uint8Array,opaque?:ReadonlyMap<number,number>,opaqueBase=0):number=>{
    let end=start;
    while(end<raw.length&&!masks?.[end]&&!/[\r\n]/.test(raw[end]!)){
      const through=opaque?.get(opaqueBase+end);if(through!==undefined){end=through-opaqueBase;continue;}
      if(end>start&&/[ \t]/.test(raw[end]!)){
        let next=end;while(next<raw.length&&/[ \t]/.test(raw[next]!))next++;
        if(explicit.test(raw.slice(next)))break;
        end=next;continue;
      }
      if(/[,;.!?]/.test(raw[end]!)&&(end+1===raw.length||/\s/.test(raw[end+1]!))){end++;break;}end++;
    }
    while(end>start&&/[ \t]/.test(raw[end-1]!))end--;return end;
  };
  /** Prose scanner implements PC endpoint precedence, never guesses a filename's end. */
  const prose=(raw:string,base:number,emit:typeof add=add,opaque:ReadonlyMap<number,number>=new Map(),opaqueBase=0):void=>{
    const masks=new Uint8Array(raw.length),quotes=new Map<number,{start:number;value:string;end:number}>();
    // Test a URI scheme once per maximal token, avoiding quadratic suffix retries on long words.
    for(const match of raw.matchAll(/\S+/g))if(uri.test(match[0]))masks.fill(1,match.index,match.index+match[0].length);
    for(const quote of raw.matchAll(/(["'])([^\r\n]*?)\1/g)){
      const start=quote.index+1,value=quote[2]!;
      if(quotedPath(value)){quotes.set(quote.index,{start,value,end:quote.index+quote[0].length});masks.fill(1,quote.index,quote.index+quote[0].length);}
    }
    let i=0;
    while(i<raw.length){
      const through=opaque.get(opaqueBase+i);if(through!==undefined){i=through-opaqueBase;continue;}
      const quote=quotes.get(i);
      if(quote){const escaped=raw[quote.start-2]==="\\"||quote.value.endsWith("\\");emit(base+quote.start,base+quote.start+quote.value.length,"path",uncertainLiteral(quote.value)||escaped?"review":"copy");i=quote.end;continue;}
      if(masks[i]||!/(?:^|[\s:([{'"])/.test(i===0?"":raw[i-1]!)||(i>0&&/[\w]/.test(raw[i-1]!))){i++;continue;}
      const token=/^[^\s]+/.exec(raw.slice(i))?.[0]??"";
      if(/["']/.test(raw[i]!)){i++;continue;}
      if(!pathForm(token)){i+=Math.max(token.length,1);continue;}
      const end=candidateEnd(raw,i,masks,opaque,opaqueBase);
      const value=raw.slice(i,end),unmatched=i>0&&/["']/.test(raw[i-1]!);
      emit(base+i,base+end,"path",/\s/.test(value)||ambiguous(value)||uncertainLiteral(value)||unmatched?"review":"copy");i=Math.max(end,i+1);
    }
  };
  /** Raw inline scanning keeps exact offsets; decoded code must agree before Copy. */
  const inline=(raw:string,base:number,depth:number):CompanionContentNode[]=>{
    if(depth>maxDepth)throw "RENDER_LIMIT";
    const nodes:CompanionContentNode[]=[];let i=0;
    const quoted=new Map<number,{end:number;value:string;escaped:boolean}>();
    // Establish quoted interiors before any rendering delimiter fragments their raw spelling.
    for(const match of raw.matchAll(/(["'])([^\r\n]*?)\1/g)){
      const value=match[2]!;
      if(quotedPath(value))quoted.set(match.index,{end:match.index+match[0].length,value,escaped:raw[match.index-1]==="\\"||value.endsWith("\\")});
    }
    type InlineBoundary={readonly end:number;readonly kind:"code"|"format"|"barrier"};
    const mapped=new Map<number,InlineBoundary>(),lastAngle=raw.lastIndexOf(">");
    let bracketEnds:Int32Array|undefined,simpleEnds:Int32Array|undefined,destinationEnds:Int32Array|undefined;
    /** Index terminators once: every failed start and shared destination then costs O(1). */
    const linkAt=(start:number)=>{
      const image=raw[start]==="!",open=start+(image?1:0);
      if(raw[open]!=="[")return undefined;
      if(!bracketEnds){
        bracketEnds=new Int32Array(raw.length+1);simpleEnds=new Int32Array(raw.length+1);destinationEnds=new Int32Array(raw.length+1);
        let bracket=raw.length,simple=raw.length,destination=raw.length;
        for(let offset=raw.length;offset>=0;offset--){
          const char=raw[offset];
          if(char==="]"||char==="\r"||char==="\n")bracket=offset;
          if(char!==undefined&&(/[\s()]/.test(char)))simple=offset;
          if(char===")"||char==="\r"||char==="\n")destination=offset;
          bracketEnds[offset]=bracket;simpleEnds[offset]=simple;destinationEnds[offset]=destination;
        }
      }
      const close=bracketEnds[open+1]!;
      if(raw[close]!=="]"||raw[close+1]!=="(")return undefined;
      const destinationStart=close+2,plainEnd=simpleEnds![destinationStart]??raw.length;
      if(raw[plainEnd]===")")return {image,close,end:plainEnd+1,plain:true,open};
      const end=destinationEnds![destinationStart]??raw.length;
      return !image&&(end===raw.length||raw[end]===")")?{image,close,end:end+(end<raw.length?1:0),plain:false,open}:undefined;
    };
    /** Only mapped constructs delimit eligible prose; literal brackets/angles never do. */
    const mappedAt=(start:number):InlineBoundary|undefined=>{
      const cached=mapped.get(start);if(cached)return cached;
      const rest=raw.slice(start);let found:InlineBoundary|undefined;
      if(quoted.has(start))found={kind:"barrier",end:quoted.get(start)!.end};
      else if(raw[start]==="`"){
        const marks=/^`+/.exec(rest)![0];let close=raw.indexOf(marks,start+marks.length);
        while(close>=0&&(raw[close-1]==="`"||raw[close+marks.length]==="`"))close=raw.indexOf(marks,close+marks.length);
        if(close>=0)found={kind:"code",end:close+marks.length};
        else found={kind:"barrier",end:raw.length};
      }else if(raw[start]==="["||raw.slice(start,start+2)==="!["){
        const link=linkAt(start);if(link)found={kind:"barrier",end:link.end};
      }else if(raw[start]==="<"&&start<lastAngle){
        const angle=/^<([^<>\r\n]+)>/.exec(rest);
        if(angle){
          const children=markdown.parseInline(angle[0],{})[0]?.children??[];
          // HTML is disabled: only an actual parsed autolink protects a span here.
          if(children[0]?.type==="link_open"&&children[children.length-1]?.type==="link_close")found={kind:"barrier",end:start+angle[0].length};
        }
      }else if(raw[start]==="*"||raw[start]==="_"){
        const mark=/^(\*\*|__|\*|_)/.exec(rest)![0];
        if(!(raw[start]==="_"&&/\w/.test(raw[start-1]??""))){
          const close=raw.indexOf(mark,start+mark.length);
          if(close>start+mark.length){
            const children=markdown.parseInline(raw.slice(start+mark.length,close),{})[0]?.children??[];
            const protectedChild=children.some(t=>t.type==="code_inline"||t.type==="link_open"||t.type==="image");
            found={kind:protectedChild?"barrier":"format",end:close+mark.length};
          }
        }
      }
      if(found)mapped.set(start,found);return found;
    };
    // Keep one inline-coordinate index. Subspan scans offset their lookups instead of
    // copying/filtering historical ranges whenever the active candidate advances.
    const text=(start:number,end:number,reviewStarts:ReadonlySet<number>=new Set(),opaque:ReadonlyMap<number,number>=new Map())=>{
      if(end<=start)return;const value=raw.slice(start,end),before=targets.length;
      prose(value,base+start,(s,e,kind,action)=>add(s,e,kind,reviewStarts.has(s-base)?"review":action),opaque,start);
      // Keep raw spelling for source-backed path display, including ordinary UNC separators.
      nodes.push(node({kind:"text",sourceSpan:span(base+start,base+end),text:targets.length>before?value:markdown.utils.unescapeAll(value)}));
    };
    while(i<raw.length){
      const rest=raw.slice(i);
      const quote=quoted.get(i);
      if(quote){
        add(base+i+1,base+quote.end-1,"path",uncertainLiteral(quote.value)||quote.escaped?"review":"copy");
        nodes.push(node({kind:"text",sourceSpan:span(base+i,base+quote.end),text:raw.slice(i,quote.end)}));i=quote.end;continue;
      }
      if(raw[i]==="\\"&&/[`*_[\]<>]/.test(raw[i+1]??"")){text(i,i+2);i+=2;continue;}
      if(raw[i]==="`"){
        const marks=/^`+/.exec(rest)![0];let close=raw.indexOf(marks,i+marks.length);
        while(close>=0&&(raw[close-1]==="`"||raw[close+marks.length]==="`"))close=raw.indexOf(marks,close+marks.length);
        if(close<0){nodes.push(node({kind:"text",sourceSpan:span(base+i,base+raw.length),text:raw.slice(i)}));break;}
        const start=i+marks.length,end=close,value=raw.slice(start,end);
        const parsed=markdown.parseInline(raw.slice(i,close+marks.length),{})[0]?.children;
        const verified=parsed?.length===1&&parsed[0]!.type==="code_inline"&&parsed[0]!.content===value;
        const command=options.sourceKind!=="tool"&&!/[\r\n]/.test(value)&&cue(raw.slice(0,i));
        const bareCue=/(?:^|\s)(?:file|folder|directory|path)(?:\s+|:\s*)$/i.test(raw.slice(0,i));
        const path=!uri.test(value.trim())&&(quotedPath(value.trim())||(bareCue&&!/[\\/\r\n]/.test(value)&&value.trim().length>0));
        const kind=command?"command":path?"path":"code";
        const action=verified&&(kind!=="path"||!uncertainLiteral(value))?"copy":"review";
        const index=add(base+start,base+end,kind,action,command);
        nodes.push(node({kind:"code",sourceSpan:span(base+i,base+close+marks.length),text:verified?value:raw.slice(i,close+marks.length),language:null,block:command,targetIndex:index}));i=close+marks.length;continue;
      }
      const link=linkAt(i);
      if(link?.plain){
        const label=raw.slice(link.open+1,link.close),href=raw.slice(link.close+2,link.end-1);
        nodes.push(link.image?node({kind:"imagePlaceholder",sourceSpan:span(base+i,base+link.end),alt:label}):node({kind:"link",sourceSpan:span(base+i,base+link.end),href:allowedLink(href),children:inline(label,base+i+1,depth+1)}));i=link.end;continue;
      }
      if(link){nodes.push(node({kind:"text",sourceSpan:span(base+i,base+link.end),text:raw.slice(i,link.end)}));i=link.end;continue;}
      if(raw[i]==="<"){
        const auto=/^<([^<>\r\n]+)>/.exec(rest);
        if(auto){const href=allowedLink(auto[1]!);nodes.push(/^https?:\/\//i.test(auto[1]!)?node({kind:"link",sourceSpan:span(base+i,base+i+auto[0].length),href,children:[node({kind:"text",sourceSpan:span(base+i+1,base+i+auto[0].length-1),text:auto[1]!})]}):node({kind:"text",sourceSpan:span(base+i,base+i+auto[0].length),text:auto[0]}));i+=auto[0].length;continue;}
      }
      const mark=/^(\*\*|__|\*|_)/.exec(rest)?.[0];
      if(mark&&rest.startsWith(mark+mark[0]))throw "UNSUPPORTED_CONTENT";
      if(mark){const close=raw.indexOf(mark,i+mark.length);if(close>i+mark.length){nodes.push(node({kind:mark.length===2?"strong":"emphasis",sourceSpan:span(base+i,base+close+mark.length),children:inline(raw.slice(i+mark.length,close),base+i+mark.length,depth+1)}));i=close+mark.length;continue;}}
      if(raw[i]==="\r"||raw[i]==="\n"){
        const end=i+(raw.slice(i,i+2)==="\r\n"?2:1);nodes.push(node({kind:"softBreak",sourceSpan:span(base+i,base+end)}));i=end;continue;
      }
      let end=i+1,tailStart:number|undefined,checkedThrough=i;
      const reviewStarts=new Set<number>();
      const opaque=new Map<number,number>();
      while(end<raw.length){
        if(raw[end]==="\\"&&/[`*_[\]<>]/.test(raw[end+1]??"")){end+=2;continue;}
        if(/[\r\n]/.test(raw[end]!))break;
        const construct=/[`*_[<!"']/.test(raw[end]!)?mappedAt(end):undefined;
        if(construct){
          // Whitespace-separated code/links/images are barriers. Glued code/emphasis may
          // belong to an already-open raw path candidate and require its complete Review.
          if(construct.kind!=="barrier"&&!/\s/.test(raw[end-1]!)){
            const newText=raw.slice(Math.max(i,checkedThrough-1),end);
            const endpoint=/[,;.!?](?=\s)|(?:^|\s)(?:[A-Za-z]:[\\/]|\/{1,2}|\\\\|\.{1,2}[\\/]|~[\\/]|[A-Za-z][A-Za-z\d+.-]*:\/\/|mailto:|www\.)/.test(newText);
            if(tailStart===undefined||endpoint){
              const from=tailStart??i;tailStart=undefined;
              prose(raw.slice(from,end),base+from,(s,e)=>{if(e===base+end)tailStart=s-base;return null;},opaque,from);
            }
            if(tailStart!==undefined){reviewStarts.add(tailStart);opaque.set(end,construct.end);checkedThrough=construct.end;end=construct.end;continue;}
          }
          break;
        }
        end++;
      }
      if(/[\r\n]/.test(raw[end]??"")&&/ {2}$/.test(raw.slice(i,end))){
        text(i,end-2,reviewStarts,opaque);const breakEnd=end+(raw.slice(end,end+2)==="\r\n"?2:1);
        nodes.push(node({kind:"hardBreak",sourceSpan:span(base+end-2,base+breakEnd)}));i=breakEnd;continue;
      }
      text(i,end,reviewStarts,opaque);i=end;
    }
    return nodes;
  };
  const lines=[0];for(let i=0;i<sourceText.length;i++)if(sourceText[i]==="\n")lines.push(i+1);
  const at=(line:number):number=>lines[line]??sourceText.length;
  // markdown-it replaces source NUL by U+FFFD without changing UTF16 positions.
  // Correlate that parser-only view, then slice/render the untouched retained source.
  const parserText=(text:string):string=>text.replace(/\0/g,"\uFFFD");
  // Ambiguous occurrences after stripped Markdown prefixes cannot prove an exact mapping.
  const uniqueOffset=(line:string,part:string):number=>{
    const mapped=parserText(line),offset=mapped.indexOf(part);
    if(offset<0||(part.length>0&&mapped.indexOf(part,offset+1)>=0))throw "UNSUPPORTED_CONTENT";
    return offset;
  };
  try{
    const tokens=markdown.parse(sourceText,{});let position=0;
    const blocks=(depth:number,closing?:string):CompanionContentNode[]=>{
      if(depth>maxDepth)throw "RENDER_LIMIT";const nodes:CompanionContentNode[]=[];
      while(position<tokens.length){const token=tokens[position++]!;
        if(token.nesting===-1){if(token.type!==closing)throw "UNSUPPORTED_CONTENT";return nodes;}
        const start=token.map?at(token.map[0]):0,end=token.map?at(token.map[1]):sourceText.length,sourceSpan=span(start,end);
        if(token.type==="inline"){
          if(!token.map)throw "UNSUPPORTED_CONTENT";
          // Each mapped line must contain its exact parser content; stripped list/quote prefixes stay in parent spans.
          const parts=token.content.split("\n");let line=token.map[0];
          const first=uniqueOffset(sourceText.slice(start,at(line+1)),parts[0]!);
          const lastLine=token.map[0]+parts.length-1,lastRaw=sourceText.slice(at(lastLine),at(lastLine+1));
          const last=uniqueOffset(lastRaw,parts[parts.length-1]!);
          const contiguous=sourceText.slice(start+first,at(lastLine)+last+parts[parts.length-1]!.length);
          if(first>=0&&last>=0&&parserText(contiguous.replace(/\r\n/g,"\n"))===token.content){nodes.push(...inline(contiguous,start+first,depth));continue;}
          for(let p=0;p<parts.length;p++,line++){
            const part=parts[p]!,lineText=sourceText.slice(at(line),at(line+1)).replace(/\r?\n$/,"");
            const offset=uniqueOffset(lineText,part);
            nodes.push(...inline(lineText.slice(offset,offset+part.length),at(line)+offset,depth));
            if(p+1<parts.length)nodes.push(node({kind:"softBreak",sourceSpan:span(at(line)+lineText.length,at(line+1))}));
          }continue;
        }
        if(token.type==="fence"){
          const opening=sourceText.slice(start,at(token.map![0]+1));const closingLine=sourceText.slice(at(token.map![1]-1),end).replace(/\r?\n$/,"");
          const marker=token.markup[0]!;const closed=new RegExp(`^ {0,3}${marker}{${token.markup.length},}[ \\t]*$`).test(closingLine);
          if(!closed||token.map![1]-token.map![0]<2)throw "UNSUPPORTED_CONTENT";
          const bodyStart=start+opening.length;let bodyEnd=at(token.map![1]-1);if(sourceText.slice(bodyEnd-2,bodyEnd)==="\r\n")bodyEnd-=2;else if(sourceText[bodyEnd-1]==="\n")bodyEnd--;
          bodyEnd=Math.max(bodyStart,bodyEnd);const language=token.info.trim().split(/\s/)[0]||null;
          if(language&&Buffer.byteLength(language)>fieldLimits.shortTextBytes)throw "UNSUPPORTED_CONTENT";
          const kind=options.sourceKind!=="tool"&&language&&shellLanguages.has(language.toLowerCase())?"command":"code";
          const prefix=sourceText.slice(0,start).replace(/(?:\r?\n)+$/,"");
          const index=add(bodyStart,bodyEnd,kind,"copy",kind==="command"&&cue(prefix));
          nodes.push(node({kind:"code",sourceSpan,text:sourceText.slice(bodyStart,bodyEnd),language,block:true,targetIndex:index}));continue;
        }
        if(token.type==="code_block")throw "UNSUPPORTED_CONTENT";
        if(token.nesting===1){
          const children=blocks(depth+1,token.type.replace(/_open$/,"_close"));let value:CompanionContentNode;
          switch(token.type){
            case "paragraph_open":value={kind:"paragraph",sourceSpan,children};break;
            case "heading_open":value={kind:"heading",sourceSpan,children,level:Number(token.tag.slice(1))};break;
            case "blockquote_open":value={kind:"blockquote",sourceSpan,children};break;
            case "list_item_open":value={kind:"listItem",sourceSpan,children};break;
            case "bullet_list_open":case "ordered_list_open":{
              const ordered=token.type==="ordered_list_open",startNumber=ordered?Number(token.attrGet("start")??1):null;
              if(startNumber!==null&&(!Number.isSafeInteger(startNumber)||startNumber<1))throw "UNSUPPORTED_CONTENT";
              value={kind:"list",sourceSpan,children,ordered,startNumber};break;
            }
            default:throw "UNSUPPORTED_CONTENT";
          }nodes.push(node(value));continue;
        }
        throw "UNSUPPORTED_CONTENT";
      }
      if(closing)throw "UNSUPPORTED_CONTENT";return nodes;
    };
    const nodes=blocks(1);
    const descendants=(children:readonly CompanionContentNode[],depth:number,parent?:CompanionContentNode):void=>{
      if(children.length&&depth>maxDepth)throw "RENDER_LIMIT";
      for(const child of children){
        if(parent?.sourceSpan&&child.sourceSpan&&(child.sourceSpan.start<parent.sourceSpan.start||child.sourceSpan.end>parent.sourceSpan.end))throw "UNSUPPORTED_CONTENT";
        if("children"in child)descendants(child.children,depth+1,child);
      }
    };
    descendants(nodes,1);
    return freeze({sourceText,sourceBytes,derivedBytes:Buffer.byteLength(JSON.stringify(nodes))+Buffer.byteLength(JSON.stringify(targets)),nodes,targets,unavailableReason});
  }catch(error){
    const reason=error==="RENDER_LIMIT"?"RENDER_LIMIT":"UNSUPPORTED_CONTENT";
    const nodes:CompanionContentNode[]=[{kind:"text",sourceSpan:span(0,sourceText.length),text:sourceText},{kind:"notice",sourceSpan:null,reason,text:reason==="RENDER_LIMIT"?"Rendering limit reached; raw source retained.":"Unsupported Markdown; raw source retained."}];
    return freeze({sourceText,sourceBytes,derivedBytes:Buffer.byteLength(JSON.stringify(nodes))+2,nodes,targets:[],unavailableReason:reason});
  }
}
