"use strict";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

/**
 * Parse a strict MAJOR.MINOR.PATCH release version.
 *
 * @param {string} version Release version.
 * @returns {{major: number, minor: number, patch: number}}
 */
function parseVersion(version) {
  const match = VERSION_PATTERN.exec(version);
  if (!match) {
    throw new Error(
      `Version ${JSON.stringify(version)} must use MAJOR.MINOR.PATCH format.`
    );
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3])
  };
}

/**
 * Derive the Marketplace channel from a release version.
 *
 * @param {string} version Release version.
 * @returns {"stable" | "prerelease"}
 */
function getChannel(version) {
  return parseVersion(version).minor % 2 === 0 ? "stable" : "prerelease";
}

/**
 * Derive the branch authorized to publish a release version.
 *
 * @param {string} version Release version.
 * @returns {string}
 */
function getExpectedSourceBranch(version) {
  const parsed = parseVersion(version);
  return parsed.minor % 2 === 0
    ? "main"
    : `prerelease/${parsed.major}.${parsed.minor}.x`;
}

/**
 * Validate a stable release candidate branch.
 *
 * @param {string} version Release version.
 * @param {string} branch Candidate branch name.
 * @returns {void}
 */
function validateReleaseCandidateBranch(version, branch) {
  const parsed = parseVersion(version);
  if (parsed.minor % 2 !== 0) {
    throw new Error(
      `Stable candidate ${JSON.stringify(branch)} requires an even minor version.`
    );
  }
  const expected = `release/${version}`;
  if (branch !== expected) {
    throw new Error(
      `Candidate branch ${JSON.stringify(branch)} is invalid; expected ${expected}.`
    );
  }
}

module.exports = {
  getChannel,
  getExpectedSourceBranch,
  parseVersion,
  validateReleaseCandidateBranch
};
