"use strict";

const { fail } = require("./git.js");
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
module.exports = { parseQueueEvent, correlateQueue, validQueueRef };
