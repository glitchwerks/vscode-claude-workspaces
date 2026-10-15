# Release enforcement activation

Release enforcement is active for this repository. The protected receipt merge
and exact prerelease authority forward-port are verified below; all rollout
gates in #157 are satisfied.

Live verification completed on 2026-10-14 (America/New_York). The
[machine-readable receipt](enforcement-rollout.json) preserves the authenticated
queue, PR and ref observations, selected native workflow, job-token query and
response fields, independent Git tree proofs, check conclusions and final
squash identities for [#157](https://github.com/glitchwerks/vscode-claude-workspaces/issues/157).

| Probe | Observed result | Durable source |
| --- | --- | --- |
| One reviewed policy PR | Native guard, all five group checks and protected squash passed | PR #160; receipt `protectedSingleton` |
| Two PRs in the entire queue | Native guard rejected; both controls remained unmerged during the negative phase | PRs #162/#163 and #162/#168; receipt `multipleEntries` |
| Replay after main advanced | Old run rejected; the original PR was refreshed and merged alone after fresh checks | PR #162; receipt `staleReplay` |
| Same feature head retargeted to main | New queue run rejected the route; prerelease target restored and native retry passed | PR #161; receipt `unchangedHeadRetarget` |
| Candidate workflow and same-name green check | Required native workflow rejected the candidate | PR #166; receipt `candidateWorkflowAndSameName` |
| Stale source base | Queue guard rejected; current-main refresh and fresh checks allowed a later protected merge | PR #165; receipt `sourceBaseFreshness` |
| Ordinary prerelease PR | Protected merge passed without joining the main queue | PR #164; receipt `ordinaryPrerelease` |

The fresh PR #162 singleton's independently derived tree and final squash tree
both equal `4e78a82b1576f0f45fbf7b0d3572988c6b98b0b9`; its final merge is
`a4baf2ad98e8210592eef9dab6c5548303ec2fb5`. Actual native logs retain the complete
selected queue page before and after evaluation and the original PR identity
(receipt `staleReplay.freshRetry`).

Organization ruleset **25040867** selects only repository **1344170098** and
requires `.github/workflows/release-guard.yml` from protected main on main and
prerelease branches. It has no bypass actors. Existing protection, five required
checks and strict required-status freshness remain enabled; main additionally
uses a squash queue. The administrator export and complete accessible rule
payloads are retained in receipt `rules`.

The existing queue timeout remains **60 minutes**. The longest successful full
CI observation in the receipt took **8 minutes 25 seconds**, leaving **51 minutes
35 seconds** of explicit scheduling allowance. This validates retaining the
administrator's bounded setting; it does not assert the administrator's original
selection rationale (receipt `rules.queueTimeout`).

Main retains stable **0.8.1**. The prerelease authority sync in PR #164 retained
version **0.9.0** and product digest
`54da7b7cd7172ad3322e2bba21035d4ea074dc0a05744090252272650707fcbc`.
The initial 34 runtime authority blobs matched protected main; its Windows suite
passed 842 tests and its release-policy suite passed 247. The exact receipt
forward-port in PR #169 brings the matching authority set to 35 blobs while
retaining that product digest and version (receipt `ordinaryPrerelease`,
`regressionReceipts`; PR #169).

Only one PR may occupy the entire main queue. After rejection, the PR and branch
remain available: correct the cause, refresh from current main when stale, rerun
checks and requeue. Feature PRs target the active prerelease branch. Prerelease
PRs retain ordinary protected merges with strict freshness. Missing identity,
authority or tree proof remains a blocking failure; do not grant a bypass to
recover ([versioning policy](../versioning-policy.md), #157).

The JSON is a frozen observation taken before its own protected merge; its
`activationClosure.pending` field records that historical boundary. Delivery
subsequently completed through these protected PRs:

| Delivery | PR | Merge commit |
| --- | --- | --- |
| Main receipt | [#168](https://github.com/glitchwerks/vscode-claude-workspaces/pull/168) | `8ac2a97682d0eda7c5645650454ab5b636cc0dd9` |
| Exact prerelease receipt | [#169](https://github.com/glitchwerks/vscode-claude-workspaces/pull/169) | `5c22a9bee2ed8e472ce6d905c200ef960e020d88` |

Both branches retain receipt blob `2090001ba18e04c3fbb5c8901b8732c02d3e12ce`. All 35 authority files match
by Git mode and object ID. No production release or tag was created by these
probes. The final Markdown closure change retires the temporary probe notes
without changing the authority blobs (#157).

A receipt queue attempt was correctly blocked by an unchanged macOS signal-watcher
test timeout ([failed CI run](https://github.com/glitchwerks/vscode-claude-workspaces/actions/runs/38660067680)).
The [fresh successful queue run](https://github.com/glitchwerks/vscode-claude-workspaces/actions/runs/38660650502)
reran every required check, and the protected merge used its fresh group identity.
This remains an intermittent CI observation recorded in #157; no test code or
checks were disabled.

Final control reread: `2026-10-15T00:48:27.231Z`. All four accessible ruleset governance
payloads, their update timestamps and both branches' effective rules match the
frozen receipt. The organization targeting export therefore remains paired with
an unchanged server ruleset revision (receipt `rules.after` and
`rules.organizationAfterFull`). No control was edited during verification.
