import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

type Channel = "stable" | "prerelease";
type GuardChannelModule = {
  validateChannel: (version: string, channel: Channel) => void;
};

// Windows process startup can exceed Mocha's default while remaining healthy.
// Bound both the child and the test so genuine hangs still fail.
const CHILD_PROCESS_TIMEOUT_MS = 10_000;
const PROCESS_TEST_TIMEOUT_MS = 15_000;

const scriptPath = path.resolve("scripts/guard-channel.js");
const loadModule = createRequire(__filename);
const { validateChannel } = loadModule(scriptPath) as GuardChannelModule;
const repositoryVersion: string = JSON.parse(
  fs.readFileSync(path.resolve("package.json"), "utf8")
).version;
const hasOddMinor = Number(repositoryVersion.split(".")[1]) % 2 === 1;

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

  for (const channel of ["stable", "prerelease"] as const) {
    it(`enforces the repository version's parity through the ${channel} CLI`, () => {
      const result = spawnSync(process.execPath, [scriptPath, channel], {
        encoding: "utf8",
        timeout: CHILD_PROCESS_TIMEOUT_MS
      });
      const expectedChannel = hasOddMinor ? "prerelease" : "stable";
      assert.equal(result.status, channel === expectedChannel ? 0 : 1, result.stderr);
      if (channel !== expectedChannel) {
        assert.match(
          result.stderr,
          hasOddMinor
            ? /odd minor.*cannot publish as stable/i
            : /even minor.*cannot publish as pre-release/i
        );
      }
    }).timeout(PROCESS_TEST_TIMEOUT_MS);
  }
});
