import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Approval, BuildApprovalInput, GuardResult, GitHubEvidence, PolicyState, PullRequestIdentity } from "../../scripts/release-enforcement/contracts";
import { createGitFixture, fixtureEvidence, fixturePr, fixtureSource, missingModule } from "./helpers/releasePolicyFixture";

type Options = { repositoryPath: string; pr: PullRequestIdentity; policy: PolicyState; github: GitHubEvidence };
const loader = createRequire(__filename);
const evaluate = missingModule<{ evaluatePullRequest(options: Options): Promise<GuardResult> }>("scripts/release-enforcement/evaluate.js", loader);
const runner = missingModule<{ runPrGuard(options: { automationRoot: string; eventPath: string; workflowRef: string; workflowSha: string; github: GitHubEvidence; fetchObjects: () => void }): Promise<GuardResult> }>("scripts/check-release-pr.js", loader);
const { buildApproval } = loader(path.resolve("scripts/release-enforcement/records.js")) as { buildApproval(repo: string, input: BuildApprovalInput): Approval };
const config = { schemaVersion: 1 as const, repository: { id: 1344170098, fullName: "glitchwerks/vscode-claude-workspaces", defaultBranch: "main" as const }, activePrerelease: "prerelease/0.9.x" };

function policy(f: ReturnType<typeof createGitFixture>): PolicyState {
  return { config, authorityCommit: f.initialCommit, approvals: [], dispositions: [] };
}

describe("release PR enforcement", function () {
  this.timeout(60000);
  for (const [target, head, version, allowed] of [
    ["prerelease/0.9.x", "feature/buttons", "0.9.0", true],
    ["main", "feature/buttons", "0.8.1", false],
    ["main", "prerelease/0.9.x", "0.10.0", false],
    ["prerelease/0.11.x", "feature/buttons", "0.11.0", false],
    ["prerelease/0.9.x", "feature/buttons", "0.11.0", false],
    ["main", "release/0.10.0", "0.10.1", false]
  ] as [string, string, string, boolean][]) {
    it(`${allowed ? "accepts" : "rejects"} ${head} to ${target} with ${version}`, async () => {
      assert.equal(typeof evaluate.evaluatePullRequest, "function", "PR routing is missing");
      const f = createGitFixture();
      try {
        const pr = fixturePr(f, { target, head, version });
        const call = evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: policy(f), github: fixtureEvidence(pr) });
        if (allowed) { assert.equal((await call).route, "feature"); }
        else { await assert.rejects(call, /E_ROUTE|E_VERSION/); }
      } finally { f.remove(); }
    });
  }
  it("allows explicit policy-only changes and rejects mixed product changes or foreign main candidates", async () => {
    assert.equal(typeof evaluate.evaluatePullRequest, "function", "PR routing is missing");
    const f = createGitFixture();
    try {
      const authority = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
      const state = { ...policy(f), authorityCommit: authority };
      const head = f.commit({ "README.md": "policy docs" });
      const pr: PullRequestIdentity = { number: 200, state: "open", head: { sha: head, ref: "policy/157-docs", repositoryId: config.repository.id },
        base: { sha: authority, ref: "main", repositoryId: config.repository.id } };
      assert.equal((await evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: state, github: fixtureEvidence(pr) })).route, "policy");
      f.tag("v0.8.1", authority);
      const record = buildApproval(f.repo, { kind: "historical", mode: "full", targetVersion: "0.8.1", issue: 999999,
        source: { tag: "v0.8.1", commit: authority, branch: "main", releaseId: 10, publishRunId: 20 },
        publishedTarget: { tag: "v0.8.1", commit: authority, branch: "main", releaseId: 10, publishRunId: 20 }, baselineTag: "v0.8.1",
        candidateCommit: authority, sourceCommits: [], sourcePullRequests: [], rationale: "Fixture approval" });
      const unlinked = { ...pr, head: { ...pr.head, sha: f.commit({ ".github/release-policy/approvals/new.json": JSON.stringify(record) }) } };
      await assert.rejects(evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr: unlinked, policy: state,
        github: { ...fixtureEvidence(unlinked), issue: async () => { throw new Error("E_EVIDENCE: missing issue"); } } }), /E_EVIDENCE/);
      const mixed = { ...pr, head: { ...pr.head, sha: f.commit({ "src/example.ts": "new feature" }) } };
      await assert.rejects(evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr: mixed, policy: state, github: fixtureEvidence(mixed) }), /E_POLICY_SCOPE/);
      const foreign = { ...pr, head: { ...pr.head, repositoryId: 99 } };
      await assert.rejects(evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr: foreign, policy: state, github: fixtureEvidence(foreign) }), /E_ROUTE/);
    } finally { f.remove(); }
  });
  it("accepts an approved published full promotion and rejects post-cutoff product or test additions", async () => {
    assert.equal(typeof evaluate.evaluatePullRequest, "function", "PR routing is missing");
    const f = createGitFixture();
    try {
      f.tag("v0.8.1", f.initialCommit);
      const cutoff = f.commit({ "src/approved.ts": "approved published feature" });
      const source = fixtureSource(f, cutoff);
      const pr = fixturePr(f, { target: "main", head: "release/0.10.0", version: "0.10.0" });
      const approval = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", source,
        issue: 157, candidatePullRequest: pr.number, baselineTag: "v0.8.1", candidateCommit: pr.head.sha,
        sourceCommits: [], sourcePullRequests: [], rationale: "Promote frozen cutoff" });
      const state = { ...policy(f), approvals: [approval] };
      assert.equal((await evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: state, github: fixtureEvidence(pr) })).route, "promotion");
      const later = { ...pr, head: { ...pr.head, sha: f.commit({ "src/later.ts": "post-cutoff feature" }) } };
      await assert.rejects(evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr: later, policy: state, github: fixtureEvidence(later) }), /E_SCOPE_CHANGED/);
      f.git(["checkout", "-b", "test-addition", pr.head.sha]);
      const extraTest = { ...pr, head: { ...pr.head, sha: f.commit({ "test/unit/extra.test.ts": "post-approval test" }) } };
      await assert.rejects(evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr: extraTest, policy: state, github: fixtureEvidence(extraTest) }), /E_SCOPE_CHANGED/);
      f.git(["checkout", "-b", "authority-addition", pr.head.sha]);
      const alteredGuard = { ...pr, head: { ...pr.head, sha: f.commit({ "scripts/check-release-pr.js": "disable guard after merge" }) } };
      await assert.rejects(evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr: alteredGuard, policy: state, github: fixtureEvidence(alteredGuard) }), /E_AUTHORITY/);
    } finally { f.remove(); }
  });
  it("requires exact hotfix approval and the next stable patch", async () => {
    assert.equal(typeof evaluate.evaluatePullRequest, "function", "PR routing is missing");
    const f = createGitFixture();
    try {
      f.tag("v0.8.1", f.initialCommit);
      f.commit({ "src/example.ts": "fixed regression" });
      const pr = fixturePr(f, { target: "main", head: "hotfix/0.8.2", version: "0.8.2" });
      const approval = buildApproval(f.repo, { kind: "hotfix", mode: "compatibility", targetVersion: "0.8.2", issue: 157,
        candidatePullRequest: 200, source: { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 10, publishRunId: 20 },
        baselineTag: "v0.8.1", candidateCommit: pr.head.sha, sourceCommits: [], sourcePullRequests: [], rationale: "Fix regression" });
      const state = { ...policy(f), approvals: [approval] };
      assert.equal((await evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: state, github: fixtureEvidence(pr) })).route, "hotfix");
      const changed = { ...pr, head: { ...pr.head, sha: f.commit({ "src/extra.ts": "extra" }) } };
      await assert.rejects(evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr: changed, policy: state, github: fixtureEvidence(changed) }), /E_SCOPE_CHANGED/);
    } finally { f.remove(); }
  });
  it("rejects a promotion from an older odd line into the current stable minor", async () => {
    const f = createGitFixture();
    try {
      f.tag("v0.8.1", f.initialCommit);
      f.tag("v0.7.2", f.initialCommit);
      const pr = fixturePr(f, { target: "main", head: "release/0.8.2", version: "0.8.2" });
      const approval = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.8.2", issue: 157,
        candidatePullRequest: 200, source: { tag: "v0.7.2", commit: f.initialCommit, branch: "prerelease/0.7.x", releaseId: 10, publishRunId: 20 },
        baselineTag: "v0.8.1", candidateCommit: pr.head.sha, sourceCommits: [], sourcePullRequests: [], rationale: "Old cutoff fixture" });
      await assert.rejects(evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: { ...policy(f), approvals: [approval] }, github: fixtureEvidence(pr) }), /E_VERSION/);
    } finally { f.remove(); }
  });
  it("rejects candidate publication authority changes on the prerelease route", async () => {
    assert.equal(typeof evaluate.evaluatePullRequest, "function", "PR routing is missing");
    const f = createGitFixture();
    try {
      const pr = fixturePr(f, { target: "prerelease/0.9.x", head: "feature/disable-policy", version: "0.9.0" });
      pr.head.sha = f.commit({ ".github/workflows/publish.yml": "candidate-controlled workflow" });
      await assert.rejects(evaluate.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: policy(f), github: fixtureEvidence(pr) }), /E_AUTHORITY/);
    } finally { f.remove(); }
  });
  it("refuses stale event identity, retargeting, and non-main workflow provenance", async () => {
    assert.equal(typeof runner.runPrGuard, "function", "trusted PR runner is missing");
    const f = createGitFixture();
    try {
      const authority = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
      const head = f.commit({ "README.md": "policy documentation" });
      const pr: PullRequestIdentity = { number: 200, state: "open", head: { sha: head, ref: "policy/157-docs", repositoryId: config.repository.id },
        base: { sha: authority, ref: "main", repositoryId: config.repository.id } };
      f.git(["checkout", "--detach", authority]);
      const eventPath = path.join(f.repo, "event.json");
      function event(identity: PullRequestIdentity) {
        fs.writeFileSync(eventPath, JSON.stringify({ number: identity.number, repository: { id: config.repository.id, full_name: config.repository.fullName },
          pull_request: { number: identity.number, head: { ...identity.head, repo: { id: identity.head.repositoryId } }, base: { ...identity.base, repo: { id: identity.base.repositoryId } } } }));
      }
      event(pr);
      const options = { automationRoot: f.repo, eventPath, workflowRef: `${config.repository.fullName}/.github/workflows/release-guard.yml@refs/heads/main`,
        workflowSha: authority, github: fixtureEvidence(pr), fetchObjects: () => {} };
      assert.equal((await runner.runPrGuard(options)).route, "policy");
      await assert.rejects(runner.runPrGuard({ ...options, workflowRef: options.workflowRef.replace("refs/heads/main", "refs/pull/200/merge") }), /E_POLICY_PROVENANCE/);
      await assert.rejects(runner.runPrGuard({ ...options, github: fixtureEvidence({ ...pr, base: { ...pr.base, ref: "prerelease/0.9.x" } }) }), /E_STALE_PR/);
      await assert.rejects(runner.runPrGuard({ ...options, github: fixtureEvidence({ ...pr, head: { ...pr.head, sha: "a".repeat(40) } }) }), /E_STALE_PR/);
      let reads = 0;
      await assert.rejects(runner.runPrGuard({ ...options, github: { ...fixtureEvidence(pr), pullRequest: async () => ++reads === 1 ? pr : { ...pr, base: { ...pr.base, sha: "b".repeat(40) } } } }), /E_STALE_PR/);
    } finally { f.remove(); }
  });
});
