"use strict";

const { spawnSync } = require("node:child_process");
const { TextDecoder } = require("node:util");
const decoder = new TextDecoder("utf-8", { fatal: true });

function fail(code, detail) { throw new Error(`${code}: ${detail}`); }

/** Bounded, shell-free Git reads. Blob output must never be trimmed. */
function git(repo, args) {
  const result = spawnSync("git", ["-C", repo, ...args], {
    encoding: null, timeout: 30000, maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_NO_REPLACE_OBJECTS: "1" }
  });
  if (result.error || result.status !== 0) {
    fail("E_GIT", result.error?.message || result.stderr?.toString("utf8").trim() || "Git read failed");
  }
  return result.stdout;
}

function resolveCommit(repo, ref) {
  if (typeof ref !== "string" || !ref || ref.includes("\0")) { fail("E_COMMIT", "Invalid commit reference"); }
  const commit = git(repo, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).toString("ascii").trim();
  if (!/^[a-f0-9]{40}$/.test(commit)) { fail("E_COMMIT", "Expected SHA-1 commit identity"); }
  return commit;
}

function readEntries(repo, ref) {
  const sha = resolveCommit(repo, ref);
  const output = git(repo, ["ls-tree", "-rz", "--full-tree", sha]);
  const entries = [];
  let start = 0;
  while (start < output.length) {
    const end = output.indexOf(0, start);
    const tab = output.indexOf(9, start);
    if (end < 0 || tab < start || tab > end) { fail("E_TREE", "Malformed Git tree entry"); }
    const fields = output.subarray(start, tab).toString("ascii").split(" ");
    const [mode, type, oid] = fields;
    const path = decoder.decode(output.subarray(tab + 1, end));
    if (mode === "160000" || type === "commit") { fail("E_UNSUPPORTED_GITLINK", JSON.stringify(path)); }
    if (type !== "blob" || !/^(100644|100755|120000)$/.test(mode) || !/^[a-f0-9]{40}$/.test(oid)) {
      fail("E_TREE", `Unsupported entry ${JSON.stringify(path)}`);
    }
    entries.push({ path, mode, oid, type });
    start = end + 1;
  }
  return entries;
}

function readBlob(repo, oid) {
  if (!/^[a-f0-9]{40}$/.test(oid)) { fail("E_BLOB", "Invalid blob identity"); }
  return git(repo, ["cat-file", "blob", oid]);
}

function isAncestor(repo, ancestor, descendant) {
  const a = resolveCommit(repo, ancestor);
  const b = resolveCommit(repo, descendant);
  const result = spawnSync("git", ["-C", repo, "merge-base", "--is-ancestor", a, b], {
    encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024,
    env: { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" }
  });
  if (!result.error && (result.status === 0 || result.status === 1)) { return result.status === 0; }
  fail("E_GIT", result.error?.message || result.stderr || "Ancestry read failed");
}

module.exports = { git, fail, resolveCommit, readEntries, readBlob, isAncestor };
