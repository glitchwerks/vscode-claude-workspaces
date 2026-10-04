import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { writeAttentionHookSettings } from "../../src/attention/attentionHookSettings";

describe("attention hook settings", () => {
  it("subscribes to both subagent lifecycle events through the owned command", async () => {
    const channel = await mkdtemp(path.join(tmpdir(), "attention lifecycle settings "));
    try {
      const settingsPath = await writeAttentionHookSettings(channel, "C:\\extension\\report-activity.ps1");
      const { hooks } = JSON.parse(await readFile(settingsPath, "utf8"));
      for (const event of ["SubagentStart", "SubagentStop"]) {
        assert.equal(hooks[event]?.[0]?.hooks[0]?.command, "powershell.exe");
        assert.equal(hooks[event][0].hooks[0].args.at(-1), "C:\\extension\\report-activity.ps1");
      }
    } finally {
      await rm(channel, { recursive: true, force: true });
    }
  });
});
