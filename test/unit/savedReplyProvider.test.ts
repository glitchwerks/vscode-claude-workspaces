import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import type { WebviewView } from "vscode";
import type { HostMessage } from "../../src/panel/protocol";
import type { StopReplyState } from "../../src/companion/stopReplyCapture";
import type { SavedReplyCaptureMessage } from "../../src/panel/savedReplyProtocol";
import type * as SessionPanelModule from "../../src/panel/sessionPanelProvider";
import type { SessionPanelProviderDependencies } from "../../src/panel/sessionPanelProvider";
import type { ManagedSessionSnapshot } from "../../src/sessions/sessionTypes";

/** Load the real provider with only the host's URI API replaced. Clipboard is injected normally. */
function loadProvider(): typeof SessionPanelModule {
  const filename = require.resolve("../../src/panel/sessionPanelProvider");
  const load = createRequire(filename);
  const module = {exports: {}};
  runInNewContext(readFileSync(filename, "utf8"), {
    exports: module.exports,
    module,
    require: (id: string) => id === "vscode" ? {Uri: {joinPath: (...parts: string[]) => parts.join("/")}} : load(id),
    clearTimeout,
    setTimeout,
    performance
  }, {filename});
  return module.exports as typeof SessionPanelModule;
}

function session(id: string): ManagedSessionSnapshot {
  return {
    id, claudeSessionId: null, launchedAt: 1, displayName: id, rootId: "root",
    state: "running", activity: "idle", hasUnreadResponse: false, ordinalWithinRoot: 1,
    launchedRootLabel: "Fixture", launchedRootPath: "/fixture", launchedImportIds: [],
    launchedAddDirPaths: []
  };
}

describe("saved reply session panel provider", () => {
  it("publishes the selected launch's captured reply and revalidates Copy on replacement or retirement", async () => {
    const { SessionPanelProvider } = loadProvider();
    const documentId = "11111111-1111-4111-8111-111111111111";
    const a = {...session("alpha"), claudeSessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"};
    const b = {...session("beta"), claudeSessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"};
    let activeSessionId = a.id;
    let sessions = [a, b];
    let onSessions: (value: readonly ManagedSessionSnapshot[]) => void = () => undefined;
    let receive: (message: unknown) => void = () => undefined;
    let onCapture: (sessionId: string) => void = () => undefined;
    let clipboardReads = 0;
    let finishRead: (value: string) => void = () => undefined;
    const readResult = new Promise<string>(resolve => { finishRead = resolve; });
    let disposedCapture = false;
    const sent: HostMessage[] = [];
    const writes: string[] = [];
    const targets = new Map([a, b].map(value => [value.id, {
      sessionId: value.id, claudeSessionId: value.claudeSessionId, generation: "g-" + value.id
    }]));
    const captures = new Map<string, StopReplyState>();
    const disposed = {dispose() {}};
    const dependencies = {
      extensionUri: "fixture",
      sessions: {
        get sessions() { return sessions; },
        get activeSessionId() { return activeSessionId; },
        onDidChangeSessions(listener: typeof onSessions) { onSessions = listener; return disposed; },
        onDidReceiveData: () => disposed
      },
      resumableSessions: {sessions: [], onDidChangeSessions: () => disposed},
      actions: {input: () => assert.fail("Stop capture must not send terminal input")},
      terminalFont: {fontFamily: "monospace", fontSize: 13, lineHeight: 1, letterSpacing: 0},
      readClipboardText: () => { clipboardReads++; return readResult; },
      writeClipboardText: async (text: string) => { writes.push(text); },
      stopReplies: {
        targetFor: (id: string) => targets.get(id),
        source: {
          stateFor: (target: {sessionId: string; generation: string}) =>
            targets.get(target.sessionId)?.generation === target.generation ? captures.get(target.sessionId) : undefined,
          onDidChange(listener: typeof onCapture) {
            onCapture = listener;
            return {dispose() { disposedCapture = true; }};
          }
        }
      }
    } as unknown as SessionPanelProviderDependencies;
    const view = {
      visible: true,
      webview: {
        cspSource: "fixture",
        asWebviewUri: (value: string) => value,
        postMessage: async (message: HostMessage) => { sent.push(message); return true; },
        onDidReceiveMessage: (listener: typeof receive) => { receive = listener; return disposed; }
      },
      onDidDispose: () => disposed
    } as unknown as WebviewView;
    const flush = () => new Promise<void>(resolve => setImmediate(resolve));
    const messages = () => sent.filter((message): message is SavedReplyCaptureMessage => message.type === "savedReplyCaptured");
    const provider = new SessionPanelProvider(dependencies);
    try {
      captures.set(a.id, {status: "waiting"});
      captures.set(b.id, {status: "captured", reply: {sequence: 1, text: "Open `C:/Other.md`."}});
      provider.resolveWebviewView(view);
      onCapture(a.id);
      assert.equal(messages().length, 0);
      receive({type: "ready", documentId});
      await flush();
      assert.ok(sent.findIndex(message => message.type === "hydrate") <
        sent.findIndex(message => message.type === "savedReplyCaptured"));
      assert.equal(messages().at(-1)?.status, "waiting");
      assert.equal(messages().length, 1);
      onCapture(b.id);
      assert.equal(messages().length, 1);

      const command = "printf 'café' \\\r\n  '☕'";
      const reply = {sequence: 2, text: "Run:\r\n\r\n```sh\r\n" + command + "\r\n```"};
      captures.set(a.id, {status: "captured", reply});
      onCapture(a.id);
      const first = messages().at(-1);
      assert.ok(first?.reply);
      assert.equal(first.documentId, documentId);
      assert.equal(first.sessionId, a.id);
      assert.equal(first.reply.sourceText, reply.text);
      const target = first.reply.targets.find(item => item.kind === "command");
      assert.ok(target);
      onCapture(a.id);
      assert.equal(messages().length, 2, "Duplicate capture did not republish");
      captures.set(a.id, {status: "gap", reply});
      onCapture(a.id);
      assert.equal(messages().at(-1)?.status, "gap");
      assert.equal(messages().at(-1)?.reply, undefined, "A gap kept the previous display and copy authority");

      const copy = {
        type: "savedReplyCopy", documentId, sessionId: a.id, requestId: 1,
        replyId: first.reply.groupId, targetId: target.targetId
      };
      receive(copy);
      await flush();
      assert.deepEqual(writes, [command]);
      assert.equal(clipboardReads, 0, "Automatic capture did not read the clipboard");

      receive({type: "savedReplyImport", documentId, sessionId: a.id, requestId: 2});
      await flush();
      assert.equal(clipboardReads, 1);
      finishRead("Open `C:/Manual.md`.");
      queueMicrotask(() => {
        captures.set(a.id, {status: "captured", reply: {sequence: 3, text: reply.text}});
        onCapture(a.id);
      });
      await flush();
      assert.equal(sent.some(message => message.type === "savedReplyImported"), false);
      assert.ok(sent.some(message =>
        message.type === "savedReplyFeedback" && message.requestId === 2 && message.status === "stale"));

      activeSessionId = b.id;
      onSessions(sessions);
      assert.equal(messages().at(-1)?.sessionId, b.id);
      assert.equal(messages().at(-1)?.reply?.sourceText, "Open `C:/Other.md`.");
      receive({...copy, requestId: 3});
      await flush();
      assert.deepEqual(writes, [command]);

      activeSessionId = a.id;
      onSessions(sessions);
      const replay = messages().at(-1);
      assert.ok(replay?.reply);
      assert.notEqual(replay.reply.groupId, first.reply.groupId);
      const replayCopy = {...copy, replyId: replay.reply.groupId, targetId: replay.reply.targets[0]!.targetId};
      targets.delete(a.id);
      onCapture(a.id);
      assert.equal(messages().at(-1)?.status, "unavailable");
      assert.equal(messages().at(-1)?.reply, null);
      receive({...replayCopy, requestId: 4});
      await flush();
      assert.deepEqual(writes, [command]);
      const beforeClosing = messages().length;
      sessions = [{...a, state: "closing"}, b];
      onSessions(sessions);
      onCapture(a.id);
      assert.equal(messages().length, beforeClosing, "Closing launch cannot publish a capture");
    } finally {
      provider.dispose();
    }
    assert.equal(disposedCapture, true);
  });

  it("reads and writes only for the current document, session and admitted reply", async () => {
    const {SessionPanelProvider} = loadProvider();
    const documentId = "11111111-1111-4111-8111-111111111111";
    const otherDocumentId = "22222222-2222-4222-8222-222222222222";
    const sessions = [session("alpha"), session("beta")];
    const disposed = {dispose() {}};
    let activeSessionId = "alpha";
    let onSessions: (value: readonly ManagedSessionSnapshot[]) => void = () => undefined;
    let receive: (message: unknown) => void = () => undefined;
    const sent: HostMessage[] = [];
    const written: string[] = [];
    let reads = 0;
    let finishRead: (text: string) => void = () => undefined;
    const pendingRead = new Promise<string>(resolve => {finishRead = resolve;});
    const dependencies = {
      extensionUri: "fixture",
      sessions: {
        sessions,
        get activeSessionId() {return activeSessionId;},
        onDidChangeSessions(listener: typeof onSessions) {onSessions = listener; return disposed;},
        onDidReceiveData: () => disposed
      },
      resumableSessions: {sessions: [], onDidChangeSessions: () => disposed},
      actions: {input: () => assert.fail("Saved reply actions must not send terminal input")},
      terminalFont: {fontFamily: "monospace", fontSize: 13, lineHeight: 1, letterSpacing: 0},
      readClipboardText: async () => ++reads === 1 ? "Open `C:/Team Folder/🧪.md`." : pendingRead,
      writeClipboardText: async (value: string) => {written.push(value);}
    } as unknown as SessionPanelProviderDependencies;
    const view = {
      visible: true,
      webview: {
        cspSource: "fixture",
        asWebviewUri: (value: string) => value,
        postMessage: async (message: HostMessage) => {sent.push(message); return true;},
        onDidReceiveMessage: (listener: typeof receive) => {receive = listener; return disposed;}
      },
      onDidDispose: () => disposed
    } as unknown as WebviewView;
    const flush = () => new Promise<void>(resolve => setImmediate(resolve));
    const provider = new SessionPanelProvider(dependencies);
    try {
      provider.resolveWebviewView(view);
      receive({type: "ready", documentId});
      await flush();
      receive({type: "savedReplyImport", sessionId: "alpha", documentId: otherDocumentId, requestId: 1});
      await flush();
      assert.equal(reads, 0);
      receive({type: "savedReplyImport", sessionId: "alpha", documentId, requestId: 1});
      await flush();
      const imported = sent.find(message => message.type === "savedReplyImported");
      assert.ok(imported?.type === "savedReplyImported");
      const path = imported.reply.targets.find(target => target.kind === "path");
      assert.ok(path);
      const copy = {
        type: "savedReplyCopy", documentId, sessionId: "alpha", requestId: 2,
        replyId: imported.reply.groupId, targetId: path.targetId
      };
      receive(copy);
      await flush();
      assert.deepEqual(written, ["C:/Team Folder/🧪.md"]);
      receive(copy);
      receive({type: "savedReplyImport", sessionId: "alpha", documentId, requestId: 3});
      await flush();
      assert.equal(reads, 2);
      activeSessionId = "beta";
      onSessions(sessions);
      activeSessionId = "alpha";
      onSessions(sessions);
      finishRead("Open `C:/Previous.md`.");
      await flush();
      receive({...copy, requestId: 4});
      await flush();
      assert.equal(sent.filter(message => message.type === "savedReplyImported").length, 1);
      assert.deepEqual(written, ["C:/Team Folder/🧪.md"]);
    } finally {
      finishRead("");
      provider.dispose();
    }
  });
});
