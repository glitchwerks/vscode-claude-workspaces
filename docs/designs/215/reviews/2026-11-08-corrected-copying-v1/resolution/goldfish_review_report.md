# Goldfish Annotated Review Report

**Status: resolved — four accepted design corrections applied.** This records textual/fixture resolution, not a fresh Goldfish pass, convergence or runtime qualification. Run/Run again and C2 remain deferred. [A; F]

**Target:** docs/designs/215/design_draft.md and its incorporated contracts/expectations. Frozen re-review target: 6a8c268503a74f1971081535dfbc4be374c81152, feature 1–180 and Detailed Implementation 181–401; findings published at 4f423c3afade5ff712d0011a3926077b7fef88bd. [F]

**Authorization:** “Apply the design corrections for all four findings with auto accept, keeping Run deferred.” All four are PROPOSE FIX and accepted as a single batch; no further gate is inferred for these repairs. [A]

## Prioritized Findings & AI Suggestions

### A1 [Stage 9 Readiness / Codebase] — Severity: Major

* **Affected Scope:** frozen target 193–207, 248–277 and 296; [original finding](../consolidated_review_report.md#a1--major-close-the-capture-data-frame-and-shared-binding-dictionary).
* **Raw finding IDs:** S9-R-1; S9-B-1.
* **Discrepancy Description:** The new CH dictionary closes control, epochRequest, epochActivate and ack, but leaves the actual producer-to-host data union conceptual. The plan lists envelope/source/chunk fields without selecting content/heartbeat/gap discriminants, per-member payload/nullability, exact byte-length and completion rules, or the normalized privacy-filtered C4 observations. The codebase reviewer also identifies unnamed literal capture-environment keys in this same shared process boundary. Abstract E16/E17 trace operations and native-shape C4 cases cannot supply a missing wire schema. [Independent findings](../implementation_readiness_report.md), [target frame statement](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L248-L260), [CH control/gap rules](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/capture-channel-contract.md#L15-L59), [native C4 mapping](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/capture-provenance-contract.md#L18-L38).
* **Rationale:** The shared interface is an implementer-facing decision rather than a local variable choice; the supplied independent finding is valid. Complete the selected contract inside the approved private-channel/host-authority design. [F; A]
* ***AI Suggestion:*** PROPOSE FIX.
* ***Justification:*** Preserve copying-only v1, full explanation/source fidelity, subscription-backed CLI, native Variant A/Escape/Raw and existing runtime paths. The fix does not add execution, response ownership, an inference service or an unverified SDK method. [A; D]
* ***Proposed Edit / applied change:*** Select the five literal capture environment keys and host child/marker names; the exact observationChunk/heartbeat/gap unions; eight closed normalized C4 payload kinds and scalar/size/nullability rules; ordered byte/chunk completion, host-issued source revisions, typed invalid guards, gap abandonment and finite assembly deadlines. Add 42 serialized accepted/rejected wire examples and four binding examples in the existing channel expectation file. Retain E01–E18 and the planned runtime inventory.
* **Corrected location:** [capture-channel-contract.md#capture-data-frames-and-normalized-observations-a1](../../../capture-channel-contract.md#capture-data-frames-and-normalized-observations-a1).
* **Disposition:** Accepted by auto accept; applied.

### A2 [Stage 9 Readiness] — Severity: Major

* **Affected Scope:** frozen target 290–308 and incorporated view/source contracts; [original finding](../consolidated_review_report.md#a2--major-define-c4-outcome-to-view-translation-including-tool-error).
* **Raw finding IDs:** S9-R-2.
* **Discrepancy Description:** C4 requires the distinct label “Tool reported error; execution not confirmed” and native case status tool-error. VW requires provenanceStatus but its closed enum has no error member; its exact group fields also provide no independent outcome label. No selected translation says how this supported report survives projection without an unknown field/state or an unapproved collapse to Unknown. [Readiness finding](../implementation_readiness_report.md), [target error rule](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L298-L308), [view enum/group](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/companion-view-contract.md#L19-L25), [C4 outcome rule](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/capture-provenance-contract.md#L54-L65).
* **Rationale:** The shared interface is an implementer-facing decision rather than a local variable choice; the supplied independent finding is valid. Complete the selected contract inside the approved private-channel/host-authority design. [F; A]
* ***AI Suggestion:*** PROPOSE FIX.
* ***Justification:*** Preserve copying-only v1, full explanation/source fidelity, subscription-backed CLI, native Variant A/Escape/Raw and existing runtime paths. The fix does not add execution, response ownership, an inference service or an unverified SDK method. [A; D]
* ***Proposed Edit / applied change:*** Add none and tool-error to provenanceStatus and required statusLabel with an exact valid-pair table. Define every C4 outcome/non-outcome/lifecycle translation; preserve the distinct tool-error label and no confirmed executed Copy. Add projection assertions referencing all 32 unchanged native source cases, two full valid error groups and four rejected group variants in the existing view expectations. Retain V01–V18 and the 19 action/transfer message kinds.
* **Corrected location:** [companion-view-contract.md#c4-to-view-outcome-and-label-mapping-a2](../../../companion-view-contract.md#c4-to-view-outcome-and-label-mapping-a2).
* **Disposition:** Accepted by auto accept; applied.

### A3 [Stage 7 Style] — Severity: Nit

* **Affected Scope:** frozen target 13; [original finding](../consolidated_review_report.md#a3--nit-qualify-the-excluded-execution-messages).
* **Raw finding IDs:** S7-S-1.
* **Discrepancy Description:** The scope summary excludes “execution messages” without qualifying Run-specific dispatch requests. The same feature retains captured command/result evidence and status messages for provenance, while line 102 excludes command-execution actions precisely. Name the excluded Run execution/dispatch requests so the summary cannot also mean retained observed evidence. This is wording, not a request to change scope. [Style finding](../critic_report.md), [frozen scope](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L11-L13), [retained evidence and excluded actions](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L96-L104).

* **Rationale:** The precise wording/duplication issue is valid and can be corrected without changing behavior or removing a concrete gate. [F; A]
* ***AI Suggestion:*** PROPOSE FIX.
* ***Justification:*** Preserve copying-only v1, full explanation/source fidelity, subscription-backed CLI, native Variant A/Escape/Raw and existing runtime paths. The fix does not add execution, response ownership, an inference service or an unverified SDK method. [A; D]
* ***Proposed Edit / applied change:*** Replace execution messages in the scope exclusion with Run command-dispatch messages. Apply the same precise wording to the active C4 v1 transfer note; captured tool evidence/status remains included.
* **Corrected location:** [design_draft.md](../../../design_draft.md).
* **Disposition:** Accepted by auto accept; applied.

### A4 [Stage 9 Style] — Severity: Nit

* **Affected Scope:** frozen target 187 final sentence and 354 second sentence; [original finding](../consolidated_review_report.md#a4--nit-remove-two-repeated-process-disclaimers).
* **Raw finding IDs:** S9-S-1.
* **Discrepancy Description:** “No implementation is performed here” and “An approved plan is not evidence that these checks passed” repeat nearby concrete authorization/qualification instructions. The editorial suggestion is to drop only those two sentences while retaining the actual D0/authorization prerequisites, outstanding checks and failure/scope-revision gates. This is separate from the earlier line-55 qualification correction. [Detailed style finding](../implementation_readiness_report.md), [D0 prerequisites](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L183-L187), [qualification context](https://github.com/glitchwerks/vscode-claude-workspaces/blob/6a8c268503a74f1971081535dfbc4be374c81152/docs/designs/215/design_draft.md#L327-L354).
* **Rationale:** The precise wording/duplication issue is valid and can be corrected without changing behavior or removing a concrete gate. [F; A]
* ***AI Suggestion:*** PROPOSE FIX.
* ***Justification:*** Preserve copying-only v1, full explanation/source fidelity, subscription-backed CLI, native Variant A/Escape/Raw and existing runtime paths. The fix does not add execution, response ownership, an inference service or an unverified SDK method. [A; D]
* ***Proposed Edit / applied change:*** Delete exactly No implementation is performed here and An approved plan is not evidence that these checks passed from the two affected procedural paragraphs. Retain concrete D0/authorization prerequisites, qualification failures and scope-revision gates.
* **Corrected location:** [design_draft.md](../../../design_draft.md).
* **Disposition:** Accepted by auto accept; applied.

## Selected repair details and accounting

The channel now separates shared frame fields from per-member payloads rather than requiring dummy message/chunk keys on heartbeat/gap. Complete normalized records alone reach the source model; the host derives status and sourceRevision. Canonical stored text/effective post commands, scope identity, negative/finality/media guards and privacy filtering are mapped explicitly. Producer serialization uses bounded standard JavaScript pieces, not an undeclared hashing or fs API. The added 32 KiB metadata and 30-second absolute/five-second no-progress assembly bounds are selected engineering limits, not measured results. [CH; A]

The view decoder now admits only the selected status/label pairs. Tool reported error remains separate from Unknown and numeric failure; none/null covers groups without a command outcome. C4-06/C4-11 retain requested Copy with no confirmed executed target. No new Run/control message kind is added. [VW; C4; A]

| Category | Count | Disposition |
|---|---|---|
| Consolidated actions | 4 | Two Major, two Nit; severities unchanged |
| PROPOSE FIX / accepted / applied | 4 / 4 / 4 | A1–A4 |
| CONTEST / ESCALATE / DECLINE | 0 / 0 / 0 | None skipped or recategorized |
| Unaddressed textual corrections | 0 | Not a clean fresh-review or implementation-readiness claim |

Five raw observations remain four actions; A1 retains both independent findings, including literal environment spellings. Historical review reports, native evidence and all 32 C4 native case bodies are unchanged. Existing E01–E18, V01–V18, all 29 path vectors, original eight goals and frozen hypothesis are preserved. [F; CH; VW]

## Verification and handoff

Static publication checks passed: all 42 serialized wire cases match the selected schema/order/byte rules (21 continue/ignore cases, 21 retire cases); all 32 C4 projection assertions, 15 status/label pairs, two accepted/four rejected group examples, nine original literal-value assertions and seven incomplete prefixes were checked. The 49-input tree (38 Markdown, 11 JSON) has 366 local links/60 anchors; 45 unique pinned references across 32 source blobs were verified in the changed documents. JSON/CRLF/whitespace/fences and exact P0–P4 first/later write coverage passed. All 39 non-edited prior artifacts, all 32 native C4 case bodies, E01–E18, V01–V18, the 29 path vectors, eight goals and frozen hypothesis are preserved. Commit/tree persistence is recorded in the new Ready record on publication. [CH; VW; D0; F]

These checks exercise selected design representations and expectation consistency; they do not run a product adapter, transport, renderer, actual clipboard, native CLI or Windows access-control probe. No product implementation, build/package, model call or new experiment is performed. [A; CH; VW]

Refresh D0 through the [exact manifest](../../../implementation-inputs.json) and [new immutable source record](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6722972828). The earlier Ready record stays historical. The new record must be completed with this correction commit and source-blob proof before it admits D0. The manifest has 49 documentation inputs (38 Markdown, 11 JSON), including the nine source re-review artifacts and this resolution needed by local references. After D0, P0–P4 still have 28 Create/18 Modify, 46 paths; two overlaps yield union 93 = 77 Create/16 existing Modify at the pinned runtime. No overlay/branch change is performed here. [D0; A]

**Next:** affected fresh re-review of the repaired interfaces and plan integration. This batch is not another Goldfish pass or convergence result. Run/C2 remain deferred; production work and live qualification retain their separate authorization. [A; F]

**Input artifact context:** git ls-tree HEAD -- docs/designs/215/design_draft.md docs/designs/215/reviews/2026-11-08-corrected-copying-v1/consolidated_review_report.md docs/designs/215/evidence/c4-adapter-cases.json at 4f423c3afade5ff712d0011a3926077b7fef88bd verified the pre-correction inputs. The new source record will supply the correction commit and final manifest/tree proof after publication.

## Sources

* **A:** [Four-finding auto accept](https://github.com/glitchwerks/vscode-claude-workspaces/issues/215#issuecomment-6722972512).
* **F:** [Frozen consolidated findings](../consolidated_review_report.md), [readiness/codebase reports](../implementation_readiness_report.md), [feature style finding](../critic_report.md).
* **D:** [Corrected design](../../../design_draft.md), [selected decisions](../../../technical_choices.md).
* **CH:** [Exact capture data/binding contract](../../../capture-channel-contract.md), [serialized cases](../../../evidence/capture-channel-cases.json).
* **VW:** [Outcome/label mapping](../../../companion-view-contract.md), [all-case projection assertions](../../../evidence/companion-view-cases.json).
* **C4:** [Native source/provenance contract](../../../capture-provenance-contract.md), [unchanged original cases](../../../evidence/c4-adapter-cases.json).
* **D0:** [Documentation prerequisite](../../../documentation-handoff.md).
