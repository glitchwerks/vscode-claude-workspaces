"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { git, fail, resolveCommit } = require("./release-enforcement/git.js");
const { loadPolicy, fetchDispositionObjects } = require("./release-enforcement/records.js");
const { createGitHubEvidence } = require("./release-enforcement/github.js");
const { evaluatePullRequest } = require("./release-enforcement/evaluate.js");
const { parseQueueEvent, correlateQueue, proveQueuedTree } = require("./release-enforcement/queue.js");

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
async function fetchObjects(repo, pr, policy, evidence, queueEvent) {
  if (!/^(main|prerelease\/\d+\.\d+\.x)$/.test(pr.base.ref)) { fail("E_ROUTE", "Unknown protected target"); }
  const remote = `https://github.com/${policy.config.repository.fullName}.git`;
  git(repo, ["fetch", "--no-tags", "--no-recurse-submodules", remote,
    "+refs/heads/main:refs/release-guard/main",
    `+refs/heads/${pr.base.ref}:refs/release-guard/base`,
    `+refs/pull/${pr.number}/head:refs/release-guard/head`,
    ...(queueEvent ? [`+${queueEvent.headRef}:refs/release-guard/group`] : [])]);
  if (resolveCommit(repo, "refs/release-guard/base") !== pr.base.sha || resolveCommit(repo, "refs/release-guard/head") !== pr.head.sha ||
    resolveCommit(repo, "refs/release-guard/main") !== policy.authorityCommit) { fail("E_STALE_PR", "Fetched objects or trusted main differ from live evaluation"); }
  if (queueEvent && resolveCommit(repo, "refs/release-guard/group") !== queueEvent.headCommit) { fail("E_STALE_QUEUE", "Fetched prospective head moved"); }
  const incoming = pr.base.ref === "main" && /^policy\/\d+-[A-Za-z0-9._/-]+$/.test(pr.head.ref) &&
    pr.head.repositoryId === policy.config.repository.id ? loadPolicy(repo, queueEvent?.headCommit ?? pr.head.sha) : { approvals: [], dispositions: [] };
  for (const source of [...policy.approvals, ...incoming.approvals].flatMap(record => [record.source, { tag: record.baseline.tag, branch: "main" }])) {
    git(repo, ["fetch", "--no-tags", "--no-recurse-submodules", remote,
      `+refs/tags/${source.tag}:refs/tags/${source.tag}`]);
  }
  await fetchDispositionObjects(repo, [...policy.dispositions, ...incoming.dispositions], evidence, policy.config.repository);
}
async function queueIdentity(evidence, event, repository) {
  const queue = await evidence.mergeQueue();
  if (queue.totalCount !== 1 || queue.entries.length !== 1) { fail("E_QUEUE", "Only one PR may be queued on main; dequeue extra entries and retry"); }
  const pr = await evidence.pullRequest(queue.entries[0].pullRequest);
  const mainCommit = await evidence.gitRef("refs/heads/main");
  const headCommit = await evidence.gitRef(event.headRef);
  correlateQueue({ repository, event, queue, pr, mainCommit, headCommit });
  return { queue, pr, mainCommit, headCommit };
}
async function runQueueGuard(root, options, event, policy, evidence) {
  const group = parseQueueEvent(event, { eventName: options.eventName, sha: options.sha, ref: options.ref }, policy.config.repository);
  if (group.baseCommit !== policy.authorityCommit) { fail("E_STALE_QUEUE", "Selected main workflow authority differs from prospective base"); }
  const before = await queueIdentity(evidence, group, policy.config.repository);
  await fetchObjects(root, before.pr, policy, evidence, group);
  const tree = proveQueuedTree({ repositoryPath: root, event: group, pr: before.pr });
  const result = await evaluatePullRequest({ repositoryPath: root, pr: before.pr, policy, github: evidence,
    prospective: { baseCommit: group.baseCommit, commit: group.headCommit } });
  const after = await queueIdentity(evidence, group, policy.config.repository);
  if (JSON.stringify(before) !== JSON.stringify(after) || resolveCommit(root, "HEAD") !== options.workflowSha) {
    fail("E_STALE_QUEUE", "Queue membership, PR or selected authority changed during evaluation");
  }
  await fetchObjects(root, after.pr, policy, evidence, group);
  if (proveQueuedTree({ repositoryPath: root, event: group, pr: after.pr }) !== tree) { fail("E_STALE_QUEUE", "Prospective full tree changed"); }
  return result;
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
  const evidence = options.github || createGitHubEvidence({ repository: policy.config.repository, token: process.env.GH_TOKEN });
  if (options.eventName === "merge_group") { return runQueueGuard(root, options, event, policy, evidence); }
  if (options.eventName && options.eventName !== "pull_request") { fail("E_POLICY_PROVENANCE", "Unsupported trusted guard event"); }
  const expectedPr = eventIdentity(event);
  const pr = await evidence.pullRequest(expectedPr.number);
  unchanged(expectedPr, pr);
  await (options.fetchObjects || fetchObjects)(root, pr, policy, evidence);
  const result = await evaluatePullRequest({ repositoryPath: root, pr, policy, github: evidence });
  unchanged(pr, await evidence.pullRequest(pr.number));
  return result;
}

module.exports = { runPrGuard };
if (require.main === module) {
  runPrGuard({ automationRoot: path.resolve(__dirname, ".."), eventPath: process.env.GITHUB_EVENT_PATH,
    workflowRef: process.env.POLICY_WORKFLOW_REF, workflowSha: process.env.POLICY_WORKFLOW_SHA,
    eventName: process.env.GITHUB_EVENT_NAME, sha: process.env.GITHUB_SHA, ref: process.env.GITHUB_REF })
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
