"use strict";

const { getChannel } = require("./release-metadata.js");

/**
 * Enforce the odd/even Marketplace release-channel convention.
 *
 * @param {string} version package.json version.
 * @param {"stable" | "prerelease"} channel Requested publish channel.
 */
function validateChannel(version, channel) {
  if (channel !== "stable" && channel !== "prerelease") {
    throw new Error(`Unknown channel ${JSON.stringify(channel)}.`);
  }

  const expectedChannel = getChannel(version);
  if (channel !== expectedChannel) {
    const minor = Number(version.split(".")[1]);
    const parity = expectedChannel === "stable" ? "EVEN" : "ODD";
    const displayChannel = channel === "prerelease" ? "pre-release" : channel;
    throw new Error(
      `Version ${version} has ${parity} minor (${minor}) — cannot publish as ${displayChannel}. ` +
        `Use the ${expectedChannel} channel.`
    );
  }
}

module.exports = { validateChannel };

if (require.main === module) {
  const fs = require("node:fs");
  const path = require("node:path");
  const channel = process.argv[2];

  try {
    const packagePath = path.resolve(__dirname, "..", "package.json");
    const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    validateChannel(packageJson.version, channel);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
