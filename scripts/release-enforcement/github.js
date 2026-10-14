"use strict";

const { fail } = require("./git.js");
const { getChannel, parseVersion } = require("../release-policy.js");
const { validQueueRef } = require("./queue.js");
const QUEUE_QUERY = `query MainQueue($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) { mergeQueue(branch: "main") {
    entries(first: 100, after: $cursor) { totalCount pageInfo { hasNextPage endCursor }
      nodes { id position state baseCommit { oid } headCommit { oid } pullRequest { number } }
    }
  } }
  rateLimit { remaining }
}`;

/** Public GitHub evidence: bounded REST GET and one fixed read-only GraphQL query. */
function createGitHubEvidence({ repository, token, fetchImpl = fetch, onQueuePage }) {
  if (!Number.isSafeInteger(repository.id) || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository.fullName)) {
    fail("E_EVIDENCE", "Invalid repository identity");
  }
  const root = `https://api.github.com/repos/${repository.fullName}`;
  let identity;
  let requestCount = 0;
  async function get(route) {
    if (++requestCount > 2000 || (route && !route.startsWith("/")) || route.includes("\r") || route.includes("\n")) {
      fail("E_EVIDENCE", "Evidence request limit or invalid route");
    }
    const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (token) { headers.Authorization = `Bearer ${token}`; }
    try {
      const response = await fetchImpl(root + route, { method: "GET", redirect: "error", headers, signal: AbortSignal.timeout(15000) });
      if (!response.ok) { fail("E_EVIDENCE", `GitHub ${response.status} for ${route}; restore read access and rerun`); }
      if (!response.body) { fail("E_EVIDENCE", "Missing GitHub evidence body"); }
      const reader = response.body.getReader();
      const chunks = []; let length = 0;
      while (true) {
        const { value, done } = await reader.read();
        if (done) { break; }
        length += value.byteLength;
        if (length > 8 * 1024 * 1024) { await reader.cancel(); fail("E_EVIDENCE", "GitHub evidence exceeds response limit"); }
        chunks.push(Buffer.from(value));
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("E_EVIDENCE:")) { throw error; }
      // Transport errors may contain credentials/URLs. Do not echo them.
      fail("E_EVIDENCE", `Unavailable or malformed GitHub evidence for ${route}`);
    }
  }
  async function assertRepository() {
    identity ||= get("").then(data => {
      if (data.id !== repository.id || data.full_name?.toLowerCase() !== repository.fullName.toLowerCase()) { fail("E_EVIDENCE", "Repository identity changed"); }
    });
    await identity;
  }
  async function list(route, key) {
    const result = [];
    for (let page = 1; page <= 100; page++) {
      const data = await get(`${route}${route.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      const entries = key ? data[key] : data;
      if (!Array.isArray(entries)) { fail("E_EVIDENCE", "Malformed paginated evidence"); }
      result.push(...entries);
      if (entries.length < 100) {
        if (key && Number.isInteger(data.total_commits) && result.length !== data.total_commits) { fail("E_EVIDENCE", "Incomplete commit evidence"); }
        return result;
      }
    }
    fail("E_EVIDENCE", "Pagination limit exceeded; evidence must be complete");
  }
  async function pullRequest(number) {
    await assertRepository();
    if (!Number.isSafeInteger(number) || number < 1) { fail("E_EVIDENCE", "Invalid pull request identity"); }
    const data = await get(`/pulls/${number}`);
    if (data.number !== number || data.base?.repo?.id !== repository.id || !data.head?.repo) { fail("E_EVIDENCE", "Unexpected PR repository identity"); }
    return { number, state: data.state, merged: data.merged, mergeCommit: data.merge_commit_sha,
      head: { sha: data.head.sha, ref: data.head.ref, repositoryId: data.head.repo.id },
      base: { sha: data.base.sha, ref: data.base.ref, repositoryId: data.base.repo.id } };
  }
  async function publishedSource(source, { historical = false } = {}) {
    await assertRepository();
    if (!/^v\d+\.\d+\.\d+$/.test(source.tag) || !/^[a-f0-9]{40}$/.test(source.commit) ||
      !/^(main|prerelease\/\d+\.\d+\.x)$/.test(source.branch) || !Number.isSafeInteger(source.releaseId) || !Number.isSafeInteger(source.publishRunId)) {
      fail("E_EVIDENCE", "Invalid published source identity");
    }
    const version = source.tag.slice(1);
    const parsed = parseVersion(version);
    const channel = getChannel(version);
    const branch = channel === "stable" ? "main" : `prerelease/${parsed.major}.${parsed.minor}.x`;
    if (source.branch !== branch) { fail("E_EVIDENCE", "Published source branch/channel mismatch"); }
    let object = (await get(`/git/ref/tags/${encodeURIComponent(source.tag)}`)).object;
    for (let depth = 0; object?.type === "tag" && depth < 5; depth++) {
      if (!/^[a-f0-9]{40}$/.test(object.sha)) { fail("E_EVIDENCE", "Malformed tag object"); }
      object = (await get(`/git/tags/${object.sha}`)).object;
    }
    if (object?.type !== "commit" || object.sha !== source.commit) { fail("E_EVIDENCE", "Source tag moved or no longer resolves to its approved cutoff"); }
    const release = await get(`/releases/${source.releaseId}`);
    if (release.id !== source.releaseId || release.tag_name !== source.tag || release.draft !== false ||
      release.prerelease !== (channel === "prerelease") || !release.published_at) { fail("E_EVIDENCE", "Expected exact published release/channel"); }
    const run = await get(`/actions/runs/${source.publishRunId}`);
    if (run.id !== source.publishRunId || run.repository?.id !== repository.id || run.head_sha !== source.commit ||
      run.head_branch !== source.tag || run.path !== ".github/workflows/publish.yml" ||
      !["push", "workflow_dispatch"].includes(run.event) || run.status !== "completed" || run.conclusion !== "success") {
      fail("E_EVIDENCE", "Expected successful Publish workflow for the exact source SHA");
    }
    if (run.event === "workflow_dispatch") {
      const jobs = await list(`/actions/runs/${source.publishRunId}/jobs?filter=latest`, "jobs");
      const marker = `Validated source ${source.tag} at ${source.commit}`;
      if (!jobs.some(job => job.run_id === source.publishRunId && job.head_sha === source.commit &&
        job.status === "completed" && job.conclusion === "success" &&
        job.steps?.some(step => step.name === marker && step.conclusion === "success"))) {
        fail("E_EVIDENCE", "Manual Publish needs the exact successful validated-source step; dispatch on the tag with matching input");
      }
    }
    // Historical callers first prove exact previously published target evidence.
    if (!historical) {
      const comparison = await get(`/compare/${source.commit}...${encodeURIComponent(source.branch)}?per_page=100&page=1`);
      if (!["ahead", "identical"].includes(comparison.status)) { fail("E_EVIDENCE", "Cutoff is not contained in its authorized branch"); }
    }
  }
  async function mergedForwardPort(disposition) {
    await assertRepository();
    const pr = await get(`/pulls/${disposition.pullRequest}`);
    if (pr.number !== disposition.pullRequest || pr.merged !== true || !pr.merged_at || pr.state !== "closed" ||
      pr.merge_commit_sha !== disposition.mergeCommit || pr.base?.repo?.id !== repository.id ||
      !/^prerelease\/\d+\.\d+\.x$/.test(pr.base.ref)) {
      fail("E_EVIDENCE", `Disposition ${disposition.id} needs the exact merged prerelease PR`);
    }
  }
  async function maintenanceBetween(base, head, productCommits) {
    await assertRepository();
    if (![base, head].every(value => /^[a-f0-9]{40}$/.test(value))) { fail("E_EVIDENCE", "Invalid maintenance commit identity"); }
    if (base === head) { return []; }
    const commits = await list(`/compare/${base}...${head}`, "commits");
    const all = new Set(commits.map(value => value.sha));
    if (productCommits !== undefined && (!Array.isArray(productCommits) || productCommits.some(commit => !all.has(commit)))) {
      fail("E_EVIDENCE", "Product maintenance commits must belong to the verified comparison");
    }
    const merges = new Map();
    for (const commit of new Set(productCommits === undefined ? all : productCommits)) {
      if (!/^[a-f0-9]{40}$/.test(commit)) { fail("E_EVIDENCE", "Malformed comparison commit"); }
      const prs = await list(`/commits/${commit}/pulls`);
      for (const pr of prs) {
        const match = /^hotfix\/(\d+\.\d+\.\d+)$/.exec(pr.head?.ref || "");
        if (match && pr.state === "closed" && pr.merged_at && pr.merge_commit_sha === commit && pr.base?.ref === "main" &&
          pr.base.repo?.id === repository.id && pr.head.repo?.id === repository.id) {
          merges.set(pr.number, { pullRequest: pr.number, mergeCommit: commit, headRef: pr.head.ref, version: match[1] });
        }
      }
    }
    return [...merges.values()];
  }
  async function issue(number) {
    await assertRepository();
    if (!Number.isSafeInteger(number) || number < 1) { fail("E_EVIDENCE", "Invalid issue reference"); }
    const data = await get(`/issues/${number}`);
    if (data.number !== number || data.pull_request || !["open", "closed"].includes(data.state)) { fail("E_EVIDENCE", "Approval reference must identify an existing issue"); }
  }
  async function queuePage(cursor, deadline) {
    if (++requestCount > 2000 || Date.now() >= deadline) { fail("E_EVIDENCE", "Queue evidence request/time budget exhausted"); }
    const [owner, name] = repository.fullName.split("/");
    const headers = { Accept: "application/vnd.github+json", "Content-Type": "application/json" };
    if (token) { headers.Authorization = `Bearer ${token}`; }
    const signal = AbortSignal.timeout(Math.min(15000, Math.max(1, deadline - Date.now())));
    try {
      const response = await fetchImpl("https://api.github.com/graphql", { method: "POST", redirect: "error", headers, signal,
        body: JSON.stringify({ query: QUEUE_QUERY, variables: { owner, name, cursor } }) });
      if (!response.ok || !response.body) { fail("E_EVIDENCE", "Queue evidence unavailable; restore read access and retry"); }
      const reader = response.body.getReader();
      const chunks = []; let length = 0;
      try {
        while (true) {
          signal.throwIfAborted();
          const { value, done } = await reader.read();
          if (done) { break; }
          length += value.byteLength;
          if (length > 8 * 1024 * 1024 || Date.now() >= deadline) { fail("E_EVIDENCE", "Queue evidence response/time limit exceeded"); }
          chunks.push(Buffer.from(value));
        }
      } finally { await reader.cancel().catch(() => {}); }
      signal.throwIfAborted();
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!body || body.errors !== undefined || !Number.isSafeInteger(body.data?.rateLimit?.remaining) || body.data.rateLimit.remaining <= 0) {
        fail("E_EVIDENCE", "Incomplete queue evidence or exhausted read budget");
      }
      const data = body.data.repository?.mergeQueue?.entries;
      if (onQueuePage) {
        // Keep only fixed-query public fields; never retain headers or transport data.
        // Scalar projection also prevents unexpected response objects entering logs.
        const scalar = value => ["string", "number", "boolean"].includes(typeof value) ? value : null;
        const receipt = { request: { query: QUEUE_QUERY, variables: { owner, name, cursor } },
          response: { data: { repository: { mergeQueue: { entries: data ? {
            totalCount: scalar(data.totalCount),
            pageInfo: { hasNextPage: scalar(data.pageInfo?.hasNextPage), endCursor: scalar(data.pageInfo?.endCursor) },
            nodes: Array.isArray(data.nodes) ? data.nodes.map(node => node ? {
              id: scalar(node.id), position: scalar(node.position), state: scalar(node.state),
              baseCommit: node.baseCommit ? { oid: scalar(node.baseCommit.oid) } : null,
              headCommit: node.headCommit ? { oid: scalar(node.headCommit.oid) } : null,
              pullRequest: node.pullRequest ? { number: scalar(node.pullRequest.number) } : null
            } : null) : null
          } : null } }, rateLimit: { remaining: body.data.rateLimit.remaining } } } };
        onQueuePage(JSON.parse(JSON.stringify(receipt, (_key, value) =>
          typeof value === "string" && token ? value.split(token).join("[REDACTED]") : value)));
      }
      return data;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("E_EVIDENCE:") && !error.message.includes(token || "\0")) { throw error; }
      fail("E_EVIDENCE", "Unavailable or malformed queue evidence");
    }
  }
  async function mergeQueue() {
    await assertRepository();
    const deadline = Date.now() + 60000;
    const entries = [], ids = new Set(), numbers = new Set(), positions = new Set(), cursors = new Set();
    let cursor = null, totalCount;
    for (let page = 0; page < 10; page++) {
      const data = await queuePage(cursor, deadline);
      if (!Number.isSafeInteger(data?.totalCount) || data.totalCount < 0 || data.totalCount > 1000 ||
        (totalCount !== undefined && totalCount !== data.totalCount) || !Array.isArray(data.nodes) || data.nodes.length > 100 ||
        typeof data.pageInfo?.hasNextPage !== "boolean") { fail("E_EVIDENCE", "Malformed or changing queue pagination"); }
      totalCount = data.totalCount;
      for (const node of data.nodes) {
        if (typeof node?.id !== "string" || !node.id || node.id.length > 1024 || !Number.isSafeInteger(node.position) || node.position < 1 ||
          !["AWAITING_CHECKS", "LOCKED", "MERGEABLE", "QUEUED", "UNMERGEABLE"].includes(node.state) ||
          !Number.isSafeInteger(node.pullRequest?.number) || node.pullRequest.number < 1 ||
          !/^[a-f0-9]{40}$/.test(node.baseCommit?.oid || "") || !/^[a-f0-9]{40}$/.test(node.headCommit?.oid || "") ||
          ids.has(node.id) || numbers.has(node.pullRequest.number) || positions.has(node.position)) { fail("E_EVIDENCE", "Incomplete or duplicate queue identity"); }
        ids.add(node.id); numbers.add(node.pullRequest.number); positions.add(node.position);
        entries.push({ id: node.id, position: node.position, state: node.state, pullRequest: node.pullRequest.number,
          baseCommit: node.baseCommit.oid, headCommit: node.headCommit.oid });
      }
      if (entries.length > totalCount) { fail("E_EVIDENCE", "Queue count inconsistent"); }
      if (!data.pageInfo.hasNextPage) {
        if (entries.length !== totalCount) { fail("E_EVIDENCE", "Incomplete queue snapshot"); }
        return { totalCount, entries };
      }
      cursor = data.pageInfo.endCursor;
      if (typeof cursor !== "string" || !cursor || cursor.length > 1024 || cursors.has(cursor) || data.nodes.length === 0) { fail("E_EVIDENCE", "Non-advancing queue cursor"); }
      cursors.add(cursor);
    }
    fail("E_EVIDENCE", "Queue pagination limit exceeded");
  }
  async function gitRef(ref) {
    if (ref !== "refs/heads/main" && !validQueueRef(ref)) { fail("E_EVIDENCE", "Invalid queue evidence ref"); }
    await assertRepository();
    const data = await get(`/git/ref/${ref.slice(5).split("/").map(encodeURIComponent).join("/")}`);
    if (data.ref !== ref || data.object?.type !== "commit" || !/^[a-f0-9]{40}$/.test(data.object.sha || "")) { fail("E_EVIDENCE", "Live Git ref identity mismatch"); }
    return data.object.sha;
  }
  return { issue, pullRequest, publishedSource, mergedForwardPort, maintenanceBetween, mergeQueue, gitRef };
}

module.exports = { createGitHubEvidence };
