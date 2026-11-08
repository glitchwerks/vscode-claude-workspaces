# Goldfish Annotated Review Report

**Status: resolved — six accepted design corrections applied.** This is an Elephant resolution record, not a new Goldfish pass, review convergence or runtime qualification. Run/Run again and C2 remain deferred. [A; F]

**Target:** docs/designs/215/design_draft.md, full copying-only design, frozen review checkpoint 4e165ee519d8331c89679d373f33a74d558a26f0 (feature lines 1–179, Detailed Implementation 180–388), plus its explicitly incorporated contracts/expectations. The corrected main design links the new selected contracts.

**Authorization:** “Apply the design corrections for all six findings with auto accept, keeping Run deferred.” The author accepted this complete batch; no additional decision gate is inferred. [A]

## Prioritized Findings & AI Suggestions

### R1 [Stage 9 Readiness + Codebase] — Severity: Major

* **Affected Scope:** frozen target lines 243–255 and 265; [original finding](../consolidated_review_report.md#r1--major-define-capture-epoch-admission-and-renewal).
* **Raw findings:** S9-R-2; S9-B-1.
* **Discrepancy Description:** The design selects same-UUID resets, retirement and fresh epochs, but leaves the issuer and cross-process admission/renewal exchange unspecified. The existing ownership tuple and composer-local cancellation counter do not supply that shared protocol. This leaves consequential decisions about current epoch, sequence/ack initialization, token/directory reuse and delayed old traffic to the implementer. [Readiness findings](../implementation_readiness_report.md), [target transaction rules](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215/design_draft.md#L243-L265), [existing host tuple](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L70-L74), [composer-local reset](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/composer.js#L206-L227)
* **Rationale:** The cited fresh-review finding identifies a missing implementer-facing contract or contradictory input in the approved copying-only design. The gap is valid; the author has selected correction within the existing scope. [F; A]
* ***AI Suggestion:*** PROPOSE FIX.
* ***Justification:*** Apply the requested repair while retaining source-authoritative Copy, full explanation context, subscription-backed CLI, private files, native Variant A, Escape and Raw. No alternative architecture, new runtime authority or deferred Run functionality is selected. [A; D]
* ***Proposed Edit / applied change:*** Select host-issued offers/epochs and closed control/request/activation/ack records. Define initial zero cursor, data seq=1 only after activation, directory/token reuse per managed generation, duplicate idempotence, same-UUID renewal, UUID-mismatch pause, old-epoch rejection, ordered retirement and finite recovery/deadlines. Add 18 exact design traces; integrate in Detailed Implementation items 1/3/4 and technical decisions.
* **Corrected location:** [capture-channel-contract.md](../../../capture-channel-contract.md).
* **Disposition:** Accepted through auto accept; applied in this batch.

### R2 [Stage 9 Readiness] — Severity: Major

* **Affected Scope:** frozen target lines 198–200, 267–268 and 285; [original finding](../consolidated_review_report.md#r2--major-specify-projection-hydration-and-reviewaction-messages).
* **Raw findings:** S9-R-3.
* **Discrepancy Description:** The plan names closed unions, chunked hydration, hydration IDs, live review IDs and action identity, but does not define the corresponding messages and state transitions. In particular, it leaves the snapshot cut/commit rule, concurrent updates/eviction, review-ID lifetime and action replay/result correlation unresolved. A fresh host/renderer implementer must choose those interfaces. [Readiness finding](../implementation_readiness_report.md), [target projection/action limits](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215/design_draft.md#L267-L285), [existing explicit decoder precedent](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/protocol.ts#L30-L135)
* **Rationale:** The cited fresh-review finding identifies a missing implementer-facing contract or contradictory input in the approved copying-only design. The gap is valid; the author has selected correction within the existing scope. [F; A]
* ***AI Suggestion:*** PROPOSE FIX.
* ***Justification:*** Apply the requested repair while retaining source-authoritative Copy, full explanation context, subscription-backed CLI, private files, native Variant A, Escape and Raw. No alternative architecture, new runtime authority or deferred Run functionality is selected. [A; D]
* ***Proposed Edit / applied change:*** Specify the complete closed host/view dictionary and bounded logical payload/node/target schema. Select snapshot-cut/validate/commit and atomic base-revision deltas; bounded catch-up/abort/resync; source-bound Review IDs with expiry/consumption; action high-water/replay cache; global clipboard latch through uncertainty/late settlement. Keep Raw/Escape independent of capture and exclude Run/permission responses. Add 18 design traces and integrate the selected interfaces.
* **Corrected location:** [companion-view-contract.md](../../../companion-view-contract.md).
* **Disposition:** Accepted through auto accept; applied in this batch.

### R3 [Stage 9 Readiness] — Severity: Major

* **Affected Scope:** frozen target lines 280–283 and 318; [original finding](../consolidated_review_report.md#r3--major-make-unquoted-prose-path-boundaries-deterministic).
* **Raw findings:** S9-R-4.
* **Discrepancy Description:** The grammar stops clear unquoted paths at whitespace but also requires Review for unquoted paths containing spaces. It does not select how to identify those spaced candidates or how a bounded phrase ends around filename periods, sentence punctuation and multiple paths. For example, the desired span/action for `Open C:/repo folder/a.txt now.` versus `Open C:/repo/a.txt now.` is not determined. The uncertainty UI does not itself choose the candidate it receives. [Readiness finding](../implementation_readiness_report.md), [target recognition grammar](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215/design_draft.md#L274-L285), [approved uncertainty behavior](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6684329277)
* **Rationale:** The cited fresh-review finding identifies a missing implementer-facing contract or contradictory input in the approved copying-only design. The gap is valid; the author has selected correction within the existing scope. [F; A]
* ***AI Suggestion:*** PROPOSE FIX.
* ***Justification:*** Apply the requested repair while retaining source-authoritative Copy, full explanation context, subscription-backed CLI, private files, native Variant A, Escape and Raw. No alternative architecture, new runtime authority or deferred Run functionality is selected. [A; D]
* ***Proposed Edit / applied change:*** Replace the undefined bounded phrase with exact UTF-16 seed/span/endpoint precedence and literal values. Newline/end, next explicit root and defined punctuation delimit candidates; whitespace/trailing prose is retained in Review, never a truncated one-click prefix. Preserve explicit clear quoted/code and isolated prose Copy. Add 29 exact vectors, including the two disputed examples, multiple paths, Unicode, exclusions and over-limit behavior.
* **Corrected location:** [path-copy-contract.md](../../../path-copy-contract.md).
* **Disposition:** Accepted through auto accept; applied in this batch.

### R4 [Stage 9 Readiness] — Severity: Major

* **Affected Scope:** frozen target lines 289 and 296–299 (incorporated fixture instructions); [original finding](../consolidated_review_report.md#r4--major-align-c4-20-with-the-approved-conservative-predicate).
* **Raw findings:** S9-R-1.
* **Discrepancy Description:** C4-20-no-hidden-output-fields includes a backgroundOutputPath hint without a task ID but expects executionConfirmed=true. The approved contract says such a hint produces Unknown; C4-12 and C4-29 expect executionConfirmed=false for incomplete background evidence. This contradicts the expectation that must be transferred to future tests. It affects execution provenance, which remains part of copying-only v1. [Readiness finding](../implementation_readiness_report.md), [approved contract](../../../capture-provenance-contract.md), [case data](../../../evidence/c4-adapter-cases.json)
* **Rationale:** The cited fresh-review finding identifies a missing implementer-facing contract or contradictory input in the approved copying-only design. The gap is valid; the author has selected correction within the existing scope. [F; A]
* ***AI Suggestion:*** PROPOSE FIX.
* ***Justification:*** Apply the requested repair while retaining source-authoritative Copy, full explanation context, subscription-backed CLI, private files, native Variant A, Escape and Raw. No alternative architecture, new runtime authority or deferred Run functionality is selected. [A; D]
* ***Proposed Edit / applied change:*** Correct only C4-20 expectations/annotation plus correction metadata: executionConfirmed=false, status=unknown, label=Outcome unknown, executedCopyValue=null and runAgainEvidenceEligible=false. Preserve its stored reported output, hidden-path/context/structured-output privacy assertions and all native input events. Add the explicit revision note to the source contract and P0 instructions; other 31 cases are unchanged.
* **Corrected location:** [evidence/c4-adapter-cases.json](../../../evidence/c4-adapter-cases.json).
* **Disposition:** Accepted through auto accept; applied in this batch.

### R5 [Stage 9 Codebase] — Severity: Major

* **Affected Scope:** frozen target lines 186, 220, 224–240 and 289; [original finding](../consolidated_review_report.md#r5--major-declare-the-documentation-overlay-before-implementation-p0).
* **Raw findings:** S9-B-2.
* **Discrepancy Description:** The pinned runtime tree has no docs/designs/215 entries, while P0 modifies two such files and consumes approved C4 artifacts as existing inputs. Those artifacts exist in the documentation checkpoint, but the plan does not select the handoff/overlay that places them in the implementation worktree. This concerns absent declared Modify/read inputs across two trees; it does not treat future Create files as missing deliverables. [Codebase finding](../implementation_readiness_report.md), [target phase allowlists](https://github.com/glitchwerks/vscode-claude-workspaces/blob/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215/design_draft.md#L220-L240), [documentation checkpoint](https://github.com/glitchwerks/vscode-claude-workspaces/tree/4e165ee519d8331c89679d373f33a74d558a26f0/docs/designs/215)
* **Rationale:** The cited fresh-review finding identifies a missing implementer-facing contract or contradictory input in the approved copying-only design. The gap is valid; the author has selected correction within the existing scope. [F; A]
* ***AI Suggestion:*** PROPOSE FIX.
* ***Justification:*** Apply the requested repair while retaining source-authoritative Copy, full explanation context, subscription-backed CLI, private files, native Variant A, Escape and Raw. No alternative architecture, new runtime authority or deferred Run functionality is selected. [A; D]
* ***Proposed Edit / applied change:*** Select D0 as a separate documentation-only prerequisite commit or verified identical no-op, before P0. Declare an exact self-including allowlist and source from the full immutable correction SHA in the Ready handoff record. Verify each Git blob/local dependency, create absent inputs, reconcile differing existing documents and never restore runtime paths or change branch/base implicitly. Reconcile the D0 counts and two overlaps with the unchanged 46-path P0–P4 inventory.
* **Corrected location:** [documentation-handoff.md](../../../documentation-handoff.md).
* **Disposition:** Accepted through auto accept; applied in this batch.

### R6 [Stage 7 Style] — Severity: Nit

* **Affected Scope:** frozen target lines 55; [original finding](../consolidated_review_report.md#r6--nit-consolidate-the-repeated-qualification-at-line-55).
* **Raw findings:** S7-S-1.
* **Discrepancy Description:** The last sentence repeats the previous proposed-versus-verified distinction. Consolidate those two sentences while keeping the untested-capability and implementation-authorization boundaries.
* **Rationale:** The same qualification is repeated in adjacent sentences. One explicit boundary communicates both requirements.
* ***AI Suggestion:*** PROPOSE FIX.
* ***Justification:*** Apply the requested repair while retaining source-authoritative Copy, full explanation context, subscription-backed CLI, private files, native Variant A, Escape and Raw. No alternative architecture, new runtime authority or deferred Run functionality is selected. [A; D]
* ***Proposed Edit / applied change:*** Replace the two overlapping proposed-versus-verified sentences at the Technical Plan introduction with one concise statement retaining both untested-capability and separate implementation-authorization boundaries.
* **Corrected location:** [design_draft.md#technical-plan](../../../design_draft.md#technical-plan).
* **Disposition:** Accepted through auto accept; applied in this batch.

## Resolution accounting

| Category | Count | Disposition |
|---|---|---|
| Original consolidated actions | 6 | Five Major, one Nit; severities preserved |
| PROPOSE FIX / accepted / applied | 6 / 6 / 6 | R1–R6 |
| CONTEST / ESCALATE / DECLINE | 0 / 0 / 0 | None skipped or recategorized |
| Unaddressed textual corrections | 0 | No clean re-review or product-readiness claim |

The seven raw observations remain mapped to six actions; R1 retains both epoch observations. The original consolidated/stage reports and portable review provenance are historical and unchanged. Earlier C2 native source/receipts, deferred Run amendment and original eight goals are preserved. C4-20 is the sole revised native-case body; its input events and all other 31 cases are preserved. [F; A]

## Verification and handoff

Static checks passed across the 39-artifact handoff (30 Markdown, 9 JSON): 260 local links/48 anchors; 39 unique pinned GitHub file/range references across 29 source blobs; CRLF/whitespace/fences and strict JSON; all 29 literal path spans, 18 epoch traces and 18 view traces; 19 closed view message kinds; the exact P0–P4 first/later write coverage; original eight goals, frozen hypothesis and 26 historical/evidence artifacts. All 32 C4 native input sequences and the other 31 complete case bodies are unchanged; C4-20 retains its stored-output/privacy expectations. The packaging source citation now ends at its actual final line, 27. Commit/tree persistence is verified in the Ready record on publication. [D; CH; VW; PC; D0]

These are static source/expectation checks, not an executed adapter, detector, transport, DOM, clipboard or native CLI. The channel/view/path vectors remain selected design expectations; no product test result or performance measurement is inferred. [A; CH; VW; PC]

D0 uses the [exact overlay manifest](../../../implementation-inputs.json), [preflight procedure](../../../documentation-handoff.md) and [immutable Ready record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6721239897). The published record must pin this correction commit and verify every source blob; a draft record cannot admit P0. The subsequent runtime inventory remains 28 Create / 18 Modify, 46 paths; D0 and its two documentation overlaps are counted separately in the manifest. No runtime overlay, branch switch or implementation is performed in this resolution. [A; D0]

**Next design checkpoint:** affected fresh re-review of the corrected contracts and their main-plan integration. No fresh reviewers were run here. Product implementation and subscription-backed/native qualification need their existing separate authorization; no new probe, model call, merge or release is included. [F; A]

**Input artifact context:** git ls-tree HEAD -- docs/designs/215/design_draft.md docs/designs/215/reviews/2026-11-07-copying-v1/consolidated_review_report.md docs/designs/215/evidence/c4-adapter-cases.json at cc4875d003e832c1bf67e6defbc61a2f76fc64eb verified the pre-correction source blobs. Publication/source-manifest verification is recorded on #215 in the Ready record after the correction commit exists.

## Sources

* **A:** [Author auto-accept](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6721197465).
* **F:** [Frozen consolidated findings](../consolidated_review_report.md), [readiness evidence](../implementation_readiness_report.md), [style finding](../critic_report.md).
* **D:** [Corrected design](../../../design_draft.md), [technical decisions](../../../technical_choices.md).
* **CH:** [Capture admission/renewal](../../../capture-channel-contract.md), [18 traces](../../../evidence/capture-channel-cases.json).
* **VW:** [Projection/Review/actions](../../../companion-view-contract.md), [18 traces](../../../evidence/companion-view-cases.json).
* **PC:** [Path candidate algorithm](../../../path-copy-contract.md), [29 vectors](../../../evidence/path-copy-cases.json).
* **D0:** [Documentation prerequisite](../../../documentation-handoff.md).
