"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { extractChangelogSection } = require("./extract-changelog.js");
const { getReleaseMetadata } = require("./release-metadata.js");
const { git, resolveCommit, fail } = require("./release-enforcement/git.js");
const { activeApprovals, loadPolicy, fetchDispositionObjects } = require("./release-enforcement/records.js");
const { createGitHubEvidence } = require("./release-enforcement/github.js");
const { evaluatePublication } = require("./release-enforcement/evaluate.js");

/**
 * Run a Git command in the selected release repository.
 *
 * @param {string} repositoryPath Repository to inspect.
 * @param {string[]} args Git command arguments.
 * @returns {string} Trimmed standard output.
 */
function runGit(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const stderr =
      typeof result.stderr === "string" ? result.stderr.trim() : "";
    const detail = stderr || `git ${args.join(" ")} failed`;
    throw new Error(detail);
  }
  return result.stdout.trim();
}

/**
 * Validate that a release tag matches its package and authorized source branch.
 *
 * @param {{
 *   tag: string,
 *   packagePath: string,
 *   changelogPath: string,
 *   repositoryPath: string
 * }} options Release source inputs.
 * @returns {{
 *   channel: "stable" | "prerelease",
 *   commit: string,
 *   sourceBranch: string,
 *   tag: string,
 *   version: string
 * }} Validated release identity.
 */
async function validateReleaseSource(options) {
  const packageJson = JSON.parse(fs.readFileSync(options.packagePath, "utf8"));
  const changelog = fs.readFileSync(options.changelogPath, "utf8");
  const metadata = getReleaseMetadata(packageJson.version, options.tag);
  const releaseNotes = extractChangelogSection(changelog, metadata.version);

  if (releaseNotes === undefined) {
    throw new Error(
      `Section for version [${metadata.version}] not found in CHANGELOG.md.`
    );
  }
  if (releaseNotes.length === 0) {
    throw new Error(
      `Section for version [${metadata.version}] is empty in CHANGELOG.md.`
    );
  }

  const commit = runGit(options.repositoryPath, [
    "rev-parse",
    `refs/tags/${metadata.tag}^{commit}`
  ]);
  const automationRoot = path.resolve(__dirname, "..");
  const authorityCommit = options.policy?.authorityCommit || resolveCommit(automationRoot, "HEAD");
  const policy = options.policy || loadPolicy(automationRoot, authorityCommit);
  const github = options.github || createGitHubEvidence({ repository: policy.config.repository, token: process.env.GH_TOKEN });
  const historical = activeApprovals(policy).find(record => record.kind === "historical" && record.releaseCommit === commit && record.targetVersion === metadata.version);
  if (!options.policy) {
    let main;
    try { main = resolveCommit(automationRoot, "refs/remotes/origin/main"); }
    catch { fail("E_POLICY_PROVENANCE", "Fetch protected main before running publication tooling"); }
    if (main !== authorityCommit) {
      fail("E_POLICY_PROVENANCE", "Publication tooling must be checked out from protected main");
    }
    if (metadata.channel === "prerelease" && metadata.sourceBranch !== policy.config.activePrerelease &&
      !historical) {
      fail("E_ROUTE", "Unregistered historical prerelease publication source");
    }
    const repo = options.repositoryPath;
    const remote = `https://github.com/${policy.config.repository.fullName}.git`;
    if (git(repo, ["rev-parse", "--is-shallow-repository"]).toString("ascii").trim() === "true") {
      git(repo, ["fetch", "--unshallow", "--no-tags", "--no-recurse-submodules", remote]);
    }
    git(repo, ["fetch", "--no-tags", "--no-recurse-submodules", remote, "+refs/heads/main:refs/remotes/origin/main"]);
    if (resolveCommit(repo, "refs/remotes/origin/main") !== authorityCommit) {
      fail("E_POLICY_PROVENANCE", "Protected main advanced after publication authority checkout; restart with fresh trusted tooling");
    }
    const relevant = policy.approvals.filter(record => record.targetVersion === metadata.version || record.kind === "hotfix");
    for (const record of relevant) {
      for (const tag of new Set([record.source.tag, record.baseline.tag])) {
        git(repo, ["fetch", "--no-tags", "--no-recurse-submodules", remote, `+refs/tags/${tag}:refs/tags/${tag}`]);
      }
    }
    if (metadata.channel === "prerelease" && !historical) {
      git(repo, ["fetch", "--no-tags", "--no-recurse-submodules", remote,
        `+refs/heads/${metadata.sourceBranch}:refs/remotes/origin/${metadata.sourceBranch}`]);
    }
    await fetchDispositionObjects(repo, policy.dispositions, github, policy.config.repository);
  }
  const scope = await evaluatePublication({ repositoryPath: options.repositoryPath, tag: metadata.tag, commit, policy, github });
  // Retired historical prerelease branches are unnecessary only after exact target proof.
  if (!(historical && metadata.channel === "prerelease")) {
    const sourceRef = `refs/remotes/origin/${metadata.sourceBranch}`;
    runGit(options.repositoryPath, ["show-ref", "--verify", sourceRef]);

    const ancestry = spawnSync(
      "git",
      [
        "-C",
        options.repositoryPath,
        "merge-base",
        "--is-ancestor",
        commit,
        sourceRef
      ],
      { encoding: "utf8" }
    );
    if (ancestry.error) {
      throw ancestry.error;
    }
    if (ancestry.status === 1) {
      throw new Error(
        `Tag ${metadata.tag} is not contained in authorized source branch ${metadata.sourceBranch}.`
      );
    }
    if (ancestry.status !== 0) {
      const stderr =
        typeof ancestry.stderr === "string" ? ancestry.stderr.trim() : "";
      throw new Error(
        stderr ||
          `Failed to compare ${metadata.tag} with ${metadata.sourceBranch}.`
      );
    }

  }
  return { ...metadata, commit, policyCommit: scope.policyCommit, approvalId: scope.approvalId };
}

module.exports = { validateReleaseSource };

/** Run the CLI inside a function so early dispatch rejection is portable script syntax. */
function runCli(args) {
  if (args.length !== 4) {
    process.stderr.write(
      "Usage: node scripts/validate-release-source.js " +
        "<tag> <package-path> <changelog-path> <repository-path>\n"
    );
    process.exitCode = 2;
  } else {
    const [tag, packagePath, changelogPath, repositoryPath] = args;
    if (process.env.GITHUB_EVENT_NAME === "workflow_dispatch" && process.env.GITHUB_REF !== `refs/tags/${tag}`) {
      process.stderr.write("E_DISPATCH_SOURCE: Manual publication must dispatch on the same tag supplied as input.\n");
      process.exitCode = 1;
      return;
    }
    validateReleaseSource({
        tag,
        packagePath: path.resolve(packagePath),
        changelogPath: path.resolve(changelogPath),
        repositoryPath: path.resolve(repositoryPath)
      }).then(result => {
      if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `source_commit=${result.commit}\n`, "utf8");
      }
      process.stdout.write(
        `Validated ${result.tag} from ${result.sourceBranch} at ${result.commit}; policy ${result.policyCommit}, approval ${result.approvalId || "active-prerelease"}.\n`
      );
    }).catch(error => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
  }
}

if (require.main === module) { runCli(process.argv.slice(2)); }
