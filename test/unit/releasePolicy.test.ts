import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

type Policy = {
  parseVersion(version: string): { major: number; minor: number; patch: number };
  getChannel(version: string): "stable" | "prerelease";
  getExpectedSourceBranch(version: string): string;
  validateReleaseCandidateBranch(version: string, branch: string): void;
};

const loadModule = createRequire(__filename);
const policy = loadModule(path.resolve("scripts/release-policy.js")) as Policy;

describe("release policy", () => {
  it("maps an odd minor to its versioned prerelease branch", () => {
    assert.equal(policy.getChannel("0.7.0"), "prerelease");
    assert.equal(
      policy.getExpectedSourceBranch("0.7.0"),
      "prerelease/0.7.x"
    );
  });

  it("maps an even minor to main", () => {
    assert.equal(policy.getChannel("0.8.0"), "stable");
    assert.equal(policy.getExpectedSourceBranch("0.8.0"), "main");
  });

  it("accepts only the exact even-version candidate branch", () => {
    assert.doesNotThrow(() =>
      policy.validateReleaseCandidateBranch("0.8.0", "release/0.8.0")
    );
    assert.throws(
      () => policy.validateReleaseCandidateBranch("0.8.0", "release/0.8.x"),
      /expected release\/0\.8\.0/i
    );
    assert.throws(
      () => policy.validateReleaseCandidateBranch("0.7.0", "release/0.7.0"),
      /stable candidate.*even minor/i
    );
  });

  for (const version of ["", "1", "1.2", "1.x.0", "1.2.0-beta.1"]) {
    it(`rejects malformed version ${JSON.stringify(version)}`, () => {
      assert.throws(() => policy.parseVersion(version), /major\.minor\.patch/i);
    });
  }
});
