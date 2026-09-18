"use strict";

const {
  getChannel,
  getExpectedSourceBranch
} = require("./release-policy.js");

/**
 * Validate a release tag and derive its Marketplace channel.
 *
 * @param {string} version package.json version.
 * @param {string} tag Git tag for the release.
 * @returns {{channel: "stable" | "prerelease", sourceBranch: string, tag: string, version: string}}
 */
function getReleaseMetadata(version, tag) {
  const channel = getChannel(version);

  const expectedTag = `v${version}`;
  if (tag !== expectedTag) {
    throw new Error(`Tag ${tag} does not match package version ${version}.`);
  }

  return {
    channel,
    sourceBranch: getExpectedSourceBranch(version),
    tag,
    version
  };
}

module.exports = { getChannel, getReleaseMetadata };

if (require.main === module) {
  const fs = require("node:fs");
  const path = require("node:path");

  try {
    const packagePath = process.argv[3]
      ? path.resolve(process.argv[3])
      : path.resolve(__dirname, "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    const metadata = getReleaseMetadata(packageJson.version, process.argv[2]);

    process.stdout.write(
      `channel=${metadata.channel}\n` +
        `source_branch=${metadata.sourceBranch}\n` +
        `tag=${metadata.tag}\n` +
        `version=${metadata.version}\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
