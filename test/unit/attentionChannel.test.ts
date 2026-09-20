import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  ATTENTION_CHANNEL_OWNER_FILE,
  ATTENTION_CHANNELS_DIRECTORY,
  openAttentionChannel
} from "../../src/attention/attentionChannel";

describe("attention channel", () => {
  it("explicitly disables the channel on non-Windows and remote extension hosts", async () => {
    const storagePath = await mkdtemp(path.join(tmpdir(), "attention-host-support-"));
    try {
      const nonWindows = await openAttentionChannel({
        storagePath,
        platform: "linux",
        processId: 101,
        createId: () => "non-windows-channel"
      });
      const remote = await openAttentionChannel({
        storagePath,
        platform: "linux",
        remoteName: "ssh-remote",
        processId: 101,
        createId: () => "remote-channel"
      });

      assert.deepEqual(nonWindows, { status: "disabled", reason: "non-windows" });
      assert.deepEqual(remote, { status: "disabled", reason: "remote-host" });
      await assert.rejects(
        access(path.join(storagePath, ATTENTION_CHANNELS_DIRECTORY)),
        { code: "ENOENT" }
      );
    } finally {
      await rm(storagePath, { recursive: true, force: true });
    }
  });

  it("mints one isolated UUID channel and records the owning extension-host process", async () => {
    const storagePath = await mkdtemp(path.join(tmpdir(), "attention-channel-create-"));
    let idCreations = 0;
    try {
      const result = await openAttentionChannel({
        storagePath,
        platform: "win32",
        processId: 404,
        createId: () => {
          idCreations += 1;
          return "11111111-1111-4111-8111-111111111111";
        },
        isProcessAlive: () => true
      });

      assert.equal(result.status, "ready");
      if (result.status !== "ready") {
        return;
      }
      assert.equal(idCreations, 1);
      assert.equal(result.channel.id, "11111111-1111-4111-8111-111111111111");
      assert.equal(result.channel.path, path.join(
        storagePath,
        ATTENTION_CHANNELS_DIRECTORY,
        "11111111-1111-4111-8111-111111111111"
      ));
      assert.deepEqual(
        JSON.parse(await readFile(path.join(result.channel.path, ATTENTION_CHANNEL_OWNER_FILE), "utf8")),
        { processId: 404 }
      );

      await result.channel.close();
      await assert.rejects(access(result.channel.path), { code: "ENOENT" });
      await result.channel.close();
    } finally {
      await rm(storagePath, { recursive: true, force: true });
    }
  });

  it("removes orphaned channels while retaining channels whose owning host is alive", async () => {
    const storagePath = await mkdtemp(path.join(tmpdir(), "attention-channel-cleanup-"));
    const channelsPath = path.join(storagePath, ATTENTION_CHANNELS_DIRECTORY);
    const deadPath = path.join(channelsPath, "dead-channel");
    const livePath = path.join(channelsPath, "live-channel");
    const incompletePath = path.join(channelsPath, "incomplete-channel");
    try {
      await mkdir(deadPath, { recursive: true });
      await mkdir(livePath, { recursive: true });
      await mkdir(incompletePath, { recursive: true });
      await writeFile(path.join(deadPath, ATTENTION_CHANNEL_OWNER_FILE), JSON.stringify({ processId: 101 }));
      await writeFile(path.join(livePath, ATTENTION_CHANNEL_OWNER_FILE), JSON.stringify({ processId: 202 }));

      const result = await openAttentionChannel({
        storagePath,
        platform: "win32",
        processId: 303,
        createId: () => "fresh-channel",
        isProcessAlive: (processId) => processId === 202
      });

      assert.equal(result.status, "ready");
      await assert.rejects(access(deadPath), { code: "ENOENT" });
      await assert.rejects(access(incompletePath), { code: "ENOENT" });
      await access(livePath);
      if (result.status === "ready") {
        await result.channel.close();
      }
    } finally {
      await rm(storagePath, { recursive: true, force: true });
    }
  });
});
