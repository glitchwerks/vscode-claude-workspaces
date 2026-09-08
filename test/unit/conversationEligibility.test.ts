import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import * as eligibility from "../../src/sessions/conversationEligibility";

describe("conversation eligibility", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  let directory: string;
  beforeEach(async () => { directory = await mkdtemp(path.join(tmpdir(), "claude-eligibility-")); });
  afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

  async function transcript(project: string, content: string): Promise<void> {
    const parent = path.join(directory, "projects", project);
    await mkdir(parent, { recursive: true });
    await writeFile(path.join(parent, `${id}.jsonl`), content);
  }

  it("excludes missing transcripts without deleting metadata", async () => {
    assert.equal(await eligibility.checkConversationEligibility(id, directory), "absent");
  });

  it("recognizes an owned conversation in any immediate project directory", async () => {
    await transcript("old-root", '{"type":"queue-operation"}\n');
    await transcript("relocated-root", '{"type":"user","message":{"role":"user","content":"hello"}}\n');
    assert.equal(await eligibility.checkConversationEligibility(id, directory), "present");
  });

  it("excludes empty and metadata-only transcripts", async () => {
    await transcript("empty", "");
    await transcript("metadata", '{"type":"file-history-snapshot"}\n{"type":"queue-operation"}\n');
    assert.equal(await eligibility.checkConversationEligibility(id, directory), "absent");
  });

  it("retains malformed, unsupported, and oversized transcript data as unknown", async () => {
    for (const content of ["{broken", "null\n", '{"type":"future-format"}\n',
      '{"type":"summary","summary":"compacted"}\n', '{"type":"system"}\n',
      '{"type":"user"}\n', "x".repeat(1024 * 1024 + 1)]) {
      await transcript("root", content);
      assert.equal(await eligibility.checkConversationEligibility(id, directory), "unknown");
    }
  });

  it("recognizes assistant messages and content block arrays", async () => {
    await transcript("root", '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hello"}]}}\n');
    assert.equal(await eligibility.checkConversationEligibility(id, directory), "present");
  });

  it("ignores unrelated UUIDs and nested subagent transcripts", async () => {
    await transcript("root/subagents", '{"type":"user","message":{"role":"user","content":"hello"}}\n');
    await writeFile(path.join(directory, "projects", "root", "other.jsonl"), "{broken");
    assert.equal(await eligibility.checkConversationEligibility(id, directory), "absent");
  });

  it("treats I/O errors as unknown and rechecks newly flushed files", async () => {
    await mkdir(path.join(directory, "projects", "root", `${id}.jsonl`), { recursive: true });
    assert.equal(await eligibility.checkConversationEligibility(id, directory), "unknown");
    await rm(path.join(directory, "projects"), { recursive: true });
    assert.equal(await eligibility.checkConversationEligibility(id, directory), "absent");
    await transcript("root", '{"type":"user","message":{"role":"user","content":"hello"}}\n');
    assert.equal(await eligibility.checkConversationEligibility(id, directory), "present");
  });

  it("rejects unsafe session identities without filesystem traversal", async () => {
    assert.equal(await eligibility.checkConversationEligibility("../other", directory), "unknown");
    assert.equal(await eligibility.checkConversationEligibility(id, "relative-config"), "unknown");
  });

  it("resolves custom config directory with Windows environment casing", () => {
    assert.equal(eligibility.claudeConfigDirectory({ Claude_Config_Dir: directory }, "win32", "home"), directory);
    assert.equal(eligibility.claudeConfigDirectory({}, "linux", "home"), path.join("home", ".claude"));
  });
});
