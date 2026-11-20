import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { SavedReplyController } from "../../src/companion/savedReply";
import { decodeSavedReplyHostMessage } from "../../src/panel/savedReplyProtocol";
import type { CompanionGroup, CompanionNode, CompanionTarget } from "../../src/companion/companionTypes";
import type { SavedReplyHostMessage, SavedReplyWebviewMessage } from "../../src/panel/savedReplyProtocol";

type Display = Pick<CompanionGroup, "groupId" | "nodes" | "sourceText" | "targets">;
interface Options {
  readonly documentId: string;
  readonly postMessage: (message: SavedReplyWebviewMessage) => void;
  readonly onModeChange: (visible: boolean) => void;
  readonly focusTerminal?: () => void;
}
interface View {
  select(session?: { sessionId: string; identity: string }): void;
  handle(message: SavedReplyHostMessage): void;
  showRaw(): void;
  dispose(): void;
}

const documentId = "11111111-1111-4111-8111-111111111111";
const session = { sessionId: "session-A", identity: "launch-A" };
const command = "printf 'café' \\\r\n  '☕'";
const path = "C:/café/☕";
const ambiguous = "C:/repo folder/a.txt now.";
const commandBlock = "```sh\r\n" + command + "\r\n```";
const sourceText = [
  "# Next steps", "", "Use `" + path + "` and paste into the terminal.", "",
  commandBlock, "", "Open " + ambiguous, "", "[Reference](https://example.test)", "",
  "<script>alert(1)</script>"
].join("\r\n");

function savedReply(groupId = "reply-1"): Display {
  const range = (literal: string) => {
    const start = sourceText.indexOf(literal);
    return { start, end: start + literal.length };
  };
  const target = (targetId: string, literal: string, kind: CompanionTarget["kind"], action: CompanionTarget["action"], displayLabel: string): CompanionTarget => {
    const span = range(literal);
    return { targetId, targetRevision: 1, groupId, sourceStart: span.start, sourceEnd: span.end, kind, action, displayLabel, accessibleLabel: action === "copy" ? "Copy " + kind : "Review " + kind };
  };
  const literal = (nodeId: string, text: string): CompanionNode => ({ nodeId, sourceSpan: range(text), kind: "text", text });
  return {
    groupId, sourceText, targets: [
      target("path", path, "path", "copy", "Copy path"),
      target("command", command, "command", "copy", "Command in reply"),
      target("ambiguous", ambiguous, "path", "review", "Review path")
    ],
    nodes: [
      { kind: "heading", nodeId: "title", sourceSpan: range("# Next steps"), level: 1, children: [literal("title-text", "Next steps")] },
      { kind: "paragraph", nodeId: "intro", sourceSpan: range("Use `" + path + "` and paste into the terminal."), children: [
        literal("intro-text", "Use "),
        { kind: "code", nodeId: "path-node", sourceSpan: range("`" + path + "`"), text: path, block: false, language: null, targetId: "path" },
        literal("intro-tail", " and paste into the terminal.")
      ] },
      { kind: "code", nodeId: "command-node", sourceSpan: range(commandBlock), text: command, block: true, language: "sh", targetId: "command" },
      { kind: "paragraph", nodeId: "instruction", sourceSpan: range("Open " + ambiguous), children: [literal("instruction-text", "Open " + ambiguous)] },
      { kind: "paragraph", nodeId: "reference", sourceSpan: range("[Reference](https://example.test)"), children: [
        { kind: "link", nodeId: "link", sourceSpan: range("[Reference](https://example.test)"), href: "https://example.test", children: [literal("label", "Reference")] }
      ] },
      literal("markup", "<script>alert(1)</script>")
    ]
  };
}

function setup(options: Partial<Options> = {}) {
  const modulePath = resolve(__dirname, "../../src/panel/webview/companion/savedReplyView.js");
  assert.ok(existsSync(modulePath), "The saved-reply view must be available to the session renderer");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { SavedReplyView } = require(modulePath) as { SavedReplyView: new (root: HTMLElement, options: Options) => View };
  const dom = new JSDOM("<!doctype html><section></section>");
  const root = dom.window.document.querySelector("section")!;
  const messages: SavedReplyWebviewMessage[] = [];
  const modes: boolean[] = [];
  const view = new SavedReplyView(root, { documentId, postMessage: message => messages.push(message), onModeChange: visible => modes.push(visible), ...options });
  const button = (name: string) => {
    const found = Array.from(root.querySelectorAll("button")).find(candidate => candidate.textContent === name && !candidate.closest("[hidden]"));
    assert.ok(found, "Visible button " + name);
    return found;
  };
  const target = (targetId: string) => {
    const found = Array.from(root.querySelectorAll<HTMLButtonElement>("button[data-target-id]")).find(candidate => candidate.dataset.targetId === targetId);
    assert.ok(found, "Target " + targetId);
    return found;
  };
  const respond = (reply: Display) => {
    const request = messages.at(-1)!;
    view.handle({ type: "savedReplyImported", documentId, sessionId: request.sessionId, requestId: request.requestId, reply });
  };
  const feedback = (status: Extract<SavedReplyHostMessage, {type: "savedReplyFeedback"}>["status"]) => {
    const request = messages.at(-1)!;
    view.handle({ type: "savedReplyFeedback", documentId, sessionId: request.sessionId, requestId: request.requestId, status });
  };
  return { dom, root, view, button, target, messages, modes, respond, feedback };
}

describe("saved reply copy panel", () => {
  it("preserves literal Copy and Review actions across a Markdown thematic break", async () => {
    const h = setup();
    const text = [
      "Run this command.", "", commandBlock, "", "---", "", "Open " + ambiguous
    ].join("\r\n");
    const writes: string[] = [];
    const controller = new SavedReplyController({
      readText: async () => text,
      writeText: async value => { writes.push(value); }
    });
    controller.select(session.identity);
    h.view.select(session);
    h.button("Import copied reply").click();
    const imported = await controller.import();
    assert.ok(imported.status === "imported");
    const { reply } = imported;
    const decoded = decodeSavedReplyHostMessage({
      type: "savedReplyImported", documentId, sessionId: session.sessionId, requestId: 1, reply
    });
    assert.ok(decoded.ok);
    h.view.handle(decoded.value);

    assert.equal(h.root.querySelector("hr")?.outerHTML, "<hr>");
    assert.equal(h.root.querySelector("pre code")?.textContent, command);
    const copy = reply.targets.find(target => target.kind === "command");
    const review = reply.targets.find(target => target.kind === "path");
    assert.ok(copy);
    assert.ok(review);
    h.target(copy.targetId).click();
    const request = h.messages.at(-1)!;
    assert.ok(request.type === "savedReplyCopy");
    assert.equal(await controller.copy(request.replyId, request.targetId), "copied");
    assert.deepEqual(writes, [command]);
    h.feedback("copied");
    h.target(review.targetId).click();
    assert.equal(h.root.querySelector("textarea")?.value, ambiguous);
    assert.equal(h.messages.length, 2);
    h.view.dispose();
  });

  it("renders the full imported reply inertly and copies source-bound paths and commands", () => {
    const h = setup();
    h.view.select(session);
    h.button("Import copied reply").click();
    assert.deepEqual(h.messages, [{type: "savedReplyImport", documentId, sessionId: session.sessionId, requestId: 1}]);
    h.respond(savedReply());

    assert.equal(h.root.querySelector("h1")?.textContent, "Next steps");
    assert.match(h.root.textContent!, /Imported reply — unverified/);
    assert.match(h.root.textContent!, /Use C:\/café\/☕Copy and paste into the terminal\./);
    assert.equal(h.root.querySelector("pre code")?.textContent, command);
    assert.match(h.root.textContent!, /Command in reply/);
    assert.match(h.root.textContent!, /<script>alert\(1\)<\/script>/);
    assert.match(h.root.textContent!, /Reference/);
    assert.equal(h.root.querySelector("a[href],script,img"), null);

    h.target("path").click();
    assert.deepEqual(h.messages.at(-1), {
      type: "savedReplyCopy", documentId, sessionId: session.sessionId, requestId: 2, replyId: "reply-1", targetId: "path"
    });
    assert.doesNotMatch(h.root.querySelector('[role="status"]')!.textContent!, /Copied/);
    h.feedback("copied");
    assert.equal(h.root.querySelector('[role="status"]')!.textContent, "Copied.");
    h.target("command").click();
    assert.deepEqual(h.messages.at(-1), {
      type: "savedReplyCopy", documentId, sessionId: session.sessionId, requestId: 3, replyId: "reply-1", targetId: "command"
    });
  });

  it("sends only confirmed Review edits, retains the edit on clipboard failure, and cancels locally", () => {
    const h = setup();
    h.view.select(session);
    h.button("Import copied reply").click();
    h.respond(savedReply());
    const invoker = h.target("ambiguous");
    invoker.click();

    const editor = h.root.querySelector("textarea")!;
    assert.equal(editor.value, "C:/repo folder/a.txt now.");
    assert.equal(h.dom.window.document.activeElement, editor);
    assert.equal(h.messages.length, 1);
    h.button("Cancel").click();
    assert.equal(h.messages.length, 1);
    assert.equal(h.root.querySelector("dialog"), null);
    assert.equal(h.dom.window.document.activeElement, invoker);

    invoker.click();
    const edited = "C:/repo folder/a.txt ";
    h.root.querySelector("textarea")!.value = edited;
    h.root.querySelector<HTMLButtonElement>('[aria-label="Copy reviewed value"]')!.click();
    assert.deepEqual(h.messages.at(-1), {
      type: "savedReplyCopy", documentId, sessionId: session.sessionId, requestId: 2, replyId: "reply-1", targetId: "ambiguous", editedValue: edited
    });
    h.feedback("clipboard");
    assert.equal(h.root.querySelector("textarea")!.value, edited);
    h.root.querySelector<HTMLButtonElement>('[aria-label="Copy reviewed value"]')!.click();
    h.feedback("copied");
    assert.equal(h.root.querySelector("dialog"), null);
    assert.equal(h.dom.window.document.activeElement, invoker);
  });

  it("keeps a reply through Raw but invalidates controls and requests on session change", () => {
    const h = setup();
    h.view.select(session);
    h.button("Import copied reply").click();
    h.respond(savedReply());
    const old = h.target("path");
    h.target("ambiguous").click();
    h.view.showRaw();
    assert.equal(h.root.querySelector("dialog"), null);
    assert.deepEqual(h.modes, [true, false]);
    old.click();
    assert.equal(h.messages.length, 1);
    h.button("Copied reply").click();
    assert.deepEqual(h.modes, [true, false, true]);

    h.view.select({...session});
    assert.equal(h.target("path"), old);
    h.view.select({sessionId: "session-A", identity: "replacement"});
    old.click();
    assert.equal(h.messages.length, 1);
    assert.equal(h.root.querySelector("pre"), null);

    h.button("Import copied reply").click();
    const request = h.messages.at(-1)!;
    h.view.select({sessionId: "session-B", identity: "launch-B"});
    h.view.handle({type: "savedReplyImported", documentId, sessionId: request.sessionId, requestId: request.requestId, reply: savedReply()});
    assert.equal(h.root.querySelector("h1"), null);
  });

  it("ignores wrong-document and wrong-request replies after a replacement import", () => {
    const h = setup();
    h.view.select(session);
    h.button("Import copied reply").click();
    h.respond(savedReply());
    const old = h.target("path");
    h.button("Import copied reply").click();
    const next: SavedReplyHostMessage = {type: "savedReplyImported", documentId, sessionId: session.sessionId, requestId: 2, reply: savedReply("reply-2")};
    h.view.handle({...next, documentId: "22222222-2222-4222-8222-222222222222"});
    h.view.handle({...next, requestId: 1});
    assert.equal(h.target("path"), old);
    h.view.handle(next);
    const current = h.target("path");
    assert.notEqual(current, old);
    old.click();
    assert.equal(h.messages.length, 2);
    current.click();
    const request = h.messages.at(-1);
    assert.equal(request?.type, "savedReplyCopy");
    assert.equal(request.replyId, "reply-2");
  });

  it("uses the original CRLF command when Review confirms it without edits", () => {
    const h = setup();
    h.view.select(session);
    h.button("Import copied reply").click();
    const reply = savedReply();
    h.respond({
      ...reply,
      targets: reply.targets.map(target => target.targetId === "command" ? { ...target, action: "review" } : target)
    });
    h.target("command").click();
    assert.equal(h.root.querySelector("textarea")?.value, "printf 'café' \\\n  '☕'");
    h.root.querySelector<HTMLButtonElement>('[aria-label="Copy reviewed value"]')!.click();
    assert.deepEqual(h.messages.at(-1), {
      type: "savedReplyCopy", documentId, sessionId: session.sessionId, requestId: 2, replyId: "reply-1", targetId: "command",
      editedValue: "printf 'café' \\\r\n  '☕'"
    });
  });

  it("focuses the terminal on explicit Raw activation and honors Raw during a pending import", () => {
    let terminalFocus = 0;
    const h = setup({ focusTerminal: () => { terminalFocus++; } });
    h.view.select(session);
    h.button("Import copied reply").click();
    h.respond(savedReply());
    h.button("Raw").click();
    assert.equal(terminalFocus, 1);
    h.button("Copied reply").click();

    h.button("Import copied reply").click();
    h.view.showRaw();
    h.respond(savedReply("reply-2"));
    assert.equal(terminalFocus, 1);
    assert.deepEqual(h.modes, [true, false, true, false]);
    h.button("Copied reply").click();
    assert.equal(h.target("command").closest("[hidden]"), null);
  });

});
