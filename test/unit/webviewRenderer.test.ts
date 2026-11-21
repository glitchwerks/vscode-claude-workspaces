import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { JSDOM } from "jsdom";

import {
  createSessionRenderer,
  resolveTheme,
  type RendererTerminal,
  type RendererTerminalFactory,
  type RendererWindow
} from "../../src/panel/webview/renderer";
import { decodeHostMessage, savedReplySessionIdentity, type TerminalFontMetrics, type WebviewMessage } from "../../src/panel/protocol";
import type { ManagedSessionSnapshot } from "../../src/sessions/sessionTypes";
import { createComposerView, type ComposerView, type ComposerViewOptions } from "../../src/panel/webview/composer/view";
import { composerFirstUuid, composerSecondUuid, composerSession } from "../support/composerHarness";

describe("session webview renderer", () => {
  for (const open of [true, false]) {
    it(`keeps the prompt editor ${open ? "open" : "closed"} through a composer selection reset`, () => {
      const documentId = "11111111-1111-4111-8111-111111111111";
      const alpha = { ...panelSession("alpha", "Alpha"), claudeSessionId: composerFirstUuid };
      const beta = { ...panelSession("beta", "Beta"), claudeSessionId: composerSecondUuid };
      const h = createHostedComposerHarness(documentId);
      try {
        const renderer = h.renderer;
        const toggle = h.document.querySelector<HTMLButtonElement>("[data-bottom-pane=prompt]")!;
        const pane = h.document.querySelector<HTMLElement>(".composer-pane")!;
        const more = pane.querySelector<HTMLDetailsElement>(".composer-more")!;
        const picker = pane.querySelector<HTMLElement>(".composer-picker")!;
        const preview = pane.querySelector<HTMLElement>(".composer-preview")!;
        renderer.handleMessage({ type: "hydrate", sessions: [alpha, beta], activeSessionId: alpha.id,
          resumableSessions: [], terminalFont });
        h.hydrateComposer(alpha, "Alpha draft");
        if (open) {
          pane.querySelector<HTMLButtonElement>("[data-composer=preview]")!.click();
          pane.querySelector<HTMLButtonElement>("[data-composer=commands]")!.click();
          more.open = true;
          assert.equal(picker.hidden, false);
          assert.equal(preview.hidden, false);
        } else {
          toggle.click();
        }
        renderer.handleMessage({ type: "sessionUpdated", session: { ...alpha, state: "closing" } });
        renderer.handleMessage({ type: "composerReset", documentId });
        assert.equal(h.document.defaultView!.getComputedStyle(pane).display, "none");
        assert.equal(more.open, false);
        assert.equal(picker.hidden, true);
        assert.equal(preview.hidden, true);

        renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: beta.id });
        h.terminals[1]!.element.focus();
        h.hydrateComposer(beta, "Beta draft");
        assert.equal(toggle.getAttribute("aria-expanded"), String(open));
        assert.equal(pane.hidden, !open, "The editor visibility follows the chosen bottom pane");
        assert.equal(pane.querySelector("[aria-label='Prompt draft']")?.textContent, "Beta draft");
        assert.equal(h.document.activeElement, h.terminals[1]!.element);
        assert.deepEqual(h.messages.filter(message => message.type === "composerVisibilityChanged")
          .map(message => message.visible), open ? [] : [false]);
      } finally {
        h.dispose();
      }
    });
  }

  it("keeps Escape then Tab available inside the hosted prompt draft", () => {
    const h = createHostedComposerHarness("11111111-1111-4111-8111-111111111111");
    const session = { ...panelSession("alpha", "Alpha"), claudeSessionId: composerFirstUuid };
    try {
      h.renderer.handleMessage({ type: "hydrate", sessions: [session], activeSessionId: session.id,
        resumableSessions: [], terminalFont });
      h.hydrateComposer(session, "Alpha draft");
      const pane = h.document.querySelector<HTMLElement>("#prompt-bottom-pane")!;
      const draft = pane.querySelector<HTMLElement>("[aria-label='Prompt draft']")!;
      const press = (target: HTMLElement, key: string, keyCode: number) => {
        const event = new h.document.defaultView!.KeyboardEvent("keydown", {
          key, code: key, keyCode, bubbles: true, cancelable: true
        });
        target.dispatchEvent(event);
        return event;
      };
      const commands = pane.querySelector<HTMLButtonElement>("[data-composer=commands]")!;
      commands.click();
      const search = pane.querySelector<HTMLInputElement>(".composer-picker input")!;
      assert.equal(h.document.activeElement, search);
      assert.equal(press(search, "Escape", 27).defaultPrevented, true);
      assert.ok(search.closest<HTMLElement>(".composer-picker")!.hidden);
      assert.equal(h.document.activeElement, draft);

      const more = pane.querySelector<HTMLDetailsElement>(".composer-more")!;
      const summary = more.querySelector("summary")!;
      summary.focus();
      summary.click();
      draft.focus();
      assert.equal(more.open, true);
      assert.equal(press(draft, "Escape", 27).defaultPrevented, false);
      assert.equal(more.open, false);
      assert.equal(pane.hidden, false, "The editor's focus escape must leave the pane open");
      assert.equal(h.document.activeElement, draft);
      assert.equal(press(draft, "Tab", 9).defaultPrevented, false, "Tab must retain native focus navigation");
      assert.equal(draft.textContent, "Alpha draft");

      commands.focus();
      assert.equal(press(commands, "Escape", 27).defaultPrevented, true);
      assert.equal(pane.hidden, true);
      assert.equal(h.document.activeElement, h.terminals[0]!.element);
    } finally {
      h.dispose();
    }
  });

  it("hides the previous draft while waiting for the selected session to hydrate", () => {
    let editor!: HTMLElement;
    const h = createRendererHarness(true, "Win32", {
      documentId: "11111111-1111-4111-8111-111111111111",
      createComposer: options => {
        editor = options.parent.ownerDocument.createElement("section");
        editor.className = "composer-pane";
        options.parent.append(editor);
        return {
          hydrate(message) { editor.textContent = "session" in message ? message.session.draft.text : ""; },
          handleHostMessage() {}, focusEditor() {}, setVisible() {}, dispose() {}
        };
      }
    });
    const alpha = panelSession("alpha", "Alpha");
    const beta = panelSession("beta", "Beta");
    const hydrate = (sessionId: string, text: string) => {
      const session = composerSession();
      h.renderer.handleMessage({
        type: "composerHydrate", capability: { status: "available", target: {
          sessionId, claudeSessionId: session.claudeSessionId, generation: "generation"
        }},
        session: { ...session, draft: { ...session.draft, text } },
        layout: { splitRatio: 0.4 }, visible: true, favorites: [], canSubmit: true
      });
    };
    const display = () => h.document.defaultView!.getComputedStyle(editor).display;
    try {
      h.renderer.handleMessage({type:"hydrate",sessions:[alpha,beta],activeSessionId:alpha.id,
        resumableSessions:[],terminalFont});
      hydrate(alpha.id,"Alpha draft");
      assert.equal(editor.textContent,"Alpha draft");
      h.renderer.handleMessage({type:"activeSessionChanged",activeSessionId:beta.id});
      assert.equal(display(),"none");
      hydrate(alpha.id,"Stale alpha draft");
      assert.equal(editor.textContent,"Alpha draft");
      assert.equal(display(),"none");
      hydrate(beta.id,"Beta draft");
      assert.notEqual(display(),"none");
      assert.equal(editor.textContent,"Beta draft");
    } finally { h.renderer.dispose(); }
  });
  it("keeps captured replies beside the same native terminal when alternating bottom panes", () => {
    const documentId = "11111111-1111-4111-8111-111111111111";
    const h = createRendererHarness(false, "Win32", { documentId, createComposer: () => ({
      hydrate() {}, handleHostMessage() {}, focusEditor() {}, setVisible() {}, dispose() {}
    }) });
    const alpha = panelSession("alpha", "Alpha");
    const beta = { ...panelSession("beta", "Beta"), activity: "waiting" as const };
    try {
      h.renderer.handleMessage({ type:"hydrate", sessions:[alpha,beta], activeSessionId:alpha.id, terminalFont,
        resumableSessions:[] });
      const toggle = h.document.querySelector<HTMLButtonElement>("[data-bottom-pane=reply]")!;
      assert.equal(toggle.hidden,false);
      toggle.click();
      const slot = h.document.getElementById(toggle.getAttribute("aria-controls")!)!;
      const terminal = h.stage.querySelector(".terminal-instance");
      assert.equal(slot.hidden,false);
      assert.equal(h.stage.hidden,false);
      const sourceText = "Only Alpha has this reply";
      const capture = { type:"savedReplyCaptured" as const, documentId,sessionId:alpha.id,
        identity:savedReplySessionIdentity(alpha)!,updateId:1,status:"captured" as const,
        reply:{groupId:"alpha-reply",sourceText,nodes:[{nodeId:"only",kind:"text" as const,
          sourceSpan:{start:0,end:sourceText.length},text:sourceText}],targets:[]}};
      h.terminals[0]!.element.focus();
      h.renderer.handleMessage(capture);
      assert.equal(h.document.activeElement,h.terminals[0]!.element);
      assert.match(slot.textContent!,/Only Alpha/);
      h.document.querySelector<HTMLButtonElement>("[data-bottom-pane=prompt]")!.click();
      assert.equal(slot.hidden,true);
      toggle.click();
      assert.match(slot.textContent!,/Only Alpha/);
      assert.equal(h.stage.querySelector(".terminal-instance"),terminal);
      h.renderer.handleMessage({type:"activeSessionChanged",activeSessionId:beta.id});
      h.renderer.handleMessage(capture);
      assert.doesNotMatch(slot.textContent!,/Only Alpha/);
      assert.equal(slot.hidden,false);
      const respond = [...slot.querySelectorAll("button")].find(button=>button.textContent==="Respond in terminal");
      assert.ok(respond);
      respond.click();
      assert.equal(slot.hidden,true);
      assert.equal(h.document.activeElement,h.terminals[1]!.element);
      assert.ok(!h.messages.some(message=>message.type==="input"));
    } finally { h.renderer.dispose(); }
  });
  it("opens workspace configuration directly from the header", () => {
    const harness = createRendererHarness();
    try {
      const configure = harness.document.querySelector<HTMLButtonElement>(
        ".session-rail [data-action=configureWorkspace]"
      );
      assert.ok(configure, "Configure must be reachable directly from the header");
      configure.click();
      assert.deepEqual(harness.messages.at(-1), { type: "configureWorkspace" });
    } finally {
      harness.renderer.dispose();
    }
  });

  it("toggles the prompt on the bottom bar without replacing the terminal", () => {
    const documentId = "11111111-1111-4111-8111-111111111111";
    const visibility: Array<{ visible: boolean; notifyHost: boolean }> = [];
    const h = createRendererHarness(false, "Win32", {
      documentId,
      createComposer: () => ({
        hydrate() {}, handleHostMessage() {}, focusEditor() {}, setVisible() {}, dispose() {},
        setPanelVisible(visible: boolean, options: { notifyHost: boolean }) {
          visibility.push({ visible, notifyHost: options.notifyHost });
        }
      })
    });
    const session = panelSession("alpha", "Alpha");
    try {
      h.renderer.handleMessage({ type: "hydrate", sessions: [session], resumableSessions: [],
        activeSessionId: session.id, terminalFont });
      const terminal = h.stage.querySelector(".terminal-instance");
      const prompt = h.document.querySelector<HTMLButtonElement>("[data-bottom-pane=prompt]");
      assert.ok(prompt);
      const slot = h.document.getElementById(prompt.getAttribute("aria-controls")!)!;
      assert.equal(slot.hidden, true);
      prompt.click();
      assert.equal(slot.hidden, false);
      assert.equal(prompt.getAttribute("aria-expanded"), "true");
      prompt.click();
      assert.equal(slot.hidden, true);
      assert.equal(prompt.getAttribute("aria-expanded"), "false");
      assert.deepEqual(visibility.filter(change => change.notifyHost).map(change => change.visible), [true, false]);
      assert.equal(h.stage.querySelector(".terminal-instance"), terminal);
      assert.equal(h.terminals.length, 1);
      assert.ok(!h.messages.some(message => message.type === "input"));
    } finally {
      h.renderer.dispose();
    }
  });

  it("restores the chosen pane after removing the active session and selecting a replacement", () => {
    const visibility: boolean[] = [];
    const h = createRendererHarness(false, "Win32", {
      documentId: "11111111-1111-4111-8111-111111111111",
      createComposer: () => ({
        hydrate: () => {}, handleHostMessage: () => {}, focusEditor: () => {}, setVisible: () => {}, dispose: () => {},
        setPanelVisible: (visible, options) => { if (options.notifyHost) visibility.push(visible); }
      })
    });
    const alpha = panelSession("alpha", "Alpha");
    const beta = panelSession("beta", "Beta");
    const gamma = panelSession("gamma", "Gamma");
    try {
      h.renderer.handleMessage({type: "hydrate", sessions: [alpha, beta], resumableSessions: [], activeSessionId: alpha.id, terminalFont});
      const prompt = h.document.querySelector<HTMLButtonElement>("[data-bottom-pane=prompt]")!;
      prompt.click();
      h.renderer.handleMessage({type: "sessionRemoved", sessionId: alpha.id});
      assert.equal(prompt.getAttribute("aria-expanded"), "false");
      h.renderer.handleMessage({type: "activeSessionChanged", activeSessionId: beta.id});
      assert.equal(prompt.getAttribute("aria-expanded"), "true");

      h.renderer.handleMessage({type: "sessionRemoved", sessionId: beta.id});
      assert.equal(prompt.getAttribute("aria-expanded"), "false");
      h.renderer.handleMessage({type: "sessionAdded", session: gamma});
      h.renderer.handleMessage({type: "activeSessionChanged", activeSessionId: gamma.id});
      assert.equal(prompt.getAttribute("aria-expanded"), "true");
      assert.deepEqual(visibility, [true]);
    } finally { h.renderer.dispose(); }
  });

  it("keeps the same focused session tab through background status updates", () => {
    const h = createRendererHarness();
    const alpha = panelSession("alpha", "Alpha");
    const beta = panelSession("beta", "Beta");
    try {
      h.renderer.handleMessage({type: "hydrate", sessions: [alpha, beta], resumableSessions: [], activeSessionId: alpha.id, terminalFont});
      const tab = h.document.querySelector<HTMLButtonElement>(".session-tabs [data-session-id=beta]")!;
      tab.focus();
      h.renderer.handleMessage({type: "sessionUpdated", session: {...beta, activity: "waiting"}});
      assert.equal(h.document.activeElement, tab);
      assert.match(tab.getAttribute("aria-label")!, /waiting/);
    } finally { h.renderer.dispose(); }
  });

  it("forgets the filtered row without resuming it or losing the search", () => {
    const harness = createRendererHarness();
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Migration",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/saved folders/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
    };
    const sibling = { ...saved, claudeSessionId: "22222222-2222-4222-8222-222222222222",
      rootId: "file:///beta", rootLabel: "Beta", rootPath: "D:/beta" };
    harness.renderer.handleMessage({ type: "hydrate", sessions: [], resumableSessions: [saved, sibling],
      activeSessionId: undefined, terminalFont });
    try {
      harness.document.querySelector<HTMLButtonElement>(".session-header [data-session-popup=actions]")!.click();
      harness.document.querySelector<HTMLButtonElement>("[data-session-popup=resume]")!.click();
      const search = harness.document.querySelector<HTMLInputElement>("[data-resume-search]");
      assert.ok(search);
      assert.equal(harness.document.activeElement, search);
      search.value = "SAVED FOLDERS";
      search.dispatchEvent(new harness.document.defaultView!.Event("input", { bubbles: true }));
      assert.equal(harness.document.querySelector("[data-resume-count]")?.textContent, "1 of 2 sessions");
      const forget = harness.document.querySelector<HTMLButtonElement>("[data-forget-session-id]")!;
      assert.match(forget.getAttribute("aria-label")!, /Forget Migration.*C:\/saved folders\/alpha/);
      forget.focus();
      forget.click();
      assert.deepEqual(harness.messages.slice(1), [{ type: "forgetSession", claudeSessionId: saved.claudeSessionId }]);
      assert.equal(forget.isConnected, true, "The host owns removing the record");
      harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [sibling] });
      assert.equal(search.value, "SAVED FOLDERS");
      assert.equal(harness.document.activeElement, search);
      assert.equal(harness.document.querySelector("[data-resume-count]")?.textContent, "0 of 1 sessions");
      search.value = "";
      search.dispatchEvent(new harness.document.defaultView!.Event("input", { bubbles: true }));
      harness.document.querySelector<HTMLButtonElement>("[data-resume-session-id]")!.click();
      assert.deepEqual(harness.messages.at(-1), { type: "resumeSession", claudeSessionId: sibling.claudeSessionId });
    } finally {
      harness.renderer.dispose();
    }
  });

  it("routes a saved reply copy panel without replacing or writing to the selected terminal", async () => {
    const documentId = "11111111-1111-4111-8111-111111111111";
    const companionViewId = "f".repeat(32);
    const h = createRendererHarness(false, "Win32", { documentId, companionViewId });
    const alpha = panelSession("alpha", "Alpha");
    const beta = panelSession("beta", "Beta");
    const button = (label: string) => [...h.document.querySelectorAll<HTMLButtonElement>(".saved-reply-stage button")]
      .find(element => element.textContent?.trim() === label && element.closest("[hidden]") === null);
    const bindLegacy = (sessionId: string, ordinal: number) => h.renderer.handleMessage({type:"companion",payload:{
      v:1,kind:"companion.bind",viewId:companionViewId,documentId,sessionId,generation:"generation",
      projectionId:ordinal.toString(16).padStart(32,"0"),claudeSessionId:documentId,modelRevision:0
    }});
    try {
      h.renderer.handleMessage({type:"hydrate",sessions:[alpha,beta],resumableSessions:[],activeSessionId:beta.id,terminalFont});
      await bindLegacy(beta.id, 1);
      const oldPane = h.document.querySelector<HTMLElement>(".companion-stage")!;
      h.renderer.handleMessage({type:"activeSessionChanged",activeSessionId:alpha.id});
      await bindLegacy(alpha.id, 2);
      const toggle = h.document.querySelector<HTMLButtonElement>("[data-bottom-pane=reply]")!;
      toggle.click();
      const terminal = h.terminals[0]!;
      const terminalContainer = h.stage.querySelector(".terminal-instance");
      assert.ok(terminalContainer?.contains(terminal.element));
      const terminalCount = h.terminals.length;
      const startImport = button("Import copied reply");
      assert.ok(startImport, "A running session can import a saved reply");
      startImport.click();
      assert.deepEqual(h.messages.at(-1), {type:"savedReplyImport",sessionId:alpha.id,documentId,requestId:1});
      const sourceText = "Run the checks";
      const imported = decodeHostMessage({
        type:"savedReplyImported",sessionId:alpha.id,documentId,requestId:1,
        reply:{groupId:"reply-1",sourceText,nodes:[{nodeId:"n-1",kind:"text",sourceSpan:{start:0,end:sourceText.length},text:sourceText}],targets:[]}
      });
      assert.ok(imported.ok, "The saved reply is carried by the application protocol");
      h.renderer.handleMessage(imported.value);
      assert.equal(h.stage.hidden, false);
      assert.match(h.document.body.textContent ?? "", /Imported reply — unverified/);
      assert.match(h.document.body.textContent ?? "", /Run the checks/);
      await bindLegacy(beta.id, 3);
      assert.equal(toggle.getAttribute("aria-expanded"), "true");
      assert.equal(h.stage.hidden, false, "A background legacy projection cannot hide the terminal");
      assert.equal(oldPane.hidden, true);
      const raw = button("Raw");
      assert.ok(raw);
      raw.click();
      assert.equal(h.stage.hidden, false);
      assert.equal(h.stage.querySelector(".terminal-instance"), terminalContainer);
      assert.equal(h.document.activeElement, terminal.element);
      assert.equal(terminal.disposed, false);
      assert.equal(h.terminals.length, terminalCount);
      assert.ok(!h.messages.some(message => message.type === "input"), "Import and Raw never submit the reply");

      toggle.click();
      button("Import copied reply")!.click();
      const secondRequest = h.messages.at(-1);
      assert.ok(secondRequest?.type === "savedReplyImport");
      toggle.click();
      const delayed = decodeHostMessage({
        type: "savedReplyImported", sessionId: alpha.id, documentId, requestId: secondRequest.requestId,
        reply: { groupId: "reply-2", sourceText, nodes: [], targets: [] }
      });
      assert.ok(delayed.ok);
      h.renderer.handleMessage(delayed.value);
      assert.equal(toggle.getAttribute("aria-expanded"), "false", "A delayed import cannot reopen a closed pane");
      assert.equal(h.document.activeElement, terminal.element);

      toggle.click();
      button("Import copied reply")!.click();
      const reopenedRequest = h.messages.at(-1);
      assert.ok(reopenedRequest?.type === "savedReplyImport");
      toggle.click();
      toggle.click();
      terminal.element.focus();
      assert.equal(delayed.value.type, "savedReplyImported");
      h.renderer.handleMessage({...delayed.value, requestId: reopenedRequest.requestId});
      assert.equal(toggle.getAttribute("aria-expanded"), "true");
      assert.ok(button("Raw"), "An import cannot collapse a pane reopened while it was pending");
      assert.equal(h.document.activeElement, terminal.element);

      h.renderer.handleMessage({type:"activeSessionChanged",activeSessionId:beta.id});
      h.renderer.handleMessage(imported.value);
      assert.equal(h.stage.hidden, false);
      assert.ok(!h.document.body.textContent?.includes("Run the checks"), "A delayed import cannot appear in another session");
    } finally { h.renderer.dispose(); }
  });

  it("keeps the active terminal mounted through background activity updates",()=>{
    const h=createRendererHarness();const alpha=panelSession("alpha","Alpha"),beta=panelSession("beta","Beta");
    h.renderer.handleMessage({type:"hydrate",sessions:[alpha,beta],activeSessionId:alpha.id,resumableSessions:[],terminalFont});
    const active=h.stage.firstElementChild;const observer=new h.document.defaultView!.MutationObserver(()=>{});observer.observe(h.stage,{childList:true});
    try{
      for(let i=0;i<100;i++)h.renderer.handleMessage({type:"sessionUpdated",session:{...beta,activity:i%2?"working":"waiting"}});
      assert.equal(observer.takeRecords().length,0,"Background status must not detach or reattach the active terminal");
      assert.equal(h.stage.firstElementChild,active);h.terminals[0]!.emitData("still responsive");
      assert.deepEqual(h.messages.at(-1),{type:"input",sessionId:alpha.id,data:"still responsive",isPromptSubmission:false});
    }finally{observer.disconnect();h.renderer.dispose();}
  });
  it("shows working agents even while the parent waits for input",()=>{
    const h=createRendererHarness();const alpha={...panelSession("alpha","Alpha"),activity:"waiting" as const,activeAgentCount:2};
    try{
      h.renderer.handleMessage({type:"hydrate",sessions:[alpha],activeSessionId:alpha.id,resumableSessions:[],terminalFont});
      assert.equal(h.document.querySelector(".session-tab-agents")?.textContent,"2 agents");
      assert.ok(h.document.querySelector(".session-tab-working-marker"));
      assert.match(h.document.querySelector(".session-tab")!.getAttribute("aria-label")!,/waiting.*2 agents working/);
      const cleared={...alpha,activeAgentCount:0};h.renderer.handleMessage({type:"sessionUpdated",session:cleared});
      assert.equal(h.document.querySelector(".session-tab-agents"),null);assert.equal(h.document.querySelector(".session-tab-working-marker"),null);
      assert.match(h.document.querySelector(".session-tab")!.getAttribute("aria-label")!,/waiting/);
    }finally{h.renderer.dispose();}
  });
  it("returns keyboard focus to the terminal when the already-active tab is clicked",()=>{
    const h=createRendererHarness();const alpha=panelSession("alpha","Alpha");
    h.renderer.handleMessage({type:"hydrate",sessions:[alpha],activeSessionId:alpha.id,resumableSessions:[],terminalFont});
    try{
      const tab=h.document.querySelector<HTMLButtonElement>('.session-tab[data-session-id="alpha"]')!;tab.focus();tab.click();
      assert.equal(h.document.activeElement,h.terminals[0]!.element);
    }finally{h.renderer.dispose();}
  });
  it("does not take focus from another input during a session status update",()=>{
    const h=createRendererHarness();const alpha=panelSession("alpha","Alpha");
    h.renderer.handleMessage({type:"hydrate",sessions:[alpha],activeSessionId:alpha.id,resumableSessions:[],terminalFont});
    const outside=h.document.createElement("input");h.document.body.append(outside);outside.focus();
    try{
      h.renderer.handleMessage({type:"sessionUpdated",session:{...alpha,activity:"working"}});
      assert.equal(h.document.activeElement,outside);
    }finally{h.renderer.dispose();}
  });
  it("releases the default terminal toggle key to native VS Code without consuming or dispatching it",()=>{
    const h=createRendererHarness();const alpha=panelSession("session-alpha","alpha 1");
    h.renderer.handleMessage({type:"hydrate",resumableSessions:[],sessions:[alpha],activeSessionId:alpha.id,terminalFont});
    h.stage.querySelector<HTMLElement>(".terminal-instance")!.focus();const before=h.messages.length;
    for(const type of ["keydown","keypress","keyup"]){
      const event=new h.document.defaultView!.KeyboardEvent(type,{key:"g",ctrlKey:true,bubbles:true,cancelable:true});
      assert.equal(h.terminals[0]!.emitKey(event),false);
      assert.equal(event.defaultPrevented,false);assert.equal(event.cancelBubble,false);
    }
    assert.equal(h.messages.length,before,"Only VS Code may choose the action for this key");
    for(const init of [{key:"c",ctrlKey:true},{key:"g",ctrlKey:true,shiftKey:true},{key:"g",ctrlKey:true,altKey:true},{key:"g",ctrlKey:true,metaKey:true},{key:"ArrowLeft"}]){
      assert.equal(h.terminals[0]!.emitKey(new h.document.defaultView!.KeyboardEvent("keydown",init)),true);
    }
    for(const init of [{isComposing:true},{keyCode:229}]){
      const event=new h.document.defaultView!.KeyboardEvent("keydown",{key:"g",ctrlKey:true,bubbles:true,cancelable:true,...init});
      assert.equal(h.terminals[0]!.emitKey(event),true);assert.equal(event.cancelBubble,true);
      assert.equal(event.defaultPrevented,false);
    }
    h.stage.querySelector<HTMLElement>(".terminal-instance")!.blur();
    assert.equal(h.terminals[0]!.emitKey(new h.document.defaultView!.KeyboardEvent("keydown",{key:"g",ctrlKey:true})),true);
    h.renderer.dispose();
  });
  it("preserves recovery row focus until a complete replacement snapshot arrives",()=>{
    const documentId="11111111-1111-4111-8111-111111111111";
    const h=createRendererHarness(false,"Win32",{documentId});
    const row={claudeSessionId:"22222222-2222-4222-8222-222222222222",rootId:"root",rootPath:"I:/fixture",displayName:"Draft",draftRevision:4};
    h.renderer.handleMessage({type:"composerRecoveryInvalidated",documentId,revision:1});
    const initial=h.messages.at(-1);assert.ok(initial?.type==="composerRequestRecovery");
    h.renderer.handleMessage({type:"composerRecoveryPage",documentId,requestId:initial.requestId,page:{revision:1,rows:[row]},actions:["restoreDraft"]});
    const button=h.document.querySelector<HTMLButtonElement>("[data-restore-draft]")!;button.focus();
    h.renderer.handleMessage({type:"composerRecoveryInvalidated",documentId,revision:2});
    assert.equal(h.document.activeElement,button);assert.equal(button.isConnected,true);
    const first=h.messages.at(-1);assert.ok(first?.type==="composerRequestRecovery");
    h.renderer.handleMessage({type:"composerRecoveryPage",documentId,requestId:first.requestId,page:{revision:2,rows:[],nextCursor:{revision:2,afterUuid:row.claudeSessionId}},actions:[]});
    assert.equal(h.document.activeElement,button);
    const next=h.messages.at(-1);assert.ok(next?.type==="composerRequestRecovery");
    h.renderer.handleMessage({type:"composerRecoveryPage",documentId,requestId:next.requestId,page:{revision:2,rows:[{...row,draftRevision:5}]},actions:["restoreDraft"]});
    const replacement=h.document.activeElement as HTMLButtonElement;
    assert.equal(replacement.dataset.restoreDraft,row.claudeSessionId);replacement.click();
    assert.deepEqual(h.messages.at(-1),{type:"composerRestoreDraft",documentId,claudeSessionId:row.claudeSessionId,expectedRevision:5});h.renderer.dispose();
  });
  it("drains recovery pages through empty filtered pages and rejects late page replies",()=>{
    const documentId="11111111-1111-4111-8111-111111111111";
    const h=createRendererHarness(false,"Win32",{documentId});
    h.renderer.handleMessage({type:"composerRecoveryInvalidated",documentId,revision:1});
    const request=h.messages.at(-1);assert.ok(request?.type==="composerRequestRecovery");
    const afterUuid="22222222-2222-4222-8222-222222222222";
    h.renderer.handleMessage({type:"composerRecoveryPage",documentId,requestId:request.requestId,page:{revision:1,rows:[],nextCursor:{revision:1,afterUuid}},actions:[]});
    const next=h.messages.at(-1);assert.ok(next?.type==="composerRequestRecovery");assert.deepEqual(next.cursor,{revision:1,afterUuid});
    const row={claudeSessionId:afterUuid,rootId:"root",rootPath:"I:/fixture",displayName:"Draft only",draftRevision:4};
    h.renderer.handleMessage({type:"composerRecoveryPage",documentId,requestId:next.requestId,page:{revision:1,rows:[row]},actions:["restoreDraft"]});
    const restore=h.document.querySelector<HTMLButtonElement>("[data-restore-draft]");assert.ok(restore);restore.click();
    assert.deepEqual(h.messages.at(-1),{type:"composerRestoreDraft",documentId,claudeSessionId:afterUuid,expectedRevision:4});
    h.renderer.handleMessage({type:"composerRecoveryInvalidated",documentId,revision:2});
    const current=h.messages.at(-1);assert.ok(current?.type==="composerRequestRecovery");
    h.renderer.handleMessage({type:"composerRecoveryPage",documentId,requestId:next.requestId,page:{revision:1,rows:[row]},actions:["restoreDraft"]});
    assert.equal(h.messages.at(-1),current,"stale pages cannot continue pagination");
    h.renderer.handleMessage({type:"composerRecoveryPage",documentId,requestId:current.requestId,page:{revision:2,rows:[]},actions:[]});
    assert.equal(h.document.querySelector("[data-restore-draft]"),null);h.renderer.dispose();
  });

  it("merges eligible resume rows by UUID and suppresses live saved drafts",()=>{
    const documentId="11111111-1111-4111-8111-111111111111";
    const h=createRendererHarness(false,"Win32",{documentId});
    h.renderer.handleMessage({type:"hydrate",sessions:[],activeSessionId:undefined,resumableSessions:[],terminalFont});
    const id="22222222-2222-4222-8222-222222222222";
    const row={claudeSessionId:id,rootId:"root",rootPath:"I:/fixture",displayName:"Draft only",draftRevision:4};
    h.renderer.handleMessage({type:"composerRecoveryInvalidated",documentId,revision:1});
    const request=h.messages.at(-1);assert.ok(request?.type==="composerRequestRecovery");
    h.renderer.handleMessage({type:"composerRecoveryPage",documentId,requestId:request.requestId,page:{revision:1,rows:[row]},actions:["restoreDraft"]});
    h.renderer.handleMessage({type:"resumableSessionsChanged",sessions:[{...row,rootLabel:"Root",createdAt:new Date(0).toISOString(),lastLaunchedAt:new Date(0).toISOString()}]});
    assert.equal(h.document.querySelectorAll("[data-resume-session-id]").length,1);assert.equal(h.document.querySelector("[data-restore-draft]"),null);
    h.renderer.handleMessage({type:"resumableSessionsChanged",sessions:[]});
    assert.ok(h.document.querySelector("[data-restore-draft]"));
    h.renderer.handleMessage({type:"sessionAdded",session:{...panelSession("live","Live"),claudeSessionId:id}});
    assert.equal(h.document.querySelector("[data-restore-draft]"),null);h.renderer.dispose();
  });

  it("mounts the composer below the terminal, routes composer messages and preserves its focus",()=>{
    let mounted:ComposerViewOptions|undefined;let messages=0;let disposed=false;
    const createComposer=(options:ComposerViewOptions):ComposerView=>{
      mounted=options;const pane=options.parent.ownerDocument.createElement("section");pane.className="composer-pane";
      const input=options.parent.ownerDocument.createElement("textarea");pane.append(input);options.parent.append(pane);
      return {hydrate:()=>{},handleHostMessage:()=>{messages++;options.hosted?.requestVisibility(false);},
        focusEditor:()=>input.focus(),setVisible:()=>{},dispose:()=>{disposed=true;}};
    };
    const h=createRendererHarness(false,"Win32",{documentId:"11111111-1111-4111-8111-111111111111",createComposer});
    assert.ok(mounted);
    assert.equal(mounted.hosted?.layoutHost.querySelector(".terminal-stage"),h.stage);
    assert.equal(mounted.hosted?.divider.nextElementSibling,mounted.parent);
    const session=panelSession("session-alpha","Alpha");
    h.renderer.handleMessage({type:"hydrate",sessions:[session],activeSessionId:session.id,terminalFont,resumableSessions:[]});
    h.document.querySelector<HTMLButtonElement>("[data-bottom-pane=prompt]")!.click();
    const input=h.document.querySelector<HTMLTextAreaElement>("textarea")!;input.focus();
    h.renderer.handleMessage({type:"sessionUpdated",session:{...session,activity:"working"}});
    assert.equal(h.document.activeElement,input);
    h.renderer.handleMessage({type:"composerAction",documentId:"11111111-1111-4111-8111-111111111111",action:"toggle"});
    assert.equal(messages,1);assert.equal(mounted.parent.hidden,true);
    h.renderer.dispose();assert.equal(disposed,true);
  });
  const diagnosticCaptureId = "b8cbfba0-af18-4441-b145-4c5dcdd109cf";
  const rendererDocumentId = "11111111-1111-4111-8111-111111111111";
  const terminalFont: TerminalFontMetrics = {
    fontFamily: "Cascadia Mono, monospace",
    fontSize: 14,
    letterSpacing: 1,
    lineHeight: 1.1
  };

  it("flushes a completed frontend round trip when stopped before its first one-second tick", () => {
    let monotonic = 0;
    const harness = createRendererHarness(false, "Win32", { documentId: rendererDocumentId, monotonicNow: () => monotonic });
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")], activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: diagnosticCaptureId });
    harness.terminals[0]!.emitUserData("a");
    const input = harness.messages.at(-1);
    assert.ok(input?.type === "input" && input.probe);
    monotonic = 100;
    harness.renderer.handleMessage({ type: "terminalInputAck", documentId: rendererDocumentId, sessionId: "alpha", probe: input.probe, queueMs: 1, actionMs: 1 });
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: null });
    const frame = harness.messages.find((message) => message.type === "terminalTimingWindow");
    assert.ok(frame?.type === "terminalTimingWindow");
    assert.equal(frame.frame.sessions.flatMap((session) => session.metrics).find((metric) => metric.metric === "inputRoundTripMs")?.total, 100);
    assert.deepEqual(harness.messages.at(-1), { type: "terminalDiagnosticsStopped", documentId: rendererDocumentId, captureId: diagnosticCaptureId, sequence: 1 });
    assert.equal(harness.clearedIntervalIds.length, 1);
    harness.renderer.dispose();
  });

  it("keeps diagnostic timers and tags absent until a matching capture control arrives", () => {
    const harness = createRendererHarness(false, "Win32", { documentId: rendererDocumentId });
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")], activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    harness.terminals[0]!.emitUserData("private input");
    assert.deepEqual(harness.messages.at(-1), { type: "input", sessionId: "alpha", data: "private input", isPromptSubmission: false });
    assert.ok(!harness.scheduledIntervalMilliseconds.includes(1_000));
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: diagnosticCaptureId, captureId: diagnosticCaptureId });
    assert.ok(!harness.scheduledIntervalMilliseconds.includes(1_000));
    harness.renderer.dispose();
  });

  it("correlates genuine input and separates terminal replies in payload-free frontend windows", () => {
    let monotonic = 0;
    const harness = createRendererHarness(false, "Win32", { documentId: rendererDocumentId, monotonicNow: () => monotonic });
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")], activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: diagnosticCaptureId });
    harness.terminals[0]!.emitUserData("private input");
    const input = harness.messages.at(-1);
    assert.ok(input?.type === "input" && input.probe);
    assert.deepEqual(input.probe, { captureId: diagnosticCaptureId, sequence: 1 });
    harness.terminals[0]!.emitData("private terminal reply");
    const reply = harness.messages.at(-1);
    assert.ok(reply?.type === "input");
    assert.equal(reply.probe, undefined);
    monotonic = 12;
    harness.renderer.handleMessage({ type: "terminalInputAck", documentId: rendererDocumentId, sessionId: "alpha", probe: input.probe, queueMs: 3, actionMs: 2 });
    monotonic = 1_000;
    harness.runScheduledIntervals();
    const frame = harness.messages.find((message) => message.type === "terminalTimingWindow");
    assert.ok(frame?.type === "terminalTimingWindow");
    const metrics = frame.frame.sessions.find((session) => session.sessionId === "alpha")!.metrics;
    assert.equal(metrics.find((metric) => metric.metric === "inputRoundTripMs")?.maximum, 12);
    assert.equal(metrics.find((metric) => metric.metric === "userInputCharacters")?.total, 13);
    assert.equal(metrics.find((metric) => metric.metric === "terminalReplyCharacters")?.total, 22);
    assert.ok(!JSON.stringify(frame).includes("private"));
    harness.renderer.dispose();
  });

  it("acknowledges output only after parsing and ignores callbacks from a stopped capture", () => {
    let monotonic = 0;
    const harness = createRendererHarness(false, "Win32", { documentId: rendererDocumentId, monotonicNow: () => monotonic });
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")], activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: diagnosticCaptureId });
    const probe = { captureId: diagnosticCaptureId, sequence: 1 };
    harness.renderer.handleMessage({ type: "sessionData", sessionId: "alpha", data: "private output", probe });
    assert.equal(harness.messages.some((message) => message.type === "terminalOutputAck"), false);
    monotonic = 30;
    harness.terminals[0]!.completeWrite();
    assert.deepEqual(harness.messages.at(-1), { type: "terminalOutputAck", documentId: rendererDocumentId, sessionId: "alpha", probe, parseMs: 30, pendingWrites: 0 });
    harness.renderer.handleMessage({ type: "sessionData", sessionId: "alpha", data: "later", probe: { ...probe, sequence: 2 } });
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: null });
    const count = harness.messages.length;
    harness.terminals[0]!.completeWrite();
    assert.equal(harness.messages.length, count);
    assert.ok(harness.clearedIntervalIds.length > 0);
    harness.renderer.dispose();
  });

  it("ends frontend capture at its window limit and clears its only diagnostic interval", () => {
    let monotonic = 0;
    const harness = createRendererHarness(false, "Win32", { documentId: rendererDocumentId, monotonicNow: () => monotonic });
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: diagnosticCaptureId });
    for (let index = 0; index < 300; index += 1) { monotonic += 1_000; harness.runScheduledIntervals(); }
    assert.equal(harness.messages.filter((message) => message.type === "terminalTimingWindow").length, 256);
    assert.equal(harness.clearedIntervalIds.length, 1);
    harness.renderer.dispose();
  });

  it("expires output correlations after thirty seconds even if parsing has not completed", () => {
    let monotonic = 0;
    const harness = createRendererHarness(false, "Win32", { documentId: rendererDocumentId, monotonicNow: () => monotonic });
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")], activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: diagnosticCaptureId });
    harness.renderer.handleMessage({ type: "sessionData", sessionId: "alpha", data: "output", probe: { captureId: diagnosticCaptureId, sequence: 1 } });
    monotonic = 30_000;
    harness.runScheduledIntervals();
    harness.terminals[0]!.completeWrite();
    assert.equal(harness.messages.some((message) => message.type === "terminalOutputAck"), false);
    const frame = harness.messages.find((message) => message.type === "terminalTimingWindow");
    assert.ok(frame?.type === "terminalTimingWindow");
    assert.equal(frame.frame.sessions.flatMap((session) => session.metrics).find((metric) => metric.metric === "frontendExpired")?.total, 1);
    harness.renderer.dispose();
  });

  it("samples active renderer availability and pending write pressure in frontend windows", () => {
    let monotonic = 0;
    const harness = createRendererHarness(false, "Win32", { documentId: rendererDocumentId, monotonicNow: () => monotonic });
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")], activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: diagnosticCaptureId });
    monotonic = 1_000;
    harness.runScheduledIntervals();
    const frame = harness.messages.find((message) => message.type === "terminalTimingWindow");
    assert.ok(frame?.type === "terminalTimingWindow");
    const metrics = frame.frame.sessions.find((session) => session.sessionId === "alpha")?.metrics;
    const maxima = Object.fromEntries((metrics ?? []).map((metric) => [metric.metric, metric.maximum]));
    assert.equal(maxima.rendererAvailable, 1);
    assert.equal(maxima.webglActive, 0);
    harness.renderer.dispose();
  });

  it("retains the uppercase key timestamp across a microtask and intervening terminal reply", async () => {
    let monotonic = 100;
    const harness = createRendererHarness(false, "Win32", { documentId: rendererDocumentId, monotonicNow: () => monotonic });
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")], activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: diagnosticCaptureId });
    const terminal = harness.terminals[0]!;
    terminal.emitKey(new harness.document.defaultView!.KeyboardEvent("keydown", { key: "A", shiftKey: true }));
    await Promise.resolve();
    monotonic = 103;
    terminal.emitData("terminal reply");
    monotonic = 108;
    terminal.emitKey(new harness.document.defaultView!.KeyboardEvent("keypress", { key: "A", shiftKey: true }));
    terminal.emitUserData("A");
    terminal.emitKey(new harness.document.defaultView!.KeyboardEvent("keyup", { key: "A", shiftKey: true }));
    monotonic = 1_100;
    harness.runScheduledIntervals();
    const frame = harness.messages.find((message) => message.type === "terminalTimingWindow");
    assert.ok(frame?.type === "terminalTimingWindow");
    assert.equal(frame.frame.sessions.flatMap((session) => session.metrics).find((metric) => metric.metric === "keyToInputMs")?.maximum, 8);
    harness.renderer.dispose();
  });

  for (const ending of ["keyup", "capture replacement"] as const) {
    it(`does not attribute later paste to a key retired by ${ending}`, () => {
      let monotonic = 100;
      const harness = createRendererHarness(false, "Win32", { documentId: rendererDocumentId, monotonicNow: () => monotonic });
      harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")], activeSessionId: "alpha", terminalFont, resumableSessions: [] });
      harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: diagnosticCaptureId });
      const terminal = harness.terminals[0]!;
      terminal.emitKey(new harness.document.defaultView!.KeyboardEvent("keydown", { key: "A" }));
      if (ending === "keyup") { terminal.emitKey(new harness.document.defaultView!.KeyboardEvent("keyup", { key: "A" })); }
      else { harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: "22222222-2222-4222-8222-222222222222" }); }
      monotonic = 108;
      terminal.emitUserData("pasted");
      monotonic = 1_100;
      harness.runScheduledIntervals();
      const frame = harness.messages.find((message) => message.type === "terminalTimingWindow");
      assert.ok(frame?.type === "terminalTimingWindow");
      assert.equal(frame.frame.sessions.flatMap((session) => session.metrics).find((metric) => metric.metric === "keyToInputMs"), undefined);
      harness.renderer.dispose();
    });
  }

  it("retires exited-session aggregates while preserving active-session timings", () => {
    let monotonic = 0;
    const harness = createRendererHarness(false, "Win32", { documentId: rendererDocumentId, monotonicNow: () => monotonic });
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha"), panelSession("beta", "Beta")], activeSessionId: "beta", terminalFont, resumableSessions: [] });
    harness.renderer.handleMessage({ type: "terminalDiagnostics", documentId: rendererDocumentId, captureId: diagnosticCaptureId });
    harness.terminals[1]!.emitUserData("bye");
    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: "alpha" });
    harness.terminals[0]!.emitUserData("a");
    harness.renderer.handleMessage({ type: "sessionRemoved", sessionId: "beta" });
    monotonic = 1_000;
    harness.runScheduledIntervals();
    const frame = harness.messages.find((message) => message.type === "terminalTimingWindow");
    assert.ok(frame?.type === "terminalTimingWindow");
    assert.equal(frame.frame.sessions.some((session) => session.sessionId === "beta"), false);
    assert.equal(frame.frame.sessions.find((session) => session.sessionId === "alpha")?.metrics.find((metric) => metric.metric === "userInputCharacters")?.total, 1);
    assert.equal(frame.frame.omittedSamples, 1);
    harness.renderer.dispose();
  });

  it("acknowledges inner terminal focus separately from document keyboard focus", () => {
    const harness = createRendererHarness();
    Object.defineProperty(harness.document, "hasFocus", { value: () => false });
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")],
      activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    const decoded = decodeHostMessage({ type: "focusSession", sessionId: "alpha" });
    assert.ok(decoded.ok);
    harness.renderer.handleMessage(decoded.value);
    assert.deepEqual(harness.messages.at(-1), { type: "terminalFocusResult", sessionId: "alpha",
      phase: "immediate", documentHasFocus: false, terminalHasFocus: true });
    harness.renderer.dispose();
  });

  it("reports focus lost after the request without attempting to steal it back", async () => {
    const harness = createRendererHarness();
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")],
      activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    const decoded = decodeHostMessage({ type: "focusSession", sessionId: "alpha" });
    assert.ok(decoded.ok);
    harness.renderer.handleMessage(decoded.value);
    const toggle = harness.document.querySelector<HTMLButtonElement>(".session-header [data-session-popup=actions]");
    assert.ok(toggle);
    toggle.focus();
    await new Promise<void>((resolve) => setTimeout(resolve, 550));
    const result = harness.messages.at(-1);
    assert.ok(result?.type === "terminalFocusResult");
    assert.equal(result.phase, "settled");
    assert.equal(result.terminalHasFocus, false);
    assert.equal(harness.document.activeElement, toggle);
    harness.renderer.dispose();
  });

  for (const ending of ["disposed", "inactive", "removed", "replaced"] as const) {
    it(`retires the prior focus observation when its request is ${ending}`, async () => {
      const harness = createRendererHarness();
      harness.renderer.handleMessage({ type: "hydrate", sessions: [
        panelSession("alpha", "Alpha"), panelSession("beta", "Beta")
      ], activeSessionId: "alpha", terminalFont, resumableSessions: [] });
      const focus = decodeHostMessage({ type: "focusSession", sessionId: "alpha" });
      assert.ok(focus.ok);
      harness.renderer.handleMessage(focus.value);
      if (ending === "disposed") {
        harness.renderer.dispose();
      } else if (ending === "inactive") {
        harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: "beta" });
      } else if (ending === "removed") {
        harness.renderer.handleMessage({ type: "sessionRemoved", sessionId: "alpha" });
      } else {
        harness.renderer.handleMessage(focus.value);
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 550));
      const reports = harness.messages.filter((message) => message.type === "terminalFocusResult");
      assert.deepEqual(reports.map((report) => report.phase), ending === "replaced"
        ? ["immediate", "immediate", "settled"] : ["immediate"]);
      harness.renderer.dispose();
    });
  }

  it("focuses the already-selected terminal on an explicit host request", () => {
    const harness = createRendererHarness();
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")],
      activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    const toggle = harness.document.querySelector<HTMLButtonElement>(".session-header [data-session-popup=actions]");
    assert.ok(toggle);
    toggle.focus();
    assert.equal(harness.document.activeElement, toggle);
    const decoded = decodeHostMessage({ type: "focusSession", sessionId: "alpha" });
    assert.ok(decoded.ok);
    harness.renderer.handleMessage(decoded.value);
    assert.equal(harness.document.activeElement, harness.terminals[0]!.element);
  });

  it("dismisses a session menu when a notification requests terminal focus", () => {
    const harness = createRendererHarness();
    harness.renderer.handleMessage({ type: "hydrate", sessions: [panelSession("alpha", "Alpha")],
      activeSessionId: "alpha", terminalFont, resumableSessions: [] });
    const tab = harness.document.querySelector<HTMLButtonElement>('[data-session-id="alpha"]');
    assert.ok(tab);
    tab.dispatchEvent(new harness.document.defaultView!.MouseEvent("contextmenu", {
      bubbles: true, cancelable: true, clientX: 20, clientY: 20
    }));
    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
    assert.equal(menu?.hidden, false);
    const decoded = decodeHostMessage({ type: "focusSession", sessionId: "alpha" });
    assert.ok(decoded.ok);
    harness.renderer.handleMessage(decoded.value);
    assert.equal(menu?.hidden, true);
    assert.equal(harness.document.activeElement, harness.terminals[0]!.element);
  });

  it("ignores delayed terminal-focus requests for inactive or removed sessions", () => {
    const harness = createRendererHarness();
    harness.renderer.handleMessage({ type: "hydrate", sessions: [
      panelSession("alpha", "Alpha"), panelSession("beta", "Beta")
    ], activeSessionId: "beta", terminalFont, resumableSessions: [] });
    const toggle = harness.document.querySelector<HTMLButtonElement>(".session-header [data-session-popup=actions]");
    assert.ok(toggle);
    toggle.focus();
    for (const sessionId of ["alpha", "removed"]) {
      const decoded = decodeHostMessage({ type: "focusSession", sessionId });
      assert.ok(decoded.ok);
      harness.renderer.handleMessage(decoded.value);
      assert.equal(harness.document.activeElement, toggle);
    }
  });

  it("scopes its ready handshake to the renderer document", () => {
    const harness = createRendererHarness(false, "Win32", {
      documentId: rendererDocumentId
    });

    assert.deepEqual(harness.messages, [{ type: "ready", documentId: rendererDocumentId }]);
  });

  it("renders resumable-only sessions newest first as accessible labeled buttons without terminals", () => {
    const harness = createRendererHarness(true, "Win32", {
      formatDateTime: (date) => date.toISOString()
    });
    const older = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111",
      displayName: "<Saved session>", rootId: "file:///alpha", rootLabel: "Alpha",
      rootPath: "C:/alpha", createdAt: "2026-09-01T10:00:00.000Z",
      lastLaunchedAt: "2026-09-02T10:00:00.000Z"
    };
    const newer = { ...older, claudeSessionId: "22222222-2222-4222-8222-222222222222",
      displayName: "Recent session", lastLaunchedAt: "2026-09-03T10:00:00.000Z" };
    harness.renderer.handleMessage({ type: "hydrate", sessions: [],
      activeSessionId: undefined, terminalFont, resumableSessions: [older, newer] });

    const region = harness.document.querySelector<HTMLElement>('section[aria-labelledby="resume-sessions-heading"]');
    assert.ok(region, "a separate named resume landmark is present");
    assert.equal(region.querySelector("h2")?.textContent, "Resume sessions");
    assert.ok(region.querySelector("ul"));
    const buttons = [...region.querySelectorAll<HTMLButtonElement>("[data-resume-session-id]")];
    assert.deepEqual(buttons.map((button) => button.getAttribute("aria-label")), [
      `Resume Recent session from C:/alpha. Last opened ${newer.lastLaunchedAt}.`,
      `Resume <Saved session> from C:/alpha. Last opened ${older.lastLaunchedAt}.`
    ]);
    assert.deepEqual(buttons.map((button) => button.querySelector(".resume-session-name")?.textContent),
      ["Recent session", "<Saved session>"]);
    assert.equal(buttons[1]?.querySelector(".resume-session-root")?.textContent, "Alpha · C:/alpha");
    assert.equal(buttons[1]?.querySelector(".resume-session-path")?.textContent, "C:/alpha");
    assert.equal(region.querySelector("saved"), null, "names remain literal text");
    buttons[1]!.focus();
    assert.equal(harness.document.activeElement, buttons[1]);
    buttons[1]!.querySelector<HTMLElement>(".resume-session-path")!.click();
    assert.deepEqual(harness.messages, [{ type: "ready" },
      { type: "resumeSession", claudeSessionId: "11111111-1111-4111-8111-111111111111" }]);
    assert.equal(harness.terminals.length, 0);
    assert.equal(harness.stage.querySelectorAll(".terminal-instance").length, 0);
    assert.equal(harness.document.defaultView!.getComputedStyle(
      buttons[0]!.querySelector(".resume-session-name")!
    ).textOverflow, "ellipsis");
    assert.equal(region.hidden, true);
  });

  it("renders concise relative launch ages with exact local timestamps", () => {
    const now = Date.parse("2026-09-10T12:00:00.000Z");
    const harness = createRendererHarness(false, "Win32", {
      now: () => now,
      formatDateTime: (date) => `Local ${date.toISOString()}`
    });
    const launches = [
      ["11111111-1111-4111-8111-111111111111", "2026-09-10T12:05:00.000Z", "Last opened just now"],
      ["22222222-2222-4222-8222-222222222222", "2026-09-10T11:59:30.000Z", "Last opened just now"],
      ["33333333-3333-4333-8333-333333333333", "2026-09-10T11:58:00.000Z", "Last opened 2 minutes ago"],
      ["44444444-4444-4444-8444-444444444444", "2026-09-10T09:00:00.000Z", "Last opened 3 hours ago"],
      ["55555555-5555-4555-8555-555555555555", "2026-09-06T12:00:00.000Z", "Last opened 4 days ago"]
    ] as const;
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: launches.map(([claudeSessionId, lastLaunchedAt]) => ({
        claudeSessionId,
        displayName: "Saved session",
        rootId: "file:///alpha",
        rootLabel: "Alpha",
        rootPath: "C:/alpha",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastLaunchedAt
      }))
    });

    for (const [claudeSessionId, lastLaunchedAt, relativeText] of launches) {
      const button = harness.document.querySelector<HTMLButtonElement>(
        `button[data-resume-session-id="${claudeSessionId}"]`
      );
      assert.ok(button, `resume row is visible for ${claudeSessionId}`);
      const time = button.querySelector<HTMLTimeElement>(".resume-session-time");
      assert.ok(time, `last-opened time is visible for ${claudeSessionId}`);
      assert.equal(time.textContent, relativeText);
      assert.equal(time.dateTime, lastLaunchedAt);
      assert.equal(time.title, `Last opened Local ${lastLaunchedAt}`);
      assert.match(button.getAttribute("aria-label") ?? "", new RegExp(
        `Last opened Local ${lastLaunchedAt.replaceAll(".", "\\.")}`,
        "u"
      ));
    }
  });

  it("refreshes launch ages with one timer and retires it when resume rows disappear", () => {
    let now = Date.parse("2026-09-10T12:00:30.000Z");
    const harness = createRendererHarness(false, "Win32", {
      now: () => now,
      formatDateTime: (date) => `Local ${date.toISOString()}`
    });
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111",
      displayName: "Saved session",
      rootId: "file:///alpha",
      rootLabel: "Alpha",
      rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00.000Z",
      lastLaunchedAt: "2026-09-10T12:00:00.000Z"
    };
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: [saved]
    });
    const button = harness.document.querySelector<HTMLButtonElement>(".resume-session");
    const time = button?.querySelector<HTMLTimeElement>(".resume-session-time");
    assert.ok(button);
    assert.ok(time);
    button.focus();

    assert.deepEqual(harness.scheduledIntervalMilliseconds, [60_000]);
    assert.equal(time.textContent, "Last opened just now");
    harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [saved] });
    const refreshedButton = harness.document.querySelector<HTMLButtonElement>(".resume-session");
    const refreshedTime = refreshedButton?.querySelector<HTMLTimeElement>(".resume-session-time");
    assert.ok(refreshedButton);
    assert.ok(refreshedTime);
    assert.deepEqual(harness.scheduledIntervalMilliseconds, [60_000]);
    assert.equal(harness.document.activeElement, refreshedButton);
    now = Date.parse("2026-09-10T12:02:00.000Z");
    harness.runScheduledIntervals();

    assert.equal(refreshedTime.textContent, "Last opened 2 minutes ago");
    assert.equal(harness.document.querySelector(".resume-session"), refreshedButton);
    assert.equal(harness.document.activeElement, refreshedButton);
    harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [] });
    assert.deepEqual(harness.clearedIntervalIds, [1]);
    harness.renderer.dispose();
    assert.deepEqual(harness.clearedIntervalIds, [1]);
  });

  it("keeps a resumable row usable when exact local-time formatting fails", () => {
    const lastLaunchedAt = "2026-09-10T11:00:00.000Z";
    const harness = createRendererHarness(false, "Win32", {
      now: () => Date.parse("2026-09-10T12:00:00.000Z"),
      formatDateTime: () => {
        throw new RangeError("unsupported locale");
      }
    });

    assert.doesNotThrow(() => harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: [{
        claudeSessionId: "11111111-1111-4111-8111-111111111111",
        displayName: "Saved session",
        rootId: "file:///alpha",
        rootLabel: "Alpha",
        rootPath: "C:/alpha",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastLaunchedAt
      }]
    }));

    const button = harness.document.querySelector<HTMLButtonElement>(".resume-session");
    const time = button?.querySelector<HTMLTimeElement>(".resume-session-time");
    assert.ok(button);
    assert.ok(time);
    assert.equal(time.textContent, "Last opened 1 hour ago");
    assert.equal(time.title, `Last opened ${lastLaunchedAt}`);
    assert.ok(button.title.includes(lastLaunchedAt));
    assert.ok(button.getAttribute("aria-label")?.includes(lastLaunchedAt));
    button.click();
    assert.deepEqual(harness.messages.at(-1), {
      type: "resumeSession",
      claudeSessionId: "11111111-1111-4111-8111-111111111111"
    });
  });

  it("retains seconds, milliseconds, and timezone in the default exact timestamp", () => {
    const lastLaunchedAt = "2026-09-10T12:00:30.987Z";
    const harness = createRendererHarness(false, "Win32", {
      now: () => Date.parse("2026-09-10T13:00:30.987Z")
    });
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: [{
        claudeSessionId: "11111111-1111-4111-8111-111111111111",
        displayName: "Saved session",
        rootId: "file:///alpha",
        rootLabel: "Alpha",
        rootPath: "C:/alpha",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastLaunchedAt
      }]
    });

    const time = harness.document.querySelector<HTMLTimeElement>(".resume-session-time");
    assert.ok(time);
    assert.ok(time.title.includes("30.987"), time.title);
    assert.match(time.title, /(?:GMT|UTC)(?:[+\-−]\d+(?::\d+)?)?/u);
  });

  it("keeps last-opened metadata readable in a constrained resume row", () => {
    const harness = createRendererHarness(true, "Win32", {
      now: () => Date.parse("2026-09-10T12:00:00.000Z")
    });
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: [{
        claudeSessionId: "11111111-1111-4111-8111-111111111111",
        displayName: "Saved session",
        rootId: "file:///alpha",
        rootLabel: "Alpha",
        rootPath: "C:/alpha",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastLaunchedAt: "2026-09-10T11:00:00.000Z"
      }]
    });
    const time = harness.document.querySelector<HTMLElement>(".resume-session-time");
    assert.ok(time);

    const style = harness.document.defaultView!.getComputedStyle(time);
    assert.equal(style.display, "block");
    assert.equal(style.overflow, "hidden");
    assert.equal(style.textOverflow, "ellipsis");
    assert.equal(style.whiteSpace, "nowrap");
    assert.equal(style.fontSize, "10px");
  });

  it("distinguishes duplicate resume names with their full launch paths", () => {
    const harness = createRendererHarness(true);
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const paths = ["C:/alpha", "D:/older/alpha"];
    harness.renderer.handleMessage({ type: "hydrate", sessions: [], activeSessionId: undefined,
      terminalFont, resumableSessions: ids.map((claudeSessionId, index) => ({
        claudeSessionId, displayName: "Alpha 1", rootId: "file:///alpha", rootLabel: "Alpha",
        rootPath: paths[index]!, createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
      })) });
    const buttons = [...harness.document.querySelectorAll<HTMLButtonElement>("[data-resume-session-id]")];
    assert.deepEqual(buttons.map(button => button.querySelector(".resume-session-path")?.textContent), paths);
    buttons.forEach((button, index) => {
      assert.ok(button.getAttribute("aria-label")?.includes(paths[index]!));
      assert.ok(!button.textContent?.includes(ids[index]!));
    });
    buttons[1]!.querySelector<HTMLElement>(".resume-session-path")!.click();
    assert.deepEqual(harness.messages.at(-1), { type: "resumeSession", claudeSessionId: ids[1] });
  });

  it("shows resume-session keyboard focus inside the button bounds", () => {
    // An outward-only outline can be clipped by the constrained sidebar and hide keyboard focus.
    const harness = createRendererHarness(true);
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [],
      activeSessionId: undefined,
      terminalFont,
      resumableSessions: [{
        claudeSessionId: "11111111-1111-4111-8111-111111111111",
        displayName: "Saved session",
        rootId: "file:///alpha",
        rootLabel: "Alpha",
        rootPath: "C:/alpha",
        createdAt: "2026-09-01T10:00:00.000Z",
        lastLaunchedAt: "2026-09-02T10:00:00.000Z"
      }]
    });
    const button = harness.document.querySelector<HTMLButtonElement>(".resume-session");
    assert.ok(button);

    button.focus();
    const style = harness.document.defaultView!.getComputedStyle(button);

    assert.match(style.outline, /\bsolid\b/u);
    assert.equal(style.outlineOffset, "-2px");
  });

  it("uses secondary header actions in dark themes and primary actions in light themes", () => {
    const harness = createRendererHarness(true);
    const dark = findStyleRule(
      harness.document,
      "body.vscode-dark .session-action,body.vscode-dark .composer-pane button,body.vscode-dark .saved-drafts-list [data-forget-draft],body.vscode-dark .composer-show"
    );
    const light = findStyleRule(
      harness.document,
      "body.vscode-light .session-action"
    );

    assert.equal(dark.style.background, "var(--vscode-button-secondaryBackground)");
    assert.equal(dark.style.color, "var(--vscode-button-secondaryForeground)");
    assert.equal(light.style.background, "var(--vscode-button-background)");
    assert.equal(light.style.color, "var(--vscode-button-foreground)");
    assert.equal(dark.selectorText.includes(".session-tab"), false);
    assert.equal(light.selectorText.includes(".resume-session"), false);
  });

  it("outlines session action controls when their background blends into the panel", () => {
    const harness = createRendererHarness(true);
    const rule = findStyleRule(harness.document, ".session-action");
    assert.equal(rule.style.borderColor,
      "color-mix(in srgb, var(--vscode-foreground) 25%, transparent)");
  });

  it("renders independent activity markers with matching accessible status text", () => {
    // Dropping the running-state guard would expose stale indicators while a session closes.
    const harness = createRendererHarness();
    const idle = panelSession("idle", "Idle");
    const working = { ...panelSession("working", "Working"), activity: "working" as const };
    const unread = {
      ...panelSession("unread", "Unread"),
      activity: "waiting" as const,
      hasUnreadResponse: true
    };
    const closing = {
      ...panelSession("closing", "Closing"),
      state: "closing" as const,
      activity: "working" as const,
      hasUnreadResponse: true
    };

    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [idle, working, unread, closing],
      resumableSessions: [],
      activeSessionId: idle.id,
      terminalFont
    });

    const idleTab = harness.document.querySelector<HTMLButtonElement>('[data-session-id="idle"]')!;
    const workingTab = harness.document.querySelector<HTMLButtonElement>('[data-session-id="working"]')!;
    const unreadTab = harness.document.querySelector<HTMLButtonElement>('[data-session-id="unread"]')!;
    const closingTab = harness.document.querySelector<HTMLButtonElement>('[data-session-id="closing"]')!;
    assert.equal(workingTab.querySelectorAll(".session-tab-working-marker").length, 1);
    assert.equal(unreadTab.querySelectorAll(".session-tab-unread-marker").length, 1);
    assert.equal(idleTab.querySelector(".session-tab-working-marker, .session-tab-unread-marker"), null);
    assert.equal(closingTab.querySelector(".session-tab-working-marker, .session-tab-unread-marker"), null);
    assert.equal(idleTab.getAttribute("aria-selected"), "true");
    assert.equal(workingTab.getAttribute("aria-selected"), "false");
    assert.equal(unreadTab.getAttribute("aria-selected"), "false");
    assert.equal(workingTab.getAttribute("aria-label"), "Working — working");
    assert.equal(workingTab.title, "Working — working");
    assert.equal(unreadTab.getAttribute("aria-label"), "Unread — waiting — unread response");
    assert.equal(unreadTab.title, "Unread — waiting — unread response");
  });

  it("replaces and clears activity markers without changing tab selection", () => {
    // Coupling attention state to selection would make background updates activate a tab.
    const harness = createRendererHarness();
    const idle = panelSession("idle", "Idle");
    const working = { ...panelSession("working", "Working"), activity: "working" as const };
    harness.renderer.handleMessage({
      type: "hydrate",
      sessions: [idle, working],
      resumableSessions: [],
      activeSessionId: idle.id,
      terminalFont
    });

    harness.renderer.handleMessage({
      type: "sessionUpdated",
      session: { ...working, activity: "waiting", hasUnreadResponse: true }
    });

    let workingTab = harness.document.querySelector<HTMLButtonElement>('[data-session-id="working"]')!;
    assert.equal(workingTab.querySelector(".session-tab-working-marker"), null);
    assert.ok(workingTab.querySelector(".session-tab-unread-marker"));
    assert.equal(workingTab.getAttribute("aria-selected"), "false");

    harness.renderer.handleMessage({
      type: "sessionUpdated",
      session: { ...working, activity: "waiting", hasUnreadResponse: false }
    });

    workingTab = harness.document.querySelector<HTMLButtonElement>('[data-session-id="working"]')!;
    assert.equal(workingTab.querySelector(".session-tab-unread-marker"), null);
    assert.equal(workingTab.getAttribute("aria-selected"), "false");
    assert.equal(
      harness.document.querySelector('[data-session-id="idle"]')?.getAttribute("aria-selected"),
      "true"
    );
  });

  it("keeps action focus and high-contrast borders inside each button", () => {
    const harness = createRendererHarness(true);
    const action = harness.document.querySelector<HTMLButtonElement>(".session-action");
    assert.ok(action);

    action.focus();
    const style = harness.document.defaultView!.getComputedStyle(action);
    const highContrast = findStyleRule(
      harness.document,
      "body.vscode-high-contrast .session-action,body.vscode-high-contrast .composer-pane button,body.vscode-high-contrast .saved-drafts-list [data-forget-draft],body.vscode-high-contrast .composer-show"
    );
    assert.equal(highContrast.style.borderColor, "var(--vscode-button-border)");
    assert.equal(style.outlineOffset, "-2px");
  });

  it("updates the resume region independently and keeps terminal focus and lifetime intact", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "Live");
    harness.renderer.handleMessage({ type: "hydrate", sessions: [alpha],
      activeSessionId: alpha.id, terminalFont, resumableSessions: [] });
    const region = harness.document.querySelector<HTMLElement>('section[aria-labelledby="resume-sessions-heading"]');
    assert.ok(region);
    assert.equal(region.querySelectorAll("[data-resume-session-id]").length, 0);
    assert.equal(region.querySelector<HTMLElement>(".resume-sessions-empty")?.hidden, false);
    const focused = harness.document.activeElement;
    const saved = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Saved",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-02T10:00:00Z"
    };
    harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [saved] });
    assert.equal(region.querySelectorAll("[data-resume-session-id]").length, 1);
    assert.equal(region.querySelector<HTMLElement>(".resume-sessions-empty")?.hidden, true);
    assert.equal(harness.document.activeElement, focused);
    harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [] });
    assert.equal(region.querySelectorAll("[data-resume-session-id]").length, 0);
    assert.equal(region.querySelector<HTMLElement>(".resume-sessions-empty")?.hidden, false);
    assert.equal(harness.terminals.length, 1);
    assert.equal(harness.terminals[0]?.disposed, false);
    assert.equal(harness.document.activeElement, focused);
  });

  describe("resume keyboard focus", () => {
    const alpha = {
      claudeSessionId: "11111111-1111-4111-8111-111111111111", displayName: "Alpha session",
      rootId: "file:///alpha", rootLabel: "Alpha", rootPath: "C:/alpha",
      createdAt: "2026-09-01T10:00:00Z", lastLaunchedAt: "2026-09-03T10:00:00Z"
    };
    const beta = { ...alpha, claudeSessionId: "22222222-2222-4222-8222-222222222222",
      displayName: "Beta session", lastLaunchedAt: "2026-09-02T10:00:00Z" };
    const gamma = { ...alpha, claudeSessionId: "33333333-3333-4333-8333-333333333333",
      displayName: "Gamma session", lastLaunchedAt: "2026-09-01T10:00:00Z" };

    it("keeps focus on the same resumable UUID when incremental updates reorder its row", () => {
      const harness = createRendererHarness();
      harness.renderer.handleMessage({ type: "hydrate", sessions: [], resumableSessions: [alpha, beta],
        activeSessionId: undefined, terminalFont });
      harness.document.querySelector<HTMLButtonElement>(
        `button[data-resume-session-id="${alpha.claudeSessionId}"]`
      )!.focus();

      harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: [
        { ...beta, lastLaunchedAt: "2026-09-04T10:00:00Z" }, alpha
      ] });

      const focused = harness.document.activeElement as HTMLButtonElement;
      assert.equal(focused.dataset.resumeSessionId, "11111111-1111-4111-8111-111111111111");
      assert.equal(focused.isConnected, true);
      focused.click();
      assert.deepEqual(harness.messages, [{ type: "ready" }, {
        type: "resumeSession", claudeSessionId: "11111111-1111-4111-8111-111111111111"
      }]);
      assert.equal(harness.terminals.length, 0);
    });

    for (const scenario of [
      { name: "the next row when a middle row disappears", selected: beta,
        remaining: [alpha, gamma], expectedLabel: "Resume Gamma session from C:/alpha" },
      { name: "the previous row when the final row disappears", selected: gamma,
        remaining: [alpha, beta], expectedLabel: "Resume Beta session from C:/alpha" },
      { name: "the search when no resume rows remain", selected: alpha,
        remaining: [], expectedLabel: "Search sessions by name or folder" }
    ]) {
      it(`moves focus to ${scenario.name}`, () => {
        const harness = createRendererHarness();
        harness.renderer.handleMessage({ type: "hydrate", sessions: [],
          resumableSessions: [alpha, beta, gamma], activeSessionId: undefined, terminalFont });
        harness.document.querySelector<HTMLButtonElement>(
          `button[data-resume-session-id="${scenario.selected.claudeSessionId}"]`
        )!.focus();

        harness.renderer.handleMessage({ type: "resumableSessionsChanged", sessions: scenario.remaining });

        assert.ok(harness.document.activeElement?.getAttribute("aria-label")?.startsWith(
          scenario.expectedLabel
        ));
        assert.equal(harness.document.activeElement?.isConnected, true);
        assert.deepEqual(harness.messages, [{ type: "ready" }], "focus recovery must not launch a session");
        assert.equal(harness.terminals.length, 0);
      });
    }
  });

  it("shows the active session's launch root and exact add-dir paths in an accessible popup", () => {
    const harness = createRendererHarness();
    const alpha = {
      ...panelSession("session-alpha", "alpha 1", [
        "C:\\workspace\\shared one",
        "D:\\workspace\\shared-two"
      ]),
      launchedRootLabel: "Alpha",
      launchedRootPath: "C:\\workspace\\alpha"
    };
    const beta = panelSession("session-beta", "beta 1");

    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });

    const details = harness.document.querySelector<HTMLElement>(".session-details");
    const trigger = harness.document.querySelector<HTMLButtonElement>("[data-session-popup=details]");
    const paths = [...(details?.querySelectorAll<HTMLElement>(".session-details-path") ?? [])];
    assert.equal(details?.hidden, true);
    assert.equal(details?.getAttribute("role"), "dialog");
    assert.equal(trigger?.getAttribute("aria-controls"), details?.id);
    assert.equal(
      details?.querySelector(".session-details-list")?.getAttribute("aria-label"),
      "Directories added to this session"
    );
    assert.equal(trigger?.textContent?.trim(), "Launch details — Added directories (2)");
    assert.equal(details?.querySelector(".session-launch-root-label")?.textContent, "Alpha");
    assert.equal(
      details?.querySelector(".session-launch-root-path")?.textContent,
      "C:\\workspace\\alpha"
    );
    assert.equal(
      details?.querySelector(".session-launch-root-path")?.getAttribute("title"),
      "C:\\workspace\\alpha"
    );
    assert.match(
      details?.querySelector(".session-launch-root")?.textContent ?? "",
      /Working directory when this session started/
    );
    assert.deepEqual(paths.map((path) => path.textContent), [
      "C:\\workspace\\shared one",
      "D:\\workspace\\shared-two"
    ]);
    assert.deepEqual(paths.map((path) => path.title), [
      "C:\\workspace\\shared one",
      "D:\\workspace\\shared-two"
    ]);
    assert.equal(details?.querySelector<HTMLElement>(".session-details-empty")?.hidden, true);
  });

  it("retains renamed launch identity and switches launch details immediately", () => {
    const harness = createRendererHarness();
    const alpha = {
      ...panelSession("session-alpha", "alpha 1", ["C:\\workspace\\shared"]),
      launchedRootLabel: "Alpha",
      launchedRootPath: "C:\\workspace\\alpha"
    };
    const beta = {
      ...panelSession("session-beta", "beta 1"),
      launchedRootLabel: "Beta",
      launchedRootPath: "D:\\workspace\\beta"
    };
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });

    harness.renderer.handleMessage({
      type: "sessionUpdated",
      session: { ...alpha, displayName: "Renamed Alpha" }
    });

    const details = harness.document.querySelector<HTMLElement>(".session-details");
    assert.equal(details?.querySelector(".session-launch-root-label")?.textContent, "Alpha");
    assert.equal(details?.querySelector(".session-launch-root-path")?.textContent, "C:\\workspace\\alpha");
    assert.equal(
      details?.querySelector(".session-launch-root-path")?.getAttribute("title"),
      "C:\\workspace\\alpha"
    );

    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: beta.id });

    assert.equal(
      harness.document.querySelector("[data-session-popup=details]")?.textContent?.trim(),
      "Launch details — Added directories (0)"
    );
    assert.equal(details?.querySelector(".session-launch-root-label")?.textContent, "Beta");
    assert.equal(details?.querySelector(".session-launch-root-path")?.textContent, "D:\\workspace\\beta");
    assert.equal(details?.querySelector(".session-launch-root-path")?.getAttribute("title"), "D:\\workspace\\beta");
    assert.equal(details?.querySelectorAll(".session-details-path").length, 0);
    assert.equal(
      details?.querySelector<HTMLElement>(".session-details-empty")?.textContent?.trim(),
      "No added directories."
    );
    assert.equal(details?.querySelector<HTMLElement>(".session-details-empty")?.hidden, false);
  });

  it("opens launch details as an overlay, dismisses it, and restores focus without sending terminal input", () => {
    const harness = createRendererHarness(true);
    const alpha = panelSession("alpha", "Alpha");
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha],
      activeSessionId: alpha.id, terminalFont });
    const details = harness.document.querySelector<HTMLElement>(".session-details")!;
    const trigger = harness.document.querySelector<HTMLButtonElement>("[data-session-popup=details]");
    assert.ok(trigger, "Launch details needs a popup trigger");
    const actions = harness.document.querySelector<HTMLButtonElement>("[data-session-popup=actions]")!;
    const close = details.querySelector<HTMLButtonElement>("[data-session-popup=close]")!;
    const window = harness.document.defaultView!;
    assert.equal(details.hidden, true);
    actions.click();
    trigger.click();
    assert.equal(harness.document.getElementById("session-actions")?.hidden, true);
    assert.equal(details.hidden, false);
    const detailsStyle = window.getComputedStyle(details);
    assert.equal(detailsStyle.position, "absolute");
    assert.equal(detailsStyle.insetInlineStart, "6px");
    assert.equal(detailsStyle.insetInlineEnd, "auto");
    assert.equal(trigger.getAttribute("aria-expanded"), "true");
    assert.equal(harness.document.activeElement, close);
    close.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    assert.equal(details.hidden, true);
    assert.equal(trigger.getAttribute("aria-expanded"), "false");
    assert.equal(harness.document.activeElement, trigger);
    trigger.click();
    close.click();
    assert.equal(harness.document.activeElement, trigger);
    trigger.click();
    const terminal = harness.terminals[0]!.element;
    terminal.focus();
    terminal.click();
    assert.equal(details.hidden, true);
    assert.equal(harness.document.activeElement, terminal);
    assert.deepEqual(harness.messages, [{ type: "ready" }]);
  });

  it("right-aligns the header actions and preserves the split Bottom Bar controls", () => {
    const harness = createRendererHarness(true);
    const style = (selector: string) => harness.document.defaultView!.getComputedStyle(harness.document.querySelector(selector)!);
    assert.equal(style(".session-header").justifyContent, "flex-end");
    assert.equal(style(".bottom-bar").justifyContent, "space-between");
  });

  it("keeps only the active terminal canvas attached while retaining session output", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");

    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    harness.renderer.handleMessage({ type: "sessionData", sessionId: beta.id, data: "beta ready" });
    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: beta.id });

    assert.equal(harness.stage.querySelectorAll(".terminal-instance").length, 1);
    assert.equal(harness.stage.querySelector(".terminal-instance")?.getAttribute("data-session-id"), beta.id);
    assert.deepEqual(harness.terminals[1]?.writes, ["beta ready"]);

    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: alpha.id });
    assert.equal(harness.stage.querySelectorAll(".terminal-instance").length, 1);
    assert.equal(harness.stage.querySelector(".terminal-instance")?.getAttribute("data-session-id"), alpha.id);
    assert.deepEqual(harness.terminals[1]?.writes, ["beta ready"]);

    harness.renderer.handleMessage({ type: "sessionRemoved", sessionId: beta.id });
    assert.equal(harness.terminals[1]?.disposed, true);
  });

  it("restarts a newly selected tab before the host acknowledges its activation", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");

    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    harness.document.querySelector<HTMLElement>(`[data-session-id="${beta.id}"]`)?.click();
    harness.document.querySelector<HTMLElement>("[data-action=restartFresh]")?.click();

    assert.deepEqual(harness.messages.slice(1), [
      { type: "selectSession", sessionId: beta.id },
      { type: "restartFresh", sessionId: beta.id }
    ]);
  });

  it("opens a rename context menu for the right-clicked session tab", () => {
    // Targeting the active session instead of the clicked tab would rename the wrong concurrent task.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    const betaTab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${beta.id}"]`
    );
    assert.ok(betaTab);

    const contextMenu = new harness.document.defaultView!.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 36
    });
    betaTab.dispatchEvent(contextMenu);
    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
    const rename = menu?.querySelector<HTMLButtonElement>("[data-context-action=renameSession]");

    assert.equal(contextMenu.defaultPrevented, true);
    assert.equal(menu?.hidden, false);
    assert.equal(menu?.getAttribute("role"), "menu");
    assert.equal(rename?.getAttribute("role"), "menuitem");
    assert.equal(harness.document.activeElement, rename);
    assert.equal(betaTab.getAttribute("aria-expanded"), "true");

    rename?.click();

    assert.equal(menu?.hidden, true);
    assert.deepEqual(harness.messages.slice(1), [
      { type: "requestRenameSession", sessionId: beta.id }
    ]);
  });

  it("closes the right-clicked live tab without selecting it", () => {
    // Using the active session id here would close the wrong concurrent task.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    const betaTab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${beta.id}"]`
    );
    assert.ok(betaTab);

    betaTab.dispatchEvent(new harness.document.defaultView!.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 24,
      clientY: 36
    }));
    const close = harness.document.querySelector<HTMLButtonElement>(
      "[data-context-action=closeSession]"
    );
    assert.ok(close);
    assert.equal(close.hidden, false);
    assert.equal(close.disabled, false);
    assert.equal(close.getAttribute("role"), "menuitem");

    close.click();

    assert.deepEqual(harness.messages.slice(1), [
      { type: "closeSession", sessionId: beta.id }
    ]);
  });

  it("closes the keyboard-targeted starting session with either menu key", () => {
    // Keyboard invocation must preserve the focused tab identity through the shared menu.
    for (const keyboard of [
      { key: "F10", shiftKey: true },
      { key: "ContextMenu", shiftKey: false }
    ]) {
      const harness = createRendererHarness();
      const alpha = panelSession("session-alpha", "alpha 1");
      const beta = { ...panelSession("session-beta", "beta 1"), state: "starting" as const };
      harness.renderer.handleMessage({
        type: "hydrate",
        resumableSessions: [],
        sessions: [alpha, beta],
        activeSessionId: alpha.id,
        terminalFont
      });
      const betaTab = harness.document.querySelector<HTMLButtonElement>(
        `[data-session-id="${beta.id}"]`
      );
      assert.ok(betaTab);
      betaTab.focus();

      betaTab.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
        ...keyboard,
        bubbles: true,
        cancelable: true
      }));
      const close = harness.document.querySelector<HTMLButtonElement>(
        "[data-context-action=closeSession]"
      );
      const rename = harness.document.querySelector<HTMLButtonElement>(
        "[data-context-action=renameSession]"
      );
      assert.ok(close);
      assert.ok(rename);
      assert.equal(close.disabled, false);
      assert.equal(harness.document.activeElement, rename);
      rename.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
        key: "ArrowDown",
        bubbles: true,
        cancelable: true
      }));
      assert.equal(harness.document.activeElement, close);
      close.click();

      assert.deepEqual(harness.messages.slice(1), [
        { type: "closeSession", sessionId: beta.id }
      ]);
    }
  });

  it("preserves a focused menu action across unrelated updates", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    const betaTab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${beta.id}"]`
    );
    assert.ok(betaTab);
    betaTab.dispatchEvent(new harness.document.defaultView!.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    }));
    const rename = harness.document.querySelector<HTMLButtonElement>(
      "[data-context-action=renameSession]"
    );
    const close = harness.document.querySelector<HTMLButtonElement>(
      "[data-context-action=closeSession]"
    );
    assert.ok(rename);
    assert.ok(close);
    rename.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "ArrowUp",
      bubbles: true,
      cancelable: true
    }));
    assert.equal(harness.document.activeElement, close);
    close.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "Home",
      bubbles: true,
      cancelable: true
    }));
    assert.equal(harness.document.activeElement, rename);
    rename.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "End",
      bubbles: true,
      cancelable: true
    }));
    assert.equal(harness.document.activeElement, close);

    harness.renderer.handleMessage({
      type: "sessionUpdated",
      session: { ...alpha, displayName: "alpha updated" }
    });

    assert.equal(harness.document.activeElement, close);
  });

  it("dismisses the live-session menu when Tab moves focus away", () => {
    for (const shiftKey of [false, true]) {
      const harness = createRendererHarness();
      const session = panelSession("session-alpha", "alpha 1");
      harness.renderer.handleMessage({
        type: "hydrate",
        resumableSessions: [],
        sessions: [session],
        activeSessionId: session.id,
        terminalFont
      });
      const tab = harness.document.querySelector<HTMLButtonElement>(
        `[data-session-id="${session.id}"]`
      );
      assert.ok(tab);
      tab.dispatchEvent(new harness.document.defaultView!.MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true
      }));
      const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
      const close = menu?.querySelector<HTMLButtonElement>("[data-context-action=closeSession]");
      assert.ok(menu);
      assert.ok(close);
      close.focus();
      const tabKey = new harness.document.defaultView!.KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey,
        bubbles: true,
        cancelable: true
      });

      close.dispatchEvent(tabKey);

      assert.equal(tabKey.defaultPrevented, false);
      assert.equal(menu.hidden, true);
      assert.equal(tab.getAttribute("aria-expanded"), "false");
    }
  });

  it("disables close as its menu target enters closing and dismisses on removal", () => {
    // A stale action must not be redirected to whichever session remains active.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    const betaTab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${beta.id}"]`
    );
    assert.ok(betaTab);
    betaTab.dispatchEvent(new harness.document.defaultView!.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true
    }));
    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
    const close = menu?.querySelector<HTMLButtonElement>("[data-context-action=closeSession]");
    assert.ok(menu);
    assert.ok(close);
    close.focus();

    harness.renderer.handleMessage({
      type: "sessionUpdated",
      session: { ...beta, state: "closing" }
    });
    assert.equal(menu.hidden, false);
    assert.equal(close.disabled, true);
    assert.equal(
      harness.document.activeElement,
      menu.querySelector("[data-context-action=renameSession]")
    );

    harness.renderer.handleMessage({ type: "sessionRemoved", sessionId: beta.id });
    assert.equal(menu.hidden, true);
    assert.deepEqual(harness.messages.slice(1), []);
  });

  it("opens and dismisses the session rename menu from the keyboard", () => {
    // A mouse-only context menu would make session renaming inaccessible to keyboard users.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    const tab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${alpha.id}"]`
    );
    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
    const rename = menu?.querySelector<HTMLButtonElement>("[data-context-action=renameSession]");
    assert.ok(tab);
    assert.ok(menu);
    assert.ok(rename);
    tab.focus();

    tab.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "F10",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));
    assert.equal(menu.hidden, false);
    assert.equal(harness.document.activeElement, rename);

    rename.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true
    }));
    assert.equal(menu.hidden, true);
    assert.equal(harness.document.activeElement, tab);

    tab.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "ContextMenu",
      bubbles: true,
      cancelable: true
    }));
    rename.click();
    assert.deepEqual(harness.messages.slice(1), [
      { type: "requestRenameSession", sessionId: alpha.id }
    ]);
  });

  it("keeps an open rename menu operable across live session updates", () => {
    // A lifecycle rerender that refocuses xterm strands keyboard users outside the visible menu.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    const tab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${alpha.id}"]`
    );
    assert.ok(tab);
    tab.dispatchEvent(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "F10",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    }));

    harness.renderer.handleMessage({
      type: "sessionUpdated",
      session: { ...alpha, state: "closing" }
    });

    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
    const rename = menu?.querySelector<HTMLButtonElement>("[data-context-action=renameSession]");
    assert.equal(menu?.hidden, false);
    assert.equal(harness.document.activeElement, rename);
    rename?.click();
    assert.deepEqual(harness.messages.slice(1), [
      { type: "requestRenameSession", sessionId: alpha.id }
    ]);
  });

  it("keeps the rename menu inside the webview viewport", () => {
    // Directly using pointer coordinates can clip the only menu action at the right or bottom edge.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    const tab = harness.document.querySelector<HTMLButtonElement>(
      `[data-session-id="${alpha.id}"]`
    );
    const menu = harness.document.querySelector<HTMLElement>("[data-session-context-menu]");
    assert.ok(tab);
    assert.ok(menu);
    Object.defineProperties(harness.document.documentElement, {
      clientWidth: { value: 100, configurable: true },
      clientHeight: { value: 80, configurable: true }
    });
    Object.defineProperties(menu, {
      offsetWidth: { value: 60, configurable: true },
      offsetHeight: { value: 30, configurable: true }
    });

    tab.dispatchEvent(new harness.document.defaultView!.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 90,
      clientY: 75
    }));

    assert.equal(menu.style.left, "40px");
    assert.equal(menu.style.top, "50px");
  });

  it("lets IME Escape pass through Resume and restores trigger focus on ordinary Escape", () => {
    const harness = createRendererHarness();
    try {
      const actions = harness.document.querySelector<HTMLButtonElement>(".session-header [data-session-popup=actions]")!;
      const resume = harness.document.querySelector<HTMLButtonElement>("[data-session-popup=resume]")!;
      const popup = harness.document.querySelector<HTMLElement>("#resume-sessions")!;
      const search = popup.querySelector<HTMLInputElement>("[data-resume-search]")!;
      actions.click();
      assert.equal(harness.document.activeElement, resume);
      resume.click();
      assert.equal(popup.hidden, false);
      assert.equal(harness.document.activeElement, search);
      for (const composition of [{ isComposing: true }, { keyCode: 229 }]) {
        const escape = new harness.document.defaultView!.KeyboardEvent("keydown", {
          key: "Escape", bubbles: true, cancelable: true, ...composition
        });
        search.dispatchEvent(escape);
        assert.equal(escape.defaultPrevented, false);
        assert.equal(popup.hidden, false);
        assert.equal(harness.document.activeElement, search);
      }
      const escape = new harness.document.defaultView!.KeyboardEvent("keydown", {
        key: "Escape", bubbles: true, cancelable: true
      });
      search.dispatchEvent(escape);
      assert.equal(escape.defaultPrevented, true);
      assert.equal(popup.hidden, true);
      assert.equal(harness.document.activeElement, actions);
    } finally {
      harness.renderer.dispose();
    }
  });

  it("keeps the focused live session in the Sessions picker after an activity update", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("alpha", "Alpha");
    const beta = panelSession("beta", "Beta");
    harness.renderer.handleMessage({ type: "hydrate", sessions: [alpha, beta], activeSessionId: alpha.id,
      resumableSessions: [], terminalFont });
    harness.document.querySelector<HTMLButtonElement>("[data-session-popup=sessions]")!.click();
    harness.document.querySelector<HTMLButtonElement>(".session-picker-tabs [data-session-id=beta]")!.focus();
    harness.renderer.handleMessage({ type: "sessionUpdated", session: { ...beta, activity: "waiting" } });
    assert.equal((harness.document.activeElement as HTMLElement).dataset.sessionId, beta.id);
    assert.match(harness.document.activeElement!.getAttribute("aria-label")!, /Beta.*waiting/);
    (harness.document.activeElement as HTMLButtonElement).click();
    assert.deepEqual(harness.messages.at(-1), { type: "selectSession", sessionId: beta.id });
    assert.equal(harness.document.querySelector<HTMLElement>("#session-picker")?.hidden, true);
  });

  it("truncates expanded labels while retaining full hover and accessible action names", () => {
    const harness = createRendererHarness(true);
    const button = harness.document.querySelector<HTMLButtonElement>("[data-action=configureWorkspace]");
    assert.ok(button);
    const label = button.querySelector<HTMLElement>(".session-action-label");
    assert.ok(label);
    const style = harness.document.defaultView!.getComputedStyle(label);
    assert.equal(style.overflow, "hidden");
    assert.equal(style.textOverflow, "ellipsis");
    assert.equal(button.title, "Configure");
    assert.equal(button.getAttribute("aria-label"), button.title);
  });

  it("uses a distinct directory icon for New in Folder", () => {
    const harness = createRendererHarness(true);
    const newSession = harness.document.querySelector<HTMLButtonElement>(
      "[data-action=newSession]"
    );
    const newInFolder = harness.document.querySelector<HTMLButtonElement>(
      "[data-action=newInFolder]"
    );
    const closeSession = harness.document.querySelector<HTMLButtonElement>(
      "[data-action=closeSession]"
    );
    assert.ok(newSession);
    assert.ok(newInFolder);
    assert.ok(closeSession);

    const iconText = (button: HTMLButtonElement): string | null =>
      button.querySelector(".session-action-icon")?.textContent ?? null;

    assert.equal(iconText(newInFolder), "⌂");
    assert.notEqual(iconText(newInFolder), iconText(newSession));
    assert.notEqual(iconText(newInFolder), iconText(closeSession));
    assert.equal(newInFolder.getAttribute("aria-label"), "New in Folder…");
    assert.equal(newInFolder.title, "New in Folder…");
  });

  it("dispatches Actions commands when their icon receives the click", () => {
    // Event delegation that reads only the direct target loses actions when nested icons receive the click.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });

    harness.document.querySelector<HTMLElement>(".session-header [data-session-popup=actions]")?.click();
    harness.document.querySelector<HTMLElement>("[data-action=restartFresh] .session-action-icon")?.click();
    harness.document.querySelector<HTMLElement>(".session-header [data-session-popup=actions]")?.click();
    harness.document.querySelector<HTMLElement>("[data-action=nextSession] .session-action-icon")?.click();

    assert.deepEqual(harness.messages.slice(1), [
      { type: "restartFresh", sessionId: alpha.id },
      { type: "nextSession" }
    ]);
  });

  it("does not select a session when terminal content is clicked", () => {
    // Delegating all data-session-id ancestors treats the terminal container as a session tab.
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });

    harness.terminals[0]?.element.click();

    assert.deepEqual(harness.messages, [{ type: "ready" }]);
  });

  it("gives the terminal the full width while Actions is open", () => {
    const harness = createRendererHarness(true);
    harness.document.querySelector<HTMLButtonElement>(".session-header [data-session-popup=actions]")!.click();
    const workspace = harness.document.querySelector<HTMLElement>(".session-workspace")!;
    assert.equal(harness.document.defaultView!.getComputedStyle(workspace).gridTemplateColumns, "minmax(0, 1fr)");
    assert.equal(harness.document.defaultView!.getComputedStyle(
      harness.document.querySelector("#session-actions")!
    ).position, "absolute");
  });

  it("keeps the workspace in the fill row as session details appear and disappear", () => {
    const harness = createRendererHarness(true);
    const workspace = harness.document.querySelector<HTMLElement>(".session-workspace");
    const details = harness.document.querySelector<HTMLElement>(".session-details");
    const trigger = harness.document.querySelector<HTMLButtonElement>("[data-session-popup=details]");
    assert.ok(workspace);
    assert.ok(details);
    assert.ok(trigger);
    const window = harness.document.defaultView!;
    const workspaceRow = (): string => window.getComputedStyle(workspace).gridRow;
    const triggerDisplay = (): string => window.getComputedStyle(trigger).display;

    // JSDOM hides the element by default, but Chromium lets the authored inline-flex override it.
    assert.equal(findStyleRule(harness.document, ".session-action[hidden]").style.display, "none");
    assert.equal(details.hidden, true);
    assert.equal(trigger.hidden, true);
    assert.equal(triggerDisplay(), "none");
    assert.equal(workspaceRow(), "3");

    const alpha = panelSession("session-alpha", "alpha 1", ["C:\\workspace\\shared"]);
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    assert.equal(trigger.hidden, false);
    assert.notEqual(triggerDisplay(), "none");
    assert.equal(details.hidden, true);
    trigger.click();
    assert.equal(details.hidden, false);
    assert.equal(workspaceRow(), "3");

    harness.document.querySelector<HTMLButtonElement>(".session-header [data-session-popup=actions]")?.click();
    assert.equal(details.hidden, true);
    harness.document.defaultView!.dispatchEvent(new harness.document.defaultView!.Event("resize"));
    assert.equal(workspaceRow(), "3");

    harness.renderer.handleMessage({ type: "sessionRemoved", sessionId: alpha.id });
    assert.equal(details.hidden, true);
    assert.equal(trigger.hidden, true);
    assert.equal(triggerDisplay(), "none");
    assert.equal(workspaceRow(), "3");
  });

  it("forwards active terminal input and resize through the closed protocol", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");

    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });
    harness.terminals[0]?.emitData("hello");
    harness.terminals[0]?.emitResize(120, 40);

    assert.deepEqual(harness.messages.slice(1), [
      { type: "input", sessionId: alpha.id, data: "hello", isPromptSubmission: false },
      { type: "resize", sessionId: alpha.id, columns: 120, rows: 40 }
    ]);
  });

  it("marks only the input emitted by an unmodified Enter key as a prompt submission", async () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });
    harness.stage.querySelector<HTMLElement>(".terminal-instance")?.focus();

    const enter = new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    });
    assert.equal(harness.terminals[0]?.emitKey(enter), true);
    assert.equal(enter.defaultPrevented, false);
    harness.terminals[0]?.emitData("\r");

    const modifiedEnter = new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "Enter",
      shiftKey: true,
      bubbles: true,
      cancelable: true
    });
    assert.equal(harness.terminals[0]?.emitKey(modifiedEnter), true);
    harness.terminals[0]?.emitData("\u001b[13;2u");
    harness.terminals[0]?.paste("pasted line\n");
    harness.terminals[0]?.emitKey(new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "Enter"
    }));
    await Promise.resolve();
    harness.terminals[0]?.paste("later paste\n");

    assert.deepEqual(harness.messages.slice(1), [
      { type: "input", sessionId: alpha.id, data: "\r", isPromptSubmission: true },
      { type: "input", sessionId: alpha.id, data: "\u001b[13;2u", isPromptSubmission: false },
      { type: "input", sessionId: alpha.id, data: "pasted line\r", isPromptSubmission: false },
      { type: "input", sessionId: alpha.id, data: "later paste\r", isPromptSubmission: false }
    ]);
  });

  it("opens links only from the active terminal with the platform modifier", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });

    harness.terminals[0]?.emitLink("https://example.com/plain", { ctrlKey: false });
    harness.terminals[1]?.emitLink("https://example.com/inactive", { ctrlKey: true });
    harness.terminals[0]?.emitLink("https://example.com/active", { ctrlKey: true });
    harness.renderer.handleMessage({ type: "activeSessionChanged", activeSessionId: beta.id });
    harness.terminals[0]?.emitLink("https://example.com/stale", { ctrlKey: true });
    harness.terminals[1]?.emitLink("https://example.com/switched", { ctrlKey: true });
    harness.renderer.handleMessage({ type: "sessionRemoved", sessionId: beta.id });
    harness.terminals[1]?.emitLink("https://example.com/disposed", { ctrlKey: true });

    assert.deepEqual(harness.messages.slice(1), [
      { type: "openExternal", sessionId: alpha.id, uri: "https://example.com/active" },
      { type: "openExternal", sessionId: beta.id, uri: "https://example.com/switched" }
    ]);
  });

  it("uses Command rather than Control to open links on macOS", () => {
    const harness = createRendererHarness(false, "MacIntel");
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha],
      activeSessionId: alpha.id,
      terminalFont
    });

    harness.terminals[0]?.emitLink("https://example.com/control", { ctrlKey: true });
    harness.terminals[0]?.emitLink("https://example.com/command", { metaKey: true });

    assert.deepEqual(harness.messages.slice(1), [
      { type: "openExternal", sessionId: alpha.id, uri: "https://example.com/command" }
    ]);
  });

  it("requests host paste exactly once for Ctrl+V and Ctrl+Shift+V in the active terminal", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });
    harness.stage.querySelector<HTMLElement>(".terminal-instance")?.focus();

    for (const shiftKey of [false, true]) {
      const keydown = new harness.document.defaultView!.KeyboardEvent("keydown", {
        key: "v",
        ctrlKey: true,
        shiftKey,
        bubbles: true,
        cancelable: true
      });
      const processed = harness.terminals[0]?.emitKey(keydown);
      harness.terminals[0]?.emitKey(new harness.document.defaultView!.KeyboardEvent("keypress", {
        key: "v",
        ctrlKey: true,
        shiftKey
      }));
      harness.terminals[0]?.emitKey(new harness.document.defaultView!.KeyboardEvent("keyup", {
        key: "v",
        ctrlKey: true,
        shiftKey
      }));

      assert.equal(processed, false);
      assert.equal(keydown.defaultPrevented, true);
    }

    assert.deepEqual(harness.messages.slice(1), [
      { type: "requestPaste", sessionId: alpha.id },
      { type: "requestPaste", sessionId: alpha.id }
    ]);
  });

  it("does not request paste for an unfocused or inactive terminal", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });
    harness.document.querySelector<HTMLButtonElement>(".session-header [data-session-popup=actions]")?.focus();

    const unfocused = new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "v",
      ctrlKey: true,
      cancelable: true
    });
    assert.equal(harness.terminals[0]?.emitKey(unfocused), true);

    harness.stage.querySelector<HTMLElement>(".terminal-instance")?.focus();
    const inactive = new harness.document.defaultView!.KeyboardEvent("keydown", {
      key: "v",
      ctrlKey: true,
      cancelable: true
    });
    assert.equal(harness.terminals[1]?.emitKey(inactive), true);
    assert.deepEqual(harness.messages, [{ type: "ready" }]);
  });

  it("routes native paste events through the focused active terminal's paste semantics", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });
    const terminalElement = harness.stage.querySelector<HTMLElement>(".terminal-instance");
    terminalElement?.focus();
    const paste = new harness.document.defaultView!.Event("paste", {
      bubbles: true,
      cancelable: true
    }) as ClipboardEvent;
    Object.defineProperty(paste, "clipboardData", {
      value: { getData: (format: string) => format === "text" ? "native paste" : "" }
    });

    terminalElement?.dispatchEvent(paste);

    assert.equal(paste.defaultPrevented, true);
    assert.deepEqual(harness.terminals[0]?.pastes, ["native paste"]);
    assert.deepEqual(harness.messages, [
      { type: "ready" },
      { type: "input", sessionId: alpha.id, data: "native paste", isPromptSubmission: false }
    ]);
  });

  it("routes host clipboard text through paste semantics for only the active terminal", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const beta = panelSession("session-beta", "beta 1");
    harness.renderer.handleMessage({
      type: "hydrate",
      resumableSessions: [],
      sessions: [alpha, beta],
      activeSessionId: alpha.id,
      terminalFont
    });

    harness.renderer.handleMessage({ type: "paste", sessionId: beta.id, data: "inactive" });
    harness.renderer.handleMessage({
      type: "paste",
      sessionId: alpha.id,
      data: "first line\nsecond line"
    });

    assert.deepEqual(harness.terminals[0]?.pastes, ["first line\nsecond line"]);
    assert.deepEqual(harness.terminals[1]?.pastes, []);
    assert.deepEqual(harness.messages, [
      { type: "ready" },
      {
        type: "input",
        sessionId: alpha.id,
        data: "first line\rsecond line",
        isPromptSubmission: false
      }
    ]);
  });

  it("preserves Ctrl+C selection copy without sending terminal input", async () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    const copied: string[] = [];
    Object.defineProperty(harness.document.defaultView!.navigator, "clipboard", {
      value: { writeText: async (text: string) => { copied.push(text); } },
      configurable: true
    });
    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });
    harness.terminals[0]?.selectText("selected output");

    const processed = harness.terminals[0]?.emitKey(new harness.document.defaultView!.KeyboardEvent(
      "keydown",
      { key: "c", ctrlKey: true }
    ));
    harness.terminals[0]?.emitKey(new harness.document.defaultView!.KeyboardEvent(
      "keyup",
      { key: "c", ctrlKey: true }
    ));
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.equal(processed, false);
    assert.deepEqual(copied, ["selected output"]);
    assert.deepEqual(harness.messages, [{ type: "ready" }]);
  });

  it("resolves VS Code theme values and updates existing terminals when the theme mutates", async () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");
    harness.document.documentElement.style.setProperty("--vscode-terminal-background", "#112233");
    harness.document.documentElement.style.setProperty("--vscode-terminal-foreground", "#ddeeff");
    harness.document.documentElement.style.setProperty(
      "--vscode-terminal-selectionBackground",
      "#335577"
    );

    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });
    assert.deepEqual(harness.terminals[0]?.theme, {
      background: "#112233",
      foreground: "#ddeeff",
      selectionBackground: "#335577"
    });

    harness.document.documentElement.style.setProperty("--vscode-terminal-background", "#445566");
    harness.document.documentElement.style.setProperty(
      "--vscode-terminal-selectionBackground",
      "#557799"
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    assert.deepEqual(harness.terminals[0]?.theme, {
      background: "#445566",
      foreground: "#ddeeff",
      selectionBackground: "#557799"
    });
  });

  it("constructs terminals with the complete metrics supplied by the extension host", () => {
    const harness = createRendererHarness();
    const alpha = panelSession("session-alpha", "alpha 1");

    harness.renderer.handleMessage({ type: "hydrate", resumableSessions: [], sessions: [alpha], activeSessionId: alpha.id, terminalFont });

    assert.deepEqual(harness.terminals[0]?.terminalFont, terminalFont);
  });

  it("uses editor theme colors when terminal colors are unavailable", () => {
    const dom = new JSDOM("<main id=\"app\"></main>", { pretendToBeVisual: true });
    dom.window.document.documentElement.style.setProperty(
      "--vscode-editor-background",
      "#f4f4f4"
    );
    dom.window.document.documentElement.style.setProperty(
      "--vscode-editor-foreground",
      "#242424"
    );

    assert.deepEqual(resolveTheme(dom.window.document), {
      background: "#f4f4f4",
      foreground: "#242424",
      selectionBackground: "rgba(128, 128, 128, 0.45)"
    });
  });

  it("uses the editor selection token when the terminal token is unavailable", () => {
    const dom = new JSDOM("<main id=\"app\"></main>", { pretendToBeVisual: true });
    dom.window.document.documentElement.style.setProperty(
      "--vscode-editor-selectionBackground",
      "#224466"
    );

    assert.equal(resolveTheme(dom.window.document).selectionBackground, "#224466");
  });

  it("uses a visible selection fallback when VS Code exposes no selection token", () => {
    const dom = new JSDOM("<main id=\"app\"></main>", { pretendToBeVisual: true });

    assert.equal(
      resolveTheme(dom.window.document).selectionBackground,
      "rgba(128, 128, 128, 0.45)"
    );
  });

  it("gives the terminal surface the full pane width without a fixed inset", () => {
    const harness = createRendererHarness(true);
    const styles = harness.document.defaultView?.getComputedStyle(harness.stage);

    assert.equal(styles?.paddingLeft, "0px");
    assert.equal(styles?.paddingRight, "0px");
    assert.equal(styles?.paddingTop, "8px");
    assert.equal(styles?.paddingBottom, "8px");
  });
});

/** Returns one parsed CSS rule so style behavior can be checked without string matching. */
function findStyleRule(document: Document, selector: string): CSSStyleRule {
  const selectors = selector.replace(/\s/gu, "").split(",");
  for (const styleSheet of [...document.styleSheets]) {
    for (const rule of [...styleSheet.cssRules]) {
      if (rule instanceof document.defaultView!.CSSStyleRule &&
          selectors.every(item=>rule.selectorText.replace(/\s/gu, "").split(",").includes(item))) {
        return rule;
      }
    }
  }
  throw new Error(`Missing CSS rule: ${selector}`);
}

/** Creates a real DOM renderer harness with a fake terminal implementation. */
function createRendererHarness(
  loadStyles = false,
  platform = "Win32",
  options: {
    readonly documentId?: string;
    readonly companionViewId?: string;
    readonly now?: () => number;
    readonly monotonicNow?: () => number;
    readonly formatDateTime?: (date: Date) => string;
    readonly createComposer?:(options:ComposerViewOptions)=>ComposerView;
  } = {}
): {
  readonly document: Document;
  readonly messages: WebviewMessage[];
  readonly renderer: ReturnType<typeof createSessionRenderer>;
  readonly stage: HTMLElement;
  readonly terminals: FakeTerminal[];
  readonly scheduledIntervalMilliseconds: readonly number[];
  readonly clearedIntervalIds: readonly number[];
  readonly runScheduledIntervals: () => void;
} {
  const dom = new JSDOM("<main id=\"app\"></main>", { pretendToBeVisual: true });
  if (loadStyles) {
    const style = dom.window.document.createElement("style");
    style.textContent = readFileSync(
      resolve(__dirname, "../../../src/panel/webview/styles.css"),
      "utf8"
    );
    dom.window.document.head.append(style);
  }
  const messages: WebviewMessage[] = [];
  const terminals: FakeTerminal[] = [];
  const intervalCallbacks = new Map<number, () => void>();
  const scheduledIntervalMilliseconds: number[] = [];
  const clearedIntervalIds: number[] = [];
  let nextIntervalId = 1;
  const terminalFactory: RendererTerminalFactory = {
    create: (theme, font, openLink) => {
      const terminal = new FakeTerminal(dom.window.document, theme, font, openLink);
      terminals.push(terminal);
      return terminal;
    }
  };
  const dependencies = {
    document: dom.window.document,
    window: rendererWindow(dom.window as unknown as Window, platform),
    postMessage: (message: WebviewMessage) => messages.push(message),
    documentId: options.documentId,
    companionViewId: options.companionViewId,
    now: options.now,
    monotonicNow: options.monotonicNow,
    formatDateTime: options.formatDateTime,
    createComposer: options.createComposer,
    setInterval: (callback: () => void, milliseconds: number) => {
      const id = nextIntervalId++;
      intervalCallbacks.set(id, callback);
      scheduledIntervalMilliseconds.push(milliseconds);
      return id;
    },
    clearInterval: (id: number) => {
      intervalCallbacks.delete(id);
      clearedIntervalIds.push(id);
    },
    terminalFactory,
    fitTerminal: () => undefined
  };
  const renderer = createSessionRenderer(dependencies);
  const stage = dom.window.document.querySelector<HTMLElement>(".terminal-stage");
  assert.ok(stage, "terminal stage was rendered");
  return {
    document: dom.window.document,
    messages,
    renderer,
    stage,
    terminals,
    scheduledIntervalMilliseconds,
    clearedIntervalIds,
    runScheduledIntervals: () => {
      for (const callback of intervalCallbacks.values()) {
        callback();
      }
    }
  };
}

/** Runs the hosted composer with CodeMirror in the renderer's test document. */
function createHostedComposerHarness(documentId: string) {
  const globals = new Map<string, PropertyDescriptor | undefined>();
  function restoreGlobals(): void {
    for (const [key, descriptor] of globals) {
      if (descriptor !== undefined) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
  try {
    const h = createRendererHarness(true, "Win32", {
      documentId,
      createComposer: options => {
        const document = options.parent.ownerDocument;
        const window = document.defaultView!;
        for (const [key, value] of Object.entries({ window, document, MutationObserver: window.MutationObserver })) {
          globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
          Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
        }
        return createComposerView(options);
      }
    });
    return {
      ...h,
      hydrateComposer(target: ManagedSessionSnapshot & { claudeSessionId: string }, text: string) {
        const saved = composerSession(target.claudeSessionId, text);
        const session = { ...saved, displayName: target.displayName,
          draft: { ...saved.draft, selection: { anchor: text.length, head: text.length } } };
        h.renderer.handleMessage({
          type: "composerHydrate", capability: { status: "available", target: {
            sessionId: target.id, claudeSessionId: target.claudeSessionId, generation: "generation"
          } },
          session,
          layout: { splitRatio: 0.4 }, visible: true, favorites: [], canSubmit: true
        });
      },
      dispose() {
        try {
          h.renderer.dispose();
          h.document.defaultView!.close();
        } finally {
          restoreGlobals();
        }
      }
    };
  } catch (error) {
    restoreGlobals();
    throw error;
  }
}

/** Converts JSDOM's browser globals into the renderer's explicit window boundary. */
function rendererWindow(window: Window, platform = "Win32"): RendererWindow {
  const globals = window as unknown as {
    readonly HTMLElement: typeof HTMLElement;
    readonly MutationObserver: typeof MutationObserver;
    readonly ResizeObserver?: typeof ResizeObserver;
  };
  const navigator = Object.create(window.navigator) as Navigator;
  Object.defineProperty(navigator, "platform", { value: platform });
  return {
    HTMLElement: globals.HTMLElement,
    MutationObserver: globals.MutationObserver,
    ResizeObserver: globals.ResizeObserver,
    navigator,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window)
  };
}

/** Represents a hand-derived live session snapshot. */
function panelSession(
  id: string,
  displayName: string,
  launchedAddDirPaths: readonly string[] = []
): ManagedSessionSnapshot {
  return {
    id,
    claudeSessionId: null,
    rootId: `file:///workspace/${id}`,
    displayName,
    ordinalWithinRoot: 1,
    state: "running",
    activity: "idle",
    hasUnreadResponse: false,
    launchedImportIds: [],
    launchedAddDirPaths,
    launchedRootLabel: id,
    launchedRootPath: `C:\\workspace\\${id}`,
    launchedAt: 1234
  };
}

/** Implements just enough terminal behavior to observe renderer boundary effects. */
class FakeTerminal implements RendererTerminal {
  readonly rendererKind = "default" as const;
  readonly element: HTMLElement;
  readonly writes: string[] = [];
  readonly pastes: string[] = [];
  readonly theme: { background: string; foreground: string; selectionBackground?: string };
  readonly terminalFont: TerminalFontMetrics;
  disposed = false;
  private selection = "";
  private dataListener: ((data: string) => void) | undefined;
  private resizeListener: ((size: { cols: number; rows: number }) => void) | undefined;
  private keyEventHandler: ((event: KeyboardEvent) => boolean) | undefined;
  private readonly openLink: (event: MouseEvent, uri: string) => void;

  constructor(
    document: Document,
    theme: { background: string; foreground: string; selectionBackground?: string },
    terminalFont: TerminalFontMetrics,
    openLink: (event: MouseEvent, uri: string) => void
  ) {
    this.theme = theme;
    this.terminalFont = terminalFont;
    this.openLink = openLink;
    this.element = document.createElement("div");
    this.element.tabIndex = 0;
  }

  open(parent: HTMLElement): void { parent.append(this.element); }
  readonly parseCallbacks: Array<() => void> = [];
  private userInputListener: (() => void) | undefined;
  get pendingWriteCount(): number { return this.parseCallbacks.length; }
  write(data: string, onParsed?: () => void): void { this.writes.push(data); if (onParsed !== undefined) { this.parseCallbacks.push(onParsed); } }
  completeWrite(): void { this.parseCallbacks.shift()?.(); }
  onUserInput(listener: () => void): void { this.userInputListener = listener; }
  emitUserData(data: string): void { this.userInputListener?.(); this.dataListener?.(data); }
  paste(data: string): void {
    this.pastes.push(data);
    this.dataListener?.(data.replace(/\r?\n/g, "\r"));
  }
  dispose(): void { this.disposed = true; }
  focus(): void { this.element.focus(); }
  onData(listener: (data: string) => void): void { this.dataListener = listener; }
  onResize(listener: (size: { cols: number; rows: number }) => void): void { this.resizeListener = listener; }
  attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
    this.keyEventHandler = handler;
  }
  updateTheme(theme: { background: string; foreground: string; selectionBackground?: string }): void {
    this.theme.background = theme.background;
    this.theme.foreground = theme.foreground;
    this.theme.selectionBackground = theme.selectionBackground;
  }
  hasSelection(): boolean { return this.selection.length > 0; }
  getSelection(): string { return this.selection; }
  selectText(text: string): void { this.selection = text; }
  emitData(data: string): void { this.dataListener?.(data); }
  emitResize(cols: number, rows: number): void { this.resizeListener?.({ cols, rows }); }
  emitKey(event: KeyboardEvent): boolean | undefined { return this.keyEventHandler?.(event); }
  emitLink(
    uri: string,
    options: { readonly ctrlKey?: boolean; readonly metaKey?: boolean }
  ): void {
    const event = new this.element.ownerDocument.defaultView!.MouseEvent("click", options);
    this.openLink(event, uri);
  }
}

describe("companion renderer assembly", () => {
  const terminalFont = {fontFamily:"monospace",fontSize:14,letterSpacing:0,lineHeight:1};
  const documentId = "11111111-1111-4111-8111-111111111111";
  const companionViewId = "f".repeat(32);
  it("posts the one legacy UUID before the bootstrap ready and routes only nested companion payloads", async () => {
    const h = createRendererHarness(false, "Win32", {documentId, companionViewId});
    try {
      assert.deepEqual(h.messages.slice(0,2), [{type:"ready",documentId},
        {type:"companion",payload:{v:1,kind:"companion.ready",viewId:companionViewId,documentId}}]);
      const alpha = panelSession("alpha", "Alpha");
      h.renderer.handleMessage({type:"hydrate", sessions:[alpha],activeSessionId:alpha.id,resumableSessions:[],terminalFont});
      const terminal = h.terminals[0]!, element = h.stage.firstElementChild;
      await h.renderer.handleMessage({type:"companion",payload:{v:1,kind:"companion.bind",viewId:companionViewId,
        documentId,projectionId:"0".repeat(31)+"1",sessionId:alpha.id,generation:"generation",claudeSessionId:documentId,modelRevision:0}});
      const buttons = [...h.document.querySelectorAll<HTMLButtonElement>(".companion-stage .companion-toolbar button")];
      assert.equal(buttons.length, 4);
      const outside = h.document.createElement("textarea"); outside.value = "keep draft"; h.document.body.append(outside); outside.focus();
      buttons.find(b=>b.textContent==="Companion")!.click();
      assert.equal(h.document.querySelector<HTMLElement>(".companion-stage")?.hidden,true);
      assert.equal(h.stage.hidden,false);
      assert.equal(h.stage.firstElementChild,element);
      h.renderer.handleMessage({type:"sessionData",sessionId:alpha.id,data:"still flowing"});
      assert.deepEqual(terminal.writes,["still flowing"]);
      assert.equal(h.document.activeElement,outside); assert.equal(outside.value,"keep draft");
      buttons.find(b=>b.textContent==="Raw")!.click();
      assert.equal(h.stage.hidden,false); assert.equal(h.stage.firstElementChild,element);
      assert.equal(terminal.disposed,false);
      assert.equal(h.messages.filter(m=>m.type==="input").length,0);
      const raw = h.messages.at(-1); assert.ok(raw?.type==="companion");assert.equal(raw.payload.kind,"companion.toggleRaw");
      buttons.find(b=>b.textContent==="Send Escape to selected CLI")!.click();
      const escape = h.messages.at(-1); assert.ok(escape?.type==="companion");assert.equal(escape.payload.kind,"companion.escape");
      h.renderer.handleMessage({type:"sessionRemoved",sessionId:alpha.id});
      assert.equal(buttons.find(b=>b.textContent==="Raw")!.disabled,true);
    } finally { h.renderer.dispose(); }
  });
  for (const companionViewId of [undefined,"", "F".repeat(32)," f".repeat(16), "f".repeat(31)]) {
    it("keeps legacy native input with invalid bootstrap " + String(companionViewId), () => {
      const h = createRendererHarness(false,"Win32",{documentId,companionViewId});
      try {
        assert.deepEqual(h.messages,[{type:"ready",documentId}]);
        const notice=h.document.querySelector(".companion-notice"); assert.ok(notice,"fixed unavailable notice must be mounted");
        assert.match(notice.textContent!,/unavailable/i);
        const alpha=panelSession("alpha","Alpha");
        h.renderer.handleMessage({type:"hydrate",sessions:[alpha],activeSessionId:alpha.id,resumableSessions:[],terminalFont});
        h.terminals[0]!.emitData("\u001b");
        assert.equal(h.stage.hidden,false);assert.equal(h.messages.at(-1)?.type,"input");
      } finally {h.renderer.dispose();}
    });
  }
});

describe("companion browser bootstrap",()=>{
  it("reads the host attribute once, validates it literally and shares the single browser UUID",()=>{
    const source=readFileSync("src/panel/webview/index.ts","utf8");
    const compiled=transpileModule(source,{compilerOptions:{module:ModuleKind.CommonJS,target:ScriptTarget.ES2022}}).outputText;
    for(const attribute of [null,"", "f".repeat(32),"F".repeat(32)," "+"f".repeat(32),"f".repeat(32)+"\n","f".repeat(31)]){
      let reads=0,uuids=0;let options:Record<string,unknown>|undefined;
      const document={querySelector:()=>({getAttribute:(name:string)=>{assert.equal(name,"data-companion-view-id");reads++;return attribute;}})};
      runInNewContext(compiled,{exports:{},require:(name:string)=>{
        if(name==="./renderer")return {createSessionRenderer:(value:Record<string,unknown>)=>{options=value;return {handleMessage:()=>{}};}};
        if(name==="../protocol")return {decodeHostMessage};
        return {};
      },document,crypto:{randomUUID:()=>{uuids++;return "88888888-8888-4888-8888-888888888888";}},
      acquireVsCodeApi:()=>({postMessage:()=>{},getState:()=>undefined,setState:()=>{}}),
      HTMLElement:class{},MutationObserver:class{},ResizeObserver:class{},
      window:{navigator:{},addEventListener:()=>{},removeEventListener:()=>{}}});
      assert.equal(reads,1);assert.equal(uuids,1);
      assert.equal(options?.documentId,"88888888-8888-4888-8888-888888888888");
      assert.equal(options?.companionViewId,attribute==="f".repeat(32)?attribute:undefined);
    }
  });
});

describe("companion layout and native focus integration",()=>{
  it("keeps the legacy surface hidden and focuses the same terminal on an explicit composer request",async()=>{
    let composerOptions:ComposerViewOptions|undefined;
    const h=createRendererHarness(true,"Win32",{documentId:"11111111-1111-4111-8111-111111111111",companionViewId:"f".repeat(32),
      createComposer:options=>{composerOptions=options;return {hydrate:()=>{},handleHostMessage:()=>{},focusEditor:()=>{},setVisible:()=>{},dispose:()=>{}};}});
    try{
      const style=h.document.createElement("style");style.textContent=readFileSync("src/panel/webview/companion/styles.css","utf8");h.document.head.append(style);
      const pane=h.document.querySelector<HTMLElement>(".companion-stage")!;
      assert.equal(h.document.defaultView!.getComputedStyle(pane).display,"none");
      const alpha=panelSession("alpha","Alpha");
      h.renderer.handleMessage({type:"hydrate",sessions:[alpha],activeSessionId:alpha.id,resumableSessions:[],terminalFont:{fontFamily:"monospace",fontSize:14,letterSpacing:0,lineHeight:1}});
      await h.renderer.handleMessage({type:"companion",payload:{v:1,kind:"companion.bind",viewId:"f".repeat(32),documentId:"11111111-1111-4111-8111-111111111111",projectionId:"1".padStart(32,"0"),sessionId:alpha.id,generation:"g",claudeSessionId:"native",modelRevision:0}});
      [...pane.querySelectorAll<HTMLButtonElement>("button")].find(b=>b.textContent==="Companion")!.click();
      assert.equal(h.stage.hidden,false);composerOptions!.focusTerminal();
      assert.equal(h.stage.hidden,false);assert.equal(h.document.activeElement,h.terminals[0]!.element);
    }finally{h.renderer.dispose();}
  });
});
