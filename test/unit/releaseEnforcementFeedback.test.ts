import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { Approval, BuildApprovalInput, GitHubEvidence, GuardResult, PolicyState, PullRequestIdentity, PublicationSource } from "../../scripts/release-enforcement/contracts";
import { createGitFixture, fixtureEvidence, fixturePr, fixtureSource } from "./helpers/releasePolicyFixture";

const loader = createRequire(__filename);
const { buildApproval } = loader(path.resolve("scripts/release-enforcement/records.js")) as { buildApproval(repo: string, input: BuildApprovalInput & { publishedTarget?: PublicationSource }): Approval };
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

describe("historical target evidence regressions", function () {
  this.timeout(60000);
  function setup() {
    const f = createGitFixture();
    f.tag("v0.7.2", f.initialCommit);
    const source: PublicationSource = { tag: "v0.7.2", commit: f.initialCommit, branch: "prerelease/0.7.x", releaseId: 10, publishRunId: 20 };
    const pr = fixturePr(f, { target: "main", head: "policy/157-history", version: "0.8.1" });
    f.tag("v0.8.1", pr.head.sha);
    const publishedTarget: PublicationSource = { tag: "v0.8.1", commit: pr.head.sha, branch: "main", releaseId: 30, publishRunId: 40 };
    const input: BuildApprovalInput & { publishedTarget?: PublicationSource } = { kind: "historical", mode: "full", targetVersion: "0.8.1", source,
      publishedTarget, baselineTag: "v0.7.2", candidateCommit: pr.head.sha, issue: 157,
      sourceCommits: [], sourcePullRequests: [], rationale: "Previously published retry" };
    return { f, pr, source, publishedTarget, input };
  }
  it("requires exact target tag, commit and branch evidence in historical records", () => {
    const { f, input, publishedTarget } = setup();
    try {
      assert.throws(() => buildApproval(f.repo, { ...input, publishedTarget: undefined }), /E_SCHEMA/);
      for (const bad of [
        { ...publishedTarget, tag: "v0.8.2" },
        { ...publishedTarget, commit: f.initialCommit },
        { ...publishedTarget, branch: "prerelease/0.9.x" },
        { ...publishedTarget, releaseId: 0 },
        { ...publishedTarget, publishRunId: 0 }
      ]) {
        assert.throws(() => buildApproval(f.repo, { ...input, publishedTarget: bad }), /E_SCHEMA/);
      }
    } finally { f.remove(); }
  });
  it("rejects never-published targets despite a valid published source cutoff", async () => {
    const { f, pr, input, publishedTarget } = setup();
    try {
      const approval = buildApproval(f.repo, input);
      const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [approval], dispositions: [] };
      const github = { ...fixtureEvidence(pr), publishedSource: async (identity: PublicationSource) => {
        if (identity.tag === publishedTarget.tag) { throw new Error("E_EVIDENCE: target never published"); }
      } };
      await assert.rejects(engine.evaluatePublication({ repositoryPath: f.repo, tag: publishedTarget.tag, commit: publishedTarget.commit, policy, github }), /E_EVIDENCE/);
      assert.equal((await engine.evaluatePublication({ repositoryPath: f.repo, tag: publishedTarget.tag, commit: publishedTarget.commit, policy, github: fixtureEvidence(pr) })).approvalId, approval.id);
    } finally { f.remove(); }
  });
  it("rejects a handwritten historical approval PR whose target evidence is unavailable", async () => {
    const { f, pr, input, publishedTarget } = setup();
    try {
      const base = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
      const approval = buildApproval(f.repo, input);
      pr.base.sha = base;
      pr.head.sha = f.commit({ ".github/release-policy/approvals/history.json": JSON.stringify(approval) });
      const policy: PolicyState = { config, authorityCommit: base, approvals: [], dispositions: [] };
      await assert.rejects(engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy,
        github: { ...fixtureEvidence(pr), publishedSource: async (identity: PublicationSource) => {
          if (identity.tag === publishedTarget.tag) { throw new Error("E_EVIDENCE: target publication missing"); }
        } } }), /E_EVIDENCE/);
    } finally { f.remove(); }
  });
});

describe("historical branch retirement", function () {
  this.timeout(60000);
  it("retries a proven historical target after its old source branch is deleted while ordinary evidence fails closed", async () => {
    const f = createGitFixture();
    try {
      f.tag("v0.7.2", f.initialCommit);
      f.tag("v0.8.1", f.initialCommit);
      const source: PublicationSource = { tag: "v0.7.2", commit: f.initialCommit, branch: "prerelease/0.7.x", releaseId: 10, publishRunId: 20 };
      const target: PublicationSource = { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 30, publishRunId: 40 };
      const approval = buildApproval(f.repo, { kind: "historical", mode: "full", targetVersion: "0.8.1", source,
        publishedTarget: target, baselineTag: "v0.7.2", candidateCommit: f.initialCommit, issue: 157,
        sourceCommits: [], sourcePullRequests: [], rationale: "Retired-source immutable retry" });
      const adapter = loader(path.resolve("scripts/release-enforcement/github.js")) as { createGitHubEvidence(options: { repository: typeof config.repository; fetchImpl: typeof fetch }): GitHubEvidence };
      function evidence(missingTarget = false) {
        const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
          const route = new URL(String(input)).pathname.split("/vscode-claude-workspaces")[1]!;
          let data: unknown;
          if (route === "") { data = { id: config.repository.id, full_name: config.repository.fullName }; }
          else if (route.startsWith("/git/ref/tags/")) { data = { object: { type: "commit", sha: f.initialCommit } }; }
          else if (route.startsWith("/releases/")) {
            const id = Number(route.split("/").at(-1));
            if (id === 30 && missingTarget) { return new Response("{}", { status: 404 }); }
            data = { id, tag_name: id === 10 ? source.tag : target.tag, draft: false, prerelease: id === 10, published_at: "2026-10-10" };
          } else if (route.startsWith("/actions/runs/")) {
            const id = Number(route.split("/").at(-1));
            data = { id, repository: { id: config.repository.id }, head_sha: f.initialCommit, head_branch: id === 20 ? source.tag : target.tag,
              path: ".github/workflows/publish.yml", event: "push", status: "completed", conclusion: "success" };
          } else if (route.startsWith("/compare/")) { return new Response("{}", { status: 404 }); }
          else { throw new Error(`Unexpected API route ${route}`); }
          return new Response(JSON.stringify(data), { status: 200 });
        }) as typeof fetch;
        return adapter.createGitHubEvidence({ repository: config.repository, fetchImpl });
      }
      const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [approval], dispositions: [] };
      const options = { repositoryPath: f.repo, tag: target.tag, commit: target.commit, policy };
      await assert.rejects(evidence().publishedSource(source), /E_EVIDENCE/);
      assert.equal((await engine.evaluatePublication({ ...options, github: evidence() })).approvalId, approval.id);
      await assert.rejects(engine.evaluatePublication({ ...options, github: evidence(true) }), /E_EVIDENCE/);
    } finally { f.remove(); }
  });
});

describe("historical supersession regressions", function () {
  this.timeout(60000);
  it("honors the active replacement chain in either ledger order and prevents nonhistorical supersession from falling back", async () => {
    const f = createGitFixture();
    try {
      f.tag("v0.8.1", f.initialCommit);
      const source: PublicationSource = { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 10, publishRunId: 20 };
      const input: BuildApprovalInput = { kind: "historical", mode: "full", targetVersion: "0.8.1", source, publishedTarget: source,
        baselineTag: "v0.8.1", candidateCommit: f.initialCommit, issue: 157, sourceCommits: [], sourcePullRequests: [], rationale: "Original retry" };
      const original = buildApproval(f.repo, input);
      const replacement = buildApproval(f.repo, { ...input, publishedTarget: { ...source, releaseId: 30 }, supersedes: original.id, rationale: "Replacement target proof" });
      const final = buildApproval(f.repo, { ...input, publishedTarget: { ...source, releaseId: 40 }, supersedes: replacement.id, rationale: "Final reviewed target proof" });
      const pr = fixturePr(f, { target: "main", head: "release/0.8.1", version: "0.8.1" });
      const options = { repositoryPath: f.repo, tag: source.tag, commit: source.commit };
      for (const approvals of [[original, replacement, final], [final, replacement, original]]) {
        const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals, dispositions: [] };
        await assert.rejects(engine.evaluatePublication({ ...options, policy,
          github: { ...fixtureEvidence(pr), publishedSource: async identity => {
            if (identity.releaseId === 40) { throw new Error("E_EVIDENCE: active target proof unavailable"); }
          } } }), /E_EVIDENCE/);
        assert.equal((await engine.evaluatePublication({ ...options, policy, github: fixtureEvidence(pr) })).approvalId, final.id);
      }
      const productReplacement = buildApproval(f.repo, { ...input, kind: "hotfix", mode: "compatibility", publishedTarget: undefined,
        candidatePullRequest: pr.number, supersedes: original.id, rationale: "Product route supersedes historical retry" });
      await assert.rejects(engine.evaluatePublication({ ...options,
        policy: { config, authorityCommit: f.initialCommit, approvals: [original, productReplacement], dispositions: [] }, github: fixtureEvidence(pr) }), /E_MERGED_CANDIDATE/);
    } finally { f.remove(); }
  });
});
