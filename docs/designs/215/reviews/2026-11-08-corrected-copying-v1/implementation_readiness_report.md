# Stage 9 — Implementation Readiness

**Checkpoint:** 6a8c268503a74f1971081535dfbc4be374c81152; active Detailed Implementation lines 181–401. **Completed:** 3/3; **not run:** 0. **Raw findings:** 0 Blockers, 3 Majors, 1 Nit. S9-R-1 and S9-B-1 describe one shared capture data-plane action; S9-R-2 and S9-S-1 remain separate. No target or fixture repair was applied.

[Scope/source catalog](context_manifest.md), [archived tools/standards/license](review_tools.json), [portable source identities](review-context.json). Complete reviewer responses follow. Tool/cache locators in receipts identify archived review tools or transient source materializations; they are not runtime dependencies. Publication normalizes the readiness reviewer’s generic runtime URL template into canonical links without changing findings or read extents.

# Stage 9 — Implementation Readiness (raw Goldfish report)

Status: COMPLETED as a read-only design audit. Result: 0 Blockers, 2 Majors, 0 Nits. The zero-decision readiness standard is not yet satisfied by the two contract gaps below. No runtime failure, test pass, packaged qualification or implementation completion is claimed.

Target: docs/designs/215/design_draft.md, frozen documentation commit 6a8c268503a74f1971081535dfbc4be374c81152. Active scope: DetailedRange L181–L401; L1–L180 were read for definitions. Runtime evidence is separately pinned at ef5fd48f4b676881a8730afbf8e583e70565ca11. The Ready D0 source is comment-6721239897, not an inferred current branch or mutable head.

Role: installed egm-implementation-readiness persona, REVIEW mode, against the installed implementation-readiness-standard. Fresh supplied context only; no parent transcript, history or memory was consulted. Findings retain the persona's original Blocker/Major/Nit vocabulary.

## Findings

### S9-R-1 — Major — The producer/host data plane still lacks a selected closed record contract

Affected scope: design_draft.md:L193–L204, L248–L260 and L266–L270; capture-channel-contract.md:L15–L30 and L49–L57; capture-provenance-contract.md:L18–L38 and L73–L83. This affects the planned companionTypes.ts, companionCapture.ts, observer.js, filePublisher.js and their P1/P2 fixture transfer.

Discrepancy: The design now selects an exact control/epochRequest/epochActivate/ack dictionary, but not the closed data-frame union that those two independently executing sides must serialize and decode. The main document lists categories of frame fields (including message/block/tool identity, source revision, chunk index/count and declared UTF-8 length), while CH specifies epoch/sequence/gap ordering. Neither defines the data kind discriminants, each kind's required/absent fields, the normalized tool-evidence payload, or how heartbeat/gap frames satisfy or omit the source/chunk fields. C4 selects native observations and their meaning; it is not a serialized mod-to-host data dictionary.

Checkable evidence:

- design_draft.md:L256 says every frame has the listed identity/source/chunk/length categories, but gives no data payload union or exact member schema.
- capture-channel-contract.md:L19–L24 closes only four control/ack record shapes. L53 introduces heartbeat and gap semantics, including coversThrough and unknownExtent, without closing their complete data-frame shape.
- evidence/capture-channel-cases.json:L6 explicitly says trace event names are harness operations rather than wire discriminants. E16/E17 at L310–L346 exercise abstract data/epoch/seq operations; they are not a complete valid data-record example from which the omitted contract can be recovered.
- capture-provenance-contract.md:L27–L34 defines source fields for stored text, request, call, post/failure/denial and stored result, but never selects their transport normalization. technical_choices.md:L38–L46 and L82–L88 add no missing data dictionary.

Implementation hurdle: An engineer must design the cross-process API while implementing closed validation, rather than transcribe a selected contract. For example, it is not decided whether a heartbeat carries null source/chunk identities or is a separate union member, nor whether declared UTF-8 length denotes one chunk or the complete source revision. This is a demonstrated specification omission. Divergent producers/validators, unintended rejection/retirement, or incomplete source assembly are possible consequences inferred from that omission; none was observed in a running adapter.

Guidance: Select the exact bounded data-frame union and its validity rules before P1, including source chunks, normalized allowlisted tool observations, heartbeat and known/unknown gap records. State length/chunk/revision/completeness semantics and provide at least one exact accepted/rejected wire vector per member. Keep the existing epoch authority, privacy boundaries and planned runtime file inventory. No implementation or target edit was performed by this audit.

### S9-R-2 — Major — C4's required tool-error state has no selected translation into the closed view projection

Affected scope: design_draft.md:L290–L308; companion-view-contract.md:L19–L25, L27–L41 and L69–L75; capture-provenance-contract.md:L54–L65; evidence/c4-adapter-cases.json:C4-06 and C4-11. This affects companionModel.ts/companionContent.ts, companionProtocol.ts, the view and their C4-to-view fixtures.

Discrepancy: The incorporated C4 contract requires a distinct “Tool reported error; execution not confirmed” outcome. The new closed view protocol requires provenanceStatus on every group but permits only suggested/example/code/pending/completed/backgrounded/interrupted/denied/unknown/notice. It has no error value and no explicit mapping from C4 tool-error to another permitted value while retaining the required visible label. Its exact group shape also has no independent outcome-label field. The error outcome therefore needs an additional design decision at the model-to-projection boundary.

Checkable evidence:

- design_draft.md:L304 requires the error-envelope outcome without a Ran/Failed claim.
- capture-provenance-contract.md:L60 selects “Tool reported error; execution not confirmed.” L44 distinguishes that supported report from unknown numeric execution success/failure.
- evidence/c4-adapter-cases.json:L498–L506 (C4-06) and L1064–L1071 (C4-11) assert status=tool-error and that exact label. These remain selected v1 provenance expectations; they are not Run-only eligibility fields.
- companion-view-contract.md:L21 contains the closed provenanceStatus enum, L23 gives the exact group fields, and L69 rejects all unlisted fields. There is no C4-to-view state/label translation table. V01–V18 exercise transfer/action lifetimes but no C4 tool-error projection.

Implementation hurdle: The implementer must choose whether to extend the enum, collapse tool-error to unknown, or encode a separate generated status representation. Collapsing it without a selected label rule could discard the supported error report; sending tool-error directly would violate the closed decoder. The absent translation is demonstrated in the documents. Actual lost feedback or decoder rejection is an inferred consequence, not a reproduced runtime failure.

Guidance: Select the complete C4-state-to-projection/status-label mapping, explicitly covering tool-error and the distinction from Unknown, and transfer C4-06/C4-11 into end-to-end model/protocol/view expectations. An explicit supported translation could resolve this without adding an error enum; the audit does not select that design on the author's behalf.

## Checked areas without an additional finding

- Read all 18 capture traces E01–E18 against the control/epoch transition contract: initial grant/activation; idempotent request/activation; old epoch/ack/control isolation; native reset; owned rejection; foreign token; heartbeat/recovery expiry; host-state loss; data before/after activation. The selected control-state/cursor expectations were coherent on these supplied traces. This does not fill the data-plane gap in S9-R-1.
- Read all 18 view traces V01–V18 against the selected transfer/review/action rules: partial visibility, atomic commit/catch-up, wrong base, recreation, duplicate/conflicting chunks, stale/consumed/expired reviews, replay high-water mark, one clipboard write through uncertain completion, and one native Escape dispatch. No contradictory expectation was identified in those traces. These abstract vectors were inspected, not executed.
- Read all 29 path vectors P01–P29 and the endpoint/action algorithm. Inspected literal/span expectations, rooted-path splitting, punctuation retention, Unicode UTF-16 offset intent, newline boundaries, quoted/code controls, URI/command precedence and oversized omission. No additional concrete inconsistency was identified. No detector, DOM or clipboard implementation was run.
- C4-20's PostToolUse carries backgroundOutputPath with no backgroundTaskId. C4:L42 explicitly makes that presence-only hint insufficient for foreground completion. The corrected expectation is Unknown, executionConfirmed=false and executedCopyValue=null while preserving reportedOutput from the returned stored tool_result. hiddenPathsCaptured/contextCaptured/structuredContentCaptured remain false. Pre-storage text is not promoted. The C4-05/09/12/13/26/27/29/31 controls preserve the positive completion, task-ID background, missing-ID, conflicting-interruption, late withholding, denial conflict, finality-hint and image-output distinctions. Run-only assertions were excluded from v1 readiness expectations.
- Canonical stored append results remain authoritative over inputs; effective post-tool commands remain distinct from requested commands. The archived declarations support append deny/result branches, scoped native correlation and the absence of a numeric Bash exit-code member. No new native evidence was inferred from an approval.
- Raw/Escape are explicitly permitted with host binding even when capture or hydration is unavailable (VW:L75). The selected running/generation checks avoid SessionManager's startup-input queue. Existing PTY/xterm ownership and metadata-only attention boundaries were inspected. Direct answers, Run/Run again, C2 and execution-only shell metadata remain deferred.
- D0 is concrete. comment-6721239897:L3–L13 says Ready and pins 6a8c268503a74f1971081535dfbc4be374c81152 and manifest blob d9c2a7548da2c09066c0da006a1eba4666c9d55e. A read-only git ls-tree of that immutable commit exposed every one of the 39 manifest paths. The separately pinned runtime's corresponding design/spec path listing was empty. The 39 D0 plus 46 later paths minus the two named overlaps equals 83. No overlay was performed, no later Create path was treated as a missing documentation deliverable, and no prior review or Ready label was accepted as proof of product correctness.
- Exact phase allowlists, browser-entry CSS placement, the trusted native helper-loader requirement, baseline package scripts, odd-minor prerelease packaging and native/manual qualification gates are stated and supported by the consulted pinned source excerpts. Future unrun qualification is not an observed failure.

## Required-read receipts

All SHA-256 values below are for the actual local bytes read, including their working-tree line endings. The target matches the dispatch index's frozen hash. The full persona and standard were read before target audit. The first Bash read attempt failed with E_ACCESSDENIED; the complete reads succeeded using the available shell. No retry or tool failure was treated as product evidence.

| Required input | Actual extent | Bytes | SHA-256 |
|---|---:|---:|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/implementation_readiness.md | L1–L62, full | 3991 | 5e9da8c6f7d22c6f0835393475f81aba670d37c5468e109122e01207f09ef5e0 |
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/implementation-readiness-standard.md | L1–L37, full | 1691 | f75357ac169931aa712304d1f0a1ca520f3cc5c6dcb8add42600029512fc052d |
| docs/designs/215/design_draft.md | L1–L401, full; active L181–L401 | 86462 | 40243636f6f837f0ac0d682ffc0a2c0cf99074632da33e8d6d14bb662e7734bd |

## Actual consulted source receipts

The source index is .tmp/215-corrected-review-20261108/review-context.json (890 lines, 55333 bytes, SHA-256 079ac4b97ed6b4f70bdca0fbe6921fa2253868d87c109d00714a138311b12177). It was parsed for the target, all source/local-link entries and canonical identities, source policy, approval and direct references. Large initial combined output was truncated; target/contract text was subsequently re-read in bounded complete ranges as listed here. Only the following source extents were used for substantive audit conclusions.

| Current incorporated input (under docs/designs/215/) | Actual consulted extent | Bytes | SHA-256 |
|---|---|---:|---|
| capture-channel-contract.md | L1–L65, full | 11660 | 7ec4495dea4beb218561d2915f0ec8055476e8d78a671115b612fcf1fbd11055 |
| evidence/capture-channel-cases.json | L1–L369, full; E01–E18 | 9573 | 12472ec44a06bc1583fc7e2c1b0c50ba80e7619292cc9dd23e48a8ee5355e3a7 |
| companion-view-contract.md | L1–L107, full | 17835 | a35fe993761301e70b82ddf2abfd3a84f372ae13914d31bd6031b8fb14f84313 |
| evidence/companion-view-cases.json | L1–L373, full; V01–V18 | 7539 | 5b9176404fc0973417eaebafae4155258a8121399c5d966f276779611ba10cba |
| path-copy-contract.md | L1–L75, full | 8153 | a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc |
| evidence/path-copy-cases.json | L1–L387, full; P01–P29 | 8909 | f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc |
| capture-provenance-contract.md | L1–L85, full | 18890 | 3d539e76d0efc296204491a1b32d3ae5dd9bcb751d778f5229f95aef3eef8c46 |
| evidence/c4-native-evidence.md | L1–L408, full | 14940 | 80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029 |
| evidence/c4-adapter-cases.json | Top metadata and every case's id/expected object; complete native event bodies for C4-05/06/09/11/12/13/20/26/27/29/31 | 97827 | 942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20 |
| technical_choices.md | L1–L149, full | 24306 | de2e1e5b1e8587bfa5b11fd3c6886e267f6d5566b2f264794cea78b1ff93a3d4 |
| documentation-handoff.md | L1–L37, full | 5681 | 16ad4da458f0e8e0c54124467281c3e54f008253d5b0d7146372bb4da4496c5f |
| implementation-inputs.json | L1–L130, full | 7893 | 975c4d09852cdf791bc39204f4ef6b8807dcdd46709802c810e77ccb859b41cd |

C4 native-body coordinates in the actual JSON: C4-05 L237–L376; C4-06 L376–L508; C4-09 L702–L828; C4-11 L947–L1073; C4-12 L1073–L1196; C4-13 L1196–L1319; C4-20 L2167–L2319; C4-26 L2686–L2815; C4-27 L2815–L2950; C4-29 L2969–L3092; C4-31 L3112–L3238. Other C4 event bodies were not read in full and are not claimed as such.

Materialized issue sources are under .tmp/215-corrected-review-20261108/. Their canonical identity is https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-N for the matching comment-N.txt; retrieval/hashes are in the index.

| Source ID | Actual extent | Purpose |
|---|---|---|
| comment-6721239897 | L1–L17, full | Immutable Ready D0 source/manifest/union |
| comment-6701284701 | L1–L16, full | Inspected native fs/timer/append declaration limits and integration snapshot |
| comment-6647481988 | L1–L51, full | Historical native Escape/control receipts and their boundaries |
| comment-6684329277 | L1–L9, full | Clear versus uncertain path behavior |
| comment-6706751545 | L1–L13, full | Variant A and design-only authorization boundary |
| comment-6711102784 | L1–L11, full | C4 scope/approval identity; not correctness proof |
| comment-6715993295 | L1–L9, full | Run/C2 deferral |

Pinned runtime source excerpts were read from the index's repo-N.txt materializations. Each linked PATH below identifies its original file at runtime commit ef5fd48f4b676881a8730afbf8e583e70565ca11. Extents are original file coordinates, preserved by those materializations.

| Source ID | PATH | Actual extent |
|---|---|---|
| repo-6 | [CONTRIBUTING.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/CONTRIBUTING.md#L90-L110) | L90–L110 |
| repo-7 | [docs/versioning-policy.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/docs/versioning-policy.md#L260-L290) | L260–L290 |
| repo-8 | [test/unit/attentionCompletionMod.test.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/attentionCompletionMod.test.ts#L1-L65) | L1–L65 |
| repo-9 | [test/unit/webviewRenderer.test.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/webviewRenderer.test.ts#L1-L20) | L1–L20 |
| repo-10 | [src/composer/composerRuntime.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/composerRuntime.ts#L55-L225) | L55–L225 |
| repo-11 | [src/extension.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/extension.ts#L425-L475) | L425–L475 |
| repo-12 | [src/launch/sessionLaunch.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/launch/sessionLaunch.ts#L1-L86) | L1–L86, full |
| repo-13 | [src/panel/protocol.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/protocol.ts#L1-L160) | L1–L160 |
| repo-14 | [src/panel/webview/index.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/index.ts#L1-L15) | L1–L15 |
| repo-15 | [esbuild.js](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/esbuild.js#L1-L47) | L1–L47, full |
| repo-16 | [.vscodeignore](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/.vscodeignore#L1-L27) | L1–L27, full |
| repo-17 | [test/unit/packageAssets.test.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/test/unit/packageAssets.test.ts#L75-L110) | L75–L110 |
| repo-18 | [package.json](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/package.json#L1-L65) | L1–L65 |
| repo-20 | [media/attention/hooks/register.js](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/media/attention/hooks/register.js#L1-L134) | L1–L134, full |
| repo-21 | [src/panel/webview/xtermTerminal.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/xtermTerminal.ts#L80-L155) | L80–L155 |
| repo-22 | [src/panel/sessionPanelProvider.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/sessionPanelProvider.ts#L600-L690) | L600–L690 |
| repo-25 | [src/sessions/sessionManager.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/sessions/sessionManager.ts#L330-L385) | L330–L385 |
| repo-26 | [src/panel/webview/renderer.ts](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/panel/webview/renderer.ts#L375-L490) | L375–L490 |

Additional read-only Git evidence: ls-tree -r at documentation source 6a8c268503a74f1971081535dfbc4be374c81152 over docs/designs/215 and the named docs/superpowers spec returned all 39 manifest files, including the Ready manifest blob. The equivalent two path scopes at runtime ef5fd48f4b676881a8730afbf8e583e70565ca11 returned no entries. No Git state was mutated.

## Not run / limits

No tests, build, package, native/Claude probe, browser session, model request, clipboard write, D0 materialization, product-code change, target/fixture repair or Git/GitHub mutation was performed. No historical review report was used as proof that the current design is correct. The only authored artifact is this raw report. Findings describe missing selected contracts; their possible runtime consequences remain explicitly inferred.

---

# Stage 9 — Codebase Details Goldfish raw report

## Review receipt and outcome

Completed a read-only implementation-fit audit of docs/designs/215/design_draft.md, active DetailedRange 181–401, frozen correction commit 6a8c268503a74f1971081535dfbc4be374c81152. Read the full Codebase Details persona and Implementation Readiness Standard before the substantive audit. The whole target was read for definitions; the operative judgment concerns Detailed Implementation and incorporated current contracts/expectations. Runtime source of truth is ef5fd48f4b676881a8730afbf8e583e70565ca11, independently accessed through read-only Git objects; this documentation checkout was not treated as the runtime baseline.

**Counts: 0 Blocker / 1 Major / 0 Nit.** Original severity is retained below. No source-verified false claim about an existing runtime API/file was found in the inspected references. The Major is an incomplete future cross-process API contract under the zero-decision standard; it is not a claim that an unimplemented adapter has already failed.

Completed: required reading; pinned-source/materialization comparison; D0 source/allowlist/classification/union audit; P0–P4 first-write reconciliation; inspection of current runtime ownership, launch, decoder, terminal, rendering, test-loader and build/package boundaries; all 18 epoch and 18 view expectation traces; all 29 path vectors and literal/span comparisons; selected expanded C4 event bodies including C4-20; all 32 C4 expected-object summaries; metadata-only committed-source and local-document fidelity checks.

Not run: product tests, builds, packages, installs, native/Claude/model probes, UI automation, runtime implementation, runtime activation, overlay writes, Git mutations or GitHub operations. Only this raw report was written. Historical approval/review bodies were not accepted as correctness evidence. No parent conversation, history or memory was retrieved. Run/Run again/C2 and direct companion answers remain deferred; native Variant A, Raw, Escape and the same subscription-backed CLI remain selected. Missing future qualification is not counted as a defect.

## Findings

### S9-B-1 — Major — Close the capture data-plane contract before assigning its implementation

**Original severity:** Major.

**Affected target:** docs/designs/215/design_draft.md:L193-L197, L203-L207, L248-L260, L277, L296. Incorporated scope: docs/designs/215/capture-channel-contract.md:L15-L30 and L51-L59; docs/designs/215/capture-provenance-contract.md:L18-L38, L73-L83; docs/designs/215/evidence/capture-channel-cases.json:L310-L346; docs/designs/215/evidence/c4-adapter-cases.json:L12-L19.

**Observed discrepancy:** The selected repair closes control/request/activation/ack records, but it does not close the producer-to-host content-frame union that the observer, publisher, capture decoder and model must share. Target L256 lists conceptual envelope/chunk/identity fields, rather than an exact dictionary of content/heartbeat/gap discriminants and their required/optional/null fields and payload types. CH L53 adds coversThrough/unknownExtent semantics without defining the rest of those records. C4 precisely identifies native fields and conservative outcome rules, but it does not define the normalized wire variants that carry those fields after privacy filtering. The selected epoch vectors explicitly describe harness operations; E16/E17 carry only epoch/sequence/admitted expectations, and the C4 vectors explicitly preserve native input/return shapes. Neither is a conforming serialized content frame. A second small part of the same shared binding API is also left unnamed: target L205 requires literal capture environment names, while target L207/CH L9 enumerate their meanings but never select their exact spellings.

**Why this matters under this standard:** A fresh implementer must invent the shared wire vocabulary, payload/nullability rules and native-observation-to-frame mapping before the separately assigned modules can compile and interoperate. For example, the plan requires a request value and a differing effective post-tool command to remain distinct, and only a boolean artifact hint may cross the hidden-path boundary; those are semantic requirements, but no exact normalized record says which variant owns those values or which keys the closed decoder accepts. The existing composer protocol cannot silently supply this missing API: the plan expressly selects a separate content protocol, and the pinned composer transport is a request/response slot carrying draft/command operations, not this output stream. This exceeds a local coding detail because it defines the process boundary and rejection surface shared by multiple modules.

**Evidence classification:** The omission is source-verified in the frozen target and incorporated current contracts. Independent implementation disagreement or privacy/status loss is an inferred consequence, not an observed runtime failure. Existing composer APIs are real and were verified; future companion files are correctly marked Create and their absence is not a finding.

**Required resolution:** Select an exact versioned data-frame/heartbeat/gap dictionary, literal capture environment names, and explicit C4-normalized payload mapping, with serialized positive/rejection examples to transfer into the already-planned capture/native-mod/model fixtures. State exact identity/revision/chunk completion and byte-length rules in that dictionary. Keep the current file allowlist and native scope unless an explicit design revision changes them; no Run/control broker or new dependency is needed merely to close this interface.

**Verifiable citations:** [Target data transaction](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L248-L260); [closed control records and cursor semantics](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/capture-channel-contract.md#L15-L59); [C4 native mapping](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/capture-provenance-contract.md#L18-L38); [abstract epoch cases](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/evidence/capture-channel-cases.json#L310-L346); [existing composer transport](https://github.com/glitchwerks/vscode-claude-workspaces/blob/ef5fd48f4b676881a8730afbf8e583e70565ca11/src/composer/claudeComposerAdapter.ts#L141-L199). The applicable standard is implementation-readiness-standard.md:L7-L18 and L29-L37.

## Verified implementation fit — no additional finding

| Surface | Independent source verification and limit |
|---|---|
| Ownership/generation | ComposerRuntime.targetFor returns the documented sessionId/claudeSessionId/generation tuple, independent of canSubmit; synchronize changes generation when launch/UUID identity changes. composerRuntime.ts:L70-L92,L197-L211. It is valid to reuse read-only target ownership while separately requiring running state for Escape. |
| Launch composition | extension.ts:L246-L249 supplies the existing prepareLaunch hook; L443-L474 constructs/injects the composer; sessionLaunch.ts:L5-L16 preserves the launch snapshot and overlays private environment. The inventory includes the files needed to add capture preparation and disposal. No sign-in or second CLI is implied by these APIs. |
| Native input and terminal | SessionManager.write:L343-L355 can queue during starting, so the target's explicit current-running validation is necessary and compatible. The existing renderer owns terminal input, paste/focus, and per-session terminal retention; xtermTerminal.ts:L85-L130 provides the cited existing adapter. The plan does not require an unlisted xterm adapter edit. |
| Existing content transport precedent | claudeComposerAdapter.ts:L33-L110,L113-L134,L141-L199 really provides owned-channel/token/cleanup/request-response precedent. It is not an existing companion output stream. composer.js:L206-L227 has only module-local cancellation state, consistent with CH's warning against treating it as shared epoch authority. |
| Mod entry and test loader | hooks.json has one register.js module. register.js:L1-L31 uses sibling helper imports and literal env-capability calls. attentionCompletionMod.test.ts:L6-L55 embeds the current completionRetry/composer helper graph before a data-URL import and supplies mocks. Target L215/L319 correctly includes this shared harness as a Modify and requires its companion expansion; future helper absence is not a defect. |
| Protocol/document integration | protocol.ts:L30-L114 currently unions and dispatches composer messages, and the provider uses document/view generation checks. Both protocol/provider are explicit Modify paths. The new kind-based companion dictionary must be routed before the existing type-only decoder rejection; the plan expressly assigns that routing change rather than claiming it already exists. |
| Markdown/path reuse | markdownPreview.ts disables HTML, restricts links and replaces images. references.ts:L20-L48 skips fences/inline code and parses composer references, so it cannot be reused as the path detector. The target accurately states this limitation and plans a separate source-mapped layer. |
| CSS/Node harness | index.ts:L1-L9 owns stylesheet imports and esbuild.js:L16-L41 retains extension/browser entries. webviewRenderer.test.ts:L7-L16 imports renderer directly under Node. Browser-entry CSS placement and avoiding CSS imports through renderer match those boundaries. |
| Packaging | .vscodeignore:L13-L27 excludes most docs/src/tests and CLI-generated scaffolding but does not exclude the planned media/attention/hooks/companion helpers. packageAssets.test.ts:L54-L118 enumerates VSIX assets/configured helper entry. Extending that test without new build/package entry points is compatible with source. |
| Build/lane commands | Runtime package.json is 0.11.3, VS Code ^1.128.0. Its check:types/lint/test:unit/test:integration/build:production/package:prerelease scripts exist. docs/versioning-policy.md:L267-L286 selects odd-minor prerelease packaging. ci.yml runs the four P1 commands plus Windows integration; release-policy is separately run in CI and is also a subset of the full unit glob. No publish command was run. |
| Integration infrastructure | test/integration/composer.test.ts:L1-L19,L78-L102 contains real VS Code APIs, fake PTY support and provider fixture composition. tsconfig.json includes src/**/*.ts and test/**/*.ts. The planned harness/integration/manual locations fit the existing build/test structure. |

## D0 / 46-path source audit

The Ready record was read in full from supplied comment-6721239897.txt; it remains pinned to **6a8c268503a74f1971081535dfbc4be374c81152**, not a mutable head. Read-only git ls-tree of that exact commit independently confirms manifest blob **d9c2a7548da2c09066c0da006a1eba4666c9d55e** and all 39 allowed documentation blobs. Each local D0 file was compared with git show of its exact source blob after CRLF-to-LF comparison normalization: all 39 match. This comparison did not modify working-tree line endings. No runtime code was restored.

| Assertion | Independent result |
|---|---|
| D0 unique exact files | 39 = 30 Markdown + 9 JSON; no duplicates/non-doc/traversal paths |
| D0 baseline classification | All 39 absent from ef5fd48 runtime tree; 39 Create, 0 existing |
| Later P0–P4 inventory | 46 unique paths = 28 Create + 18 Modify after D0 |
| First-write phase reconciliation | 46 unique first-write entries; none missing or extra compared with item 1 inventory |
| P0 overlap | Exactly design_draft.md and technical_choices.md; both created by D0 before P0 Modify |
| Existing Modify paths | Other 16 Modify paths exist at pinned runtime; no undeclared missing Modify |
| Future Create paths | All 28 are absent at pinned runtime as declared; their absence is expected |
| Union | 39 + 46 − 2 = 83 unique; 67 Create + 16 existing Modify at pinned runtime |
| Local Markdown dependency check | Relative Markdown destination extraction across all 30 D0 Markdown blobs found no missing committed destination in the frozen source tree. This was link-only extraction, not a full semantic read of every historical document or an independent reproduction of the Ready record's 260-link/48-anchor totals. |

Counts agree with implementation-inputs.json:L98-L111, documentation-handoff.md:L9-L29, target:L225-L243 and Ready:L5-L13. Exact D0 source blobs and the 46-path inventory follow in the appendices. Historical review files included by the manifest were checked for artifact identity/links only; their approvals or severity conclusions were not treated as current correctness.

## Selected contract / expectation consistency

- C4-20's full event body and expected object were inspected (c4-adapter-cases.json:L2168-L2317). The native post contains backgroundOutputPath without backgroundTaskId; expected unknown/executionConfirmed=false/executedCopyValue=null matches capture-provenance-contract.md:L42 and preserves stored reportedOutput plus privacy exclusions. This correction is consistent; no executed Copy should be derived from the excluded path hint. C4-29 supplies the analogous background-finality-hint case. Deferred runAgainEvidenceEligible/sourceShellFamily/persistentRunShellReplaced fields were not reintroduced into v1 scope.
- All 18 epoch traces were read. Initial/grant/activation, stale epoch rejection, retired cursor preservation, mismatched native UUID, bounded recovery, stale control/ack and E18 CONTROL_REJECTED are consistent with the selected host-authority state table at the level those abstract traces assert. They are not serialized data-plane conformance fixtures; S9-B-1 remains.
- All 18 view traces were read. Partial visibility, commit/delta ordering, recreation, duplicate/conflicting chunks, stale/expired/consumed reviews, replay high-water behavior, global clipboard latch and native Escape replay assertions fit the stated dictionary/lifetimes. No live DOM/clipboard behavior was inferred from them.
- All 29 path vectors were read and each named source slice was checked against its literal using UTF-16 indices. There were zero slice/out-of-range mismatches. Quoted/inline/isolated controls, conservative following-prose Review, multiple rooted paths, punctuation, Unicode/emoji, exclusions and over-limit pattern match the selected contract at the inspected expectation level. This is not an implementation detector or clipboard pass.

## Required-read and actual-read receipt

Paths below are actual content excerpts displayed and reviewed, with exact byte/hash identity. Ranges are one-based inclusive; all means the whole displayed file (trailing final empty line omitted). Large-file metadata/digest comparisons are separately identified below and are not counted as full semantic reads. The context index was fully parsed and its source metadata extracted, but initial full-text output was truncated: it is an index/metadata read, not a claim that every indexed source was read. The initial target 1–180 output had a short middle truncation; 44–78 was reread, completing that coverage.

| Actual source | Reviewed ranges | Bytes | SHA-256 |
|---|---|---:|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/codebase_details.md | all | 4752 | a19676acc9bf53d155b7b0a9c63d6b63c39bd43393bcb503d2f3a5fe62c6cd42 |
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/resources/document_standards/implementation-readiness-standard.md | all | 1691 | f75357ac169931aa712304d1f0a1ca520f3cc5c6dcb8add42600029512fc052d |
| .tmp/215-corrected-review-20261108/review-context.json | parsed index/source metadata; full body output truncated | 55333 | 079ac4b97ed6b4f70bdca0fbe6921fa2253868d87c109d00714a138311b12177 |
| docs/designs/215/design_draft.md | 1–180, 181–300, 301–401, 44–78 | 86462 | 40243636f6f837f0ac0d682ffc0a2c0cf99074632da33e8d6d14bb662e7734bd |
| docs/designs/215/implementation-inputs.json | all | 7893 | 975c4d09852cdf791bc39204f4ef6b8807dcdd46709802c810e77ccb859b41cd |
| docs/designs/215/documentation-handoff.md | all | 5681 | 16ad4da458f0e8e0c54124467281c3e54f008253d5b0d7146372bb4da4496c5f |
| docs/designs/215/capture-channel-contract.md | all | 11660 | 7ec4495dea4beb218561d2915f0ec8055476e8d78a671115b612fcf1fbd11055 |
| docs/designs/215/path-copy-contract.md | all | 8153 | a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc |
| docs/designs/215/companion-view-contract.md | all | 17835 | a35fe993761301e70b82ddf2abfd3a84f372ae13914d31bd6031b8fb14f84313 |
| docs/designs/215/capture-provenance-contract.md | all | 18890 | 3d539e76d0efc296204491a1b32d3ae5dd9bcb751d778f5229f95aef3eef8c46 |
| .tmp/215-corrected-review-20261108/comment-6721239897.txt | all | 3385 | c5dda2931470f044370d02e08f95aa65a34b6b4534a5bbdb0bacde8daf510bdc |
| src/composer/composerRuntime.ts (materialized repo-10; runtime ef5fd48) | 1–229 | 15402 | c11c70f4c2f2ed79aaaa6c09f70451853bd50ce437f6e938737ddb192b7bcde7 |
| src/launch/sessionLaunch.ts (materialized repo-12; runtime ef5fd48) | all | 3057 | bd0b1ea2163207cb492e9d5bdb24f163e40f37bd8f56ae4b469bb69dfe8c5e86 |
| src/panel/webview/index.ts (materialized repo-14; runtime ef5fd48) | all | 1406 | 6f6ea8df1811ada1f80cbb9c7f6dc3575c9e2f27a3ae107aa18a559d819de5dc |
| esbuild.js (materialized repo-15; runtime ef5fd48) | all | 1181 | 81cf3d74583d18b911f460dd759072312620a1e1435fcfc6858aced8cef46b48 |
| .vscodeignore (materialized repo-16; runtime ef5fd48) | all | 442 | d19b5e322661724c36d04bdef527890739d49353c59edc0437c1740f3247cc50 |
| src/extension.ts (materialized repo-11; runtime ef5fd48) | 1–110, 400–530, 290–355, 530–610, 225–260 | 40859 | de3958693f55bb45c7806299896e144b53106ee416036232bdae8095994bda34 |
| src/panel/protocol.ts (materialized repo-13; runtime ef5fd48) | 1–165, 330–430 | 21629 | 1f44db1edb0adb9aae4177001fe8c5ed442cb1bfdfe069dde9a2580efdf902ef |
| package.json (materialized repo-18; runtime ef5fd48) | 1–100 | 12601 | ad4dee06448d7424218a08f71e41e639a85304d2cc2a049e75cae13a92e36b9b |
| CONTRIBUTING.md (materialized repo-6; runtime ef5fd48) | 90–125 | 10671 | 0d3f7c3f451e520715c6b3df6fbe4eca5db4227adf122877d424485c7fe56fc6 |
| docs/versioning-policy.md (materialized repo-7; runtime ef5fd48) | 260–300 | 20296 | 176852c1951bec676cdd784f5a924071742a05517b8c4718f51fba65d250bfbe |
| test/unit/attentionCompletionMod.test.ts (materialized repo-8; runtime ef5fd48) | 1–145 | 20335 | af7f01b38f0fca338121887213d378878fac2ec1c5c41d852508e82d19b5e335 |
| test/unit/webviewRenderer.test.ts (materialized repo-9; runtime ef5fd48) | 1–60 | 116263 | 65152d5e3b5935915b6d031d01951ea4b8f8b849ca36e56d13c5fd2d9285de2d |
| test/unit/packageAssets.test.ts (materialized repo-17; runtime ef5fd48) | 1–170 | 23012 | 6a8a28d48c7dd9c9900fd4f48316b62d8c37cd307193c312f552cbf6e2a439a4 |
| test/integration/composer.test.ts (materialized repo-19; runtime ef5fd48) | 1–135 | 22536 | b25d69a143fda2ed072569bc76068ba693e5c0cb5ffafc21766cbd11e168cc93 |
| media/attention/hooks/register.js (materialized repo-20; runtime ef5fd48) | all | 5352 | 63dc8aaa42f7436803afd292bdc341c2ead2aef69a630ee1707d9a4e2db545da |
| docs/designs/215/evidence/capture-channel-cases.json | all | 9573 | 12472ec44a06bc1583fc7e2c1b0c50ba80e7619292cc9dd23e48a8ee5355e3a7 |
| docs/designs/215/evidence/companion-view-cases.json | all | 7539 | 5b9176404fc0973417eaebafae4155258a8121399c5d966f276779611ba10cba |
| docs/designs/215/evidence/path-copy-cases.json | all | 8909 | f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc |
| docs/designs/215/evidence/c4-native-evidence.md | all | 14940 | 80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029 |
| docs/designs/215/evidence/c4-adapter-cases.json | 1–90, 2166–2320, 2950–3113, 377–509, 703–829, 2816–2951 | 97827 | 942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20 |
| .tmp/215-corrected-review-20261108/comment-6701284701.txt | all | 3372 | b9db1958ee9d44c3e04dc0e0a87b30c4f26e519d48976209128550abd04aa7a4 |
| docs/designs/215/technical_choices.md | all | 24306 | de2e1e5b1e8587bfa5b11fd3c6886e267f6d5566b2f264794cea78b1ff93a3d4 |
| src/panel/webview/xtermTerminal.ts (materialized repo-21; runtime ef5fd48) | 1–180 | 8566 | ad9a88a7a60f0ecf79a2f19b7913b9de706bde9b47fad5f0ee35243f6c795a39 |
| src/panel/sessionPanelProvider.ts (materialized repo-22; runtime ef5fd48) | 1–150, 570–710, 890–968, 175–290, 390–455, 780–860 | 42796 | 7a2c4d97b7414941e5ca739ffce45e531f81cb49029b579d7e660bfaf575ba56 |
| src/panel/webview/composer/markdownPreview.ts (materialized repo-23; runtime ef5fd48) | all | 1588 | e9068f6146633cd2a318b976dbc6f0595fef80b6739b0221904afb0f7529fbca |
| src/panel/webview/composer/references.ts (materialized repo-24; runtime ef5fd48) | all | 3645 | f6eb2df8d218b7a865bd78429ac2925f8005eb2a9b5863b6557317e562b4c2ad |
| src/sessions/sessionManager.ts (materialized repo-25; runtime ef5fd48) | 1–100, 280–400 | 23387 | 3fdbf3df63d1e89bc6be6274e1bdda9f18a7ca96344af3d7be7b39645ea75cea |
| src/panel/webview/renderer.ts (materialized repo-26; runtime ef5fd48) | 1–120, 350–510, 800–920 | 51672 | a506de0fed6f97cf6e4111bacaf4b3d454abbd1c482482693b519c196d1c9136 |
| ef5fd48f4b676881a8730afbf8e583e70565ca11:src/composer/claudeComposerAdapter.ts | 1–199 | 10477 | 7b88e5a2591309da61c783e4fe4e29fa18dd06d392a99bc72546f2fa7bbe545a |
| ef5fd48f4b676881a8730afbf8e583e70565ca11:media/attention/hooks/composer.js | 1–90, 195–250 | 16488 | 53ee184930f9eb685b70c78ffbaa80bd9d96208f4699a72cd61a5cb537da67df |
| ef5fd48f4b676881a8730afbf8e583e70565ca11:media/attention/hooks/hooks.json | all | 35 | b6e8720c937b1a4ee1ee389fa5d9b5a22df25298241f701bb484d28f431f5153 |
| ef5fd48f4b676881a8730afbf8e583e70565ca11:media/attention/.claude-plugin/plugin.json | all | 204 | 00d79bffa3209ae31b04fea7699df4ed72e492412696cb3ade4cdd3785c3c7d8 |
| ef5fd48f4b676881a8730afbf8e583e70565ca11:tsconfig.json | all | 637 | a14a979bd4127851a3b5065feeb845dd90f4a0ffa99e4fb28f828e95cffcbef0 |
| ef5fd48f4b676881a8730afbf8e583e70565ca11:.github/workflows/ci.yml | all | 2472 | d9f0cba183bddb8e9b301b24f4f602d87f5a998dfe1c102cef845ba75779f0c7 |
| ef5fd48f4b676881a8730afbf8e583e70565ca11:.github/workflows/release-guard.yml | all | 1450 | 4041e16049f00aee3c40f7e869b8aff0e39ce49f7039c896f2187d8c5ea8e6d6 |
| C:/Users/chris/.agents/skills/powershell/SKILL.md | all | 6217 | b1b48467f42e0b03a1b2503a7b22212a62efe20c8d29bce09bea25893f675ac9 |

Additional actual structured reads: all 32 C4 expected objects were extracted and reviewed; only the expanded native event-body ranges recorded above were semantically reviewed. The full JSON was parsed for that extraction, which does not imply a full review of unprinted case event bodies. A targeted rg search for textChunk/captureFrame/dataFrame/kind=data/coversThrough/chunkIndex/frame schema/data frame across docs/designs/215 inspected matching lines; no other normalized data-plane schema was found. Matched lines were only in CH L53 and the host/view chunk contract.

Auxiliary tool outcome: the first attempted Git Bash read returned Access denied before reading files. Subsequent reads used Node filesystem/Git or PowerShell-hosted rg; the PowerShell skill was read in full. No failed command was retried more than once.

## Metadata-only Git reads and source proof

Commands used read-only structured Git arguments: git -C CHECKOUT ls-tree -r --name-only RUNTIME_SHA; git -C CHECKOUT ls-tree -r SOURCE_SHA; git -C CHECKOUT show SHA:PATH for the exact paths listed below and the 21 runtime materializations listed in the receipt. All 21 runtime materializations compare equal with their pinned Git blobs after newline normalization. Full bytes accessed only for these comparisons are not additional full semantic reads. The directly read Git sources (composer adapter/helper/config/CI) have reviewed ranges in the receipt.

### Exact 39 D0 blobs at the Ready source

| D0 path | Git blob at 6a8c268 | Local content agrees |
|---|---|---|
| docs/designs/215/c2-experiment-results.md | f8c747123312cfb46f49d1968fdc00950f87ea84 | true |
| docs/designs/215/capture-channel-contract.md | e20c1768630e8dc4b8a44b4557596093682fbfc0 | true |
| docs/designs/215/capture-provenance-contract.md | 4a6422e0ae6e7784b35381848d0cf9e81e183b69 | true |
| docs/designs/215/companion-view-contract.md | da22a480c8098cd5d188e44bdd4d570dd4e70e2c | true |
| docs/designs/215/concepts_brief.md | ef02966273551c0cdd897f1f76ec0fffc19dfd5f | true |
| docs/designs/215/design_draft.md | 353df43ce8d337a99e779b490face53cb393fc4a | true |
| docs/designs/215/documentation-handoff.md | 07641d3d128cba093550d758a354feb29548dd01 | true |
| docs/designs/215/evidence/c2-harness-source.json | 3523069c3a3269d32f82f005a3a4dadf812ac3f6 | true |
| docs/designs/215/evidence/c2-native-receipts.json | 6f8bbf077da513ce526e9ca81964b32ea9b78c5d | true |
| docs/designs/215/evidence/c4-adapter-cases.json | 1ab6f6033eeda625f2d569ffc6e66ec6c7e73069 | true |
| docs/designs/215/evidence/c4-native-evidence.md | 279be03d7fd863ecae6bd21ac9bd4846ac6253bc | true |
| docs/designs/215/evidence/capture-channel-cases.json | d415de378dd3997e20d0c43952957e51d5299e38 | true |
| docs/designs/215/evidence/companion-view-cases.json | 9d8068665ca2e95fc66af2e5634fdfdf27f8d6f1 | true |
| docs/designs/215/evidence/path-copy-cases.json | c29eec6b4782e9ea2b198a751298109715e7613d | true |
| docs/designs/215/goldfish_review_report.md | a93b0bc8f1493075b53b1e37d6404353bd7e8069 | true |
| docs/designs/215/implementation-inputs.json | d9c2a7548da2c09066c0da006a1eba4666c9d55e | true |
| docs/designs/215/path-copy-contract.md | 99f2898c325491b8a207a4a5cb15d12b58a7b20c | true |
| docs/designs/215/reviews/2026-11-07-copying-v1/comprehension_report.md | 186848237bb93bdb5d4c265efab650d9572df3c3 | true |
| docs/designs/215/reviews/2026-11-07-copying-v1/consolidated_review_report.md | aa5f11b17275dda130b45d0c08b4fd5860dfaec9 | true |
| docs/designs/215/reviews/2026-11-07-copying-v1/context_manifest.md | 843382b0a99e2d8f49f571a86f8130135e2bb997 | true |
| docs/designs/215/reviews/2026-11-07-copying-v1/critic_report.md | cc330edebf91e0c5a2022f9aa9cc0ba85e9c7015 | true |
| docs/designs/215/reviews/2026-11-07-copying-v1/implementation_readiness_report.md | df1fde622a5a96621ceb6fe086a82276dff789ff | true |
| docs/designs/215/reviews/2026-11-07-copying-v1/intermediate_zoom_out_report.md | 3f0045981ebcf9429bf591f2ad68e6605a742885 | true |
| docs/designs/215/reviews/2026-11-07-copying-v1/resolution/goldfish_review_report.md | ae6e14c70fa1632d50d2378e2f9537879a57b194 | true |
| docs/designs/215/reviews/2026-11-07-copying-v1/review-context.json | c662e6f5846cc7df24b6a3db8b7822c8bfea0a12 | true |
| docs/designs/215/reviews/2026-11-07-copying-v1/review_tools.json | 0102558ba226d3d39fbf996deb0f0b37789ff07a | true |
| docs/designs/215/reviews/2026-11-07-copying-v1/zoom_out_report.md | ee68b469320b5dd15785113315825c0a509d4104 | true |
| docs/designs/215/reviews/2026-11-07/comprehension_report.md | 67769c869aa4fbf0e544934c9c17a21806c7ddfa | true |
| docs/designs/215/reviews/2026-11-07/consolidated_review_report.md | 2192b1dd23a547959fafda0d06a08a19fda52c83 | true |
| docs/designs/215/reviews/2026-11-07/context_manifest.md | 973c6e9cd138c6719837a12afcbfc090e15b0789 | true |
| docs/designs/215/reviews/2026-11-07/critic_report.md | 7b52f29bc7d0db69714a1560053490822c49b4ba | true |
| docs/designs/215/reviews/2026-11-07/implementation_readiness_report.md | 86afb7da88383ae71c7b8e6c4cf370ea450e6cfc | true |
| docs/designs/215/reviews/2026-11-07/intermediate_zoom_out_report.md | 8a134c5a3754402a92c422e2c522f67a31f8e70d | true |
| docs/designs/215/reviews/2026-11-07/resolution/goldfish_review_report.md | a555a5e551bb70e143c2b2e96c0e71ff73a8c72d | true |
| docs/designs/215/reviews/2026-11-07/zoom_out_report.md | 36ff108ae7d1fff1d9f89d407f55e3a33fa875c5 | true |
| docs/designs/215/run-amendment.md | dad8a69ea7f872381b5a139ce1070a0f047d3c9b | true |
| docs/designs/215/technical_choices.md | 5e27f7484d9eb4b4370c850d34995943c88ba2b8 | true |
| docs/designs/215/working_hypothesis.md | 07454a8f076013de9239d750e2788a0fdcfdb58d | true |
| docs/superpowers/specs/2026-11-04-companion-output-design.md | c83bb38bb1e51c72ab768668ab276a872fe8c55e | true |

### Exact 46 later P0–P4 paths

Classifications below are after D0, as the target specifies.

| Action | Path | Pinned runtime / D0 classification check |
|---|---|---|
| create | src/companion/companionTypes.ts | absent at pinned runtime |
| create | src/companion/companionCapture.ts | absent at pinned runtime |
| create | src/companion/companionModel.ts | absent at pinned runtime |
| create | src/companion/companionContent.ts | absent at pinned runtime |
| create | src/companion/companionRuntime.ts | absent at pinned runtime |
| create | src/companion/companionCapabilities.ts | absent at pinned runtime |
| create | src/panel/companionProtocol.ts | absent at pinned runtime |
| create | src/panel/webview/companion/view.ts | absent at pinned runtime |
| create | src/panel/webview/companion/copyPreview.ts | absent at pinned runtime |
| create | src/panel/webview/companion/styles.css | absent at pinned runtime |
| create | media/attention/hooks/companion/observer.js | absent at pinned runtime |
| create | media/attention/hooks/companion/filePublisher.js | absent at pinned runtime |
| modify | media/attention/hooks/register.js | exists at pinned runtime |
| modify | src/extension.ts | exists at pinned runtime |
| modify | src/launch/sessionLaunch.ts | exists at pinned runtime |
| modify | src/panel/protocol.ts | exists at pinned runtime |
| modify | src/panel/sessionPanelProvider.ts | exists at pinned runtime |
| modify | src/panel/webview/renderer.ts | exists at pinned runtime |
| modify | src/panel/webview/index.ts | exists at pinned runtime |
| modify | src/panel/webview/styles.css | exists at pinned runtime |
| create | test/fixtures/companion/copy-cases.json | absent at pinned runtime |
| create | test/fixtures/companion/capture-cases.json | absent at pinned runtime |
| create | test/unit/companionCapture.test.ts | absent at pinned runtime |
| create | test/unit/companionModel.test.ts | absent at pinned runtime |
| create | test/unit/companionContent.test.ts | absent at pinned runtime |
| create | test/unit/companionRuntime.test.ts | absent at pinned runtime |
| create | test/unit/companionCapabilities.test.ts | absent at pinned runtime |
| create | test/unit/companionProtocol.test.ts | absent at pinned runtime |
| create | test/unit/companionView.test.ts | absent at pinned runtime |
| create | test/unit/companionNativeMod.test.ts | absent at pinned runtime |
| modify | test/unit/attentionCompletionMod.test.ts | exists at pinned runtime |
| modify | test/unit/sessionLaunch.test.ts | exists at pinned runtime |
| modify | test/unit/protocol.test.ts | exists at pinned runtime |
| modify | test/unit/webviewRenderer.test.ts | exists at pinned runtime |
| modify | test/unit/activation.test.ts | exists at pinned runtime |
| modify | test/unit/packageAssets.test.ts | exists at pinned runtime |
| create | test/integration/companion.test.ts | absent at pinned runtime |
| create | test/support/companionHarness.ts | absent at pinned runtime |
| create | test/manual/companionNative.smoke.cjs | absent at pinned runtime |
| create | test/manual/companionNativeWebview.ts | absent at pinned runtime |
| modify | README.md | exists at pinned runtime |
| modify | docs/user-guide.md | exists at pinned runtime |
| create | docs/manual-verification/215-companion.md | absent at pinned runtime |
| create | test/fixtures/companion/qualification.json | absent at pinned runtime |
| modify | docs/designs/215/design_draft.md | created by D0 before Modify |
| modify | docs/designs/215/technical_choices.md | created by D0 before Modify |

This completes the raw Stage 9 report. The only requested output artifact is this report; no correction or implementation was applied.


---

# Stage 9 — Style Goldfish raw report

## Status and scope

Completed: REVIEW-mode Style audit of docs/designs/215/design_draft.md, lines 181–401, at frozen commit 6a8c268503a74f1971081535dfbc4be374c81152. No additional style standard was assigned. Result: 0 Blockers, 0 Majors, 1 Nit.

Not run: tests, builds, product/native/Claude probes, live qualification, or GitHub operations. Only the assigned report was written. No target, fixture, code, Git state or other reviewer's output was changed. The only Git operation was read-only retrieval of the frozen target blob. An initial Bash file-read invocation failed with E_ACCESSDENIED; filesystem reads then used Node. This did not reduce the completed persona/target read.

Copying-only v1, native Variant A, Raw access and native Escape were treated as active scope. Run, Run again, C2 admission and direct companion answers/permission controls remain deferred. Unperformed future qualification was not treated as a measured failure. Author approval was not treated as evidence of technical correctness. No parent transcript, session history or memory was consulted.

## Required-read receipt

| Input | Actual read extent | Bytes | SHA-256 |
|---|---|---:|---|
| C:/Users/chris/.codex/plugins/cache/egm/egm/0.1.1/agents/style.md | Complete persona, lines 1–67 | 4946 | 325f211c3e4c327c220be0723745ea6df915bf027e3987b9fb60b845b5c936e2 |
| docs/designs/215/design_draft.md | Complete active range, lines 181–401; lines 1–180 were not semantically reviewed | 86462 | 40243636f6f837f0ac0d682ffc0a2c0cf99074632da33e8d6d14bb662e7734bd |
| .tmp/215-corrected-review-20261108/review-context.json | Full JSON loaded/parsed, lines 1–890; target, scope, policies, linked-file descriptors, 53-source inventory and 54 direct URL references inspected as an index | 55333 | 079ac4b97ed6b4f70bdca0fbe6921fa2253868d87c109d00714a138311b12177 |

The target has 401 logical lines plus its final newline. Its frozen Git blob is 86061 bytes with SHA-256 8f0eea5b66a2994f9c5ab6d3b5b15e971ee4473483f6744a2bdf625c4d475a9c. The working copy matches that blob after the expected CRLF/LF comparison; the working-copy hash also matches the context index. No source change was inferred from the line-ending difference.

## Actual supporting context read

The following current contracts were inspected for terminology and claim calibration. The evidence archive was inspected only at the stated ranges; lines 61–253 were not read semantically.

| Input | Actual line ranges | Bytes | SHA-256 |
|---|---|---:|---|
| docs/designs/215/capture-channel-contract.md | 1–65 | 11660 | 7ec4495dea4beb218561d2915f0ec8055476e8d78a671115b612fcf1fbd11055 |
| docs/designs/215/path-copy-contract.md | 1–75 | 8153 | a53048b1601b76a5495b49f8ae82266c31d5737604023a2c207296fadd9c12cc |
| docs/designs/215/companion-view-contract.md | 1–107 | 17835 | a35fe993761301e70b82ddf2abfd3a84f372ae13914d31bd6031b8fb14f84313 |
| docs/designs/215/capture-provenance-contract.md | 1–85 | 18890 | 3d539e76d0efc296204491a1b32d3ae5dd9bcb751d778f5229f95aef3eef8c46 |
| docs/designs/215/evidence/c4-native-evidence.md | 1–60, 254–408 | 14940 | 80128059d2ab0485c0906c3272643729cdb8aaed43b14d6eec545a2b92854029 |

For the following JSON files, complete bytes were loaded and parsed to verify identity and case counts. Case bodies were not generally audited. The C4-20 case's displayed fields, expected result object and note were additionally inspected for the Unknown/no-executed-Copy claim at target line 296.

| Input | Bytes | SHA-256 | Inspected count |
|---|---:|---|---|
| docs/designs/215/evidence/capture-channel-cases.json | 9573 | 12472ec44a06bc1583fc7e2c1b0c50ba80e7619292cc9dd23e48a8ee5355e3a7 | 18 cases |
| docs/designs/215/evidence/path-copy-cases.json | 8909 | f0533ae484076bd8ef5edface776b73df00489960cc502f311cca8a854d02ffc | 29 cases |
| docs/designs/215/evidence/companion-view-cases.json | 7539 | 5b9176404fc0973417eaebafae4155258a8121399c5d966f276779611ba10cba | 18 cases |
| docs/designs/215/evidence/c4-adapter-cases.json | 97827 | 942ed9c1933ed6dd9eee69d8ace82bf85ce513d6823c015bd76f94641c0c4a20 | 32 cases |

The remaining indexed source bodies, prior review reports, author comments, runtime sources and external pages were not opened. Their appearance in the index or target citations does not imply they were independently verified by this Style lens.

## Findings

### S9-S-1 — Nit — Repeated process disclaimers add no new decision

**Affected scope:** docs/designs/215/design_draft.md:187, final sentence; and :354, second sentence.

**Discrepancy:** Line 187 ends with “No implementation is performed here.” Line 354 adds “An approved plan is not evidence that these checks passed.” Both repeat a nearby statement without changing an implementation step, approval gate or qualification outcome.

**Style rationale:** The active range already states that this design update changes no production files at line 183. Line 187 itself gives the concrete authorization/D0/worktree prerequisites. For qualification, line 329 requires separate authorization and receipt-backed results, line 352 explicitly says textual resolution is not re-review/convergence/product qualification, and the surrounding sentences at line 354 already identify the outstanding checks and the action required on failure. The repeated general assurances interrupt the procedural text without supplying an additional reader/operator decision.

**Recommended editorial action: DROP** only the two quoted sentences. Keep the concrete authorization prerequisites, outstanding qualification matrix and failure/scope-revision gates. This is a conciseness issue, not a claim that qualification has occurred or an instruction to perform implementation.

**Citations:** docs/designs/215/design_draft.md:L183–L187; docs/designs/215/design_draft.md:L327–L329; docs/designs/215/design_draft.md:L350–L354, frozen at 6a8c268503a74f1971081535dfbc4be374c81152.

## Complete persona result

| Persona vector | Result |
|---|---|
| Tone, word choice and sentence structure | The active range uses imperative engineering instructions and identifies proposed work. One Nit covers the repeated process disclaimers above. |
| Hyperbole, marketing and subjective quality judgments | No additional finding. No praise of implementation quality or measured performance was substituted for evidence. |
| Jargon and terminology precision | No additional finding. The channel epoch, Copy/Review authority, C4 predicates and host/view terminology have explicit current contract references. |
| Filler, synonym redundancy and wordiness | S9-S-1. |
| Objectivity and existing/tested-behavior calibration | No additional finding within the actual source reads. Limits and the p95 gate are explicitly proposed, and the contract/vector counts match 18/29/18/32. Native evidence distinguishes declaration shapes, historical receipts and synthetic expectations. This does not constitute a complete runtime-source conformance audit. |
| Defensive caveats — DROP | S9-S-1 only. |
| Defensive caveats — CALIBRATE/RELOCATE | No additional finding. |
| Defensive caveats — KEEP, not findings | Build admission and unsupported-build Raw fallback (246); identity-change recovery decision (252); unresolved clipboard-write ordering/uncertainty (273, 292); proposed budgets and future measurements (262–275, 327); Run/direct-response deferral (312, 317–323); required receipts and failure gates (329, 354). Each names a concrete action or operator decision. |
| Supplied style standard | Not applicable; none assigned. |

The reviewed language does not present the unexecuted adapter/transport/DOM/clipboard qualification as a pass. In particular, target line 296 separates C4 design closure from adapter/package qualification; the native evidence limits are explicit at evidence/c4-native-evidence.md:L402–L408, and the current C4 contract at capture-provenance-contract.md:L79–L85 calls for future packaged verification. The native Escape wording at target line 315 limits the claim to input sent when interruption is unconfirmed. These are retained calibrations, not findings.

## Return

Saved raw report: .tmp/215-corrected-review-20261108/s9-style.md.
Counts: 0 Blockers / 0 Majors / 1 Nit. No target repair performed.
