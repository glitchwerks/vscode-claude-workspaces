"use strict";

const { git, fail, readEntries, readBlob, resolveCommit, isAncestor } = require("./git.js");
const { snapshot, diffScope, canonical, digest } = require("./snapshot.js");

const sha = /^[a-f0-9]{40}$/;
const hash = /^[a-f0-9]{64}$/;
const version = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const idPattern = /^[a-zA-Z0-9][a-zA-Z0-9.-]{0,119}$/;
function requireValue(condition, detail) { if (!condition) { fail("E_SCHEMA", detail); } }
function fields(object, required, optional = []) {
  requireValue(object && typeof object === "object" && !Array.isArray(object), "Expected record object");
  requireValue(required.every(key => Object.hasOwn(object, key)), "Missing required record field");
  requireValue(Object.keys(object).every(key => required.includes(key) || optional.includes(key)), "Unexpected record field");
}
function integer(value) { return Number.isSafeInteger(value) && value > 0; }
function entry(value) {
  if (value === null) { return; }
  fields(value, ["path", "mode", "contentDigest"]);
  requireValue(typeof value.path === "string" && value.path.length > 0 && !value.path.includes("\0"), "Invalid entry path");
  requireValue(typeof value.mode === "string" && typeof value.contentDigest === "string" && /^(100644|100755|120000)$/.test(value.mode) && hash.test(value.contentDigest), "Invalid entry identity");
}
function validateConfig(config) {
  fields(config, ["schemaVersion", "repository", "activePrerelease"]);
  fields(config.repository, ["id", "fullName", "defaultBranch"]);
  requireValue(typeof config.repository.fullName === "string" && typeof config.activePrerelease === "string", "Repository and active line must be strings");
  requireValue(config.schemaVersion === 1 && integer(config.repository.id) &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository.fullName) && config.repository.defaultBranch === "main", "Invalid repository identity");
  const line = /^prerelease\/(\d+)\.(\d+)\.x$/.exec(config.activePrerelease);
  requireValue(line && Number(line[2]) % 2 === 1, "Active line must be odd-minor prerelease/MAJOR.MINOR.x");
}
function validateRecord(record) {
  fields(record, ["schemaVersion", "id", "kind", "mode", "targetVersion", "issue", "source", "baseline", "productDigest", "changeDigest", "changes", "sourceCommits", "sourcePullRequests", "rationale"], ["candidatePullRequest", "releaseCommit", "supersedes"]);
  fields(record.source, ["tag", "commit", "branch", "releaseId", "publishRunId"]);
  fields(record.baseline, ["tag", "commit", "productDigest"]);
  for (const key of ["id", "kind", "mode", "targetVersion", "productDigest", "changeDigest"]) {
    requireValue(typeof record[key] === "string", `Approval ${key} must be a string`);
  }
  requireValue([record.source.tag, record.source.commit, record.source.branch, record.baseline.tag,
    record.baseline.commit, record.baseline.productDigest].every(value => typeof value === "string"), "Source and baseline identities must be strings");
  requireValue(record.schemaVersion === 1 && idPattern.test(record.id) && integer(record.issue), "Invalid approval identity");
  requireValue(["promotion", "hotfix", "historical"].includes(record.kind) && ["full", "selective", "compatibility"].includes(record.mode) && version.test(record.targetVersion), "Invalid approval kind/version");
  requireValue(/^v\d+\.\d+\.\d+$/.test(record.source.tag) && sha.test(record.source.commit) &&
    /^(main|prerelease\/\d+\.\d+\.x)$/.test(record.source.branch) && integer(record.source.releaseId) && integer(record.source.publishRunId), "Invalid publication source");
  requireValue(/^v\d+\.\d+\.\d+$/.test(record.baseline.tag) && sha.test(record.baseline.commit) && hash.test(record.baseline.productDigest), "Invalid stable baseline");
  requireValue(hash.test(record.productDigest) && hash.test(record.changeDigest), "Malformed fingerprint");
  requireValue(typeof record.rationale === "string" && record.rationale.trim().length > 0 && record.rationale.length <= 10000, "Missing rationale");
  requireValue(Array.isArray(record.changes) && Array.isArray(record.sourceCommits) && Array.isArray(record.sourcePullRequests), "Expected scope arrays");
  requireValue(record.sourceCommits.every(value => typeof value === "string" && sha.test(value)) && record.sourcePullRequests.every(integer), "Invalid source references");
  requireValue(new Set(record.sourceCommits).size === record.sourceCommits.length && new Set(record.sourcePullRequests).size === record.sourcePullRequests.length, "Duplicate source references");
  requireValue(record.candidatePullRequest === undefined || integer(record.candidatePullRequest), "Invalid candidate PR");
  requireValue(record.releaseCommit === undefined || sha.test(record.releaseCommit), "Invalid historical commit");
  requireValue(record.kind !== "historical" || record.releaseCommit !== undefined, "Historical approval needs exact release commit");
  requireValue(record.supersedes === undefined || (typeof record.supersedes === "string" && idPattern.test(record.supersedes)), "Invalid supersession");
  const paths = new Set();
  for (const change of record.changes) {
    fields(change, ["path", "oldEntry", "newEntry"]);
    entry(change.oldEntry); entry(change.newEntry);
    requireValue(!paths.has(change.path) && (change.oldEntry || change.newEntry) &&
      [change.oldEntry, change.newEntry].every(value => value === null || value.path === change.path), "Invalid changed entry");
    paths.add(change.path);
  }
  requireValue(record.changeDigest === digest(JSON.stringify(record.changes)), "Scope fingerprint does not match exact entries");
}
function validateDisposition(record) {
  fields(record, ["schemaVersion", "id", "approvalId", "kind", "pullRequest", "mergeCommit", "issue", "rationale"]);
  requireValue([record.id, record.approvalId, record.kind, record.mergeCommit].every(value => typeof value === "string"), "Disposition identities must be strings");
  requireValue(record.schemaVersion === 1 && idPattern.test(record.id) && idPattern.test(record.approvalId) &&
    ["forward-port", "superseded-fix"].includes(record.kind) && integer(record.pullRequest) && integer(record.issue) &&
    sha.test(record.mergeCommit) && typeof record.rationale === "string" && record.rationale.trim().length > 0, "Invalid forward-port disposition");
}
function validateState(state) {
  validateConfig(state.config);
  requireValue(sha.test(state.authorityCommit) && Array.isArray(state.approvals) && Array.isArray(state.dispositions), "Invalid policy state");
  const approvals = new Map();
  for (const record of state.approvals) {
    validateRecord(record);
    requireValue(!approvals.has(record.id), "Duplicate approval ID");
    approvals.set(record.id, record);
  }
  const superseded = new Set();
  for (const record of state.approvals) {
    if (!record.supersedes) { continue; }
    const previous = approvals.get(record.supersedes);
    requireValue(previous && previous.targetVersion === record.targetVersion && !superseded.has(previous.id), "Invalid or ambiguous supersession");
    superseded.add(previous.id);
    const chain = new Set([record.id]);
    let current = record;
    while (current.supersedes) {
      requireValue(!chain.has(current.supersedes), "Supersession cycle");
      chain.add(current.supersedes); current = approvals.get(current.supersedes);
    }
  }
  const targets = new Set();
  for (const record of state.approvals.filter(value => !superseded.has(value.id))) {
    requireValue(!targets.has(record.targetVersion), "Multiple active approvals for target version"); targets.add(record.targetVersion);
  }
  const dispositions = new Set();
  for (const record of state.dispositions) {
    validateDisposition(record);
    requireValue(approvals.has(record.approvalId) && !dispositions.has(record.id), "Unknown approval or duplicate disposition");
    dispositions.add(record.id);
  }
}
function loadPolicy(repo, authorityCommit) {
  const commit = resolveCommit(repo, authorityCommit);
  const entries = readEntries(repo, commit).filter(e => e.path.startsWith(".github/release-policy/"));
  function read(entry) {
    requireValue(entry?.mode === "100644", "Policy records must be regular files");
    try { return JSON.parse(readBlob(repo, entry.oid).toString("utf8")); }
    catch { fail("E_SCHEMA", `Invalid policy JSON ${entry.path}`); }
  }
  const config = read(entries.find(e => e.path === ".github/release-policy/config.json"));
  const approvals = []; const dispositions = [];
  for (const entry of entries) {
    if (entry.path === ".github/release-policy/config.json") { continue; }
    requireValue(/^\.github\/release-policy\/(approvals|forward-ports)\/[A-Za-z0-9.-]+\.json$/.test(entry.path), `Unregistered policy record ${entry.path}`);
    (entry.path.includes("/approvals/") ? approvals : dispositions).push(read(entry));
  }
  const result = { config, authorityCommit: commit, approvals, dispositions };
  validateState(result); return result;
}
function validateLedger(previous, next) {
  validateState(previous); validateState(next);
  requireValue(previous.config.repository.id === next.config.repository.id && previous.config.repository.fullName === next.config.repository.fullName, "Repository authority cannot change");
  for (const key of ["approvals", "dispositions"]) {
    for (const old of previous[key]) {
      const newer = next[key].find(record => record.id === old.id);
      if (!newer || JSON.stringify(canonical(old)) !== JSON.stringify(canonical(newer))) {
        fail("E_LEDGER", `Record ${old.id} is immutable; append an explicit replacement`);
      }
    }
  }
}
function findApproval(state, targetVersion, productDigest) {
  validateState(state);
  const superseded = new Set(state.approvals.map(record => record.supersedes).filter(Boolean));
  const record = state.approvals.find(value => value.targetVersion === targetVersion && value.productDigest === productDigest && !superseded.has(value.id));
  if (!record) { fail("E_APPROVAL", `No active exact scope approval for ${targetVersion}; merge a separate policy approval PR`); }
  return record;
}
function buildApproval(repo, input) {
  const base = snapshot(repo, resolveCommit(repo, `refs/tags/${input.baselineTag}`));
  const candidate = snapshot(repo, input.candidateCommit);
  const source = snapshot(repo, input.source.commit);
  if (resolveCommit(repo, `refs/tags/${input.source.tag}`) !== source.commit) { fail("E_SOURCE", "Source tag has moved"); }
  if (input.mode === "selective" && (input.sourceCommits.length === 0 || input.sourcePullRequests.length === 0)) {
    fail("E_SELECTION", "Selective approval requires ordered source commits and PRs");
  }
  for (let i = 0; i < input.sourceCommits.length; i++) {
    if (!isAncestor(repo, input.sourceCommits[i], source.commit) || (i > 0 && !isAncestor(repo, input.sourceCommits[i - 1], input.sourceCommits[i]))) {
      fail("E_SELECTION", "Selected commits must be ordered ancestors of the published cutoff");
    }
  }
  if (input.kind !== "hotfix" && input.mode === "full" && candidate.productDigest !== source.productDigest) {
    fail("E_SCOPE_CHANGED", "Full promotion must reproduce the published cutoff");
  }
  const scope = diffScope(repo, base.commit, candidate.commit);
  const record = { schemaVersion: 1, kind: input.kind, mode: input.mode, targetVersion: input.targetVersion,
    issue: input.issue, source: input.source, baseline: { tag: input.baselineTag, commit: base.commit, productDigest: base.productDigest },
    productDigest: candidate.productDigest, ...scope, sourceCommits: input.sourceCommits, sourcePullRequests: input.sourcePullRequests, rationale: input.rationale };
  if (input.candidatePullRequest !== undefined) { record.candidatePullRequest = input.candidatePullRequest; }
  if (input.supersedes !== undefined) { record.supersedes = input.supersedes; }
  if (input.kind === "historical") { record.releaseCommit = candidate.commit; }
  record.id = `approval-${record.targetVersion}-${digest(JSON.stringify(canonical(record))).slice(0, 20)}`;
  validateRecord(record); return record;
}
function validateApproval(repo, approval, base, head) {
  validateRecord(approval);
  const baseline = snapshot(repo, base);
  if (baseline.productDigest !== approval.baseline.productDigest) { fail("E_BASELINE_CHANGED", "Main product changed; refresh approval against current stable baseline"); }
  if (resolveCommit(repo, `refs/tags/${approval.baseline.tag}`) !== approval.baseline.commit ||
    snapshot(repo, approval.baseline.commit).productDigest !== approval.baseline.productDigest) { fail("E_BASELINE_CHANGED", "Recorded baseline tag/identity has changed"); }
  const candidate = snapshot(repo, head);
  const scope = diffScope(repo, base, head);
  if (candidate.productDigest !== approval.productDigest || scope.changeDigest !== approval.changeDigest) {
    fail("E_SCOPE_CHANGED", "Candidate product or supporting tests differ from approved exact changes");
  }
  if (resolveCommit(repo, `refs/tags/${approval.source.tag}`) !== approval.source.commit) { fail("E_SOURCE", "Published cutoff tag has moved"); }
  if (approval.kind !== "hotfix" && approval.mode === "full" && snapshot(repo, approval.source.commit).productDigest !== candidate.productDigest) {
    fail("E_SCOPE_CHANGED", "Candidate differs from full published cutoff");
  }
  for (const selected of approval.sourceCommits) {
    if (!isAncestor(repo, selected, approval.source.commit)) { fail("E_SELECTION", "Selected commit is beyond published cutoff"); }
  }
}
/** Include already-tagged fixes on this stable line as well as changes after the baseline. */
async function validateMaintenance(repo, state, approval, github, mainCommit = state.authorityCommit) {
  const main = resolveCommit(repo, mainCommit);
  const line = snapshot(repo, approval.baseline.commit).version.split(".").slice(0, 2).join(".");
  let earliest = approval.baseline.commit;
  for (const fix of state.approvals.filter(value => value.kind === "hotfix" && value.targetVersion.startsWith(`${line}.`))) {
    if (isAncestor(repo, fix.baseline.commit, earliest)) { earliest = fix.baseline.commit; }
  }
  if (!isAncestor(repo, earliest, main)) { fail("E_MAINTENANCE", "Stable baseline is not in main history"); }
  const merges = await github.maintenanceBetween(earliest, main);
  const commits = git(repo, ["rev-list", "--first-parent", "--reverse", `${earliest}..${main}`]).toString("ascii").trim().split("\n").filter(Boolean);
  for (const commit of commits) {
    const parent = resolveCommit(repo, `${commit}^`);
    if (diffScope(repo, parent, commit).changes.length === 0) { continue; }
    const merge = merges.find(value => value.mergeCommit === commit);
    const fixes = state.approvals.filter(value => value.kind === "hotfix" && value.candidatePullRequest === merge?.pullRequest && value.targetVersion === merge?.version);
    let fix;
    for (const candidate of fixes) {
      try { validateApproval(repo, candidate, parent, commit); fix = candidate; break; }
      catch { /* Superseded scopes do not authorize this merge. */ }
    }
    if (!fix) { fail("E_MAINTENANCE", `Unregistered intervening stable change ${commit}`); }
    const disposition = state.dispositions.find(value => value.approvalId === fix.id);
    if (!disposition) { fail("E_FORWARD_PORT", `Stable fix ${fix.id} needs a merged forward-port or approved disposition`); }
    await github.mergedForwardPort(disposition);
    if (!isAncestor(repo, disposition.mergeCommit, approval.source.commit)) {
      fail("E_FORWARD_PORT", `Disposition ${disposition.id} is absent from published cutoff`);
    }
  }
}

module.exports = { loadPolicy, validateLedger, findApproval, buildApproval, validateApproval, validateMaintenance, validateState, validateRecord, validateDisposition };
