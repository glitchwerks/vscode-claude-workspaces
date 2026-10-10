import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { Approval, BuildApprovalInput, GitHubEvidence, GuardResult, PolicyState, PullRequestIdentity } from "../../scripts/release-enforcement/contracts";
import { createGitFixture, fixtureEvidence, fixturePr, fixtureSource } from "./helpers/releasePolicyFixture";

const loader = createRequire(__filename);
const { buildApproval } = loader(path.resolve("scripts/release-enforcement/records.js")) as { buildApproval(repo: string, input: BuildApprovalInput): Approval };
const engine = loader(path.resolve("scripts/release-enforcement/evaluate.js")) as {
  evaluatePullRequest(options: { repositoryPath: string; pr: PullRequestIdentity; policy: PolicyState; github: GitHubEvidence }): Promise<GuardResult>;
  evaluatePublication(options: { repositoryPath: string; tag: string; commit: string; policy: PolicyState; github: GitHubEvidence }): Promise<GuardResult>;
};
const config = { schemaVersion: 1 as const, repository: { id: 1344170098, fullName: "glitchwerks/vscode-claude-workspaces", defaultBranch: "main" as const }, activePrerelease: "prerelease/0.9.x" };

// These regressions exercise real committed trees, not policy-path classification alone.
describe("release feedback authority regressions", function () {
  this.timeout(60000);
  for (const [filename, contents] of [
    ["test/unit/helpers/releasePolicyFixture.ts", "require('node:fs').writeFileSync('src/example.ts', 'poison');"],
    ["test/unit/releaseEnforcementRecords.test.ts", null],
    ["test/unit/releaseEnforcementPoison.test.ts", "require('node:fs').writeFileSync('dist/extension.js', 'poison');"],
    ["docs/imported-policy-module.js", "module.exports = 'poison';"]
  ] as [string, string | null][]) {
    for (const entry of ["PR", "publication"]) {
      it(`rejects post-approval ${entry} authority change in ${filename}`, async () => {
        const f = createGitFixture();
        try {
          const trusted = f.commit({
            ".github/release-policy/config.json": JSON.stringify(config),
            "test/unit/helpers/releasePolicyFixture.ts": "export const helper = true;",
            "test/unit/releaseEnforcementRecords.test.ts": "export const safe = true;"
          });
          f.tag("v0.8.1", trusted);
          const cutoff = f.commit({ "src/approved.ts": "published feature" });
          const source = fixtureSource(f, cutoff);
          const pr = fixturePr(f, { target: "main", head: "release/0.10.0", version: "0.10.0" });
          pr.base.sha = trusted;
          const approval = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", source,
            issue: 157, candidatePullRequest: 200, baselineTag: "v0.8.1", candidateCommit: pr.head.sha,
            sourceCommits: [], sourcePullRequests: [], rationale: "Frozen published feature" });
          const policy: PolicyState = { config, authorityCommit: trusted, approvals: [approval], dispositions: [] };
          assert.equal((await engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy, github: fixtureEvidence(pr) })).route, "promotion");
          pr.head.sha = f.commit({ [filename]: contents });
          if (entry === "PR") {
            await assert.rejects(engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy, github: fixtureEvidence(pr) }), /E_AUTHORITY/);
          } else {
            const tree = f.git(["rev-parse", `${pr.head.sha}^{tree}`]);
            const merged = f.git(["commit-tree", tree, "-p", trusted, "-m", "squash candidate"]);
            f.tag("v0.10.0", merged);
            const github = { ...fixtureEvidence(pr), pullRequest: async () => ({ ...pr, state: "closed", merged: true, mergeCommit: merged }) };
            await assert.rejects(engine.evaluatePublication({ repositoryPath: f.repo, tag: "v0.10.0", commit: merged, policy, github }), /E_AUTHORITY/);
          }
        } finally { f.remove(); }
      });
    }
  }
  it("admits executable policy-test changes through the separate main policy route", async () => {
    const f = createGitFixture();
    try {
      const base = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
      const head = f.commit({ "test/unit/releaseEnforcementApproved.test.ts": "export const approved = true;", "docs/design.md": "Updated policy explanation" });
      const pr: PullRequestIdentity = { number: 200, state: "open", head: { sha: head, ref: "policy/157-test-authority", repositoryId: config.repository.id },
        base: { sha: base, ref: "main", repositoryId: config.repository.id } };
      assert.equal((await engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: { config, authorityCommit: base, approvals: [], dispositions: [] }, github: fixtureEvidence(pr) })).route, "policy");
    } finally { f.remove(); }
  });
});

describe("release snapshot read caching", function () {
  this.timeout(60000);
  it("reuses immutable Git blobs and normalized commit entries across repeated comparisons", () => {
    const f = createGitFixture();
    try {
      const first = f.commit({ "media/shared.bin": Buffer.from([0, 255, 13, 10]) });
      const renamed = f.commit({ "media/shared.bin": null, "media/renamed.bin": Buffer.from([0, 255, 13, 10]) });
      const script = `
        const cp = require('node:child_process');
        const original = cp.spawnSync; let blobs = 0;
        cp.spawnSync = function(...args) {
          if (args[0] === 'git' && args[1].includes('cat-file')) blobs++;
          return original.apply(this, args);
        };
        const engine = require('./scripts/release-enforcement/snapshot.js');
        const [repo, first, renamed] = process.argv.slice(1);
        const a = engine.snapshot(repo, first); const firstReads = blobs;
        const b = engine.snapshot(repo, first); const repeatedReads = blobs - firstReads;
        const beforeRename = blobs;
        const c = engine.snapshot(repo, renamed); const renameReads = blobs - beforeRename;
        engine.diffScope(repo, first, renamed);
        console.log(JSON.stringify({ firstReads, repeatedReads, renameReads,
          firstDigest: a.productDigest, repeatedDigest: b.productDigest, renamedDigest: c.productDigest,
          oldPath: a.entries.some(e => e.path === 'media/shared.bin'),
          newPath: c.entries.some(e => e.path === 'media/renamed.bin') }));
      `;
      const result = spawnSync(process.execPath, ["-e", script, f.repo, first, renamed], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      const evidence = JSON.parse(result.stdout) as { firstReads: number; repeatedReads: number; renameReads: number; firstDigest: string; repeatedDigest: string; renamedDigest: string; oldPath: boolean; newPath: boolean };
      assert.ok(evidence.firstReads > 0);
      assert.equal(evidence.repeatedReads, 0, "Repeated snapshots must not spawn one blob subprocess per entry");
      assert.equal(evidence.renameReads, 0, "Identical blob bytes at another path reuse only content, not entry identity");
      assert.equal(evidence.firstDigest, evidence.repeatedDigest);
      assert.notEqual(evidence.firstDigest, evidence.renamedDigest);
      assert.equal(evidence.oldPath, true);
      assert.equal(evidence.newPath, true);
    } finally { f.remove(); }
  });
});
