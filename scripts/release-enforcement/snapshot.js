"use strict";

const { createHash } = require("node:crypto");
const path = require("node:path");
const normalizedEntries = new Map();
const rawEntries = new Map();
const manifestObjects = new Map();
const blobDigests = new Map();
function remember(cache, key, value, limit = 128) {
  if (cache.size >= limit) { cache.delete(cache.keys().next().value); }
  cache.set(key, value); return value;
}
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
    policyScripts.has(path) || policyTests.has(path) || /^test\/unit\/releaseEnforcement[A-Za-z]+\.test\.ts$/.test(path) ||
    (path.startsWith("docs/") && !/\.(md|png|jpe?g|gif|svg|webp)$/i.test(path)) || path === ".github/workflows/publish.yml" || path === ".github/workflows/release-guard.yml";
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
  const key = `${path.resolve(repo)}:${entry.oid}`;
  try {
    const parsed = manifestObjects.get(key) || remember(manifestObjects, key, JSON.parse(readBlob(repo, entry.oid).toString("utf8")));
    return structuredClone(parsed);
  }
  catch { fail("E_MANIFEST", `Invalid JSON in ${entry.path}`); }
}

function entriesFor(repo, ref, { supportingTests = false, keepVersion = false } = {}) {
  const commit = resolveCommit(repo, ref);
  const treeKey = `${path.resolve(repo)}:${commit}`;
  const key = `${treeKey}:${supportingTests}:${keepVersion}`;
  const cached = normalizedEntries.get(key);
  if (cached) { return structuredClone(cached); }
  const raw = rawEntries.get(treeKey) || remember(rawEntries, treeKey, readEntries(repo, commit));
  const manifest = raw.find(e => e.path === "package.json");
  if (!manifest || manifest.mode !== "100644") { fail("E_MANIFEST", "package.json must be a regular file"); }
  const pkg = jsonBlob(repo, manifest);
  if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) { fail("E_VERSION", "Invalid package version"); }
  const entries = [];
  for (const entry of raw) {
    if (isPolicyPath(entry.path) || (!supportingTests && entry.path.startsWith("test/"))) { continue; }
    let contentDigest;
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
      contentDigest = digest(Buffer.from(JSON.stringify(canonical(object))));
    } else {
      const blobKey = `${path.resolve(repo)}:${entry.oid}`;
      contentDigest = blobDigests.get(blobKey) || remember(blobDigests, blobKey, digest(readBlob(repo, entry.oid)), 8192);
    }
    entries.push({ path: entry.path, mode: entry.mode, contentDigest });
  }
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const result = { commit, version: pkg.version, entries };
  remember(normalizedEntries, key, result);
  return structuredClone(result);
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
/** Normalized product and supporting-test endpoints for forward-port retention. */
function scopeEntries(repo, ref) { return entriesFor(repo, ref, { supportingTests: true }).entries; }
function isPolicyOnlyChange(repo, base, head) {
  const a = entriesFor(repo, base, { supportingTests: true, keepVersion: true });
  const b = entriesFor(repo, head, { supportingTests: true, keepVersion: true });
  return digestEntries(a.entries) === digestEntries(b.entries);
}

module.exports = { scopeEntries, snapshot, diffScope, isPolicyOnlyChange, isPolicyPath, isAuthorityPath, canonical, digest };
