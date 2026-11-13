import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractCompanionContent } from "../../src/companion/companionContent";

type PathCase = {id:string;input?:string;inputPattern?:{prefix:string;repeat:string;count:number};expected:unknown[]};
const fixture = JSON.parse(readFileSync(resolve(__dirname,"../../../test/fixtures/companion/copy-cases.json"),"utf8")) as {cases:PathCase[]};
describe("companion source-mapped literal content",()=>{
  for(const vector of fixture.cases)it(`extracts approved ${vector.id} through Markdown`,()=>{
    const source=vector.input??vector.inputPattern!.prefix+vector.inputPattern!.repeat.repeat(vector.inputPattern!.count);
    const result=extractCompanionContent(source);
    assert.deepEqual(result.targets.filter(t=>t.kind==="path").map(({action,sourceStart,sourceEnd,literal})=>({action,sourceStart,sourceEnd,literal})),vector.expected);
    assert.equal(result.sourceText,source);
  });
  it("preserves a shell script's literal body and strict suggestion label",()=>{
    const source="Before\n\nRun:\n```bash\n  echo one  \nprintf 'two'\n\n```\nAfter";
    const result=extractCompanionContent(source);
    assert.deepEqual(result.targets.map(t=>[t.kind,t.literal,t.provenanceStatus,t.displayLabel]),[["command","  echo one  \nprintf 'two'\n","suggested","Suggested command"]]);
  });
  it("distinguishes examples and generic code without inventing execution",()=>{
    assert.deepEqual(extractCompanionContent("```sh\necho hi\n```").targets.map(t=>[t.kind,t.provenanceStatus,t.displayLabel]),[["command","example","Command shown by Claude"]]);
    assert.deepEqual(extractCompanionContent("```js\nlet n=1;\n```").targets.map(t=>[t.kind,t.provenanceStatus]),[["code","code"]]);
  });
});

import type { CompanionContentNode } from "../../src/companion/companionTypes";
function flatten(nodes:readonly CompanionContentNode[]):CompanionContentNode[]{return nodes.flatMap(n=>[n,...("children"in n?flatten(n.children):[])]);}
describe("companion complete explanation grammar",()=>{
  for(const language of ["sh","bash","zsh","shell","powershell","pwsh","ps1","cmd","bat"]){
    it(`recognizes the closed ${language} shell body`,()=>assert.deepEqual(extractCompanionContent("```"+language+"\n$ echo hi\n```").targets.map(t=>[t.kind,t.literal,t.action]),[["command","$ echo hi","copy"]]));
  }
  for(const instruction of ["Run:","Run this command:","Execute:"]){
    it(`recognizes standalone ${instruction} inline cue`,()=>assert.deepEqual(extractCompanionContent(instruction+" `echo 'x'`").targets.map(t=>[t.kind,t.literal,t.provenanceStatus]),[["command","echo 'x'","suggested"]]));
  }
  for(const source of ["Maybe Run: `echo hi`","Don't Run: `echo hi`","run: `echo hi`","Examples: `echo hi`"]){
    it(`keeps a non-cue generic: ${source}`,()=>assert.deepEqual(extractCompanionContent(source).targets.map(t=>[t.kind,t.provenanceStatus]),[["code","code"]]));
  }
  for(const [source,value] of [["file: `assets`","assets"],["folder assets `thing`","thing"],["Use `assets`","assets"],["Use `1.2`","1.2"],["Use `README.md`","README.md"],["Use '~/my folder/'","~/my folder/"],["Use `C:/a(1).txt`","C:/a(1).txt"]] as const){
    it(`classifies explicit value ${source}`,()=>{
      const expected=source==="file: `assets`"||source.includes("README")||source.includes("~/")||source.includes("a(1)")?"path":"code";
      const r=extractCompanionContent(source);assert.deepEqual(r.targets.map(t=>[t.kind,t.literal,t.action]),[[expected,value,"copy"]]);
    });
  }
  it("preserves Windows CRLF, surrounding spaces and intentional blank command lines",()=>{
    const r=extractCompanionContent("Run:\r\n```pwsh\r\n  Write-Host 'x'  \r\nWrite-Host 'y'\r\n\r\n```\r\nEnd");
    assert.deepEqual(r.targets.map(t=>t.literal),["  Write-Host 'x'  \r\nWrite-Host 'y'\r\n"]);
    assert.equal(r.targets[0]!.utf8Bytes,36);
  });
  it("retains headings, list, links, emphasis, blockquote and explanation in source order",()=>{
    const source="# Title\n\nBefore **bold** *em*.\n\n1. One\n2. Two\n\n> Quote\n\n[Docs](https://example.com/x) ![remote](https://host/img.png)\n\n```sh\necho hi\n```\n\nAfter";
    const r=extractCompanionContent(source),all=flatten(r.nodes);
    assert.equal(r.unavailableReason,null);assert.deepEqual(r.nodes.map(n=>n.kind),["heading","paragraph","list","blockquote","paragraph","code","paragraph"]);
    assert.ok(all.some(n=>n.kind==="strong"));assert.ok(all.some(n=>n.kind==="emphasis"));
    assert.deepEqual(all.filter(n=>n.kind==="imagePlaceholder"),[{kind:"imagePlaceholder",sourceSpan:{start:source.indexOf("!["),end:source.indexOf("\n\n```sh")},alt:"remote"}]);
    assert.deepEqual(all.filter(n=>n.kind==="text").map(n=>n.text),["Title","Before ","bold"," ","em",".","One","Two","Quote","Docs"," ","After"]);
    for(const n of all){if(n.sourceSpan){assert.ok(n.sourceSpan.start<=n.sourceSpan.end);assert.ok(n.sourceSpan.end<=source.length);}if("children"in n)for(const c of n.children){assert.ok(c.sourceSpan!.start>=n.sourceSpan!.start);assert.ok(c.sourceSpan!.end<=n.sourceSpan!.end);}}
  });
  it("keeps HTML inert, images resource-free and links restricted",()=>{
    const all=flatten(extractCompanionContent('<script>alert(1)</script>\n\n[bad](command:do) [local](file:///tmp/x) [safe](https://example.com) <https://example.org> ![x](https://remote/image)').nodes);
    assert.ok(all.some(n=>n.kind==="text"&&n.text.includes("<script>")));
    assert.deepEqual(all.filter(n=>n.kind==="link").map(n=>n.href),[null,null,"https://example.com","https://example.org"]);
    assert.ok(all.filter(n=>n.kind==="imagePlaceholder").every(n=>!("href"in n)));
  });
  it("never adds paths inside commands, generic code, URLs or link destinations",()=>{
    assert.deepEqual(extractCompanionContent('Run: `echo C:/a.txt`\n\n```js\nC:/b.txt\n```\n\n[x](C:/c.txt) https://host/a/file www.host/b mailto:a/b').targets.map(t=>t.kind),["command","code"]);
  });
  it("reviews variables and uncertain escaped paths literally",()=>{
    for(const source of ["`$HOME/a`","'%USERPROFILE%/a'","`\\\\?\\C:\\a`","C:/a\\!x"]){const r=extractCompanionContent(source);assert.equal(r.targets[0]?.action,"review");assert.ok(r.targets[0]!.literal.includes(source.includes("HOME")?"$HOME":source.includes("USER")?"%USERPROFILE%":source.includes("?")?"?":"\\!"));}
  });
  it("reviews raw normalized inline code rather than manufacturing a mapped Copy",()=>{
    const r=extractCompanionContent("Use ` C:/a.txt ` and `a\nb`");
    assert.deepEqual(r.targets.map(t=>[t.literal,t.action]),[[" C:/a.txt ","review"],["a\nb","review"]]);
  });
  it("retains escaped and unclosed backticks as inert source",()=>{
    const r=extractCompanionContent("\\`C:/a.txt\\` and `oops");assert.ok(!r.targets.some(t=>t.kind==="code"||t.kind==="command"));
  });
  it("shows complete raw source and notice for an unclosed fence or unsupported structure",()=>{
    for(const source of ["Before\n```sh\necho x\nAfter","Before\n\n---\n\nAfter","    echo x\n"]){const r=extractCompanionContent(source);assert.equal(r.sourceText,source);assert.deepEqual(r.targets,[]);assert.deepEqual(r.nodes[0],{kind:"text",sourceSpan:{start:0,end:source.length},text:source});assert.equal(r.nodes[1]!.kind,"notice");}
  });
  it("renders hard breaks and decodes ordinary Markdown text without losing raw source",()=>{
    const r=extractCompanionContent("A &amp; B  \nNext");assert.equal(r.sourceText,"A &amp; B  \nNext");assert.deepEqual(flatten(r.nodes).map(n=>n.kind),["paragraph","text","hardBreak","text"]);assert.equal(flatten(r.nodes)[1]!.kind==="text"&&(flatten(r.nodes)[1] as {text:string}).text,"A & B");
  });
  it("does not auto-copy a normalized path display or a malformed Markdown destination",()=>{
    assert.deepEqual(extractCompanionContent("C:/a&amp;b.txt").targets.map(t=>[t.literal,t.action]),[["C:/a&amp;b.txt","review"]]);
    assert.deepEqual(extractCompanionContent("[x](C:/a.txt now)").targets,[]);
  });
});
describe("companion exact finite budgets",()=>{
  for(const delta of [-1,0,1]){
    it(`applies actual 32 KiB path boundary ${delta}`,()=>{const source="C:/"+"a".repeat(32765+delta),r=extractCompanionContent(source);assert.equal(r.targets.length,delta>0?0:1);assert.equal(r.sourceText,source);if(delta>0)assert.equal(r.unavailableReason,"CANDIDATE_TOO_LARGE");});
    for(const [sourceKind,limit] of [["assistant",1048576],["tool",262144]] as const){
      it(`applies ${sourceKind} UTF8 source boundary ${delta}`,()=>{const source="😀".repeat((limit-4)/4)+"a".repeat(4+delta),r=extractCompanionContent(source,{sourceKind});assert.equal(r.sourceBytes,delta>0?0:limit+delta);assert.equal(r.sourceText,delta>0?"":source);assert.equal(r.unavailableReason,delta>0?"SOURCE_TOO_LARGE":null);});
    }
    it(`applies actual target boundary ${delta}`,()=>{const source=Array(2000+delta).fill("`a`").join(" "),r=extractCompanionContent(source);assert.equal(r.targets.length,delta>0?0:2000+delta);assert.equal(r.unavailableReason,delta>0?"RENDER_LIMIT":null);});
    it(`applies actual node boundary ${delta}`,()=>{const count=20000+delta,source=Array(Math.floor(count/2)).fill("a").join("\n\n")+(count%2?"\n\n```\n```":""),r=extractCompanionContent(source);assert.equal(flatten(r.nodes).length,delta>0?2:count);assert.equal(r.unavailableReason,delta>0?"RENDER_LIMIT":null);});
  }
  it("refuses invalid-surrogate source with a bounded placeholder",()=>{for(const source of ["hi\uD800x","hi\uDC00x"]){const r=extractCompanionContent(source);assert.equal(r.sourceText,"");assert.equal(r.unavailableReason,"INVALID_SOURCE");assert.deepEqual(r.targets,[]);assert.equal(r.nodes[0]!.kind,"notice");}});
  it("accounts node strings, candidate strings and labels and freezes output",()=>{const r=extractCompanionContent("`C:/a`");const minimum=Buffer.byteLength(JSON.stringify(r.nodes))+Buffer.byteLength(JSON.stringify(r.targets));assert.ok(r.derivedBytes>=minimum);assert.ok(Object.isFrozen(r)&&Object.isFrozen(r.nodes)&&Object.isFrozen(r.targets[0]));});
  it("retains complete context when remaining node/target capacity is exhausted",()=>{for(const options of [{maxNodes:1},{maxTargets:0},{maxDepth:1}]){const r=extractCompanionContent("Before `a` after",options);assert.equal(r.unavailableReason,"RENDER_LIMIT");assert.equal(r.nodes[0]!.kind,"text");assert.equal(r.sourceText,"Before `a` after");assert.deepEqual(r.targets,[]);}});
  it("cannot raise hard limits with a caller budget",()=>{const r=extractCompanionContent(Array(2001).fill("`a`").join(" "),{maxTargets:99999,maxDepth:99999,maxNodes:99999});assert.equal(r.unavailableReason,"RENDER_LIMIT");});
  for(const depth of [31,32,33])it(`bounds actual node nesting ${depth}`,()=>{const source="> ".repeat(depth-2)+"a",r=extractCompanionContent(source);assert.equal(r.unavailableReason,depth>32?"RENDER_LIMIT":null);});
  it("omits only oversized candidates and retains unrelated literal actions",()=>{const r=extractCompanionContent("C:/"+"a".repeat(32768)+"\n\nUse `D:/ok`");assert.equal(r.unavailableReason,"CANDIDATE_TOO_LARGE");assert.deepEqual(r.targets.map(t=>t.literal),["D:/ok"]);});
});

describe("companion bounded lexical correlation",()=>{
  it("retains long ordinary words within a bounded lexical scan",function(){this.timeout(5000);const probe=spawnSync(process.execPath,["-e",'const {extractCompanionContent:e}=require("./out/src/companion/companionContent"); const r=e("a".repeat(1048576)); console.log(r.sourceText.length,r.targets.length);'],{cwd:resolve(__dirname,"../../.."),timeout:3000,encoding:"utf8"});assert.equal(probe.status,0,probe.error?.message);assert.equal(probe.stdout.trim(),"1048576 0");});
  it("keeps quoted and prose candidate order",()=>{assert.deepEqual(extractCompanionContent("C:/a 'D:/b'").targets.map(t=>t.literal),["C:/a","D:/b"]);});
  it("never truncates a path at underscore emphasis-like spelling",()=>{assert.deepEqual(extractCompanionContent("C:/my_folder/a.txt").targets.map(t=>[t.literal,t.action]),[["C:/my_folder/a.txt","copy"]]);});
  it("charges retained fallback and invalid-source placeholder strings",()=>{for(const source of ["```sh\nx","x\0"]){const r=extractCompanionContent(source);assert.ok(r.derivedBytes>=Buffer.byteLength(JSON.stringify(r.nodes))+Buffer.byteLength(JSON.stringify(r.targets)));}});
});

describe("companion exact mixed and incomplete mapping",()=>{
  it("reviews a path spanning Markdown constructs without a clear-prefix target",()=>{
    for(const source of ["C:/a`b`","C:/a*b*","C:/a**b**"]){const r=extractCompanionContent(source);assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.literal]),[["path","review",source]]);}
  });
  it("never treats a lone fence opener as a closed empty block",()=>{for(const source of ["```","```sh\n"]){const r=extractCompanionContent(source);assert.equal(r.unavailableReason,"UNSUPPORTED_CONTENT");assert.equal(r.nodes[0]!.kind,"text");}});
  it("reviews quotes with uncertain escape boundaries",()=>{const source='Open "C:/a\\"';const r=extractCompanionContent(source);assert.deepEqual(r.targets.map(t=>[t.literal,t.action]),[["C:/a\\","review"]]);});
  it("verifies actual nested node depth at the selected ceiling",()=>{
    const depth=(nodes:readonly CompanionContentNode[]):number=>nodes.length?Math.max(...nodes.map(n=>1+("children"in n?depth(n.children):0))):0;
    for(const count of [31,32,33]){const r=extractCompanionContent("> ".repeat(count-2)+"a");assert.equal(count>32?r.unavailableReason:depth(r.nodes),count>32?"RENDER_LIMIT":count);}
  });
});

it("uses tool content only as generic code, never as an assistant command suggestion",()=>{const r=extractCompanionContent("Run: `echo hi`\n\n```sh\necho bye\n```",{sourceKind:"tool"});assert.deepEqual(r.targets.map(t=>[t.kind,t.provenanceStatus]),[["code","code"],["code","code"]]);});
describe("companion verified Markdown correlation",()=>{
  it("falls back when a stripped block prefix makes the raw occurrence ambiguous",()=>{const r=extractCompanionContent("# # #");assert.equal(r.unavailableReason,"UNSUPPORTED_CONTENT");assert.equal(r.nodes[0]!.kind,"text");});
  it("keeps unsupported ordered-list starts out of closed VW nodes",()=>{const r=extractCompanionContent("0. Zero");assert.equal(r.unavailableReason,"UNSUPPORTED_CONTENT");assert.equal(r.nodes[0]!.kind,"text");});
  it("keeps complex unsupported emphasis as complete inert source",()=>{const source="Before ***bold*** after";const r=extractCompanionContent(source);assert.equal(r.unavailableReason,"UNSUPPORTED_CONTENT");assert.deepEqual(r.nodes[0],{kind:"text",sourceSpan:{start:0,end:source.length},text:source});});
});

it("loads supplemental LF/CRLF and generic literal expectations from the committed fixture",()=>{
  const supplemental=(fixture as unknown as {supplementaryCases:{id:string;input:string;expected:unknown[]}[]}).supplementaryCases;
  for(const vector of supplemental){const r=extractCompanionContent(vector.input);assert.deepEqual(r.targets.map(({kind,action,sourceStart,sourceEnd,literal})=>({kind,action,sourceStart,sourceEnd,literal})),vector.expected,vector.id);}
});

it("bounds every reviewed raw candidate at 32 KiB without shortening it",()=>{
  for(const bytes of [32767,32768,32769]){const r=extractCompanionContent("` "+"a".repeat(bytes-2)+" `");assert.equal(r.targets.length,bytes>32768?0:1);assert.equal(r.unavailableReason,bytes>32768?"CANDIDATE_TOO_LARGE":null);if(bytes<=32768)assert.equal(r.targets[0]!.action,"review");}
});

describe("companion accepted review regressions R1-R6",()=>{
  for(const [source,start,end,literal,action] of [
    ["C:/a[b].txt",0,11,"C:/a[b].txt","review"],
    ["C:/a<b>.txt",0,11,"C:/a<b>.txt","review"],
    ["Open C:/a[b].txt",5,16,"C:/a[b].txt","review"],
    ["**C:/a<b>.txt**",2,13,"C:/a<b>.txt","review"],
    ['"C:/a[b].txt"',1,12,"C:/a[b].txt","copy"],
    ["`C:/a<b>.txt`",1,12,"C:/a<b>.txt","copy"]
  ] as const)it(`R1 retains the full bracket-bearing candidate: ${source}`,()=>{
    const r=extractCompanionContent(source);assert.equal(r.sourceText,source);assert.equal(r.unavailableReason,null);
    assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.sourceStart,t.sourceEnd,t.literal]),[["path",action,start,end,literal]]);
  });
  it("R1 preserves multiple paths and command/code/destination precedence",()=>{
    assert.deepEqual(extractCompanionContent("C:/a[b].txt D:/b").targets.map(t=>[t.action,t.sourceStart,t.sourceEnd,t.literal]),[["review",0,11,"C:/a[b].txt"],["copy",12,16,"D:/b"]]);
    assert.deepEqual(extractCompanionContent("Run: `echo C:/a[b].txt`\n\n```js\nC:/a<b>.txt\n```\n\n[x](C:/a[b].txt)").targets.map(t=>t.kind),["command","code"]);
  });
  it("R2 consumes the 100005-byte whitespace probe with complete semantic effects",function(){
    this.timeout(5000);
    const probe=spawnSync(process.execPath,["-e",'const assert=require("node:assert/strict"); const {extractCompanionContent:e}=require("./out/src/companion/companionContent"); const s="C:/a"+" ".repeat(100000)+"x"; const r=e(s); assert.equal(r.sourceText,s); assert.equal(r.sourceBytes,100005); assert.deepEqual(r.targets,[]); assert.equal(r.unavailableReason,"CANDIDATE_TOO_LARGE"); console.log("100005 retained; oversized whole candidate omitted");'],{cwd:resolve(__dirname,"../../.."),timeout:3000,encoding:"utf8"});
    assert.equal(probe.status,0,probe.error?.message??probe.stderr);assert.equal(probe.stdout.trim(),"100005 retained; oversized whole candidate omitted");
  });
  it("R2 preserves exact next-root endpoints across long whitespace runs",()=>{
    const source="C:/a"+" ".repeat(100000)+"D:/b",r=extractCompanionContent(source);
    assert.equal(r.sourceText,source);assert.deepEqual(r.targets.map(t=>[t.action,t.sourceStart,t.sourceEnd,t.literal]),[["copy",0,4,"C:/a"],["copy",100004,100008,"D:/b"]]);
  });
  it("R3 retains bounded NUL context and valid unrelated actions",()=>{
    const source="Text\0here\n\n`C:/a`",r=extractCompanionContent(source);
    assert.equal(r.sourceText,source);assert.equal(r.sourceBytes,17);assert.equal(r.unavailableReason,null);
    assert.deepEqual(r.targets.map(t=>[t.action,t.sourceStart,t.sourceEnd,t.literal]),[["copy",12,16,"C:/a"]]);
    assert.ok(flatten(r.nodes).some(n=>n.kind==="text"&&n.text==="Text\0here"));
  });
  it("R3 omits complete NUL-bearing candidates without losing valid following targets",()=>{
    for(const source of ["`C:/a\0b`\n\n`D:/ok`","C:/a\0b\n\n`D:/ok`","Run: `echo\0x`\n\n`D:/ok`","```sh\necho\0x\n```\n\n`D:/ok`"]){
      const r=extractCompanionContent(source);assert.equal(r.sourceText,source);assert.deepEqual(r.targets.map(t=>t.literal),["D:/ok"]);assert.ok(!r.targets.some(t=>t.literal.includes("\0")));
    }
  });
  for(const delta of [-1,0,1]){
    it(`R4 applies the actual multibyte 256-byte image-alt bound ${delta}`,()=>{
      const alt="😀".repeat(63)+"a".repeat(4+delta),source=`![${alt}](https://host/img)`,r=extractCompanionContent(source);
      assert.equal(r.sourceText,source);assert.equal(r.unavailableReason,delta>0?"UNSUPPORTED_CONTENT":null);
      if(delta>0)assert.equal(r.nodes[0]!.kind,"text");else assert.deepEqual(flatten(r.nodes).filter(n=>n.kind==="imagePlaceholder").map(n=>n.alt),[alt]);
    });
    for(const auto of [false,true])it(`R4 applies the multibyte href bound ${delta}, auto=${auto}`,()=>{
      const href="https://host/"+"é".repeat(1016)+"a".repeat(3+delta),source=auto?`<${href}>`:`[x](${href})`,r=extractCompanionContent(source);
      assert.equal(Buffer.byteLength(href),2048+delta);assert.equal(r.sourceText,source);assert.equal(r.unavailableReason,null);
      assert.deepEqual(flatten(r.nodes).filter(n=>n.kind==="link").map(n=>n.href),[delta>0?null:href]);
    });
    it(`R4 applies the multibyte language bound ${delta}`,()=>{
      const language="é".repeat(127)+"a".repeat(2+delta),source="```"+language+"\nx\n```",r=extractCompanionContent(source);
      assert.equal(r.sourceText,source);assert.equal(r.unavailableReason,delta>0?"UNSUPPORTED_CONTENT":null);
    });
    it(`R4 includes the autolink's extra descendant at depth ${32+delta}`,()=>{
      const count=32+delta,source="> ".repeat(count-3)+"<https://example.com>",r=extractCompanionContent(source);
      const depth=(nodes:readonly CompanionContentNode[]):number=>nodes.length?Math.max(...nodes.map(n=>1+("children"in n?depth(n.children):0))):0;
      assert.equal(r.sourceText,source);assert.equal(r.unavailableReason,delta>0?"RENDER_LIMIT":null);if(delta<=0)assert.equal(depth(r.nodes),count);else assert.equal(depth(r.nodes),1);
    });
  }
  for(const value of ["www.example.com","mailto:a@example.com","https://example.com/a","custom://host/a"]){
    for(const prefix of ["Use ","file: ","folder ","directory: ","path: "])it(`R5 excludes URI from inline filename/cue alternatives: ${prefix}${value}`,()=>{
      const r=extractCompanionContent(prefix+"`"+value+"`");assert.deepEqual(r.targets.map(t=>[t.kind,t.literal]),[["code",value]]);
    });
    it(`R5 excludes quoted URI ${value}`,()=>assert.deepEqual(extractCompanionContent('Open "'+value+'"').targets,[]));
  }
  it("R5 preserves real filenames and explicitly cued basenames",()=>{
    assert.deepEqual(extractCompanionContent('Use `README.md` and "config.json"; folder: `assets`').targets.map(t=>[t.kind,t.literal]),[["path","README.md"],["path","config.json"],["path","assets"]]);
  });
  for(const [source,start,end,literal] of [
    ["//server/share/file.txt",0,23,"//server/share/file.txt"],
    ['"//server/share/my file.txt"',1,27,"//server/share/my file.txt"],
    ["`//server/share/file.txt`",1,24,"//server/share/file.txt"],
    ["//server/share/",0,15,"//server/share/"],
    ["\\\\server\\share\\file.txt",0,23,"\\\\server\\share\\file.txt"]
  ] as const)it(`R6 recognizes a complete same-separator UNC form ${source}`,()=>{
    const r=extractCompanionContent(source);assert.equal(r.sourceText,source);assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.sourceStart,t.sourceEnd,t.literal]),[["path","copy",start,end,literal]]);
  });
  for(const value of ["//","//server","//server/","//server//file","\\\\server","\\\\server\\","\\\\server\\\\file"]){
    it(`R6 rejects incomplete UNC path alternatives: ${value}`,()=>{assert.deepEqual(extractCompanionContent(value).targets,[]);assert.deepEqual(extractCompanionContent('"'+value+'"').targets,[]);assert.deepEqual(extractCompanionContent("path: `"+value+"`").targets.map(t=>t.kind),["code"]);});
  }
  for(const delta of [-1,0,1])for(const wrapper of ["",'"',"`"])it(`R6 applies the UNC 32KiB path bound ${delta}, wrapper=${wrapper}`,()=>{
    const literal="//s/t/"+"a".repeat(32762+delta),source=wrapper+literal+wrapper,r=extractCompanionContent(source);assert.equal(r.sourceText,source);
    assert.equal(r.unavailableReason,delta>0?"CANDIDATE_TOO_LARGE":null);assert.equal(r.targets.length,delta>0?0:1);if(delta<=0){assert.equal(r.targets[0]!.literal,literal);assert.equal(r.targets[0]!.sourceStart,wrapper?1:0);assert.equal(r.targets[0]!.sourceEnd,(wrapper?1:0)+32768+delta);assert.equal(r.targets[0]!.kind,"path");}
  });
});

it("R5 preserves exact command-cue precedence for a URL-shaped command body",()=>{
  const r=extractCompanionContent("Run: `https://example.com/a`");assert.deepEqual(r.targets.map(t=>[t.kind,t.literal,t.provenanceStatus,t.displayLabel]),[["command","https://example.com/a","suggested","Suggested command"]]);
});
it("R4 retains the exact ASCII review probes without oversized emitted fields",()=>{
  const source="![ "+"a".repeat(256)+"](https://host/img)",r=extractCompanionContent(source);assert.equal(r.sourceText,source);assert.equal(r.unavailableReason,"UNSUPPORTED_CONTENT");assert.equal(r.nodes[0]!.kind,"text");
  const href="https://host/"+"a".repeat(2048),link=extractCompanionContent("[x]("+href+")");assert.deepEqual(flatten(link.nodes).filter(n=>n.kind==="link").map(n=>n.href),[null]);
});

describe("companion round2 eligible prose spans and construct precedence",()=>{
  for(const literal of ["C:/a foo[b].txt","C:/a foo<b>.txt"]){
    it(`reviews the complete spaced candidate ${literal}`,()=>{const r=extractCompanionContent(literal);assert.equal(r.sourceText,literal);assert.equal(r.unavailableReason,null);assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.sourceStart,t.sourceEnd,t.literal]),[["path","review",0,15,literal]]);});
    it(`keeps the complete candidate before code: ${literal}`,()=>{const source=literal+" `echo x`",r=extractCompanionContent(source);assert.equal(r.unavailableReason,null);assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.sourceStart,t.sourceEnd,t.literal]),[["path","review",0,15,literal],["code","copy",17,23,"echo x"]]);assert.equal(flatten(r.nodes).filter(n=>n.kind==="code").length,1);});
  }
  it("preserves the separate generic-code action after a bracket candidate",()=>{const source="C:/a[b].txt `echo x`",r=extractCompanionContent(source);assert.equal(r.sourceText,source);assert.equal(r.unavailableReason,null);assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.sourceStart,t.sourceEnd,t.literal]),[["path","review",0,11,"C:/a[b].txt"],["code","copy",13,19,"echo x"]]);assert.deepEqual(flatten(r.nodes).filter(n=>n.kind==="code").map(n=>[n.text,n.targetIndex]),[["echo x",1]]);});
  it("preserves the mapped docs link and excludes its destination",()=>{const source="C:/a[b].txt [docs](https://host/x)",r=extractCompanionContent(source);assert.equal(r.sourceText,source);assert.equal(r.unavailableReason,null);assert.deepEqual(r.targets.map(t=>[t.action,t.sourceStart,t.sourceEnd,t.literal]),[["review",0,11,"C:/a[b].txt"]]);assert.deepEqual(flatten(r.nodes).filter(n=>n.kind==="link").map(n=>[n.href,n.sourceSpan]),[["https://host/x",{start:12,end:34}]]);assert.ok(flatten(r.nodes).some(n=>n.kind==="text"&&n.text==="docs"));});
  for(const [literal,end] of [["C:/a foo[b].txt",15],["C:/a foo<b>.txt",15],["C:/a[b].txt",11],["C:/a<b>.txt",11]] as const){
    it(`obeys next-root and punctuation endpoints for ${literal}`,()=>{const source=literal+", D:/b",r=extractCompanionContent(source);assert.equal(r.unavailableReason,null);assert.deepEqual(r.targets.map(t=>[t.action,t.sourceStart,t.sourceEnd,t.literal]),[["review",0,end+1,literal+","],["copy",end+2,end+6,"D:/b"]]);});
    it(`does not consume an image resource after ${literal}`,()=>{const r=extractCompanionContent(literal+" ![x](https://host/image)");assert.equal(r.unavailableReason,null);assert.deepEqual(r.targets.map(t=>t.literal),[literal]);assert.deepEqual(flatten(r.nodes).filter(n=>n.kind==="imagePlaceholder").map(n=>n.alt),["x"]);});
  }
  it("preserves both code actions around an eligible prose candidate",()=>{const r=extractCompanionContent("`one` C:/a foo[b].txt `two`");assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.literal]),[["code","copy","one"],["path","review","C:/a foo[b].txt"],["code","copy","two"]]);});
  it("retains a spaced candidate inside mapped emphasis without absorbing following code",()=>{const r=extractCompanionContent("**C:/a foo<b>.txt** `echo x`");assert.equal(r.unavailableReason,null);assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.sourceStart,t.sourceEnd,t.literal]),[["path","review",2,17,"C:/a foo<b>.txt"],["code","copy",21,27,"echo x"]]);assert.ok(flatten(r.nodes).some(n=>n.kind==="strong"));});
});

it("round2 preserves a glued path Review before an independent code action",()=>{
  for(const literal of ["C:/a`b`","C:/a foo`bar`","C:/a foo*b*"]){const r=extractCompanionContent(literal+" `echo x`");assert.equal(r.unavailableReason,null);assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.literal]),[["path","review",literal],["code","copy","echo x"]]);}
});
it("round2 preserves autolink rendering after the full eligible prose span",()=>{
  const r=extractCompanionContent("C:/a foo<b>.txt <https://host/x>");assert.equal(r.unavailableReason,null);assert.deepEqual(r.targets.map(t=>[t.action,t.literal]),[["review","C:/a foo<b>.txt"]]);assert.deepEqual(flatten(r.nodes).filter(n=>n.kind==="link").map(n=>n.href),["https://host/x"]);
});
it("round2 never admits a clear path action from an unclosed inline-code barrier",()=>{
  const source="C:/a[b].txt `C:/secret",r=extractCompanionContent(source);assert.equal(r.sourceText,source);assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.literal]),[["path","review","C:/a[b].txt"]]);
});

it("round2 keeps nested link/code barriers out of glued formatting candidates",()=>{
  const link=extractCompanionContent("C:/a*[docs](https://host/x)*");assert.equal(link.unavailableReason,null);assert.deepEqual(flatten(link.nodes).filter(n=>n.kind==="link").map(n=>n.href),["https://host/x"]);assert.ok(link.targets.every(t=>!t.literal.includes("https://host/x")));
  const code=extractCompanionContent("C:/a*`echo x`*");assert.equal(code.unavailableReason,null);assert.ok(code.targets.some(t=>t.kind==="code"&&t.literal==="echo x"&&t.action==="copy"));
});

it("round2 masks roots inside glued code while retaining its whole raw Review",()=>{
  const literal="C:/a`echo C:/b`",r=extractCompanionContent(literal+" `echo x`");assert.equal(r.unavailableReason,null);assert.deepEqual(r.targets.map(t=>[t.kind,t.action,t.sourceStart,t.sourceEnd,t.literal]),[["path","review",0,15,literal],["code","copy",17,23,"echo x"]]);
});
