import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderComposerMarkdown } from "../../src/panel/webview/composer/markdownPreview";

describe("restricted composer Markdown preview",()=>{
  it("renders basic headings, lists, emphasis and fenced code",()=>{
    const dom=new JSDOM(renderComposerMarkdown('# Plan\n\n- **Bold** and *emphasis*\n\n```ts\nconst x = 1;\n```'));
    assert.equal(dom.window.document.querySelector("h1")?.textContent,"Plan");
    assert.equal(dom.window.document.querySelectorAll("li").length,1);
    assert.ok(dom.window.document.querySelector("strong"));assert.ok(dom.window.document.querySelector("em"));
    assert.match(dom.window.document.querySelector("pre code")?.textContent??"",/const x = 1/);
  });
  it("does not emit raw HTML, executable URLs, event attributes or remote images",()=>{
    const source='<script>alert(1)</script>\n<img src="https://example.com/private" onerror="alert(1)">\n\n[click](javascript:alert(1)) ![image](https://example.com/private.png)\n\n[encoded](jav&#x61;script:alert(1)) [data](data:text/html,evil)';
    const html=renderComposerMarkdown(source);assert.doesNotMatch(html,/<script/i);
    const document=new JSDOM(html).window.document;assert.equal(document.querySelectorAll("script,img,iframe,object,embed,style,video,audio").length,0);
    for(const element of document.querySelectorAll("*"))for(const attribute of element.attributes)assert.doesNotMatch(attribute.name,/^on|^style$/i);
    for(const link of document.querySelectorAll<HTMLAnchorElement>("a"))assert.match(link.href,/^https?:/);
    assert.match(document.body.textContent??"",/image/);
  });
  it("keeps HTTP links inert for the host to open and escapes code content",()=>{
    const document=new JSDOM(renderComposerMarkdown('[docs](https://example.com/docs)\n\n```html\n<script>bad()</script>\n```')).window.document;
    assert.equal(document.querySelector("a")?.getAttribute("href"),"https://example.com/docs");
    assert.equal(document.querySelectorAll("script").length,0);assert.match(document.querySelector("code")?.textContent??"",/<script>/);
  });
  it("declines oversize preview without changing the editable source",()=>{
    const source="x".repeat(1_048_577);assert.match(renderComposerMarkdown(source),/Preview unavailable/);assert.equal(source.length,1_048_577);
  });
});
