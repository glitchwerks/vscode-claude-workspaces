import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import type { Approval, BuildApprovalInput, GitHubEvidence, GuardResult, PolicyState } from "../../scripts/release-enforcement/contracts";
import { createGitFixture, fixtureEvidence, fixturePr, fixtureSource } from "./helpers/releasePolicyFixture";

const loader = createRequire(__filename);
const engine = loader(path.resolve("scripts/release-enforcement/evaluate.js")) as {
  evaluatePublication(options: { repositoryPath: string; tag: string; commit: string; policy: PolicyState; github: GitHubEvidence }): Promise<GuardResult>;
};
const { buildApproval } = loader(path.resolve("scripts/release-enforcement/records.js")) as { buildApproval(repo: string, input: BuildApprovalInput): Approval };
const config = { schemaVersion: 1 as const, repository: { id: 1344170098, fullName: "glitchwerks/vscode-claude-workspaces", defaultBranch: "main" as const }, activePrerelease: "prerelease/0.9.x" };

describe("release publication scope", function () {
  this.timeout(60000);
  it("permits only the exact historical tag/commit and rejects a same-version replacement", async () => {
    assert.equal(typeof engine.evaluatePublication, "function", "publication preflight is missing");
    const f = createGitFixture();
    try {
      f.tag("v0.8.1", f.initialCommit);
      const source = { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 10, publishRunId: 20 };
      const approval = buildApproval(f.repo, { kind: "historical", mode: "full", targetVersion: "0.8.1", source, publishedTarget: source,
        baselineTag: "v0.8.1", candidateCommit: f.initialCommit, issue: 157, rationale: "Verified immutable retry", sourceCommits: [], sourcePullRequests: [] });
      const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [approval], dispositions: [] };
      const pr = fixturePr(f, { target: "main", head: "policy/157-fixture", version: "0.8.1" });
      const options = { repositoryPath: f.repo, tag: "v0.8.1", commit: f.initialCommit, policy, github: fixtureEvidence(pr) };
      assert.equal((await engine.evaluatePublication(options)).approvalId, approval.id);
      await assert.rejects(engine.evaluatePublication({ ...options, commit: pr.head.sha }), /E_HISTORICAL|E_TAG/);
      await assert.rejects(engine.evaluatePublication({ ...options, tag: "v0.8.0" }), /E_WITHDRAWN/);
      await assert.rejects(engine.evaluatePublication({ ...options, github: { ...fixtureEvidence(pr), publishedSource: async () => { throw new Error("E_EVIDENCE: unavailable source"); } } }), /E_EVIDENCE/);
    } finally { f.remove(); }
  });
  it("rechecks stable scope and verifies the exact merged candidate PR", async () => {
    assert.equal(typeof engine.evaluatePublication, "function", "publication preflight is missing");
    const f = createGitFixture();
    try {
      f.tag("v0.8.1", f.initialCommit);
      const cutoff = f.commit({ "src/feature.ts": "published feature" });
      const source = fixtureSource(f, cutoff);
      const pr = fixturePr(f, { target: "main", head: "release/0.10.0", version: "0.10.0" });
      const tree = f.git(["rev-parse", `${pr.head.sha}^{tree}`]);
      const mergedCommit = f.git(["commit-tree", tree, "-p", f.initialCommit, "-m", "squash promotion"]);
      f.tag("v0.10.0", mergedCommit);
      const approval = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", source,
        issue: 157, candidatePullRequest: 200, baselineTag: "v0.8.1", candidateCommit: pr.head.sha, sourceCommits: [], sourcePullRequests: [], rationale: "Frozen promotion" });
      const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [approval], dispositions: [] };
      const evidence = { ...fixtureEvidence(pr), pullRequest: async () => ({ ...pr, state: "closed", merged: true, mergeCommit: mergedCommit }) };
      const options = { repositoryPath: f.repo, tag: "v0.10.0", commit: mergedCommit, policy, github: evidence };
      assert.equal((await engine.evaluatePublication(options)).route, "promotion");
      await assert.rejects(engine.evaluatePublication({ ...options, github: fixtureEvidence(pr) }), /E_MERGED_CANDIDATE/);
      await assert.rejects(engine.evaluatePublication({ ...options, policy: { ...policy, approvals: [] } }), /E_APPROVAL/);
      const extra = f.commit({ "src/later.ts": "unapproved later feature" });
      f.git(["tag", "-f", "v0.10.0", extra]);
      await assert.rejects(engine.evaluatePublication({ ...options, commit: extra }), /E_SCOPE_CHANGED/);
    } finally { f.remove(); }
  });
  it("requires registered odd lines and matching main-owned publication authority", async () => {
    assert.equal(typeof engine.evaluatePublication, "function", "publication preflight is missing");
    const f = createGitFixture();
    try {
      const pr = fixturePr(f, { target: "prerelease/0.9.x", head: "feature/test", version: "0.9.0" });
      f.tag("v0.9.0", pr.head.sha);
      const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [], dispositions: [] };
      const options = { repositoryPath: f.repo, tag: "v0.9.0", commit: pr.head.sha, policy, github: fixtureEvidence(pr) };
      assert.equal((await engine.evaluatePublication(options)).route, "feature");
      await assert.rejects(engine.evaluatePublication({ ...options, policy: { ...policy, config: { ...config, activePrerelease: "prerelease/0.11.x" } } }), /E_ROUTE/);
      const tampered = f.commit({ "scripts/validate-release-source.js": "skip preflight" });
      f.git(["tag", "-f", "v0.9.0", tampered]);
      await assert.rejects(engine.evaluatePublication({ ...options, commit: tampered }), /E_AUTHORITY/);
    } finally { f.remove(); }
  });
});
