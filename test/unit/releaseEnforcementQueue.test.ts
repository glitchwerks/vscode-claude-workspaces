import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import type { QueueEvent, QueueEntry, QueueSnapshot, PullRequestIdentity, PolicyConfig, GitHubEvidence } from "../../scripts/release-enforcement/contracts";
import { missingModule } from "./helpers/releasePolicyFixture";

const queue = missingModule<{
  parseQueueEvent(event: unknown, runner: { eventName: string; sha: string; ref: string }, repository: PolicyConfig["repository"]): QueueEvent;
  correlateQueue(input: { repository: PolicyConfig["repository"]; event: QueueEvent; queue: QueueSnapshot; pr: PullRequestIdentity; mainCommit: string; headCommit: string }): QueueEntry;
}>("scripts/release-enforcement/queue.js", createRequire(__filename));
const adapter = createRequire(__filename)(path.resolve("scripts/release-enforcement/github.js")) as {
  createGitHubEvidence(options: { repository: { id: number; fullName: string }; token: string; fetchImpl: typeof fetch }): GitHubEvidence };
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

function graphqlPage(nodes: QueueEntry[] = [entry], totalCount = nodes.length, hasNextPage = false, endCursor: string | null = null) {
  return { data: { repository: { mergeQueue: { entries: { totalCount, pageInfo: { hasNextPage, endCursor }, nodes: nodes.map(e => ({ ...e, baseCommit: { oid: e.baseCommit }, headCommit: { oid: e.headCommit }, pullRequest: { number: e.pullRequest } })) } } }, rateLimit: { remaining: 100 } } };
}
function evidenceFor(pages: unknown[]) {
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
  return adapter.createGitHubEvidence({ repository, token: "test-read-token", fetchImpl });
}
describe("bounded authenticated queue reads", () => {
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
