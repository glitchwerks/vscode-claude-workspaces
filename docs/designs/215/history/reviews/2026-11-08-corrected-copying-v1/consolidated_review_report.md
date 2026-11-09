# Corrected copying-only v1 — consolidated Goldfish re-review

**Result: 0 Blockers, 2 Majors, 2 Nits; not implementation-ready.** Five raw findings map to four actions after merging the two independent observations of the missing capture data contract. All five stages and **10/10 fresh-context reviewers completed; 0 not run**. This is one re-review pass, not convergence. No target fixes were applied. [Stage reports](#stage-results), [traceability](#traceability)

**Frozen target:** [design_draft.md](https://github.com/glitchwerks/vscode-claude-workspaces/blob/a9818b4e811bae0cb833914ad90c4ce49243e100/docs/designs/215/design_draft.md), commit 6a8c268503a74f1971081535dfbc4be374c81152; feature lines 1–180 and Detailed Implementation 181–401. The 39 approved documentation-handoff inputs, including the corrected contracts and case expectations, are preserved unchanged. [Source/scope manifest](context_manifest.md), [portable source catalog](review-context.json).

**Authorization:** the author replied “Do it” to fresh re-review of the six applied corrections. Continue the selected consolidated mode and all-linked-items context; keep Run deferred. [Authorization record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6721749708). Run/Run again, C2 and direct companion answers remain deferred. Native Variant A, native Escape, Raw access, source-authoritative Copy and the same subscription-backed CLI remain selected. [Frozen design](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L3-L13).

## Stage results

| Stage | Completed / requested | Not run | Blocker | Major | Nit | Report |
|---|---|---|---|---|---|---|
| 5 — Initial Zoom Out | 2/2 | 0 | 0 | 0 | 0 | [Architecture and inventive lenses](zoom_out_report.md) |
| 6 — Comprehension | 1/1 | 0 | 0 | 0 | 0 | [Complete paraphrase and clarity audit](comprehension_report.md) |
| 7 — Feature critique | 3/3 | 0 | 0 | 0 | 1 | [Design, structure and style](critic_report.md) |
| 8 — Intermediate Zoom Out | 1/1 | 0 | 0 | 0 | 0 | [Architecture recheck](intermediate_zoom_out_report.md) |
| 9 — Implementation readiness | 3/3 | 0 | 0 | 3 | 1 | [Readiness, codebase and style](implementation_readiness_report.md) |
| Total raw observations | 10/10 | 0 | 0 | 3 | 2 | Two Major observations share action A1 |
| Consolidated actions | — | — | 0 | 2 | 2 | Four actions below |

The [archived personas, standards, workflow definitions and license](review_tools.json) define the lenses. Every reviewer returned its required-read receipt; actual source extents and exclusions are preserved in the full stage responses. Stage 6 read only the persona and target, with no baseline context/standard. Each native dispatch used fork_turns=none; no parent transcript or memory lookup was supplied. Host instruction-file exclusion remains unverified. Tooling limitations such as denied Bash launch or an unrelated absent dispatch skill did not replace a required EGM input and were recorded rather than counted as product failures. [Stage responses](zoom_out_report.md), [comprehension](comprehension_report.md), [feature responses](critic_report.md), [readiness responses](implementation_readiness_report.md).

## Prioritized actions

### A1 — Major: Close the capture data-frame and shared binding dictionary

**Raw findings:** S9-R-1 and S9-B-1. **Affected target:** lines 193–207, 248–277 and 296, through incorporated capture/source contracts.

The new CH dictionary closes control, epochRequest, epochActivate and ack, but leaves the actual producer-to-host data union conceptual. The plan lists envelope/source/chunk fields without selecting content/heartbeat/gap discriminants, per-member payload/nullability, exact byte-length and completion rules, or the normalized privacy-filtered C4 observations. The codebase reviewer also identifies unnamed literal capture-environment keys in this same shared process boundary. Abstract E16/E17 trace operations and native-shape C4 cases cannot supply a missing wire schema. [Independent findings](implementation_readiness_report.md), [target frame statement](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L248-L260), [CH control/gap rules](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/capture-channel-contract.md#L15-L59), [native C4 mapping](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/capture-provenance-contract.md#L18-L38).

**Required resolution:** select the exact versioned data/heartbeat/known-and-unknown-gap member dictionary and literal launch keys; define C4-to-wire payload mapping, identity/revision/chunk/finalization/length semantics, absent versus null fields and accepted/rejected serialized vectors for each member. Transfer those expectations into the existing planned fixture/test files; keep the approved native/privacy boundary and inventory. This is a demonstrated design omission. Divergent decoders, incorrect retirement or privacy loss are inferred consequences, not observed runtime failures. [S9-R-1 and S9-B-1](implementation_readiness_report.md).

### A2 — Major: Define C4 outcome-to-view translation, including tool-error

**Raw finding:** S9-R-2. **Affected target:** lines 290–308 and the incorporated closed view/source contracts.

C4 requires the distinct label “Tool reported error; execution not confirmed” and native case status tool-error. VW requires provenanceStatus but its closed enum has no error member; its exact group fields also provide no independent outcome label. No selected translation says how this supported report survives projection without an unknown field/state or an unapproved collapse to Unknown. [Readiness finding](implementation_readiness_report.md), [target error rule](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L298-L308), [view enum/group](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/companion-view-contract.md#L19-L25), [C4 outcome rule](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/capture-provenance-contract.md#L54-L65).

**Required resolution:** select the complete C4-to-projection/status-label mapping, preserving the supported error report and its execution-unconfirmed meaning. Include C4-06 and C4-11 in end-to-end model/protocol/view expectations. Extending the enum or selecting another explicit representation is an author design choice; this review does not pick one. Decoder rejection or lost visible feedback are inferred consequences, not reproduced failures. [C4-06 expectations](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/evidence/c4-adapter-cases.json#L498-L506), [C4-11 expectations](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/evidence/c4-adapter-cases.json#L1064-L1071).

### A3 — Nit: Qualify the excluded execution messages

**Raw finding:** S7-S-1. **Affected target:** line 13.

The scope summary excludes “execution messages” without qualifying Run-specific dispatch requests. The same feature retains captured command/result evidence and status messages for provenance, while line 102 excludes command-execution actions precisely. Name the excluded Run execution/dispatch requests so the summary cannot also mean retained observed evidence. This is wording, not a request to change scope. [Style finding](critic_report.md), [frozen scope](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L11-L13), [retained evidence and excluded actions](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L96-L104).

### A4 — Nit: Remove two repeated process disclaimers

**Raw finding:** S9-S-1. **Affected target:** line 187 final sentence and line 354 second sentence.

“No implementation is performed here” and “An approved plan is not evidence that these checks passed” repeat nearby concrete authorization/qualification instructions. The editorial suggestion is to drop only those two sentences while retaining the actual D0/authorization prerequisites, outstanding checks and failure/scope-revision gates. This is separate from the earlier line-55 qualification correction. [Detailed style finding](implementation_readiness_report.md), [D0 prerequisites](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L183-L187), [qualification context](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L327-L354).

## Traceability

| Raw finding | Reviewer | Severity | Action | Disposition |
|---|---|---|---|---|
| S7-S-1 | Stage 7 Style | Nit | A3 | Open |
| S9-R-1 | Stage 9 Readiness | Major | A1 | Open |
| S9-R-2 | Stage 9 Readiness | Major | A2 | Open |
| S9-B-1 | Stage 9 Codebase | Major | A1 | Duplicate observation of shared process API; environment spellings retained in A1 |
| S9-S-1 | Stage 9 Style | Nit | A4 | Open |

Stages 5, 6 and 8, plus Stage 7 Design/Structure, issued no finding IDs. Stage 8 acknowledged S7-S-1 without raising a duplicate. No severity was changed, finding contested, risk accepted or fix applied in this pass. [Full stage reports](#stage-results).

## What this pass established about the previous corrections

The six corrections were applied in 6a8c268; their application is not reversed or relabeled as a passing review. The new readiness results expose remaining interface decisions. [Applied resolution](../2026-11-07-copying-v1/resolution/goldfish_review_report.md).

| Prior correction | Evidence from this pass | Limit / residual action |
|---|---|---|
| R1 epoch admission | Both readiness lenses inspected all 18 abstract epoch traces and found their supplied control-state/cursor expectations coherent. | A1 still requires the content data contract and shared binding spellings; no transport ran. |
| R2 projection/Review/actions | Both readiness lenses inspected all 18 view traces; no contradiction identified in their supplied lifecycle expectations. | A2 requires C4 tool-error translation; no renderer/clipboard qualification occurred. |
| R3 path boundaries | Both readiness lenses inspected all 29 path vectors; codebase review checked exact UTF-16 source slices without mismatches. | No detector, DOM or actual clipboard test ran; no general recognition coverage claim. |
| R4 C4-20 | Both readiness lenses checked the full native input/expected object against the no-task-ID predicate and preserved output/privacy expectations. | Static expectation conformance, not an executed native adapter. |
| R5 D0 handoff | Ready SHA/manifest blob/all 39 source files verified; codebase review independently reconciled 28 Create/18 Modify, two overlaps and union 83 = 67 Create/16 existing Modify. | No overlay/branch change was performed; Ready is source readiness, not implementation authorization. |
| R6 qualification wording | No new finding was raised against the corrected Technical Plan introduction. | A3/A4 concern different summary/procedure sentences; no editorial correction applied. |

These outcomes are recorded in the [readiness responses](implementation_readiness_report.md), [feature responses](critic_report.md) and [intermediate review](intermediate_zoom_out_report.md). The original eight goals, frozen hypothesis, approved private-file/native scope, historical reports and native source/receipts are unchanged.

## Limits and next step

This pass is **not clean** under the archived review-loop rule because A1 and A2 are unsettled Majors; it is not convergence. Resolve the two Major actions and two Nits through the design-resolution workflow, then obtain the affected fresh re-review. The two independent A1 observations form one shared action; this is not an architectural pivot or permission to reintroduce Run. [Review rule](review_tools.json), [findings](#prioritized-actions).

No target fix, product implementation, adapter/DOM/runtime test, build/package, new native/subscription/Claude experiment, D0 overlay, merge or release occurred. Packaged source/copy fidelity, actual native controls, Windows private files, accessibility, performance and supported-build qualification remain future work. Unperformed future tests were not counted as newly measured failures. [Target qualification](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L325-L329).

The [source manifest](context_manifest.md) and [portable catalog](review-context.json) record 20 directly linked local inputs and all 54 approved direct URL references through 53 materializations. Source-cache/tool paths in raw receipts are provenance identifiers, not uncommitted runtime dependencies; canonical sources, read extents, hashes and archived review tools are preserved. No reviewer failure or omission was counted as a clean result.

Static publication checks passed for nine new review artifacts: 70 local links/four anchors, 87 unique pinned GitHub references across 36 source blobs, 26 cited issue-comment identities, strict JSON/CRLF/whitespace/fences, complete five-observation/four-action traceability and all 39 frozen input hashes. All ten required-read receipts match the supplied persona/standard/target hashes; full reviewer source extents and exclusions are retained. These are source/report checks, not runtime qualification.

**Input artifact context:** git ls-tree HEAD -- docs/designs/215/design_draft.md docs/designs/215/capture-channel-contract.md docs/designs/215/companion-view-contract.md docs/designs/215/path-copy-contract.md docs/designs/215/implementation-inputs.json at 6a8c268503a74f1971081535dfbc4be374c81152 verified the existing corrected inputs. Publication/tree checks and the report commit are recorded on #215. The immutable D0 Ready record remains pinned to that same correction source; the review output does not silently expand its allowlist.
