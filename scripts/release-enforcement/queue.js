"use strict";

const { fail } = require("./git.js");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const oid = value => typeof value === "string" && /^[a-f0-9]{40}$/.test(value);
function validBranch(value) {
  return typeof value === "string" && value.length <= 1024 && /^[A-Za-z0-9_][A-Za-z0-9._/-]*$/.test(value) &&
    !value.includes("..") && !value.includes("//") && !value.split("/").some(part => !part || part.startsWith(".") || part.endsWith(".") || part.endsWith(".lock"));
}
function validQueueRef(ref) {
  return typeof ref === "string" && ref.startsWith("refs/heads/gh-readonly-queue/main/") && validBranch(ref.slice(11));
}
function parseQueueEvent(event, runner, repository) {
  const group = event?.merge_group;
  if (runner.eventName !== "merge_group" || event?.action !== "checks_requested" ||
    event?.repository?.id !== repository.id || event.repository.full_name !== repository.fullName ||
    group?.base_ref !== "refs/heads/main" || !validQueueRef(group.head_ref) || !oid(group.base_sha) || !oid(group.head_sha) ||
    runner.sha !== group.head_sha || runner.ref !== group.head_ref) { fail("E_QUEUE", "Invalid main queue event or trusted runner identity"); }
  return { baseRef: group.base_ref, baseCommit: group.base_sha, headRef: group.head_ref, headCommit: group.head_sha };
}
function correlateQueue({ repository, event, queue, pr, mainCommit, headCommit }) {
  const entry = queue?.entries?.[0];
  if (queue?.totalCount !== 1 || !Array.isArray(queue.entries) || queue.entries.length !== 1 ||
    !entry || typeof entry.id !== "string" || !entry.id || entry.position !== 1 ||
    !["AWAITING_CHECKS", "MERGEABLE", "LOCKED"].includes(entry.state) ||
    pr?.state !== "open" || pr.merged === true || !Number.isSafeInteger(pr.number) || pr.number < 1 || entry.pullRequest !== pr.number ||
    pr.head?.repositoryId !== repository.id || pr.base?.repositoryId !== repository.id || pr.base.ref !== "main" ||
    !oid(pr.head.sha) || !oid(pr.base.sha) || !validBranch(pr.head.ref) ||
    event.baseRef !== "refs/heads/main" || !validQueueRef(event.headRef) ||
    ![event.baseCommit, event.headCommit, entry.baseCommit, entry.headCommit, mainCommit, headCommit].every(oid)) {
    fail("E_QUEUE", "Expected complete singleton main queue and authenticated original PR");
  }
  if (event.baseCommit !== mainCommit || entry.baseCommit !== mainCommit || pr.base.sha !== mainCommit ||
    entry.headCommit !== event.headCommit || headCommit !== event.headCommit) { fail("E_STALE_QUEUE", "Queue, original PR or live refs changed; rebuild and retry"); }
  return entry;
}
/** Isolated object-only Git operations; inherited Git config and hooks are never used. */
function withObjects(repositoryPath, commits, operation) {
  if (!commits.every(oid)) { fail("E_QUEUE_TREE", "Expected exact commit OIDs"); }
  const source = path.resolve(repositoryPath);
  const tempRoot = path.resolve(os.tmpdir());
  const scratch = fs.mkdtempSync(path.join(tempRoot, "release-queue-"));
  const relative = path.relative(tempRoot, scratch);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) { fail("E_QUEUE_TREE", "Unsafe temporary object directory"); }
  try {
    const empty = path.join(scratch, "empty"); fs.mkdirSync(empty);
    const global = path.join(scratch, "global"); fs.writeFileSync(global, "");
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (/^(PATH|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|LANG|LC_ALL)$/i.test(key)) { env[key] = value; }
    }
    Object.assign(env, { GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: global, GIT_NO_REPLACE_OBJECTS: "1", GIT_TERMINAL_PROMPT: "0" });
    const bare = path.join(scratch, "objects.git");
    function read(args) {
      const result = spawnSync("git", ["-c", `core.hooksPath=${empty}`, "-c", `core.attributesFile=${global}`, ...args], {
        encoding: "utf8", timeout: 30000, maxBuffer: 64 * 1024 * 1024, env, shell: false
      });
      if (result.error || result.status !== 0) { fail("E_QUEUE_TREE", "Missing objects, merge conflict or failed isolated Git read"); }
      return result.stdout.trim();
    }
    read(["init", "--bare", `--template=${empty}`, bare]);
    const git = args => read(["-C", bare, ...args]);
    git(["-c", "protocol.file.allow=always", "fetch", "--no-tags", "--no-recurse-submodules", "--no-write-fetch-head", source, ...new Set(commits)]);
    for (const commit of new Set(commits)) {
      if (git(["cat-file", "-t", commit]) !== "commit") { fail("E_QUEUE_TREE", "Expected commit objects"); }
      if (/(^|\0)160000 commit /.test(git(["ls-tree", "-rz", "--full-tree", commit]))) { fail("E_UNSUPPORTED_GITLINK", "Queue proof does not accept gitlinks"); }
    }
    return operation(git);
  } finally {
    // Only the directory returned by mkdtemp inside the verified temporary root.
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
function deriveTree(git, baseCommit, originalHead) {
  const tree = git(["merge-tree", "--write-tree", baseCommit, originalHead]);
  if (!oid(tree) || git(["cat-file", "-t", tree]) !== "tree") { fail("E_QUEUE_TREE", "Expected a single conflict-free tree OID"); }
  return tree;
}
function deriveQueuedTree({ repositoryPath, baseCommit, originalHead }) {
  return withObjects(repositoryPath, [baseCommit, originalHead], git => deriveTree(git, baseCommit, originalHead));
}
function proveQueuedTree({ repositoryPath, event, pr }) {
  return withObjects(repositoryPath, [event.baseCommit, pr.head.sha, event.headCommit], git => {
    const expected = deriveTree(git, event.baseCommit, pr.head.sha);
    const actual = git(["rev-parse", "--verify", "--end-of-options", `${event.headCommit}^{tree}`]);
    if (actual !== expected) { fail("E_QUEUE_TREE", "Prospective full tree differs from the original PR applied to current main"); }
    return expected;
  });
}
module.exports = { parseQueueEvent, correlateQueue, validQueueRef, deriveQueuedTree, proveQueuedTree };
