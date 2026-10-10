import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { Approval, Disposition, GitHubEvidence, PolicyState } from "../../scripts/release-enforcement/contracts";
import { createGitFixture, fixtureEvidence, fixturePr, missingModule } from "./helpers/releasePolicyFixture";

type AuthorEvidence = GitHubEvidence & { issue(number: number): Promise<void> };
type Options = { repositoryPath: string; policy: PolicyState; github: AuthorEvidence };
const author = missingModule<{ runAuthoring(args: string[], options: Options): Promise<Approval | Disposition> }>("scripts/prepare-release-approval.js", createRequire(__filename));
const config = { schemaVersion: 1 as const, repository: { id: 1344170098, fullName: "glitchwerks/vscode-claude-workspaces", defaultBranch: "main" as const }, activePrerelease: "prerelease/0.9.x" };
function prepare() {
  const f = createGitFixture();
  f.tag("v0.8.1", f.initialCommit);
  f.commit({ "src/example.ts": "fix regression\n" });
  const pr = fixturePr(f, { target: "main", head: "hotfix/0.8.2", version: "0.8.2" });
  const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [], dispositions: [] };
  const github: AuthorEvidence = { ...fixtureEvidence(pr), issue: async () => {} };
  const args = ["prepare-hotfix", "--version", "0.8.2", "--baseline-tag", "v0.8.1", "--baseline-commit", f.initialCommit,
    "--baseline-release-id", "10", "--baseline-run-id", "20", "--candidate-pr", "200", "--issue", "157", "--rationale", "Correct regression"];
  return { f, pr, policy, github, args, options: { repositoryPath: f.repo, policy, github } };
}

describe("release approval authoring", function () {
  this.timeout(60000);
  it("prepares exact scope without writes unless an exclusive record output is requested", async () => {
    assert.equal(typeof author.runAuthoring, "function", "record authoring is missing");
    const { f, args, options } = prepare();
    try {
      const record = await author.runAuthoring(args, options) as Approval;
      assert.equal(record.kind, "hotfix");
      assert.equal(record.targetVersion, "0.8.2");
      assert.equal(record.candidatePullRequest, 200);
      assert.ok(record.changes.some(change => change.path === "src/example.ts"));
      assert.equal(fs.existsSync(path.join(f.repo, ".github/release-policy")), false);
      const output = ".github/release-policy/approvals/fixture.json";
      await author.runAuthoring([...args, "--output", output], options);
      const text = fs.readFileSync(path.join(f.repo, output), "utf8");
      assert.deepEqual(JSON.parse(text), record);
      assert.doesNotMatch(text, /(?<!\r)\n/);
      await assert.rejects(author.runAuthoring([...args, "--output", output], options), /E_OUTPUT/);
      await assert.rejects(author.runAuthoring([...args, "--output", "../outside.json"], options), /E_OUTPUT/);
    } finally { f.remove(); }
  });
  it("rejects implicit tips, omitted explicit inputs, stale candidates and nonexistent issues", async () => {
    assert.equal(typeof author.runAuthoring, "function", "record authoring is missing");
    const { f, pr, args, options } = prepare();
    try {
      await assert.rejects(author.runAuthoring(["prepare-hotfix", "--version", "0.8.2"], options), /E_INPUT/);
      const tipArgs = args.map(value => value === f.initialCommit ? "HEAD" : value);
      await assert.rejects(author.runAuthoring(tipArgs, options), /E_INPUT/);
      let reads = 0;
      await assert.rejects(author.runAuthoring(args, { ...options, github: { ...options.github,
        pullRequest: async () => ++reads === 1 ? pr : { ...pr, head: { ...pr.head, sha: "a".repeat(40) } } } }), /E_STALE_PR/);
      await assert.rejects(author.runAuthoring(args, { ...options, github: { ...options.github,
        issue: async () => { throw new Error("E_EVIDENCE: nonexistent issue"); } } }), /E_EVIDENCE/);
    } finally { f.remove(); }
  });
  it("rejects selective commits beyond the explicit published cutoff", async () => {
    assert.equal(typeof author.runAuthoring, "function", "record authoring is missing");
    const { f, pr, options } = prepare();
    try {
      f.tag("v0.9.2", f.initialCommit);
      const args = ["prepare-promotion", "--version", "0.10.0", "--source-tag", "v0.9.2", "--source-commit", f.initialCommit,
        "--source-branch", "prerelease/0.9.x", "--source-release-id", "10", "--source-run-id", "20", "--baseline-tag", "v0.8.1",
        "--candidate-pr", "200", "--issue", "157", "--rationale", "Select published work", "--mode", "selective", "--source-commits", pr.head.sha, "--source-prs", "201"];
      const candidate = fixturePr(f, { target: "main", head: "release/0.10.0", version: "0.10.0" });
      await assert.rejects(author.runAuthoring(args, { ...options, github: { ...options.github, pullRequest: async () => candidate } }), /E_SELECTION/);
    } finally { f.remove(); }
  });
  it("requires a merged prerelease PR before creating a forward-port disposition", async () => {
    assert.equal(typeof author.runAuthoring, "function", "record authoring is missing");
    const { f, args, options, pr } = prepare();
    try {
      const approval = await author.runAuthoring(args, options) as Approval;
      const policy = { ...options.policy, approvals: [approval] };
      const dispositionArgs = ["record-forward-port", "--approval-id", approval.id, "--pr", "201", "--issue", "157", "--rationale", "Retain stable fix"];
      await assert.rejects(author.runAuthoring(dispositionArgs, { ...options, policy }), /E_FORWARD_PORT/);
      const merged = { ...pr, number: 201, state: "closed", merged: true, mergeCommit: pr.head.sha,
        base: { ...pr.base, ref: "prerelease/0.9.x" } };
      const record = await author.runAuthoring(dispositionArgs, { ...options, policy,
        github: { ...options.github, pullRequest: async () => merged } }) as Disposition;
      assert.equal(record.approvalId, approval.id);
      assert.equal(record.mergeCommit, merged.mergeCommit);
    } finally { f.remove(); }
  });
});
