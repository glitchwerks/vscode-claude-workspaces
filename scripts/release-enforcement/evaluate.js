"use strict";

const { fail, readEntries, resolveCommit } = require("./git.js");
const { snapshot, isPolicyOnlyChange, isAuthorityPath } = require("./snapshot.js");
const { loadPolicy, validateLedger, findApproval, validateApproval, validateMaintenance, validateState, verifySelection } = require("./records.js");
const { parseVersion, getChannel, getExpectedSourceBranch, validateReleaseCandidateBranch } = require("../release-policy.js");

function checkIdentity(pr, config) {
  if (pr.state !== "open" || !Number.isSafeInteger(pr.number) || pr.number <= 0 ||
    ![pr.head?.sha, pr.base?.sha].every(value => /^[a-f0-9]{40}$/.test(value)) || pr.base.repositoryId !== config.repository.id) {
    fail("E_ROUTE", "Expected live open PR in the configured repository");
  }
}
function assertAuthorityChange(repo, base, head, policy, incomingBranch, sameRepository) {
  const before = new Map(readEntries(repo, base).map(e => [e.path, e]));
  const after = new Map(readEntries(repo, head).map(e => [e.path, e]));
  const trusted = new Map(readEntries(repo, policy.authorityCommit).map(e => [e.path, e]));
  for (const path of new Set([...before.keys(), ...after.keys()])) {
    if (!isAuthorityPath(path)) { continue; }
    const a = before.get(path); const b = after.get(path);
    if (a?.oid === b?.oid && a?.mode === b?.mode) { continue; }
    const approved = trusted.get(path);
    if (!sameRepository || !/^policy\/\d+-[A-Za-z0-9._/-]+$/.test(incomingBranch) || b?.oid !== approved?.oid || b?.mode !== approved?.mode) {
      fail("E_AUTHORITY", `${path} must be synchronized through a policy branch from trusted main`);
    }
  }
}
function exactApproval(policy, version, productDigest) {
  try { return findApproval(policy, version, productDigest); }
  catch (error) {
    if (policy.approvals.some(record => record.targetVersion === version)) { fail("E_SCOPE_CHANGED", "Candidate differs from approved product scope"); }
    throw error;
  }
}
async function evaluatePullRequest({ repositoryPath: repo, pr, policy, github }) {
  validateState(policy); checkIdentity(pr, policy.config);
  const candidate = snapshot(repo, pr.head.sha);
  const base = snapshot(repo, pr.base.sha);
  const result = { version: candidate.version, commit: candidate.commit, policyCommit: policy.authorityCommit };
  const sameRepository = pr.head.repositoryId === policy.config.repository.id;
  if (pr.base.ref === policy.config.activePrerelease) {
    if (getChannel(candidate.version) !== "prerelease" || getExpectedSourceBranch(candidate.version) !== pr.base.ref) {
      fail("E_VERSION", "Feature version must match the registered prerelease line");
    }
    assertAuthorityChange(repo, pr.base.sha, pr.head.sha, policy, pr.head.ref, sameRepository);
    return { ...result, route: "feature" };
  }
  if (pr.base.ref !== "main" || !sameRepository || getChannel(candidate.version) !== "stable") {
    fail("E_ROUTE", "Features target the active prerelease line; main accepts guarded policy, release, or hotfix branches");
  }
  if (/^policy\/\d+-[A-Za-z0-9._/-]+$/.test(pr.head.ref)) {
    if (candidate.version !== base.version || !isPolicyOnlyChange(repo, pr.base.sha, pr.head.sha)) {
      fail("E_POLICY_SCOPE", "Policy PR changes product/version/supporting tests; use the appropriate product route");
    }
    const previous = loadPolicy(repo, pr.base.sha);
    const next = loadPolicy(repo, pr.head.sha);
    validateLedger(previous, next);
    for (const record of next.approvals) {
      if (previous.approvals.some(existing => existing.id === record.id)) { continue; }
      await github.issue(record.issue);
      await github.publishedSource(record.source);
      await verifySelection(repo, record, github, policy.config.repository);
    }
    for (const record of next.dispositions) {
      if (previous.dispositions.some(existing => existing.id === record.id)) { continue; }
      await github.issue(record.issue);
      await github.mergedForwardPort(record);
    }
    return { ...result, route: "policy" };
  }
  let route;
  if (pr.head.ref.startsWith("release/")) {
    try { validateReleaseCandidateBranch(candidate.version, pr.head.ref); }
    catch { fail("E_ROUTE", "Candidate branch must match its stable version"); }
    route = "promotion";
  } else if (pr.head.ref === `hotfix/${candidate.version}`) { route = "hotfix"; }
  else { fail("E_ROUTE", "Unapproved incoming branch route to main"); }
  // Product routes cannot change the authority that will govern later PRs.
  assertAuthorityChange(repo, pr.base.sha, pr.head.sha, policy, pr.head.ref, sameRepository);
  const approval = exactApproval(policy, candidate.version, candidate.productDigest);
  if (approval.kind !== route || approval.candidatePullRequest !== pr.number) { fail("E_APPROVAL", "Approval must identify this candidate PR and route"); }
  const next = parseVersion(candidate.version);
  if (route === "hotfix") {
    const current = parseVersion(base.version);
    if (next.major !== current.major || next.minor !== current.minor || next.patch !== current.patch + 1 || approval.source.branch !== "main") {
      fail("E_VERSION", "Hotfix must increment the current stable patch");
    }
  } else {
    const source = parseVersion(approval.source.tag.slice(1));
    const current = parseVersion(base.version);
    if (source.minor % 2 !== 1 || next.major !== source.major || next.minor !== source.minor + 1 ||
      approval.source.branch !== policy.config.activePrerelease ||
      next.major < current.major || (next.major === current.major && next.minor <= current.minor)) {
      fail("E_VERSION", "Promotion must use the next even minor after its published prerelease cutoff");
    }
  }
  validateApproval(repo, approval, pr.base.sha, pr.head.sha);
  await github.publishedSource(approval.source);
  if (route === "promotion") { await validateMaintenance(repo, policy, approval, github, pr.base.sha); }
  return { ...result, route, approvalId: approval.id };
}

function assertPublishedAuthority(repo, commit, policy) {
  const candidate = new Map(readEntries(repo, commit).map(e => [e.path, e]));
  const trusted = new Map(readEntries(repo, policy.authorityCommit).map(e => [e.path, e]));
  for (const path of new Set([...candidate.keys(), ...trusted.keys()])) {
    if (!isAuthorityPath(path)) { continue; }
    const a = candidate.get(path); const b = trusted.get(path);
    if (a?.oid !== b?.oid || a?.mode !== b?.mode) { fail("E_AUTHORITY", `${path} differs from trusted main publication authority; synchronize policy first`); }
  }
}
async function evaluatePublication({ repositoryPath: repo, tag, commit, policy, github }) {
  validateState(policy);
  if (tag === "v0.8.0") { fail("E_WITHDRAWN", "v0.8.0 was withdrawn and is not an approved publication target"); }
  const candidate = snapshot(repo, commit);
  if (tag !== `v${candidate.version}` || resolveCommit(repo, `refs/tags/${tag}`) !== candidate.commit) { fail("E_TAG", "Publication tag/package/commit identity differs"); }
  const result = { version: candidate.version, commit: candidate.commit, policyCommit: policy.authorityCommit };
  const historical = policy.approvals.find(record => record.kind === "historical" && record.targetVersion === candidate.version);
  if (historical) {
    if (historical.releaseCommit !== candidate.commit) { fail("E_HISTORICAL", "Historical approval permits only its exact immutable tag/commit"); }
    validateApproval(repo, historical, historical.baseline.commit, commit);
    await github.publishedSource(historical.source);
    return { ...result, route: getChannel(candidate.version) === "stable" ? "promotion" : "feature", approvalId: historical.id };
  }
  if (getChannel(candidate.version) === "prerelease") {
    if (getExpectedSourceBranch(candidate.version) !== policy.config.activePrerelease) { fail("E_ROUTE", "Unknown prerelease publication line; register it on main first"); }
    assertPublishedAuthority(repo, commit, policy);
    return { ...result, route: "feature" };
  }
  const approval = exactApproval(policy, candidate.version, candidate.productDigest);
  if (!["promotion", "hotfix"].includes(approval.kind) || !approval.candidatePullRequest) { fail("E_APPROVAL", "Stable publication needs an approved candidate PR"); }
  validateApproval(repo, approval, approval.baseline.commit, commit);
  const merged = await github.pullRequest(approval.candidatePullRequest);
  const branch = approval.kind === "hotfix" ? `hotfix/${candidate.version}` : `release/${candidate.version}`;
  if (merged.state !== "closed" || merged.merged !== true || merged.mergeCommit !== candidate.commit ||
    merged.base.ref !== "main" || merged.base.repositoryId !== policy.config.repository.id ||
    merged.head.ref !== branch || merged.head.repositoryId !== policy.config.repository.id) {
    fail("E_MERGED_CANDIDATE", "Tag must identify the exact merged approved candidate PR on main");
  }
  const next = parseVersion(candidate.version);
  const source = parseVersion(approval.source.tag.slice(1));
  if (approval.kind === "promotion" && (source.minor % 2 !== 1 || next.major !== source.major || next.minor !== source.minor + 1)) {
    fail("E_VERSION", "Stable promotion must follow its published odd-minor cutoff");
  }
  if (approval.kind === "hotfix" && (next.major !== source.major || next.minor !== source.minor || next.patch !== source.patch + 1)) {
    fail("E_VERSION", "Stable maintenance must increment its approved baseline patch");
  }
  await github.publishedSource(approval.source);
  if (approval.kind === "promotion") {
    // Scope is already checked against the release tree; only preceding main
    // maintenance needs forward-port evidence, not this promotion itself.
    await validateMaintenance(repo, policy, approval, github, resolveCommit(repo, `${commit}^`));
  }
  return { ...result, route: approval.kind, approvalId: approval.id };
}

module.exports = { evaluatePullRequest, evaluatePublication, exactApproval };
