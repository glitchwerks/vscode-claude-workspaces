import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";

const styles=["src/panel/webview/styles.css","src/panel/webview/composer/styles.css"]
  .map(file=>readFileSync(resolve(file),"utf8")).join("\n");

describe("composer action button themes",()=>{
  for(const theme of ["vscode-dark","vscode-light","vscode-high-contrast","vscode-high-contrast-light"]){
    it(`uses the approved action colors for Send and saved-draft Forget in ${theme}`,()=>{
      const dom=new JSDOM(`<style>${styles}</style><body class="${theme}">
        <section class="composer-pane"><div class="composer-tools"><button id="reference">Expand</button></div>
          <footer class="composer-footer"><button data-composer="send">Send</button></footer></section>
        <section class="saved-drafts"><ul class="saved-drafts-list"><li><button data-forget-draft="fixture">Forget</button></li></ul></section>
      </body>`);
      try{
        const expected=dom.window.getComputedStyle(dom.window.document.querySelector("#reference")!);
        const colors=theme==="vscode-dark"
          ?{background:"rgb(80, 80, 80)",foreground:"rgb(245, 245, 245)",border:"rgb(129, 129, 129)"}
          :{background:expected.background,foreground:expected.color,border:expected.borderColor};
        for(const selector of ["[data-composer=send]","[data-forget-draft]"]){
          const actual=dom.window.getComputedStyle(dom.window.document.querySelector(selector)!);
          assert.equal(actual.background,colors.background,`${selector} background`);
          assert.equal(actual.color,colors.foreground,`${selector} foreground`);
          assert.equal(actual.borderColor,colors.border,`${selector} border`);
          assert.equal(actual.borderRadius,expected.borderRadius);
          assert.equal(actual.padding,expected.padding);
        }
        const send=dom.window.document.querySelector<HTMLButtonElement>("[data-composer=send]")!;
        send.disabled=true;
        const disabled=dom.window.getComputedStyle(send);
        assert.equal(disabled.background,colors.background);assert.equal(disabled.opacity,"0.5");
      }finally{dom.window.close();}
    });
  }
});
