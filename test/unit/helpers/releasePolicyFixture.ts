import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GitHubEvidence, PullRequestIdentity, PublicationSource } from "../../../scripts/release-enforcement/contracts";

export function createGitFixture() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "release-policy-"));
  function git(args: string[], input?: string | Buffer): string {
    const result = spawnSync("git", ["-C", repo, ...args], {
      input, encoding: "utf8", timeout: 10000, maxBuffer: 16 * 1024 * 1024
    });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  }
  function commit(files: Record<string, string | Buffer | null>): string {
    for (const [name, contents] of Object.entries(files)) {
      const target = path.join(repo, name);
      if (contents === null) { fs.rmSync(target, { force: true }); }
      else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, contents);
      }
    }
    git(["add", "-A"]);
    git(["commit", "--allow-empty", "-m", "fixture"]);
    return git(["rev-parse", "HEAD"]);
  }
  git(["init", "-b", "main"]);
  git(["config", "user.email", "policy@example.invalid"]);
  git(["config", "user.name", "Policy Test"]);
  git(["config", "core.autocrlf", "false"]);
  git(["config", "core.hooksPath", path.join(repo, "absent-hooks")]);
  const initialCommit = commit({
    "package.json": JSON.stringify({ version: "0.8.1", engines: { vscode: "^1.120.0" } }),
    "package-lock.json": JSON.stringify({ version: "0.8.1", packages: { "": { version: "0.8.1" } } }),
    "src/example.ts": "export const value = 1;\n"
  });
  return { repo, initialCommit, commit, git,
    tag: (name: string, sha: string) => git(["tag", name, sha]),
    remove: () => fs.rmSync(repo, { recursive: true, force: true }) };
}

export function missingModule<T>(filename: string, loader: NodeRequire): T {
  try { return loader(path.resolve(filename)) as T; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") { throw error; }
    return {} as T;
  }
}

export function fixtureSource(f: ReturnType<typeof createGitFixture>, commit: string): PublicationSource {
  f.tag("v0.9.2", commit);
  return { tag: "v0.9.2", commit, branch: "prerelease/0.9.x", releaseId: 10, publishRunId: 20 };
}

export function fixtureEvidence(pr: PullRequestIdentity): GitHubEvidence {
  return { issue: async () => {}, pullRequest: async () => pr, publishedSource: async () => {}, mergedForwardPort: async () => {}, maintenanceBetween: async () => [] };
}

export function fixturePr(f: ReturnType<typeof createGitFixture>, options: { target: string; head: string; version: string; headRepositoryId?: number }): PullRequestIdentity {
  const head = f.commit({
    "package.json": JSON.stringify({ version: options.version, engines: { vscode: "^1.120.0" } }),
    "package-lock.json": JSON.stringify({ version: options.version, packages: { "": { version: options.version } } })
  });
  return { number: 200, state: "open", head: { sha: head, ref: options.head, repositoryId: options.headRepositoryId ?? 1344170098 },
    base: { sha: f.initialCommit, ref: options.target, repositoryId: 1344170098 } };
}
