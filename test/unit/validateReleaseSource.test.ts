import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import type { Approval, BuildApprovalInput, GitHubEvidence, PolicyState } from "../../scripts/release-enforcement/contracts";
import { fixtureEvidence } from "./helpers/releasePolicyFixture";

type ReleaseSourceValidator = {
  validateReleaseSource(options: {
    tag: string;
    packagePath: string;
    changelogPath: string;
    repositoryPath: string;
    policy?: PolicyState;
    github?: GitHubEvidence;
  }): Promise<{
    channel: "stable" | "prerelease";
    commit: string;
    sourceBranch: string;
    tag: string;
    version: string;
  }>;
};

const CHILD_PROCESS_TIMEOUT_MS = 10_000;
const PROCESS_TEST_TIMEOUT_MS = 15_000;
const loadModule = createRequire(__filename);
const validatorScriptPath = path.resolve(
  "scripts/validate-release-source.js"
);
const { validateReleaseSource: rawValidateReleaseSource } = loadModule(
  validatorScriptPath
) as ReleaseSourceValidator;

const { buildApproval } = loadModule(path.resolve("scripts/release-enforcement/records.js")) as {
  buildApproval(repo: string, input: BuildApprovalInput): Approval;
};
const fixturePolicies = new Map<string, PolicyState>();
function validateReleaseSource(options: Parameters<ReleaseSourceValidator["validateReleaseSource"]>[0]) {
  return rawValidateReleaseSource({ ...options, policy: fixturePolicies.get(options.repositoryPath),
    github: fixtureEvidence({ number: 200, state: "open", head: { sha: "a".repeat(40), ref: "fixture", repositoryId: 1344170098 },
      base: { sha: "a".repeat(40), ref: "main", repositoryId: 1344170098 } }) });
}
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
  const commit = git(repositoryPath, "rev-parse", "HEAD");
  const [major, minor] = version.split(".").map(Number);
  const branch = minor! % 2 === 0 ? "main" : `prerelease/${major}.${minor}.x`;
  const approval = buildApproval(repositoryPath, { kind: "historical", mode: "full", targetVersion: version,
    issue: 157, source: { tag: `v${version}`, commit, branch, releaseId: 10, publishRunId: 20 },
    baselineTag: `v${version}`, candidateCommit: commit, sourceCommits: [], sourcePullRequests: [], rationale: "Exact fixture historical retry" });
  fixturePolicies.set(repositoryPath, { config: { schemaVersion: 1,
    repository: { id: 1344170098, fullName: "glitchwerks/vscode-claude-workspaces", defaultBranch: "main" },
    activePrerelease: "prerelease/0.9.x" }, authorityCommit: commit, approvals: [approval], dispositions: [] });
  return repositoryPath;
}

describe("release source validation", () => {
  it("accepts an odd-minor tag contained in its matching prerelease branch", async () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      git(
        repositoryPath,
        "update-ref",
        "refs/remotes/origin/prerelease/0.7.x",
        "HEAD"
      );
      await assert.doesNotReject(() =>
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

  it("accepts a tag when the authorized branch advances beyond it", async () => {
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

      const result = await validateReleaseSource({
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

  it("rejects a tag ahead of the authorized branch", async () => {
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

      await assert.rejects(
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

  it("rejects a tag absent from the authorized source branch", async () => {
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

      await assert.rejects(
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

  it("accepts an even-minor tag contained in origin/main", async () => {
    const repositoryPath = createReleaseRepository("0.8.1");
    try {
      git(repositoryPath, "update-ref", "refs/remotes/origin/main", "HEAD");
      const result = await validateReleaseSource({
        tag: "v0.8.1",
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

  it("rejects a missing authorized source ref", async () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      await assert.rejects(
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

  it("rejects a same-named branch when the release tag is missing", async () => {
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

      await assert.rejects(
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

  it("rejects a release tag that differs from package.json", async () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      await assert.rejects(
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

  it("rejects an empty changelog section", async () => {
    const repositoryPath = createReleaseRepository("0.7.0");
    try {
      fs.writeFileSync(
        path.join(repositoryPath, "CHANGELOG.md"),
        "# Changelog\n\n## [0.7.0]\n"
      );
      await assert.rejects(
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

  it("blocks an unregistered CLI source before downstream writes and preserves usage errors", async () => {
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
      const downstreamMarker = path.join(repositoryPath, "publish-marker");
      if (success.status === 0) { fs.writeFileSync(downstreamMarker, "published"); }
      assert.equal(success.status, 1, success.stderr);
      assert.match(success.stderr, /E_ROUTE|E_POLICY_PROVENANCE/);
      assert.equal(fs.existsSync(downstreamMarker), false);

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

  it("reports an unavailable Git process without masking the launch error", async () => {
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
