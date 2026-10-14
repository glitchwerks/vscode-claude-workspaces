import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import fs from "node:fs";
import type { QueueEvent, QueueEntry, QueueSnapshot, PullRequestIdentity, PolicyConfig, GitHubEvidence } from "../../scripts/release-enforcement/contracts";
import { createGitFixture, fixtureEvidence, missingModule } from "./helpers/releasePolicyFixture";
import type { PullRequestEvaluationInput, GuardResult } from "../../scripts/release-enforcement/contracts";

const queue = missingModule<{
  parseQueueEvent(event: unknown, runner: { eventName: string; sha: string; ref: string }, repository: PolicyConfig["repository"]): QueueEvent;
  correlateQueue(input: { repository: PolicyConfig["repository"]; event: QueueEvent; queue: QueueSnapshot; pr: PullRequestIdentity; mainCommit: string; headCommit: string }): QueueEntry;
  proveQueuedTree(input: { repositoryPath: string; event: QueueEvent; pr: PullRequestIdentity }): string;
}>("scripts/release-enforcement/queue.js", createRequire(__filename));
const adapter = createRequire(__filename)(path.resolve("scripts/release-enforcement/github.js")) as {
  createGitHubEvidence(options: { repository: { id: number; fullName: string }; token: string; fetchImpl: typeof fetch; onQueuePage?: (page: unknown) => void }): GitHubEvidence };
const repository: PolicyConfig["repository"] = { id: 1344170098, fullName: "glitchwerks/vscode-claude-workspaces", defaultBranch: "main" };
const base = "a".repeat(40), head = "b".repeat(40), original = "c".repeat(40);
const event: QueueEvent = { baseRef: "refs/heads/main", baseCommit: base, headRef: "refs/heads/gh-readonly-queue/main/pr-200-test", headCommit: head };
const pr: PullRequestIdentity = { number: 200, state: "open", head: { sha: original, ref: "policy/157-probe", repositoryId: repository.id }, base: { sha: base, ref: "main", repositoryId: repository.id } };
const entry: QueueEntry = { id: "entry-200", position: 1, state: "AWAITING_CHECKS", pullRequest: 200, baseCommit: base, headCommit: head };
const input = () => ({ repository, event, pr, mainCommit: base, headCommit: head, queue: { totalCount: 1, entries: [{ ...entry }] } });
const payload = () => ({ action: "checks_requested", repository: { id: repository.id, full_name: repository.fullName }, merge_group: { base_ref: event.baseRef, base_sha: base, head_ref: event.headRef, head_sha: head } });
const runner = { eventName: "merge_group", sha: head, ref: event.headRef };

describe("authenticated queue identity", () => {
  it("rejects another entry even with equivalent prospective trees", () => {
    assert.equal(typeof queue.correlateQueue, "function");
    assert.throws(() => queue.correlateQueue({ ...input(), queue: { totalCount: 2, entries: [entry, { ...entry, id: "second", position: 2, pullRequest: 201 }] } }), /E_QUEUE/);
  });
  it("preserves original PR head while mapping the queued revision", () => {
    assert.deepEqual(queue.correlateQueue(input()), entry);
    assert.equal(pr.head.sha, original);
    assert.notEqual(pr.head.sha, head);
  });
  for (const side of ["head", "base"] as const) {
    it(`rejects foreign ${side} repository`, () => {
      assert.throws(() => queue.correlateQueue({ ...input(), pr: { ...pr, [side]: { ...pr[side], repositoryId: 99 } } }), /E_QUEUE/);
    });
  }
  for (const [label, changes] of Object.entries({ closed: { state: "closed" }, retarget: { base: { ...pr.base, ref: "prerelease/0.9.x" } }, malformedHead: { head: { ...pr.head, sha: "bad" } }, malformedBranch: { head: { ...pr.head, ref: "policy/../bad" } } })) {
    it(`rejects ${label} original PR`, () => assert.throws(() => queue.correlateQueue({ ...input(), pr: { ...pr, ...changes } }), /E_QUEUE/));
  }
  for (const patch of [{ totalCount: 0, entries: [] }, { totalCount: 2, entries: [entry] }, { totalCount: 1, entries: [{ ...entry, position: 2 }] }, { totalCount: 1, entries: [{ ...entry, pullRequest: 201 }] }, { totalCount: 1, entries: [{ ...entry, state: "UNMERGEABLE" }] }]) {
    it(`rejects unsupported queue ${JSON.stringify(patch)}`, () => assert.throws(() => queue.correlateQueue({ ...input(), queue: patch }), /E_QUEUE/));
  }
  for (const patch of [{ mainCommit: original }, { headCommit: original }, { queue: { totalCount: 1, entries: [{ ...entry, baseCommit: original }] } }, { queue: { totalCount: 1, entries: [{ ...entry, headCommit: original }] } }]) {
    it("rejects stale group or main identity", () => assert.throws(() => queue.correlateQueue({ ...input(), ...patch }), /E_STALE_QUEUE/));
  }
  it("validates event against trusted runner and configured repository", () => assert.deepEqual(queue.parseQueueEvent(payload(), runner, repository), event));
  for (const [label, patch] of Object.entries({ action: { action: "destroyed" }, repository: { repository: { id: 99, full_name: repository.fullName } }, name: { repository: { id: repository.id, full_name: "other/repo" } }, target: { merge_group: { ...payload().merge_group, base_ref: "refs/heads/prerelease/0.9.x" } }, ref: { merge_group: { ...payload().merge_group, head_ref: "refs/heads/gh-readonly-queue/main/../bad" } }, oid: { merge_group: { ...payload().merge_group, head_sha: "bad" } } })) {
    it(`rejects malformed event ${label}`, () => assert.throws(() => queue.parseQueueEvent({ ...payload(), ...patch }, runner, repository), /E_QUEUE/));
  }
  for (const patch of [{ eventName: "pull_request" }, { sha: original }, { ref: "refs/heads/other" }]) {
    it("rejects mismatched trusted runner", () => assert.throws(() => queue.parseQueueEvent(payload(), { ...runner, ...patch }, repository), /E_QUEUE/));
  }
});

function graph() {
  const f = createGitFixture();
  const config = { schemaVersion: 1, repository, activePrerelease: "prerelease/0.9.x" };
  const authority = f.commit({ ".github/release-policy/config.json": JSON.stringify(config) });
  const source = f.commit({ "README.md": "approved docs", "media/binary.bin": Buffer.from([0, 1, 255]) });
  f.git(["checkout", "--detach", authority]);
  const main = f.commit({ "docs/main.md": "fresh main" });
  const expected = f.git(["merge-tree", "--write-tree", main, source]).split("\n")[0]!;
  const group = f.git(["commit-tree", expected, "-p", main, "-p", source, "-m", "queue fixture"]);
  const originalPr = { ...pr, head: { ...pr.head, sha: source }, base: { ...pr.base, sha: main } };
  const groupEvent = { ...event, baseCommit: main, headCommit: group };
  return { f, config, source, main, expected, group, originalPr, groupEvent };
}
describe("independent full queue tree proof", function () {
  this.timeout(60000);
  it("accepts a divergent original PR applied to current main without changing its source", () => {
    const g = graph();
    try {
      assert.equal(typeof queue.proveQueuedTree, "function");
      assert.equal(queue.proveQueuedTree({ repositoryPath: g.f.repo, event: g.groupEvent, pr: g.originalPr }), g.expected);
      assert.equal(g.originalPr.head.sha, g.source);
    } finally { g.f.remove(); }
  });
  for (const [label, changes] of Object.entries<Record<string, string | Buffer | null>>({ policy: { ".github/release-policy/extra.json": "{}" }, binary: { "media/binary.bin": Buffer.from([0, 2, 255]) }, deletion: { "README.md": null }, rename: { "README.md": null, "README2.md": "approved docs" } })) {
    it(`rejects an extra ${label} change in the prospective tree`, () => {
      const g = graph();
      try {
        g.f.git(["checkout", "--detach", g.group]);
        const extra = g.f.commit(changes);
        assert.throws(() => queue.proveQueuedTree({ repositoryPath: g.f.repo, event: { ...g.groupEvent, headCommit: extra }, pr: g.originalPr }), /E_QUEUE_TREE/);
      } finally { g.f.remove(); }
    });
  }
  for (const mode of ["100755", "120000", "160000"]) {
    it(`rejects prospective mode ${mode} mismatch or unsupported gitlink`, () => {
      const g = graph();
      try {
        g.f.git(["read-tree", g.group]);
        const blob = mode === "160000" ? g.source : g.f.git(["hash-object", "-w", "--stdin"], "approved docs");
        g.f.git(["update-index", "--cacheinfo", `${mode},${blob},README.md`]);
        const changed = g.f.git(["commit-tree", g.f.git(["write-tree"]), "-p", g.main, "-m", "mode mutation"]);
        assert.throws(() => queue.proveQueuedTree({ repositoryPath: g.f.repo, event: { ...g.groupEvent, headCommit: changed }, pr: g.originalPr }), /E_QUEUE_TREE|E_UNSUPPORTED_GITLINK/);
      } finally { g.f.remove(); }
    });
  }
  it("rejects conflicts without accepting Git's conflicted tree output", () => {
    const f = createGitFixture();
    try {
      const source = f.commit({ "src/example.ts": "original incompatible edit\n" });
      f.git(["checkout", "--detach", f.initialCommit]);
      const main = f.commit({ "src/example.ts": "main incompatible edit\n" });
      assert.throws(() => queue.proveQueuedTree({ repositoryPath: f.repo, event: { ...event, baseCommit: main, headCommit: source }, pr: { ...pr, head: { ...pr.head, sha: source } } }), /E_QUEUE_TREE/);
    } finally { f.remove(); }
  });
  for (const sha of ["bad", "0".repeat(40)]) {
    it("rejects malformed or missing objects", () => {
      const g = graph();
      try { assert.throws(() => queue.proveQueuedTree({ repositoryPath: g.f.repo, event: { ...g.groupEvent, headCommit: sha }, pr: g.originalPr }), /E_QUEUE_TREE/); }
      finally { g.f.remove(); }
    });
  }
  it("never executes candidate attributes, local/global drivers, filters, hooks or inherited Git settings", () => {
    const f = createGitFixture();
    const keys = ["GIT_CONFIG_COUNT", "GIT_CONFIG_KEY_0", "GIT_CONFIG_VALUE_0", "GIT_DIR", "GIT_WORK_TREE", "GIT_CONFIG_SYSTEM", "GIT_CONFIG_GLOBAL"];
    const old = keys.map(key => process.env[key]);
    try {
      const ancestor = f.commit({ ".gitattributes": "src/example.ts merge=evil filter=evil\n", "src/example.ts": "first\ncommon\nlast\n" });
      const source = f.commit({ "src/example.ts": "changed first\ncommon\nlast\n" });
      f.git(["checkout", "--detach", ancestor]);
      const main = f.commit({ "src/example.ts": "first\ncommon\nchanged last\n" });
      const tree = f.git(["merge-tree", "--write-tree", main, source]).split("\n")[0]!;
      const group = f.git(["commit-tree", tree, "-p", main, "-m", "group"]);
      f.git(["read-tree", ancestor]);
      const conflictingBlob = f.git(["hash-object", "-w", "--stdin"], "entirely incompatible\n");
      f.git(["update-index", "--cacheinfo", `100644,${conflictingBlob},src/example.ts`]);
      const conflict = f.git(["commit-tree", f.git(["write-tree"]), "-p", ancestor, "-m", "conflict"]);
      f.git(["replace", source, conflict]);
      const marker = path.join(f.repo, "marker").replace(/\\/g, "/");
      const command = `echo executed > '${marker}'`;
      for (const setting of ["merge.evil.driver", "filter.evil.clean", "filter.evil.smudge"]) { f.git(["config", setting, command]); }
      const hooks = path.join(f.repo, "evil-hooks"); fs.mkdirSync(hooks);
      fs.writeFileSync(path.join(hooks, "pre-merge-commit"), `#!/bin/sh\n${command}\n`, { mode: 0o755 });
      f.git(["config", "core.hooksPath", hooks]);
      const hostileConfig = path.join(f.repo, "hostile-global");
      fs.writeFileSync(hostileConfig, `[merge "evil"]\n driver = ${command}\n`);
      Object.assign(process.env, { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "merge.evil.driver", GIT_CONFIG_VALUE_0: command,
        GIT_DIR: path.join(f.repo, "absent-git"), GIT_WORK_TREE: "absent", GIT_CONFIG_SYSTEM: hostileConfig, GIT_CONFIG_GLOBAL: hostileConfig });
      assert.equal(queue.proveQueuedTree({ repositoryPath: f.repo, event: { ...event, baseCommit: main, headCommit: group }, pr: { ...pr, head: { ...pr.head, sha: source } } }), tree);
      assert.throws(() => queue.proveQueuedTree({ repositoryPath: f.repo, event: { ...event, baseCommit: main, headCommit: group }, pr: { ...pr, head: { ...pr.head, sha: conflict } } }), /E_QUEUE_TREE/);
      assert.equal(fs.existsSync(marker), false);
    } finally {
      keys.forEach((key, index) => old[index] === undefined ? delete process.env[key] : process.env[key] = old[index]);
      f.remove();
    }
  });
});

const loader = createRequire(__filename);
const evaluator = loader(path.resolve("scripts/release-enforcement/evaluate.js")) as { evaluatePullRequest(input: PullRequestEvaluationInput): Promise<GuardResult> };
const guard = loader(path.resolve("scripts/check-release-pr.js")) as { runPrGuard(options: { automationRoot: string; eventPath: string; workflowRef: string; workflowSha: string; eventName: string; sha: string; ref: string; github: GitHubEvidence; recordQueueEvidence?: (receipt: unknown) => void }): Promise<GuardResult> };
describe("prospective original-PR evaluation and freshness", function () {
  this.timeout(60000);
  it("evaluates the prospective commit while retaining the original route and number", async () => {
    const g = graph();
    try {
      // The binary is a real product change, so the policy route must reject it even
      // when the original head alone is policy-only.
      const policyHead = g.f.git(["commit-tree", g.f.git(["rev-parse", `${g.main}^{tree}`]), "-p", g.main, "-m", "policy source"]);
      const p = { ...g.originalPr, head: { ...g.originalPr.head, sha: policyHead } };
      await assert.rejects(evaluator.evaluatePullRequest({ repositoryPath: g.f.repo, pr: p, policy: { config: { ...g.config, schemaVersion: 1 }, authorityCommit: g.main, approvals: [], dispositions: [] }, github: fixtureEvidence(p), prospective: { baseCommit: g.main, commit: g.group } }), /E_POLICY_SCOPE/);
    } finally { g.f.remove(); }
  });
  for (const drift of ["none", "queue", "pr", "main", "head", "objects", "authority"] as const) {
    it(`${drift === "none" ? "accepts" : "rejects"} ${drift} on the final authenticated read`, async () => {
      const g = graph();
      try {
        // Use a genuinely policy-only original PR for the live runner fixture.
        g.f.git(["checkout", "--detach", g.main]);
        const source = g.f.commit({ "README.md": "queue policy probe" });
        const tree = g.f.git(["rev-parse", `${source}^{tree}`]);
        const group = g.f.git(["commit-tree", tree, "-p", g.main, "-p", source, "-m", "policy group"]);
        const identity = { ...g.originalPr, head: { ...g.originalPr.head, sha: source } };
        const selected = { ...entry, baseCommit: g.main, headCommit: group };
        g.f.git(["update-ref", "refs/heads/main", g.main]);
        g.f.git(["update-ref", "refs/pull/200/head", source]);
        g.f.git(["update-ref", event.headRef, group]);
        g.f.git(["checkout", "--detach", g.main]);
        g.f.git(["config", `url.${g.f.repo.replace(/\\/g, "/")}.insteadOf`, `https://github.com/${repository.fullName}.git`]);
        const eventPath = path.join(g.f.repo, ".tmp", "event.json"); fs.mkdirSync(path.dirname(eventPath));
        fs.writeFileSync(eventPath, JSON.stringify({ ...payload(), merge_group: { ...payload().merge_group, base_sha: g.main, head_sha: group } }));
        let reads = 0, prReads = 0, mainReads = 0, headReads = 0;
        const evidence = { ...fixtureEvidence(identity), mergeQueue: async () => {
          reads++;
          if (reads > 1 && drift === "objects") { g.f.git(["update-ref", event.headRef, source]); }
          if (reads > 1 && drift === "authority") { g.f.git(["update-ref", "refs/heads/main", source]); }
          return reads > 1 && drift === "queue" ? { totalCount: 0, entries: [] } : { totalCount: 1, entries: [selected] };
        }, pullRequest: async () => ++prReads > 1 && drift === "pr" ? { ...identity, base: { ...identity.base, ref: "prerelease/0.9.x" } } : identity,
        gitRef: async (ref: string) => ref === "refs/heads/main" ? (++mainReads > 1 && drift === "main" ? source : g.main) : (++headReads > 1 && drift === "head" ? source : group) };
        const receipts: { stage: string; event: QueueEvent; pr: PullRequestIdentity; provedTree?: string }[] = [];
        const options = { automationRoot: g.f.repo, eventPath, workflowRef: `${repository.fullName}/.github/workflows/release-guard.yml@refs/heads/main`, workflowSha: g.main, eventName: "merge_group", sha: group, ref: event.headRef, github: evidence,
          recordQueueEvidence: (receipt: unknown) => receipts.push(receipt as typeof receipts[number]) };
        if (drift === "none") {
          const result = await guard.runPrGuard(options);
          assert.equal(result.route, "policy"); assert.equal(result.commit, group); assert.equal(identity.head.sha, source);
          assert.equal(reads, 2);
          assert.deepEqual(receipts.map(receipt => receipt.stage), ["identity-before", "identity-after"]);
          for (const receipt of receipts) {
            assert.equal(receipt.pr.head.sha, source);
            assert.equal(receipt.event.headCommit, group);
          }
          assert.equal(receipts[1]!.provedTree, tree);
        } else {
          await assert.rejects(guard.runPrGuard(options), /E_STALE_QUEUE|E_QUEUE|E_STALE_PR/);
          assert.equal(reads, 2, "rejection must occur after full evaluation at the final evidence read");
          assert.deepEqual(receipts.map(receipt => receipt.stage), ["identity-before"], "failed freshness checks must not produce a final proof receipt");
        }
      } finally { g.f.remove(); }
    });
  }
});

function graphqlPage(nodes: QueueEntry[] = [entry], totalCount = nodes.length, hasNextPage = false, endCursor: string | null = null) {
  return { data: { repository: { mergeQueue: { entries: { totalCount, pageInfo: { hasNextPage, endCursor }, nodes: nodes.map(e => ({ ...e, baseCommit: { oid: e.baseCommit }, headCommit: { oid: e.headCommit }, pullRequest: { number: e.pullRequest } })) } } }, rateLimit: { remaining: 100 } } };
}
function evidenceFor(pages: unknown[], onQueuePage?: (page: unknown) => void) {
  let index = 0;
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    if (String(url) === "https://api.github.com/graphql") {
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body)) as { query: string; variables: { owner: string; name: string; cursor: string | null } };
      assert.ok(!/mutation/i.test(body.query));
      assert.ok(body.query.includes('mergeQueue(branch: "main")'));
      assert.deepEqual([body.variables.owner, body.variables.name], ["glitchwerks", "vscode-claude-workspaces"]);
      assert.equal(body.variables.cursor, index === 0 ? null : "page-1");
      return new Response(JSON.stringify(pages[index++]));
    }
    assert.equal(init?.method, "GET");
    assert.equal(String(url), "https://api.github.com/repos/glitchwerks/vscode-claude-workspaces");
    return new Response(JSON.stringify({ id: repository.id, full_name: repository.fullName }));
  }) as typeof fetch;
  return adapter.createGitHubEvidence({ repository, token: "test-read-token", fetchImpl, onQueuePage });
}
describe("bounded authenticated queue reads", () => {
  it("retains the fixed query and complete selected response fields for each authenticated page", async () => {
    const second = { ...entry, id: "second", position: 2, pullRequest: 201 };
    const pages = [graphqlPage([entry], 2, true, "page-1"), graphqlPage([second], 2)];
    const receipts: { request: { query: string; variables: { owner: string; name: string; cursor: string | null } }; response: unknown }[] = [];
    const evidence = evidenceFor(pages, page => receipts.push(page as typeof receipts[number]));
    assert.deepEqual(await evidence.mergeQueue(), { totalCount: 2, entries: [entry, second] });
    assert.equal(receipts.length, 2);
    for (let index = 0; index < receipts.length; index++) {
      const receipt = receipts[index]!;
      assert.ok(receipt.request.query.includes('mergeQueue(branch: "main")'));
      assert.deepEqual(receipt.request.variables, { owner: "glitchwerks", name: "vscode-claude-workspaces", cursor: index === 0 ? null : "page-1" });
      assert.deepEqual(receipt.response, pages[index]);
    }
  });
  it("projects only selected fields, redacts reflected credentials and still rejects incomplete identities", async () => {
    const page = graphqlPage();
    page.data.repository.mergeQueue.entries.nodes[0]!.id = "test-read-token";
    page.data.repository.mergeQueue.entries.nodes[0]!.headCommit = { oid: "" };
    Object.assign(page, { headers: { Authorization: "Bearer test-read-token" }, unexpected: "not-for-logs" });
    const receipts: unknown[] = [];
    await assert.rejects(evidenceFor([page], receipt => receipts.push(receipt)).mergeQueue(), /E_EVIDENCE/);
    assert.equal(receipts.length, 1);
    const serialized = JSON.stringify(receipts[0]);
    assert.ok(serialized.includes("[REDACTED]"));
    assert.ok(!serialized.includes("test-read-token"));
    assert.ok(!serialized.includes("Authorization"));
    assert.ok(!serialized.includes("not-for-logs"));
  });
  it("returns complete typed queue evidence from a fixed read-only query", async () => assert.deepEqual(await evidenceFor([graphqlPage()]).mergeQueue(), { totalCount: 1, entries: [entry] }));
  it("reads complete paginated evidence", async () => {
    const second = { ...entry, id: "second", position: 2, pullRequest: 201 };
    assert.deepEqual(await evidenceFor([graphqlPage([entry], 2, true, "page-1"), graphqlPage([second], 2)]).mergeQueue(), { totalCount: 2, entries: [entry, second] });
  });
  const malformed = [null, { errors: [{ message: "denied" }], ...graphqlPage() }, { data: { repository: null } }, { ...graphqlPage(), data: { ...graphqlPage().data, rateLimit: { remaining: 0 } } }, graphqlPage([], 1), graphqlPage([entry, entry], 2), graphqlPage([entry], 1, true, null), { data: { repository: { mergeQueue: { entries: { totalCount: 1, pageInfo: { hasNextPage: false, endCursor: null }, nodes: [null] } } }, rateLimit: { remaining: 100 } } }];
  for (const body of malformed) {
    it("rejects missing, partial, duplicate or exhausted evidence", async () => assert.rejects(evidenceFor([body]).mergeQueue(), /E_EVIDENCE/));
  }
  it("rejects changing pagination counts", async () => assert.rejects(evidenceFor([graphqlPage([entry], 2, true, "page-1"), graphqlPage([], 3)]).mergeQueue(), /E_EVIDENCE/));
  for (const kind of ["transport", "permission", "oversize", "timeout"] as const) {
    it(`rejects ${kind} without exposing credentials`, async () => {
      const token = "queue-sentinel-secret";
      const fetchImpl = (async (url: string | URL | Request) => {
        if (!String(url).endsWith("/graphql")) { return new Response(JSON.stringify({ id: repository.id, full_name: repository.fullName })); }
        if (kind === "transport") { throw new Error(token); }
        if (kind === "timeout") { throw new DOMException(token, "TimeoutError"); }
        if (kind === "permission") { return new Response(token, { status: 403 }); }
        return new Response(new Uint8Array(8 * 1024 * 1024 + 1));
      }) as typeof fetch;
      await assert.rejects(adapter.createGitHubEvidence({ repository, token, fetchImpl }).mergeQueue(), error => error instanceof Error && /^E_EVIDENCE:/.test(error.message) && !error.message.includes(token));
    });
  }
  it("reads exact fixed refs and rejects arbitrary refs", async () => {
    const fetchImpl = (async (url: string | URL | Request) => String(url).endsWith("/git/ref/heads/main") ? new Response(JSON.stringify({ ref: "refs/heads/main", object: { type: "commit", sha: base } })) : new Response(JSON.stringify({ id: repository.id, full_name: repository.fullName }))) as typeof fetch;
    const evidence = adapter.createGitHubEvidence({ repository, token: "test", fetchImpl });
    assert.equal(await evidence.gitRef("refs/heads/main"), base);
    await assert.rejects(evidence.gitRef("refs/heads/feature/arbitrary"), /E_EVIDENCE/);
  });
});
