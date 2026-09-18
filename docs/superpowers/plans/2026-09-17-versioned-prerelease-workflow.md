# Versioned Pre-release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce versioned pre-release development and stable promotion locally, in CI, at publication time, and through a live protected `prerelease/0.7.x` branch.

**Architecture:** A pure CommonJS policy module owns version, channel, branch, and candidate naming rules. A thin release-source CLI validates package metadata, changelog completeness, and Git ancestry before the existing publish workflow installs or writes anything. CI exposes a focused release-policy check alongside the existing quality and integration checks, while repository documentation and a post-merge ruleset make the process operational. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L84-L162`)

**Tech Stack:** Node.js 20 CommonJS release scripts, TypeScript/Mocha tests, Git, GitHub Actions YAML, GitHub repository rulesets.

**Spec:** `docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md`

## Global Constraints

- Keep odd minor versions on the Marketplace pre-release channel and even minor versions on stable. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L147-L152`)
- Authorize odd-minor tags only from `prerelease/MAJOR.MINOR.x` and even-minor tags only from `main`. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L139-L162`)
- Keep policy logic project-local; do not add a shared action or manifest-driven promotion automation. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L44-L55`)
- Preserve the current `release-metadata.js` and `guard-channel.js` module entry points and existing accepted behavior. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L96-L102`)
- Keep CI permissions at `contents: read` and publication permission at job-level `contents: write`. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L154-L162`)
- Do not change extension product behavior or publish 0.7.0 in this issue. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L52-L55`)
- Use test-first development for every behavior change and retain CRLF working-tree conventions.

---

## File Structure

- Create `scripts/release-policy.js`: pure parsing and mapping functions with no filesystem or process effects.
- Modify `scripts/release-metadata.js`: delegate channel/source decisions to the policy module and expose `source_branch` to the workflow.
- Modify `scripts/guard-channel.js`: delegate parity decisions to the policy module.
- Create `scripts/validate-release-source.js`: filesystem and Git adapter for publish-time validation.
- Modify `scripts/extract-changelog.js`: reject an empty version section at the CLI boundary.
- Create `test/unit/releasePolicy.test.ts`: pure policy coverage.
- Create `test/unit/validateReleaseSource.test.ts`: temporary-repository ancestry and CLI coverage.
- Create `test/unit/releaseWorkflow.test.ts`: static workflow ordering, trigger, permission, and check-name contracts.
- Modify `test/unit/releaseMetadata.test.ts`, `test/unit/guardChannel.test.ts`, and `test/unit/changelog.test.ts`: compatibility and new failure cases.
- Modify `package.json`: add a deterministic `test:release-policy` command.
- Modify `.github/workflows/ci.yml`: add pre-release push coverage and the focused check.
- Modify `.github/workflows/publish.yml`: fetch and validate the authorized release source before installation.
- Modify `docs/versioning-policy.md`, `CONTRIBUTING.md`, `README.md`, and `test/unit/packageAssets.test.ts`: publish the complete branch lifecycle and keep documentation assertions aligned.

---

### Task 1: Centralize Release Policy

**Files:**
- Create: `scripts/release-policy.js`
- Create: `test/unit/releasePolicy.test.ts`
- Modify: `scripts/release-metadata.js`
- Modify: `scripts/guard-channel.js`
- Modify: `test/unit/releaseMetadata.test.ts`
- Modify: `test/unit/guardChannel.test.ts`

**Interfaces:**
- Consumes: version strings in strict `MAJOR.MINOR.PATCH` form and candidate/source branch names.
- Produces:
  - `parseVersion(version: string): { major: number; minor: number; patch: number }`
  - `getChannel(version: string): "stable" | "prerelease"`
  - `getExpectedSourceBranch(version: string): string`
  - `validateReleaseCandidateBranch(version: string, branch: string): void`
  - `getReleaseMetadata(version: string, tag: string): { channel; sourceBranch; tag; version }`

- [ ] **Step 1: Add failing pure-policy tests**

Create `test/unit/releasePolicy.test.ts` with these representative cases:

```typescript
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";

type Policy = {
  parseVersion(version: string): { major: number; minor: number; patch: number };
  getChannel(version: string): "stable" | "prerelease";
  getExpectedSourceBranch(version: string): string;
  validateReleaseCandidateBranch(version: string, branch: string): void;
};

const loadModule = createRequire(__filename);
const policy = loadModule(path.resolve("scripts/release-policy.js")) as Policy;

describe("release policy", () => {
  it("maps an odd minor to its versioned prerelease branch", () => {
    assert.equal(policy.getChannel("0.7.0"), "prerelease");
    assert.equal(
      policy.getExpectedSourceBranch("0.7.0"),
      "prerelease/0.7.x"
    );
  });

  it("maps an even minor to main", () => {
    assert.equal(policy.getChannel("0.8.0"), "stable");
    assert.equal(policy.getExpectedSourceBranch("0.8.0"), "main");
  });

  it("accepts only the exact even-version candidate branch", () => {
    assert.doesNotThrow(() =>
      policy.validateReleaseCandidateBranch("0.8.0", "release/0.8.0")
    );
    assert.throws(
      () => policy.validateReleaseCandidateBranch("0.8.0", "release/0.8.x"),
      /expected release\/0\.8\.0/i
    );
    assert.throws(
      () => policy.validateReleaseCandidateBranch("0.7.0", "release/0.7.0"),
      /stable candidate.*even minor/i
    );
  });

  for (const version of ["", "1", "1.2", "1.x.0", "1.2.0-beta.1"]) {
    it(`rejects malformed version ${JSON.stringify(version)}`, () => {
      assert.throws(() => policy.parseVersion(version), /major\.minor\.patch/i);
    });
  }
});
```

Update `test/unit/releaseMetadata.test.ts` so `getReleaseMetadata("0.7.0", "v0.7.0")` expects `sourceBranch: "prerelease/0.7.x"` and the CLI expects:

```text
channel=stable
source_branch=main
tag=v0.6.0
version=0.6.0
```

Keep every existing guard acceptance and rejection assertion. The current tests define the compatibility boundary. (`test/unit/releaseMetadata.test.ts:L24-L96`; `test/unit/guardChannel.test.ts:L20-L67`)

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
npm run compile:tests
npx mocha "out/test/unit/releasePolicy.test.js" "out/test/unit/releaseMetadata.test.js" "out/test/unit/guardChannel.test.js"
```

Expected: failure because `scripts/release-policy.js` does not exist and metadata does not expose `source_branch`.

- [ ] **Step 3: Implement the pure policy module**

Create `scripts/release-policy.js` with this shape:

```javascript
"use strict";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

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

function getChannel(version) {
  return parseVersion(version).minor % 2 === 0 ? "stable" : "prerelease";
}

function getExpectedSourceBranch(version) {
  const parsed = parseVersion(version);
  return parsed.minor % 2 === 0
    ? "main"
    : `prerelease/${parsed.major}.${parsed.minor}.x`;
}

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
```

Keep the exact end anchor `$` in `VERSION_PATTERN`.

- [ ] **Step 4: Refactor metadata and guard callers**

In `scripts/release-metadata.js`, replace the local parser with:

```javascript
const {
  getChannel,
  getExpectedSourceBranch
} = require("./release-policy.js");

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
```

Keep `module.exports = { getChannel, getReleaseMetadata }` and print:

```javascript
process.stdout.write(
  `channel=${metadata.channel}\n` +
  `source_branch=${metadata.sourceBranch}\n` +
  `tag=${metadata.tag}\n` +
  `version=${metadata.version}\n`
);
```

In `scripts/guard-channel.js`, change only its import to:

```javascript
const { getChannel } = require("./release-policy.js");
```

Preserve every existing error message asserted by tests. This follows the approved single-policy boundary. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L84-L102`)

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
npm run compile:tests
npx mocha "out/test/unit/releasePolicy.test.js" "out/test/unit/releaseMetadata.test.js" "out/test/unit/guardChannel.test.js"
```

Expected: all release-policy, metadata, and channel-guard tests pass.

- [ ] **Step 6: Commit the centralized policy**

```powershell
git add scripts/release-policy.js scripts/release-metadata.js scripts/guard-channel.js test/unit/releasePolicy.test.ts test/unit/releaseMetadata.test.ts test/unit/guardChannel.test.ts
git commit -m "feat(release): centralize branch and channel policy"
```

---

### Task 2: Validate Tagged Release Sources

**Files:**
- Create: `scripts/validate-release-source.js`
- Create: `test/unit/validateReleaseSource.test.ts`
- Modify: `scripts/extract-changelog.js`
- Modify: `test/unit/changelog.test.ts`

**Interfaces:**
- Consumes: `tag`, `packagePath`, `changelogPath`, and `repositoryPath` from the publish workflow.
- Produces:
  - `validateReleaseSource(options): { channel; commit; sourceBranch; tag; version }`
  - CLI exit 0 on an authorized source; exit 1 for validation or I/O failure; exit 2 for incorrect usage.

- [ ] **Step 1: Add failing changelog completeness tests**

Extend `test/unit/changelog.test.ts`:

```typescript
it("fails the CLI when the requested section is empty", () => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "claude-workspaces-empty-changelog-")
  );
  const selectedChangelog = path.join(temporaryDirectory, "CHANGELOG.md");
  fs.writeFileSync(
    selectedChangelog,
    "# Changelog\n\n## [9.8.7]\n\n## [9.8.6]\n\n- Prior release.\n"
  );

  try {
    const result = spawnSync(
      process.execPath,
      [scriptPath, "9.8.7", selectedChangelog],
      { encoding: "utf8", timeout: CHILD_PROCESS_TIMEOUT_MS }
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /section for version \[9\.8\.7\] is empty/i);
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}).timeout(PROCESS_TEST_TIMEOUT_MS);
```

- [ ] **Step 2: Add failing temporary-repository validator tests**

Create `test/unit/validateReleaseSource.test.ts`. Its helper must initialize a temporary repository with a local user, write package/changelog fixtures, commit, create the release tag, and create an explicit remote-tracking ref without touching a real remote:

```typescript
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

type ReleaseSourceValidator = {
  validateReleaseSource(options: {
    tag: string;
    packagePath: string;
    changelogPath: string;
    repositoryPath: string;
  }): {
    channel: "stable" | "prerelease";
    commit: string;
    sourceBranch: string;
    tag: string;
    version: string;
  };
};

const CHILD_PROCESS_TIMEOUT_MS = 10_000;
const loadModule = createRequire(__filename);
const validatorScriptPath = path.resolve("scripts/validate-release-source.js");
const { validateReleaseSource } = loadModule(
  validatorScriptPath
) as ReleaseSourceValidator;

function git(repositoryPath: string, ...args: string[]): string {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8",
    timeout: CHILD_PROCESS_TIMEOUT_MS
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function createReleaseRepository(version: string): string {
  const repositoryPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "claude-workspaces-release-source-")
  );
  git(repositoryPath, "init");
  git(repositoryPath, "config", "user.email", "release-test@example.invalid");
  git(repositoryPath, "config", "user.name", "Release Test");
  fs.writeFileSync(
    path.join(repositoryPath, "package.json"),
    JSON.stringify({ version }, null, 2)
  );
  fs.writeFileSync(
    path.join(repositoryPath, "CHANGELOG.md"),
    `# Changelog\n\n## [${version}]\n\n- Tested release.\n`
  );
  git(repositoryPath, "add", "package.json", "CHANGELOG.md");
  git(repositoryPath, "commit", "-m", "release fixture");
  git(repositoryPath, "tag", `v${version}`);
  return repositoryPath;
}
```

Cover at least:

```typescript
it("accepts an odd-minor tag contained in its matching prerelease branch", () => {
  const repositoryPath = createReleaseRepository("0.7.0");
  try {
    git(
      repositoryPath,
      "update-ref",
      "refs/remotes/origin/prerelease/0.7.x",
      "HEAD"
    );
    assert.doesNotThrow(() =>
      validateReleaseSource({
        tag: "v0.7.0",
        packagePath: path.join(repositoryPath, "package.json"),
        changelogPath: path.join(repositoryPath, "CHANGELOG.md"),
        repositoryPath
      })
    );
  } finally {
    fs.rmSync(repositoryPath, { recursive: true, force: true });
  }
});

it("rejects a tag absent from the authorized source branch", () => {
  const repositoryPath = createReleaseRepository("0.7.0");
  try {
    const releaseCommit = git(repositoryPath, "rev-parse", "HEAD");
    git(repositoryPath, "switch", "--orphan", "unrelated");
    git(repositoryPath, "rm", "-rf", ".");
    fs.writeFileSync(
      path.join(repositoryPath, "unrelated.txt"),
      "unrelated history\n"
    );
    git(repositoryPath, "add", "unrelated.txt");
    git(repositoryPath, "commit", "-m", "unrelated fixture");
    const unrelatedCommit = git(repositoryPath, "rev-parse", "HEAD");
    git(
      repositoryPath,
      "update-ref",
      "refs/remotes/origin/prerelease/0.7.x",
      unrelatedCommit
    );
    git(repositoryPath, "checkout", "--detach", releaseCommit);

    assert.throws(
      () =>
        validateReleaseSource({
          tag: "v0.7.0",
          packagePath: path.join(repositoryPath, "package.json"),
          changelogPath: path.join(repositoryPath, "CHANGELOG.md"),
          repositoryPath
        }),
      /tag v0\.7\.0.*authorized source branch prerelease\/0\.7\.x/i
    );
  } finally {
    fs.rmSync(repositoryPath, { recursive: true, force: true });
  }
});

it("accepts an even-minor tag contained in origin/main", () => {
  const repositoryPath = createReleaseRepository("0.8.0");
  try {
    git(repositoryPath, "update-ref", "refs/remotes/origin/main", "HEAD");
    const result = validateReleaseSource({
      tag: "v0.8.0",
      packagePath: path.join(repositoryPath, "package.json"),
      changelogPath: path.join(repositoryPath, "CHANGELOG.md"),
      repositoryPath
    });
    assert.equal(result.sourceBranch, "main");
    assert.equal(result.commit, git(repositoryPath, "rev-parse", "HEAD"));
  } finally {
    fs.rmSync(repositoryPath, { recursive: true, force: true });
  }
});

it("rejects a missing authorized source ref", () => {
  const repositoryPath = createReleaseRepository("0.7.0");
  try {
    assert.throws(
      () =>
        validateReleaseSource({
          tag: "v0.7.0",
          packagePath: path.join(repositoryPath, "package.json"),
          changelogPath: path.join(repositoryPath, "CHANGELOG.md"),
          repositoryPath
        }),
      /refs\/remotes\/origin\/prerelease\/0\.7\.x/i
    );
  } finally {
    fs.rmSync(repositoryPath, { recursive: true, force: true });
  }
});

it("reports success, validation failure, and usage through CLI exit codes", () => {
  const repositoryPath = createReleaseRepository("0.7.0");
  try {
    const packagePath = path.join(repositoryPath, "package.json");
    const changelogPath = path.join(repositoryPath, "CHANGELOG.md");
    git(
      repositoryPath,
      "update-ref",
      "refs/remotes/origin/prerelease/0.7.x",
      "HEAD"
    );

    const success = spawnSync(
      process.execPath,
      [
        validatorScriptPath,
        "v0.7.0",
        packagePath,
        changelogPath,
        repositoryPath
      ],
      { encoding: "utf8", timeout: CHILD_PROCESS_TIMEOUT_MS }
    );
    assert.equal(success.status, 0, success.stderr);
    assert.match(success.stdout, /validated v0\.7\.0 from prerelease\/0\.7\.x/i);

    git(repositoryPath, "update-ref", "-d", "refs/remotes/origin/prerelease/0.7.x");
    const rejected = spawnSync(
      process.execPath,
      [
        validatorScriptPath,
        "v0.7.0",
        packagePath,
        changelogPath,
        repositoryPath
      ],
      { encoding: "utf8", timeout: CHILD_PROCESS_TIMEOUT_MS }
    );
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /refs\/remotes\/origin\/prerelease\/0\.7\.x/i);

    const usage = spawnSync(process.execPath, [validatorScriptPath], {
      encoding: "utf8",
      timeout: CHILD_PROCESS_TIMEOUT_MS
    });
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /usage:/i);
  } finally {
    fs.rmSync(repositoryPath, { recursive: true, force: true });
  }
});
```

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```powershell
npm run compile:tests
npx mocha "out/test/unit/changelog.test.js" "out/test/unit/validateReleaseSource.test.js"
```

Expected: empty changelog currently exits successfully and the validator module is missing.

- [ ] **Step 4: Reject empty changelog sections**

In `scripts/extract-changelog.js`, distinguish `undefined` from an empty string. Preserve the current missing-section message and add:

```javascript
if (section.length === 0) {
  process.stderr.write(
    `Section for version [${version}] is empty in CHANGELOG.md\n`
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`${section}\n`);
}
```

This closes the gap where the extractor currently writes a blank release body and exits successfully. (`scripts/extract-changelog.js:L46-L60`; `docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L104-L119`)

- [ ] **Step 5: Implement the release-source validator**

Create `scripts/validate-release-source.js` with:

```javascript
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { extractChangelogSection } = require("./extract-changelog.js");
const { getReleaseMetadata } = require("./release-metadata.js");

function runGit(repositoryPath, args) {
  const result = spawnSync("git", ["-C", repositoryPath, ...args], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || `git ${args.join(" ")} failed`;
    throw new Error(detail);
  }
  return result.stdout.trim();
}

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
    `${metadata.tag}^{commit}`
  ]);
  const sourceRef = `refs/remotes/origin/${metadata.sourceBranch}`;
  runGit(options.repositoryPath, ["show-ref", "--verify", sourceRef]);

  const ancestry = spawnSync(
    "git",
    ["-C", options.repositoryPath, "merge-base", "--is-ancestor", commit, sourceRef],
    { encoding: "utf8" }
  );
  if (ancestry.status === 1) {
    throw new Error(
      `Tag ${metadata.tag} is not contained in authorized source branch ${metadata.sourceBranch}.`
    );
  }
  if (ancestry.status !== 0) {
    throw new Error(
      ancestry.stderr.trim() ||
        `Failed to compare ${metadata.tag} with ${metadata.sourceBranch}.`
    );
  }

  return { ...metadata, commit };
}

module.exports = { validateReleaseSource };
```

Add a CLI accepting exactly:

```text
node scripts/validate-release-source.js <tag> <package-path> <changelog-path> <repository-path>
```

Resolve every supplied path with `path.resolve`, write one concise success line, and use exit 1 for validation failure and exit 2 for incorrect arity.

```javascript
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
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npm run compile:tests
npx mocha "out/test/unit/changelog.test.js" "out/test/unit/validateReleaseSource.test.js"
```

Expected: all changelog and source-validation tests pass without network access.

- [ ] **Step 7: Commit source validation**

```powershell
git add scripts/validate-release-source.js scripts/extract-changelog.js test/unit/validateReleaseSource.test.ts test/unit/changelog.test.ts
git commit -m "feat(release): validate tagged source ancestry"
```

---

### Task 3: Enforce Policy in CI and Publication

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/publish.yml`
- Create: `test/unit/releaseWorkflow.test.ts`
- Modify: `test/unit/releaseMetadata.test.ts`

**Interfaces:**
- Consumes: `source_branch` emitted by `scripts/release-metadata.js` and `validate-release-source.js` from Task 2.
- Produces: stable GitHub check `Release Policy` and a publish preflight that completes before `npm ci`.

- [ ] **Step 1: Add failing workflow-contract tests**

Create `test/unit/releaseWorkflow.test.ts`:

```typescript
import assert from "node:assert/strict";
import fs from "node:fs";

const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
const publish = fs.readFileSync(".github/workflows/publish.yml", "utf8");

describe("release workflow contracts", () => {
  it("runs push CI on main and versioned prerelease branches", () => {
    assert.match(ci, /branches:\s*\n\s*- main\s*\n\s*- ["']?prerelease\/\*\*["']?/);
  });

  it("exposes one focused Release Policy check", () => {
    assert.match(ci, /name:\s*Release Policy/);
    assert.match(ci, /npm run test:release-policy/);
  });

  it("validates the tagged source before dependency installation", () => {
    const validation = publish.indexOf("Validate release source");
    const install = publish.indexOf("Install dependencies");
    const marketplace = publish.indexOf("Publish to VS Code Marketplace");
    assert.ok(validation >= 0);
    assert.ok(validation < install);
    assert.ok(validation < marketplace);
  });

  it("fetches only the derived authorized source branch", () => {
    assert.match(publish, /steps\.release\.outputs\.source_branch/);
    assert.match(publish, /refs\/heads\/\$SOURCE_BRANCH/);
  });
});
```

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```powershell
npm run compile:tests
npx mocha "out/test/unit/releaseWorkflow.test.js"
```

Expected: failures for missing pre-release push coverage, focused job, and publication preflight.

- [ ] **Step 3: Add the focused package script**

Add `test:release-policy` to `package.json`:

```json
"test:release-policy": "npm run compile:tests && mocha \"out/test/unit/changelog.test.js\" \"out/test/unit/guardChannel.test.js\" \"out/test/unit/releaseMetadata.test.js\" \"out/test/unit/releasePolicy.test.js\" \"out/test/unit/validateReleaseSource.test.js\" \"out/test/unit/releaseWorkflow.test.js\""
```

Do not replace `test:unit` or `test`; the new command is a focused CI surface. (`package.json:L35-L47`)

- [ ] **Step 4: Extend CI triggers and add the check**

Modify the push trigger:

```yaml
push:
  branches:
    - main
    - "prerelease/**"
```

Add a separate job:

```yaml
release-policy:
  name: Release Policy
  runs-on: ubuntu-latest
  permissions:
    contents: read
  steps:
    - name: Check out source
      uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      with:
        persist-credentials: false
    - name: Set up Node.js
      uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
      with:
        node-version: 20
        cache: npm
    - name: Install dependencies
      run: npm ci
    - name: Test release policy
      run: npm run test:release-policy
```

Keep the existing matrix and integration job names unchanged because the ruleset will require their exact live names. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L121-L137`)

- [ ] **Step 5: Add publish preflight steps**

Immediately after `Derive release metadata` and before `Install dependencies`, add:

```yaml
- name: Fetch approved release source
  env:
    SOURCE_BRANCH: ${{ steps.release.outputs.source_branch }}
  run: >-
    git -C release-source fetch --no-tags origin
    "+refs/heads/$SOURCE_BRANCH:refs/remotes/origin/$SOURCE_BRANCH"

- name: Validate release source
  env:
    TAG: ${{ inputs.tag || github.ref_name }}
  run: >-
    node automation/scripts/validate-release-source.js
    "$TAG"
    release-source/package.json
    release-source/CHANGELOG.md
    release-source
```

Keep `persist-credentials: false` on both checkouts and do not introduce write credentials into the validation step. The publish job already has the minimum write permission needed by the later GitHub Release action. (`.github/workflows/publish.yml:L18-L41`; `docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L139-L162`)

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```powershell
npm run test:release-policy
```

Expected: all focused policy and workflow-contract tests pass.

- [ ] **Step 7: Commit workflow enforcement**

```powershell
git add package.json .github/workflows/ci.yml .github/workflows/publish.yml test/unit/releaseWorkflow.test.ts test/unit/releaseMetadata.test.ts
git commit -m "ci(release): enforce versioned release sources"
```

---

### Task 4: Document Branching, Promotion, and Forward-porting

**Files:**
- Modify: `docs/versioning-policy.md`
- Modify: `CONTRIBUTING.md`
- Modify: `README.md`
- Modify: `test/unit/packageAssets.test.ts`

**Interfaces:**
- Consumes: branch names and release-source rules implemented in Tasks 1-3.
- Produces: canonical public lifecycle documentation and package-asset regression assertions.

- [ ] **Step 1: Add failing documentation assertions**

Extend the existing versioning-policy test in `test/unit/packageAssets.test.ts` with:

```typescript
assert.match(versioningPolicy, /prerelease\/0\.7\.x/);
assert.match(versioningPolicy, /release\/0\.8\.0/);
assert.match(versioningPolicy, /selective promotion/i);
assert.match(versioningPolicy, /full promotion/i);
assert.match(versioningPolicy, /forward-port/i);
assert.match(versioningPolicy, /source PR[\s\S]{0,100}squash commit/i);
assert.match(contributing, /base[\s\S]{0,100}active pre-release branch/i);
assert.match(readme, /versioned pre-release branch/i);
```

Also assert that the old instruction `use a focused branch based on the latest main` is absent from `CONTRIBUTING.md`. The current text is the behavior being replaced. (`CONTRIBUTING.md:L54-L62`)

- [ ] **Step 2: Run the package-asset test and verify RED**

Run:

```powershell
npm run compile:tests
npx mocha "out/test/unit/packageAssets.test.js"
```

Expected: failures for the missing branch lifecycle and unchanged `main` instruction.

- [ ] **Step 3: Expand the canonical versioning policy**

Add sections to `docs/versioning-policy.md` with these exact operational rules:

```markdown
## Development branches

`main` contains the current stable even-minor line. New features for the next
odd-minor line branch from and return to `prerelease/MAJOR.MINOR.x` through
squash-merged pull requests. The active branch is `prerelease/0.7.x`.

Stable maintenance fixes branch from `main` and return through a pull request.
Forward-port each merged stable fix in a separate pull request to the active
pre-release branch.

## Stable promotion

Create `release/MAJOR.MINOR.PATCH` from `main`. For selective promotion,
cherry-pick approved feature squash commits. For full promotion, squash the
remaining pre-release tree into the candidate. The candidate pull request must
record each source PR number and squash commit SHA. Stop for manual resolution
when promotion conflicts occur.

Odd-minor tags must belong to the matching `prerelease/MAJOR.MINOR.x` branch.
Even-minor tags must belong to `main`.
```

Retain installation, packaging, publication, and current-channel guidance. (`docs/versioning-policy.md:L28-L73`)

- [ ] **Step 4: Correct contributor and README guidance**

Replace `CONTRIBUTING.md`'s latest-`main` instruction with:

```markdown
For new pre-release features, base the focused branch on the active pre-release
branch and target that branch in the pull request. Base stable maintenance work
on the latest `main` and forward-port the merged fix through a separate pull
request. See the versioning policy for the active branch and promotion process.
```

Add this README publishing paragraph:

```markdown
New features integrate through a versioned pre-release branch. Stable
candidates promote approved work from that line to `main`. See the
[versioning policy](docs/versioning-policy.md) for active branch names,
selective and full promotion, source provenance, and forward-porting rules.
```

Keep the README summary version-agnostic except for existing current-channel links. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L222-L238`)

- [ ] **Step 5: Run documentation tests and verify GREEN**

Run:

```powershell
npm run compile:tests
npx mocha "out/test/unit/packageAssets.test.js"
```

Expected: all documentation, local-link, and packaged-asset assertions pass.

- [ ] **Step 6: Commit documentation**

```powershell
git add docs/versioning-policy.md CONTRIBUTING.md README.md test/unit/packageAssets.test.ts
git commit -m "docs(release): define prerelease promotion lifecycle"
```

---

### Task 5: Verify and Open the Implementation Pull Request

**Files:**
- Verify all files from Tasks 1-4.
- Retain: `docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md`
- Retain until rollout completes: `docs/superpowers/plans/2026-09-17-versioned-prerelease-workflow.md`

**Interfaces:**
- Consumes: completed implementation commits.
- Produces: reviewed implementation PR into `main` that relates to #112 without closing it prematurely.

- [ ] **Step 1: Run focused and full validation**

Run each command separately:

```powershell
npm run test:release-policy
npm run check:types
npm run lint
npm test
npm run build:production
```

Expected: focused policy tests, the complete unit suite, both configured integration hosts, types, lint, and production build all pass. Report the observed test counts in the PR.

- [ ] **Step 2: Exercise accepted and rejected CLI scenarios**

Run the validator tests directly:

```powershell
npm run compile:tests
npx mocha "out/test/unit/validateReleaseSource.test.js"
```

Expected: accepted odd/even sources pass; wrong, missing, and unrelated source refs fail inside the tests without remote changes.

- [ ] **Step 3: Perform artifact-persistence and scope audits**

Run:

```powershell
git diff main...HEAD --stat
git diff --check
git status --short
git ls-tree HEAD -- scripts/release-policy.js
git ls-tree HEAD -- scripts/validate-release-source.js
git ls-tree HEAD -- docs/versioning-policy.md
git ls-tree HEAD -- docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md
git ls-tree HEAD -- docs/superpowers/plans/2026-09-17-versioned-prerelease-workflow.md
```

Expected: every claimed deliverable appears in the diff or already exists in `main`, every listed path resolves in `HEAD`, and the worktree is clean.

- [ ] **Step 4: Request independent code review**

Use `superpowers:requesting-code-review`. Address all valid findings through additional test-first commits and rerun the affected validations. Do not merge with ambiguous or disputed feedback unresolved.

- [ ] **Step 5: Verify remote PR state before the first push**

Use the GitHub MCP when available; otherwise run:

```powershell
gh pr list --repo glitchwerks/vscode-claude-workspaces --head issue-112-versioned-prerelease-workflow --state all
```

Expected: no existing PR. If one exists and is open, update it instead of creating a duplicate. If it is merged or closed, create a new branch/PR rather than pushing into a dead review.

- [ ] **Step 6: Push and open the PR**

Push only after Step 5:

```powershell
git push -u origin issue-112-versioned-prerelease-workflow
```

Create a PR into `main` with:

```markdown
## Summary

- centralize odd/even channel and versioned source-branch policy
- reject tags that are not contained in their authorized release branch
- run focused release-policy CI on main and pre-release development
- document selective/full promotion and stable hotfix forward-porting

## Validation

- `npm run test:release-policy`
- `npm run check:types`
- `npm run lint`
- `npm test`
- `npm run build:production`
- artifact-persistence audit completed

## Rollout

After merge, create `prerelease/0.7.x`, verify its CI, apply the release-branch
ruleset, and then close #112 with the live evidence.

Relates to #112.

> 🤖 _Generated by Codex on behalf of @cbeaulieu-gt_
```

Do not use `Closes #112` in this PR because the live branch and ruleset remain outstanding after merge. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L262-L272`)

---

### Task 6: Merge and Activate the 0.7.x Integration Line

**Files:**
- External GitHub state only: implementation PR, `prerelease/0.7.x` branch, repository ruleset, issue #112.

**Interfaces:**
- Consumes: merged implementation PR and its exact `main` commit.
- Produces: protected live `prerelease/0.7.x` with required CI.

- [ ] **Step 1: Complete the pre-merge gate**

Before merging, inspect the live PR, unresolved inline/general comments, pending review requests, `CHANGES_REQUESTED` reviews, and review-bot output. Resolve the current PR number and inspect checks on its actual head commit:

```powershell
$pullRequestNumber = gh pr view --json number --jq ".number"
gh pr checks $pullRequestNumber
```

Address valid feedback; raise invalid, stale, ambiguous, or out-of-scope feedback to the user. Merge only with explicit user authorization.

- [ ] **Step 2: Fetch the merged `main` and create the remote branch**

After the PR is merged:

```powershell
git fetch origin main
git push origin origin/main:refs/heads/prerelease/0.7.x
```

Expected: the new branch points exactly to the post-merge `origin/main` commit. Confirm with:

```powershell
git ls-remote --heads origin main prerelease/0.7.x
```

The two SHA values must match at creation time. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L262-L269`)

- [ ] **Step 3: Wait for and verify first-branch CI**

Resolve and watch the newest push run:

```powershell
$runId = gh run list --branch prerelease/0.7.x --workflow CI --limit 1 --json databaseId --jq ".[0].databaseId"
gh run watch $runId --exit-status
```

Confirm these exact successful checks:

- `Release Policy`
- `Quality (ubuntu-latest)`
- `Quality (windows-latest)`
- `Quality (macos-latest)`
- `Extension Host Integration (Windows)`

- [ ] **Step 4: Create the repository ruleset**

Create a temporary `.tmp/issue-112-release-ruleset.json` with this complete payload:

```json
{
  "name": "release branches",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": {
      "include": [
        "refs/heads/main",
        "refs/heads/prerelease/*"
      ],
      "exclude": []
    }
  },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["squash"],
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": false,
        "required_reviewers": []
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "do_not_enforce_on_create": false,
        "required_status_checks": [
          { "context": "Release Policy" },
          { "context": "Quality (ubuntu-latest)" },
          { "context": "Quality (windows-latest)" },
          { "context": "Quality (macos-latest)" },
          { "context": "Extension Host Integration (Windows)" }
        ],
        "strict_required_status_checks_policy": false
      }
    }
  ]
}
```

Submit it with the GitHub MCP when available; otherwise:

```powershell
$ruleset = gh api repos/glitchwerks/vscode-claude-workspaces/rulesets -X POST --input .tmp/issue-112-release-ruleset.json | ConvertFrom-Json
$ruleset.id
```

Expected: an active repository-level ruleset ID. The exact check names must already have successful recent runs before they are required. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L195-L220`)

- [ ] **Step 5: Verify the live ruleset**

Read the created ruleset and confirm:

```powershell
gh api "repos/glitchwerks/vscode-claude-workspaces/rulesets/$($ruleset.id)"
```

- active enforcement;
- includes `refs/heads/main` and `refs/heads/prerelease/*`;
- deletion and non-fast-forward rules;
- squash-only pull requests; and
- all five exact required checks.

Remove the temporary JSON with an `apply_patch` delete after verification. Do not edit the organization-level `default` ruleset.

- [ ] **Step 6: Record rollout evidence without closing #112 yet**

Post a GitHub issue comment containing the implementation PR, merged commit, branch SHA, CI run URL, and ruleset URL. End it with:

```markdown
> 🤖 _Generated by Codex on behalf of @cbeaulieu-gt_
```

Keep #112 open until the implementation plan file has been retired in Task 7.

---

### Task 7: Retire the Completed Plan and Close #112

**Files:**
- Delete: `docs/superpowers/plans/2026-09-17-versioned-prerelease-workflow.md`
- Verify: no committed file references the deleted plan path.

**Interfaces:**
- Consumes: successful implementation merge, live branch CI, active ruleset, and rollout evidence.
- Produces: durable spec/issue history without a completed execution-plan file.

- [ ] **Step 1: Create a cleanup branch from updated `main`**

Pull `origin/main` first, then create a separate worktree branch named `docs/retire-issue-112-plan`. This cleanup is part of #112, so no new issue is required.

- [ ] **Step 2: Audit references and delete the plan**

Run:

```powershell
rg -n "2026-09-17-versioned-prerelease-workflow\.md" . --glob "!docs/superpowers/plans/2026-09-17-versioned-prerelease-workflow.md"
```

Expected: no committed references. Delete the plan with `apply_patch` and retain the approved design spec as the durable architectural record.

- [ ] **Step 3: Commit and verify**

```powershell
git add docs/superpowers/plans/2026-09-17-versioned-prerelease-workflow.md
git commit -m "docs(plan): retire completed release workflow plan"
git diff origin/main...HEAD --stat
git diff --check
```

Expected: the diff deletes only the completed plan.

- [ ] **Step 4: Open and merge the cleanup PR**

Before every push, verify any PR for `docs/retire-issue-112-plan` is still open. Create the PR with `Relates to #112` and the required Codex attribution. Inspect live reviews and CI before merging; merge only with explicit user authorization.

- [ ] **Step 5: Close #112**

After the cleanup PR merges, add a final issue comment summarizing:

- implementation PR and merge commit;
- `prerelease/0.7.x` branch and initial SHA;
- successful CI run;
- active ruleset URL; and
- cleanup PR.

End the comment with the Codex attribution, then close #112 manually. The issue closes only after every code, repository-state, and plan-lifecycle deliverable is complete. (`docs/superpowers/specs/2026-09-17-versioned-prerelease-workflow-design.md:L262-L288`)
