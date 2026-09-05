"use strict";

/**
 * Extract one version's body from a Keep a Changelog-style document.
 *
 * @param {string} markdown Full changelog content.
 * @param {string} version Version without a leading v.
 * @returns {string | undefined}
 */
function extractChangelogSection(markdown, version) {
  if (typeof markdown !== "string" || typeof version !== "string") {
    return undefined;
  }

  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => {
    const heading = /^## \[([^\]]+)\](?:\s|$)/.exec(line);
    return heading?.[1] === version;
  });

  if (start < 0) {
    return undefined;
  }

  const next = lines.findIndex(
    (line, index) => index > start && /^## \[[^\]]+\](?:\s|$)/.test(line)
  );
  const end = next < 0 ? lines.length : next;
  return lines.slice(start + 1, end).join("\n").trim();
}

module.exports = { extractChangelogSection };

if (require.main === module) {
  const fs = require("node:fs");
  const path = require("node:path");
  const version = process.argv[2];

  if (!version) {
    process.stderr.write("Usage: node scripts/extract-changelog.js <version>\n");
    process.exitCode = 2;
  } else {
    try {
      const changelogPath = path.resolve(__dirname, "..", "CHANGELOG.md");
      const markdown = fs.readFileSync(changelogPath, "utf8");
      const section = extractChangelogSection(markdown, version);

      if (section === undefined) {
        process.stderr.write(
          `Section for version [${version}] not found in CHANGELOG.md\n`
        );
        process.exitCode = 1;
      } else {
        process.stdout.write(`${section}\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Failed to read CHANGELOG.md: ${message}\n`);
      process.exitCode = 2;
    }
  }
}
