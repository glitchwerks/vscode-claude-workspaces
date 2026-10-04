import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { writeAttentionHookSettings } from "../../src/attention/attentionHookSettings";

describe("attention hook settings", () => {
  it("leaves subagent lifecycle ownership to the confirmed completion reporter", async () => {
    const channel = await mkdtemp(path.join(tmpdir(), "attention lifecycle settings "));
    try {
      const settingsPath = await writeAttentionHookSettings(channel, "C:\\extension\\report-activity.ps1");
      const { hooks } = JSON.parse(await readFile(settingsPath, "utf8"));
      for (const event of ["SubagentStart", "SubagentStop"]) {
        assert.equal(hooks[event], undefined);
      }
    } finally {
      await rm(channel, { recursive: true, force: true });
    }
  });
});
