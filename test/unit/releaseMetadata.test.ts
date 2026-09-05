import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

type ReleaseMetadataModule = {
  getReleaseMetadata: (
    version: string,
    tag: string
  ) => { channel: "stable" | "prerelease"; tag: string; version: string };
};

const loadModule = createRequire(__filename);
const { getReleaseMetadata } = loadModule(
  path.resolve("scripts/release-metadata.js")
) as ReleaseMetadataModule;
const scriptPath = path.resolve("scripts/release-metadata.js");

describe("release metadata", () => {
  it("selects the prerelease channel for an odd minor version", () => {
    assert.deepEqual(getReleaseMetadata("0.1.3", "v0.1.3"), {
      channel: "prerelease",
      tag: "v0.1.3",
      version: "0.1.3"
    });
  });

  it("selects the stable channel for an even minor version", () => {
    assert.deepEqual(getReleaseMetadata("0.2.0", "v0.2.0"), {
      channel: "stable",
      tag: "v0.2.0",
      version: "0.2.0"
    });
  });

  it("rejects a tag that does not match package.json", () => {
    assert.throws(
      () => getReleaseMetadata("0.1.3", "v0.1.4"),
      /tag v0\.1\.4 does not match package version 0\.1\.3/i
    );
  });

  for (const version of ["", "1", "1.2", "1.x.0", "1.2.0-beta.1"]) {
    it(`rejects malformed version ${JSON.stringify(version)}`, () => {
      assert.throws(
        () => getReleaseMetadata(version, `v${version}`),
        /major\.minor\.patch/i
      );
    });
  }

  it("prints workflow outputs for the repository package version", () => {
    const result = spawnSync(process.execPath, [scriptPath, "v0.1.3"], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "channel=prerelease\ntag=v0.1.3\nversion=0.1.3\n"
    );
  });

  it("fails the CLI when the tag differs from the package version", () => {
    const result = spawnSync(process.execPath, [scriptPath, "v0.1.4"], {
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /tag v0\.1\.4 does not match package version 0\.1\.3/i
    );
  });

  it("reads metadata from an explicitly selected release package", () => {
    const packagePath = path.resolve("test/fixtures/release-package.json");
    const result = spawnSync(
      process.execPath,
      [scriptPath, "v2.3.4", packagePath],
      { encoding: "utf8" }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "channel=prerelease\ntag=v2.3.4\nversion=2.3.4\n"
    );
  });
});
