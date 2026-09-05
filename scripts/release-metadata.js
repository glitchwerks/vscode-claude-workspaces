"use strict";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Derive the Marketplace channel from a package version.
 *
 * @param {string} version package.json version.
 * @returns {"stable" | "prerelease"}
 */
function getChannel(version) {
  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(
      `Version ${JSON.stringify(version)} must use MAJOR.MINOR.PATCH format.`
    );
  }

  return Number(match[2]) % 2 === 0 ? "stable" : "prerelease";
}

/**
 * Validate a release tag and derive its Marketplace channel.
 *
 * @param {string} version package.json version.
 * @param {string} tag Git tag for the release.
 * @returns {{channel: "stable" | "prerelease", tag: string, version: string}}
 */
function getReleaseMetadata(version, tag) {
  const channel = getChannel(version);

  const expectedTag = `v${version}`;
  if (tag !== expectedTag) {
    throw new Error(`Tag ${tag} does not match package version ${version}.`);
  }

  return {
    channel,
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
      `channel=${metadata.channel}\ntag=${metadata.tag}\nversion=${metadata.version}\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
