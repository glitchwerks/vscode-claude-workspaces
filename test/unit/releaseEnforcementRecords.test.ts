import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { Approval, BuildApprovalInput, GitHubEvidence, PolicyState, PublicationSource, Disposition } from "../../scripts/release-enforcement/contracts";
import { createGitFixture, missingModule } from "./helpers/releasePolicyFixture";

type Records = {
  buildApproval(repo: string, input: BuildApprovalInput): Approval;
  validateApproval(repo: string, approval: Approval, base: string, head: string): void;
  validateLedger(previous: PolicyState, next: PolicyState): void;
  loadPolicy(repo: string, sha: string): PolicyState;
  findApproval(state: PolicyState, version: string, digest: string): Approval;
  validateMaintenance(repo: string, state: PolicyState, approval: Approval, github: GitHubEvidence): Promise<void>;
  verifySelection(repo: string, approval: Approval, github: GitHubEvidence, repository: { id: number }): Promise<void>;
};
const loader = createRequire(__filename);
const records = missingModule<Records>("scripts/release-enforcement/records.js", loader);
const githubModule = missingModule<{ createGitHubEvidence(options: { repository: { id: number; fullName: string }; token?: string; fetchImpl: typeof fetch }): GitHubEvidence & { issue(number: number): Promise<void> } }>("scripts/release-enforcement/github.js", loader);
const config = { schemaVersion: 1 as const, repository: { id: 1344170098, fullName: "glitchwerks/vscode-claude-workspaces", defaultBranch: "main" as const }, activePrerelease: "prerelease/0.9.x" };

function prepare() {
  const f = createGitFixture();
  f.tag("v0.8.1", f.initialCommit);
  const candidate = f.commit({ "src/example.ts": "export const value = 2;\n", "test/unit/feature.test.ts": "supporting regression\n" });
  const source: PublicationSource = { tag: "v0.8.1", commit: f.initialCommit, branch: "main", releaseId: 10, publishRunId: 20 };
  const input: BuildApprovalInput = { kind: "hotfix", mode: "compatibility", targetVersion: "0.8.2", issue: 157,
    candidatePullRequest: 200, source, baselineTag: "v0.8.1", candidateCommit: candidate,
    sourceCommits: [], sourcePullRequests: [], rationale: "Fixture bug fix" };
  return { f, candidate, source, input };
}
function state(approval: Approval): PolicyState {
  return { config, authorityCommit: approval.source.commit, approvals: [approval], dispositions: [] };
}

describe("release approval records", function () {
  this.timeout(60000);
  it("binds exact product and supporting-test scope without invalidating policy rebases", () => {
    assert.equal(typeof records.buildApproval, "function", "approval enforcement is missing");
    const { f, candidate, input } = prepare();
    try {
      const approval = records.buildApproval(f.repo, input);
      records.validateApproval(f.repo, approval, f.initialCommit, candidate);
      f.git(["checkout", "-b", "policy-base", f.initialCommit]);
      const policyBase = f.commit({ "README.md": "policy-only base update" });
      records.validateApproval(f.repo, approval, policyBase, candidate);
      const staleBase = f.commit({ "src/another.ts": "new main product fix" });
      assert.throws(() => records.validateApproval(f.repo, approval, staleBase, candidate), /E_BASELINE_CHANGED/);
      f.git(["checkout", "main"]);
      const extraTest = f.commit({ "test/unit/extra.test.ts": "unapproved supporting test" });
      assert.throws(() => records.validateApproval(f.repo, approval, f.initialCommit, extraTest), /E_SCOPE_CHANGED/);
      const extraProduct = f.commit({ "src/extra.ts": "unapproved code" });
      assert.throws(() => records.validateApproval(f.repo, approval, f.initialCommit, extraProduct), /E_SCOPE_CHANGED/);
    } finally { f.remove(); }
  });
  it("rejects immutable ledger changes and ambiguous approvals while permitting explicit supersession", () => {
    assert.equal(typeof records.validateLedger, "function", "ledger enforcement is missing");
    const { f, input } = prepare();
    try {
      const approval = records.buildApproval(f.repo, input);
      const before = state(approval);
      assert.throws(() => records.validateLedger(before, { ...before, approvals: [] }), /E_LEDGER/);
      assert.throws(() => records.validateLedger(before, { ...before, approvals: [{ ...approval, rationale: "edited" }] }), /E_LEDGER/);
      assert.throws(() => records.validateLedger(before, { ...before, approvals: [approval, approval] }), /E_SCHEMA/);
      const replacement = records.buildApproval(f.repo, { ...input, rationale: "new deliberate approval", supersedes: approval.id });
      const next = { ...before, approvals: [approval, replacement] };
      records.validateLedger(before, next);
      assert.equal(records.findApproval(next, "0.8.2", replacement.productDigest).id, replacement.id);
      assert.throws(() => records.findApproval({ ...before, approvals: [{ ...approval, id: null } as unknown as Approval] }, "0.8.2", approval.productDigest), /E_SCHEMA/);
      assert.throws(() => records.validateLedger(before, { ...before, approvals: [approval, { ...replacement, supersedes: "unknown" }] }), /E_SCHEMA/);
      assert.throws(() => records.validateLedger(before, { ...before, approvals: [approval, { ...replacement, supersedes: undefined }] }), /E_SCHEMA/);
    } finally { f.remove(); }
  });
  it("rejects malformed authority schemas, unexpected fields and record symlinks", () => {
    assert.equal(typeof records.loadPolicy, "function", "policy loading is missing");
    const f = createGitFixture();
    try {
      for (const bad of [{ ...config, schemaVersion: 2 }, { ...config, bypass: true }, { ...config, activePrerelease: "prerelease/0.8.x" }, { ...config, activePrerelease: ["prerelease/0.9.x"] }]) {
        const sha = f.commit({ ".github/release-policy/config.json": JSON.stringify(bad) });
        assert.throws(() => records.loadPolicy(f.repo, sha), /E_SCHEMA/);
      }
      const sha = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
      assert.equal(records.loadPolicy(f.repo, sha).config.activePrerelease, "prerelease/0.9.x");
      const oid = f.git(["hash-object", "-w", "--stdin"], "elsewhere.json");
      f.git(["update-index", "--add", "--cacheinfo", `120000,${oid},.github/release-policy/approvals/link.json`]);
      f.git(["commit", "-m", "invalid record mode"]);
      assert.throws(() => records.loadPolicy(f.repo, f.git(["rev-parse", "HEAD"])), /E_SCHEMA/);
    } finally { f.remove(); }
  });
  it("rejects unpublished selections and scope digests that conceal changed entries", () => {
    assert.equal(typeof records.buildApproval, "function", "approval enforcement is missing");
    const { f, candidate, input } = prepare();
    try {
      assert.throws(() => records.buildApproval(f.repo, { ...input, kind: "promotion", mode: "selective", sourceCommits: [candidate], sourcePullRequests: [200] }), /E_SELECTION/);
      const approval = records.buildApproval(f.repo, input);
      const tampered = { ...approval, changes: [] };
      assert.throws(() => records.validateApproval(f.repo, tampered, f.initialCommit, candidate), /E_SCHEMA|E_SCOPE_CHANGED/);
    } finally { f.remove(); }
  });
  it("rejects hand-authored empty, reversed and unrelated selective provenance", async () => {
    const { f, candidate, input } = prepare();
    try {
      const cutoff = f.commit({ "src/selected.ts": "published selection" });
      f.tag("v0.9.2", cutoff);
      const approval = records.buildApproval(f.repo, { ...input, kind: "promotion", mode: "compatibility",
        source: { ...input.source, tag: "v0.9.2", commit: cutoff, branch: config.activePrerelease } });
      const empty: Approval = { ...approval, mode: "selective" };
      assert.throws(() => records.validateApproval(f.repo, empty, f.initialCommit, candidate), /E_SELECTION/);
      const reversed: Approval = { ...approval, mode: "selective", sourceCommits: [cutoff, candidate], sourcePullRequests: [201, 200] };
      assert.throws(() => records.validateApproval(f.repo, reversed, f.initialCommit, candidate), /E_SELECTION/);
      const selected: Approval = { ...reversed, sourceCommits: [candidate, cutoff], sourcePullRequests: [200, 201] };
      const github: GitHubEvidence = { issue: async () => {}, publishedSource: async () => {}, mergedForwardPort: async () => {}, maintenanceBetween: async () => [],
        pullRequest: async number => ({ number, state: "closed", merged: true, mergeCommit: number === 200 ? candidate : cutoff,
          head: { sha: cutoff, ref: "feature/selection", repositoryId: config.repository.id },
          base: { sha: f.initialCommit, ref: config.activePrerelease, repositoryId: config.repository.id } }) };
      await records.verifySelection(f.repo, selected, github, config.repository);
      await assert.rejects(records.verifySelection(f.repo, selected, { ...github,
        pullRequest: async number => ({ ...await github.pullRequest(number), mergeCommit: f.initialCommit }) }, config.repository), /E_SELECTION/);
    } finally { f.remove(); }
  });
  it("blocks omitted stable fixes and requires dispositions contained in the frozen cutoff", async () => {
    assert.equal(typeof records.validateMaintenance, "function", "maintenance gate is missing");
    const { f, input, candidate } = prepare();
    try {
      const fix = records.buildApproval(f.repo, input);
      const source: PublicationSource = { tag: "v0.9.2", commit: candidate, branch: "prerelease/0.9.x", releaseId: 30, publishRunId: 40 };
      f.tag(source.tag, candidate);
      const promotion = records.buildApproval(f.repo, { ...input, kind: "promotion", mode: "full", targetVersion: "0.10.0", source, candidateCommit: candidate });
      const policy = { ...state(fix), authorityCommit: candidate, approvals: [fix, promotion] };
      const evidence: GitHubEvidence = { issue: async () => {}, pullRequest: async () => { throw new Error("unused"); }, publishedSource: async () => {},
        mergedForwardPort: async () => {}, maintenanceBetween: async (_base, _head, productCommits) => {
          assert.deepEqual(productCommits, [candidate], "Production maintenance passes only product/supporting-test commits");
          return [{ pullRequest: 200, mergeCommit: candidate, headRef: "hotfix/0.8.2", version: "0.8.2" }];
        } };
      await assert.rejects(records.validateMaintenance(f.repo, policy, promotion, evidence), /E_FORWARD_PORT/);
      await assert.rejects(records.validateMaintenance(f.repo, { ...policy, approvals: [promotion] }, promotion, evidence), /E_MAINTENANCE/);
      const disposition: Disposition = { schemaVersion: 1, id: "forward-port", approvalId: fix.id, kind: "forward-port", pullRequest: 201,
        mergeCommit: candidate, issue: 157, rationale: "Fixture retains fix in cutoff" };
      await records.validateMaintenance(f.repo, { ...policy, dispositions: [disposition] }, promotion, evidence);
      const later = f.commit({ "README.md": "after published cutoff" });
      await assert.rejects(records.validateMaintenance(f.repo, { ...policy, dispositions: [{ ...disposition, mergeCommit: later }] }, promotion, evidence), /E_FORWARD_PORT/);
    } finally { f.remove(); }
  });
});

function fakeApi(overrides: Record<string, unknown> = {}, status = 200): typeof fetch {
  const commit = "a".repeat(40);
  const responses: Record<string, unknown> = {
    "": { id: 1344170098, full_name: config.repository.fullName },
    "/git/ref/tags/v0.9.2": { object: { type: "tag", sha: "b".repeat(40) } },
    [`/git/tags/${"b".repeat(40)}`]: { object: { type: "commit", sha: commit } },
    "/releases/10": { id: 10, tag_name: "v0.9.2", draft: false, prerelease: true, published_at: "2026-10-10T00:00:00Z" },
    "/actions/runs/20": { id: 20, head_sha: commit, head_branch: "v0.9.2", event: "push", status: "completed", conclusion: "success", path: ".github/workflows/publish.yml", repository: { id: 1344170098 } },
    [`/compare/${commit}...prerelease%2F0.9.x?per_page=100&page=1`]: { status: "identical", commits: [], total_commits: 0 }
  };
  return (async (input, init) => {
    assert.equal(init?.method, "GET");
    assert.equal(init?.redirect, "error");
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.github.com");
    const route = url.pathname.replace(`/repos/${config.repository.fullName}`, "") + url.search;
    const body = Object.hasOwn(overrides, route) ? overrides[route] : responses[route];
    assert.notEqual(body, undefined, `Unexpected evidence request ${route}`);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

describe("GitHub release evidence", () => {
  const source: PublicationSource = { tag: "v0.9.2", commit: "a".repeat(40), branch: "prerelease/0.9.x", releaseId: 10, publishRunId: 20 };
  it("requires a peeled exact tag, published release and exact successful Publish run", async () => {
    assert.equal(typeof githubModule.createGitHubEvidence, "function", "publication evidence is missing");
    const evidence = githubModule.createGitHubEvidence({ repository: config.repository, fetchImpl: fakeApi() });
    await evidence.publishedSource(source);
  });
  it("accepts a manual tag retry only with exact validated source evidence", async () => {
    const run = { id: 20, head_sha: source.commit, head_branch: source.tag, event: "workflow_dispatch", status: "completed", conclusion: "success", path: ".github/workflows/publish.yml", repository: { id: config.repository.id } };
    const jobs = { jobs: [{ run_id: 20, head_sha: source.commit, status: "completed", conclusion: "success",
      steps: [{ name: `Validated source ${source.tag} at ${source.commit}`, conclusion: "success" }] }] };
    const route = "/actions/runs/20/jobs?filter=latest&per_page=100&page=1";
    await githubModule.createGitHubEvidence({ repository: config.repository, fetchImpl: fakeApi({ "/actions/runs/20": run, [route]: jobs }) }).publishedSource(source);
    for (const wrong of ["v0.9.3", "main"]) {
      await assert.rejects(githubModule.createGitHubEvidence({ repository: config.repository,
        fetchImpl: fakeApi({ "/actions/runs/20": { ...run, head_branch: wrong }, [route]: jobs }) }).publishedSource(source), /E_EVIDENCE/);
    }
    await assert.rejects(githubModule.createGitHubEvidence({ repository: config.repository,
      fetchImpl: fakeApi({ "/actions/runs/20": run, [route]: { jobs: [{ ...jobs.jobs[0], steps: [{ name: `Validated source v0.9.3 at ${source.commit}`, conclusion: "success" }] }] } }) }).publishedSource(source), /E_EVIDENCE/);
  });
  it("authenticates and limits maintenance PR reads to supplied product commits", async () => {
    const base = "a".repeat(40);
    const commits = Array.from({ length: 60 }, (_, i) => ({ sha: (i + 1).toString(16).padStart(40, "0") }));
    const head = commits.at(-1)?.sha;
    assert.ok(head);
    let requests = 0;
    const fetchImpl = (async (url, init) => {
      requests++;
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fixture-token");
      return fakeApi({ [`/compare/${base}...${head}?per_page=100&page=1`]: { commits, total_commits: 60 },
        [`/commits/${head}/pulls?per_page=100&page=1`]: [] })(url, init);
    }) as typeof fetch;
    const evidence = githubModule.createGitHubEvidence({ repository: config.repository, token: "fixture-token", fetchImpl });
    await evidence.maintenanceBetween(base, head, [head]);
    assert.equal(requests, 3, "Policy-only commits must not consume per-commit API requests");
  });
  it("retains merged PR identity for publication verification", async () => {
    const evidence = githubModule.createGitHubEvidence({ repository: config.repository, fetchImpl: fakeApi({
      "/pulls/200": { number: 200, state: "closed", merged: true, merge_commit_sha: "a".repeat(40),
        base: { sha: "b".repeat(40), ref: "main", repo: { id: config.repository.id } },
        head: { sha: "c".repeat(40), ref: "release/0.10.0", repo: { id: config.repository.id } } }
    }) });
    const pr = await evidence.pullRequest(200);
    assert.equal(pr.merged, true);
    assert.equal(pr.mergeCommit, "a".repeat(40));
  });
  it("requires an existing issue rather than an unrelated PR reference", async () => {
    const evidence = githubModule.createGitHubEvidence({ repository: config.repository, fetchImpl: fakeApi({ "/issues/157": { number: 157, state: "open" } }) });
    assert.equal(typeof evidence.issue, "function", "issue-linked approval verification is missing");
    await evidence.issue(157);
    await assert.rejects(githubModule.createGitHubEvidence({ repository: config.repository,
      fetchImpl: fakeApi({ "/issues/157": { number: 157, pull_request: {}, state: "open" } }) }).issue(157), /E_EVIDENCE/);
  });
  for (const [route, value] of [
    ["/git/ref/tags/v0.9.2", { object: { type: "commit", sha: "c".repeat(40) } }],
    ["/releases/10", { id: 10, tag_name: "v0.9.2", draft: true, prerelease: true, published_at: "date" }],
    ["/releases/10", { id: 10, tag_name: "v0.9.2", draft: false, prerelease: false, published_at: "date" }],
    ["/actions/runs/20", { id: 20, head_sha: "c".repeat(40), status: "completed", conclusion: "success", path: ".github/workflows/publish.yml", repository: { id: 1344170098 } }],
    ["/actions/runs/20", { id: 20, head_sha: "a".repeat(40), status: "completed", conclusion: "success", path: ".github/workflows/ci.yml", repository: { id: 1344170098 } }],
    ["/actions/runs/20", { id: 20, head_sha: "a".repeat(40), status: "completed", conclusion: "failure", path: ".github/workflows/publish.yml", repository: { id: 1344170098 } }],
    ["", { id: 99, full_name: config.repository.fullName }]
  ] as [string, unknown][]) {
    it(`rejects invalid evidence ${route}: ${JSON.stringify(value)}`, async () => {
      assert.equal(typeof githubModule.createGitHubEvidence, "function", "publication evidence is missing");
      await assert.rejects(githubModule.createGitHubEvidence({ repository: config.repository, fetchImpl: fakeApi({ [route]: value }) }).publishedSource(source), /E_EVIDENCE/);
    });
  }
  it("rejects HTTP errors and redirect failures", async () => {
    assert.equal(typeof githubModule.createGitHubEvidence, "function", "publication evidence is missing");
    await assert.rejects(githubModule.createGitHubEvidence({ repository: config.repository, fetchImpl: fakeApi({}, 403) }).publishedSource(source), /E_EVIDENCE/);
    const redirect = (async () => { throw new TypeError("fetch failed: redirect"); }) as typeof fetch;
    await assert.rejects(githubModule.createGitHubEvidence({ repository: config.repository, fetchImpl: redirect }).publishedSource(source), /E_EVIDENCE/);
  });
  it("checks merged forward-ports and includes maintenance evidence beyond page one", async () => {
    assert.equal(typeof githubModule.createGitHubEvidence, "function", "maintenance evidence is missing");
    const commit = "a".repeat(40);
    const fix = "c".repeat(40);
    const pr = { number: 205, state: "closed", merged: true, merged_at: "2026-10-10", merge_commit_sha: fix,
      base: { ref: "main", repo: { id: 1344170098 } }, head: { ref: "hotfix/0.8.2", repo: { id: 1344170098 } } };
    const first = Array.from({ length: 100 }, (_, i) => ({ sha: (i + 1).toString(16).padStart(40, "0") }));
    const evidence = githubModule.createGitHubEvidence({ repository: config.repository, fetchImpl: fakeApi({
      [`/compare/${commit}...${fix}?per_page=100&page=1`]: { commits: first, total_commits: 101 },
      [`/compare/${commit}...${fix}?per_page=100&page=2`]: { commits: [{ sha: fix }], total_commits: 101 },
      ...Object.fromEntries(first.map(value => [`/commits/${value.sha}/pulls?per_page=100&page=1`, []])),
      [`/commits/${fix}/pulls?per_page=100&page=1`]: [pr],
      "/pulls/205": { ...pr, merged: false }
    }) });
    const merges = await evidence.maintenanceBetween(commit, fix);
    assert.deepEqual(merges, [{ pullRequest: 205, mergeCommit: fix, headRef: "hotfix/0.8.2", version: "0.8.2" }]);
    const disposition: Disposition = { schemaVersion: 1, id: "forward-port", approvalId: "fix", kind: "forward-port", pullRequest: 205, mergeCommit: fix, issue: 157, rationale: "fixture" };
    await assert.rejects(evidence.mergedForwardPort(disposition), /E_EVIDENCE/);
  });
});
