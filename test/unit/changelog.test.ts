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

  it("prints the consolidated 0.4.0 stable body for the release workflow", () => {
    const result = spawnSync(process.execPath, [scriptPath, "0.4.0"], {
      encoding: "utf8"
    });

    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.stdout.replace(/\s+/g, " "),
      /Resume supported Claude sessions and recover from unexpected session exits\./i
    );
    assert.match(
      result.stdout.replace(/\s+/g, " "),
      /Keep the Claude Workspaces panel mounted while another bottom-panel tab is selected/i
    );
    assert.match(result.stdout, /stable channel/i);
    assert.doesNotMatch(result.stdout, /^## \[/m);
  });

  it("fails the CLI when the requested section is absent", () => {
    const result = spawnSync(process.execPath, [scriptPath, "9.9.9"], {
      encoding: "utf8"
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /section for version \[9\.9\.9\] not found/i);
  });
});
