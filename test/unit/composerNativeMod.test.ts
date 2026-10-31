import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { composerFirstUuid as uuid, composerSecondUuid, composerSession } from "../support/composerHarness";

type Handler = (api: unknown, event: Record<string, unknown>, next: (event: unknown) => Promise<unknown>) => Promise<unknown>;
const generation = "33333333-3333-4333-8333-333333333333";
const id = "44444444-4444-4444-8444-444444444444";
const token = "a".repeat(64);
const target = {sessionId: "managed-first", claudeSessionId: uuid, generation};
const base = {protocol: 1, token, requestId: id, target};

async function nativeHarness() {
  const source = await readFile("media/attention/hooks/composer.js", "utf8");
  const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${Math.random()}`) as {
    register: (on: (name: string, handler: Handler) => void) => void;
    startComposer: (api: unknown) => Promise<void>;
  };
  const handlers = new Map<string, Handler>();
  const files = new Map<string, string>();
  const timers: Array<{ms: number; fn: () => Promise<void>; cancelled: boolean}> = [];
  const controls: {uuid: string; text: string; dialog: boolean; fills: number; beforeFillText?: string; afterFillUuid?: string} = {uuid, text: "", dialog: false, fills: 0};
  const environment: Record<string, string> = {
    CLAUDE_WORKSPACES_COMPOSER_CHANNEL: "I:/owned-channel", CLAUDE_WORKSPACES_COMPOSER_TOKEN: token,
    CLAUDE_WORKSPACES_COMPOSER_SESSION: target.sessionId, CLAUDE_WORKSPACES_COMPOSER_UUID: uuid,
    CLAUDE_WORKSPACES_COMPOSER_GENERATION: generation, USERPROFILE: "I:/fixture-home"
  };
  const api = {
    env: {get: async (name: string) => environment[name]},
    session: {id: async () => controls.uuid},
    fs: {exists: async (file: string) => files.has(file), read: async (file: string) => files.get(file)!,
      write: async (file: string, text: string) => {files.set(file, text);}},
    prompt: {read: async () => ({text: controls.text, cursor: controls.text.length}),
      fill: async ({text, mode}: {text: string; mode: "replace" | "append"}) => {
        controls.fills++;
        if (controls.dialog) return {isFilled: false, refusal: "dialog", text: controls.text, cursor: controls.text.length};
        if (controls.beforeFillText !== undefined) { controls.text = controls.beforeFillText; controls.beforeFillText = undefined; }
        controls.text = mode === "append" ? controls.text + text : text;
        if (controls.afterFillUuid !== undefined) controls.uuid = controls.afterFillUuid;
        return {isFilled: true, text: controls.text, cursor: controls.text.length};
      }},
    command: {list: async () => [{name: "fixture:skill", description: "Fixture skill", source: "plugin", plugin: "fixture"}]},
    clock: {after: (ms: number, fn: () => Promise<void>) => {
      const timer = {ms, fn, cancelled: false}; timers.push(timer);
      return {cancel() {timer.cancelled = true;}};
    }}
  };
  mod.register((name, handler) => {handlers.set(name, handler);});
  const next = async (event: unknown) => event;
  await mod.startComposer(api);
  const poll = async (message: unknown) => {
    files.set("I:/owned-channel/request.json", JSON.stringify(message));
    const timer = timers.filter(t => !t.cancelled).sort((a,b) => a.ms-b.ms)[0];
    assert.ok(timer, "an owned session should schedule its request reader");
    timer.cancelled = true;
    await timer.fn();
    const raw = files.get("I:/owned-channel/response.json");
    return raw === undefined ? undefined : JSON.parse(raw) as Record<string, unknown>;
  };
  const response = () => JSON.parse(files.get("I:/owned-channel/response.json")!) as Record<string, unknown>;
  return {handlers, files, api, controls, poll, response, next, reset: () => mod.startComposer(api),
    expire: async () => {const expiry=timers.find(t=>t.ms===5000&&!t.cancelled);assert.ok(expiry);await expiry.fn();}};
}

describe("native composer module", () => {
  it("lists exact invocations without filling or submitting a prompt", async () => {
    const h = await nativeHarness();
    const frame = await h.poll({...base, operation: "catalog"});
    assert.deepEqual(frame?.commands, [{invocation: "/fixture:skill", description: "Fixture skill", source: "plugin", plugin: "fixture"}]);
    assert.equal(h.controls.fills, 0);
  });

  it("ignores unauthenticated, malformed and wrong-session requests without native input", async () => {
    for (const corrupt of [{token: "b".repeat(64)}, {target: {...target, claudeSessionId: composerSecondUuid}}, {extra: true}]) {
      const h = await nativeHarness();
      const reply = await h.poll({...base, operation: "submit", draft: composerSession().draft, ...corrupt});
      assert.equal(reply, undefined);
      assert.equal(h.controls.fills, 0);
      assert.equal(h.controls.text, "");
    }
  });

  it("rejects existing native drafts and dialogs without replacing their input", async () => {
    const h = await nativeHarness();
    h.controls.text = "native draft";
    assert.equal((await h.poll({...base, operation: "submit", draft: composerSession().draft}))?.reason, "terminal-draft");
    assert.equal(h.controls.text, "native draft");
    assert.equal(h.controls.fills, 0);
    const dialog = await nativeHarness();
    dialog.controls.dialog = true;
    assert.equal((await dialog.poll({...base, operation: "submit", draft: composerSession().draft}))?.reason, "dialog");
  });

  it("refuses overridden native queue chords before filling a prompt", async () => {
    const h = await nativeHarness();
    h.files.set("I:/fixture-home/.claude/keybindings.json", JSON.stringify({bindings:[{context:"Chat",bindings:{"ctrl+x enter":"chat:sendNow"}}]}));
    assert.equal((await h.poll({...base, operation: "submit", draft: composerSession().draft}))?.reason, "unavailable");
    assert.equal(h.controls.fills, 0);
  });

  it("acknowledges the native prompt result rather than successful fill", async () => {
    const h = await nativeHarness();
    assert.equal((await h.poll({...base, operation: "submit", draft: composerSession().draft}))?.kind, "prepared");
    assert.equal(h.response().status, undefined);
    await h.handlers.get("prompt.submit")!(h.api, {text: "first draft", wait: true, origin:{kind:"composer"}}, async () => ({drop:"Controlled refusal"}));
    assert.equal(h.response().status, "rejected");
  });

  it("does not replace a dropped skill result with generic command acceptance", async () => {
    const h = await nativeHarness();
    await h.poll({...base, operation: "submit", draft: composerSession(uuid, "/fixture:skill argument").draft});
    await h.handlers.get("command.run")!(h.api, {command:"fixture:skill",args:"argument",origin:{kind:"composer"}, presentation:{fullscreen:false,columns:80}}, async () => {
      await h.handlers.get("prompt.submit")!(h.api, {text:"/fixture:skill argument",command:{name:"fixture:skill",args:"argument"},wait:true,origin:{kind:"composer"}}, async () => ({drop:"Controlled refusal"}));
      return {ref:1};
    });
    assert.equal(h.response().status, "rejected");
  });

  it("blocks a stale prepared action after native identity changes", async () => {
    const h = await nativeHarness();
    await h.poll({...base, operation: "submit", draft: composerSession(uuid, "/fixture:skill argument").draft});
    h.controls.uuid = composerSecondUuid;
    await h.reset();
    h.controls.text = "/other native draft";
    let executed = 0;
    await h.handlers.get("command.run")!(h.api, {command:"other",args:"native draft",origin:{kind:"composer"},presentation:{fullscreen:false,columns:80}}, async () => {executed++;return {ref:2};});
    assert.equal(executed, 0);
    assert.equal(h.controls.text, "/other native draft");
    assert.notEqual(h.response().status, "accepted");
  });

  it("retains concurrent native input and refuses automatic delivery", async () => {
    const h = await nativeHarness();
    h.controls.beforeFillText = "native typed";
    assert.equal((await h.poll({...base, operation:"submit", draft:composerSession().draft}))?.reason, "terminal-draft");
    assert.equal(h.controls.text, "native typedfirst draft");
    assert.notEqual(h.response().kind, "prepared");
  });

  it("does not publish preparation if native identity changes during fill", async () => {
    const h = await nativeHarness();
    h.controls.afterFillUuid = composerSecondUuid;
    assert.equal((await h.poll({...base, operation:"submit", draft:composerSession().draft}))?.reason, "unavailable");
    assert.notEqual(h.response().kind, "prepared");
  });

  it("does not infer skill acceptance when an earlier plugin bypasses its prompt observer", async () => {
    const h = await nativeHarness();
    await h.poll({...base,operation:"submit",draft:composerSession(uuid,"/fixture:skill argument").draft});
    await h.handlers.get("command.run")!(h.api, {command:"fixture:skill",args:"argument",origin:{kind:"composer"},presentation:{fullscreen:false,columns:80}}, async () => ({ref:1}));
    assert.notEqual(h.response().status,"accepted");
    await h.expire();
    assert.equal(h.response().status,"unconfirmed");
  });

  it("waits for skill prompt acceptance that completes after its command hook", async () => {
    const h = await nativeHarness();
    const text="/fixture:skill argument";
    await h.poll({...base,operation:"submit",draft:composerSession(uuid,text).draft});
    let complete!: (value: unknown) => void;
    let prompt!: Promise<unknown>;
    await h.handlers.get("command.run")!(h.api,{command:"fixture:skill",args:"argument",origin:{kind:"composer"},presentation:{fullscreen:false,columns:80}},async()=>{
      prompt=h.handlers.get("prompt.submit")!(h.api,{text,command:{name:"fixture:skill",args:"argument"},wait:true,origin:{kind:"composer"}},()=>new Promise(resolve=>{complete=resolve;}));
      for(let tick=0;tick<5;tick++)await Promise.resolve();
      return {ref:1};
    });
    assert.equal(h.response().kind,"prepared");
    complete({text});
    await prompt;
    assert.equal(h.response().status,"accepted");
  });

  it("correlates native command metadata even after the command observer returned", async () => {
    const h = await nativeHarness();
    const text="/fixture:skill argument";
    await h.poll({...base,operation:"submit",draft:composerSession(uuid,text).draft});
    await h.handlers.get("command.run")!(h.api,{command:"fixture:skill",args:"argument",origin:{kind:"composer"},presentation:{fullscreen:false,columns:80}},async()=>({ref:1}));
    await h.handlers.get("prompt.submit")!(h.api,{text,command:{name:"fixture:skill",args:"argument"},wait:true,origin:{kind:"composer"}},async()=>({text}));
    assert.equal(h.response().status,"accepted");
  });

  it("does not block ordinary terminal input after an expired request whose timer did not run", async () => {
    const h = await nativeHarness();
    await h.poll({...base,operation:"submit",draft:composerSession().draft});
    const original = Date.now, start = Date.now();
    try {
      Date.now = () => start + 6000;
      let calls = 0;
      const result = {text:"new native input"};
      assert.strictEqual(await h.handlers.get("prompt.submit")!(h.api, {text:"new native input",wait:false,origin:{kind:"composer"}}, async () => {calls++;return result;}),result);
      assert.equal(calls,1);
    } finally { Date.now = original; }
  });
});
