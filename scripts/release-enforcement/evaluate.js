"use strict";

const { fail, readEntries } = require("./git.js");
const { snapshot, isPolicyOnlyChange, isAuthorityPath } = require("./snapshot.js");
const { loadPolicy, validateLedger, findApproval, validateApproval, validateMaintenance, validateState } = require("./records.js");
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
    validateLedger(loadPolicy(repo, pr.base.sha), loadPolicy(repo, pr.head.sha));
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
    if (source.minor % 2 !== 1 || next.major !== source.major || next.minor !== source.minor + 1 ||
      approval.source.branch !== `prerelease/${source.major}.${source.minor}.x`) {
      fail("E_VERSION", "Promotion must use the next even minor after its published prerelease cutoff");
    }
  }
  validateApproval(repo, approval, pr.base.sha, pr.head.sha);
  await github.publishedSource(approval.source);
  if (route === "promotion") { await validateMaintenance(repo, policy, approval, github, pr.base.sha); }
  return { ...result, route, approvalId: approval.id };
}

module.exports = { evaluatePullRequest, exactApproval };
