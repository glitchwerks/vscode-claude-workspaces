# Consolidated copying-only v1 design review

**Result: not implementation-ready. Five Major findings and one Nit remain open; no Blocker findings.** All five EGM stages completed, with ten completed reviewers and zero not-run reviewers. Seven raw findings map to six actions; two independent epoch-handshake findings describe the same gap. No target repairs were applied. [Stage reports](#stage-results)

**Reviewed checkpoint:** [4e165ee519d8331c89679d373f33a74d558a26f0](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215/design_draft.md), feature lines 1–179; Detailed Implementation lines 180–388. Target working-copy SHA-256: 9981cf7a96807ff25478c6eb83db0f0813e9dbb2abba4317c70798e431815976. The target and approved input artifacts were held unchanged throughout this review.

The feature/architecture passes found no additional architectural finding. The five Major actions below arise from detailed implementation contracts and source consistency. Run and Run again remain deferred; resolving these actions does not restore execution scope. C2's earlier Run admission failure remains deferred, not fixed. [Feature critique](critic_report.md), [intermediate architecture review](intermediate_zoom_out_report.md), [Run deferral](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6715993295)

## Stage results

| Stage | Reviewers completed | Raw Blockers | Raw Majors | Raw Nits | Report |
|---|---:|---:|---:|---:|---|
| 5 — Initial Zoom Out | 2/2 | 0 | 0 | 0 | [Architecture and inventive catalyst](zoom_out_report.md) |
| 6 — Comprehension | 1/1 | 0 | 0 | 0 | [Full paraphrase and receipt](comprehension_report.md) |
| 7 — Feature critique | 3/3 | 0 | 0 | 1 | [Design, structure and style](critic_report.md) |
| 8 — Intermediate Zoom Out | 1/1 | 0 | 0 | 0 | [Architecture recheck](intermediate_zoom_out_report.md) |
| 9 — Implementation readiness | 3/3 | 0 | 6 | 0 | [Readiness, codebase details and style](implementation_readiness_report.md) |
| Total | 10/10 | 0 | 6 | 1 | Five unique Major actions and one Nit after deduplication |

The [context manifest](context_manifest.md), [portable source index](review-context.json) and [archived personas/standards](review_tools.json) record the reading list and tools. Every reviewer returned a required-read receipt; actual consulted-source scope is preserved in the stage reports. Comprehension read the target alone. Host instruction-file exclusion remains unverified despite fresh conversation contexts.

## Prioritized actions

### R1 — Major: Define capture-epoch admission and renewal

**Raw findings:** S9-R-2 and S9-B-1. **Affected target:** lines 243–255 and 265.

The design selects same-UUID resets, retirement and fresh epochs, but leaves the issuer and cross-process admission/renewal exchange unspecified. The existing ownership tuple and composer-local cancellation counter do not supply that shared protocol. This leaves consequential decisions about current epoch, sequence/ack initialization, token/directory reuse and delayed old traffic to the implementer. [Readiness findings](implementation_readiness_report.md), [target transaction rules](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215/design_draft.md#L243-L265), [existing host tuple](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L70-L74), [composer-local reset](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/composer.js#L206-L227)

**Required resolution:** Select the authority and closed control-record exchange; define predecessor states, initial sequence/cursor values, duplicate handling, renewal/reconnect and failure outcomes. Supply exact traces for initial attachment, same-UUID reset, rejected owned transaction, timeout and delayed old-epoch frames/acks. Preserve the selected UUID-mismatch pause. These are proposed design repairs, not a new implementation or probe authorization.

### R2 — Major: Specify projection, hydration and review/action messages

**Raw finding:** S9-R-3. **Affected target:** lines 198–200, 267–268 and 285.

The plan names closed unions, chunked hydration, hydration IDs, live review IDs and action identity, but does not define the corresponding messages and state transitions. In particular, it leaves the snapshot cut/commit rule, concurrent updates/eviction, review-ID lifetime and action replay/result correlation unresolved. A fresh host/renderer implementer must choose those interfaces. [Readiness finding](implementation_readiness_report.md), [target projection/action limits](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215/design_draft.md#L267-L285), [existing explicit decoder precedent](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/protocol.ts#L30-L135)

**Required resolution:** Define the complete v1 message dictionary, fields/limits/bindings, rejection/results and lifecycle. Add atomic hydration/update rules and traces for webview recreation during hydration, source replacement during review, duplicate Copy and late feedback. Keep Run messages outside v1.

### R3 — Major: Make unquoted prose-path boundaries deterministic

**Raw finding:** S9-R-4. **Affected target:** lines 280–283 and 318.

The grammar stops clear unquoted paths at whitespace but also requires Review for unquoted paths containing spaces. It does not select how to identify those spaced candidates or how a bounded phrase ends around filename periods, sentence punctuation and multiple paths. For example, the desired span/action for `Open C:/repo folder/a.txt now.` versus `Open C:/repo/a.txt now.` is not determined. The uncertainty UI does not itself choose the candidate it receives. [Readiness finding](implementation_readiness_report.md), [target recognition grammar](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215/design_draft.md#L274-L285), [approved uncertainty behavior](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277)

**Required resolution:** Select deterministic start/end and precedence rules, with exact input → source span → action → literal value examples for clear, spaced, punctuated and multiple-path cases. Explicitly exclude any unsupported forms. Preserve one-click Copy for clear paths and editable Review for uncertainty.

### R4 — Major: Align C4-20 with the approved conservative predicate

**Raw finding:** S9-R-1. **Affected target:** line 289 and lines 296–299 through the incorporated case-transfer instructions.

C4-20-no-hidden-output-fields includes a backgroundOutputPath hint without a task ID but expects executionConfirmed=true. The approved contract says such a hint produces Unknown; C4-12 and C4-29 expect executionConfirmed=false for incomplete background evidence. This contradicts the expectation that must be transferred to future tests. It affects execution provenance, which remains part of copying-only v1. [Readiness finding](implementation_readiness_report.md), [approved contract](../../capture-provenance-contract.md), [case data](../../evidence/c4-adapter-cases.json)

**Required resolution:** Preserve C4-20's stored-output/privacy checks while aligning its status, executionConfirmed and executed-target expectation with the approved rule. No adapter test ran or failed during this review; this is a verified conflict between design inputs. Relevant source locations: docs/designs/215/capture-provenance-contract.md:L41-L43 and L64; docs/designs/215/evidence/c4-adapter-cases.json:L2235-L2246 and L2305-L2311.

### R5 — Major: Declare the documentation overlay before implementation P0

**Raw finding:** S9-B-2. **Affected target:** lines 186, 220, 224–240 and 289.

The pinned runtime tree has no docs/designs/215 entries, while P0 modifies two such files and consumes approved C4 artifacts as existing inputs. Those artifacts exist in the documentation checkpoint, but the plan does not select the handoff/overlay that places them in the implementation worktree. This concerns absent declared Modify/read inputs across two trees; it does not treat future Create files as missing deliverables. [Codebase finding](implementation_readiness_report.md), [target phase allowlists](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215/design_draft.md#L220-L240), [documentation checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/tree/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215)

**Required resolution:** Declare the exact required documentation/evidence files and immutable source revision before P0. Select whether the overlay is a prerequisite integration step or part of implementation, then reconcile Create/Modify categories and phase allowlists. Do not silently choose a new base branch or move missing inputs outside the inventory.

**Verified tree distinction:** git ls-tree -r --name-only ef5fd48f4b676881a8730afbf8e583e70565ca11 -- docs/designs/215 returned no entries. git ls-tree HEAD -- docs/designs/215/design_draft.md docs/designs/215/technical_choices.md docs/designs/215/capture-provenance-contract.md docs/designs/215/evidence/c4-native-evidence.md docs/designs/215/evidence/c4-adapter-cases.json at 4e165ee519d8331c89679d373f33a74d558a26f0 verified the documentation inputs. This establishes a source-tree handoff gap, not a measured build failure.

### R6 — Nit: Consolidate the repeated qualification at line 55

**Raw finding:** S7-S-1. The last sentence repeats the previous proposed-versus-verified distinction. Consolidate those two sentences while keeping the untested-capability and implementation-authorization boundaries. [Feature style finding](critic_report.md), [frozen line 55](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215/design_draft.md#L55)

## Traceability

| Raw finding | Reviewer | Severity | Consolidated action | Disposition |
|---|---|---|---|---|
| S7-S-1 | Stage 7 Style | Nit | R6 | Open |
| S9-R-1 | Stage 9 Readiness | Major | R4 | Open |
| S9-R-2 | Stage 9 Readiness | Major | R1 | Open |
| S9-R-3 | Stage 9 Readiness | Major | R2 | Open |
| S9-R-4 | Stage 9 Readiness | Major | R3 | Open |
| S9-B-1 | Stage 9 Codebase | Major | R1 | Duplicate observation; one shared action |
| S9-B-2 | Stage 9 Codebase | Major | R5 | Open |

Stages 5, 6 and 8, Stage 7 Design/Structure and Stage 9 Style issued no new finding IDs. Stage 8 acknowledged S7-S-1 without raising a duplicate finding.

## Limits and next step

This single consolidated pass is not clean under the supplied review-loop rule because Major findings remain open; it is not convergence. Resolve the five Major actions and the Nit through the design-resolution workflow, then obtain the affected fresh re-review before implementation readiness. The recommendation is to complete these contracts while retaining the selected copying-only scope; no architectural pivot or scope change is applied. [Archived review standards](review_tools.json), [stage results](#stage-results)

No target fix, product implementation, build/test run, native/subscription experiment, Claude model call, merge or release was performed. Package compatibility, source/copy fidelity, actual native controls, accessibility, performance and Windows file-channel qualification remain future work; lack of those runtime results was not counted as a newly measured failure. The existing 28 Create/18 Modify inventory is unchanged by this review, but R5 requires its prerequisite interpretation to be corrected.

The source catalog records 52 approved direct URL references, 51 materializations and 11 linked local inputs. Generated dispatch/cache names in raw receipts describe read provenance, not uncommitted runtime dependencies; the portable catalog retains their canonical identities. The installed review personas/standards and Apache-2.0 license are archived for tool provenance. All original target/evidence bytes and historical reports are preserved.

**Input artifact context:** git ls-tree HEAD -- docs/designs/215/design_draft.md docs/designs/215/capture-provenance-contract.md docs/designs/215/evidence/c4-adapter-cases.json at 4e165ee519d8331c89679d373f33a74d558a26f0 verified these existing inputs. The publication commit and report artifact persistence will be recorded on [#215](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215).
