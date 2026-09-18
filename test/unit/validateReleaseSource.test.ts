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
const PROCESS_TEST_TIMEOUT_MS = 15_000;
const loadModule = createRequire(__filename);
const validatorScriptPath = path.resolve(
  "scripts/validate-release-source.js"
);
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

describe("release source validation", () => {
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
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

  it("accepts a tag when the authorized branch advances beyond it", () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      const taggedCommit = git(
        repositoryPath,
        "rev-parse",
        "refs/tags/v0.7.0^{commit}"
      );
      fs.writeFileSync(
        path.join(repositoryPath, "branch-tip.txt"),
        "authorized branch advanced\n"
      );
      git(repositoryPath, "add", "branch-tip.txt");
      git(repositoryPath, "commit", "-m", "advance authorized branch");
      git(
        repositoryPath,
        "update-ref",
        "refs/remotes/origin/prerelease/0.7.x",
        "HEAD"
      );

      const result = validateReleaseSource({
        tag: "v0.7.0",
        packagePath: path.join(repositoryPath, "package.json"),
        changelogPath: path.join(repositoryPath, "CHANGELOG.md"),
        repositoryPath
      });

      assert.equal(result.commit, taggedCommit);
    } finally {
      fs.rmSync(repositoryPath, { recursive: true, force: true });
    }
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

  it("rejects a tag ahead of the authorized branch", () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      const authorizedCommit = git(repositoryPath, "rev-parse", "HEAD");
      git(
        repositoryPath,
        "update-ref",
        "refs/remotes/origin/prerelease/0.7.x",
        authorizedCommit
      );
      fs.writeFileSync(
        path.join(repositoryPath, "tag-tip.txt"),
        "tag advanced beyond authorized branch\n"
      );
      git(repositoryPath, "add", "tag-tip.txt");
      git(repositoryPath, "commit", "-m", "advance release tag");
      git(repositoryPath, "tag", "-f", "v0.7.0", "HEAD");

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
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

  it("rejects a tag absent from the authorized source branch", () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      const releaseCommit = git(repositoryPath, "rev-parse", "HEAD");
      git(repositoryPath, "switch", "--orphan", "unrelated");
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
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

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
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

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
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

  it("rejects a same-named branch when the release tag is missing", () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      git(
        repositoryPath,
        "update-ref",
        "refs/remotes/origin/prerelease/0.7.x",
        "HEAD"
      );
      git(repositoryPath, "tag", "-d", "v0.7.0");
      git(repositoryPath, "branch", "v0.7.0", "HEAD");

      assert.throws(
        () =>
          validateReleaseSource({
            tag: "v0.7.0",
            packagePath: path.join(repositoryPath, "package.json"),
            changelogPath: path.join(repositoryPath, "CHANGELOG.md"),
            repositoryPath
          }),
        /refs\/tags\/v0\.7\.0/i
      );
    } finally {
      fs.rmSync(repositoryPath, { recursive: true, force: true });
    }
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

  it("rejects a release tag that differs from package.json", () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      assert.throws(
        () =>
          validateReleaseSource({
            tag: "v0.7.1",
            packagePath: path.join(repositoryPath, "package.json"),
            changelogPath: path.join(repositoryPath, "CHANGELOG.md"),
            repositoryPath
          }),
        /tag v0\.7\.1 does not match package version 0\.7\.0/i
      );
    } finally {
      fs.rmSync(repositoryPath, { recursive: true, force: true });
    }
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

  it("rejects an empty changelog section", () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      fs.writeFileSync(
        path.join(repositoryPath, "CHANGELOG.md"),
        "# Changelog\n\n## [0.7.0]\n"
      );
      assert.throws(
        () =>
          validateReleaseSource({
            tag: "v0.7.0",
            packagePath: path.join(repositoryPath, "package.json"),
            changelogPath: path.join(repositoryPath, "CHANGELOG.md"),
            repositoryPath
          }),
        /section for version \[0\.7\.0\] is empty/i
      );
    } finally {
      fs.rmSync(repositoryPath, { recursive: true, force: true });
    }
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

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
      assert.match(
        success.stdout,
        /validated v0\.7\.0 from prerelease\/0\.7\.x/i
      );

      git(
        repositoryPath,
        "update-ref",
        "-d",
        "refs/remotes/origin/prerelease/0.7.x"
      );
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
      assert.match(
        rejected.stderr,
        /refs\/remotes\/origin\/prerelease\/0\.7\.x/i
      );

      const usage = spawnSync(process.execPath, [validatorScriptPath], {
        encoding: "utf8",
        timeout: CHILD_PROCESS_TIMEOUT_MS
      });
      assert.equal(usage.status, 2);
      assert.match(usage.stderr, /usage:/i);
    } finally {
      fs.rmSync(repositoryPath, { recursive: true, force: true });
    }
  }).timeout(PROCESS_TEST_TIMEOUT_MS);

  it("reports an unavailable Git process without masking the launch error", () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      const env = Object.fromEntries(
        Object.entries(process.env).filter(
          ([name]) => name.toLowerCase() !== "path"
        )
      );
      env.PATH = "";
      const result = spawnSync(
        process.execPath,
        [
          validatorScriptPath,
          "v0.7.0",
          path.join(repositoryPath, "package.json"),
          path.join(repositoryPath, "CHANGELOG.md"),
          repositoryPath
        ],
        { encoding: "utf8", env, timeout: CHILD_PROCESS_TIMEOUT_MS }
      );

      assert.equal(result.status, 1);
      assert.match(result.stderr, /spawnSync git ENOENT/i);
      assert.doesNotMatch(
        result.stderr,
        /cannot read properties of (?:null|undefined)/i
      );
    } finally {
      fs.rmSync(repositoryPath, { recursive: true, force: true });
    }
  }).timeout(PROCESS_TEST_TIMEOUT_MS);
});
