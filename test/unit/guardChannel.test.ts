import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

type Channel = "stable" | "prerelease";
type GuardChannelModule = {
  validateChannel: (version: string, channel: Channel) => void;
};

const scriptPath = path.resolve("scripts/guard-channel.js");
const loadModule = createRequire(__filename);
const { validateChannel } = loadModule(scriptPath) as GuardChannelModule;

describe("Marketplace channel guard", () => {
  it("accepts an odd minor version for the prerelease channel", () => {
    assert.doesNotThrow(() => validateChannel("0.1.3", "prerelease"));
  });

  it("accepts an even minor version for the stable channel", () => {
    assert.doesNotThrow(() => validateChannel("0.2.0", "stable"));
  });

  it("rejects an odd minor version for the stable channel", () => {
    assert.throws(
      () => validateChannel("0.1.3", "stable"),
      /odd minor.*cannot publish as stable/i
    );
  });

  it("rejects an even minor version for the prerelease channel", () => {
    assert.throws(
      () => validateChannel("0.2.0", "prerelease"),
      /even minor.*cannot publish as pre-release/i
    );
  });

  it("rejects malformed versions", () => {
    assert.throws(
      () => validateChannel("0.1.x", "prerelease"),
      /major\.minor\.patch/i
    );
  });

  it("accepts the repository version through the prerelease CLI", () => {
    const result = spawnSync(process.execPath, [scriptPath, "prerelease"], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
  });

  it("rejects the repository version through the stable CLI", () => {
    const result = spawnSync(process.execPath, [scriptPath, "stable"], {
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /odd minor.*cannot publish as stable/i);
  });
});
