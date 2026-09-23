import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

type ReleaseMetadataModule = {
  getReleaseMetadata: (
    version: string,
    tag: string
  ) => {
    channel: "stable" | "prerelease";
    sourceBranch: string;
    tag: string;
    version: string;
  };
};

// Windows process startup can exceed Mocha's default while remaining healthy.
// Bound both the child and the test so genuine hangs still fail.
const CHILD_PROCESS_TIMEOUT_MS = 10_000;
const PROCESS_TEST_TIMEOUT_MS = 15_000;

const loadModule = createRequire(__filename);
const { getReleaseMetadata } = loadModule(
  path.resolve("scripts/release-metadata.js")
) as ReleaseMetadataModule;
const scriptPath = path.resolve("scripts/release-metadata.js");

describe("release metadata", () => {
  it("selects the prerelease channel and source branch for an odd minor version", () => {
    assert.deepEqual(getReleaseMetadata("0.7.0", "v0.7.0"), {
      channel: "prerelease",
      sourceBranch: "prerelease/0.7.x",
      tag: "v0.7.0",
      version: "0.7.0"
    });
  });

  it("selects the stable channel and main source branch for an even minor version", () => {
    assert.deepEqual(getReleaseMetadata("0.2.0", "v0.2.0"), {
      channel: "stable",
      sourceBranch: "main",
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
    const result = spawnSync(process.execPath, [scriptPath, "v0.7.0"], {
      encoding: "utf8",
      timeout: CHILD_PROCESS_TIMEOUT_MS
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "channel=prerelease\nsource_branch=prerelease/0.7.x\ntag=v0.7.0\nversion=0.7.0\n"
    );
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

  it("fails the CLI when the tag differs from the package version", () => {
    const result = spawnSync(process.execPath, [scriptPath, "v0.6.0"], {
      encoding: "utf8",
      timeout: CHILD_PROCESS_TIMEOUT_MS
    });

    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /tag v0\.6\.0 does not match package version 0\.7\.0/i
    );
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

  it("reads metadata from an explicitly selected release package", () => {
    const packagePath = path.resolve("test/fixtures/release-package.json");
    const result = spawnSync(
      process.execPath,
      [scriptPath, "v2.3.4", packagePath],
      { encoding: "utf8", timeout: CHILD_PROCESS_TIMEOUT_MS }
    );

    assert.equal(result.status, 0, result.stderr);
    assert.equal(
      result.stdout,
      "channel=prerelease\nsource_branch=prerelease/2.3.x\ntag=v2.3.4\nversion=2.3.4\n"
    );
  }).timeout(PROCESS_TEST_TIMEOUT_MS);
});
