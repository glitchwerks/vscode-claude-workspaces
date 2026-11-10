import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { createGitFixture } from "./helpers/releasePolicyFixture";

const loader = createRequire(__filename);
const { getChannel, getExpectedSourceBranch } = loader(path.resolve("scripts/release-policy.js")) as {
  getChannel(version: string): "stable" | "prerelease";
  getExpectedSourceBranch(version: string): string;
};
const read = (file: string) => fs.readFileSync(file, "utf8");
const manifest = () => JSON.parse(read("package.json")) as { version: string; vsce?: { githubBranch?: string } };
const receipt = "https://github.com/glitchwerks/vscode-claude-workspaces/issues/217#issuecomment-6673727185";
const { isPolicyOnlyChange } = loader(path.resolve("scripts/release-enforcement/snapshot.js")) as {
  isPolicyOnlyChange(repo: string, base: string, head: string): boolean;
};
const { snapshot } = loader(path.resolve("scripts/release-enforcement/snapshot.js")) as {
  snapshot(repo: string, ref: string): { productDigest: string };
};

describe("current release-channel authority", () => {
  for (const mode of ["100755", "120000"]) {
    it(`rejects contributor mode ${mode} as a policy-only documentation update`, function () {
      this.timeout(30000);
      const fixture = createGitFixture();
      try {
        const before = fixture.commit({ "CONTRIBUTING.md": "Contributor guidance\n" });
        const blob = fixture.git(["rev-parse", `${before}:CONTRIBUTING.md`]);
        fixture.git(["update-index", "--cacheinfo", `${mode},${blob},CONTRIBUTING.md`]);
        const tree = fixture.git(["write-tree"]);
        const after = fixture.git(["commit-tree", tree, "-p", before, "-m", "contributor mode mutation"]);
        assert.equal(isPolicyOnlyChange(fixture.repo, before, after), false);
      } finally { fixture.remove(); }
    });
  }
  it("preserves contributor bytes in historical product fingerprints while admitting policy documentation", function () {
    this.timeout(30000);
    const fixture = createGitFixture();
    try {
      const before = fixture.commit({ "CONTRIBUTING.md": "Original contributor guidance\n" });
      const after = fixture.commit({ "CONTRIBUTING.md": "Updated contributor guidance\n" });
      assert.notEqual(snapshot(fixture.repo, before).productDigest, snapshot(fixture.repo, after).productDigest,
        "Existing exact-release approvals must keep their historical fingerprint inputs");
      assert.equal(isPolicyOnlyChange(fixture.repo, before, after), true);
    } finally { fixture.remove(); }
  });
  it("admits contributor policy Markdown while retaining asset-test and product ownership", function () {
    this.timeout(30000);
    const fixture = createGitFixture();
    try {
      const documentation = fixture.commit({ "CONTRIBUTING.md": "Contributor policy guidance\n" });
      assert.equal(isPolicyOnlyChange(fixture.repo, fixture.initialCommit, documentation), true);
      const assets = fixture.commit({ "test/unit/packageAssets.test.ts": "unapproved supporting-test edit\n" });
      assert.equal(isPolicyOnlyChange(fixture.repo, documentation, assets), false);
      const product = fixture.commit({ "src/extra.ts": "unapproved product edit\n" });
      assert.equal(isPolicyOnlyChange(fixture.repo, assets, product), false);
    } finally { fixture.remove(); }
  });
  it("registers 0.13.x while preserving the stable package until feature-route initialization", () => {
    const config = JSON.parse(read(".github/release-policy/config.json")) as { activePrerelease: string };
    assert.equal(config.activePrerelease, "prerelease/0.13.x");
    const pkg = manifest();
    const lock = JSON.parse(read("package-lock.json")) as { version: string; packages: Record<string, { version?: string }> };
    assert.equal(lock.version, pkg.version);
    assert.equal(lock.packages[""]?.version, pkg.version);
    if (getChannel(pkg.version) === "stable") {
      assert.equal(pkg.version, "0.12.0");
      assert.equal(pkg.vsce?.githubBranch, "prerelease/0.11.x", "Policy registration must preserve the published product manifest");
    } else {
      assert.match(pkg.version, /^0\.13\.(0|[1-9]\d*)$/);
      assert.equal(getExpectedSourceBranch(pkg.version), config.activePrerelease);
      assert.equal(pkg.vsce?.githubBranch, config.activePrerelease);
    }
  });
  it("reports published stable 0.12.0 and separates the unshipped 0.13 development line", () => {
    const policy = read("docs/versioning-policy.md");
    assert.match(policy, /Current stable version:\s*`0\.12\.0`/i);
    assert.match(policy, /Latest published testing prerelease:\s*`0\.11\.3`/i);
    assert.match(policy, /Active development pre-release line:\s*`0\.13\.x`/i);
    assert.ok(policy.includes(receipt));
    const readme = read("README.md");
    const guide = read("docs/user-guide.md");
    for (const document of [readme, guide]) {
      assert.match(document, /stable\s+\*\*0\.12\.0\*\*\s+is published/i);
      assert.match(document, /0\.13\.x/);
      assert.doesNotMatch(document.slice(0, 3200), /current stable channel remains\s+\*\*0\.10\.0|checkout prepares the\s+\*\*0\.12\.0 stable candidate/i);
    }
    const contributing = read("CONTRIBUTING.md");
    assert.match(contributing, /Feature pull requests target `prerelease\/0\.13\.x`/i);
    assert.match(contributing, /active development integration branch is `prerelease\/0\.13\.x`/i);
  });
  it("retains nonempty notes for the package identity and published promotion receipt", () => {
    const changelog = read("CHANGELOG.md");
    const versions = [...changelog.matchAll(/^## \[([^\]]+)\]/gm)].map(match => match[1]);
    assert.deepEqual(versions.slice(0, 2), ["Unreleased", manifest().version]);
    const current = changelog.split(`## [${manifest().version}]`)[1]?.split(/^## \[/m)[0];
    assert.ok(current?.trim(), "The package identity needs nonempty release notes");
    const stable = changelog.split("## [0.12.0]")[1]?.split(/^## \[/m)[0];
    assert.ok(stable?.includes(receipt), "Historical preparation wording must be accompanied by its publication receipt");
  });
});
