import assert from "node:assert/strict";
import { extractCompanionContent } from "../../src/companion/companionContent";
import { SavedReplyController } from "../../src/companion/savedReply";
import { decodeSavedReplyHostMessage, decodeSavedReplyWebviewMessage } from "../../src/panel/savedReplyProtocol";

const documentId = "536e76b1-3025-438d-a216-4e275e534060";
const coordinates = { documentId, sessionId: "alpha", requestId: 1 };

function setup(text: string) {
  const writes: string[] = [];
  let contents = text;
  const controller = new SavedReplyController({
    readText: async () => contents,
    writeText: async (value) => { writes.push(value); }
  });
  controller.select("session-alpha");
  return {
    controller,
    writes,
    put: (value: string) => { contents = value; }
  };
}

describe("saved reply source mapping", () => {
  it("sends prompt-marked fenced commands to Review without trimming the prompt", () => {
    const value = '$ echo "café"\r\ndev@host$ echo done';
    const result = extractCompanionContent("```sh" + "\r\n" + value + "\r\n" + "```", {
      sourceKind: "savedReply"
    });
    assert.deepEqual(result.targets.map(target => [target.action, target.literal]), [["review", value]]);
  });

  it("preserves lone CR and mixed line breaks in a directly copied shell body", () => {
    const value = 'echo "one"\r\necho "two"\recho "🐈"';
    const result = extractCompanionContent("```sh" + "\n" + value + "\r" + "```", { sourceKind: "savedReply" });
    assert.deepEqual(result.targets.map(target => [target.action, target.literal]), [["copy", value]]);
  });

  it("retains interleaved Markdown prefixes for Review when no exact nested command slice exists", () => {
    const raw = '   echo "one"\n   echo "two"';
    const result = extractCompanionContent("1. Use these commands.\n\n   " + "```sh" + "\n" + raw + "\n   " + "```", {
      sourceKind: "savedReply"
    });
    assert.equal(result.nodes[0]?.kind, "list");
    assert.deepEqual(result.targets.map(target => [target.action, target.literal]), [["review", raw]]);
  });

  it("retains numbered context with an exactly mapped nested single-line command", () => {
    const value = 'printf "🐈\\n"';
    const source = "1. Open the workspace.\r\n\r\n   " + "```sh" + "\r\n   " + value + "\r\n   " + "```" +
      "\r\n\r\n2. Look for the status.";
    const result = extractCompanionContent(source, { sourceKind: "savedReply" });
    assert.equal(result.nodes[0]?.kind, "list");
    assert.deepEqual(result.targets.map(target => [target.action, target.literal]), [["copy", value]]);
  });
});

describe("saved reply host", () => {
  it("copies the original multiline command and only the literal path inside inline formatting", async () => {
    const command = 'printf "%s" "你好"  \r\n  printf "🐈\\n"';
    const path = "C:\\My Workspace\\café🐈.txt";
    const replyText = "## Fix\r\n\r\n" + "```sh" + "\r\n" + command + "\r\n" + "```" +
      "\r\n\r\nOpen `" + path + "` to see the result.";
    const { controller, writes } = setup(replyText);
    const result = await controller.import();
    assert.equal(result.status, "imported");
    if (result.status !== "imported") return;
    const { reply } = result;
    assert.equal(reply.sourceText, replyText);
    assert.ok(Object.isFrozen(reply.targets[0]));
    assert.equal(reply.targets[0]?.displayLabel, "Command in reply");
    for (const target of reply.targets) {
      assert.equal(await controller.copy(reply.groupId, target.targetId), "copied");
    }
    assert.deepEqual(writes, [command, path]);
    assert.equal(decodeSavedReplyHostMessage({ type: "savedReplyImported", ...coordinates, reply }).ok, true);
  });

  it("requires Review for ambiguous source and writes the edited value exactly", async () => {
    const { controller, writes } = setup("Open C:/a b/report.txt now.");
    const imported = await controller.import();
    assert.equal(imported.status, "imported");
    if (imported.status !== "imported") return;
    const [target] = imported.reply.targets;
    assert.ok(target);
    assert.equal(target.action, "review");
    assert.equal(imported.reply.sourceText.slice(target.sourceStart, target.sourceEnd), "C:/a b/report.txt now.");
    assert.equal(await controller.copy(imported.reply.groupId, target.targetId), "invalid");
    assert.equal(await controller.copy(imported.reply.groupId, target.targetId, "\0"), "invalid");
    assert.equal(await controller.copy(imported.reply.groupId, target.targetId, "C:/a b/é.txt"), "copied");
    assert.deepEqual(writes, ["C:/a b/é.txt"]);
  });

  it("rejects a stale reply and edited data on a direct target", async () => {
    const { controller, put, writes } = setup("Open `C:/a.txt`.");
    const first = await controller.import();
    assert.equal(first.status, "imported");
    if (first.status !== "imported") return;
    assert.equal(await controller.copy(first.reply.groupId, first.reply.targets[0]!.targetId, "C:/other.txt"), "invalid");
    put("Open `C:/b.txt`.");
    assert.equal((await controller.import()).status, "imported");
    assert.equal(await controller.copy(first.reply.groupId, first.reply.targets[0]!.targetId), "stale");
    assert.deepEqual(writes, []);
  });

  it("rejects a deferred import after selection changed away and back", async () => {
    let complete!: (value: string) => void;
    const pending = new Promise<string>(resolve => { complete = resolve; });
    const controller = new SavedReplyController({ readText: () => pending, writeText: async () => {} });
    controller.select("alpha");
    const operation = controller.import();
    assert.equal((await controller.import()).status, "busy");
    controller.select("beta");
    controller.select("alpha");
    complete("Open `C:/a.txt`.");
    assert.equal((await operation).status, "stale");
    assert.equal(controller.reply, undefined);
  });

  it("does not start a second clipboard operation while a write is pending", async () => {
    let complete!: () => void;
    const writes: string[] = [];
    const pending = new Promise<void>(resolve => { complete = resolve; });
    const controller = new SavedReplyController({
      readText: async () => "Open `C:/a.txt`.",
      writeText: (text) => { writes.push(text); return pending; }
    });
    controller.select("alpha");
    const imported = await controller.import();
    assert.equal(imported.status, "imported");
    if (imported.status !== "imported") return;
    const [target] = imported.reply.targets;
    assert.ok(target);
    const copy = controller.copy(imported.reply.groupId, target.targetId);
    assert.equal(await controller.copy(imported.reply.groupId, target.targetId), "busy");
    assert.equal((await controller.import()).status, "busy");
    controller.select("beta");
    complete();
    assert.equal(await copy, "stale");
    assert.equal(controller.reply, undefined);
    assert.deepEqual(writes, ["C:/a.txt"]);
  });

  it("reports invalid clipboard input while preserving the selected reply", async () => {
    const { controller, put } = setup("Open `C:/a.txt`.");
    assert.equal((await controller.import()).status, "imported");
    const previous = controller.reply;
    put(" \r\n");
    assert.equal((await controller.import()).status, "empty");
    put("\uD800");
    assert.equal((await controller.import()).status, "invalid");
    put("a\0b");
    assert.equal((await controller.import()).status, "invalid");
    put("你".repeat(43_691));
    assert.equal((await controller.import()).status, "oversize");
    assert.equal(controller.reply, previous);
    controller.select(undefined);
    assert.equal(controller.reply, undefined);
  });

  it("keeps links inert, labels generic code neutrally, and reports clipboard failures", async () => {
    const controller = new SavedReplyController({
      readText: async () => "[Instructions](https://example.com).\n\n" + "```json" + '\n{"ok":true}\n' + "```",
      writeText: async () => { throw new Error("unavailable"); }
    });
    controller.select("alpha");
    const result = await controller.import();
    assert.equal(result.status, "imported");
    if (result.status !== "imported") return;
    const paragraph = result.reply.nodes[0];
    assert.equal(paragraph?.kind, "paragraph");
    if (paragraph?.kind !== "paragraph") return;
    assert.equal(paragraph.children.find(node => node.kind === "link")?.href, null);
    const [target] = result.reply.targets;
    assert.equal(target?.displayLabel, "Code in reply");
    assert.equal(await controller.copy(result.reply.groupId, target!.targetId), "clipboard");
  });
});

describe("saved reply protocol", () => {
  it("decodes clean actions and rejects extra authority or oversized/malformed edits", () => {
    const copy = { type: "savedReplyCopy", ...coordinates, replyId: "r", targetId: "t" };
    assert.equal(decodeSavedReplyWebviewMessage(copy).ok, true);
    assert.equal(decodeSavedReplyWebviewMessage({ ...copy, editedValue: "é" }).ok, true);
    assert.equal(decodeSavedReplyWebviewMessage({ ...copy, execute: true }).ok, false);
    assert.equal(decodeSavedReplyWebviewMessage({ ...copy, editedValue: "é".repeat(16385) }).ok, false);
    assert.equal(decodeSavedReplyWebviewMessage({ ...copy, editedValue: "\uD800" }).ok, false);
    assert.equal(decodeSavedReplyHostMessage({ type: "savedReplyFeedback", ...coordinates, status: "copied" }).ok, true);
    assert.equal(decodeSavedReplyHostMessage({ type: "savedReplyFeedback", ...coordinates, status: "executed" }).ok, false);
  });
});
