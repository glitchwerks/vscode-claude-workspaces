import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { Approval, BuildApprovalInput, Disposition, GitHubEvidence, GuardResult, PolicyState, PullRequestIdentity, PublicationSource } from "../../scripts/release-enforcement/contracts";
import { createGitFixture, fixtureEvidence, fixturePr, fixtureSource } from "./helpers/releasePolicyFixture";

const loader = createRequire(__filename);
const { buildApproval } = loader(path.resolve("scripts/release-enforcement/records.js")) as { buildApproval(repo: string, input: BuildApprovalInput & { publishedTarget?: PublicationSource }): Approval };
const engine = loader(path.resolve("scripts/release-enforcement/evaluate.js")) as {
  evaluatePullRequest(options: { repositoryPath: string; pr: PullRequestIdentity; policy: PolicyState; github: GitHubEvidence }): Promise<GuardResult>;
  evaluatePublication(options: { repositoryPath: string; tag: string; commit: string; policy: PolicyState; github: GitHubEvidence }): Promise<GuardResult>;
};
const config = { schemaVersion: 1 as const, repository: { id: 1344170098, fullName: "glitchwerks/vscode-claude-workspaces", defaultBranch: "main" as const }, activePrerelease: "prerelease/0.9.x" };

// These regressions exercise real committed trees, not policy-path classification alone.
describe("release feedback authority regressions", function () {
  this.timeout(60000);
  for (const [filename, contents] of [
    ["test/unit/helpers/releasePolicyFixture.ts", "require('node:fs').writeFileSync('src/example.ts', 'poison');"],
    ["test/unit/releaseEnforcementRecords.test.ts", null],
    ["test/unit/releaseEnforcementPoison.test.ts", "require('node:fs').writeFileSync('dist/extension.js', 'poison');"],
    ["docs/imported-policy-module.js", "module.exports = 'poison';"]
  ] as [string, string | null][]) {
    for (const entry of ["PR", "publication"]) {
      it(`rejects post-approval ${entry} authority change in ${filename}`, async () => {
        const f = createGitFixture();
        try {
          const trusted = f.commit({
            ".github/release-policy/config.json": JSON.stringify(config),
            "test/unit/helpers/releasePolicyFixture.ts": "export const helper = true;",
            "test/unit/releaseEnforcementRecords.test.ts": "export const safe = true;"
          });
          f.tag("v0.8.1", trusted);
          const cutoff = f.commit({ "src/approved.ts": "published feature" });
          const source = fixtureSource(f, cutoff);
          const pr = fixturePr(f, { target: "main", head: "release/0.10.0", version: "0.10.0" });
          pr.base.sha = trusted;
          const approval = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", source,
            issue: 157, candidatePullRequest: 200, baselineTag: "v0.8.1", candidateCommit: pr.head.sha,
            sourceCommits: [], sourcePullRequests: [], rationale: "Frozen published feature" });
          const policy: PolicyState = { config, authorityCommit: trusted, approvals: [approval], dispositions: [] };
          assert.equal((await engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy, github: fixtureEvidence(pr) })).route, "promotion");
          pr.head.sha = f.commit({ [filename]: contents });
          if (entry === "PR") {
            await assert.rejects(engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy, github: fixtureEvidence(pr) }), /E_AUTHORITY/);
          } else {
            const tree = f.git(["rev-parse", `${pr.head.sha}^{tree}`]);
            const merged = f.git(["commit-tree", tree, "-p", trusted, "-m", "squash candidate"]);
            f.tag("v0.10.0", merged);
            const github = { ...fixtureEvidence(pr), pullRequest: async () => ({ ...pr, state: "closed", merged: true, mergeCommit: merged }) };
            await assert.rejects(engine.evaluatePublication({ repositoryPath: f.repo, tag: "v0.10.0", commit: merged, policy, github }), /E_AUTHORITY/);
          }
        } finally { f.remove(); }
      });
    }
  }
  it("admits executable policy-test changes through the separate main policy route", async () => {
    const f = createGitFixture();
    try {
      const base = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
      const head = f.commit({ "test/unit/releaseEnforcementApproved.test.ts": "export const approved = true;", "docs/design.md": "Updated policy explanation" });
      const pr: PullRequestIdentity = { number: 200, state: "open", head: { sha: head, ref: "policy/157-test-authority", repositoryId: config.repository.id },
        base: { sha: base, ref: "main", repositoryId: config.repository.id } };
      assert.equal((await engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: { config, authorityCommit: base, approvals: [], dispositions: [] }, github: fixtureEvidence(pr) })).route, "policy");
    } finally { f.remove(); }
  });
});

describe("release snapshot read caching", function () {
  this.timeout(60000);
  it("reuses immutable Git blobs and normalized commit entries across repeated comparisons", () => {
    const f = createGitFixture();
    try {
      const first = f.commit({ "media/shared.bin": Buffer.from([0, 255, 13, 10]) });
      const renamed = f.commit({ "media/shared.bin": null, "media/renamed.bin": Buffer.from([0, 255, 13, 10]) });
      const script = `
        const cp = require('node:child_process');
        const original = cp.spawnSync; let blobs = 0;
        cp.spawnSync = function(...args) {
          if (args[0] === 'git' && args[1].includes('cat-file')) blobs++;
          return original.apply(this, args);
        };
        const engine = require('./scripts/release-enforcement/snapshot.js');
        const [repo, first, renamed] = process.argv.slice(1);
        const a = engine.snapshot(repo, first); const firstReads = blobs;
        const b = engine.snapshot(repo, first); const repeatedReads = blobs - firstReads;
        const beforeRename = blobs;
        const c = engine.snapshot(repo, renamed); const renameReads = blobs - beforeRename;
        engine.diffScope(repo, first, renamed);
        console.log(JSON.stringify({ firstReads, repeatedReads, renameReads,
          firstDigest: a.productDigest, repeatedDigest: b.productDigest, renamedDigest: c.productDigest,
          oldPath: a.entries.some(e => e.path === 'media/shared.bin'),
          newPath: c.entries.some(e => e.path === 'media/renamed.bin') }));
      `;
      const result = spawnSync(process.execPath, ["-e", script, f.repo, first, renamed], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      const evidence = JSON.parse(result.stdout) as { firstReads: number; repeatedReads: number; renameReads: number; firstDigest: string; repeatedDigest: string; renamedDigest: string; oldPath: boolean; newPath: boolean };
      assert.ok(evidence.firstReads > 0);
      assert.equal(evidence.repeatedReads, 0, "Repeated snapshots must not spawn one blob subprocess per entry");
      assert.equal(evidence.renameReads, 0, "Identical blob bytes at another path reuse only content, not entry identity");
      assert.equal(evidence.firstDigest, evidence.repeatedDigest);
      assert.notEqual(evidence.firstDigest, evidence.renamedDigest);
      assert.equal(evidence.oldPath, true);
      assert.equal(evidence.newPath, true);
    } finally { f.remove(); }
  });
});

describe("historical target evidence regressions", function () {
  this.timeout(60000);
  function setup() {
    const f = createGitFixture();
    f.tag("v0.7.2", f.initialCommit);
    const source: PublicationSource = { tag: "v0.7.2", commit: f.initialCommit, branch: "prerelease/0.7.x", releaseId: 10, publishRunId: 20 };
    const pr = fixturePr(f, { target: "main", head: "policy/157-history", version: "0.8.1" });
    f.tag("v0.8.1", pr.head.sha);
    const publishedTarget: PublicationSource = { tag: "v0.8.1", commit: pr.head.sha, branch: "main", releaseId: 30, publishRunId: 40 };
    const input: BuildApprovalInput & { publishedTarget?: PublicationSource } = { kind: "historical", mode: "full", targetVersion: "0.8.1", source,
      publishedTarget, baselineTag: "v0.7.2", candidateCommit: pr.head.sha, issue: 157,
      sourceCommits: [], sourcePullRequests: [], rationale: "Previously published retry" };
    return { f, pr, source, publishedTarget, input };
  }
  it("requires exact target tag, commit and branch evidence in historical records", () => {
    const { f, input, publishedTarget } = setup();
    try {
      assert.throws(() => buildApproval(f.repo, { ...input, publishedTarget: undefined }), /E_SCHEMA/);
      for (const bad of [
        { ...publishedTarget, tag: "v0.8.2" },
        { ...publishedTarget, commit: f.initialCommit },
        { ...publishedTarget, branch: "prerelease/0.9.x" },
        { ...publishedTarget, releaseId: 0 },
        { ...publishedTarget, publishRunId: 0 }
      ]) {
        assert.throws(() => buildApproval(f.repo, { ...input, publishedTarget: bad }), /E_SCHEMA/);
      }
    } finally { f.remove(); }
  });
  it("rejects never-published targets despite a valid published source cutoff", async () => {
    const { f, pr, input, publishedTarget } = setup();
    try {
      const approval = buildApproval(f.repo, input);
      const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [approval], dispositions: [] };
      const github = { ...fixtureEvidence(pr), publishedSource: async (identity: PublicationSource) => {
        if (identity.tag === publishedTarget.tag) { throw new Error("E_EVIDENCE: target never published"); }
      } };
      await assert.rejects(engine.evaluatePublication({ repositoryPath: f.repo, tag: publishedTarget.tag, commit: publishedTarget.commit, policy, github }), /E_EVIDENCE/);
      assert.equal((await engine.evaluatePublication({ repositoryPath: f.repo, tag: publishedTarget.tag, commit: publishedTarget.commit, policy, github: fixtureEvidence(pr) })).approvalId, approval.id);
    } finally { f.remove(); }
  });
  it("rejects a handwritten historical approval PR whose target evidence is unavailable", async () => {
    const { f, pr, input, publishedTarget } = setup();
    try {
      const base = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
      const approval = buildApproval(f.repo, input);
      pr.base.sha = base;
      pr.head.sha = f.commit({ ".github/release-policy/approvals/history.json": JSON.stringify(approval) });
      const policy: PolicyState = { config, authorityCommit: base, approvals: [], dispositions: [] };
      await assert.rejects(engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy,
        github: { ...fixtureEvidence(pr), publishedSource: async (identity: PublicationSource) => {
          if (identity.tag === publishedTarget.tag) { throw new Error("E_EVIDENCE: target publication missing"); }
        } } }), /E_EVIDENCE/);
    } finally { f.remove(); }
  });
});

describe("historical branch retirement", function () {
  this.timeout(60000);
  it("retries a proven historical target after its old source branch is deleted while ordinary evidence fails closed", async () => {
    const f = createGitFixture();
    try {
      f.tag("v0.7.2", f.initialCommit);
      f.tag("v0.8.1", f.initialCommit);
      const source: PublicationSource = { tag: "v0.7.2", commit: f.initialCommit, branch: "prerelease/0.7.x", releaseId: 10, publishRunId: 20 };
      const target: PublicationSource = { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 30, publishRunId: 40 };
      const approval = buildApproval(f.repo, { kind: "historical", mode: "full", targetVersion: "0.8.1", source,
        publishedTarget: target, baselineTag: "v0.7.2", candidateCommit: f.initialCommit, issue: 157,
        sourceCommits: [], sourcePullRequests: [], rationale: "Retired-source immutable retry" });
      const adapter = loader(path.resolve("scripts/release-enforcement/github.js")) as { createGitHubEvidence(options: { repository: typeof config.repository; fetchImpl: typeof fetch }): GitHubEvidence };
      function evidence(missingTarget = false) {
        const fetchImpl = (async (input: Parameters<typeof fetch>[0]) => {
          const route = new URL(String(input)).pathname.split("/vscode-claude-workspaces")[1]!;
          let data: unknown;
          if (route === "") { data = { id: config.repository.id, full_name: config.repository.fullName }; }
          else if (route.startsWith("/git/ref/tags/")) { data = { object: { type: "commit", sha: f.initialCommit } }; }
          else if (route.startsWith("/releases/")) {
            const id = Number(route.split("/").at(-1));
            if (id === 30 && missingTarget) { return new Response("{}", { status: 404 }); }
            data = { id, tag_name: id === 10 ? source.tag : target.tag, draft: false, prerelease: id === 10, published_at: "2026-10-10" };
          } else if (route.startsWith("/actions/runs/")) {
            const id = Number(route.split("/").at(-1));
            data = { id, repository: { id: config.repository.id }, head_sha: f.initialCommit, head_branch: id === 20 ? source.tag : target.tag,
              path: ".github/workflows/publish.yml", event: "push", status: "completed", conclusion: "success" };
          } else if (route.startsWith("/compare/")) { return new Response("{}", { status: 404 }); }
          else { throw new Error(`Unexpected API route ${route}`); }
          return new Response(JSON.stringify(data), { status: 200 });
        }) as typeof fetch;
        return adapter.createGitHubEvidence({ repository: config.repository, fetchImpl });
      }
      const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [approval], dispositions: [] };
      const options = { repositoryPath: f.repo, tag: target.tag, commit: target.commit, policy };
      await assert.rejects(evidence().publishedSource(source), /E_EVIDENCE/);
      assert.equal((await engine.evaluatePublication({ ...options, github: evidence() })).approvalId, approval.id);
      await assert.rejects(engine.evaluatePublication({ ...options, github: evidence(true) }), /E_EVIDENCE/);
    } finally { f.remove(); }
  });
});

describe("historical supersession regressions", function () {
  this.timeout(60000);
  it("honors the active replacement chain in either ledger order and prevents nonhistorical supersession from falling back", async () => {
    const f = createGitFixture();
    try {
      f.tag("v0.8.1", f.initialCommit);
      const released = f.commit({ "src/example.ts": "export const value = 2;\n",
        "package.json": JSON.stringify({ version: "0.8.2", engines: { vscode: "^1.120.0" } }),
        "package-lock.json": JSON.stringify({ version: "0.8.2", packages: { "": { version: "0.8.2" } } }) });
      f.tag("v0.8.2", released);
      const source: PublicationSource = { tag: "v0.8.2", commit: released, branch: "main", releaseId: 10, publishRunId: 20 };
      const input: BuildApprovalInput = { kind: "historical", mode: "full", targetVersion: "0.8.2", source, publishedTarget: source,
        baselineTag: "v0.8.1", candidateCommit: released, issue: 157, sourceCommits: [], sourcePullRequests: [], rationale: "Original retry" };
      const original = buildApproval(f.repo, input);
      const replacement = buildApproval(f.repo, { ...input, publishedTarget: { ...source, releaseId: 30 }, supersedes: original.id, rationale: "Replacement target proof" });
      const final = buildApproval(f.repo, { ...input, publishedTarget: { ...source, releaseId: 40 }, supersedes: replacement.id, rationale: "Final reviewed target proof" });
      const pr = fixturePr(f, { target: "main", head: "release/0.8.2", version: "0.8.2" });
      const options = { repositoryPath: f.repo, tag: source.tag, commit: source.commit };
      for (const approvals of [[original, replacement, final], [final, replacement, original]]) {
        const policy: PolicyState = { config, authorityCommit: released, approvals, dispositions: [] };
        await assert.rejects(engine.evaluatePublication({ ...options, policy,
          github: { ...fixtureEvidence(pr), publishedSource: async identity => {
            if (identity.releaseId === 40) { throw new Error("E_EVIDENCE: active target proof unavailable"); }
          } } }), /E_EVIDENCE/);
        assert.equal((await engine.evaluatePublication({ ...options, policy, github: fixtureEvidence(pr) })).approvalId, final.id);
      }
      const productReplacement = buildApproval(f.repo, { ...input, kind: "hotfix", mode: "compatibility", publishedTarget: undefined,
        source: { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 50, publishRunId: 60 },
        candidatePullRequest: pr.number, supersedes: original.id, rationale: "Product route supersedes historical retry" });
      await assert.rejects(engine.evaluatePublication({ ...options,
        policy: { config, authorityCommit: released, approvals: [original, productReplacement], dispositions: [] }, github: fixtureEvidence(pr) }), /E_MERGED_CANDIDATE/);
    } finally { f.remove(); }
  });
});

describe("forward-port scope regressions", function () {
  this.timeout(60000);
  const fixFiles = { "src/example.ts": "export const value = 2;\n", "test/unit/fix.test.ts": "approved supporting regression\n" };
  function setup(files: Record<string, string> = fixFiles) {
    const f = createGitFixture();
    f.tag("v0.8.1", f.initialCommit);
    const main = f.commit({ ...fixFiles,
      "package.json": JSON.stringify({ version: "0.8.2", engines: { vscode: "^1.120.0" } }),
      "package-lock.json": JSON.stringify({ version: "0.8.2", packages: { "": { version: "0.8.2" } } }) });
    f.tag("v0.8.2", main);
    const fix = buildApproval(f.repo, { kind: "hotfix", mode: "compatibility", targetVersion: "0.8.2", issue: 157,
      candidatePullRequest: 200, source: { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 10, publishRunId: 20 },
      baselineTag: "v0.8.1", candidateCommit: main, sourceCommits: [], sourcePullRequests: [], rationale: "Approved stable fix" });
    f.git(["checkout", "-b", "pre", f.initialCommit]);
    const base = f.commit({
      "package.json": JSON.stringify({ version: "0.9.2", engines: { vscode: "^1.120.0" } }),
      "package-lock.json": JSON.stringify({ version: "0.9.2", packages: { "": { version: "0.9.2" } } }) });
    const mergeCommit = f.commit(files);
    const pr: PullRequestIdentity = { number: 201, state: "closed", merged: true, mergeCommit,
      head: { sha: mergeCommit, ref: "fix/forward-port", repositoryId: config.repository.id },
      base: { sha: base, ref: config.activePrerelease, repositoryId: config.repository.id } };
    const policy: PolicyState = { config, authorityCommit: main, approvals: [fix], dispositions: [] };
    const github: GitHubEvidence = { ...fixtureEvidence(pr), maintenanceBetween: async () => [{ pullRequest: 200, mergeCommit: main, headRef: "hotfix/0.8.2", version: "0.8.2" }] };
    const disposition: Disposition = { schemaVersion: 1, id: "forward-port", approvalId: fix.id, kind: "forward-port", pullRequest: 201,
      mergeCommit, issue: 157, rationale: "Retain exact stable correction" };
    const args = ["record-forward-port", "--approval-id", fix.id, "--pr", "201", "--issue", "157", "--rationale", "Retain exact stable correction"];
    const author = loader(path.resolve("scripts/prepare-release-approval.js")) as { runAuthoring(args: string[], options: { repositoryPath: string; policy: PolicyState; github: GitHubEvidence }): Promise<Disposition> };
    const records = loader(path.resolve("scripts/release-enforcement/records.js")) as { validateMaintenance(repo: string, state: PolicyState, approval: Approval, github: GitHubEvidence): Promise<void> };
    return { f, main, fix, pr, policy, github, disposition, args, author, records };
  }
  for (const [name, files] of [
    ["unrelated", { "src/other.ts": "unrelated feature" }],
    ["incomplete", { "src/example.ts": fixFiles["src/example.ts"] }],
    ["no-effect", {}]
  ] as [string, Record<string, string>][]) {
    it(`rejects a ${name} merged PR during disposition authoring`, async () => {
      const { f, policy, github, args, author } = setup(files);
      try { await assert.rejects(author.runAuthoring(args, { repositoryPath: f.repo, policy, github }), /E_FORWARD_PORT/); }
      finally { f.remove(); }
    });
  }
  it("accepts the exact fix and an explicit reviewed replacement disposition", async () => {
    const exact = setup();
    try { assert.equal((await exact.author.runAuthoring(exact.args, { repositoryPath: exact.f.repo, policy: exact.policy, github: exact.github })).kind, "forward-port"); }
    finally { exact.f.remove(); }
    const replacement = setup({ "src/replacement.ts": "reviewed replacement implementation" });
    try { assert.equal((await replacement.author.runAuthoring([...replacement.args, "--supersedes-fix"],
      { repositoryPath: replacement.f.repo, policy: replacement.policy, github: replacement.github })).kind, "superseded-fix"); }
    finally { replacement.f.remove(); }
  });
  it("rejects a handwritten unrelated disposition through the main policy route", async () => {
    const { f, fix, pr, disposition, github } = setup({ "src/other.ts": "unrelated feature" });
    try {
      f.git(["checkout", "main"]);
      const base = f.commit({ ".github/release-policy/config.json": JSON.stringify(config), ".github/release-policy/approvals/fix.json": JSON.stringify(fix) });
      const head = f.commit({ ".github/release-policy/forward-ports/unrelated.json": JSON.stringify(disposition) });
      const policyPr: PullRequestIdentity = { number: 202, state: "open", head: { sha: head, ref: "policy/157-forward-port", repositoryId: config.repository.id },
        base: { sha: base, ref: "main", repositoryId: config.repository.id } };
      await assert.rejects(engine.evaluatePullRequest({ repositoryPath: f.repo, pr: policyPr,
        policy: { config, authorityCommit: base, approvals: [fix], dispositions: [] }, github: { ...github, pullRequest: async number => number === 201 ? pr : policyPr } }), /E_FORWARD_PORT/);
    } finally { f.remove(); }
  });
  for (const revert of [false, true]) {
    it(`rejects ${revert ? "a reverted exact" : "an unrelated"} disposition at the published promotion cutoff`, async () => {
      const { f, fix, main, pr, policy, github, disposition, records } = setup(revert ? fixFiles : { "src/other.ts": "unrelated feature" });
      try {
        const cutoff = revert ? f.commit({ "src/example.ts": "export const value = 1;\n" }) : pr.mergeCommit!;
        const source = fixtureSource(f, cutoff);
        const promotion = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", source,
          issue: 157, candidatePullRequest: 202, baselineTag: "v0.8.2", candidateCommit: cutoff,
          sourceCommits: [], sourcePullRequests: [], rationale: "Frozen promotion" });
        await assert.rejects(records.validateMaintenance(f.repo, { ...policy, authorityCommit: main, approvals: [fix, promotion], dispositions: [disposition] }, promotion, github), /E_FORWARD_PORT/);
      } finally { f.remove(); }
    });
  }
  for (const entry of ["PR", "publication"]) {
    it(`rejects a reverted disposition in the actual promotion ${entry} path`, async () => {
      const { f, fix, main, pr: forwardPr, policy, github, disposition } = setup();
      try {
        const cutoff = f.commit({ "src/example.ts": "export const value = 1;\n" });
        const source = fixtureSource(f, cutoff);
        const candidate = f.commit({
          "package.json": JSON.stringify({ version: "0.10.0", engines: { vscode: "^1.120.0" } }),
          "package-lock.json": JSON.stringify({ version: "0.10.0", packages: { "": { version: "0.10.0" } } }) });
        const pr: PullRequestIdentity = { number: 202, state: "open", head: { sha: candidate, ref: "release/0.10.0", repositoryId: config.repository.id },
          base: { sha: main, ref: "main", repositoryId: config.repository.id } };
        const promotion = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", source, issue: 157,
          candidatePullRequest: 202, baselineTag: "v0.8.2", candidateCommit: candidate, sourceCommits: [], sourcePullRequests: [], rationale: "Exact source exception cannot erase maintenance" });
        const state = { ...policy, approvals: [fix, promotion], dispositions: [disposition] };
        if (entry === "PR") {
          await assert.rejects(engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: state,
            github: { ...github, pullRequest: async number => number === 201 ? forwardPr : pr } }), /E_FORWARD_PORT/);
        } else {
          const tree = f.git(["rev-parse", `${candidate}^{tree}`]);
          const merged = f.git(["commit-tree", tree, "-p", main, "-m", "squash promotion"]);
          f.tag("v0.10.0", merged);
          await assert.rejects(engine.evaluatePublication({ repositoryPath: f.repo, tag: "v0.10.0", commit: merged, policy: state,
            github: { ...github, pullRequest: async number => number === 201 ? forwardPr : { ...pr, state: "closed", merged: true, mergeCommit: merged } } }), /E_FORWARD_PORT/);
        }
      } finally { f.remove(); }
    });
  }
  it("uses only the active hotfix approval and its disposition through correction chains in either order", async () => {
    const { f, fix, main, pr, policy, github, disposition, records } = setup();
    try {
      const corrected: Approval = { ...fix, id: "corrected-hotfix", supersedes: fix.id, rationale: "Reviewed hotfix correction" };
      const terminal: Approval = { ...fix, id: "terminal-hotfix", supersedes: corrected.id, rationale: "Final reviewed hotfix correction" };
      const source = fixtureSource(f, pr.mergeCommit!);
      const promotion = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", source, issue: 157,
        candidatePullRequest: 202, baselineTag: "v0.8.2", candidateCommit: pr.mergeCommit!, sourceCommits: [], sourcePullRequests: [], rationale: "Promote exact forwarded fix" });
      const activeDisposition: Disposition = { ...disposition, id: "terminal-forward-port", approvalId: terminal.id };
      for (const approvals of [[fix, corrected, terminal, promotion], [promotion, terminal, fix, corrected]]) {
        await assert.rejects(records.validateMaintenance(f.repo, { ...policy, authorityCommit: main, approvals, dispositions: [disposition] }, promotion, github), /E_FORWARD_PORT/);
        await records.validateMaintenance(f.repo, { ...policy, authorityCommit: main, approvals, dispositions: [activeDisposition] }, promotion, github);
      }
    } finally { f.remove(); }
  });
  it("rejects ambiguous disposition authorities and accepts only a single explicit terminal chain", () => {
    const { f, policy, disposition } = setup();
    try {
      const records = loader(path.resolve("scripts/release-enforcement/records.js")) as { validateState(state: PolicyState): void; validateLedger(previous: PolicyState, next: PolicyState): void };
      const original = { ...policy, dispositions: [disposition] };
      const duplicate = { ...disposition, id: "second-unrelated-disposition" };
      assert.throws(() => records.validateState({ ...policy, dispositions: [disposition, duplicate] }), /E_SCHEMA/);
      const replacement: Disposition & { supersedes: string } = { ...disposition, id: "replacement", kind: "superseded-fix", supersedes: disposition.id, rationale: "Reviewed correction" };
      const final = { ...replacement, id: "final", supersedes: replacement.id };
      for (const chain of [[disposition, replacement, final], [final, disposition, replacement]]) {
        records.validateLedger(original, { ...policy, dispositions: chain });
      }
      for (const chain of [
        [disposition, { ...replacement, supersedes: "missing" }],
        [disposition, replacement, { ...final, supersedes: disposition.id }],
        [{ ...disposition, supersedes: replacement.id }, replacement],
        [disposition, { ...replacement, approvalId: "different-approval" }]
      ]) { assert.throws(() => records.validateState({ ...policy, dispositions: chain }), /E_SCHEMA/); }
    } finally { f.remove(); }
  });
  it("uses the active corrected disposition at the cutoff independently of filename order", async () => {
    const { f, fix, main, pr, policy, github, disposition, records } = setup();
    try {
      const replacementCommit = f.commit({ "src/replacement.ts": "reviewed successor correction" });
      const replacement: Disposition & { supersedes: string } = { ...disposition, id: "replacement", kind: "superseded-fix", pullRequest: 203,
        mergeCommit: replacementCommit, supersedes: disposition.id, rationale: "Reviewed adaptation replacing original disposition" };
      const source = fixtureSource(f, replacementCommit);
      const promotion = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", source, issue: 157,
        candidatePullRequest: 202, baselineTag: "v0.8.2", candidateCommit: replacementCommit, sourceCommits: [], sourcePullRequests: [], rationale: "Promote corrected fix" });
      const replacementPr = { ...pr, number: 203, mergeCommit: replacementCommit, head: { ...pr.head, sha: replacementCommit } };
      for (const dispositions of [[disposition, replacement], [replacement, disposition]]) {
        await assert.rejects(records.validateMaintenance(f.repo, { ...policy, authorityCommit: main, approvals: [fix, promotion], dispositions }, promotion,
          { ...github, pullRequest: async number => {
            if (number === 203) { throw new Error("E_EVIDENCE: active replacement evidence unavailable"); }
            return pr;
          } }), /E_EVIDENCE/);
        await records.validateMaintenance(f.repo, { ...policy, authorityCommit: main, approvals: [fix, promotion], dispositions }, promotion,
          { ...github, pullRequest: async number => number === 203 ? replacementPr : pr });
      }
    } finally { f.remove(); }
  });
});

describe("production historical validator retirement", function () {
  this.timeout(60000);
  it("allows a proven retired prerelease retry in the production validator, but requires active-line ancestry and exact target proof", async () => {
    const f = createGitFixture();
    try {
      const pr = fixturePr(f, { target: "prerelease/0.7.x", head: "fixture", version: "0.7.2" });
      const commit = f.commit({ "CHANGELOG.md": "## [0.7.2]\n\nPreviously published cutoff.\n" });
      f.tag("v0.7.2", commit);
      const source: PublicationSource = { tag: "v0.7.2", commit, branch: "prerelease/0.7.x", releaseId: 10, publishRunId: 20 };
      const approval = buildApproval(f.repo, { kind: "historical", mode: "full", targetVersion: "0.7.2", source, publishedTarget: source,
        baselineTag: source.tag, candidateCommit: commit, issue: 157, sourceCommits: [], sourcePullRequests: [], rationale: "Exact old retry" });
      const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [approval], dispositions: [] };
      const validator = loader(path.resolve("scripts/validate-release-source.js")) as { validateReleaseSource(options: { tag: string; packagePath: string; changelogPath: string; repositoryPath: string; policy: PolicyState; github: GitHubEvidence }): Promise<{ commit: string }> };
      const options = { tag: source.tag, packagePath: path.join(f.repo, "package.json"), changelogPath: path.join(f.repo, "CHANGELOG.md"), repositoryPath: f.repo, policy, github: fixtureEvidence(pr) };
      assert.equal((await validator.validateReleaseSource(options)).commit, commit);
      await assert.rejects(validator.validateReleaseSource({ ...options,
        github: { ...fixtureEvidence(pr), publishedSource: async () => { throw new Error("E_EVIDENCE: missing exact historical target"); } } }), /E_EVIDENCE/);
      fixturePr(f, { target: config.activePrerelease, head: "fixture", version: "0.9.0" });
      const active = f.commit({ "CHANGELOG.md": "## [0.9.0]\n\nNew active line.\n" });
      f.tag("v0.9.0", active);
      await assert.rejects(validator.validateReleaseSource({ ...options, tag: "v0.9.0", policy: { ...policy, approvals: [] } }), /refs\/remotes\/origin\/prerelease\/0.9.x|authorized source/);
    } finally { f.remove(); }
  });
});

describe("historical production CLI remote retirement", function () {
  this.timeout(60000);
  it("fetches immutable evidence through the actual CLI without a retired source branch and rejects missing target evidence", () => {
    const f = createGitFixture();
    try {
      fixturePr(f, { target: "prerelease/0.7.x", head: "fixture", version: "0.7.2" });
      const commit = f.commit({ "CHANGELOG.md": "## [0.7.2]\n\nExact published historical cutoff.\n" });
      f.tag("v0.7.2", commit);
      const source: PublicationSource = { tag: "v0.7.2", commit, branch: "prerelease/0.7.x", releaseId: 10, publishRunId: 20 };
      const historical = buildApproval(f.repo, { kind: "historical", mode: "full", targetVersion: "0.7.2", source, publishedTarget: source,
        baselineTag: source.tag, candidateCommit: commit, issue: 157, sourceCommits: [], sourcePullRequests: [], rationale: "Previously published target" });
      const scripts = ["validate-release-source.js", "extract-changelog.js", "release-metadata.js", "release-policy.js",
        ...fs.readdirSync("scripts/release-enforcement").filter(file => file.endsWith(".js")).map(file => `release-enforcement/${file}`)];
      const files: Record<string, string> = { ".github/release-policy/config.json": JSON.stringify(config),
        ".github/release-policy/approvals/historical.json": JSON.stringify(historical) };
      for (const file of scripts) { files[`scripts/${file}`] = fs.readFileSync(`scripts/${file}`, "utf8"); }
      const authority = f.commit(files);
      f.git(["update-ref", "refs/remotes/origin/main", authority]);
      f.git(["config", `url.${f.repo.replace(/\\/g, "/")}.insteadOf`, `https://github.com/${config.repository.fullName}.git`]);
      assert.equal(f.git(["for-each-ref", "--format=%(refname)", "refs/heads/prerelease", "refs/remotes/origin/prerelease"]), "");
      const scratch = path.join(f.repo, ".tmp");
      fs.mkdirSync(scratch);
      const preload = path.join(scratch, "github-evidence.cjs");
      fs.writeFileSync(preload, `global.fetch = async url => {
        const route = new URL(url).pathname.replace('/repos/${config.repository.fullName}', '');
        const records = {
          '': ${JSON.stringify({ id: config.repository.id, full_name: config.repository.fullName })},
          '/git/ref/tags/v0.7.2': ${JSON.stringify({ object: { type: "commit", sha: commit } })},
          '/releases/10': ${JSON.stringify({ id: 10, tag_name: source.tag, draft: false, prerelease: true, published_at: "2026-10-10" })},
          '/actions/runs/20': ${JSON.stringify({ id: 20, repository: { id: config.repository.id }, head_sha: commit, head_branch: source.tag,
            path: ".github/workflows/publish.yml", event: "push", status: "completed", conclusion: "success" })}
        };
        if (process.env.TEST_MISSING_TARGET === '1' && route === '/releases/10') return new Response('{}', { status: 404 });
        return new Response(JSON.stringify(records[route] || {}), { status: Object.hasOwn(records, route) ? 200 : 404 });
      };`);
      const packagePath = path.join(scratch, "release-package.json");
      const changelogPath = path.join(scratch, "release-changelog.md");
      fs.writeFileSync(packagePath, f.git(["show", `${commit}:package.json`]));
      fs.writeFileSync(changelogPath, f.git(["show", `${commit}:CHANGELOG.md`]));
      const args = ["--require", preload, path.join(f.repo, "scripts/validate-release-source.js"), source.tag, packagePath, changelogPath, f.repo];
      const env = { ...process.env, GH_TOKEN: "", GITHUB_EVENT_NAME: "push", GITHUB_OUTPUT: "", TEST_MISSING_TARGET: "0" };
      const valid = spawnSync(process.execPath, args, { env, encoding: "utf8", timeout: 20000 });
      assert.equal(valid.status, 0, valid.stderr);
      assert.match(valid.stdout, /Validated v0\.7\.2/);
      const invalid = spawnSync(process.execPath, args, { env: { ...env, TEST_MISSING_TARGET: "1" }, encoding: "utf8", timeout: 20000 });
      assert.equal(invalid.status, 1);
      assert.match(invalid.stderr, /E_EVIDENCE: GitHub 404/);
    } finally { f.remove(); }
  });
});
describe("protected main authority freshness", function () {
  this.timeout(60000);
  it("requires the actual fetched main tip to equal the selected workflow policy revision", async () => {
    const f = createGitFixture();
    try {
      const authority = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
      f.git(["checkout", "-b", config.activePrerelease]);
      const base = fixturePr(f, { target: config.activePrerelease, head: "fixture", version: "0.9.0" }).head.sha;
      const head = f.commit({ "src/new-feature.ts": "export const feature = true;" });
      f.git(["update-ref", `refs/heads/${config.activePrerelease}`, base]);
      f.git(["update-ref", "refs/pull/200/head", head]);
      f.git(["checkout", "main"]);
      const advanced = f.commit({ ".github/release-policy/config.json": JSON.stringify({ ...config, activePrerelease: "prerelease/0.11.x" }) });
      f.git(["update-ref", "refs/heads/main", authority]);
      f.git(["checkout", "--detach", authority]);
      f.git(["config", `url.${f.repo.replace(/\\/g, "/")}.insteadOf`, `https://github.com/${config.repository.fullName}.git`]);
      const pr: PullRequestIdentity = { number: 200, state: "open", head: { sha: head, ref: "feature/fresh-authority", repositoryId: config.repository.id },
        base: { sha: base, ref: config.activePrerelease, repositoryId: config.repository.id } };
      const scratch = path.join(f.repo, ".tmp");
      fs.mkdirSync(scratch);
      const eventPath = path.join(scratch, "event.json");
      fs.writeFileSync(eventPath, JSON.stringify({ number: pr.number, repository: { id: config.repository.id, full_name: config.repository.fullName },
        pull_request: { number: pr.number, head: { ...pr.head, repo: { id: config.repository.id } }, base: { ...pr.base, repo: { id: config.repository.id } } } }));
      const runner = loader(path.resolve("scripts/check-release-pr.js")) as { runPrGuard(options: { automationRoot: string; eventPath: string; workflowSha: string;
        workflowRef: string; github: GitHubEvidence }): Promise<GuardResult> };
      const options = { automationRoot: f.repo, eventPath, workflowSha: authority,
        workflowRef: `${config.repository.fullName}/.github/workflows/release-guard.yml@refs/heads/main`, github: fixtureEvidence(pr) };
      assert.equal((await runner.runPrGuard(options)).route, "feature");
      f.git(["update-ref", "refs/heads/main", advanced]);
      assert.equal(f.git(["merge-base", authority, advanced]), authority);
      await assert.rejects(runner.runPrGuard(options), /E_STALE_PR/);
      assert.equal(f.git(["rev-parse", "refs/release-guard/main"]), advanced);
      assert.equal(f.git(["rev-parse", "refs/release-guard/base"]), base);
      assert.equal(f.git(["rev-parse", "refs/release-guard/head"]), head);
    } finally { f.remove(); }
  });
});
describe("hotfix source version consistency", function () {
  this.timeout(60000);
  for (const entry of ["PR", "policy admission", "publication"]) {
    it(`rejects a handwritten hotfix approval from a different published stable line during ${entry}`, async () => {
      const f = createGitFixture();
      try {
        f.git(["checkout", "-b", "old-stable"]);
        const old = f.commit({ "package.json": JSON.stringify({ version: "0.6.9", engines: { vscode: "^1.120.0" } }),
          "package-lock.json": JSON.stringify({ version: "0.6.9", packages: { "": { version: "0.6.9" } } }) });
        f.tag("v0.6.9", old);
        f.git(["checkout", "main"]);
        f.tag("v0.8.1", f.initialCommit);
        f.commit({ "src/example.ts": "export const value = 2;\n" });
        const pr = fixturePr(f, { target: "main", head: "hotfix/0.8.2", version: "0.8.2" });
        const approval = buildApproval(f.repo, { kind: "hotfix", mode: "compatibility", targetVersion: "0.8.2", issue: 157,
          candidatePullRequest: pr.number, source: { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 10, publishRunId: 20 },
          baselineTag: "v0.8.1", candidateCommit: pr.head.sha, sourceCommits: [], sourcePullRequests: [], rationale: "Exact stable fix" });
        const invalid: Approval = { ...approval, id: "wrong-line-hotfix", source: { ...approval.source, tag: "v0.6.9", commit: old } };
        const policy: PolicyState = { config, authorityCommit: f.initialCommit, approvals: [invalid], dispositions: [] };
        const github = fixtureEvidence(pr);
        if (entry === "PR") {
          await assert.rejects(engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy, github }), /E_VERSION/);
        } else if (entry === "publication") {
          f.tag("v0.8.2", pr.head.sha);
          await assert.rejects(engine.evaluatePublication({ repositoryPath: f.repo, tag: "v0.8.2", commit: pr.head.sha, policy,
            github: { ...github, pullRequest: async () => ({ ...pr, state: "closed", merged: true, mergeCommit: pr.head.sha }) } }), /E_VERSION/);
        } else {
          f.git(["checkout", "--detach", f.initialCommit]);
          const base = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
          const head = f.commit({ ".github/release-policy/approvals/wrong-line.json": JSON.stringify(invalid) });
          const policyPr: PullRequestIdentity = { ...pr, head: { ...pr.head, sha: head, ref: "policy/157-wrong-source" }, base: { ...pr.base, sha: base } };
          await assert.rejects(engine.evaluatePullRequest({ repositoryPath: f.repo, pr: policyPr,
            policy: { ...policy, authorityCommit: base, approvals: [] }, github }), /E_VERSION/);
        }
      } finally { f.remove(); }
    });
  }
});
describe("active maintenance cutoff", function () {
  this.timeout(60000);
  it("rejects obsolete mismatched baselines and derives the interval from a valid terminal correction in either ledger order", async () => {
    const f = createGitFixture();
    try {
      const obsoleteBase = f.commit({ "package.json": JSON.stringify({ version: "0.6.9", engines: { vscode: "^1.120.0" } }),
        "package-lock.json": JSON.stringify({ version: "0.6.9", packages: { "": { version: "0.6.9" } } }) });
      f.tag("v0.6.9", obsoleteBase);
      const activeBase = f.commit({ "src/historical.ts": "unrelated prior stable work",
        "package.json": JSON.stringify({ version: "0.8.1", engines: { vscode: "^1.120.0" } }),
        "package-lock.json": JSON.stringify({ version: "0.8.1", packages: { "": { version: "0.8.1" } } }) });
      f.tag("v0.8.1", activeBase);
      const main = f.commit({ "src/example.ts": "export const value = 2;\n",
        "package.json": JSON.stringify({ version: "0.8.2", engines: { vscode: "^1.120.0" } }),
        "package-lock.json": JSON.stringify({ version: "0.8.2", packages: { "": { version: "0.8.2" } } }) });
      f.tag("v0.8.2", main);
      const input: BuildApprovalInput = { kind: "hotfix", mode: "compatibility", targetVersion: "0.8.2", issue: 157, candidatePullRequest: 200,
        source: { tag: "v0.8.1", commit: activeBase, branch: "main", releaseId: 10, publishRunId: 20 }, baselineTag: "v0.6.9",
        candidateCommit: main, sourceCommits: [], sourcePullRequests: [], rationale: "Obsolete broad baseline" };
      assert.throws(() => buildApproval(f.repo, input), /E_BASELINE_CHANGED/);
      const obsolete = buildApproval(f.repo, { ...input, baselineTag: "v0.8.1", rationale: "Original valid baseline" });
      const terminal = buildApproval(f.repo, { ...input, baselineTag: "v0.8.1", supersedes: obsolete.id, rationale: "Corrected actual stable baseline" });
      f.git(["checkout", "-b", "pre", activeBase]);
      const base = fixturePr(f, { target: config.activePrerelease, head: "fixture", version: "0.9.2" }).head.sha;
      const forward = f.commit({ "src/example.ts": "export const value = 2;\n" });
      const source = fixtureSource(f, forward);
      const promotion = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", issue: 157, candidatePullRequest: 202,
        source, baselineTag: "v0.8.2", candidateCommit: forward, sourceCommits: [], sourcePullRequests: [], rationale: "Promote active maintenance interval" });
      const pr: PullRequestIdentity = { number: 201, state: "closed", merged: true, mergeCommit: forward,
        head: { sha: forward, ref: "fix/forward-port", repositoryId: config.repository.id },
        base: { sha: base, ref: config.activePrerelease, repositoryId: config.repository.id } };
      const disposition: Disposition = { schemaVersion: 1, id: "active-forward-port", approvalId: terminal.id, kind: "forward-port", pullRequest: 201,
        mergeCommit: forward, issue: 157, rationale: "Exact active fix" };
      const records = loader(path.resolve("scripts/release-enforcement/records.js")) as { validateMaintenance(repo: string, state: PolicyState, approval: Approval, github: GitHubEvidence): Promise<void> };
      for (const approvals of [[obsolete, terminal, promotion], [promotion, terminal, obsolete]]) {
        let observedBase = ""; let observedCommits: string[] = [];
        const github: GitHubEvidence = { ...fixtureEvidence(pr), maintenanceBetween: async (from, to, commits) => {
          observedBase = from; observedCommits = commits!;
          assert.equal(to, main);
          return [{ pullRequest: 200, mergeCommit: main, headRef: "hotfix/0.8.2", version: "0.8.2" }];
        } };
        await records.validateMaintenance(f.repo, { config, authorityCommit: main, approvals, dispositions: [disposition] }, promotion, github);
        assert.equal(observedBase, activeBase);
        assert.deepEqual(observedCommits, [main]);
      }
    } finally { f.remove(); }
  });
});
describe("published hotfix supersession obligations", function () {
  this.timeout(60000);
  for (const indirect of [false, true]) {
    it(`rejects a historical replacement ${indirect ? "after a hotfix correction" : "of a hotfix"} when promotion starts at the shipped hotfix tag`, async () => {
      const f = createGitFixture();
      try {
        f.tag("v0.8.1", f.initialCommit);
        const main = f.commit({ "src/example.ts": "export const value = 2;\n",
          "package.json": JSON.stringify({ version: "0.8.2", engines: { vscode: "^1.120.0" } }),
          "package-lock.json": JSON.stringify({ version: "0.8.2", packages: { "": { version: "0.8.2" } } }) });
        f.tag("v0.8.2", main);
        const stable: PublicationSource = { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 10, publishRunId: 20 };
        const fix = buildApproval(f.repo, { kind: "hotfix", mode: "compatibility", targetVersion: "0.8.2", issue: 157,
          candidatePullRequest: 200, source: stable, baselineTag: stable.tag, candidateCommit: main,
          sourceCommits: [], sourcePullRequests: [], rationale: "Shipped stable fix" });
        const correction: Approval = { ...fix, id: "corrected-hotfix", supersedes: fix.id, rationale: "Corrected approval" };
        const published: PublicationSource = { ...stable, tag: "v0.8.2", commit: main };
        const historical = buildApproval(f.repo, { kind: "historical", mode: "compatibility", targetVersion: "0.8.2", issue: 157,
          source: published, publishedTarget: published, baselineTag: stable.tag, candidateCommit: main,
          supersedes: indirect ? correction.id : fix.id, sourceCommits: [], sourcePullRequests: [], rationale: "Exact published retry" });
        f.git(["checkout", "-b", "pre", f.initialCommit]);
        const cutoff = fixturePr(f, { target: config.activePrerelease, head: "fixture", version: "0.9.2" }).head.sha;
        const source = fixtureSource(f, cutoff);
        const promotion = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", issue: 157,
          candidatePullRequest: 202, source, baselineTag: "v0.8.2", candidateCommit: cutoff,
          sourceCommits: [], sourcePullRequests: [], rationale: "Cutoff lacks shipped stable fix" });
        const approvals = indirect ? [fix, correction, historical, promotion] : [fix, historical, promotion];
        const records = loader(path.resolve("scripts/release-enforcement/records.js")) as {
          validateLedger(previous: PolicyState, next: PolicyState): void;
          validateMaintenance(repo: string, state: PolicyState, approval: Approval, github: GitHubEvidence): Promise<void>;
        };
        const previous: PolicyState = { config, authorityCommit: main, approvals: indirect ? [fix, correction, promotion] : [fix, promotion], dispositions: [] };
        const github = { ...fixtureEvidence(fixturePr(f, { target: "main", head: "release/0.10.0", version: "0.10.0" })),
          maintenanceBetween: async () => [{ pullRequest: 200, mergeCommit: main, headRef: "hotfix/0.8.2", version: "0.8.2" }] };
        // The active hotfix requires a disposition even though promotion's baseline is its published tag.
        await assert.rejects(records.validateMaintenance(f.repo, previous, promotion, github), /E_FORWARD_PORT/);
        for (const ordered of [approvals, [...approvals].reverse()]) {
          const next = { ...previous, approvals: ordered };
          assert.throws(() => records.validateLedger(previous, next), /E_SCHEMA.*hotfix/i);
          await assert.rejects(records.validateMaintenance(f.repo, next, promotion, github), /E_SCHEMA.*hotfix/i);
        }
      } finally { f.remove(); }
    });
  }
});

describe("publication protected main freshness", function () {
  this.timeout(60000);
  it("rejects a live main advance after automation checkout before writing publication outputs", () => {
    const f = createGitFixture();
    try {
      fixturePr(f, { target: "prerelease/0.7.x", head: "fixture", version: "0.7.2" });
      const commit = f.commit({ "CHANGELOG.md": "## [0.7.2]\n\nExact published retry.\n" });
      f.tag("v0.7.2", commit);
      const source: PublicationSource = { tag: "v0.7.2", commit, branch: "prerelease/0.7.x", releaseId: 10, publishRunId: 20 };
      const historical = buildApproval(f.repo, { kind: "historical", mode: "full", targetVersion: "0.7.2", source, publishedTarget: source,
        baselineTag: source.tag, candidateCommit: commit, issue: 157, sourceCommits: [], sourcePullRequests: [], rationale: "Existing published retry" });
      const files: Record<string, string> = { ".github/release-policy/config.json": JSON.stringify(config),
        ".github/release-policy/approvals/historical.json": JSON.stringify(historical) };
      const scripts = ["validate-release-source.js", "extract-changelog.js", "release-metadata.js", "release-policy.js",
        ...fs.readdirSync("scripts/release-enforcement").filter(file => file.endsWith(".js")).map(file => `release-enforcement/${file}`)];
      for (const file of scripts) { files[`scripts/${file}`] = fs.readFileSync(`scripts/${file}`, "utf8"); }
      const authority = f.commit(files);
      f.git(["update-ref", "refs/remotes/origin/main", authority]);
      f.git(["config", `url.${f.repo.replace(/\\/g, "/")}.insteadOf`, `https://github.com/${config.repository.fullName}.git`]);
      const scratch = path.join(f.repo, ".tmp");
      fs.mkdirSync(scratch);
      const preload = path.join(scratch, "github-evidence.cjs");
      fs.writeFileSync(preload, `global.fetch = async url => {
        const route = new URL(url).pathname.replace('/repos/${config.repository.fullName}', '');
        const records = {
          '': ${JSON.stringify({ id: config.repository.id, full_name: config.repository.fullName })},
          '/git/ref/tags/v0.7.2': ${JSON.stringify({ object: { type: "commit", sha: commit } })},
          '/releases/10': ${JSON.stringify({ id: 10, tag_name: source.tag, draft: false, prerelease: true, published_at: "2026-10-10" })},
          '/actions/runs/20': ${JSON.stringify({ id: 20, repository: { id: config.repository.id }, head_sha: commit, head_branch: source.tag,
            path: ".github/workflows/publish.yml", event: "push", status: "completed", conclusion: "success" })}
        };
        require('node:fs').appendFileSync(${JSON.stringify(path.join(scratch, "api-reads.txt"))}, route + '\\n');
        return new Response(JSON.stringify(records[route] || {}), { status: Object.hasOwn(records, route) ? 200 : 404 });
      };`);
      const packagePath = path.join(scratch, "release-package.json");
      const changelogPath = path.join(scratch, "release-changelog.md");
      const outputPath = path.join(scratch, "github-output.txt");
      const readsPath = path.join(scratch, "api-reads.txt");
      fs.writeFileSync(packagePath, f.git(["show", `${commit}:package.json`]));
      fs.writeFileSync(changelogPath, f.git(["show", `${commit}:CHANGELOG.md`]));
      const args = ["--require", preload, path.join(f.repo, "scripts/validate-release-source.js"), source.tag, packagePath, changelogPath, f.repo];
      const env = { ...process.env, GH_TOKEN: "", GITHUB_EVENT_NAME: "push", GITHUB_OUTPUT: outputPath };
      const valid = spawnSync(process.execPath, args, { env, encoding: "utf8", timeout: 20000 });
      assert.equal(valid.status, 0, valid.stderr);
      assert.match(fs.readFileSync(outputPath, "utf8"), new RegExp(`source_commit=${commit}`));
      fs.rmSync(outputPath);
      fs.rmSync(readsPath);
      fs.appendFileSync(path.join(f.repo, ".git/info/exclude"), "\n.tmp/\n");
      const advanced = f.commit({ ".github/release-policy/approvals/replacement.json": JSON.stringify({ ...historical,
        id: "revoked-historical-approval", supersedes: historical.id, rationale: "New reviewed retry authority" }) });
      f.git(["checkout", "--detach", authority]);
      assert.equal(f.git(["rev-parse", "refs/remotes/origin/main"]), authority);
      assert.equal(f.git(["rev-parse", "refs/heads/main"]), advanced);
      const stale = spawnSync(process.execPath, args, { env, encoding: "utf8", timeout: 20000 });
      assert.equal(stale.status, 1, stale.stdout + stale.stderr);
      assert.match(stale.stderr, /E_POLICY_PROVENANCE.*(advanced|changed|fresh)/i);
      assert.equal(f.git(["rev-parse", "refs/remotes/origin/main"]), advanced);
      assert.equal(f.git(["rev-parse", "refs/tags/v0.7.2"]), commit);
      assert.equal(fs.existsSync(outputPath), false, "Stale authority must not write publication outputs");
      assert.equal(fs.existsSync(readsPath), false, "Stale authority must fail before publication evidence evaluation");
    } finally { f.remove(); }
  });
});

describe("hotfix baseline obligation binding", function () {
  this.timeout(60000);
  it("rejects same-kind correction that starts after the shipped fix during authoring, ledger admission, promotion PR and publication", async () => {
    const f = createGitFixture();
    try {
      f.tag("v0.8.1", f.initialCommit);
      const main = f.commit({ "src/example.ts": "export const value = 2;\n",
        "package.json": JSON.stringify({ version: "0.8.2", engines: { vscode: "^1.120.0" } }),
        "package-lock.json": JSON.stringify({ version: "0.8.2", packages: { "": { version: "0.8.2" } } }) });
      f.tag("v0.8.2", main);
      const input: BuildApprovalInput = { kind: "hotfix", mode: "compatibility", targetVersion: "0.8.2", issue: 157, candidatePullRequest: 200,
        source: { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 10, publishRunId: 20 }, baselineTag: "v0.8.1",
        candidateCommit: main, sourceCommits: [], sourcePullRequests: [], rationale: "Shipped stable fix" };
      const fix = buildApproval(f.repo, input);
      f.git(["checkout", "-b", "pre", f.initialCommit]);
      const cutoff = fixturePr(f, { target: config.activePrerelease, head: "fixture", version: "0.9.2" }).head.sha;
      const source = fixtureSource(f, cutoff);
      const pr = fixturePr(f, { target: "main", head: "release/0.10.0", version: "0.10.0" });
      pr.base.sha = main; pr.number = 202;
      const promotion = buildApproval(f.repo, { kind: "promotion", mode: "full", targetVersion: "0.10.0", issue: 157, candidatePullRequest: pr.number,
        source, baselineTag: "v0.8.2", candidateCommit: pr.head.sha, sourceCommits: [], sourcePullRequests: [], rationale: "Cutoff drops shipped fix" });
      const merged = f.git(["commit-tree", f.git(["rev-parse", `${pr.head.sha}^{tree}`]), "-p", main, "-m", "promotion squash"]);
      f.tag("v0.10.0", merged);
      const github: GitHubEvidence = { ...fixtureEvidence(pr), pullRequest: async () => ({ ...pr, state: "closed", merged: true, mergeCommit: merged }),
        maintenanceBetween: async () => [{ pullRequest: 200, mergeCommit: main, headRef: "hotfix/0.8.2", version: "0.8.2" }] };
      const previous: PolicyState = { config, authorityCommit: main, approvals: [fix, promotion], dispositions: [] };
      await assert.rejects(engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: previous, github }), /E_FORWARD_PORT/);
      await assert.rejects(engine.evaluatePublication({ repositoryPath: f.repo, tag: "v0.10.0", commit: merged, policy: previous, github }), /E_FORWARD_PORT/);
      const records = loader(path.resolve("scripts/release-enforcement/records.js")) as { validateLedger(previous: PolicyState, next: PolicyState): void };
      const { digest } = loader(path.resolve("scripts/release-enforcement/snapshot.js")) as { digest(bytes: string): string };
      const replacement: Approval = { ...fix, id: "post-fix-baseline-correction", supersedes: fix.id,
        baseline: { tag: "v0.8.2", commit: main, productDigest: fix.productDigest }, changes: [], changeDigest: digest("[]") };
      for (const approvals of [[fix, replacement, promotion], [promotion, replacement, fix]]) {
        const next = { ...previous, approvals };
        assert.throws(() => records.validateLedger(previous, next), /E_BASELINE_CHANGED/);
        await assert.rejects(engine.evaluatePullRequest({ repositoryPath: f.repo, pr, policy: next, github }), /E_BASELINE_CHANGED/);
        await assert.rejects(engine.evaluatePublication({ repositoryPath: f.repo, tag: "v0.10.0", commit: merged, policy: next, github }), /E_BASELINE_CHANGED/);
      }
      assert.throws(() => buildApproval(f.repo, { ...input, baselineTag: "v0.8.2", supersedes: fix.id }), /E_BASELINE_CHANGED/);
      for (const baseline of [{ ...fix.baseline, tag: "v0.8.2" }, { ...fix.baseline, commit: main }]) {
        assert.throws(() => records.validateLedger(previous, { ...previous, approvals: [fix, { ...replacement, baseline }, promotion] }), /E_BASELINE_CHANGED/);
      }
    } finally { f.remove(); }
  });
});
