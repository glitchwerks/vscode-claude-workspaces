# Goldfish Annotated Review Report

**Status: resolved — 13 findings addressed; C2 deferred with Run by author decision; 0 open v1 findings. Affected fresh review is still required.**

**Target:** [copying-only companion design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md), full file. The [Run amendment](../../../run-amendment.md) is now deferred history. **Reviewed input:** [consolidated review](../consolidated_review_report.md), checkpoint 4b7e967. **Date:** 2026-11-07. **State:** author auto-accepted all fourteen proposals; the design corrections and three behavior selections are applied. No experiment or product implementation was performed in that original correction batch; the later authorized C2 experiment is recorded below. [Approval](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6709462362).

The Proposed Edit bullets below preserve the pre-approval specification wording; the approval above supersedes their requests for permission. Each finding retains its original severity. The applied-result table distinguishes textual correction from outstanding evidence.

## Prioritized Findings & AI Suggestions

All fourteen findings retain their historical severity and PROPOSE FIX proposals. C4 is approved. The author subsequently deferred Run and C2 after the native experiment; 13 findings remain addressed and one is deferred, with no open v1 finding. This does not establish review convergence or prove that Run works. The original proposal wording and fixed hypothesis remain unchanged. [Deferral decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295).

**Applied order:** corrections and C4 approval remain in place. The author deferred Run and its C2 gate; apply the active copying-only inventory/allowlists and rerun affected fresh review stages. Preserve execution evidence and earlier terminal preferences as deferred context, not v1 work. [Deferral](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295), [current design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md).

**Important C2 boundary:** deferral removes execution from v1; it does not solve admission or weaken non-interruption. Reintroducing Run needs an explicit scope decision, an admission design addressing the observed failures and fresh review. No new terminal-control architecture or fresh-shell substitute is approved. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295), [C2 evidence](../../../c2-experiment-results.md).

### C1: Correct the stylesheet boundary [Codebase Details] — Severity: Blocker

* **Affected Scope:** [reviewed target, lines 213, 225, 338](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L213).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/index.ts#L1-L9).
* **Discrepancy Description:** The design cites renderer.ts as the current stylesheet-import location and adds CSS there, crossing the Node renderer-test boundary.
* **Rationale:** The browser entry already owns stylesheet imports; correcting the plan preserves the existing module boundary.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** A — mechanical.
* **Proposed Edit:** Replace the renderer inventory rationale with: “Mount/update the companion per active session and route its actions; retain the directly Node-loadable renderer boundary. Import companion/styles.css only from the browser entry src/panel/webview/index.ts.” Add Modify src/panel/webview/index.ts. In D2, replace the stylesheet-import source with index.ts lines 1–9. Recalculate the inventory after C7; these two additions change 17 Modify paths to 19, with 31 Create paths unchanged.

### C2: Resolve the Run concurrency guarantee with evidence [Design / Intermediate Zoom Out] — Severity: Major

* **Affected Scope:** [reviewed target, lines 104–112; 282; Run contract 29–33](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L104).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/run-amendment.md#L29-L33).
* **Discrepancy Description:** Observed idle and serialization of companion clicks do not define exclusion of competing native input before dispatch.
* **Rationale:** The selected API can interrupt existing work. Another status check is not evidence of atomic admission. Persistent shell reuse stays selected.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** C — evidence before closure.
* **Proposed Edit:** Add before Run implementation: “Run admission remains a design closure gate. A separately authorized disposable native-terminal experiment must cover native foreground work starting between idle observation and dispatch, partial typed input, duplicate clicks, unknown integration state and terminal closure. Record whether the foreground fixture survives and whether command text can reach the wrong input owner. Do not claim guaranteed non-interruption or close this finding from observed-idle checks alone. If the selected API cannot establish the boundary, return the explicit limitation and alternatives for an author decision.” This is a proposed gate, not a completed fix or authorization to run the experiment.
* **Closure:** remains open until the evidence deliverable is complete; adding the gate alone is not resolution.

### C3: Propose an explicit native-identity reset policy [Codebase Details] — Severity: Major

* **Affected Scope:** [reviewed target, lines 227, 229, 235, 294](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L227).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L70-L74).
* **Discrepancy Description:** The host target API reads the managed launch snapshot, while the plan does not select what happens on a different native UUID.
* **Rationale:** A v1 fail-closed transition avoids inventing a new host rebinding API while leaving the existing CLI available. This has a visible recovery cost and needs approval.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** B — behavior decision.
* **Proposed Edit:** Proposed v1 decision: “On an authenticated native UUID mismatch, retire the capture epoch, invalidate its Copy/review/Run targets and show Capture paused: CLI identity changed, with Raw access. Do not rebind the managed launch UUID in v1; capture resumes only after a new managed launch supplies a matching binding. A reset retaining the same native UUID starts a fresh capture epoch with a visible boundary. The managed process generation and its dedicated Run shell are not changed by capture retirement, but stale source Run actions remain rejected.” Add exact mismatch/same-UUID reset fixtures. Trade-off: an identity-changing /clear or resume can require a managed relaunch to recover capture; this is proposed, not assumed approved.

### C4: Write the build-specific capture/provenance contract [Implementation Readiness] — Severity: Major

* **Affected Scope:** [reviewed target, lines 229–233; 267–278](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L229).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L229-L278).
* **Discrepancy Description:** Supported tools, native event/field mapping, agent correlation and completion/status evidence are not fully selected.
* **Rationale:** Exact copying and honest executed labels need a sourced adapter table, rather than field names guessed during implementation.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** C — evidence before closure.
* **Proposed Edit:** Add a phase-0 deliverable: “Before observer wiring, complete and cite the supported-build adapter table for stored assistant text and the initially supported command tool(s), starting with the Bash evidence already preserved by #215. Name exact events, allowlisted fields, row/tool/agent correlation, execution/finality evidence and transitions for success, nonzero execution, denial, backgrounding and contradictory/missing evidence. Unsupported tools retain generic rendering without an executed label. Nonzero execution is Ran/Failed only when execution itself is established. Commit corresponding synthetic expectations in the already-planned capture/copy fixtures.” Inspect preserved declarations/receipts first. Unverified native fields must remain labeled unverified; if a probe is needed, obtain separate authorization. The final table must be written before C4 is closed.
* **Closure:** the source-backed table and synthetic expectations were provided and approved. C4 is closed as a design finding; runtime qualification remains separate. [Approval](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6711102784).

### C5: Propose epoch retirement on rejected owned transactions [Implementation Readiness] — Severity: Major

* **Affected Scope:** [reviewed target, lines 233–235](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L233).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L233-L235).
* **Discrepancy Description:** Rejection can be acknowledged, but the cumulative cursor only defines admitted sequences.
* **Rationale:** One terminal rejection policy avoids several incompatible interpretations of a missing middle sequence, at the cost of a visible capture gap and reconnection.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** B — behavior decision.
* **Proposed Edit:** Proposed replacement after the cursor rule: “Normal acknowledgements use disposition continue and advance ackSeq only through consecutively admitted frames. An authenticated owned transaction failing schema/content validation retires the epoch: the host atomically publishes disposition retired, the unchanged last admitted ackSeq and a bounded reason code; marks capture unavailable with a gap whose unknown extent is not fabricated; and admits no later frame from that epoch. The producer drops its outstanding old-epoch queue on the retired disposition and never replays it into a new epoch. Unauthenticated/foreign traffic neither advances the cursor nor retires a valid epoch; cleanup remains restricted to owned files. Reconnection requires a fresh valid binding/epoch.” Define these fields in the closed ack schema. Test admitted 4 / rejected 5 / later old-epoch 6, cursor=4, one gap, retirement and bounded cleanup.

### C6: Propose conservative shell eligibility [Implementation Readiness] — Severity: Major

* **Affected Scope:** [reviewed target, lines 256–257; 282; Run contract 24–30](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L256).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/run-amendment.md#L24-L30).
* **Discrepancy Description:** The plan does not map command tags/origins to the shell-family requirement enforced by Run.
* **Rationale:** A deterministic declared-family rule keeps copying independent of syntax guessing. The trade-off is disabled Run for commands whose shell is unknown.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** B — behavior decision.
* **Proposed Edit:** Proposed matrix: bash/sh fences → qualified Bash/Git Bash profile; powershell/pwsh/ps1 → qualified pwsh profile; zsh/cmd/bat → Copy available, Run unavailable until that family is separately qualified; generic shell fences and untyped inline commands → Copy available, Run unavailable because required family is unknown. Completed tool commands gain Run again only when the approved C4 adapter establishes both completion and a qualified source shell family; otherwise keep Copy only. Retain requiredShellFamily and evidence origin on each Run target; compare against the owned terminal's currently qualified family at dispatch. Never translate syntax, infer portability or relaunch a different shell silently. Qualified means the tested profile/build, not just a matching display name. This deliberately limits Run coverage and needs approval.

### C7: Include the existing mod-entry loader and mock [Codebase Details] — Severity: Major

* **Affected Scope:** [reviewed target, lines 208; 217–218; 225; 292](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L208).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/attentionCompletionMod.test.ts#L6-L55).
* **Discrepancy Description:** The data-URL loader substitutes only two imports and does not resolve the planned companion helper graph.
* **Rationale:** A new companion test does not update the existing regression loader affected by register.js imports.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** A — mechanical.
* **Proposed Edit:** Add Modify test/unit/attentionCompletionMod.test.ts. Specify a fixed trusted helper-graph loader covering the existing completionRetry/composer modules and the planned companion observer/filePublisher modules before data-URL import; reject unexpected unresolved relative imports. Extend the SDK mock for the required injected capture/timer/file surface and explicit absent/disabled capture. Preserve metadata-only attention and native-continuation assertions. The missing/disabled binding must leave existing tests independent of real files or a CLI.

### C8: Add ordered buildable/testable phases [Implementation Readiness] — Severity: Major

* **Affected Scope:** [reviewed target, lines 189–296](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189-L296).
* **Discrepancy Description:** The responsibility list has no per-phase file subsets, activation boundaries or verification gates.
* **Rationale:** The inventory can be retained and assigned to stable phases instead of creating another architecture.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** A — mechanical.
* **Proposed Edit:** Insert the phase table below before item 2. Assign every existing exact inventory path to its named phase write subset; shared paths may have explicit later extensions. P0 closes the C4 adapter contract and records the separate C2 feasibility gate without product activation. P1 adds types, schemas, capture/publisher and isolated fixtures/tests with registration disabled. P2 adds model/content/extraction and tests, still without UI activation. P3 wires runtime, protocol, view, browser stylesheet entry and native controls only after the consumer is ready. P4 adds the persistent Run controller/eligibility only after C2 and C6 are settled. P5 performs separately authorized package/native qualification and updates user docs. Use the exact checkpoint requirements below and recalculate path totals after additions.

### C9: Name the baseline release lane and packaging check [Comprehension / Intermediate Zoom Out] — Severity: Major

* **Affected Scope:** [reviewed target, lines 189–191; 294–296](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/docs/versioning-policy.md#L267-L286).
* **Discrepancy Description:** The required lane and correct-lane packaging check are not explained or linked.
* **Rationale:** The pinned workflow already defines the lane and scripts; link it instead of inventing another release process.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** A — mechanical.
* **Proposed Edit:** Replace the unexplained lane phrase with: “For the pinned runtime baseline, feature work targets prerelease/0.11.x; follow CONTRIBUTING.md lines 98–103 and recheck the live lane policy before branching.” Replace correct-lane packaging with: “At this 0.11.x baseline run npm run package:prerelease; packaging uses package-version parity, not branch name: odd minor selects prerelease, even minor selects stable. Recheck the selected baseline and use its matching guard/packaging script. Do not publish.” Cite the pinned workflow, policy and package scripts.

### C10: Make alternative decisions unambiguous [Feature Style] — Severity: Nit

* **Affected Scope:** [reviewed target, lines 145, 149, 155, 161, 167](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L145).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L145-L167).
* **Discrepancy Description:** Rejected by author labels introduce the retained behavior.
* **Rationale:** A direct label edit removes ambiguity without changing the selected architecture.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** A — mechanical.
* **Proposed Edit:** In those five paragraphs replace the leading Rejected by author label with Decision. Keep the preceding alternative heading, concrete rejection rationale and selected behavior intact; where needed name that rejected alternative in the first sentence.

### C11: Update obsolete unresolved-design wording [Feature Style] — Severity: Nit

* **Affected Scope:** [reviewed target, lines 30, 50](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L30).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L30-L50).
* **Discrepancy Description:** The text says rules/limits still need design after supplying them.
* **Rationale:** The outstanding work is implementing and qualifying the chosen contracts.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** A — mechanical.
* **Proposed Edit:** Replace “These remain acceptance and technical-design work” with “The selected rules and limits in Detailed Implementation items 3–5 still require implementation and qualification.” Replace “Capture/history limits still need to be designed” with “The selected capture/retention limits still require implementation and qualification.” Preserve adjoining scope and evidence text.

### C12: Remove the redundant universal caveat [Feature Style] — Severity: Nit

* **Affected Scope:** [reviewed target, lines 167](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L167).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L167).
* **Discrepancy Description:** The transcript-reader non-claim adds no decision beyond the selected v1 boundary.
* **Rationale:** The earlier alternatives framing already distinguishes selection from proof of infeasibility.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** A — mechanical.
* **Proposed Edit:** Delete only “no claim is made here that every possible transcript reader is infeasible”, repairing adjacent punctuation. Keep the explicit exclusion of transcript tailing and its rationale.

### C13: Remove the repeated future-file caveat [Implementation Style] — Severity: Nit

* **Affected Scope:** [reviewed target, lines 191](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L191).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189-L191).
* **Discrepancy Description:** The immediately preceding text already calls the inventory future work.
* **Rationale:** The first qualification remains sufficient.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** A — mechanical.
* **Proposed Edit:** Delete only “These future files are not claimed to exist yet.” Keep the helper placement, packaged entry and metadata-only boundary.

### C14: Remove the ambiguous retrospective sentence [Implementation Style] — Severity: Nit

* **Affected Scope:** [reviewed target, lines 313](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L313).
* **Evidence:** [primary source](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L302-L313).
* **Discrepancy Description:** The architecture summary shifts tense and repeats the earlier chronology.
* **Rationale:** Chronology is already explicit at line 302.
* **AI Suggestion:** PROPOSE FIX.
* **Batch:** A — mechanical.
* **Proposed Edit:** Delete only “This described the copying/native-control checkpoint.” Join the remaining architecture/interface summary without deleting the later Run amendment or its approval sources.

## Phase checkpoint requirements for C8

**Historical correction checkpoint:** the following six-phase/50-path proposal includes the then-selected Run scope. It is superseded for implementation by the active [five-phase, 46-path allowlists](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md#detailed-implementation) after Run deferral. Original proposal/table wording is retained for traceability. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295).

| Phase | File-subset and activation rule | Required checkpoint |
|---|---|---|
| P0: close contracts | Existing design/amendment/choices and planned synthetic capture/Run fixture specifications; no product capture/Run activation. Verify the approved C4 mapping against the implementation baseline; require Run admission closure before P4. | Approved source-backed C4 mappings and expected states are inputs, with runtime qualification still required; C2 remains open pending the author decision on the now-recorded admission failures. |
| P1: transport | Planned types/capabilities/capture plus mod observer/publisher and their isolated tests; no register/extension activation yet. | Types, lint, focused transport/native-mod tests, and build pass; stuck writer/rejection/cleanup cannot affect native continuation. |
| P2: model and literal targets | Planned model/content modules, capture/copy fixtures and tests; wire no view yet. | Exact literal-value, ambiguity, provenance, reset and eviction assertions; types/lint/build pass. |
| P3: companion and native controls | Planned protocol/runtime/view/preview/renderer/provider/extension/launch changes; add index.ts and the existing mod-loader test. Activate capture only after host consumer and native fallbacks are ready. | Existing and companion unit/integration checks and build pass; Copy cannot submit native input and native controls remain independent of capture. |
| P4: Run | Planned Run controller, target metadata, view actions and Run fixtures/tests; depends on C2/C6 closure. | Owned-shell identity/cwd, family, race-policy, stale/duplicate/closure tests; full unit/integration/build checks. No implicit profile change or source relabeling. |
| P5: qualification and docs | Existing planned manual harnesses/qualification fixture and README/user/manual/design docs. | Correct-lane package/asset checks, then separately authorized native/subscription probes with exact receipts. No publishing implied. |

The implementation-list revision must enumerate each phase's exact allowlist from the existing file table; this table does not replace that allowlist. Existing Modify additions from A are index.ts and attentionCompletionMod.test.ts, giving 31 Create and 19 Modify paths before any separately approved lifecycle-API change. [Original inventory](https://github.com/glitchwerks/vscode-claude-workspaces/blob/2eec00468b60d34c95596b8d0321798ed3924a5e/docs/designs/215/design_draft.md#L189-L225).

## Auto-accept decision and applied results

The author instructed “Apply the corrections with auto accept.” All fourteen PROPOSE FIX text edits were accepted and applied; none was contested, escalated or declined. This approves the three B policies, not a live probe or product implementation. [Durable approval](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6709462362).

| Action | Outcome | Applied result / remaining work |
|---|---|---|
| C1 | Addressed | Corrected browser-entry CSS, Node boundary and inventory. |
| C2 | Deferred — Run outside v1 | Author deferred Run after the native failures. Admission is not solved or qualified and does not gate copying-only v1. |
| C3 | Addressed | Selected mismatch retirement/no-v1-rebinding and same-UUID reset behavior. |
| C4 | Addressed — design contract approved | Source-backed adapter table and 32 synthetic expectations were approved; implementation/package qualification is still future work. |
| C5 | Addressed | Selected terminal retired ack disposition and explicit rejected-middle-sequence outcome. |
| C6 | Addressed — execution excluded from v1 | Prior declared-family policy is retained with the deferred amendment; v1 has no execution eligibility or shell matching. |
| C7 | Addressed | Added the existing mod loader/mock to the inventory and regression contract. |
| C8 | Addressed | Active plan now has five ordered phases and exact first/later write subsets for 46 paths: 28 Create / 18 Modify. |
| C9 | Addressed | Named baseline lane, parity-selected package command and policy recheck. |
| C10 | Addressed | Replaced ambiguous decision labels. |
| C11 | Addressed | Changed obsolete design status to implementation/qualification. |
| C12 | Addressed | Removed the universal transcript-reader caveat. |
| C13 | Addressed | Removed the repeated future-file sentence. |
| C14 | Addressed | Removed the ambiguous retrospective sentence. |

**Counts:** 14 accepted textual proposals; 13 findings addressed; 1 author-deferred finding (C2); 0 open v1 findings; 0 contested, 0 escalated, 0 declined. The deferred technical failure remains real. Historical five-stage reports, approved brief and fixed hypothesis are preserved. Affected fresh review and product qualification are still required; no convergence or implementation-readiness claim is made. [Deferral](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295).

**Verification at the earlier correction checkpoint (historical):** four-document checks passed: 31 local links, 8 local anchors, 66 pinned references/ranges, CRLF, 31 Create/19 Modify inventory, complete 50-path first-write coverage across six phases, 14-item resolution accounting, unchanged original eight goals and ten historical/approved documents. The corrected wording/ack disposition was checked for consistency. #215 stays open.

## C4 read-only progress — 2026-11-07

The [source contract](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/capture-provenance-contract.md), [archived declarations/receipt projections](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/evidence/c4-native-evidence.md) and [32 synthetic cases](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/evidence/c4-adapter-cases.json) were approved by the author. Core declaration and published archive hashes were verified. The mapping keeps unprovable execution/finality unknown and invents no Bash exit-code field. No runtime adapter was implemented/tested and no Claude CLI, native terminal probe or model request was launched. C4 is closed as a design gap; C2 is unchanged. [Approval](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6711102784).

## C2 native experiment — 2026-11-07

The author authorized the focused experiment. Four disposable native hosts completed 29 case records on VS Code 1.144.0/1.135.0 with pwsh 7.6.9. Partial-input loss reproduced on both builds, and two injected event-delay trials admitted Run while foreground work was already active, then interrupted it. Ordinary competing-input trials preserved work; the report distinguishes those results and all negative controls. [Findings, sources and exact receipts](../../../c2-experiment-results.md), [authorization](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715839034).

**At the experiment checkpoint:** C2 stayed open and counts were 13 addressed/1 open. The report then recommended deferral for an author decision; the later decision below supersedes that scope status. No product code, Claude/model probe, fresh Goldfish review, merge or release was performed. The source/receipt verifier passed 44 consistency checks; these were not passing product qualification.

## Author deferral — 2026-11-07

The author instructed “Defer for now” after reviewing the C2 findings. Run and Run again, their native terminal/controller, action messages and shell metadata are removed from active v1 scope. The three Run Create paths and the future Modify of the deferred amendment are removed; the active plan is 28 Create / 18 Modify across five phases, with qualification now P4. The original eight copying/native-control goals, private channel and C4 mapping remain selected. [Decision](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295), [current plan](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md).

C2 is deferred with execution, not fixed. Preserve its receipts, exact source and prior persistent-shell/original-folder preference for any explicitly authorized resumption. Re-review the affected copying-only design before implementation readiness; this bookkeeping update is not a fresh Goldfish review or product authorization.
