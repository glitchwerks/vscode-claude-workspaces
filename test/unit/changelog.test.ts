import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

type ChangelogModule = {
  extractChangelogSection: (
    markdown: string,
    version: string
  ) => string | undefined;
};

// Windows process startup can exceed Mocha's default while remaining healthy.
// Bound both the child and the test so genuine hangs still fail.
const CHILD_PROCESS_TIMEOUT_MS = 10_000;
const PROCESS_TEST_TIMEOUT_MS = 15_000;

const scriptPath = path.resolve("scripts/extract-changelog.js");
const loadModule = createRequire(__filename);
const { extractChangelogSection } = loadModule(scriptPath) as ChangelogModule;

describe("changelog extraction", () => {
  const changelog = `# Changelog

## [0.1.3] - 2026-09-05

- Fixed launch availability probe starvation.
- Fixed duplicate intro replay.

## [0.1.2] - 2026-09-02

- Added lifecycle hardening.
`;

  it("returns only the requested version body", () => {
    assert.equal(
      extractChangelogSection(changelog, "0.1.3"),
      "- Fixed launch availability probe starvation.\n" +
        "- Fixed duplicate intro replay."
    );
  });

  it("treats dots in the version as literal characters", () => {
    assert.equal(extractChangelogSection(changelog, "0x1x3"), undefined);
  });

  it("returns undefined when the version is absent", () => {
    assert.equal(extractChangelogSection(changelog, "0.1.4"), undefined);
  });

  it("prints the consolidated 0.5.0 pre-release body for the release workflow", () => {
    const result = spawnSync(process.execPath, [scriptPath, "0.5.0"], {
      encoding: "utf8",
      timeout: CHILD_PROCESS_TIMEOUT_MS
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout.replace(/\s+/g, " "),
      /diagnostic verbosity levels/i
    );
    assert.match(
      result.stdout.replace(/\s+/g, " "),
      /Last opened/i
    );
    assert.match(result.stdout, /pre-release channel/i);
    assert.match(
      result.stdout,
      /Version 0\.4\.0 remains available on the\s+stable channel/i
    );
    assert.doesNotMatch(result.stdout, /^## \[/m);
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

  it("fails the CLI when the requested section is absent", () => {
    const result = spawnSync(process.execPath, [scriptPath, "9.9.9"], {
      encoding: "utf8",
      timeout: CHILD_PROCESS_TIMEOUT_MS
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /section for version \[9\.9\.9\] not found/i);
  }).timeout(PROCESS_TEST_TIMEOUT_MS);
});
