import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import type { Approval, BuildApprovalInput, GitHubEvidence, GuardResult, PolicyState, PullRequestEvaluationInput } from "../../scripts/release-enforcement/contracts";
import { createGitFixture, fixtureEvidence, fixturePr } from "./helpers/releasePolicyFixture";

const loader = createRequire(__filename);
const engine = loader(path.resolve("scripts/release-enforcement/evaluate.js")) as {
  evaluatePullRequest(options: PullRequestEvaluationInput): Promise<GuardResult>;
  evaluatePublication(options: { repositoryPath: string; tag: string; commit: string; policy: PolicyState; github: GitHubEvidence }): Promise<GuardResult>;
};
const { buildApproval } = loader(path.resolve("scripts/release-enforcement/records.js")) as {
  buildApproval(repo: string, input: BuildApprovalInput): Approval;
};
const config = {
  schemaVersion: 1 as const,
  repository: { id: 1344170098, fullName: "glitchwerks/vscode-claude-workspaces", defaultBranch: "main" as const },
  activePrerelease: "prerelease/0.11.x"
};

describe("release line rollover", function () {
  this.timeout(60000);

  for (const [target, version, allowed] of [
    ["prerelease/0.11.x", "0.11.0", true],
    ["prerelease/0.9.x", "0.9.0", false],
    ["prerelease/0.11.x", "0.9.0", false],
    ["prerelease/0.13.x", "0.13.0", false]
  ] as const) {
    it(`${allowed ? "admits" : "rejects"} ${version} to ${target} after registration`, async () => {
      const f = createGitFixture();
      try {
        const pr = fixturePr(f, { target, version, head: "feature/183-rollover" });
        const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [], dispositions: [] };
        const call = engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy, github: fixtureEvidence(pr) });
        if (allowed) {
          assert.equal((await call).route, "feature");
          f.tag(`v${version}`, pr.head.sha);
          assert.equal((await engine.evaluatePublication({ repositoryPath: f.repo, tag: `v${version}`, commit: pr.head.sha, policy, github: fixtureEvidence(pr) })).route, "feature");
        } else {
          await assert.rejects(call, /E_ROUTE|E_VERSION/);
        }
      } finally { f.remove(); }
    });
  }

  for (const [version, branch, route] of [
    ["0.9.0", "prerelease/0.9.x", "feature"],
    ["0.10.0", "main", "promotion"]
  ] as const) {
    it(`retains only the exact published ${version} retry after authority rollover`, async () => {
      const f = createGitFixture();
      try {
        const pr = fixturePr(f, { target: branch, version, head: "policy/183-retry-fixture" });
        const tag = `v${version}`;
        f.tag(tag, pr.head.sha);
        const source = { tag, commit: pr.head.sha, branch, releaseId: 10, publishRunId: 20 };
        const authority = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
        const policy: PolicyState = { config, authorityCommit: authority, approvals: [], dispositions: [] };
        const options = { repositoryPath: f.repo, tag, commit: pr.head.sha, policy, github: fixtureEvidence(pr) };

        // Neither an unregistered old line nor changed stable authority is silently exempted.
        await assert.rejects(engine.evaluatePublication(options), /E_ROUTE|E_AUTHORITY/);

        const record = buildApproval(f.repo, {
          kind: "historical", mode: "full", targetVersion: version, issue: 183,
          source, publishedTarget: source, baselineTag: tag, candidateCommit: source.commit,
          sourceCommits: [], sourcePullRequests: [], rationale: "Verified exact published retry after line rollover"
        });
        const calls: { tag: string; historical: boolean | undefined }[] = [];
        const historicalOptions = {
          ...options, policy: { ...policy, approvals: [record] },
          github: { ...options.github, publishedSource: async (value: typeof source, evidenceOptions?: { historical?: boolean }) => {
            calls.push({ tag: value.tag, historical: evidenceOptions?.historical });
          } }
        };
        const result = await engine.evaluatePublication(historicalOptions);
        assert.equal(result.route, route);
        assert.equal(result.approvalId, record.id);
        assert.deepEqual(calls, [{ tag, historical: true }, { tag, historical: true }]);
        await assert.rejects(engine.evaluatePublication({ ...historicalOptions,
          github: { ...options.github, publishedSource: async () => { throw new Error("E_EVIDENCE: missing published target"); } }
        }), /E_EVIDENCE/);

        const replacement = f.commit({ "src/example.ts": "unpublished replacement" });
        f.git(["tag", "-f", tag, replacement]);
        await assert.rejects(engine.evaluatePublication({ ...historicalOptions, commit: replacement }), /E_HISTORICAL/);
      } finally { f.remove(); }
    });
  }
});
