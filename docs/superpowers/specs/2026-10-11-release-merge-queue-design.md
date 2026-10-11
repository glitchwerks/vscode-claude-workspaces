# Main merge-queue enforcement amendment

Date: 2026-10-11
Tracking: [#157](https://github.com/glitchwerks/vscode-claude-workspaces/issues/157), [PR #159](https://github.com/glitchwerks/vscode-claude-workspaces/pull/159)
Status: **Written specification and Native implementation plan approved by the maintainer on 2026-10-11.** The initial implementation supports one PR in the entire authenticated main queue. Rules activation remains gated by reviewed tooling and authenticated live proof (#157).
Baseline: commit 7bb127ec70bbac972c08c0208ada3a44974441ea. Repository file line citations below refer to that commit.

## Purpose and supersession

An unchanged PR head retargeted after a green prerelease run must receive authoritative validation of its prospective main merge. Native required workflows ignore event filters/types and use default PR activities, which omit retarget edits; their merge-group activity is checks_requested. The observed gap is [r4238404725](https://github.com/glitchwerks/vscode-claude-workspaces/pull/159#discussion_r4238404725) ([ruleset troubleshooting][R], fetched 2026-10-11).

This amendment supersedes the original design's PR-only trigger at line 85, main freshness assumptions at line 87, rollout order at line 105, and current guard cancellation behavior. Main requires queue validation; prerelease branches retain ordinary PR validation with strict freshness. Other routing, approval, maintenance, publication and historical safeguards remain required (docs/superpowers/specs/2026-10-10-release-policy-enforcement-design.md:L81-L109; scripts/check-release-pr.js:L10-L53; #157).

Main continues accepting reviewed policy-only PRs, approved release candidates, and issue-approved stable hotfixes through their original PR identities. Queueing does not supply an approval or permit feature branches to main. The native guard remains selected from protected main by workflow identity; a similarly named candidate check cannot replace it (scripts/release-enforcement/evaluate.js:L43-L106; scripts/check-release-pr.js:L37-L52; #157).

## Queue and protection configuration

Preserve ruleset 23655009 and its main/prerelease targets, deletion/force-push restrictions, PR requirement, squash method, five required checks, and empty bypass list. Add a separate main-only merge-queue rule; preserve the original payload when changing strict prerelease freshness. Do not impose queue requirements on prerelease branches ([live ruleset][P], fetched 2026-10-11; #157).

Initial queue settings: max_entries_to_build=1, min_entries_to_merge=1, max_entries_to_merge=1, grouping_strategy=ALLGREEN, merge_method=SQUASH. Set a bounded check-response timeout from measured full CI duration plus scheduling margin during probes; no fixed timeout is approved here. The exact rule parameters are documented by GitHub ([REST rules][A], fetched 2026-10-11; #157).

These settings limit concurrency and merges but do **not** prove a singleton prospective build. GitHub distinguishes merge limits from merge-group builds and may include preceding queued PR changes. Require authenticated evidence of exactly one contributing PR and reject unsupported composite groups even if the resulting tree appears equivalent ([queue configuration][Q], fetched 2026-10-11; #157).

## Trusted merge-group evidence contract

Extend trusted guard input with a distinct merge_group adapter. Candidate content and queue branch naming must never select the PR, policy, route or approval. The following requirements extend current live-PR/object freshness checks and immutable authority selection (scripts/check-release-pr.js:L10-L53; scripts/release-enforcement/github.js:L7-L67; #157):

1. Accept only trusted runner event_name=merge_group and action=checks_requested. Validate configured repository ID/full name, base_ref=refs/heads/main, complete base/head refs and 40-character commit SHAs. Reconcile event head with the run's GITHUB_SHA/GITHUB_REF and authenticated live Git refs; require prospective base to equal freshly fetched protected main ([event contract][E], fetched 2026-10-11; #157).
2. Load automation and policy at verified workflow_sha from the native protected-main workflow definition. Require that authority revision to equal the fresh prospective main base. A main advance after checkout invalidates the run; rebuild and reevaluate, never accept ancestor-only policy freshness (scripts/check-release-pr.js:L20-L41; #157).
3. Query bounded authenticated live queue evidence for this repository/main. Resolve the original PR number and its queue-entry identity; verify a currently open, same-repository PR targeting main with the exact live source branch/head. Prove actual singleton group membership, not merely a singleton configuration or a branch-name match ([queue schema][G], fetched 2026-10-11; #157).
4. Fetch exact original PR and prospective group Git objects through fixed trusted refs. Reject missing/moved refs, malformed objects, foreign repository identity, conflicts, unsupported group shape, or any mismatch with authenticated queue/PR evidence (scripts/check-release-pr.js:L20-L35; #157).
5. Independently derive the original authenticated PR applied to current main using trusted Git object operations. Require exact full Git tree identity with the queued prospective tree, including modes, deletions, binary files and policy files; productDigest alone cannot prove absence of extra work. No candidate checkout, import, install or execution occurs in the guard (#157; scripts/check-release-pr.js:L20-L51).
6. Evaluate routing and approval against the original PR number/source branch/head, and scope, ledger, versions and maintenance against the actual prospective tree/current main. Preserve the distinction in interfaces: a temporary queue ref must never masquerade as release/* or hotfix/* authority (scripts/release-enforcement/evaluate.js:L43-L106; #157).
7. Immediately before reporting success, re-read original PR identity, queue-entry/group membership and refs, protected-main authority/base, and prospective head/tree. Any head/base change, dequeue, rebuild, retarget, superseded approval or missing evidence fails closed; the succeeding run must evaluate the rebuilt group (scripts/check-release-pr.js:L16-L19,L48-L52; #157).

**Unverified API semantics:** MergeQueueEntry documents baseCommit, headCommit, pullRequest and queue state, but does not establish their exact relationship to merge_group event OIDs or conclusively expose this group's membership. Prove that mapping and the expected tree construction with authenticated live positive probes before relying on it. If available evidence cannot prove both identity and singleton membership, stop activation and report the missing evidence; no heuristic fallback ([queue schema][G], fetched 2026-10-11; #157).

## Bounded API reads and permissions

Current evidence transport is bounded same-origin REST GET with redirection rejection, body/pagination limits, timeout and redacted transport errors. Retain its existing REST behavior (scripts/release-enforcement/github.js:L7-L58).

If GraphQL is needed, deliberately add a separate fixed read-only query operation at https://api.github.com/graphql using POST transport. Query text is trusted and constant; only validated repository/PR IDs and bounded pagination cursors are variables. No mutation, arbitrary query, candidate-supplied URL or token-bearing diagnostic is allowed ([GraphQL calls][H], fetched 2026-10-11; #157).

Require complete non-null typed identity fields and bounded pagination; reject HTTP errors, GraphQL errors even alongside partial data, permission failures, stale pages, rate-limit exhaustion, redirects, oversized bodies and timeouts. Retain explicit request/page/body/time budgets and token hygiene; implement tests for each rejection. Verify necessary GraphQL read scopes with the actual job token during the positive probe; additional write grants are forbidden (scripts/release-enforcement/github.js:L14-L58; .github/workflows/release-guard.yml:L19-L30; [GraphQL calls][H], fetched 2026-10-11; #157).

## Workflows and publication

Add merge_group checks_requested support to the native guard and all five existing required CI jobs: Release Policy; Quality (ubuntu-latest), Quality (windows-latest), Quality (macos-latest); Extension Host Integration (Windows). Preserve names, matrix, ordinary PR/push behavior and prerelease CI. CI concurrency keys distinguish merge-group head/ref from PR runs and other queue builds, preventing cancellation of the current group's required checks. Guard execution remains main-owned while quality jobs validate the prospective group revision (.github/workflows/ci.yml:L3-L87; .github/workflows/release-guard.yml:L25-L39; [event contract][E], fetched 2026-10-11; #157).

Remove cancel-in-progress from the required guard; distinguish PR and group execution identities so unrelated runs cannot cancel each other. Required workflows ignore event filters; validate the group target inside the trusted adapter rather than relying on branch filters ([ruleset troubleshooting][R], fetched 2026-10-11; .github/workflows/release-guard.yml:L5-L13; #157).

Stable publication continues binding the final immutable tag/package/tree to the actual merged original PR and its final merge commit. A temporary queue SHA is not publication authorization. Verify squash-result PR/commit mapping in the positive probe and preserve current main freshness, approval/source proof, maintenance retention, and preflight-before-install safeguards (scripts/release-enforcement/evaluate.js:L124-L165; #157).

Retain exact historical target retries, withdrawn v0.8.0 rejection, and the stable authority bindings added at d5e3d5e for all excluded workflows and scripts.test:release-policy. Ordinary feature PR/odd publication CI exceptions remain unchanged (scripts/release-enforcement/evaluate.js:L14-L34,L125-L153; PR #159; commit d5e3d5e).

## Rollout, failure and rollback

After written-spec approval, obtain a reviewed revised implementation plan and execution choice. Merge reviewed authoritative workflows/tooling under current protections before relying on queue enforcement. Refresh rules snapshots and synchronize required authority where existing policy requires it; no activation is authorized by this document (#157).

A controlled bootstrap may temporarily stage main-only queue/native workflow controls for safe disposable policy-PR probes while retaining all existing protections and empty bypass lists. Pause unrelated main merges during this bootstrap. Record settings, selected workflow revision, run/check associations, original PR and group OIDs/trees, API evidence and outcomes in #157; bootstrap is not completed enforcement (#157; [REST rules][A], fetched 2026-10-11).

Final enforcement activation requires one safe disposable policy-only positive queued PR to prove live identity/membership, check association and actual squash-result mapping under existing protections, plus ordinary prerelease positive evidence and live negative retarget-after-green, same-name spoof/candidate guard edit and foreign/composite-tree receipts. Existing approval-bound release/hotfix route regressions and separate publication fail-closed regressions supply the release evidence; do not fabricate new production approvals, releases or hotfixes merely to probe enforcement. In particular, prove an unchanged feature PR retargeted from prerelease to main cannot merge using its earlier green checks. Unsupported or unprovable queue mapping blocks activation (#157; r4238404725).

Queue failure leaves the PR open and source branch intact; correct the cause and requeue the same PR. Do not create replacement PRs solely to retry. If the guard is unavailable, pause main merges. Rollback must retain a fail-closed main path; never remove queue enforcement while the stale retarget path remains open ([queue failures][F], fetched 2026-10-11; #157).

## Required test and review evidence

Design tests before implementation: malformed event/action/repository/ref/SHA; stale PR/base/head/authority; dequeue/rebuild/retarget; foreign tree and composite groups; API errors/partial pages/null fields/time/body/token hygiene; original PR approval identity; and independent exact Git tree comparison. Preserve policy-only, snapshot promotion, hotfix correction/forward-port, feature and publication/historical regressions. Workflow contracts prove all five checks plus native identity-bound guard run on merge_group without cancellation (#157; scripts/check-release-pr.js:L10-L53; scripts/release-enforcement/evaluate.js:L43-L165).

Run existing types/lint/unit/release-policy/build/integration checks on the implementation's exact head. Written-spec review and later plan approval are required separately; live queue OID/membership/squash/provenance proof remains an explicit implementation/activation gate (#157).

## Sources and artifact persistence

All external sources below were retrieved 2026-10-11. Normative choices are the maintainer's main-only queue decision under #157; unsupported semantics are explicitly unverified.

[Q]: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue
[R]: https://docs.github.com/en/enterprise-cloud@latest/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/troubleshooting-rules
[E]: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#merge_group
[G]: https://docs.github.com/en/graphql/reference/pulls#mergequeueentry
[H]: https://docs.github.com/en/graphql/guides/forming-calls-with-graphql
[A]: https://docs.github.com/en/rest/repos/rules
[P]: https://api.github.com/repos/glitchwerks/vscode-claude-workspaces/rulesets/23655009
[F]: https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/merging-a-pull-request-with-a-merge-queue

Context verification: git ls-tree HEAD -- scripts/check-release-pr.js scripts/release-enforcement/github.js scripts/release-enforcement/evaluate.js .github/workflows/ci.yml .github/workflows/release-guard.yml docs/superpowers/specs/2026-10-10-release-policy-enforcement-design.md. All six cited repository artifacts exist at 7bb127e. This amendment and its parent pointer must both be committed before push; verify git ls-tree HEAD -- docs/superpowers/specs/2026-10-11-release-merge-queue-design.md after the docs commit. The original untracked approved execution plan remains preserved while #157 is open (#157).
