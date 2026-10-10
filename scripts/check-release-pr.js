"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { git, fail, resolveCommit, isAncestor } = require("./release-enforcement/git.js");
const { loadPolicy } = require("./release-enforcement/records.js");
const { createGitHubEvidence } = require("./release-enforcement/github.js");
const { evaluatePullRequest } = require("./release-enforcement/evaluate.js");

function eventIdentity(event) {
  const pr = event.pull_request;
  if (!pr || event.number !== pr.number) { fail("E_STALE_PR", "Expected pull request event identity"); }
  return { number: pr.number, state: "open", head: { sha: pr.head.sha, ref: pr.head.ref, repositoryId: pr.head.repo?.id },
    base: { sha: pr.base.sha, ref: pr.base.ref, repositoryId: pr.base.repo?.id } };
}
function unchanged(before, after) {
  const identity = value => ({ number: value.number, state: value.state, head: value.head, base: value.base });
  if (JSON.stringify(identity(before)) !== JSON.stringify(identity(after))) { fail("E_STALE_PR", "PR head/base/target changed; rerun against current identity"); }
}
function fetchObjects(repo, pr, policy) {
  if (!/^(main|prerelease\/\d+\.\d+\.x)$/.test(pr.base.ref)) { fail("E_ROUTE", "Unknown protected target"); }
  const remote = `https://github.com/${policy.config.repository.fullName}.git`;
  git(repo, ["fetch", "--no-tags", "--no-recurse-submodules", remote,
    "+refs/heads/main:refs/release-guard/main",
    `+refs/heads/${pr.base.ref}:refs/release-guard/base`,
    `+refs/pull/${pr.number}/head:refs/release-guard/head`]);
  if (resolveCommit(repo, "refs/release-guard/base") !== pr.base.sha || resolveCommit(repo, "refs/release-guard/head") !== pr.head.sha ||
    !isAncestor(repo, policy.authorityCommit, "refs/release-guard/main")) { fail("E_STALE_PR", "Fetched objects or trusted main differ from live evaluation"); }
  const incoming = pr.base.ref === "main" && /^policy\/\d+-[A-Za-z0-9._/-]+$/.test(pr.head.ref) &&
    pr.head.repositoryId === policy.config.repository.id ? loadPolicy(repo, pr.head.sha).approvals : [];
  for (const source of [...policy.approvals, ...incoming].flatMap(record => [record.source, { tag: record.baseline.tag, branch: "main" }])) {
    git(repo, ["fetch", "--no-tags", "--no-recurse-submodules", remote,
      `+refs/tags/${source.tag}:refs/tags/${source.tag}`, `+refs/heads/${source.branch}:refs/remotes/origin/${source.branch}`]);
  }
}
async function runPrGuard(options) {
  const root = path.resolve(options.automationRoot);
  const policy = loadPolicy(root, options.workflowSha);
  const expected = `${policy.config.repository.fullName}/.github/workflows/release-guard.yml@refs/heads/main`;
  if (options.workflowRef !== expected || resolveCommit(root, "HEAD") !== options.workflowSha) { fail("E_POLICY_PROVENANCE", "Required guard must execute the protected main workflow definition"); }
  const event = JSON.parse(fs.readFileSync(options.eventPath, "utf8"));
  if (event.repository?.id !== policy.config.repository.id || event.repository.full_name !== policy.config.repository.fullName) {
    fail("E_POLICY_PROVENANCE", "Event repository differs from configured authority");
  }
  const expectedPr = eventIdentity(event);
  const evidence = options.github || createGitHubEvidence({ repository: policy.config.repository, token: process.env.GH_TOKEN });
  const pr = await evidence.pullRequest(expectedPr.number);
  unchanged(expectedPr, pr);
  (options.fetchObjects || fetchObjects)(root, pr, policy);
  const result = await evaluatePullRequest({ repositoryPath: root, pr, policy, github: evidence });
  unchanged(pr, await evidence.pullRequest(pr.number));
  return result;
}

module.exports = { runPrGuard };
if (require.main === module) {
  runPrGuard({ automationRoot: path.resolve(__dirname, ".."), eventPath: process.env.GITHUB_EVENT_PATH,
    workflowRef: process.env.POLICY_WORKFLOW_REF, workflowSha: process.env.POLICY_WORKFLOW_SHA })
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
