import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createGitFixture, missingModule } from "./helpers/releasePolicyFixture";

type Entry = { path: string; mode: string; contentDigest: string };
type Snap = { productDigest: string; entries: Entry[] };
type Engine = {
  snapshot(repo: string, sha: string): Snap;
  diffScope(repo: string, base: string, head: string): { changeDigest: string; changes: unknown[] };
  isPolicyOnlyChange(repo: string, base: string, head: string): boolean;
};
const engine = missingModule<Engine>("scripts/release-enforcement/snapshot.js", createRequire(__filename));

describe("release enforcement snapshots", function () {
  this.timeout(30000);
  it("compares root version preparation without losing product edits", () => {
    assert.equal(typeof engine.snapshot, "function", "snapshot enforcement is missing");
    const f = createGitFixture();
    try {
      const a = f.initialCommit;
      const b = f.commit({ "package.json": JSON.stringify({ version: "0.10.0", engines: { vscode: "^1.120.0" } }),
        "package-lock.json": JSON.stringify({ version: "0.10.0", packages: { "": { version: "0.10.0" } } }) });
      assert.equal(engine.snapshot(f.repo, a).productDigest, engine.snapshot(f.repo, b).productDigest);
      const c = f.commit({ "src/example.ts": "export const value = 2;\n" });
      assert.notEqual(engine.snapshot(f.repo, b).productDigest, engine.snapshot(f.repo, c).productDigest);
    } finally { f.remove(); }
  });
  for (const [filename, text] of [
    ["package.json", '{"version":"0.8.1","engines":{"vscode":"^1.121.0"}}'],
    ["package.json", '{"version":"0.8.1","dependencies":{"foo":"2.0.0"}}'],
    ["package.json", '{"version":"0.8.1","scripts":{"build":"malicious"}}'],
    ["package.json", '{"version":"0.8.1","contributes":{"commands":[]}}'],
    ["package-lock.json", '{"version":"0.8.1","packages":{"":{"version":"0.8.1"},"node_modules/foo":{"version":"2.0.0","integrity":"changed"}}}'],
    ["esbuild.js", "different build"], [".vscodeignore", "different packaging"],
    ["media/test.bin", "binary input"], ["unknown/product-input", "new tracked input"]
  ]) {
    it(`includes product input ${filename}: ${text}`, () => {
      assert.equal(typeof engine.snapshot, "function", "snapshot enforcement is missing");
      const f = createGitFixture();
      try {
        const next = f.commit({ [filename!]: text! });
        assert.notEqual(engine.snapshot(f.repo, f.initialCommit).productDigest, engine.snapshot(f.repo, next).productDigest);
      } finally { f.remove(); }
    });
  }
  it("binds supporting tests while allowing registered policy and documentation changes", () => {
    assert.equal(typeof engine.diffScope, "function", "diff scope enforcement is missing");
    const f = createGitFixture();
    try {
      const policy = f.commit({ "README.md": "new instructions", "scripts/check-release-pr.js": "guard" });
      assert.equal(engine.isPolicyOnlyChange(f.repo, f.initialCommit, policy), true);
      assert.equal(engine.snapshot(f.repo, policy).productDigest, engine.snapshot(f.repo, f.initialCommit).productDigest);
      const test = f.commit({ "test/unit/feature.test.ts": "new supporting test" });
      assert.equal(engine.isPolicyOnlyChange(f.repo, policy, test), false);
      assert.notEqual(engine.diffScope(f.repo, f.initialCommit, policy).changeDigest, engine.diffScope(f.repo, f.initialCommit, test).changeDigest);
    } finally { f.remove(); }
  });
  it("retains binary bytes, deletions, modes and control characters in Git paths", () => {
    assert.equal(typeof engine.snapshot, "function", "snapshot enforcement is missing");
    const f = createGitFixture();
    try {
      const a = f.commit({ "media/test.bin": Buffer.from([0, 255, 13, 10]) });
      const b = f.commit({ "media/test.bin": Buffer.from([0, 254, 13, 10]) });
      assert.notEqual(engine.snapshot(f.repo, a).productDigest, engine.snapshot(f.repo, b).productDigest);
      const deleted = f.commit({ "media/test.bin": null });
      assert.notEqual(engine.snapshot(f.repo, b).productDigest, engine.snapshot(f.repo, deleted).productDigest);
      const blob = f.git(["hash-object", "-w", "--stdin"], "link-target");
      f.git(["update-index", "--add", "--cacheinfo", `120000,${blob},link`]);
      f.git(["commit", "-m", "object modes"]);
      const objectCommit = f.git(["rev-parse", "HEAD"]);
      const snap = engine.snapshot(f.repo, objectCommit);
      assert.equal(snap.entries.find(e => e.path === "link")?.mode, "120000");
      const tree = f.git(["mktree", "-z"], f.git(["ls-tree", "-z", "HEAD"]) +
        `100644 blob ${blob}\ttab\tnewline\nfile\0`);
      const pathCommit = f.git(["commit-tree", tree, "-p", objectCommit, "-m", "control path"]);
      assert.ok(engine.snapshot(f.repo, pathCommit).entries.some(e => e.path === "tab\tnewline\nfile"));
      f.git(["update-index", "--cacheinfo", `100644,${blob},link`]);
      f.git(["commit", "-m", "mode change"]);
      assert.notEqual(snap.productDigest, engine.snapshot(f.repo, f.git(["rev-parse", "HEAD"])).productDigest);
      f.git(["update-index", "--add", "--cacheinfo", `160000,${f.initialCommit},submodule`]);
      f.git(["commit", "-m", "gitlink"]);
      assert.throws(() => engine.snapshot(f.repo, f.git(["rev-parse", "HEAD"])), /E_UNSUPPORTED_GITLINK/);
    } finally { f.remove(); }
  });
  it("ignores only registered test script fields, and rejects inconsistent root lock versions", () => {
    assert.equal(typeof engine.snapshot, "function", "snapshot enforcement is missing");
    const f = createGitFixture();
    try {
      const a = f.commit({ "package.json": '{"version":"0.8.1","scripts":{"test:release-policy":"old","build":"node esbuild.js"}}' });
      const b = f.commit({ "package.json": '{"version":"0.8.1","scripts":{"test:release-policy":"new","build":"node esbuild.js"}}' });
      assert.equal(engine.snapshot(f.repo, a).productDigest, engine.snapshot(f.repo, b).productDigest);
      assert.equal(engine.isPolicyOnlyChange(f.repo, a, b), true);
      const c = f.commit({ "package-lock.json": '{"version":"0.1.0","packages":{"":{"version":"0.8.1"}}}' });
      assert.throws(() => engine.snapshot(f.repo, c), /E_ROOT_VERSION/);
    } finally { f.remove(); }
  });
});
