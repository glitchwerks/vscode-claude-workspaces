"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { git, fail, resolveCommit } = require("./release-enforcement/git.js");
const { snapshot, canonical, digest } = require("./release-enforcement/snapshot.js");
const { loadPolicy, buildApproval, validateApproval, validateLedger, validateDisposition } = require("./release-enforcement/records.js");
const { createGitHubEvidence } = require("./release-enforcement/github.js");
const { parseVersion } = require("./release-policy.js");

const commandFlags = {
  "prepare-promotion": ["version", "source-tag", "source-commit", "source-branch", "source-release-id", "source-run-id", "baseline-tag", "candidate-pr", "issue", "rationale", "mode", "source-commits", "source-prs", "supersedes", "output"],
  "prepare-hotfix": ["version", "baseline-tag", "baseline-commit", "baseline-release-id", "baseline-run-id", "candidate-pr", "issue", "rationale", "supersedes", "output"],
  "record-forward-port": ["approval-id", "pr", "issue", "rationale", "supersedes-fix", "output"]
};
const required = {
  "prepare-promotion": commandFlags["prepare-promotion"].slice(0, 10),
  "prepare-hotfix": commandFlags["prepare-hotfix"].slice(0, 8),
  "record-forward-port": commandFlags["record-forward-port"].slice(0, 4)
};
const usage = Object.entries(commandFlags).map(([command, flags]) =>
  `${command}: ${flags.map(flag => `--${flag}${flag === "supersedes-fix" ? "" : " <value>"}`).join(" ")}`).join("\n") +
  "\nRequired flags are the source/baseline identities, version/candidate PR (approvals), or approval ID/PR (dispositions), plus issue and rationale.\n";

function parse(args) {
  const command = args[0];
  if (!Object.hasOwn(commandFlags, command)) { fail("E_INPUT", "Choose prepare-promotion, prepare-hotfix, or record-forward-port; see --help"); }
  const values = {};
  for (let i = 1; i < args.length; i++) {
    const flag = args[i].slice(2);
    if (!args[i].startsWith("--") || !commandFlags[command].includes(flag) || Object.hasOwn(values, flag)) { fail("E_INPUT", `Unknown or duplicate flag ${args[i]}`); }
    if (flag === "supersedes-fix") { values[flag] = true; continue; }
    const value = args[++i];
    if (!value || value.startsWith("--")) { fail("E_INPUT", `Missing explicit value for --${flag}`); }
    values[flag] = value;
  }
  for (const flag of required[command]) { if (!values[flag]) { fail("E_INPUT", `Missing --${flag}; no implicit branch tips`); } }
  for (const flag of ["source-commit", "baseline-commit"]) {
    if (values[flag] && !/^[a-f0-9]{40}$/.test(values[flag])) { fail("E_INPUT", `--${flag} requires an explicit 40-character commit`); }
  }
  for (const flag of ["version", "source-tag", "baseline-tag"]) {
    if (!values[flag]) { continue; }
    try { parseVersion(flag.endsWith("tag") ? values[flag].replace(/^v/, "") : values[flag]); }
    catch { fail("E_INPUT", `Invalid --${flag}`); }
    if (flag.endsWith("tag") && !values[flag].startsWith("v")) { fail("E_INPUT", `--${flag} requires vMAJOR.MINOR.PATCH`); }
  }
  if (values["source-branch"] && !/^prerelease\/\d+\.\d+\.x$/.test(values["source-branch"])) { fail("E_INPUT", "Promotion source must be an explicit prerelease line"); }
  return { command, values };
}
function number(values, flag) {
  const result = Number(values[flag]);
  if (!/^[1-9]\d*$/.test(values[flag]) || !Number.isSafeInteger(result)) { fail("E_INPUT", `Invalid --${flag}`); }
  return result;
}
function list(values, flag, numeric = false) {
  if (!values[flag]) { return []; }
  const entries = values[flag].split(",");
  if (entries.length > 1000 || entries.some(value => !(numeric ? /^[1-9]\d*$/ : /^[a-f0-9]{40}$/).test(value))) { fail("E_INPUT", `Invalid --${flag} list`); }
  return numeric ? entries.map(value => number({ [flag]: value }, flag)) : entries;
}
function samePr(a, b) {
  if (a.number !== b.number || a.state !== b.state || JSON.stringify(a.head) !== JSON.stringify(b.head) || JSON.stringify(a.base) !== JSON.stringify(b.base) || a.mergeCommit !== b.mergeCommit) {
    fail("E_STALE_PR", "Candidate changed during preparation; run again against the current PR");
  }
}
function writeRecord(repo, output, record, directory) {
  const normalized = output.replace(/\\/g, "/");
  if (normalized.split("/").includes("..")) { fail("E_OUTPUT", "Record output cannot traverse directories"); }
  const full = path.resolve(repo, output);
  const parent = path.resolve(repo, ".github/release-policy", directory);
  if (path.dirname(full) !== parent || !/^[A-Za-z0-9.-]+\.json$/.test(path.basename(full))) { fail("E_OUTPUT", `Output must be one JSON file in .github/release-policy/${directory}`); }
  for (const relative of [".github", ".github/release-policy", `.github/release-policy/${directory}`]) {
    const target = path.join(repo, relative);
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) { fail("E_OUTPUT", "Record directories cannot be symbolic links"); }
  }
  fs.mkdirSync(parent, { recursive: true });
  try { fs.writeFileSync(full, JSON.stringify(record, null, 2).replace(/\n/g, "\r\n") + "\r\n", { encoding: "utf8", flag: "wx" }); }
  catch { fail("E_OUTPUT", "Record output exists or cannot be written; choose a new immutable record file"); }
}
async function runAuthoring(args, options = {}) {
  const { command, values } = parse(args);
  const repo = path.resolve(options.repositoryPath || process.cwd());
  let policy = options.policy || loadPolicy(repo, "refs/remotes/origin/main");
  const remote = `https://github.com/${policy.config.repository.fullName}.git`;
  if (!options.policy) {
    git(repo, ["fetch", "--no-tags", "--no-recurse-submodules", remote, "+refs/heads/main:refs/remotes/origin/main"]);
    policy = loadPolicy(repo, "refs/remotes/origin/main");
  }
  const github = options.github || createGitHubEvidence({ repository: policy.config.repository, token: process.env.GH_TOKEN });
  const issue = number(values, "issue");
  await github.issue(issue);
  const pr = await github.pullRequest(number(values, command === "record-forward-port" ? "pr" : "candidate-pr"));
  if (!options.policy) {
    git(repo, ["fetch", "--no-tags", "--no-recurse-submodules", remote,
      `+refs/pull/${pr.number}/head:refs/release-author/candidate`,
      `+refs/heads/${policy.config.activePrerelease}:refs/remotes/origin/${policy.config.activePrerelease}`]);
    if (resolveCommit(repo, "refs/release-author/candidate") !== pr.head.sha) { fail("E_STALE_PR", "Fetched candidate differs from live PR"); }
  }
  let record;
  if (command === "record-forward-port") {
    const approval = policy.approvals.find(value => value.id === values["approval-id"] && value.kind === "hotfix");
    if (!approval || pr.state !== "closed" || pr.merged !== true || !pr.mergeCommit || pr.base.ref !== policy.config.activePrerelease ||
      pr.base.repositoryId !== policy.config.repository.id || pr.head.repositoryId !== policy.config.repository.id) { fail("E_FORWARD_PORT", "Disposition requires a known stable fix and its merged active-prerelease PR"); }
    record = { schemaVersion: 1, approvalId: approval.id, kind: values["supersedes-fix"] ? "superseded-fix" : "forward-port",
      pullRequest: pr.number, mergeCommit: pr.mergeCommit, issue, rationale: values.rationale };
    record.id = `disposition-${approval.targetVersion}-${digest(JSON.stringify(canonical(record))).slice(0, 20)}`;
    validateDisposition(record);
    await github.mergedForwardPort(record);
    validateLedger(policy, { ...policy, dispositions: [...policy.dispositions, record] });
  } else {
    const hotfix = command === "prepare-hotfix";
    const version = values.version;
    if (pr.state !== "open" || pr.base.ref !== "main" || pr.base.repositoryId !== policy.config.repository.id ||
      pr.head.repositoryId !== policy.config.repository.id || pr.head.ref !== `${hotfix ? "hotfix" : "release"}/${version}`) { fail("E_ROUTE", "Prepare a same-repository candidate PR to main with the matching branch/version"); }
    const source = hotfix ? { tag: values["baseline-tag"], commit: values["baseline-commit"], branch: "main", releaseId: number(values, "baseline-release-id"), publishRunId: number(values, "baseline-run-id") } :
      { tag: values["source-tag"], commit: values["source-commit"], branch: values["source-branch"], releaseId: number(values, "source-release-id"), publishRunId: number(values, "source-run-id") };
    if (!options.policy) {
      for (const tag of new Set([source.tag, values["baseline-tag"]])) { git(repo, ["fetch", "--no-tags", "--no-recurse-submodules", remote, `+refs/tags/${tag}:refs/tags/${tag}`]); }
    }
    if (snapshot(repo, pr.head.sha).version !== version) { fail("E_VERSION", "Candidate package version differs from --version"); }
    if (resolveCommit(repo, `refs/tags/${source.tag}`) !== source.commit) { fail("E_SOURCE", "Explicit source tag/commit mismatch"); }
    const next = parseVersion(version); const previous = parseVersion(source.tag.slice(1));
    if ((hotfix && (next.major !== previous.major || next.minor !== previous.minor || next.patch !== previous.patch + 1)) ||
      (!hotfix && (source.branch !== policy.config.activePrerelease || previous.minor % 2 !== 1 || next.major !== previous.major || next.minor !== previous.minor + 1))) {
      fail("E_VERSION", "Candidate version must follow the explicit registered source line");
    }
    await github.publishedSource(source);
    record = buildApproval(repo, { kind: hotfix ? "hotfix" : "promotion", mode: hotfix ? "compatibility" : (values.mode || "full"),
      targetVersion: version, issue, candidatePullRequest: pr.number, source, baselineTag: values["baseline-tag"], candidateCommit: pr.head.sha,
      sourceCommits: list(values, "source-commits"), sourcePullRequests: list(values, "source-prs", true), rationale: values.rationale,
      ...(values.supersedes ? { supersedes: values.supersedes } : {}) });
    validateApproval(repo, record, pr.base.sha, pr.head.sha);
    validateLedger(policy, { ...policy, approvals: [...policy.approvals, record] });
  }
  samePr(pr, await github.pullRequest(pr.number));
  if (values.output) { writeRecord(repo, values.output, record, command === "record-forward-port" ? "forward-ports" : "approvals"); }
  return record;
}

module.exports = { runAuthoring, usage };
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) { process.stdout.write(usage); }
  else {
    runAuthoring(args).then(record => process.stdout.write(JSON.stringify(record, null, 2) + "\n"))
      .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = error.message.startsWith("E_INPUT:") ? 2 : 1; });
  }
}
