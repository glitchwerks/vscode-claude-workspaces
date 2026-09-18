"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { extractChangelogSection } = require("./extract-changelog.js");
const { getReleaseMetadata } = require("./release-metadata.js");

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
function validateReleaseSource(options) {
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

  return { ...metadata, commit };
}

module.exports = { validateReleaseSource };

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length !== 4) {
    process.stderr.write(
      "Usage: node scripts/validate-release-source.js " +
        "<tag> <package-path> <changelog-path> <repository-path>\n"
    );
    process.exitCode = 2;
  } else {
    const [tag, packagePath, changelogPath, repositoryPath] = args;
    try {
      const result = validateReleaseSource({
        tag,
        packagePath: path.resolve(packagePath),
        changelogPath: path.resolve(changelogPath),
        repositoryPath: path.resolve(repositoryPath)
      });
      process.stdout.write(
        `Validated ${result.tag} from ${result.sourceBranch} at ${result.commit}.\n`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    }
  }
}
