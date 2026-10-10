"use strict";

const { createHash } = require("node:crypto");
const { fail, resolveCommit, readEntries, readBlob } = require("./git.js");

const policyScripts = new Set([
  "scripts/release-policy.js", "scripts/release-metadata.js", "scripts/guard-channel.js",
  "scripts/extract-changelog.js", "scripts/validate-release-source.js",
  "scripts/check-release-pr.js", "scripts/prepare-release-approval.js"
]);
const policyTests = new Set([
  "test/unit/changelog.test.ts", "test/unit/guardChannel.test.ts", "test/unit/releaseMetadata.test.ts",
  "test/unit/releasePolicy.test.ts", "test/unit/validateReleaseSource.test.ts", "test/unit/releaseWorkflow.test.ts",
  "test/unit/helpers/releasePolicyFixture.ts"
]);
const policyWorkflows = new Set([".github/workflows/ci.yml", ".github/workflows/publish.yml", ".github/workflows/release-guard.yml"]);

function isPolicyPath(path) {
  return path === "README.md" || path === "CHANGELOG.md" || path.startsWith("docs/") ||
    path.startsWith(".github/release-policy/") || path.startsWith("scripts/release-enforcement/") ||
    policyScripts.has(path) || policyTests.has(path) || policyWorkflows.has(path) ||
    /^test\/unit\/releaseEnforcement[A-Za-z]+\.test\.ts$/.test(path);
}

function isAuthorityPath(path) {
  return path.startsWith(".github/release-policy/") || path.startsWith("scripts/release-enforcement/") ||
    policyScripts.has(path) || path === ".github/workflows/publish.yml" || path === ".github/workflows/release-guard.yml";
}

function canonical(value) {
  if (Array.isArray(value)) { return value.map(canonical); }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)))
      .map(key => [key, canonical(value[key])]));
  }
  return value;
}
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
function jsonBlob(repo, entry) {
  try { return JSON.parse(readBlob(repo, entry.oid).toString("utf8")); }
  catch { fail("E_MANIFEST", `Invalid JSON in ${entry.path}`); }
}

function entriesFor(repo, ref, { supportingTests = false, keepVersion = false } = {}) {
  const commit = resolveCommit(repo, ref);
  const raw = readEntries(repo, commit);
  const manifest = raw.find(e => e.path === "package.json");
  if (!manifest || manifest.mode !== "100644") { fail("E_MANIFEST", "package.json must be a regular file"); }
  const pkg = jsonBlob(repo, manifest);
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) { fail("E_VERSION", "Invalid package version"); }
  const entries = [];
  for (const entry of raw) {
    if (isPolicyPath(entry.path) || (!supportingTests && entry.path.startsWith("test/"))) { continue; }
    let content = readBlob(repo, entry.oid);
    if (entry.path === "package.json" || entry.path === "package-lock.json") {
      const object = jsonBlob(repo, entry);
      if (entry.path === "package-lock.json") {
        if (object.version !== pkg.version || (object.packages?.[""] && object.packages[""].version !== pkg.version)) {
          fail("E_ROOT_VERSION", "Lockfile root versions must match package.json");
        }
        if (!keepVersion) {
          delete object.version;
          if (object.packages?.[""]) { delete object.packages[""].version; }
        }
      } else {
        if (!keepVersion) { delete object.version; }
        if (object.scripts) {
          delete object.scripts["test:release-policy"];
          if (Object.keys(object.scripts).length === 0) { delete object.scripts; }
        }
      }
      content = Buffer.from(JSON.stringify(canonical(object)));
    }
    entries.push({ path: entry.path, mode: entry.mode, contentDigest: digest(content) });
  }
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  return { commit, version: pkg.version, entries };
}

function digestEntries(entries) {
  return digest(JSON.stringify(entries.map(e => [e.path, e.mode, e.contentDigest])));
}
function snapshot(repo, ref) {
  const result = entriesFor(repo, ref);
  return { ...result, productDigest: digestEntries(result.entries) };
}
function diffScope(repo, base, head) {
  const before = entriesFor(repo, base, { supportingTests: true }).entries;
  const after = entriesFor(repo, head, { supportingTests: true }).entries;
  const a = new Map(before.map(e => [e.path, e]));
  const b = new Map(after.map(e => [e.path, e]));
  const changes = [...new Set([...a.keys(), ...b.keys()])]
    .sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)))
    .filter(path => JSON.stringify(a.get(path)) !== JSON.stringify(b.get(path)))
    .map(path => ({ path, oldEntry: a.get(path) || null, newEntry: b.get(path) || null }));
  return { changes, changeDigest: digest(JSON.stringify(changes)) };
}
function isPolicyOnlyChange(repo, base, head) {
  const a = entriesFor(repo, base, { supportingTests: true, keepVersion: true });
  const b = entriesFor(repo, head, { supportingTests: true, keepVersion: true });
  return digestEntries(a.entries) === digestEntries(b.entries);
}

module.exports = { snapshot, diffScope, isPolicyOnlyChange, isPolicyPath, isAuthorityPath, canonical, digest };
